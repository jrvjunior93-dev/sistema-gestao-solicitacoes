# Moeda brasileira nos valores dos cheques

Usuario homologou as datas7198d786 no DEV e pediu apenas formatar os campos
de valor neste fluxo. Agente unico, sem delegacao. Branch isolada na base
refactor/frontend719, sem backend, EC2/banco, migration, commit/push ou deploy.

## Mapeamento e implementacao

ChequesParceladosFilaModal e reutilizado pelos instrumentos individuais da
fila e pelo conjunto unico de cheques da baixa em massa. Valor alimenta soma
em centavos e payloadInstrumentoFila; cheque da carteira fornece seu proprio
valor e permanece somente leitura. Quantidade de cheques continua inteira.

Reutilizados formatCurrencyInput/normalizeCurrencyTyping/parseCurrencyInput
sem alterar formatadores globais. Campo textual BRL com teclado decimal e
selecao no foco para substituir valor. Estado guarda numero ou vazio, nunca
texto com R$/pontos/virgula. Sinal negativo preservado para a validacao positiva
existente, sem transformar entrada negativa em pagamento positivo.

Sem mudanca de somas, rateios, permissao, API, bloqueios ou datas. Carteira
continua imutavel; quantidade/reabertura/erro/retry seguem o fluxo homologado.
Skill frontend orientou reutilizar o padrao corporativo e manter a densidade.

## Validacao

QA da pagina real com APIs simuladas atualizado para entrada BRL: milhar,
centavos, vazio, negativo, formato apos falha/quantidade e payload numerico.
Regressao de datas e liquidacao em centavos aprovada; UI direcionada/completa
da fila passou em desktop/mobile: cheques proprios/carteira, conjuntos de lote,
preservacao em erro, retry/mutex, permissao negativa, anexos/colunas/paginacao.
Build aprovado com avisos preexistentes, docs584/19 e diff-check aprovados.
Nenhuma baixa real executada. Ownership desta tarefa liberado.

## Proximo passo

Delta local concluido e validado, sem publicacao. Commit/push/deploy DEV
dependem de pedido separado. Nao alterar main ou producao.

## Publicacao DEV autorizada posteriormente

Usuario autorizou commit/push para refactor/frontend e comandos exclusivos DEV.
Base7198d786 e main9e4faf4e conferidas; main permanece fora da tarefa. Agente
nao acessa EC2. Sem nova migration, backend, dependencia ou configuracao.

Reutilizar ops/deploy/atualizar-dev-datas-cheques-20261019.sh pinado no novo
commit. Roteiro confere identidade DEV/PM28001/watch, schema/12h/flags antes
do merge, preserva .env por hash, nao aplica DDL e reinicia apenas backend-dev.

Repetidos nesta publicacao: UI BRL/datas/payload desktop/mobile, build e testes
backend de datas/guardas/rateio/carteira. UI completa aprovada na implementacao.
Docs e diff-check conferidos antes do commit. Ownership liberado para publicar.

No DEV, aguardar frontend atualizado e reabrir a fila. Na baixa em massa por
cheque, conferir milhar/centavos (R$ 1.234,56), substituicao/limpeza e total;
cheque da carteira permanece somente leitura. Confirmar baixa de teste legitima
e conferir valor/rateio sem duplicidade. Erro/retry ja cobertos por API simulada.
