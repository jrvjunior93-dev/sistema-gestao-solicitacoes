# Fila: local, baixa em massa, rolagem e comprovantes

## Escopo e estado

Implementacao na refactor/frontend, sem commit/push/promocao/deploy ou acesso
ao banco real nesta tarefa. Base df39348f80f39e4a8909a5d0efb577027ba93130.
Usuario confirmou o nome do arquivo do caso observado: SOL-6278.pdf.
Nao e possivel confirmar a origem desse arquivo em producao pelo print.

## Alteracoes

- FinanceiroFilaPagamentos: coluna local, selecao explicita e total, baixa em
  massa em Pendentes/Todos somente para elegiveis. Preserva autorizacao granular,
  envio atomico/idempotente, cheques/cartoes/contas e comprovantes opcionais.
- useRolagemModal: snapshot dos scrollports do disparador + janela, restauracao
  apos montagem/desmontagem do modal de arquivos e devolucao de foco, sem mudar
  OverlayModal/ModalPortal globais.
- pagamentoManualFilaService: leitura de encargos atuais do titulo nas filas
  pendentes ainda nao baixadas, excluindo repeticao apos parcial e preservando
  snapshots de baixas/divergencias. Edicao do titulo mantem sincronizacao existente.
- tituloFinanceiroService: remove include duplicado de fila antes de incluir
  comprovantes. A consolidacao do Sequelize preservava where de ativos, mesmo
  com o segundo include sem where. Inclui documentos VINCULADO/nao excluidos
  da solicitacao, apos validar permissao e escopo da solicitacao.
- ComprovantesTituloSolicitacao: coluna real do FinanceiroCard lista comprovantes
  da fila e arquivos da solicitacao com origem explicita. Downloads seguem
  endpoint autorizado da fila ou presign existente; nao cria vinculos arbitrarios.

## Validacao

- validarComprovantesTitulosSolicitacao: funcao real em VM, consolidacao real do
  ORM, alias unico, baixados, leitura operacional e negativa de permissao/escopo.
- validarFilaJurosMulta e validarFilaComprovantePendente: centavos, encargos,
  snapshot, parcial, lote com rollback/replay, anexos/historico e remocao.
- validarFilaInstrumentosUI: pagina/componentes reais, servicos isolados;
  selecao parcial/todos elegiveis, total saldo+juros+multa, duplo clique,
  local e rolagem vertical/horizontal ao fechar/Esc, 1366px e 390px.
- validarComprovantesTituloSolicitacao: renderer real da coluna, principal/
  adicionais, deduplicacao, prefixo Solicitação, argumentos do download.
- Build, diff/sintaxe, acesso de solicitacao pela fila e remocao segura de anexos
  aprovados. Revalidar antes de eventual publicacao.
- Capturas em outputs/ (nao versionar). Nao houve teste em dispositivos fisicos.

## Conferencia de producao (proximo passo)

Depois de publicar/disponibilizar o script no checkout correto, somente leitura:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend
node scripts/conferirComprovantesSolicitacao.js --somente-leitura --solicitacao=SOL-6278 --arquivo=SOL-6278.pdf
```

Mostra vinculos principal/adicional da fila, importacao de comprovantes vinculada
a solicitacao e metadados seletivos de auditoria. Nao mostra URLs/segredos, nao
reconcilia nem altera registros. Leitura de PDF armazenada ajuda a distinguir
importacao pela fila, mas nao prova selecao automatica vs manual de um titulo.
Se arquivo nao aparecer, conferir nome real nos arquivos e abrangencia da origem
antes de associar manualmente. Nao inferir titulo a partir de valor extraido do nome.

## Riscos e promocao

Sem migration nova ou backfill. Backend e frontend precisam acompanhar o ajuste.
Nao executar npm audit fix/force como parte deste trabalho. Preservar exclusao
de Pessoal/DP na main se usuario pedir promocao isolada; este pacote nao altera DP.
Na baixa, se os dados mudarem entre leitura e envio, backend continua validando
saldo/status/instrumento sob lock e reverte o lote em qualquer falha.
