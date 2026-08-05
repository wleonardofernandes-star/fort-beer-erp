# FORT BEER ERP — Arquitetura-Alvo

**Papel deste documento:** blueprint oficial do produto (domínio, arquitetura, SaaS, roadmap).  
**Base:** `STACK_TECNOLOGICA.md`, `CONTEXTO_NEGOCIO_FORT_BEER.md`, `ANALISE_ARQUITETURA_ATUAL.md`.  
**Princípio:** domínio e UX do legado; **stack-alvo** = front Next + API Nest + Postgres/Redis em Docker.

---

## 1. Visão do produto

### 1.1 O que é

**FORT BEER ERP** é o sistema único da **Fort Beer** (distribuidora de bebidas e conveniência) para substituir as planilhas de:

Compras · Estoque · Precificação · Custos · Markup · Vendas · Entregas · Financeiro · Fluxo de Caixa · Relatórios

Ciclo operacional:

> Compra / NF-e → Custo / Markup / Preço → Estoque → Venda (balcão ou entrega) → Caixa / Fiado → Relatórios

Mix: cervejas, refrigerantes, energéticos, águas, destilados, doses, vinhos, cigarros, palheiros, fumos, doces, salgados, gelo, carvão, essências e conveniência — ver taxonomia em `CONTEXTO_NEGOCIO_FORT_BEER.md`.

### 1.2 Para quem

| Persona | Necessidade |
|---------|-------------|
| **Balcão / caixa** | Vender rápido (bipe, favoritos, F12), pouca digitação, offline parcial |
| **Entrega / expedição** | Fila do dia, status, receber na entrega |
| **Depósito** | Entrada de mercadoria, inventário, conferência de volumes |
| **Compras / gestor** | Ruptura, giro, markup por categoria, NF-e |
| **Gestor / sócio** | Caixa, margem, fiado, fluxo de caixa, alertas |
| **Futuro: multi-loja / SaaS** | Isolamento por tenant, planos, onboarding |

### 1.3 Princípios de produto (não negociáveis)

1. **Curva de aprendizado mínima** — linguagem da planilha (Vendas, Compras, Estoque, Caixa).
2. **Estoque nunca é digitado** — só movimentos (compra, venda, ajuste, inventário).
3. **Um fluxo fino primeiro** — venda → estoque → caixa antes de módulos secundários.
4. **Produção primeiro, SaaS depois** — multi-tenant entra por *seams* no modelo, não por overengineering dia 1.
5. **Operação de bebidas + conveniência** — volumes, kits, fiado, NF-e, EAN, categorias do mix, entregas.

---

## 2. Estado atual → estado desejado

| Dimensão | Hoje (legado) | Alvo (oficial) |
|----------|---------------|----------------|
| Frontend | Next.js páginas + fetch interno | **Next.js 15** + Tailwind + **shadcn/ui** |
| Backend | Route Handlers no Next | **NestJS** (API REST modular) |
| Banco | SQLite | **PostgreSQL** |
| Cache | Nenhum | **Redis** |
| Auth | Cookie = `userId` | **JWT + Refresh Token** |
| Arquivos | Ad-hoc | Local volume → abstração **S3-ready** |
| Runtime | Node/PM2 solto | **Docker Compose** + **Nginx** |
| Host | VPS Hostinger | **Ubuntu 24.04 LTS** · VPS Hostinger |
| Domínio | Misturado em `api/` + `lib/` | Módulos Nest + services de domínio |
| Estoque | `groupBy` full-table | Saldo materializado + reconciliação |
| Multi-loja | Inexistente | `tenantId` em entidades de negócio |

**Decisão estratégica:** construir o **alvo na stack oficial** (apps `web` + `api`), migrando regras e telas do legado (`SistemaDistribuidora`) por módulo (*strangler*), com Postgres como fonte da verdade.

Detalhes de versões, env e Compose: **`STACK_TECNOLOGICA.md`**.

---

## 3. Arquitetura de solução (alvo)

