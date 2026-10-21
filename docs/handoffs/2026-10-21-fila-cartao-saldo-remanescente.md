# Quitacao do saldo por cartao na fila - 2026-10-21

## Escopo autorizado e diagnostico

Usuario autorizou implementar/testar na refactor/frontend, sem producao, a
quitacao do saldo por cartao6x preservando PIX, desconto, historico e protecoes.
Base publicada DEV5dbdd55a, implementacao neste checkout local. Sem commit/push
autorizado nesta etapa. Correcoes locais de permutas e outputs privados preservados.

Leitura fornecida pelo operador: TIT-010882 original40810, baixado4956,70 por
PIX ativo, saldo35853,30. Novo pagamento29000, desconto6853,30, compra20/10/2026,
seis parcelas. Antes do ajuste o teste reproduziu o bloqueio de baixa anterior
no resolver real da fila, mesmo com quitacao integral do saldo.

## Alteracoes

- `backend/src/services/pagamentoManualFilaService.js`: guarda de credito aceita
  baixa anterior somente quando existe parcelamento_cartao normalizado/validado.
  A configuracao ja seleciona o fluxo de compra/parcelas por movimento, sem
  vincular o valor original inteiro do titulo a uma fatura. A baixa simples
  continua exigindo principal igual ao saldo atual. Legado sem config, debito,
  pagamento parcial/excedente, conta divergente e demais travas nao sao liberados.
- `backend/scripts/validarCartaoParcelamentoBaixa.js`: integra novo teste e
  injeta baixa/estorno reais antes de carregar/desestruturar o servico da fila.
  O teste antigo de bloqueio de baixa anterior passa a representar o legado.
- `backend/scripts/validarFilaCartaoSaldoRemanescente.js`: fila, baixa, fatura,
  parcelas e estorno reais com modelos/transacoes exclusivamente em memoria.
- `frontend/scripts/validarCartaoParcelamentoUI.mjs`: cenario adicional na tela
  real com PIX/saldo/desconto, previa e envio6x, desktop/mobile e somente leitura.
  Nenhum componente/tela de producao foi alterado.
- README Financeiro e quatro controles workspace atualizados.

## Evidencias e validacoes

Positivo: gerar PIX4956,70 pelo servico real, depois baixar saldo35853,30 com
desconto6853,30/cartao29000. Titulo QUITADO, uma compra nova, seis faturas abertas
somando29000 (4833,34 +4833,34 +4x4833,33). PIX byte a byte inalterado, historico
anterior preservado e apenas novo evento de cartao acrescentado. Desconto separado
e ausente do total debitado no cartao. Replay nao duplica e nova chave nao baixa
a mesma linha encerrada novamente.

Estorno da compra nova preserva PIX, reabre saldo35853,30 e estorna somente suas
parcelas. Fatura paga impede esse estorno. Falha injetada na quarta parcela
reverte toda a compra nova, preservando PIX/fila/historico. Negativas sem efeito:
legado com baixa anterior, centavo a menos/a mais, desconto ausente, fatura
paga/fechada, bloqueio do proprietario, conta divergente, debito, forma sem
parcelamento, titulo cancelado, data e quantidade invalidas.

ACL exercitada no middleware/authorizationService/rota reais, com configuracao
e transporte isolados: sem sessao401, sem permissao403, somente visualizar403;
operador USUARIO/FINANCEIRO com `financeiro.fila_pagamentos.baixar` conclui a
mesma baixa sem SUPERADMIN. Nao foi alterada a arquitetura de autorizacao da
fila nem seu uso interno do servico de titulos.

Comandos aprovados, sem DB/API externos:

