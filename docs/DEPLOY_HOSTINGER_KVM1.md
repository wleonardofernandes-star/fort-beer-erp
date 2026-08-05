# Deploy FORT BEER ERP — Hostinger KVM 1 (Ubuntu 24.04)

Passo a passo para testar o monorepo `fort-beer-erp` (Next + Nest + Postgres + Redis + Nginx) no **KVM 1 (~4 GB RAM)**.

> **Aviso:** KVM 1 funciona para **teste/MVP**. Em uso real de balcão, prefira **KVM 2 (8 GB)** quando puder. Neste guia usamos **swap**, limites de memória e Postgres/Redis enxutos.

---

## 0. O que você precisa ter

| Item | Exemplo |
|------|---------|
| VPS Hostinger | **KVM 1**, SO **Ubuntu 24.04 64-bit** |
| IP do servidor | `x.x.x.x` |
| Acesso SSH | usuário `root` (ou com sudo) |
| Domínio (opcional no início) | `app.seudominio.com.br` |
| Código no GitHub/GitLab | repo com `fort-beer-erp` |

Sem domínio: dá para testar só pelo IP (HTTP). Com domínio + Cloudflare: HTTPS fica mais fácil.

---

## 1. Contratar e criar o VPS

1. Hostinger → **VPS** → plano **KVM 1**.
2. Localização: **Brasil** se aparecer; senão o mais próximo.
3. Sistema operacional: **Ubuntu 24.04**.
4. Defina senha root forte (ou chave SSH).
5. Anote o **IP público**.

Painel: VPS → **SSH / Console** (se o SSH do PC falhar, use o terminal do painel).

---

## 2. Primeiro acesso e segurança básica

No seu PC (PowerShell ou terminal):

```bash
ssh root@SEU_IP
```

No servidor:

```bash
apt update && apt upgrade -y
timedatectl set-timezone America/Sao_Paulo

# Firewall
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
ufw status
```

**Não** abra `5432` (Postgres) nem `6379` (Redis) na internet.

---

## 3. Swap (obrigatório no KVM 1)

Sem swap, o build do Next/Nest costuma matar o servidor (OOM).

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
sysctl vm.swappiness=10
echo 'vm.swappiness=10' >> /etc/sysctl.conf
free -h
```

Deve aparecer ~4 GB de Swap.

---

## 4. Instalar Docker + Compose

```bash
apt install -y ca-certificates curl git
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
docker --version
docker compose version
```

---

## 5. Colocar o código no servidor

### Opção A — Git (recomendado)

```bash
mkdir -p /var/www
cd /var/www
git clone URL_DO_SEU_REPO fort-beer-erp
cd fort-beer-erp
# Se o monorepo estiver em subpasta:
# cd fort-beer-erp   (ajuste conforme o repo)
```

### Opção B — Upload

Compacte `fort-beer-erp` no PC, envie por SFTP (FileZilla) para `/var/www/fort-beer-erp`.

Estrutura esperada:

```text
/var/www/fort-beer-erp/
  apps/api
  apps/web
  docker/
  ...
```

---

## 6. Arquivos de ambiente (produção)

### 6.1 Secrets

Ainda no servidor:

```bash
cd /var/www/fort-beer-erp
openssl rand -hex 32   # JWT_ACCESS_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 24   # senha do Postgres
```

Anote os três valores.

### 6.2 API — `apps/api/.env.production`

```bash
nano apps/api/.env.production
```

Cole (troque os valores):

```env
DATABASE_URL=postgresql://fortbeer:SENHA_FORTE_AQUI@db:5432/fortbeer?schema=public
REDIS_URL=redis://redis:6379
PORT=4000
CORS_ORIGIN=https://SEU_DOMINIO
# Se ainda testar só por IP:
# CORS_ORIGIN=http://SEU_IP

JWT_ACCESS_SECRET=COLE_O_PRIMEIRO_OPENSSL
JWT_REFRESH_SECRET=COLE_O_SEGUNDO_OPENSSL
JWT_ACCESS_TTL=15m
JWT_REFRESH_DAYS=14

