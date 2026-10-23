# Fila: separar credor/favorecido e consultar PIX da medicao

## Escopo e autoridade

Usuario autorizou implementar e testar na base refactor/frontend, incluindo
favorecido informado em todos os tipos de solicitacao/criacao de titulo.
Branch local codex/fila-credor-favorecido-pix-20261023 sobre5123de39, base da
refactor/frontend conferida no inicio. Agente unico, sem delegacao.
Implementacao inicial sem publicacao. Agora o usuario autorizou commit/push
direto na refactor/frontend e comandos para atualizar/testar a EC2 DEV, sem PR.
Main/producao permanecem fora do escopo; nenhum deploy e executado pelo agente.
Nao houve banco real, migration, S3, operacao bancaria, baixa ou estorno.
Usuario ampliou o pedido para incluir os dados de pagamento no detalhe do
titulo: favorecido, chave PIX e instrucoes gerais. Mesmo escopo DEV/local.

## Evidencia e decisao

- A fila unificava credor/favorecido e mostrava documento sob o nome desde
  6e59b8df (10/09/2026). Dados escalares da solicitacao vieram em365302ef
  (24/09/2026); instrucoes por parte/titulo em739b9c1b (12/10/2026).
- A aprovacao escalar de medicao alterava parceiro_id/forma do titulo, mas
  nao copiava a chave PIX. O leitor da fila nao consultava a medicao exata.
  Os prints do TIT-009886 sao compativeis com esse caminho; nao foi realizada
  consulta ao banco de producao para atestar o destino bancario historico.
- Correcao somente de leitura: a chave da medicao aprovada ligada a parcela
  daquele titulo e projetada no DTO, inclusive para titulo ja quitado. Nunca
  procurar a medicao mais recente nem escolher por valor/data/numero textual.
  O novo teste do detalhe usa id interno11053 e codigo TIT-009886 distintos;
  o relacionamento e sempre pela FK real, nunca pelos digitos do codigo.
- Instrucao por titulo/parte/negociacao prevalece. Favorecido especifico do
  titulo nao herda a chave de outro favorecido da solicitacao. Cadastro nao
  substitui snapshot da medicao. CPF/CNPJ nao e usado como PIX presumido.
- Favorecido ausente aparece como "Favorecido nao informado", sem fallback
  generico para credor. DP em dinheiro mantem o colaborador/responsavel
  registrado como recebedor. Conta selecionada continua vindo do titulo.
- Credor fica separado. No legado escalar que sobrescrevia o parceiro,
  usa-se o vinculo contratual para exibicao, sem regravar a FK. Mais de um
  credor aparece nominalmente; vinculo de medicao ambiguo recebe aviso.
- Boletos da medicao sao identificados por medicao_id, sem confundir anexos
  de outro evento no mesmo contrato. Links/permissoes de arquivos preservados.
- Avisos de instrucao divergente/incompleta sao apenas informativos; esta
  tarefa nao acrescenta regras de autorizacao ou bloqueio de baixa.
- Detalhe PAGAR mostra os mesmos destinatarios/instrucoes da fila, com campos
  Credor, Favorecido, Forma prevista, Chave PIX e Dados para pagamento. Leitura
  e copia integral no componente existente, sem formulario financeiro novo.
  Aviso diferencia instrucao prevista de comprovante/destino efetivamente pago.
  RECEBER e sua cobranca externa permanecem inalterados.
- Complemento no controller.show somente depois da carga autorizada e do
  filtro de movimentos/intencoes. Nao foi incluido no carregarTituloPorId,
  usado por operacoes financeiras e transacoes; valores e locks nao mudam.

## Arquivos

- backend/src/services/pagamentoFilaDestinatarioService.js: novo leitor em lote,
  limitado aos titulos ja autorizados. JOIN parcela/medicao com aprovada_em e
  devolvido_em; validacao de solicitacao/contrato/origem, sem escrita.
- backend/src/services/pagamentoManualFilaService.js: campos da origem,
  medicao_id nos nomes de boletos e chamada apos instrucao especifica/ACL.
- frontend/src/utils/filaPagamentoDestinatarios.mjs: formatador unico para
  todas as origens; prioridade da instrucao, identidade separada e avisos.
- frontend/src/pages/FinanceiroFilaPagamentos.jsx: colunas separadas, sem
  documento abaixo, mantendo acoes/drafts/instrumentos/endpoints existentes.
- Novos QAs: backend/scripts/validarFilaDestinatarios.js,
  frontend/scripts/validarFilaDestinatarios.mjs e filaDestinatariosQA.mjs.
- QAs ajustados: backend validarFilaFiltrosDp/Paginacao/ComprovantePendente
  (fixtures da nova dependencia/associacao), frontend validarFilaInstrumentosUI,
  filaColunasQA e validarRhTicketPix (helper extraido). Harness sem proxy real.
- package.json de backend/frontend: comando test:fila-destinatarios, sem
  alteracao de dependencias. README Financeiro, ownership e este handoff.
- Detalhe: TituloFinanceiroController, FinanceiroTituloDetalhe,
  DadosPagamentoFila (opcao inline para campo sem mudar acoes), novo
  validarTituloDadosPagamento.js/tituloDadosPagamentoQA.mjs e harness
  validarTituloDetalheWorkspace. Fixture de validarTituloCancelamento ajustada.
