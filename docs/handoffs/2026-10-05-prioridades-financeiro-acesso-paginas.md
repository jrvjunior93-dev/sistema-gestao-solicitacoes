# Acesso granular a Prioridades e paginas financeiras - 05/10/2026

## Contexto

Usuario do setor Financeiro via Prioridades Diretoria no Ctrl+K e na URL, embora
a matriz efetiva da area mostrasse 0/5 permissoes. Em paralelo, varias paginas
financeiras aceitavam uma permissao somente de acao como permissao de leitura.

## Alteracoes locais

- `frontend/src/utils/acessoProduto.js`: com matriz granular configurada,
  Prioridades exige `solicitacoes.prioridades.visualizar` antes de considerar
  acesso legado; Pagamentos em Massa, Fila, DDA e Boletos exigem suas chaves
  `visualizar` no menu, busca e rota direta.
- `backend/src/services/authorizationService.js`: leitura das mesmas areas
  passa a exigir `visualizar` na matriz granular. Usuarios sem matriz preservam
  o comportamento legado; SUPERADMIN mantem o bypass.
- `backend/src/controllers/PrioridadeDiretoriaController.js`: acesso legado por
  usuario/diretoria nao se sobrepoe mais a matriz granular; criar/finalizar/
  cancelar/excluir nessa tela exigem visualizacao e a chave propria da acao.
- `backend/scripts/validarAcessoPaginasGranulares.js` e
  `frontend/scripts/validarAcessoPaginasGranulares.mjs`: regressao de menu,
  Ctrl+K e leitura da API para lista vazia, permissao so de acao e permissao
  de visualizacao.
- `backend/src/generated/navegacaoFonteUnica.cjs`: regenerado no prebuild do
  frontend para que a busca universal use os mesmos guardas de navegacao.

## Validacoes

- `node frontend/scripts/validarAcessoPaginasGranulares.mjs`: passou.
- `node backend/scripts/validarAcessoPaginasGranulares.js`: passou.
- `node frontend/scripts/validarNavegacao.mjs`: passou.
- `npm run build` em `frontend/`: passou.
- `node --check backend/src/controllers/PrioridadeDiretoriaController.js`: passou.
- Regressao de Contratos (scripts frontend e backend): passou.
- `git diff --check`: passou.

## Riscos e proximo passo

Nenhum dado de producao foi consultado ou alterado. A tela de permissoes por
usuario mostra permissao efetiva (padrao de setor/perfil + individual -
bloqueios); portanto `financeiro.titulos.visualizar` pode manter Contas a Pagar
visivel mesmo sem excecao individual. Conferir essa chave no usuario e no
padrao antes de atribuir a visibilidade a outro defeito. Testar com sessao
renovada do usuario apos futura publicacao, sem migracao de banco.

As mudancas de Contratos ja presentes no worktree antes desta tarefa foram
preservadas. O proprietario autorizou commit, push e integracao em `main` no
pedido seguinte. Deploy e operacoes na EC2 continuam fora desta etapa.
