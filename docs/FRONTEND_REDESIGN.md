# Reformulação do frontend

## Arquitetura

O frontend foi separado por responsabilidade:

- `src/app`: roteamento e providers globais;
- `src/layouts`: layouts autenticado e público;
- `src/components`: identidade e componentes reutilizáveis;
- `src/features`: autenticação, dashboard, processos, cadastros e portal público;
- `src/security`: escopo de dados e autorização visual por perfil;
- `src/styles`: tokens e estilos responsivos.

`App.tsx` permanece apenas como exportação compatível. Navegação usa `react-router-dom`, com rotas protegidas, autorização por perfil, páginas 403/404 e restauração por URL.

## Design system

Tokens em `src/styles/tokens.css` definem cores institucionais, espaçamento, bordas, raios, sombras, controles, camadas e largura do menu. Componentes cobrem botões, busca, badges, estados vazios, skeletons, modal acessível e cabeçalho de página.

## Perfis e privacidade

- Administrador: acesso integral às áreas administrativas.
- Analista: processos, cadastros, fiscalização, modelos e relatórios.
- Fiscal: painel, processos, fiscalização e relatórios.
- Empreendedor: somente seus processos e empreendimentos.
- Público: layout independente, sem usuário fictício.

Token fica no `sessionStorage`. Estado operacional não é salvo em `localStorage`. Seeds aparecem apenas com `import.meta.env.DEV` ou `VITE_USE_MOCK_DATA=true`. Resposta 401 encerra a sessão. CPF/CNPJ são reduzidos nas listagens.

## Rotas

Rotas internas: `/dashboard`, `/processos`, `/processos/:processId`, `/empreendedores`, `/empreendimentos`, `/atividades`, `/taxas`, `/fiscalizacao`, `/usuarios`, `/modelos`, `/relatorios` e `/configuracoes`.

Rotas públicas: `/`, `/consulta`, `/validar-documento` e `/login`.

## Responsividade e acessibilidade

Menu vira drawer abaixo de 860 px. Tabelas viram cartões abaixo de 640 px. Modais ocupam a tela no celular. Foco visível, labels, `aria-live`/alertas, focus trap, Escape, restauração de foco, contraste e `prefers-reduced-motion` foram contemplados.

## Dependências

- `react-router-dom`: rotas reais;
- `recharts`: gráfico acessível com legenda textual;
- `@playwright/test`: testes de fluxo e responsividade.

## Identidade oficial

O fallback usa símbolo neutro de documento. Para aplicar arquivos oficiais, adicione `/branding/logo-licencia.svg` e `/branding/brasao-buriti.png` e adapte `src/components/Brand.tsx`. Nenhum brasão foi inventado.

## Testes

```bash
npm run typecheck
npm --workspace @licencia-buriti/api run test:security
npm --workspace @licencia-buriti/web run test:security
npm run test:e2e
npm run build
```

Playwright cobre login, sessão, navegação, processo, permissões, consulta pública, validação e overflow em desktop/mobile.
