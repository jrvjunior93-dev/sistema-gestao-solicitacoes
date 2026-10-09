# Comprovantes da fila no historico - 2026-10-08

## Estado e autorizacao

Implementacao local na refactor/frontend, sobre 39786800. Usuario pediu
comprovantes dos titulos baixados no historico e autorizou preparar a
reconciliacao dos antigos e depois autorizou commit/push na refactor/frontend
e promocao isolada para main. Pediu comandos para conferencia somente leitura
primeiro; nao executar escrita em producao antes de revisar o resultado.
Sem migration, deploy EC2 executado pelo agente ou acesso a banco real.
Outputs preservados fora do Git; DP e frontend nao foram alterados.

## Causa e impactos

A fila guardava PDFs em pagamentos_manuais_fila e sua tabela de comprovantes,
mas baixarTitulo registrava somente o evento da baixa. Os uploads individual
e importado nao criavam Anexo/Historico da solicitacao.

- pagamentoFilaHistoricoService: planejamento SELECT-only e registro
  transacional de Anexo COMPROVANTE/Historico COMPROVANTE_ADICIONADO.
  Reutiliza o objeto S3; metadata tem anexo, fila, titulo e movimento.
  Leituras correntes impedem snapshot antigo do MySQL; replay deduplica
  hash/URL e respeita registros antigos e soft delete/remocao legada.
- pagamentoManualFilaService: vinculo apos baixa regular/parcial,
  aprovacao de divergencia, upload tardio e repeticao idempotente.
- pagamentoComprovantePdfService: mesmo vinculo na importacao tardia.
- pagamentoFilaHistoricoReconService e reconciliarHistoricoComprovantesFila:
  conferencia sem escrita, reparo separado com IDs/assinatura/superadmin/
  opt-in e auditoria na mesma transacao. Lock de titulos antes de fila.
- Testes existentes ampliados; mocks de outros testes recebem a fronteira
  nova sem carregar models/S3 reais. README Financeiro e ownership atualizados.

Nao cria nova baixa, upload ou movimento ao vincular; nao muda saldos,
status ou instrumentos/faturas. Falha no historico reverte a operacao
transacional. S3 continua fora da transacao, como antes (upload descartado
em falha pode deixar objeto sem referencia; nao apagar automaticamente).
Rotas/permissoes/presign/timeline/remocao existentes sao reutilizados.
Nao amplia acesso aos arquivos. Titulo manual sem solicitacao nao recebe
um vinculo inventado. Nenhuma migration.

## Validacoes

- test:fila-comprovante-pendente: servicos/helper reais, mocks DB/S3/PDF;
  baixa com PDF anterior, upload posterior individual/importado, total,
  parcial e divergencia autorizada; replay, concorrencia simulada, rollback
  da baixa/upload, soft delete/remocao legada e titulo sem solicitacao.
  Conferencia sem writes, opt-in, IDs duplicados, assinatura divergente,
  superadmin ativo, mudanca concorrente e auditoria atomica/replay do reparo.
- test:fila-instrumentos: SQL MySQL isolado, cartao/fatura/debito/PIX/cheques,
  autorizacao/convergencia/permissoes/replay/rollback.
- test:anexos-remocao e test:anexos-acesso: fluxo existente preservado.
- Syntax check dos novos scripts/servicos, diff check e test:docs.

## Proximo passo exato

Homologar no dev, incluindo visualizar/download do PDF no historico.
Publicacao autorizada; manter commit isolado sem DP (118209c0).
Base remota main conferida: 9358a692. Backup/timer requerem confirmacao
atual antes da publicacao. Validar novamente no resultado da integracao.
Origem publicada: b7964a95611b0b9ab1c7d5792f664dd2b1424f8d. Integracao
isolada por cherry-pick sobre 9358a692, sem conflitos. Usuario confirmou
backup conferido no Drive cifrado e timer ativo. Bundle da base verificado
fora da EC2: outputs/main-pre-fila-historico-20261008-9358a692.bundle.
Testes de comprovantes/instrumentos/remocao/acesso/documentacao e build
aprovados novamente. Frontend, migrations, package.json e codigo RH_DP
preservados iguais a main anterior. Publicar por fast-forward, sem merge
integral da refactor. Nenhuma reconciliacao executada pelo agente.
Depois de o codigo estar no ambiente alvo, conferir os antigos:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend
node scripts/reconciliarHistoricoComprovantesFila.js --somente-leitura
```

Usar --apos=CURSOR para o proximo lote ou --fila-ids=1,2 para recorte
explicito. Conferir solicitacao, titulo, movimento, arquivo e situacao.
IDs/assinatura correspondem ao recorte exato; nao fornecer comando de
aplicacao ate revisar o resultado e obter autorizacao para escrita.
Antes de aplicar: backup conferido/timer ativo e janela sem operacoes
concorrentes; aplicar recorte pequeno, conferir novamente. Nunca executar
SQL direto, popular dados de teste ou chamar a reconciliacao no deploy.