```
┌─────────────────────────────────────────────────────────────┐
│  Clientes: PWA/PDV (Next) · Web gestor · (futuro) mobile    │
└───────────────────────────┬─────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼─────────────────────────────────┐
│  Nginx (Ubuntu 24.04 · VPS Hostinger)                       │
│  / → web:3000   ·   /api → api:4000                         │
└─────────────┬───────────────────────────┬───────────────────┘
              │                           │
              ▼                           ▼
┌─────────────────────────┐  ┌────────────────────────────────┐
│  web — Next.js 15       │  │  api — NestJS                  │
│  TypeScript             │  │  TypeScript                    │
│  Tailwind + shadcn/ui   │  │  modules por domínio           │
│  JWT client + offline   │──│  JWT guard + RBAC              │
│  offline: comandas/fila │  │  Swagger (non-prod)            │
└─────────────────────────┘  └───────────────┬────────────────┘
                                             │
                    ┌────────────────────────┼────────────────┐
                    ▼                        ▼                ▼
             ┌────────────┐           ┌──────────┐    ┌──────────────┐
             │ PostgreSQL │           │  Redis   │    │ StoragePort  │
             │            │           │ cache /  │    │ local (MVP)  │
             │            │           │ refresh  │    │ S3 (futuro)  │
             └────────────┘           └──────────┘    └──────────────┘
```

### 3.1 Por que front e API separados

- Backend Nest escala e testa domínio sem acoplar ao React.
- Front Next foca UX/PDV/PWA com shadcn/ui.
- Redis, uploads e workers ficam no lado API sem poluir o Next.
- Preparação natural a SaaS (vários clients → mesma API).

### 3.2 Estrutura de repositório (alvo)

```
fort-beer-erp/
  apps/web/          # Next.js 15 + Tailwind + shadcn/ui
  apps/api/          # NestJS
  packages/shared/   # tipos/DTOs opcionais
  docker/            # compose, nginx, Dockerfiles
  docs/
```

### 3.3 Camadas no NestJS

```
modules/<domínio>/
  *.controller.ts    # HTTP + DTOs
  *.service.ts       # regras de negócio + transações
  *.module.ts
common/guards|pipes|filters
infrastructure/prisma|redis|storage
```

**Regra:** controller valida → service executa domínio → Prisma na transaction.  
**Proibido:** regra de kit/fiado/caixa no Next.js ou só no client.

### 3.4 Frontend (Next)

- App Router; componentes shadcn; tema Fort Beer.
- Cliente HTTP autenticado (refresh automático em 401).
- PDV: comandas + fila offline → `POST /sales` idempotente.

---

## 4. Domínio ERP — módulos

### 4.1 Mapa de módulos (MVP → Escala)

| # | Módulo | Prioridade | Status legado | Alvo |
|---|--------|------------|---------------|------|
| M1 | Identidade & Acesso | P0 | Básico | Sessão segura, permissões granulares |
| M2 | Catálogo (categorias do mix, kits, aliases, EAN) | P0 | Bom | Taxonomia oficial; unidades/volumes |
| M3 | Precificação (custo, markup, preço) | P0 | Fraco | Custo médio; markup meta; margem |
| M4 | PDV / Vendas | P0 | Forte | Manter offline; endurecer idempotência |
| M5 | Compras & NF-e | P0 | Bom | Multi-item; atualiza custo/markup |
| M6 | Estoque & Inventário | P0 | Parcial | UI inventário; saldo materializado |
| M7 | Caixa & meios de pagamento | P0 | Frágil | Ledger único; fechamento auditável |
| M8 | Entregas | P1 | **Ausente** | Fila do dia; status; pagamento na entrega |
| M9 | Clientes & Fiado (contas a receber) | P1 | Bom | Limite de crédito; aging |
| M10 | Financeiro / Fluxo de caixa | P1 | Parcial | Período + despesas + (depois) a pagar |
| M11 | Fornecedores | P1 | Básico | Contas a pagar (fase 2) |
| M12 | Relatórios / BI operacional | P1 | Básico | Margem, ABC, ruptura, entregas |
| M13 | Multi-loja / Tenant | P2 | — | `tenantId`, filiais, transferências |
| M14 | Fiscal avançado (NFC-e/SAT) | P2 | — | Integração conforme UF |
| M15 | Compras sugeridas / giro | P2 | — | Sugestão por ruptura e ABC |
| M16 | RH / banco de horas | P3 | Import only | Opcional |
| M17 | Investimentos sócios | P3 | Import only | Opcional |
| M18 | SaaS (billing, planos, onboarding) | P3 | — | Após multi-tenant estável |

