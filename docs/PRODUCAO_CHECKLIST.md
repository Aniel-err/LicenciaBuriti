# Checklist de producao

## Ambiente

- Definir `DATABASE_URL` com usuario restrito ao banco do sistema.
- Definir `JWT_SECRET` com valor aleatorio de pelo menos 32 caracteres.
- Definir `WEB_ORIGIN` com origem HTTPS real do frontend.
- Definir `APP_URL`, `DOCUMENT_SIGNING_SECRET` e credenciais SMTP.
- Definir `SEED_ADMIN_PASSWORD` somente durante carga inicial controlada.
- Nao executar seed em producao sem janela de manutencao.

## Banco e migrations

- Executar `npm --workspace @licencia-buriti/api exec prisma migrate deploy`.
- Verificar backup antes de cada deploy.
- Confirmar que a extensão PostGIS e os índices GIST foram criados pela migration.
- Testar restore do backup periodicamente.
- Monitorar tamanho de tabelas `AuditLog`, `Document`, `IssuedDocument` e uploads.

## HTTPS e rede

- Servir API e frontend somente via HTTPS.
- Bloquear acesso direto ao banco fora da rede autorizada.
- Expor somente portas HTTP/HTTPS publicas.
- Aplicar rate limit em proxy reverso e API.

## Arquivos

- Montar `uploads/documents` em volume persistente.
- Fazer backup incremental do volume de uploads.
- Verificar hash `fileSha256` apos restore.
- Antes de aceitar producao critica, integrar antivírus ou serviço de malware scanning.

## Logs e auditoria

- Coletar stdout JSON da API em log drain.
- Indexar por `requestId`, `userId`, `action`, `statusCode` e `durationMs`.
- Definir retencao para `AuditLog`.
- Alertar erro 5xx, aumento de 401/403, falha de upload e falha de emissao.

## Assinatura e identidade

- Para assinatura digital juridicamente forte, integrar certificado A1/A3 ou provedor ICP-Brasil.
- Guardar cadeia de assinatura e carimbo de tempo junto ao documento emitido.
- Para recuperação de senha, configurar o provedor SMTP antes de liberar contas externas.

## Deploy

- Rodar `npm run build`.
- Rodar testes `npm --workspace @licencia-buriti/api run test:security` e `npm --workspace @licencia-buriti/web run test:security`.
- Aplicar migrations.
- Reiniciar API.
- Validar `/health`.
- Validar consulta publica e emissao de licenca em ambiente de homologacao.

## Dependências

- A aplicação usa `BrowserRouter` como SPA e não utiliza React Server Components.
- O alerta upstream `GHSA-qwww-vcr4-c8h2`, restrito ao modo RSC do React Router, não possui versão estável corrigida publicada no npm em 30/07/2026; acompanhar uma atualização oficial antes do próximo deploy.
