# Arquitetura e entrega técnica

## Stack implementada

- Front-end: React, TypeScript, Vite e CSS responsivo.
- API REST: Node.js, Express e TypeScript.
- Banco: PostgreSQL 16, Prisma ORM e PostGIS para índices geográficos.
- Arquivos: volume persistente, hash SHA-256 e metadados no banco.
- Documentos oficiais: PDF, numeração sequencial, código de validação e assinatura HMAC-SHA256.
- Infraestrutura: Docker Compose, Nginx, Caddy/HTTPS e implantação compatível com EasyPanel.

## Segurança

- Senhas em hash bcrypt.
- JWT com expiração de oito horas.
- Controle de acesso por perfil e escopo de dados.
- Limite de tentativas no login e limite global de requisições.
- Recuperação de senha com token único, hash e expiração.
- HTTPS em produção, CORS restrito e cabeçalhos Helmet.
- Auditoria estruturada com request ID, usuário, ação, IP e dados sanitizados.

## Persistência

O Prisma define o esquema canônico e `apps/api/prisma/migrations` contém a evolução versionada. A migration de conclusão ativa PostGIS, cria colunas geográficas geradas e índices GIST sem acoplar as regras de negócio a uma tecnologia diferente da stack atual.

## Operação

- `/health`: processo da API disponível.
- `/ready`: API conectada ao banco.
- Logs JSON no stdout para coleta pelo EasyPanel.
- Backup inclui banco e arquivos, manifesto SHA-256 e retenção configurável.
- Restauração exige confirmação explícita e valida os hashes antes de alterar os volumes.

## Itens dependentes de contratação ou acesso externo

- Integração DAM depende da API e das credenciais do sistema tributário municipal; a tabela de taxas e o cálculo interno estão disponíveis.
- Assinatura qualificada ICP-Brasil depende de certificado ou provedor contratado; a assinatura eletrônica e a verificação de integridade já funcionam.
- Envio de recuperação de senha depende de credenciais SMTP.
- Publicação final depende do domínio, DNS e acesso à VPS/EasyPanel.