STORAGE_DRIVER=local
STORAGE_LOCAL_ROOT=/data/uploads
NODE_ENV=production
```

### 6.3 Compose de produção (KVM 1)

Crie o arquivo:

```bash
nano docker/docker-compose.kvm1.yml
```

Cole:

```yaml
services:
  db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: fortbeer
      POSTGRES_PASSWORD: SENHA_FORTE_AQUI
      POSTGRES_DB: fortbeer
      # Postgres mais leve (4 GB)
      POSTGRES_INITDB_ARGS: "--data-checksums"
    command:
      - postgres
      - -c
      - shared_buffers=128MB
      - -c
      - work_mem=4MB
      - -c
      - max_connections=50
    volumes:
      - pgdata:/var/lib/postgresql/data
    # NÃO publique 5432 na internet
    expose:
      - "5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fortbeer -d fortbeer"]
      interval: 10s
      timeout: 5s
      retries: 10
    mem_limit: 768m

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--maxmemory", "128mb", "--maxmemory-policy", "allkeys-lru"]
    volumes:
      - redisdata:/data
    expose:
      - "6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 10
    mem_limit: 192m

  api:
    build:
      context: ../apps/api
      dockerfile: ../../docker/Dockerfile.api
    restart: unless-stopped
    env_file:
      - ../apps/api/.env.production
    environment:
      DATABASE_URL: postgresql://fortbeer:SENHA_FORTE_AQUI@db:5432/fortbeer?schema=public
      REDIS_URL: redis://redis:6379
      PORT: 4000
      STORAGE_LOCAL_ROOT: /data/uploads
      NODE_ENV: production
      NODE_OPTIONS: --max-old-space-size=384
    volumes:
      - uploads:/data/uploads
    expose:
      - "4000"
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    mem_limit: 512m

  web:
    build:
      context: ../apps/web
      dockerfile: ../../docker/Dockerfile.web
      args:
        NEXT_PUBLIC_API_URL: https://SEU_DOMINIO/api
        # Teste por IP: http://SEU_IP/api
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3000
      NODE_OPTIONS: --max-old-space-size=384
    expose:
      - "3000"
    depends_on:
      - api
    mem_limit: 512m

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      # Depois do HTTPS: - "443:443"
    volumes:
      - ./nginx/prod.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - web
      - api
    mem_limit: 64m

volumes:
  pgdata:
  redisdata:
  uploads:
