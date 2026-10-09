# Medicao mais recente governa status e setor da solicitacao

## Pedido e escopo

Usuario autorizou implementar a precedencia da medicao mais recentemente
registrada, mantendo os status ja existentes. Caso observado em DEV:
SOL-1978/ID2011, CT-0003; medicao 2 pendente em GEO, mas solicitacao ainda
ENVIADO PARA PAGAMENTO por causa da medicao 1.

Checkout: C:/Fluxy-refactor-frontend, branch refactor/frontend, base 6e2e859f.
Implementacao local apenas: sem commit/push, deploy, migration ou banco real.
outputs/ nao pertence a esta entrega. Nenhuma alteracao de DP ou main.

## Impactos e implementacao

- medicaoAtualContratoService.js: identifica a ultima medicao por numero/ID
  (nao periodo, vencimento ou data da baixa), parcelas ativas e titulos que
  podem movimentar o ciclo. Preserva alocacoes de renegociacao e compatibilidade
  com vinculos legados sem evento de medicao. Consultas transacionais correntes.
- medicaoContratoService.js: nova medicao pendente vence filas antigas;
  aprovacao libera seus titulos sem devolver a solicitacao a Obra quando ha
  outra medicao mais recente. O status operacional considera somente titulos
  da medicao atual. PAGA ainda exige encerramento financeiro do contrato inteiro.
- analiseProprietarioService.js: analise/rejeicao/revogacao de titulo antigo
  mantem o estado interno do titulo e sua auditoria, sem tomar o status atual.
- pagamentoManualFilaService.js e solicitacaoFinanceiroStatusService.js:
  envio direto/digital da medicao atual registra Financeiro e retorna a Obra;
  envio antigo registra participacao financeira no historico, sem alterar o
  status ou area responsavel. Evento ENVIADA_SETOR descreve o envio DOS TITULOS
  antigos e traz fluxo_atual_preservado=true, nao uma transferencia do ciclo.
  Baixa/estorno de contrato com eventos de medicao nao movimenta o setor:
  o retorno ocorre na aprovacao/enfileiramento, nao novamente no pagamento.
- tituloContratoReconService.js: reconciliacao opt-in pode preencher vinculo
  legado antigo, mas nao sincroniza a solicitacao a partir de medicao anterior.
  Conferencias anteriores precisam ser refeitas para uma nova assinatura.
- README de Contratos e testes offline atualizados. Nenhum endpoint, permissao,
  schema, configuracao de status, valor ou instrumento de pagamento criado.
- ModalMedicao.jsx: somente textos da confirmacao/sucesso/rodape; aprovacao
  antiga nao promete devolver a solicitacao a Obra. Skill frontend-design,
  referencia ux-writing, aplicada para comunicar o resultado sem redesign,
  mudanca de permissao, endpoints, loading, confirmacao ou cliques.

## Status preservados

- Registro: NEC. DE MEDICAO e GEO.
- Aprovacao: LIBERADO; retorna a Obra se for a medicao atual.
- Proprietario: EM ANALISE DO PROPRIETARIO, com a acentuacao existente no codigo.
- Rejeicao: AGUARDANDO AJUSTE.
- Fila: ENVIADO PARA PAGAMENTO; Financeiro registrado, solicitacao devolvida a Obra.
- Fim do ciclo sem encerramento total: NEC. DE MEDICAO; PAGA so com todas as
  medicoes quitadas e nenhuma parcela positiva por medir (regra anterior mantida).

## Validacao e proximo passo

Servicos reais exercitados com models/biometria em memoria, sem banco/rede:
registro da segunda medicao com primeira em fila; aprovacao antiga/atual;
analise, rejeicao e envio direto/digital antigo; lote misto e replay; baixa
antiga durante analise atual; quitacao integral; reconciliacao conservadora e
predicados reais de visibilidade do Financeiro. Fronteira de calculo/validacao
de parcelas isolada no teste do orquestrador de registro.

Regressoes aprovadas:

- backend: test:medicao-recarga-envio, test:fila-juros-multa,
  test:fila-instrumentos, test:fila-comprovante-pendente;
- validarVinculosTitulosContrato, validarAcompanhamentoGeoCompras,
  validarAcessoAnexosSolicitacoes, validarAprovacaoExclusivaContrato,
  validarRetornoContratoAprovadoObra, validarGestaoContratosOperacional,
  validarPedidoCompraFinanceiroGeo e validarDocumentacao;
- frontend: test:medicao-recarga-envio-ui em desktop/mobile e build;
- node --check dos 10 arquivos JS de backend envolvidos e git diff --check.

Teste de UI executado com Chrome instalado via PLAYWRIGHT_EXECUTABLE_PATH;
a primeira tentativa com outro nome de variavel falhou por browser Playwright
nao instalado, e a execucao correta passou (antes e depois do ajuste dos textos).
Build mantem avisos de Browserslist desatualizado e chunk acima de 500 kB.
Nenhum arquivo gerado rastreado mudou. Ownership liberado; codigo nao publicado.

Testes nao substituem concorrencia/isolamento MySQL real. Locks adicionais
podem exigir repeticao de transacao abortada pelo MySQL em disputa; nenhuma
operacao deve ser reaplicada fora dos caminhos idempotentes existentes.

Proximo passo: apos autorizacao de commit/push, publicar apenas em DEV e testar
SOL-1978 com duas medicoes. Aprovar/enviar a mais recente deve mudar o ciclo;
reprocessar/pagar a anterior nao deve mudar o ciclo nem duplicar fila.
Nao executar backfill, reconciliacao com escrita ou promocao main sem novo pedido.
Deploy nao corrige registros silenciosamente: status sera recalculado nas
operacoes do fluxo; nunca numa leitura da solicitacao.

## Publicacao DEV autorizada - 09/10/2026

Usuario autorizou commit/push na refactor/frontend e comandos da EC2 DEV.
Base local/remota conferida em 6e2e859f9b52dc937431ad63d23cf98add9bbfd8,
sem commits divergentes. Origin/main em a06bdfdc8348736ccbab04c234fb13f81f19cf9f
somente consultada; nao promover este pacote ou as implantacoes DP adiadas.
Revisao do diff funcional e exclusao de outputs/ conferidas.

Deploy deve fixar o SHA publicado, exigir fast-forward na refactor/frontend,
PM2 backend-dev no checkout DEV e RDS staging distinto da producao
(HOST+PORT+DB_NAME; os dois ambientes usam o mesmo nome de banco).
Preflight de schema somente leitura: nenhuma migration nova desta tarefa;
se houver pendencias, interromper antes de reiniciar. Nao incluir reconciliacao
com escrita, nao reprocessar baixas nem pedir nova autorizacao de titulo ja
enfileirado. Frontend DEV depende do deploy da Vercel.
O agente nao executou deploy, acesso ao RDS, migration ou escrita de dados.
Revalidacoes antes do commit: test:medicao-recarga-envio,
validarVinculosTitulosContrato, test:fila-comprovante-pendente,
documentacao e git diff --check aprovados. UI/build ja aprovados no mesmo
codigo funcional. Reserva documental encerrada; ownership liberado.
