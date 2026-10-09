# Juros, multa e atualizacao da fila - 2026-10-08

## Estado e autorizacao

Implementacao local na refactor/frontend sobre b7964a95. Usuario solicitou
encargos separados na fila e na edicao do titulo, total sem falsa divergencia
e sincronizacao de valores para posterior aprovacao de divergencias.
Usuario autorizou commit/push na refactor/frontend e promocao para main.
Promocao isolada, sem DP 118209c0 e sem descartar hotfixes da main.
Publicacao main depende de confirmar backup/timer. Sem deploy executado,
acesso a banco real ou execucao de migration pelo agente.
Nao modificar outputs/ nem incorporar implantacoes DP numa promocao isolada.

## Mapeamento e alteracoes

- FinanceiroFilaPagamentos: colunas Juros (R$)/Multa (R$), total com saldo
  atual, payload separado e validacao. Atualizar reflete edicao do titulo sem
  substituir valor pago manual; campos bloqueados para baixados/read-only.
- FinanceiroTituloEditar: campos monetarios distintos, hidratacao, total
  previsto e envio. Guarda imediata contra submit duplo; bloqueios anteriores
  de titulo movimentado/fatura preservados.
- paymentValidators/financialValidators: aceitar apenas campos monetarios
  nao negativos nos endpoints existentes; omissao preserva os valores salvos.
- pagamentoFilaValoresDomain: calculo em centavos, limites DECIMAL, total e
  separacao desembolso/principal. Retencao integral pode gerar total zero na
  edicao, mas baixa exige principal positivo.
- pagamentoFilaSaldoService/tituloFinanceiroService: sincronizacao na mesma
  transacao com lock titulo -> fila, somente status ativos sem movimento.
  Preserva status, motivo, valor pago informado e comprovantes; audita encargos.
- pagamentoManualFilaService: usa saldo atual, grava encargos em colunas e
  principal/juros/multa no movimento. Aprovacao de divergencia usa os dados
  corrigidos sem criar segunda baixa. Reabertura apos parcial nao recopia os
  encargos configurados no titulo. Idempotencia, acesso e atomicidade mantidos.
- faturaCartaoFinanceiroService: total inclui encargos efetivos dos movimentos
  ativos de compras no credito. Cheque de terceiro usa o total desembolsado na
  baixa pela fila. Demais fluxos legados de cheque nao foram alterados.
- pagamentoAutorizacaoService: total/snapshot nao zerado inclui encargos;
  mudanca material invalida snapshot pendente. Zero omite campos novos e
  preserva os hashes antigos. Reprocessamento nao cria uma segunda fila.
- Models TituloFinanceiro/PagamentoManualFilaItem e migration estrutural
  202610080002: quatro colunas DECIMAL(14,2), NOT NULL, default zero,
  repetivel por verificacao de coluna. Sem DML, seeds ou backfill.
- Testes backend/UI e package scripts; README Financeiro e ownership.

Permissoes de edicao, baixa, resolver/aprovar divergencia e autorizacao digital
continuam existentes. Correcao de valor nao significa autorizacao automatica.
Historico de comprovantes nao muda. Relatorios ainda nao recebem novas colunas
visuais; dados ficam separados para a proxima evolucao solicitada.

## Validacoes executadas

- backend test:fila-juros-multa: validators, centavos, limite/zero,
  sincronizacao e migration simuladas; servicos reais com models simulados.
- backend test:fila-instrumentos: SQL, credito/fatura/debito/PIX/cheques,
  juros/multa, parcial, acima do saldo, edicao de divergente e autorizacao,
  replay e rollback; limites/permissoes/snapshots/decisoes obsoletas preservados.
- backend test:fila-comprovante-pendente: historico/anexos antes/depois da
  baixa, individual/importado, parcial/replay/rollback e reconciliacao isolada.
- backend test:autorizacao-proprietario: contrato legado/schema/hash/cache.
- frontend test:fila-instrumentos-ui: pagina real desktop/mobile, colunas
  separadas, total, Atualizar com mudanca de saldo ou apenas encargos,
  preservacao do valor pago manual, comprovantes e instrumentos anteriores.
- frontend test:titulo-juros-multa-ui: pagina real, valores/payload/total,
  hidratacao, readonly baixado, desktop/mobile.
- Build frontend e test:docs; git diff --check. Chrome local/localhost somente,
  sem APIs externas ou escrita em banco/S3. Avisos antigos de Browserslist e
  tamanho de chunks no build, sem erro de compilacao.

## Riscos e proximo passo exato

Publicacao autorizada pelo usuario. Revisar diff/ownership e testar dev
antes de producao. O backend atualizado exige aplicar a migration estrutural
ANTES de reiniciar o processo: os models passaram a selecionar as colunas.
Nao executar migration na producao sem autorizacao e backup conferido.
O down bloqueia rollback automatico para nao perder encargos registrados;
reverter codigo pode preservar as colunas extras, sem remove-las.

Teste manual dev: titulo base 200 + juros 10 + multa 3 -> total 213,
PIX/cartao/cheque -> uma baixa principal 200 e encargos 13. Divergente sem
baixa -> editar base/encargos -> Atualizar -> aprovar com justificativa ->
uma baixa apenas; guardar motivo e historico. Verificar cartao na fatura e
carteira de terceiro pelo total. Nao editar/reexecutar titulo ja baixado.
