# Negociacao - forma e dados de pagamento

## Publicacao autorizada

Usuario autorizou agora commit/push deste ajuste e do credor de Compra Direta
na refactor/frontend, com comandos EC2 DEV e migration. Nenhuma aplicacao
real ou deploy pelo agente. Estado historico abaixo e anterior a publicacao;
seguir [roteiro conjunto DEV](2026-10-22-publicacao-compra-negociacao-dev.md).

## Autoridade e estado

Usuario autorizou implementar/testar na refactor/frontend, incluindo edicao
restrita de parcelas existentes como TIT-011543, sem producao. Implementacao
local sobre origin/refactor/frontend41219c3a no mesmo worktree/branch
codex/compra-direta-credor-20261022. O ajuste de credor de Compra Direta
anterior permanece intacto e ainda sem commit. Sem commit/push/deploy, EC2,
DB/S3/Redis reais, flags, dependencias ou aplicacao de migrations. TIT real
nao consultado nem alterado; QA reproduz uma parcela legada com esse codigo.

## Arquivos e funcionamento

- backend/migrations/202610220001_titulo_negociacao_pagamento.js e modelo
  TituloFinanceiro: JSON nullable pagamento_negociacao, aditivo/idempotente,
  sem escrita de dados; down bloqueado para nao apagar instrucoes.
- tituloNegociacaoPagamentoService: schema estrito, forma/favorecido ativos,
  limites PIX8192/dados2000, snapshot servidor; GET/PATCH com permissao editar,
  escopo de todas as obras/origens, protecoes e transacao/locks/revisao/no-op.
- tituloRenegociacaoService: pagamento obrigatorio na previa/confirmacao,
  material incluido no preview_hash/idempotencia, FK forma/favorecido e JSON
  nas novas parcelas. Mesmo calendario, juros/multa/centavos/rateios; snapshot
  e resultado original imutaveis quando a instrucao de uma parcela e editada.
- TituloRenegociacaoController/routes.js: GET/PATCH dedicados sob allowFinanceiro,
  params numericos e criticalRateLimit no PATCH. Guards antigos inalterados.
- instrucaoFinanceiraFavorecidoService e pagamentoManualFilaService: instrucao
  do proprio titulo projetada no DTO da fila, usando o mesmo contrato existente.
- pagamentoAutorizacaoService: hash condicional do novo JSON no snapshot;
  dossies legados sem instrucao preservam material/hash. Sem dados bancarios
  novos nos logs tecnicos ou no dossie publico; dado sensivel so no DTO autorizado.
- NegociacaoPagamentoFields: formulario reutilizado, forma ativa, favorecido
  remoto sem atualizar Pessoas, PIX ou texto de instrucao; timeout/retry da
  leitura de formas, sem escolher forma automaticamente.
- TituloNegociacaoModal: inputs na negociacao/rascunho, mudar pagamento invalida
  previa/aceite/chave de envio mas preserva parcelas editadas. Uma instrucao
  inicial comum a todas as parcelas. Mudanca exige nova previa.
- TituloNegociacaoPagamento e FinanceiroTituloDetalhe: bloco inline, acao
  Editar dados de pagamento. Edicao generica continua bloqueada. GET atual antes
  de preencher/salvar, rascunho de inputs por workspace, conflito/erro preserva
  dados, apos falha PATCH exige releitura e nao repete escrita automaticamente.
- frontend/src/services/financeiro.js: GET/PATCH dedicados e signal opcional
  na leitura de formas; GET de instrucao com timeout15s. PATCH usa servico normal.
- QAs backend/UI novos e fixtures de negociacao existentes atualizadas com
  forma/favorecido, sem retirar negativos; canonico Financeiro/ownership.

## Protecoes

