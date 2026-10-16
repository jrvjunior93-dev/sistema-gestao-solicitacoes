# Desvincular previsao de cartao antes de corrigir titulos

## Autorizacao e estado

Usuario autorizou implementar opcao segura para desvincular titulos das faturas
antes da baixa, permitir corrigir valores/parcelamento e preservar historico,
sem alterar producao. Implementacao local sobre a0fcbbbe, worktree
`C:/Users/Ricardo/.codex/worktrees/performance-fila-dp-20261015/Fluxy`, branch
existente `codex/rhdp-movimentacoes-documentos-cat-20261016`.

Delta anterior da forma efetiva na fila preservado. Sem commit/push, deploy,
EC2, .env, PM2, migrations aplicadas, rede externa ou dados reais. Main intacta.
Nao foi executada correcao real da SOL-6104. Outputs QA fora do Git.

## Implementado

- Acao **Desvincular previsao de cartao** no detalhe do titulo, com motivo,
  confirmacao e explicacao do recalculo automatico. Sem baixa otimista.
  Mesma permissao `financeiro.titulos.editar`, ACL canonica e bloqueios de origem.
- POST `/financeiro/titulos/:id/desvincular-fatura`: body estrito com motivo,
  fatura esperada e idempotency_key. Rate limit/validacao numerica/CSRF/sessao
  conservam middlewares existentes. Servico tambem exige editar.
- Lock do titulo antes da leitura/ACL e replay. Revalidacao de status/saldo,
  fila ativa, autorizacao pendente/autorizada, intent bancario, fatura aberta
  sem pagamento/conciliacao, movimentos ativos e consistencia do vinculo.
- Compartilhados, renegociados, RH/DP, adiantamentos e recargas ficam em seus
  fluxos especializados. Bloqueios de retorno da Obra tambem permanecem.
- Remove apenas o vinculo previsto, limpa cartao/fatura do titulo e recalcula
  fatura na mesma transacao da auditoria. Preserva outros titulos e fatura
  zerada. Nao muda vencimento, valor, saldo, status, parcelas ou pagamentos.
- Auditoria duravel em LogExclusao, entidade TITULO_DESVINCULACAO_FATURA e
  solicitacao_id nulo. Registra autor/motivo/antes/depois/hash/chave. Nao criar
  Historico da solicitacao: autoria/interacao ali poderia ampliar visibilidade.
- SecurityEventLog complementa a trilha. Leitura da auditoria existente do
  titulo agrega recibos duraveis, sem duplicar eventos e sem depender da
  retencao de 90 dias de logs. Cap de 50 eventos/listagem preservado.
  Auditoria continua com sua permissao propria. Nao expoe total de outros
  titulos da fatura. Replay usa recibo duravel e revalida ACL/autor/hash.
- Modal mantem motivo/chave entre abas e apos erro, bloqueia duplo clique,
  nao permite fechar durante gravacao e reconsulta detalhe apos sucesso.
  Edicao existente avisa para desvincular pelo detalhe antes de corrigir valor.

## Arquivos

Novos backend: tituloDesvincularFaturaService, Controller, Validator,
AuditoriaService e validarTituloDesvincularFatura.js. Atualizados routes.js,
financeiroRotaPermissoesService.js, tituloFinanceiroService.js (leitura/rotulo
da auditoria), pagamentoFilaPrevisaoCartaoService.js (nucleo interno reutilizavel)
e package.json. Fixture validarFilaPrevisaoCartao.js exporta harness sem executar
main quando importada. Nenhuma migration/model/coluna nova.

Frontend: novo DesvincularFaturaTitulo.jsx, servico financeiro.js,
FinanceiroTituloDetalhe.jsx, FinanceiroTituloEditar.jsx, package.json,
validarTituloDetalheWorkspace.mjs e tituloDesvincularFaturaQA.mjs.
README canonico Financeiro e ownership atualizados.

## Validacoes locais

- test:titulo-desvincular-fatura: fila/titulo/fatura/desvinculacao reais com
  modelos em memoria. Valor editavel pela edicao canonica depois de desvincular;
  nenhum movimento; outros titulos da fatura preservados; fatura zerada mantida.
  Negativas de ACL/permissao/origem/pagamento/baixa/fila/autorizacao/vinculo stale.
  Payload estrito; rollback de recalculo, recibo e auditoria; replay/autor/hash;
  recibo preservado e visivel apos limpeza de logs; sem duplicacao de auditoria.
- Duas chamadas serializadas no harness simulam ordem dos locks. Nao e prova
  de concorrencia MySQL real; essa homologacao ainda deve ocorrer em DEV.
