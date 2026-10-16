# Boletos de pedido na fila de pagamento e historico

## Pedido / escopo

Usuario pediu que os boletos dos titulos criados por Compras dentro do pedido
sejam listados na fila e no historico da solicitacao. Implementacao local sobre
refactor/frontend 2cee6b9f, branch codex/boletos-pedido-fila-historico-20261016,
worktree performance-fila-dp-20261015. Sem delegacao ou publicacao autorizada
nesta etapa; outros checkouts e outputs preservados. Producao e main intactas.

## Diagnostico

Pedido ja salvava PedidoCompraDocumentoFinanceiro e Anexo com tipos
BOLETO_COMPRA/BOLETO_FRETE. Fila, endpoint de arquivos e modal filtravam somente
BOLETO. RegistrarBoletosPedido nao gravava evento de anexo no Historico.

## Arquivos / alteracoes

- backend/src/services/pedidoCompraFinanceiroService.js: evento ANEXO_ADICIONADO
  para anexo novo, mesma transacao, anexo/documento/pedido/autor/tipo/caminho.
  Exige transacao; replay/anexo existente nao duplicam evento.
- backend/src/services/pagamentoManualFilaService.js: tres tipos em uma query
  em lote ja existente por solicitacoes da pagina; sem presign ou N+1 novos.
- backend/src/services/solicitacaoFilaPagamentoAcessoService.js: mesmos tres
  tipos, mesmas permissoes/vinculo real com titulo da fila e filtro deleted_at.
- frontend/src/utils/boletosSolicitacao.js: filtro e rotulos reutilizados.
- frontend/src/components/financeiro/ArquivosSolicitacaoFilaModal.jsx: aceita
  compra/frete, preserva mutex/stale/preview/download, orienta conferir parcela.
- frontend/src/pages/FinanceiroFilaPagamentos.jsx: nomes de boletos na coluna
  Titulo/Documento com expansao nativa e abertura do modal existente.
- frontend/src/pages/SolicitacaoDetalhe/Timeline.jsx: novo evento legivel e
  componente complementar apenas quando expandido e ha pedido no historico
  (nao adiciona consultas em DP/contratos/solicitacoes sem pedido). Evento abre boleto,
  nao os botoes de PDF do pedido; eventos anteriores do PC preservados.
- frontend/src/pages/SolicitacaoDetalhe/BoletosPedidoHistorico.jsx: GET autorizado
  dos anexos antigos sem evento, sem backfill/escritas/autoria ficticia. Filtra
  solicitacao, tipo, removidos, eventos ja representados e duplicidade. Abort/
  geracao/mutex contra troca de solicitacao/unmount e duplo clique. Presign ao
  abrir, download/preview existentes; erro/retry sem liberar arquivo negado.
- Testes: validarPedidoBoletoOpcional.js, validarFilaPagamentoSolicitacaoAcesso.js,
  validarArquivosSolicitacaoFila.mjs, validarFilaInstrumentosUI.mjs (modo
  --boletos-pedido), novo validarBoletosPedidoHistorico.mjs e scripts npm.
- Documentacao: README Compras/Financeiro e OWNERSHIP_ATIVO.

## Preservacoes / limites

Nenhuma migration, DML real, EC2, .env, PM2, S3 real, alteracao de permissao,
valor, parcela, status de titulo ou pagamento. Vinculo continua por solicitacao,
nao identifica automaticamente qual boleto corresponde a qual parcela. Remover
arquivo so do pedido conserva o Anexo da solicitacao por regra existente; nao
alterado. Anexo excluido da solicitacao continua indisponivel. Lista antiga
nao oferece mutacao nova nem cria IDs de historico sinteticos.

Frontend-design aplicado somente a identificacao compacta, rotulos e estados,
reutilizando modal/preview existentes e respeitando o padrao operacional Fluxy.

## Validacoes executadas

- Backend test:boletos-pedido: compra/frete, ausencia de boleto, multiplos,
  duplicidade/replay, metadados/autor/transacao, falha de auditoria propagada,
  sem solicitacao/sem URL, ACL do endpoint e remocao isolada do pedido.
- Backend test:performance-fila-dp: 640 titulos/1 snapshot, 533 pedidos/11 paginas,
  fila com 530 itens + 30 rejeicoes, filtros/DP/escopo/paginacao/guard DEV.
- Backend validarRemocaoAnexosHistorico, validarAcessoAnexosSolicitacoes,
  validarFilaPagamentosManuais, validarFilaComprovantePendente e
  validarSegurancaAcessoDireto: aprovados; 2304 comparacoes/48 rotas/66 escopos.
- Frontend test:boletos-pedido: modal real, Timeline e fila desktop/mobile,
  antigos/novos sem duplicidade, exclusoes, lazy GET, preview/download,
  mutex/403/retry/troca de solicitacao. APIs/banco isolados.
- Frontend validarRemocaoAnexosHistorico.mjs aprovado. Build aprovado (609
  modulos); avisos preexistentes de Browserslist/chunk >500KB, sem dependencias novas.
- Capturas desktop/mobile em outputs/boletos-pedido, fora do commit; inspecao
  visual realizada. Sintaxe dos services e git diff --check aprovados.
- Regressao completa validarFilaInstrumentosUI: 650 titulos/13 paginas/8 cards,
  selecao entre paginas, anexos, colunas, preview, clipboard, instrumentos,
  massas, estorno e negativas desktop/mobile aprovados, APIs isoladas.
- test:fila-rolagem aprovado em rodada final sem edicao concorrente: 8 recortes,
  650 titulos, selecao/rascunho/limpar todos, upload sem baixa, retry/403,
  concorrencia/stale, preferencia e fallback. Uma rodada anterior foi invalidada
  por HMR da edicao local de componente durante o teste; nao erro de producao.
- Build final repetido apos o ajuste de foco do preview e guard de consulta
  apenas em historico com pedido: aprovado, 609 modulos. Documentacao validada:
  536 Markdown/19 canonicos. Ownership liberado; delta local nao commitado.

## Proximo passo exato

Publicacao autorizada pelo usuario em 16/10/2026 junto ao valor autorizado de
medicao, exclusivamente na refactor/frontend. Para homologar em DEV: gerar titulo no pedido com boletos da compra e
do frete; enfileirar, conferir nomes/rotulos/preview/download; conferir evento
no historico. Em pedido anterior, conferir lista complementar sem novo evento
gravado. Repetir envio, testar anexo removido e usuario fora do escopo. Conferir
que nenhuma baixa/valor muda apenas ao consultar. Sem comando de producao agora.

Promocao total para main continua dependente da homologacao de contratos em DEV
e do preflight de producao ja registrado no handoff de contratos.
