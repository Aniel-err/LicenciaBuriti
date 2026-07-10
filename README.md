# Licencia Buriti

Sistema beta de Licenciamento e Gestao Ambiental Municipal para a Secretaria Municipal de Meio Ambiente e Turismo de Buriti/MA.

O projeto centraliza o atendimento digital de pedidos de licenca ambiental, consulta publica de processos, analise tecnica, fiscalizacao, documentos oficiais e relatorios administrativos. A modelagem foi ajustada para refletir a Lei Municipal 756 e permitir parametrizacao de regras por tipo de licenca.

## Status

Versao beta em desenvolvimento. O sistema ja possui fluxo principal de licenciamento, trilha de auditoria, controle de perfis, validacao publica de documentos emitidos e checklist de pontos obrigatorios para producao.

## Perfis de acesso

- `admin`: administra usuarios, vinculos, configuracoes, regras, relatorios e operacoes sensiveis.
- `analyst`: analisa processos, pareceres, condicionantes e documentos oficiais.
- `fiscal`: registra e acompanha vistorias/fiscalizacoes.
- `entrepreneur`: acompanha seus empreendimentos, processos e documentos.

## Principais recursos

- Area publica para consulta e validacao de documentos.
- Login autenticado com perfis e permissoes.
- Cadastro de empreendedores, responsaveis tecnicos e empreendimentos.
- Solicitacao e acompanhamento de licencas ambientais.
- Regras parametrizadas por tipo de licenca.
- Upload de documentos com armazenamento local, hash e versao.
- Gestao de processos, pareceres, condicionantes e fiscalizacoes.
- Emissao de documentos oficiais com codigo de validacao.
- Auditoria estruturada em JSON com request ID, usuario e acao.
- Relatorios administrativos com filtros.

## Stack

- Monorepo npm workspaces.
- API REST em Node.js, Express e TypeScript.
- Banco PostgreSQL com Prisma ORM.
- Front-end React, TypeScript e Vite.
- Testes de politica de seguranca no backend e frontend.

## Estrutura

```text
apps/api      API, Prisma, regras, auditoria e seguranca
apps/web      Front-end React
docs          Checklist e documentos tecnicos
scripts       Scripts auxiliares de build
```

## Como rodar localmente

1. Instale as dependencias:

```bash
npm install
```

2. Copie o arquivo de ambiente:

```bash
copy .env.example apps\api\.env
```

3. Suba o PostgreSQL:

```bash
docker compose up -d
```

4. Rode migrations, gere o Prisma Client e carregue dados iniciais:

```bash
npm run prisma:migrate
npm run prisma:generate
npm run seed
```

5. Rode API e front-end:

```bash
npm run dev
```

Front-end: http://localhost:5173  
API: http://localhost:3333  
Healthcheck: http://localhost:3333/health

## Validacao

Comandos usados para verificar a versao beta:

```bash
npm --workspace @licencia-buriti/api run typecheck
npm --workspace @licencia-buriti/web run typecheck
npm --workspace @licencia-buriti/api run test:security
npm --workspace @licencia-buriti/web run test:security
npm run build
```

## Usuario inicial

O seed cria usuarios iniciais para desenvolvimento. Defina `SEED_ADMIN_PASSWORD` no ambiente se quiser uma senha fixa local; se deixar vazio, o seed gera uma senha temporaria e mostra no terminal.

## Producao

Antes de publicar em producao, revisar `docs/PRODUCAO_CHECKLIST.md`, configurar variaveis reais, HTTPS, origem do front-end, segredo JWT forte, backup do banco, armazenamento definitivo de documentos e politica operacional de retencao/auditoria.
