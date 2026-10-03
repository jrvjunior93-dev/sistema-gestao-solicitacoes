# Comentarios dos itens livres; conversa geral limitada ao setor

## Estado

Ajuste na `refactor/frontend`; deploy de desenvolvimento pendente.

## Regra confirmada

- Quem pode visualizar a solicitacao pode comentar nos itens mesmo quando ela esta no GEO e o usuario pertence a OBRA. Esses comentarios sao registrados no historico como `COMENTARIO_ETAPA_COMPRA` e geram destaque.
- O comentario geral da conversa, registrado como `COMENTARIO` no historico da solicitacao, so pode ser enviado quando a solicitacao esta no setor do usuario. Anexos e demais acoes operacionais seguem a mesma restricao.
- A regra e aplicada no frontend e no backend. Os endpoints de comentarios dos itens continuam usando contexto de visualizacao.

## Alteracoes

- `backend/src/controllers/SolicitacaoController.js`: a rota de comentario geral exige interacao no setor atual; nao basta permissao de visualizar.
- `backend/src/services/solicitacaoRetornoService.js`: mensagens de bloqueio distinguem conversa geral de comentarios nos itens.
- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`: o card da conversa geral fica somente leitura fora do setor.
- `frontend/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx`: aviso distingue comentarios nos itens das demais acoes bloqueadas.
- `frontend/src/pages/SolicitacaoDetalhe/Conversa.jsx`: texto do campo nao sugere anexo quando indisponivel.
- `backend/scripts/validarBloqueioRetornoObra.js`: regressao protege a separacao entre comentario geral e comentario nos itens.

## Validacoes e proximo passo

`node --check` dos dois arquivos backend, `npm run test:bloqueio-retorno-obra`, `npm run test:compra-cotacao-envio`, `npm run test:navegacao`, `npm run build` e `git diff --check` passaram. Nao houve teste autenticado no ambiente dev. Em homologacao, como OBRA numa solicitacao em GEO, comentar num item e conferir historico/destaque; confirmar que a conversa geral fica somente leitura e que a API de comentario geral bloqueia tentativa direta. Apos retorno a OBRA, confirmar que a conversa geral volta a permitir envio. Preservar os arquivos preexistentes alheios `docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e `outputs/`.
