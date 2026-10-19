# Fila: baixa com multiplas fontes

## Escopo autorizado

Integracao na base refactor/frontend (39f368be), branch local isolada
codex/fila-multiplas-fontes-20261018. Sem producao, EC2/SSH, banco/Redis/PM2
reais, deploy, commit ou push. Permissoes e regras existentes preservadas.

## Mapeamento antes da implementacao

- Fila usa canBaixarFilaPagamentos, rotas proprias, revalidacao por IDs entre
  paginas, trava de titulo, status PENDENTE, bloqueios proprietario/DP/Obra,
  previsao de fatura e servico canonico baixarTitulo com contexto interno.
- BaixaCompostaModal e endpoints baixas-compostas ja existem nos titulos;
  exigem criar/confirmar separados, mesmo credor/tipo, validacao das fontes,
  caixa aberto no dinheiro, cheques integrais e rateios dentro do saldo.
- Fluxo composto atual nao inclui juros/multa/desconto e exclui formas que
  geram fatura; nao alterar essas regras no caminho antigo nem misturar
  cartao de credito como pagamento parcial sem seu fluxo de fatura.
- Ledger PagamentoFilaLiquidacao ja protege replay e estorno integral de
  instrumentos rateados/permuta. Cada movimento recebe fila_liquidacao_id.
  Estorno pela fila reverte TODOS os movimentos/itens, devolve carteira uma
  vez e preserva remetente por ciclo; nao criar segundo fluxo de estorno.
- Historico/comprovantes usam pagamentoFilaHistoricoService e guardas atuais.
- Integracao prevista: callbacks opcionais no editor existente, endpoints
  exclusivos da fila com validacao estrita e ACL combinada, validacao compartilhada
  das fontes e gravacao pelo processador canonico da fila na mesma transacao.

## Implementacao

- Novos filaBaixaCompostaValidator/filaBaixaCompostaService: payload de campos
  permitidos, ate 200 filas, 60 fontes/12000 rateios, valores em centavos, datas
  ISO validas e chaves internas proibidas. Escopo de TODOS os titulos antes de
  exibir a previa, incluindo compartilhados/renegociados e empresas distintas.
- POST /financeiro/fila-pagamentos/baixas-compostas/preview e /confirmar,
  cliente proprio e callbacks opcionais em BaixaCompostaModal. Caminho original
  dos titulos continua com seus endpoints e comportamento padrao.
- Exige canAccessFinanceiro, canBaixarFilaPagamentos e granulares ja existentes
  financeiro.baixas_compostas.criar/confirmar. PERMUTA exige financeiro.permutas.usar.
  Estornar esse novo grupo exige financeiro.baixas_compostas.estornar, alem das
  protecoes atuais de estorno. Nenhuma permissao concedida nem registro novo.
- Previa em transacao apenas de leitura/bloqueio, sem criar movimento/grupo.
  SHA256 vincula revisao a usuario, valores, fontes, fila e estado dos titulos.
  Confirmacao revalida sob lock, usa chave idempotente e request hash; replay
  nao duplica. Fonte ou saldo alterado:409 e nova revisao obrigatoria.
- Cada rateio usa baixa canonica com contexto interno da fila e liquidacao;
  nenhum endpoint publico aceita flags para pular autorizacao. Reusa transacao
  e ledger PagamentoFilaLiquidacao. Falha em qualquer movimento/auditoria
  desfaz tudo. Carteira e consumida uma vez no total, nao uma vez por titulo.
- Historico/comprovantes passam pelo processador atual da fila. JSON da linha
  tem somente suas fontes/valores, sem valores de outras obras; ledger interno
  conserva o grupo completo para estorno integral. Estorno individual bloqueado,
  pagamentos anteriores preservados e remetente por ciclo continua inalterado.
- Editor em portal/foco/Escape no contexto fila, rascunho por usuario/selecao,
  mutex de confirmacao, chave preservada em retry de rede. Reconsulta antes da
  previa e validacao final no backend. Cancelar preserva selecao da fila.
- Catalogos operacionais da fila agora incluem campos necessarios de caixa,
  tipo de cheque e identificacao do titulo. Sem acesso administrativo adicional.
  Validacao de fontes reutilizada tem locks/fallback de empresa opcionais apenas
  para essa integracao; chamadas anteriores permanecem com defaults anteriores.

## Como operar / limites preservados

1. Em Pendentes, acionar Multiplas fontes no titulo; para varios, selecionar
   titulos do mesmo credor e acionar Baixa com multiplas fontes na barra.
2. Informar data, forma, conta/caixa/cartao de debito ou cheque e valor de cada
   fonte; Adicionar fonte para PIX+dinheiro, contas diferentes, cheque, permuta etc.
   Nas fontes sem conta, escolher Empresa responsavel. Carteira usa valor integral.
3. Conferir distribuicao automatica ou ajustar os valores por titulo. Para
   pagamento parcial, preencher justificativa em Observacoes do grupo.