So parcelas vigentes ABERTO, sem baixa/saldo positivo. Nao edita originais
substituidos nem compartilhados; sem alterar valor, vencimento, credor,
rateios, impostos ou vinculos. Bloqueia movimentos nao cancelados/estornados,
fila nao regularizada, intencao bancaria pendente/ambigua, autorizacao ativa,
cartao/fatura/beneficiario bancario ou cobranca emitida e bloqueios de origem.
FALHA_INTEGRACAO bancaria e tratada conservadoramente: regularizar no banco.
GET nao escreve. PATCH revalida tudo dentro da transacao, inclusive bloqueio
que surgiu depois do GET. Auditoria antes/depois e historico das solicitacoes
na mesma transacao. Retry identico nao duplica evento. Correcao nao muda a
negociacao original nem os pagamentos parciais que estavam nas origens.

## Validacoes concluidas

- validarTituloNegociacaoPagamento: servicos reais com dados em memoria,
  obrigatoriedade/limites/ativos, PIX/boleto/TED/favorecido diferente, parcela
  legada TIT-011543, PATCH permitido/restrito, campos financeiros rejeitados,
  ACL e todas as obras/origens, baixa/fila/autorizacao/bancario/cartao/cobranca,
  revisao antiga/concorrencia/rollback da auditoria, replay sem evento extra,
  instrucao da fila, hash legado igual/novo sensivel a instrucao e migration
  aditiva aceita pelo runner, repeticao sem DDL duplicado. Sem SQL MySQL real.
- Suites backend existentes: validarTituloRenegociacaoService/Domain/Vinculos/
  Sincronizacao/Migration, validarAnaliseProprietario (inclui autorizacao unica),
  validarFilaBaixaComposta/Instrumentos/BaixaEstorno,
  validarSolicitacaoFavorecidosIntegracao, validarCompraDiretaGestao/
  FreteFinanceiro e validarCompraDiretaCredorObrigatorio aprovadas.
- UI dedicada usa componentes/CSS e services HTTP reais com API interceptada:
 1366/390, legado, PIX/boleto/TED, favorecido diferente, duplo clique, conflito,
  resposta perdida/releitura sem reenvio, negativa, fila/autorizacao e mudanca
  de instrucao invalida previa. Sem servicos externos.
- UI existente validarTituloNegociacaoModal aprovada1366/390, incluindo
  workspace/rascunho/corrida/retry/chave/ACL, valores editados e favorecido
  inicial atualizado quando o contexto de credor muda na consulta autorizada.
- Build final635modulos/11,62s aprovado; avisos antigos Browserslist/chunks.
  Node/diff-check aprovados; catalogo gerado sem delta.
- Documentacao601Markdown/19canonicos aprovada.
- QA UI de Compra Direta/credor e de gestao repetidos e aprovados na verificacao final.
- Outputs privados em outputs/negociacao-pagamento e outputs/renegociacao,
  nunca incluir em eventual commit. Testes nao substituem MySQL/DEV real.

## Proximo passo exato

Regressoes/documentacao finais concluidas, ownership liberado. Se o usuario
autorizar commit/push, publicar apenas deltas autorizados na refactor/frontend,
explicitando se inclui o credor de Compra Direta. Preparar roteiro DEV proprio
com identidade/UUID/TLS/schema/processo backend-dev e guardas; NAO reutilizar
roteiros de promocao anteriores que proibiem novas migrations ou reiniciar
backend-solicitacoes. Ha migration nova: testar/aplicar apenas em DEV na etapa
autorizada antes de iniciar backend com modelo novo. Frontend/backend precisam
ser atualizados juntos. Nenhuma producao ou migration real nesta etapa.

Homologar com registros de teste: nova negociacao com PIX/favorecido distinto,
boletos pelo fluxo existente, editar parcela antiga sem instrucao, confirmar
historico/valores/vinculos inalterados e negar edicao depois de fila/autorizacao
ou baixa. Negociacoes antigas nao sao atualizadas em lote; forma/dados sao
informados explicitamente pelo usuario no novo bloco.
