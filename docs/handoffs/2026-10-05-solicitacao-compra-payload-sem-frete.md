# Solicitacao de Compra: payload sem frete

## Causa

O formulario da solicitacao comum nao mostra frete, mas montava
`frete_modo: GLOBAL` no payload. O endpoint `POST /compras/solicitacoes`
rejeita esse campo, corretamente reservado para Compra Direta.

## Arquivos alterados

- `frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`: nao monta frete na solicitacao comum e salva o payload restrito no rascunho.
- `frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx`: normaliza rascunhos antigos imediatamente antes do envio; Compra Direta continua com payload integral.
- `frontend/src/modules/solicitacao-compra/utils/payloadSolicitacaoCompra.js`: seleciona somente os campos aceitos pelo endpoint comum e remove valores/precos/frete dos itens.
- `frontend/scripts/validarPayloadSolicitacaoCompra.mjs`: regressao para rascunho legado, validacao real do backend e isolamento da Compra Direta.
- `docs/workspace/OWNERSHIP_ATIVO.md`: ownership da tarefa.

## Validacoes

- `node frontend/scripts/validarPayloadSolicitacaoCompra.mjs`: passou.
- `node frontend/scripts/validarReaproveitamentoCompra.mjs`: passou.
- `node frontend/scripts/validarModalApropriacaoCompra.mjs`: passou.
- `npx vite build` em `frontend/`: passou (apenas avisos de Browserslist antigo e chunk grande).
- Nenhum teste com escrita no banco nem deploy foi feito.

## Risco e proximo passo

Baixo: alteracao apenas no payload da solicitacao comum. A Compra Direta conserva
todos os campos de frete. Um rascunho ja aberto em revisao sera corrigido no
envio apos a publicacao do frontend atualizado. O proprietario autorizou
commit e push para `main`; este worktree ja esta nessa branch. O deploy do
frontend permanece separado, sem necessidade de reiniciar o backend por esta
mudanca isolada.
