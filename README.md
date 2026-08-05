# FORT BEER ERP

Monorepo da stack oficial (Fase 0): **Next.js 15** + **NestJS** + **PostgreSQL** + **Redis** + Docker.

## Estrutura

```
fort-beer-erp/
  apps/api     # NestJS (JWT + refresh, Prisma, health, storage local)
  apps/web     # Next.js 15 + Tailwind + componentes estilo shadcn
  docker/      # Compose, Nginx, Dockerfiles
```

Passo a passo completo: [`docs/DEPLOY_HOSTINGER_KVM1.md`](docs/DEPLOY_HOSTINGER_KVM1.md)

Arquivos prontos no repo:
- `docker/docker-compose.kvm1.yml`
- `docker/nginx/prod.conf`
- `apps/api/.env.production.example`


WSL e Docker Desktop acabam de ser instalados. **Reinicie o PC**, abra o **Docker Desktop** (aceite os termos se pedir) e rode:

```powershell
cd c:\Projetos\SistemaDistribuidora\fort-beer-erp
.\scripts\start-dev.ps1
```

Depois, em dois terminais:

```powershell
cd c:\Projetos\SistemaDistribuidora\fort-beer-erp\apps\api
npm run start:dev
```

```powershell
cd c:\Projetos\SistemaDistribuidora\fort-beer-erp\apps\web
npm run dev
```

App: **http://localhost:3000** · API: **http://localhost:4000/api** · `gestor` / `1234`

> Redis nativo também foi instalado (porta 6379). Com Docker ativo, use o Redis do Compose; pode parar o serviço Windows `Redis` se houver conflito.

API: http://localhost:4000/api  
Swagger (dev): http://localhost:4000/docs  
Health: http://localhost:4000/api/health

## Web

```bash
cd apps/web
npm run dev
```

App: http://localhost:3000

### Usuários seed

| Login | Senha | Perfil |
|-------|-------|--------|
| `gestor` | `1234` | GESTOR |
| `balcao` | `1234` | BALCAO |

**Troque as senhas em produção.**

## Auth

- `POST /api/auth/login` → access JWT + cookie HTTP-only de refresh
- `POST /api/auth/refresh` → novo access (rotaciona refresh)
- `POST /api/auth/logout` → revoga refresh
- `GET /api/auth/me` → perfil (Bearer)

## Documentação de produto

Ver pasta `SistemaDistribuidora/` (legado) e docs:

- `STACK_TECNOLOGICA.md`
- `ARQUITETURA_FORT_BEER_ERP.md`
- `CONTEXTO_NEGOCIO_FORT_BEER.md`
