# Início segue a preferência individual — 04/10/2026

## Alteração

- A rota `/` agora resolve a tela inicial salva para o usuário, sem exceção por perfil. Sem preferência ou sem permissão atual para a tela, abre o menu de módulos.
- O botão e o breadcrumb **Início** apontam para `/` e, portanto, seguem a mesma regra do login.
- O menu de módulos continua disponível em `/modulos` pelo logo CSC/Fluxy; o link **Gerenciar atalhos** também usa essa rota.
- A tela Meu Perfil explica a diferença entre Início e menu de módulos, e o título da aba interna para `/modulos` é **Módulos**.
- O login usa o mesmo resolvedor de rota para usuários comuns e SUPERADMIN.

## Arquivos

`frontend/src/App.jsx`, `frontend/src/navigation/telaInicialRoute.js`, `frontend/src/pages/Login/index.jsx`, `frontend/src/layout/Layout.jsx`, `frontend/src/navigation/AtalhosTopbar.jsx`, `frontend/src/navigation/useWorkspaceTabs.js`, `frontend/src/pages/Perfil.jsx`, `frontend/scripts/validarTelaInicial.mjs`, `frontend/scripts/validarNavegacao.mjs`, `frontend/package.json`, `docs/workspace/OWNERSHIP_ATIVO.md`.

## Validação e risco

- Teste focado, compilação e teste das abas internas aprovados.
- A verificação geral de navegação continua falhando por divergência preexistente em `FinanceiroTitulos.jsx` (4 destinos manuais versus 3 no trinco); a regra atualizada da Home passou.
- Não há migration, alteração no banco ou mudança de permissão. A escolha já salva permanece válida. Confirmar em preview: perfil sem escolha, perfil com Painel do Gestor, perfil com Relatórios, clique em Início e clique no logo.
- Em 04/10/2026 o proprietário autorizou commit, push e promoção controlada da `refactor/frontend` para `main`. Isso não inclui atualização da EC2, alteração no banco ou reinício do backend. Conferir os SHAs publicados no histórico Git.