- `node backend/scripts/validarCartaoParcelamentoBaixa.js` (inclui teste novo).
- `node backend/scripts/validarFilaCartaoSaldoRemanescente.js` isolado.
- `validarFilaPrevisaoCartao.js`, `validarCartaoOpcionalSolicitacao.js`,
  `validarBloqueioProprietario.js`, `validarFilaLiquidacaoRateada.js`,
  `validarFilaBaixaComposta.js`, `validarCarteiraChequesBaixaComposta.js`,
  `validarFilaEstornoPermissao.js` em backend/scripts.
- Em frontend: `node scripts/validarCartaoParcelamentoUI.mjs`, telas reais1366/390.
  Previa sem escrita, total29000, centavos corretos, payload desconto/cartao6x,
  PIX inalterado e ausencia de acao para somente leitura. Inclui regressoes
  do modal de titulo, multiplos cartoes, duplo clique/retry e datas UTC/BR/NZ.
  A primeira execucao a partir da raiz falhou na geometria por resolucao relativa
  do Tailwind; executado novamente no diretorio frontend e aprovado, sem alterar UI.
- Node --check dos tres JS backend e QA frontend; git diff --check.

- Em frontend: `npm run build` aprovado,631 modulos,13,32s. Avisos existentes
  de Browserslist desatualizado e chunks maiores500kB, sem erro de compilacao.
- Em backend: `npm run test:docs` aprovado,590 Markdown/19 canonicos.

Ownership liberado e controles workspace atualizados; implementacao local concluida.

## Limites e proximo passo

Sem EC2, banco real, migration, dependencias, .env, PM2, S3, main ou producao.
Sem alteracao de valores reais ou regularizacao automatica. Evidencias de UI
ficam em outputs privados. Sem implementacao NSDocs nesta tarefa.

Proximo passo: apos autorizacao de commit/push, publicar somente o delta deste
ajuste em refactor/frontend, preparar roteiro DEV de backend (o roteiro anterior
de lista unica e exclusivo de UI e nao serve para esta mudanca), e operador
homologar na EC2 DEV com titulo de teste equivalente. Nao repetir baixa no
titulo real em producao para testar. Promocao para main exige nova autorizacao.

## Publicacao DEV autorizada posteriormente

Em21/10 usuario autorizou commit/push e incluiu as demais correcoes pendentes.
Pacote inclui este ajuste e JOIN Obras do relatorio de permutas, seus testes e
documentacao. Exclui outputs privados e diagnosticos sem implementacao (forma
prevista em Contas a Receber e integracao NSDocs).

Novo roteiro: ops/deploy/atualizar-dev-saldo-cartao-permutas-20261021.sh.
Base minima instalada93f75, SHA alvo completo publicado, merge ff-only,
checkout limpo, lock, PM2 online/8001/sem watch, identidadeDEV/UUID/schema/sessao.
Dep/migrations devem ser iguais a base; somente os dois servicos autorizados
podem mudar no runtime backend. Teste de guardas em validarDeploySaldoCartaoPermutasDev.js.
Sem npm install/ci, DDL, .env ou flags alteradas. Regressao financeira em memoria
e consultas/EXPLAIN permutas MySQL READ ONLY antes do restart somente backend-dev.
Novo preflight depois do restart e health8001. Operador executa, agente nao acessa.

Homologacao: na filaDEV usar titulo equivalente, com PIX4956,70 ativo e saldo
35853,30; cartao credito, desconto6853,30, pago29000, compra correta e6 parcelas.
Conferir previa/baixa/historico, PIX preservado e faturas somando somente29000.
No relatorio de permutas, consultar sem datas, depois datas/tipo/situacao,
inclusive operador sem permissao de relatorio (acesso negado). Nao repetir
baixa real na producao. A amostra MySQL vazia nao comprova casos ausentes.

Fechamento da publicacao: testes financeiros/cartao/SQL/ACL e guardas do novo
roteiro repetidos e aprovados; UI1366/390 repetida com cenario PIX/desconto/6x,
build, Node/Bash, docs590/19 e diff aprovados. Ownership liberado. Warnings
preexistentes de Browserslist/chunks e SQLite experimental nao impediram testes.