- Capturas privadas em outputs/, nao incluir no commit.

## Validacoes locais

Aprovadas em fixtures, ORM com SQL MySQL interceptado e HTTP/APIs isolados;
nao equivalem a homologacao no banco real:

- validarFilaDestinatarios.js: medicao correta/antiga, origem derivada, varias
  partes/credores, ambiguidade, contrato/solicitacao divergentes, instancias
  reais Sequelize/setDataValue e500titulos em3consultas, sem N+1.
  Snapshot completo do TIT-009886 quitado/baixa/historico permanece identico.
- validarFilaDestinatarios.mjs: matriz de origens, titulo manual, solicitacao,
  partes, negociacao, medicao, Pix, conta com digitos, boleto, DP dinheiro,
  ausencia de favorecido/conta e divergencias sem mistura de destinatarios.
- validarFilaInstrumentosUI.mjs --destinatarios: tela real1366/390, nomes sem
  documento, PIX literal da medicao e ausencia de nova baixa; preferencias
  antigas, arrasto/setas, visibilidade, persistencia, drafts e isolamento.
- validarFilaInstrumentosUI.mjs integral: instrumentos, cartoes/cheques,
  parcelas, massa/mutex, comprovantes, arquivos, copia integral, estorno,
  readonly, colunas e650titulos/13paginas com selecao/revalidacao.
- validarFilaInstrumentosUI.mjs --boletos-pedido: arquivos compra/frete no
  modal existente, desktop/mobile, sem baixa.
- Backend: validarFilaPagamentosManuais, validarMedicaoFavorecidos,
  validarMedicaoRecargaFluxoPagamento, validarTituloNegociacaoPagamento,
  validarRhTicketPix, validarFilaFiltrosDp, validarFilaPaginacao,
  validarFilaComprovantePendente, validarFilaBaixaComposta,
  validarFilaLiquidacaoRateada, validarFilaBaixaEstorno,
  validarFilaPagamentoSolicitacaoAcesso, validarAcessoAnexosSolicitacoes e
  validarSegurancaAcessoDireto (2304comparacoes/48rotas locais).
- Frontend validarRhTicketPix.mjs e build aprovados. Aviso de Browserslist
  desatualizado preexistente, sem atualizar dependencias nesta tarefa.
- Detalhe backend: controller.show real em VM, origem de solicitacao/conta
  selecionada/snapshot DP, medicao correta, TIT-009886 quitado, chave explicita,
  negativo403 sem consulta adicional e restricao de movimentos/intencoes.
- Detalhe UI: tela real1366/390, varias origens/ausencia, Pix copia e cola longo,
  copia integral, Escape, readonly, negativa apos troca de aba e nenhuma escrita.
  Regressoes de cancelamento/relatorio selecionado aprovadas.
- validarTituloDetalheWorkspace.mjs integral: baixa/cobranca/correcao,
  desvinculacao de fatura, drafts apos alternar aba, saldo/permissao atuais,
  negativa403, idempotencia e duplo envio aprovados em1366/390.
- Build final, validarDocumentacao (605arquivos/19canonicos) e diff --check
  aprovados. Ownership liberado, alteracoes ainda nao commitadas.

## Proximo passo exato

Publicacao DEV autorizada: publicar somente este delta na refactor/frontend,
sem main/producao ou commit de outputs/. Fornecer o SHA completo confirmado
no remoto e o roteiro abaixo. Nenhuma migration e necessaria. Backend e
frontend devem ser atualizados para a chave da medicao aparecer. Homologar
um titulo novo e consultar o TIT-009886 baixado SEM clicar estorno/baixa;
conferir favorecidos distintos em parcelas, negociacao, Compra Direta e DP.
Dados exibidos sao instrucao prevista, nao comprovante do favorecido pago.

## Roteiro de atualizacao DEV

ops/deploy/atualizar-dev-fila-destinatarios-20261023.sh recebe o SHA completo
publicado; checa checkout exato, branch refactor/frontend, arquivos rastreados
limpos, lock exclusivo, PM2 DEV/8001/watch/DDL e preflight somente leitura de
UUID/banco/schema/sessao/flags. Preserva .env e ambiente PM2, nao aplica DDL
nem instala dependencias. Manifests diferem apenas em scripts de QA.
Guarda de ancestry/base5123de39 e ff-only interrompe divergencias; nao faz reset
ou pega commits posteriores ao SHA informado. Motores/permissoes e lockfiles
devem permanecer identicos a base. QAs isolados e segundo preflight precedem
restart somente backend-dev; health8001 e ultima verificacao fecham o fluxo.
Pendencia de migration, checkout/PM2/banco divergentes ou teste falhando fazem
o roteiro parar. Nao contornar guardas; diagnosticar a saida sem segredos.

validarDeployFilaDestinatariosDev.js testa o roteiro e blocos em VM, incluindo
negativas PM2/porta/watch/DDL/dependencias e guards removidos, sem EC2/rede/DB.
O frontend DEV deve receber o mesmo commit na Vercel. Nao promover producao.

Validacoes repetidas para publicacao aprovadas: suites de destinatarios,
controller/ACL, baixas/negociacao, UI real fila/detalhe1366/390, build12,68s,
documentacao605/19, Bash e guardas do roteiro em VM. Sem EC2/banco real.
Reserva de publicacao encerrada; outputs/ excluido do commit.