### 4.2 Linguagem ubíqua (bebidas)

| Termo | Significado |
|-------|-------------|
| **Volume** | Embalagem de compra (fardo, caixa, pack) |
| **Unidade** | Menor unidade vendável (lata, garrafa) |
| **Kit / combo** | SKU vendável que consome componentes |
| **Fiado** | Crédito informal ao cliente |
| **Caixa do dia** | Conferência operacional (não contabilidade formal) |
| **Ajuste** | Movimento explícito de inventário/correção |
| **Alias** | Nome/código alternativo → mesmo produto |

### 4.3 Regras de ouro do domínio

1. **Estoque** = ledger de movimentos; UI só exibe saldo.
2. **Venda** é imutável após confirmação (estorno = movimento compensatório + auditoria).
3. **Kit:** na venda, baixa componentes; saldo do SKU kit não “acumula” estoque físico falso (ajuste +1/−componentes ou política documentada única).
4. **Fiado** atualiza ledger do cliente **e** não mistura com dinheiro do caixa até o pagamento.
5. **Caixa** reflete apenas entradas líquidas do dia (dinheiro/PIX/cartão), nunca fiado como “venda dinheiro”.
6. Toda mutação crítica gera **auditoria** (`quem`, `quando`, `antes/depois` ou payload).

---

## 5. Modelo de dados alvo (evolução)

### 5.1 Multi-tenancy (preparação SaaS)

Adicionar desde a Fase 1 (mesmo com um único tenant “Fort Beer”):

```text
Tenant (id, slug, nome, plano, ativo, criadoEm)
Filial (id, tenantId, nome, …)          — opcional fase 2
*Todas entidades de negócio*: tenantId
```

- Isolamento: **shared database, shared schema** + `tenantId` obrigatório em queries.
- Middleware resolve tenant por subdomínio / header / sessão.
- Índice composto: `(tenantId, …)` em vendas, produtos, clientes.

### 5.2 Estoque escalável

**Hoje:** `groupBy` em todas as linhas → inviável com centenas de milhares de vendas.

**Alvo (recomendado):**

| Tabela | Papel |
|--------|-------|
| `EstoqueSaldo` | `(tenantId, produtoId, filialId?)` → `quantidade`, `atualizadoEm` |
| Movimentos | `ItemCompra`, `ItemVenda`, `AjusteEstoque` continuam como fonte da verdade |
| Job/reconciliação | Recalcula e alerta divergência |

Atualização do saldo **dentro da mesma transaction** do movimento.

### 5.3 Caixa como ledger

Substituir/complementar campos agregados frágeis por:

```text
CaixaSessao (dia, filial, abertoPor, fechadoEm, …)
CaixaMovimento (sessaoId, tipo, formaPagamento, valor, origemTipo, origemId)
```

Tipos: `VENDA`, `PAGAMENTO_FIADO`, `SANGRIA`, `SUPRIMENTO`, `AJUSTE`.  
Fechamento = soma do ledger + conferência física.

### 5.4 Identidade

```text
Usuario, Papel, Permissao, UsuarioPapel
RefreshToken (hash, expires, userAgent, ip)  — e/ou denylist no Redis
AuditLog
```

Papéis iniciais: `GESTOR`, `BALCAO`, `DEPOSITO` (extensível).  
Permissões exemplo: `venda.criar`, `caixa.fechar`, `relatorio.financeiro`, `produto.editar_preco`.

Auth: **JWT access** + **refresh token** (ver `STACK_TECNOLOGICA.md`).

### 5.5 PostgreSQL + Redis

- ORM no Nest: **Prisma** (recomendado) ou TypeORM — migrations versionadas obrigatórias.
- Enums / tabelas de domínio para perfil e forma de pagamento.
- Redis: cache de leitura, rate limit, revogação de refresh, filas (BullMQ) depois.
- Connection pooling adequado ao Compose.
- Storage: `STORAGE_DRIVER=local|s3` via port/adapter.

---

## 6. Segurança (produção)

