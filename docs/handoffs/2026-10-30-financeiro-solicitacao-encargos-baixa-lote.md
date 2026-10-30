# Financeiro da solicitacao: encargos, baixa em lote e ordenacao

Implementacao local pendente de commit/publicacao. Base origin/refactor/frontend 24b7c7df. Nao houve acesso a EC2, banco, S3 ou integracoes. Nenhuma migration necessaria. O historico recuperado de propostas, descrito no handoff separado de hoje, permanece preservado.

## Comportamento

- Criar Titulo na solicitacao recebe juros e multa em reais. Mantem principal e desconto existentes; mostra total previsto com encargos. Distribui encargos globais uma unica vez entre formas/parcelas por centavos e maiores restos. Armazena campos ja existentes juros/multa, com evidencia no historico da criacao. Cartao informado no ato inclui encargos na movimentacao e recalcula fatura de credito. Adiantamentos e divisao de favorecidos continuam com suas restricoes de valor: encargos nao contornam essas regras.
- Escolha explicita de Registro/Vencimento ASC/DESC ordena globalmente no servidor, sem prioridade operacional antes da data. Vencimentos ausentes ficam por ultimo e ID desempata. Sem escolha explicita continua a fila operacional. Botao restaura apenas ordenacao, preservando filtros. Destaques visuais continuam.
- Financeiro da solicitacao permite selecionar titulos e Baixar selecionados, com conta, forma, data, observacoes e previa de principal/juros/multa/total. So permissao financeiro.titulos.baixar e operacao da aba. Saldo integral por titulo; encargos previstos descontam os ja pagos em movimentos BAIXA ativos.
- Escopo inicial: Pix, boleto, transferencia e dinheiro, todos da mesma empresa. Cartao, cheque, permuta e entre empresas usam fluxo detalhado existente. Participacoes de titulos compartilhados exibidas como somente leitura nao sao selecionaveis. Um titulo compartilhado integral, se elegivel, continua sujeito ao escopo de todas as origens e aviso de efeito integral.
- Endpoints novos POST /solicitacoes/:id/titulos-financeiros/baixa-lote/preview e /confirmar. Preview so consulta e rollback. Confirmar revalida revisao, escopo e bloqueios, usa baixarTitulo canonico na mesma transacao para todos. Uma falha desfaz lote. Lock da solicitacao, titulos ordenados, chave e Historico persistidos impedem repeticao/concorrencia. Estorno posterior nao permite replay silencioso. Fila ativa bloqueia. Sem bypass de autorizacao, retorno, caixa ou integrações.

## Arquivos

FinanceiroCard.jsx; novo BaixaLoteSolicitacaoModal.jsx; services/financeiro.js; ListaAvancada.jsx; Solicitacoes/index.jsx; SolicitacaoController.js; TituloFinanceiroController.js; routes.js; tituloFinanceiroService.js; financialValidators.js; novos solicitacaoEncargosDomain.js e baixaLoteSolicitacaoService.js. Testes novos e mocks das suites de cartao/adiantamento atualizados para executar dependencias reais novas e dependencias anteriores ausentes no isolamento.

## Validacoes locais

Com preload backend/scripts/helpers/semRedeQa.js: validarEncargosSolicitacao.cjs (3), validarBaixaLoteSolicitacao.cjs (7), validarOrdenacaoDatasSolicitacoes.cjs, validarCartaoOpcionalSolicitacao.js, validarAdiantamentoFinanceiro.js, validarCompraDiretaFreteFinanceiro.js, validarCompraTitulosAdicionais.js, validarMedicaoFavorecidos.js, validarFilaBaixaComposta.js, validarFilaBaixaEstorno.js, validarFilaOperacionalSolicitacoes.cjs (6), validarCompraEtapasResumoPedido.js. Sem banco real.

Frontend validarFinanceiroSolicitacaoLoteUI.mjs: componente real no Edge headless, APIs simuladas com bloqueio de destinos inesperados. Campos/total/payload, principal preservado, ausencia de baixa sem permissao, selecao de 2 titulos, previa, confirmacao unica com clique duplo e visual mobile. Evidencias em outputs/financeiro-solicitacao-lote-20261030 (nao commitar outputs). Build Vite aprovado (avisos habituais de Browserslist/chunks).

Suite validarBloqueioRetornoObra.js possui falha estatica preexistente, conferida na base durante tarefa de historico e documentada naquele handoff; nao alterada nesta implementacao.

## Proximo passo

Revisar diff e publicar somente com autorizacao do usuario. Preparar aplicador DEV seletivo incluindo dependencies novas/rotas/controladores e regressao relevante; nao usar atualizador antigo de apenas um arquivo. Nenhuma operacao de baixa deve ser executada pelo agente. Homologar com usuario autorizado no DEV antes de promover main.

## Publicacao autorizada

Atualizador seletivo ops/deploy/atualizar-dev-financeiro-solicitacao-20261030.cjs com manifesto fechado e 11 testes de preservacao/retomada. Inclui 7 arquivos runtime, QA selecionado e nenhuma migration ou dado financeiro. Historico de propostas recuperadas nao faz parte deste commit.
