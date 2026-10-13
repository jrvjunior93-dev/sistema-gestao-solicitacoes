# Boleto opcional nos titulos do pedido - 2026-10-13

## Pedido e estado

Usuario solicitou retirar a obrigatoriedade do boleto na criacao de titulos
por Compras dentro do pedido. Implementado e validado localmente; usuario
autorizou commit e push em refactor/frontend nesta etapa, sem deploy/main.
Branch `codex/pedido-boleto-opcional`, base `origin/main` em
`0efa82ce13ebaf475cb17891a04896cbfe18a630`, contendo a promocao completa do DP
e refactor/frontend. Worktree reutilizado: promocao-main-20261003/Fluxy.
Arquivos nao relacionados em outputs/ preservados e fora do Git.

## Mapa e alteracoes

- `frontend/src/modules/solicitacao-compra/components/PedidoCompraFinanceiro.jsx`:
  remove marcador obrigatorio e guarda de boleto vazio, informa opcionalidade.
  O mesmo formulario atende compra e frete a terceiro; conserva upload multiplo.
- `backend/src/services/pedidoCompraFinanceiroService.js`: remove somente a
  guarda de boleto ausente em validarPagamentoNegociado. Mantem forma ativa,
  favorecido ativo, PIX/dados bancarios, categoria, parcelas e total.
- Endpoint POST `/compras/pedidos/:id/financeiro/previsoes` preserva guardas
  allowComprasPedidosFinanceiroPrevisao, comprovacao opcional e
  requirePedidoCompraAccess, validacao do body e transacao. Rota de documentos,
  reparcelamento legado, idempotencia, bloqueio do pedido e auditoria intactos.
- `docs/modulos/compras/README.md`: regra funcional canonica atualizada.
- Novos testes backend e frontend em `scripts/validarPedidoBoletoOpcional*`.
- `docs/workspace/OWNERSHIP_ATIVO.md`: reserva encerrada.

## Validacoes aprovadas

- Backend novo: criacao real do servico com modelos/gerador financeiro em memoria;
  compra/frete sem anexos, total, status, vinculos, historico, retry idempotente,
  multiplos arquivos e vinculo na solicitacao; rejeicoes de forma/favorecido,
  PIX, dados bancarios, soma, arquivo incompleto e vencimento.
- Frontend novo: componente real em Chrome headless/Vite, transporte isolado;
  enviar sem boleto, enviar multiplos boletos, validar PIX e ocultar acao em leitura.
- validarPedidoCompraFinanceiroGeo.js, validarAcessoPedidosEscopo.js,
  validarCompraEtapasResumoPedido.js aprovados.
- node --check nos arquivos backend, git diff --check e validarDocumentacao.js.
- npm run build frontend: 581 modulos, aprovado. Avisos preexistentes de
  Browserslist desatualizado e chunk acima de 500 kB.
- Fixture UI inicialmente falhou por JSX virtual/seletores aninhados; corrigida
  e reexecutada com sucesso. Nenhuma alteracao de runtime por essas falhas.

## Limites e proximo passo

Sem migration, banco real, S3, reinicio ou deploy. Nao modifica exigencias
de boleto na Nova Solicitacao, comprovantes/baixa ou visibilidade. Testes novos
nao substituem homologacao autenticada apos publicacao.

Publicacao autorizada: commit desta tarefa incorporado na base 1d7951b9 de
origin/refactor/frontend em codex/pedido-boleto-opcional-refactor. Apenas o
registro ownership precisou de conciliacao, conservando a base documental da
refactor sem transportar promocao/documentos da main. Testes novos backend,
UI e documentacao reexecutados e aprovados nesta base. Fazer push fast-forward
de HEAD para refactor/frontend e conferir o SHA remoto. Sujeira do checkout
C:/Fluxy-refactor-frontend preservada. Homologar um pedido
com forma Boleto sem arquivo, incluindo frete quando aplicavel, e outro com
multiplos arquivos; conferir os vinculos e titulos. Nao gerar baixa para testar.