| Controle | Requisito |
|----------|-----------|
| Auth | JWT access curto + refresh rotacionado; secrets distintos |
| Refresh | Hash no DB e/ou denylist Redis no logout |
| Senha | bcrypt/argon2; seed `1234` proibido em prod |
| HTTPS | Nginx/Cloudflare obrigatório |
| RBAC | `PermissionsGuard` no Nest + menus filtrados no Next |
| CORS | Somente origem do `web` |
| Rate limit | Redis no login e rotas públicas |
| Backup | `pg_dump` diário + volume `uploads` |
| Segredos | `.env` no VPS / secrets do Compose; nunca no git |
| Multi-tenant | Toda query filtrada por `tenantId` |

---

## 7. Offline & PDV

Manter o que já funciona e formalizar contrato:

1. Comandas em `localStorage` (ou IndexedDB se crescer).
2. Fila de vendas com `chaveIdempotente` UUID v4.
3. Servidor: `ON CONFLICT` / unique → retorna venda existente (idempotente).
4. Sync: backoff + indicador visual de pendências.
5. Futuro: cache read-only de top produtos / preços (versionado).

**Não** prometer ERP offline completo (estoque em tempo real offline é inconsistente por natureza).

---

## 8. Integrações

| Integração | Fase | Notas |
|------------|------|-------|
| NF-e XML (entrada) | Já / P0 | Manter parser; melhorar matching |
| PIX QR (estático/dynamic) | Já / P0 | Chave EMV; futuro: PSP |
| Impressão comprovante | Já | Browser print; futuro: ESC/POS |
| NFC-e / SAT | P2 | Por UF; adapter pattern |
| WhatsApp aviso fiado | P3 | Opcional |
| Contabilidade (export CSV/OFX) | P2 | Não reinventar ERP contábil |

---

## 9. UX — diretrizes Fort Beer

Herdar do prompt original e do PDV atual:

- Botões ≥ 44px; poucos passos por venda.
- Nunca digitar nome de produto livre no fluxo crítico — busca/bipe/favorito.
- Cores de marca (marinho + âmbar) — ver `docs/PALETA.md`.
- Confirmação em português claro para ações destrutivas.
- Gestor: dashboards densos; balcão: PDV full-bleed.

---

## 10. Qualidade e operação

### 10.1 Testes (mínimo saudável)

| Tipo | O quê |
|------|-------|
| Unit (domain) | Kit breakdown, saldo, fiado, idempotência, caixa |
| Integration | API vendas/compras com DB de teste |
| Smoke E2E | Login → venda → estoque → caixa |

### 10.2 Observabilidade

- Logger estruturado Nest (requestId, userId, tenantId).
- `GET /api/health` — Postgres + Redis ping.
- Métricas simples: erros 5xx, latência, hits de cache.

### 10.3 Deploy alvo

```
Git → CI (lint + test + migrate)
VPS Hostinger · Ubuntu 24.04:
  Docker Compose → nginx + web + api + postgres + redis
  volumes: pgdata, redisdata, uploads
  Cron: pg_dump + retenção
```

Ambientes: `local` · `staging` · `production`.  
Guia detalhado: `STACK_TECNOLOGICA.md`.

---

## 11. Estratégia SaaS (sem implementar agora)

### 11.1 Modelo comercial (rascunho)

| Plano | Escopo |
|-------|--------|
| Starter | 1 loja, PDV, estoque, caixa |
| Pro | Fiado, NF-e, relatórios, multi-usuário |
| Rede | Multi-filial, transferências, API |

### 11.2 Requisitos técnicos pré-SaaS

1. `tenantId` em 100% das tabelas de negócio.
2. Onboarding: criar tenant + usuário gestor + seed de categorias.
3. Isolamento testado.
4. Billing (Stripe/Pagar.me) desacoplado do domínio operacional.
5. Domínio customizado / subdomínio `cliente.fortbeer.app`.

**Até lá:** um único tenant hardcoded em config (`DEFAULT_TENANT_ID`) — código já “multi-tenant ready”.

---

## 12. Roadmap de implementação

### Fase 0 — Fundação da stack oficial ← **começar aqui**

