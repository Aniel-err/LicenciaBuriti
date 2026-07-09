# Licencia Buriti

Sistema de Licenciamento e Gestao Ambiental Municipal para a Secretaria Municipal de Meio Ambiente e Turismo de Buriti/MA.

## Escopo inicial

- Area publica para consulta de processos.
- Area autenticada por perfis: empreendedor, analista, fiscal e administrador.
- Cadastro de empreendedores, responsaveis tecnicos e empreendimentos.
- Solicitacao de licencas com documentos obrigatorios por atividade.
- Gestao de processos, pareceres, condicionantes, documentos e fiscalizacao.
- Dashboard administrativo, relatorios e controle de validade.
- API REST em Node.js/TypeScript e PostgreSQL via Prisma.

## Como rodar

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

4. Crie as tabelas e carregue dados iniciais:

```bash
npm run prisma:migrate
npm run seed
```

5. Rode a API e o front-end:

```bash
npm run dev
```

Front-end: http://localhost:5173  
API: http://localhost:3333

## Usuario inicial

O seed cria usuarios iniciais para desenvolvimento. Defina `SEED_ADMIN_PASSWORD` no ambiente se quiser uma senha fixa local; se deixar vazio, o seed gera uma senha temporaria e mostra no terminal.

## Observacao de desenvolvimento

O front-end possui dados de demonstracao para permitir avaliacao visual mesmo quando a API ou o banco ainda nao estiverem ativos. Quando a API responder, os dados reais substituem automaticamente a demonstracao nas telas principais.
