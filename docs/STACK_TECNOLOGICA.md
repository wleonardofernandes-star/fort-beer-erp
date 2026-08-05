# Stack Tecnológica Oficial — FORT BEER ERP

**Status:** decisão de arquitetura aprovada  
**Ambiente de referência:** Ubuntu 24.04 LTS · VPS Hostinger · Docker Compose · Nginx

---

## 1. Resumo

| Camada | Tecnologia |
|--------|------------|
| Frontend | **Next.js 15** · TypeScript · **Tailwind CSS** · **shadcn/ui** |
| Backend | **NestJS** · TypeScript |
| Banco | **PostgreSQL** |
| Cache | **Redis** |
| Arquivos | **Local storage** (MVP) · interface pronta para **S3** |
| Auth | **JWT** + **Refresh Token** |
| Containers | **Docker** · **Docker Compose** |
| Proxy | **Nginx** |
| SO / Host | **Ubuntu 24.04 LTS** · **VPS Hostinger** |

O legado atual (`SistemaDistribuidora` monólito Next + SQLite) permanece como **referência de domínio e UX**. O alvo de produção é esta stack separada (front + API).

---

## 2. Diagrama de deploy (produção)

```
                    Internet
                       │
                       ▼
              ┌────────────────┐
              │ Cloudflare TLS │  (opcional, recomendado)
              └────────┬───────┘
                       ▼
              ┌────────────────┐
              │     Nginx      │  :80/:443
              │  reverse proxy │
              └────────┬───────┘
         ┌─────────────┴─────────────┐
         ▼                           ▼
┌─────────────────┐         ┌─────────────────┐
│  web (Next.js)  │         │  api (NestJS)   │
│  :3000          │ ──────► │  :4000          │
└─────────────────┘  JWT    └────────┬────────┘
                                     │
                    ┌────────────────┼────────────────┐
                    ▼                ▼                ▼
             ┌────────────┐   ┌──────────┐   ┌──────────────┐
             │ PostgreSQL │   │  Redis   │   │ volume files │
             │   :5432    │   │  :6379   │   │ /data/uploads│
             └────────────┘   └──────────┘   └──────────────┘
```

---

## 3. Frontend — Next.js 15

| Item | Decisão |
|------|--------|
| Runtime | Next.js 15 (App Router) |
| Linguagem | TypeScript strict |
| Estilo | Tailwind CSS |
| Componentes | **shadcn/ui** (Radix + Tailwind) — design system base |
| Papel | UI, PWA/PDV, BFF mínimo se necessário |
| Dados | Consome **somente** a API NestJS (`NEXT_PUBLIC_API_URL`) |
| Auth no browser | Access token em memória (preferencial) + refresh via cookie HTTP-only **ou** ambos em cookies seguros conforme implementação |

**Responsabilidades do front**

- Telas: login, PDV, compras, estoque, entregas, financeiro, relatórios  
- Estado de UI, comandas offline (`localStorage`/`IndexedDB`), fila de sync  
- **Não** contém regras de estoque/caixa/fiado (só chama API)

**shadcn/ui:** botões, dialogs, forms, tables, sheets — customizados com a paleta Fort Beer (`docs/PALETA.md`).

---

## 4. Backend — NestJS

| Item | Decisão |
|------|--------|
| Framework | NestJS (módulos por domínio) |
| Linguagem | TypeScript |
| ORM | Prisma **ou** TypeORM — **recomendação: Prisma** (já usado no legado; migrations claras) |
| Validação | `class-validator` + DTOs Nest (e/ou Zod nos boundary) |
| Docs API | Swagger (`/docs`) em não-produção |

### Estrutura de módulos (espelha o domínio)

```
apps/api/src/
  modules/
    auth/
    users/
    catalog/
    pricing/
    sales/
    purchases/
    stock/
    cash/
    finance/
    deliveries/
    reports/
    files/
    health/
  common/          # guards, filters, interceptors, tenant
  infrastructure/  # prisma, redis, storage
```

Cada feature: `controller` → `service` → `repository`/Prisma.  
Transações de venda/estoque/caixa **no service**, numa única Unit of Work.

---

## 5. PostgreSQL

| Item | Decisão |
|------|--------|
| Versão | 16+ (imagem oficial Docker) |
| Uso | Fonte da verdade de todo o ERP |
| Migrations | Versionadas no CI/CD (nunca só `db push` em prod) |
| Backup | `pg_dump` diário no VPS + retenção |
| Extensões | conforme necessidade (`pg_trgm` para busca de produto) |

---

## 6. Redis

| Uso | Exemplo |
|-----|---------|
| Refresh tokens / denylist | JTI revogado no logout |
| Cache de leitura | Top produtos PDV, saldo estoque quente, dashboard |
| Rate limit | Login / APIs públicas |
| Filas leves (fase 2) | BullMQ: import NF-e, reconciliação estoque |
| Sessão auxiliar | Metadados de dispositivo, se necessário |