- [ ] Monorepo `apps/web` (Next 15 + Tailwind + shadcn) + `apps/api` (NestJS)
- [ ] Docker Compose: `web`, `api`, `postgres`, `redis`, `nginx`
- [ ] Auth JWT + refresh (login/refresh/logout) + guards RBAC
- [ ] Prisma/Postgres: schema inicial (tenant, users, catálogo mínimo)
- [ ] StoragePort local (`/data/uploads`)
- [ ] Health checks (DB + Redis)
- [ ] Seed categorias do mix + usuário gestor
- [ ] CI básico (lint/test)

### Fase 0b — Migrar núcleo operacional do legado

- [ ] Portar domínio: vendas (idempotência), estoque, compras/NF-e, caixa, fiado
- [ ] PDV no Next com shadcn (UX do legado)
- [ ] Fila offline → API Nest
- [ ] Testes de domínio no Nest
- [ ] Script de migração SQLite/legado → Postgres

### Fase 1 — Estoque, precificação e inventário

- [ ] `EstoqueSaldo` materializado (+ cache Redis opcional)
- [ ] UI + API de inventário físico
- [ ] Alertas de mínimo / ruptura
- [ ] Custo médio + markup meta + relatório de margem

### Fase 1b — Entregas

- [ ] Flag entrega + endereço/contato
- [ ] Fila do dia (Pendente → Saiu → Entregue / Devolvido)
- [ ] Pagamento na entrega
- [ ] Baixa de estoque na confirmação da venda

### Fase 2 — Financeiro + hardening produção

- [ ] Fluxo de caixa por período + despesas
- [ ] Contas a pagar simples
- [ ] Backup automatizado + runbook Hostinger
- [ ] Rate limit Redis; rotação de secrets
- [ ] Troca obrigatória de senhas seed

### Fase 3 — Multi-loja / tenant

- [ ] `Tenant` / `Filial` + backfill
- [ ] Transferências entre filiais
- [ ] Rotas / motorista

### Fase 4 — SaaS, S3 e fiscal

- [ ] `STORAGE_DRIVER=s3`
- [ ] Onboarding + billing
- [ ] Adapter NFC-e
- [ ] Aging / exportações leves

---

## 13. O que **não** fazer agora

- Kubernetes / microserviços além de `web` + `api`.
- S3 antes do volume local estável.
- Contabilidade completa (SPED, plano de contas).
- App nativo só por moda (PWA no Next cobre balcão).
- Billing SaaS antes de JWT sólido, Postgres e estoque escalável.
- Manter lógica de negócio nas API Routes do legado como destino final.

---

## 14. Critérios de pronto para “produção profissional”

1. Login JWT/refresh; seed fraco desabilitado em prod.
2. Venda → estoque → caixa consistente em testes automatizados (API).
3. Compose no Ubuntu 24.04 com backup Postgres restaurável.
4. Inventário físico usável pelo depósito.
5. Relatório gestor: vendas, margem, fiado em aberto.
6. Migrations versionadas no deploy.
7. Zero regra crítica só no client Next.

---

## 15. Próxima ação recomendada

1. Scaffold do monorepo + Docker Compose (Postgres, Redis, Nginx, web, api).  
2. Módulo `auth` Nest (JWT + refresh) + tela login Next/shadcn.  
3. Portar primeiro fluxo fino: **login → venda → estoque → caixa**.  

Legado continua como referência até o cutover.

---

## 16. Relação com documentos existentes

| Documento | Papel |
|-----------|-------|
| `STACK_TECNOLOGICA.md` | Stack oficial (Next, Nest, PG, Redis, Docker…) |
| `CONTEXTO_NEGOCIO_FORT_BEER.md` | Domínio de negócio, mix, planilhas → módulos |
| `ANALISE_ARQUITETURA_ATUAL.md` | As-is do legado |
| `ARQUITETURA_FORT_BEER_ERP.md` | To-be (este arquivo) |
| `docs/SCHEMA.md` | Regras de estoque / entidades (legado) |
| `docs/DEPLOY_HOSTINGER.md` | Deploy legado PM2 (substituir pelo Compose) |
| `ANALISE_PLANILHA.md` | Origem dos dados / planilha |
| `README.md` | Setup do legado |

---

*Arquitetura FORT BEER ERP — stack oficial Next + Nest + Postgres + Redis em Docker (Hostinger / Ubuntu 24.04).*