- test:fila-previsao-cartao, test:fila-instrumentos,
  validarFilaLiquidacaoRateada.js, validarFilaBaixaEstorno.js,
  test:titulos-compartilhados e test:performance-fila-dp aprovados.
- validarPermissoesFinanceiroRota.js: 75 rotas mapeadas, negar por padrao.
- UI real 1366/390: motivo, Escape/cancelar sem escrita, rascunho entre abas,
  duplo clique, negativa de permissao/baixa, erro e retry com mesma chave.
  validarTituloDetalheWorkspace completo tambem preserva baixa, correcao,
  cobranca, saldo/permissao atuais, 403, contexto e protecao contra replay.
  Screenshots inspecionados em outputs/titulo-detalhe-workspace/.
- Build frontend, sintaxe backend, test:docs e git diff --check aprovados.
  Avisos preexistentes de Browserslist/chunk grande, sem erros de compilacao.
  QA de detalhe usa CSS do dist: executar build e depois o teste, nao em
  paralelo (uma tentativa inicial foi interrompida pela troca dos hashes CSS).
- Skill frontend-design aplicada com estilo operacional compacto, labels
  explicitos e confirmacao para mudanca financeira. Sem reforma de layout.

## Como usar depois de publicar/homologar em DEV

1. Abrir detalhe do TIT-009687. Sem baixa e com fatura 79 ainda aberta/sem
   pagamento, clicar Desvincular previsao de cartao, informar motivo e confirmar.
   Fatura e recalculada automaticamente; nenhum pagamento e registrado.
2. Repetir no TIT-009688/fatura 80. Se o estado tiver mudado, parar e conferir:
   a verificacao antiga de producao nao comprova a situacao atual.
3. Para corrigir apenas valor/vencimento, usar Editar titulo apos desvincular.
   Para trocar 2 parcelas por outra distribuicao, excluir logicamente os dois
   lancamentos incorretos pelo fluxo existente, com permissao de excluir, e
   gerar novamente a distribuicao correta na solicitacao, com permissao de criar.
   Nao gerar outros mantendo a divida antiga ativa nem baixar para liberar edicao.
4. Na SOL-6104, objetivo conhecido: 10062,00 no cartao 1756 em 6 x 1677,00 e
   9157,50 restantes. A desvinculacao NAO altera esses valores automaticamente.
   Usuario confirmou conta 37 e restante por cartao; cartao/parcelas/data do
   restante e data efetiva da primeira compra ainda precisam ser conferidos.
5. Compra efetiva em cartao tem baixa do fornecedor conforme regra existente;
   fatura do cartao continua sendo paga no seu fluxo, sem baixa duplicada.

## Proximo passo e limites

Homologar transacoes/concorrencia reais em DEV com fixtures descartaveis; nao
executar diretamente nos titulos de producao. Acao individual, nao reparcelamento
automatico nem cancelamento/substituicao atomica de toda a solicitacao.
Exclusao/geracao conservam seus fluxos/permissoes; nao foram reescritos.

Se usuario autorizar commit/push, revisar/publicar os dois deltas pendentes
(forma efetiva da fila + desvinculacao) na refactor/frontend e entregar comandos
DEV com gates de processo/banco/UUID atuais. Nao publicar em main nem executar
EC2 pelo agente. Este delta nao exige migration nova.

Ownership da implementacao liberado; homologacao/publicacao pendentes.

## Publicacao autorizada em 16/10/2026

Usuario solicitou commit/push conjunto desta opcao e da forma efetiva na fila
para refactor/frontend. Remote conferido na base a0fcbbbe, sem divergencia.
Repetidos testes novos, instrumentos/autorizacao, baixas/estorno/rateio,
titulos compartilhados, performance/paginacao/relatorio DP, 75 rotas,
guard de deploy DEV, sintaxe, documentacao e build frontend com sucesso.
UI do detalhe completa desktop/mobile tambem aprovada nesta revisao.
UI completa da fila e teste direcionado previsao para PIX tambem aprovados;
650 titulos/13 paginas/8 recortes e selecoes preservadas. Uma tentativa do teste
direcionado coincidiu com a porta 5308 ocupada pelo teste completo; rerun serial
aprovado, sem alterar codigo nem encerrar processos de terceiros.
Comandos entregues devem fixar o commit publicado e conferir ambiente/schema
e sessao 12h com configurarSessao12hDev.js --verificar em leitura antes/depois
do restart exclusivo backend-dev. Nao aplicar migrations automaticamente.
Se o guard recusar, parar e enviar a saida; nao remover as protecoes.
Nenhuma operacao de producao ou correcao da SOL-6104 foi executada.
