# Implantação em VPS com EasyPanel

## Componentes

- `postgres`: PostgreSQL 16 com PostGIS, sem porta pública.
- `api`: API REST, migrations automáticas e volume persistente de arquivos.
- `web`: aplicação React servida por Nginx e proxy interno da API.
- `caddy`: HTTPS automático, compressão e logs estruturados de acesso.

## Preparação

1. Aponte o DNS do domínio para o IP da VPS.
2. Copie `.env.production.example` para `.env.production`.
3. Substitua todos os valores iniciados por `SUBSTITUA_`.
4. Restrinja `.env.production` ao usuário responsável pelo deploy.
5. Libere somente as portas 80 e 443 no firewall público.

## Subida inicial

```bash
docker compose -f compose.production.yml --env-file .env.production build
docker compose -f compose.production.yml --env-file .env.production up -d
docker compose -f compose.production.yml --env-file .env.production ps
```

O serviço da API executa `prisma migrate deploy` antes de iniciar. O Caddy solicita e renova o certificado HTTPS quando o domínio resolve para a VPS.

## EasyPanel

Crie um projeto a partir do repositório e use o arquivo `compose.production.yml`. Cadastre as variáveis de `.env.production` no cofre de variáveis do EasyPanel. Mantenha banco, API e web na rede interna do projeto; o único serviço público é o Caddy.

## Verificação

```bash
export DOMAIN=licenciamento.dominio.gov.br
infra/scripts/healthcheck.sh
docker compose -f compose.production.yml --env-file .env.production logs --tail=100 api
```

Os endpoints `/api/health` e `/api/ready` verificam, respectivamente, o processo da API e a conexão com o banco.

## Backup periódico

Agende no `cron` da VPS:

```cron
0 2 * * * cd /opt/licencia-buriti && set -a && . ./.env.production && set +a && BACKUP_DIR=/srv/backups/licenca RETENTION_DAYS=30 infra/scripts/backup.sh >> /var/log/licenca-backup.log 2>&1
```

Copie os backups para um destino externo à VPS e execute um teste de restauração trimestral em ambiente separado.

## Atualização

```bash
git pull --ff-only
docker compose -f compose.production.yml --env-file .env.production build
BACKUP_DIR=/srv/backups/licenca infra/scripts/backup.sh
docker compose -f compose.production.yml --env-file .env.production up -d
infra/scripts/healthcheck.sh
```

Não execute o seed de demonstração em produção.