```

> Troque **todas** as ocorrências de `SENHA_FORTE_AQUI` e `SEU_DOMINIO` / IP.

### 6.4 Nginx de produção

```bash
nano docker/nginx/prod.conf
```

```nginx
server {
  listen 80;
  server_name SEU_DOMINIO;   # ou o IP / _

  client_max_body_size 20m;

  location /api/ {
    proxy_pass http://api:4000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }

  location / {
    proxy_pass http://web:3000/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---

## 7. Ajustar o Dockerfile da API (seed + migrate)

O `Dockerfile.api` já deve rodar `prisma migrate deploy` no start. Confirme no servidor se o final do arquivo tem algo assim:

```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
```

Depois do primeiro `up`, rode o seed **uma vez**:

```bash
docker compose -f docker/docker-compose.kvm1.yml exec api npx tsx prisma/seed.ts
```

Se `tsx` não existir na imagem de produção, use:

```bash
docker compose -f docker/docker-compose.kvm1.yml exec api npx prisma db seed
```

(ou gere um job de seed no build — se falhar, avise no chat que adaptamos o Dockerfile).

---

## 8. Build e subida

```bash
cd /var/www/fort-beer-erp

# Builds podem demorar 10–20 min no KVM 1 — normal
docker compose -f docker/docker-compose.kvm1.yml build

docker compose -f docker/docker-compose.kvm1.yml up -d

docker compose -f docker/docker-compose.kvm1.yml ps
docker compose -f docker/docker-compose.kvm1.yml logs -f --tail=80
```

Teste no navegador:

- `http://SEU_IP` → tela de login  
- `http://SEU_IP/api/health` → `{"status":"ok",...}`

Login seed: **gestor** / **1234** (troque depois).

---

## 9. Domínio + HTTPS (Cloudflare — simples)

1. Cloudflare → adicione o domínio → aponte DNS:
   - Tipo **A**, nome `@` ou `app`, conteúdo = **IP do VPS**, proxy **laranja**.
2. SSL/TLS → modo **Flexible** (teste rápido) ou **Full** (melhor; precisa cert no Nginx depois).
3. Atualize `CORS_ORIGIN` e `NEXT_PUBLIC_API_URL` para `https://seu-dominio` / `https://seu-dominio/api`.
4. Rebuild só do `web` (porque `NEXT_PUBLIC_*` entra no build):

```bash
docker compose -f docker/docker-compose.kvm1.yml up -d --build web nginx api
```

### HTTPS nativo (opcional, Certbot)

Quando o DNS já apontar sem proxy laranja temporariamente:

```bash
apt install -y certbot
# Alternativa mais limpa: Traefik/Caddy ou nginx + certbot no host
# Para MVP, Cloudflare Flexible/Full costuma bastar.
```

---

## 10. Atualizar o sistema (deploy do dia a dia)

```bash
cd /var/www/fort-beer-erp
git pull
docker compose -f docker/docker-compose.kvm1.yml up -d --build
docker compose -f docker/docker-compose.kvm1.yml exec api npx prisma migrate deploy
```

---

## 11. Backup (não pule)

Cron diário do Postgres:

```bash
mkdir -p /var/backups/fortbeer
crontab -e
```

Linha:

```cron
30 3 * * * docker compose -f /var/www/fort-beer-erp/docker/docker-compose.kvm1.yml exec -T db pg_dump -U fortbeer fortbeer | gzip > /var/backups/fortbeer/$(date +\%F).sql.gz
```

Guarde também o volume `uploads` se usar NF-e/fotos.

---

## 12. Checklist se algo falhar

| Sintoma | O que fazer |
|---------|-------------|
| Container `Killed` no build | Confirme swap (`free -h`); feche outros processos; builde um serviço por vez (`build api` depois `build web`) |
| `health` com `db: false` | `docker compose ... logs db` — senha do `.env` = senha do compose |
| Login CORS error | `CORS_ORIGIN` tem que ser exactamente a URL do navegador |
| Página abre, API 404 | Confira `prod.conf` (`/api/` → `api:4000/api/`) |
| Disco cheio | `docker system prune -af` com cuidado; limpe imagens antigas |
| Muito lento | Normal no KVM 1 sob swap; migrar para KVM 2 |

Comandos úteis:

```bash
free -h
df -h
docker stats
docker compose -f docker/docker-compose.kvm1.yml logs api --tail=100
```

---

## 13. Ordem resumida (colar mental)

1. Ubuntu 24.04 no KVM 1  
2. `apt upgrade` + UFW (22/80/443)  
3. Swap 4G  
4. Docker Engine + Compose plugin  
5. `git clone` em `/var/www/fort-beer-erp`  
6. `.env.production` + `docker-compose.kvm1.yml` + `nginx/prod.conf`  
7. `build` → `up -d` → seed → testar login  
8. Domínio Cloudflare + rebuild web com URL pública  
9. Backup `pg_dump` diário  

---

## 14. Próximo passo depois do teste

Quando o balcão usar de verdade:

- Subir para **KVM 2 (8 GB)**  
- Trocar senha `1234`  
- SSL **Full** (strict)  
- Backups off-site (outro disco / S3)  

Se quiser, no próximo chat posso **gerar os arquivos `docker-compose.kvm1.yml` e `nginx/prod.conf` já no repositório** para você só editar senha/domínio e rodar o `compose up`.