4. Validar e revisar, depois Confirmar pagamento. Nada e baixado so ao revisar.
   A fila mostra cada forma e o valor aplicado naquele titulo; comprovantes
   continuam usando o envio/vinculo atual. Estornar reverte o grupo inteiro.

- Mesmo credor e tipo PAGAR, como o composto existente. Empresas/obras podem
  ser distintas, respeitado o escopo completo, sem mudar empresa devedora.
- Nao inclui juros/multa/desconto: dados existentes ou digitados nao sao
  descartados silenciosamente; usar baixa simples nesses casos. Pagamento
  parcial segue o status DIVERGENTE atual e tratamento existente do saldo.
- Cartao de credito continua no fluxo proprio da fila/fatura. Nao libera mistura
  parcial de credito sem contabilizacao correta de fatura. Debito e aceito.
- PERMUTA registra realizado sem limite de acordo, como a etapa ja autorizada.
  Sem nova regra de saldo nem alteracao das permutas antigas.
- Bloqueios proprietario/DP/retorno Obra, revisao de previsao de cartao e faturas
  fechadas/pagas, empresas/fontes ativas, caixa aberto e unicidade de cheques
  continuam validados. Nao permite baixar titulo pago/excluido/rejeitado.

## Arquivos

- backend/src/validators/filaBaixaCompostaValidator.js e
  backend/src/services/filaBaixaCompostaService.js (novos).
- backend/src/services/pagamentoManualFilaService.js, chequeTerceiroService.js,
  controllers/PagamentoManualFilaController.js, routes.js e package.json.
- frontend/src/pages/FinanceiroFilaPagamentos.jsx,
  components/financeiro/BaixaCompostaModal.jsx, InstrumentoPagamentoFila.jsx,
  services/financeiro.js e package.json.
- Novos backend/scripts/validarFilaBaixaComposta.js e
  frontend/scripts/validarFilaBaixaCompostaUI.mjs; fixtures de regressao do editor,
  fila e liquidacao rateada atualizadas para os contratos atuais.
- Inventario de datas regenerado pelo gerador existente:1823 fontes,2265
  conversoes, nenhum erro de parser. Sem padronizacao global nem escrita de datas.

## Validacoes locais executadas

- Backend npm run test:fila-multiplas-fontes: servicos reais com fronteira de
  models em memoria, PIX/dinheiro/debito/cheque proprio/carteira/permuta,
  compartilhados reais com origens em empresas distintas, sem reclassificar
  divida; previa sem escrita, saldo obsoleto, ACL completa, owner/DP/Obra,
  parcial, replay, concorrencia com transacoes serializadas simuladas,
  estorno do grupo e rollback inclusive falha da auditoria. Inclui regressao
  dos1000 rateios, permutas e carteira. Nao e teste de carga MySQL real.
- Regressao backend: previsao cartao, permissao financeira de rotas,
  comprovantes/historico e bloqueio retorno Obra aprovados, com servicos isolados.
- Frontend npm run test:fila-multiplas-fontes: pagina/editor reais em Chrome,
  transporte simulado;1366/390px sem corte do modal, revisao/confirmacao,
  valores distintos por fonte, exibicao apos baixa, selecao em lote,
  permissoes, mutex, retry com mesma chave e409 exige revisar novamente.
  Regressao do editor original tambem aprovada em1366/390px.
- Regressao UI de permutas, navegacao e suite original da fila aprovadas
  (650 titulos,13 paginas, selecao, instrumentos, comprovantes e estorno).
- Evidencias visuais locais em outputs/fila-multiplas-fontes-20261018/;
  outputs/ nao deve ser incluido automaticamente em eventual commit.
- Build frontend, validacao de navegacao, inventario reproduzivel e documentacao
  (575 Markdown/19 canonicos) aprovados; git diff --check sem erros. Avisos
  existentes de Browserslist/chunk grande mantidos, sem atualizar dependencias.
- Contadores de divergencia/comprovante usam as instancias retornadas pelo
  processador, nao o snapshot anterior. Teste isola identidades de SELECTs
  como no Sequelize real e cobre titulo com/sem comprovante e parcial.

## Estado / proximo passo

Implementacao e testes locais concluidos; sem migration nova. Nenhum acesso
real a EC2/MySQL/Redis, alteracao de .env/PM2, dado de producao ou DEV, nem
commit/push/deploy. Branch local baseada no ultimo refactor/frontend publicado.

Antes de publicar, solicitar autorizacao especifica de commit/push. Depois,
homologar no DEV com usuario autorizado e outro sem granulares: PIX+dinheiro,
duas contas, parcial justificado, permuta, debito, cheque/carteira integral,
titulos compartilhados, envio duplicado e estorno integral; conferir movimentos,
saldo, historico e comprovantes. Confirmar que credito/encargos usam fluxo
proprio e que rejeicao/exclusao/alteracao concorrente bloqueiam a confirmacao.
Nao promover para main/producao sem nova autorizacao e homologacao.