**Regra:** dado crítico de negócio **não** vive só no Redis. Cache é descartável.

---

## 7. Upload de arquivos

| Fase | Storage |
|------|---------|
| **MVP** | Disco local montado em volume Docker (`/data/uploads`) |
| **Futuro** | Amazon S3 / compatível (R2, MinIO) |

### Abstração obrigatória

```ts
interface StoragePort {
  put(key: string, body: Buffer, contentType: string): Promise<Uri>;
  get(key: string): Promise<Readable>;
  delete(key: string): Promise<void>;
}
```

Implementações: `LocalStorageAdapter` · `S3StorageAdapter`.  
Troca por env: `STORAGE_DRIVER=local|s3`.

Casos de uso MVP: XML NF-e, logo, foto de produto (opcional), comprovante de entrega (fase posterior).

---

## 8. Autenticação — JWT + Refresh Token

| Token | Vida típica | Onde |
|-------|-------------|------|
| **Access JWT** | 15 min – 1 h | Header `Authorization: Bearer` |
| **Refresh Token** | 7–30 dias | Cookie HTTP-only `Secure` `SameSite=Lax/Strict` **ou** body+storage seguro; hash no Postgres/Redis |

### Fluxo

```
POST /auth/login     → access + refresh
POST /auth/refresh   → novo access (rotaciona refresh)
POST /auth/logout    → revoga refresh (Redis/DB)
Guards NestJS        → JwtAuthGuard + PermissionsGuard
```

Claims mínimos do access: `sub` (userId), `tenantId`, `roles`/`perms`, `jti`.  
Senhas: bcrypt ou argon2. Seed `1234` **proibido** em produção.

---

## 9. Docker / Compose

Serviços mínimos:

| Service | Imagem / build | Porta interna |
|---------|----------------|---------------|
| `web` | Dockerfile Next.js | 3000 |
| `api` | Dockerfile NestJS | 4000 |
| `db` | `postgres:16` | 5432 |
| `redis` | `redis:7` | 6379 |
| `nginx` | `nginx:alpine` (ou Nginx no host) | 80/443 |

Volumes: `pgdata`, `redisdata`, `uploads`.  
Networks: bridge interna; só Nginx exposto.

**Dev:** `docker compose up` com hot-reload opcional (ou API/web no host + db/redis em container).

---

## 10. Nginx

Responsabilidades:

- TLS termination (ou Cloudflare Flexible/Full)  
- `location /` → `web:3000`  
- `location /api/` → `api:4000` (strip ou prefix alinhado ao Nest `globalPrefix`)  
- Upload body size (NF-e XML): ≥ 20 MB  
- Gzip, headers de segurança básicos  

---

## 11. VPS Hostinger · Ubuntu 24.04

Checklist de host:

1. Ubuntu 24.04 LTS atualizado  
2. Docker Engine + Compose plugin  
3. UFW: 22, 80, 443  
4. Usuário deploy sem root para Compose  
5. Cron: backup Postgres + (opcional) sync uploads  
6. Swap adequado à RAM do plano  
7. DNS → IP do VPS (+ Cloudflare se usado)  

---

## 12. Monorepo sugerido (alvo)

```
fort-beer-erp/
  apps/
    web/                 # Next.js 15 + Tailwind + shadcn
    api/                 # NestJS
  packages/
    shared/              # tipos DTO compartilhados (opcional)
  docker/
    nginx/
    docker-compose.yml
    docker-compose.prod.yml
  docs/
  scripts/
```

O diretório legado `SistemaDistribuidora/` pode coexistir até a migração de features/dados.

---

## 13. Variáveis de ambiente (nomes)

| Variável | Serviço |
|----------|---------|
| `DATABASE_URL` | api |
| `REDIS_URL` | api |
| `JWT_ACCESS_SECRET` | api |
| `JWT_REFRESH_SECRET` | api |
| `JWT_ACCESS_TTL` | api |
| `JWT_REFRESH_TTL` | api |
| `STORAGE_DRIVER` | api |
| `STORAGE_LOCAL_ROOT` | api |
| `S3_*` | api (futuro) |
| `NEXT_PUBLIC_API_URL` | web |
| `CORS_ORIGIN` | api |

---

## 14. Relação com o legado

| Legado | Novo |
|-------|------|
| Next API routes | NestJS modules |
| Cookie `userId` | JWT + refresh |
| SQLite | PostgreSQL |
| Sem cache | Redis |
| PM2 solto | Docker Compose + Nginx |
| Upload inexistente/ad-hoc | StoragePort local → S3 |

Domínio (estoque calculado, PDV, NF-e, fiado) **migra em módulos**, não se perde.

---

*Documento de stack oficial. Alterações de tecnologia exigem atualização explícita deste arquivo e da `ARQUITETURA_FORT_BEER_ERP.md`.*
