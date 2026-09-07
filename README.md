# Licencia Buriti

Sistema beta de Licenciamento e Gestão Ambiental Municipal para a Secretaria Municipal de Meio Ambiente e Turismo de Buriti/MA.

O projeto centraliza pedidos de licença ambiental, consulta pública de processos, análise técnica, fiscalização, documentos oficiais e relatórios administrativos. As regras e a base legal podem ser parametrizadas por atividade e tipo de licença.

## Status

Versão beta em desenvolvimento. O sistema possui fluxo de licenciamento, portal público, controle de acesso por perfil, auditoria e infraestrutura para implantação. A publicação em produção depende da configuração do ambiente e da revisão do [checklist de produção](docs/PRODUCAO_CHECKLIST.md).

## Perfis de acesso

- **Administrador (`ADMIN`)**: administra usuários, vínculos, configurações, regras, relatórios e operações sensíveis.
- **Analista (`ANALISTA`)**: analisa processos, pareceres, condicionantes e documentos oficiais.
- **Fiscal (`FISCAL`)**: registra e acompanha vistorias e fiscalizações atribuídas.
- **Empreendedor (`EMPREENDEDOR`)**: solicita licenças e acompanha seus cadastros, processos e documentos.

Os códigos entre parênteses correspondem aos perfis usados pela API e pelo banco de dados.

## Principais recursos

- Portal público com notícias, manual, legislação, consulta de processos e validação de documentos.
- Cadastro público de empreendedores, autenticação por perfil e recuperação de senha por e-mail, mediante configuração SMTP.
- Cadastros de pessoas físicas e jurídicas, responsáveis técnicos com ART e empreendimentos com localização e coordenadas.
- Solicitação e renovação de licenças, distribuição de processos, checklist documental, pendências, mensagens, pareceres, condicionantes e histórico.
- Atividades, taxas e regras parametrizadas por tipo de licença.
- Upload de documentos com armazenamento em disco, hash e versão.
- Emissão de licenças e outros documentos oficiais em PDF, com numeração, assinatura eletrônica HMAC e código de validação pública.
- Fiscalização com vistorias, autos, fotos, anexos e coordenadas GPS.
- Painel com indicadores e gráficos, notificações de prazos e relatórios com filtros, CSV e impressão.
- Gestão de modelos de documentos e conteúdo institucional.
- Auditoria estruturada em JSON com request ID, usuário e ação.

## Stack

- Monorepo npm workspaces.
- API REST em Node.js, Express e TypeScript.
- Banco PostgreSQL 16 com Prisma ORM e PostGIS.
- Front-end React, TypeScript, Vite, React Router e Recharts.
- Testes de política de segurança no backend e frontend, além de testes de interface com Playwright.
- Infraestrutura Docker Compose, Nginx e Caddy para HTTPS.

## Estrutura

```text
apps/api      API, Prisma, regras, auditoria e segurança
apps/web      Front-end React
docs          Manuais, arquitetura e implantação
infra         Caddy e scripts de backup, restauração e saúde
scripts       Scripts auxiliares de build e hospedagem
```

## Como rodar localmente

Pré-requisitos: Git, Node.js 22 a partir da versão 22.12, npm e Docker com Docker Compose. O Compose local fornece PostgreSQL com PostGIS na porta `55432`.

1. Clone o repositório e instale as dependências a partir do lockfile:

```bash
git clone https://github.com/Aniel-err/LicenciaBuriti.git
cd LicenciaBuriti
npm ci
```

2. Copie o arquivo de ambiente para a API.

No PowerShell:

```powershell
Copy-Item .env.example apps/api/.env
```

No Linux/macOS:

```bash
cp .env.example apps/api/.env
```

Edite `apps/api/.env` e defina `SEED_ADMIN_PASSWORD` com uma senha local antes de executar migrations ou seeds. Confira também `DATABASE_URL`, `JWT_SECRET` (pelo menos 32 caracteres), `PORT` e `WEB_ORIGIN`. Os valores de exemplo são destinados ao desenvolvimento local.

3. Suba o PostgreSQL com PostGIS e aguarde o serviço ficar saudável:

```bash
docker compose up -d
docker compose ps
```

4. Gere o Prisma Client, aplique as migrations e carregue os dados iniciais:

```bash
npm run prisma:generate
npm run prisma:migrate
npm run seed
```

5. Inicie a API e o front-end:

```bash
npm run dev
```

- Front-end: <http://localhost:5173>
- API: <http://localhost:3333>
- Saúde da API: <http://localhost:3333/health>
- Prontidão do banco: <http://localhost:3333/ready>

## Acesso inicial e demonstração

O seed básico cria contas de desenvolvimento para os quatro perfis. A conta administrativa usa `admin@buriti.ma.gov.br`, com a senha definida em `SEED_ADMIN_PASSWORD`. Essa variável é usada para todas as contas criadas pelo seed.

Se `SEED_ADMIN_PASSWORD` estiver vazia em desenvolvimento, o seed gera uma senha aleatória **que não é exibida no terminal**. Defina a variável antes de executar o comando para conseguir entrar com as contas iniciais. Em produção, o seed exige essa configuração. Executar o seed novamente redefine a senha das contas iniciais existentes e as reativa.

Para carregar a massa de demonstração, use um banco reservado a desenvolvimento ou demonstração, configure a mesma variável e execute:

```bash
npm run seed:demo
```

O comando cria ou atualiza usuários, cadastros e processos de exemplo, substituindo registros associados aos processos de demonstração. Não execute o seed de demonstração em produção.

## Validação

Verificações disponíveis:

```bash
npm run typecheck
npm --workspace @licencia-buriti/api run test:security
npm --workspace @licencia-buriti/web run test:security
npm run build
```

Para os testes de interface, instale o Chromium do Playwright uma vez por ambiente:

```bash
npx playwright install chromium
npm run test:e2e
```

Os testes de interface cobrem fluxos em desktop e celular com respostas de API simuladas. O Playwright inicia o front-end automaticamente; esses testes não exigem o banco nem a API em execução.

## Documentação

- [Manual operacional](docs/MANUAL_OPERACIONAL.md): uso do sistema por perfil.
- [Arquitetura e entrega técnica](docs/ARQUITETURA_E_ENTREGA.md): stack, persistência, segurança e operação.
- [Arquitetura do front-end](docs/FRONTEND_REDESIGN.md): componentes, perfis, responsividade e personalização visual.
- [Checklist de produção](docs/PRODUCAO_CHECKLIST.md): requisitos para publicação.
- [Implantação em VPS com EasyPanel](docs/IMPLANTACAO_EASYPANEL.md): configuração, publicação, backup e restauração.

## Produção e integrações

O repositório inclui [Compose de produção](compose.production.yml), [exemplo de variáveis](.env.production.example), PostGIS, HTTPS automático com Caddy, volumes persistentes, verificações de saúde e scripts de backup e restauração. Siga o guia de implantação e o checklist antes de publicar.

- **Infraestrutura:** exige domínio, DNS e acesso à VPS ou ao EasyPanel.
- **Recuperação de senha:** configure `SMTP_HOST`, `SMTP_USER` e `SMTP_PASS`; ajuste `SMTP_PORT`, `SMTP_SECURE` e `SMTP_FROM` conforme o provedor. Defina `APP_URL` com o endereço público usado no link de redefinição.
- **Integração tributária/DAM:** depende da API e das credenciais do sistema municipal. O cadastro de taxas e o cálculo interno estão disponíveis.
- **Assinatura qualificada ICP-Brasil:** depende de certificado ou provedor externo. A implementação atual oferece assinatura eletrônica HMAC e verificação de integridade.
