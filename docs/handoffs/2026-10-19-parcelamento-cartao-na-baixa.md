# Parcelamento do cartao na baixa

## Autorizacao e limites

Usuario aprovou implementar na base refactor/frontend, em fila e detalhe do
titulo, com previa ampla. Base remota conferida: 4ffdb9ae. Desenvolvimento no
worktree isolado desta conversa; nenhuma promocao main, publicacao, EC2,
configuracao ou banco real acessado. Sem alteracao automatica da SOL-6104.

## Implementacao

- Nova migration 202610190001_cartao_parcelamento_baixa.js, modelo
  CartaoBaixaParcela e associacoes: uma baixa/um movimento, varias alocacoes de
  fatura. Sem duplicar titulos nem despesas. Legado preservado, sem backfill.
- cartaoParcelamentoDomain/Service: entrada estrita, divisao em centavos,
  revalidacao sob lock, idempotencia de movimento e rollback/estorno integral.
  tituloFinanceiroService e validadores aceitam parcelamento_cartao opcional.
  Respeita a configuracao que desabilita parcelas na forma efetiva. Alteracao
  de fechamento/vencimento desde a consulta exige atualizar e reconferir,
  em vez de lancar em outra fatura silenciosamente.
- faturaCartaoFinanceiroService soma parcelas ativas sem repetir principal,
  lista parcelas por titulo/numero e paga somente a fatura. Calendario em UTC
  e meses ancorados no dia 1, inclusive fechamento em 29/30/31 e fevereiro.
- Fila: domain, validador, pagamentoManualFilaService e liquidacao rateada
  transportam configuracoes independentes de cada cartao. Chave da baixa por
  item/componente e derivada da chave idempotente da fila, nunca de autoria
  fornecida pelo navegador. ACL/grupo/credito integral existentes preservados.
- Frontend ParcelamentoCartaoCampos reutiliza DateInputBR segmentado e
  OverlayModal 1200px: consulta apenas; campos ficam na fila/registro de baixa.
  Compartilhado por InstrumentoPagamentoFila, CartoesRateadosFilaModal e
  FinanceiroTituloDetalhe. Rascunho guarda data/quantidade e dias do calendario
  consultado, sem DTOs/credenciais.
- BaixaMassaFilaModal mantem metadados na normalizacao do lote e oferece a
  previa comum/de cada cartao. Agregacao mensal soma parcelas dos titulos,
  reproduzindo o rateio backend (100 casos comparados), inclusive centavos.
- FaturaCartaoDetalhe identifica parcelas; detalhe do titulo mostra as faturas
  e o estado das alocacoes, inclusive estornadas. Cartao de debito nao parcela.

## Arquivos e validacoes

Arquivos principais: backend/migrations/202610190001_cartao_parcelamento_baixa.js;
backend/src/models/{CartaoBaixaParcela,MovimentoFinanceiro,index}.js;
backend/src/services/{cartaoParcelamentoDomain,cartaoParcelamentoService,
tituloFinanceiroService,faturaCartaoFinanceiroService,pagamentoFilaInstrumentoDomain,
pagamentoFilaLiquidacaoService,pagamentoManualFilaService}.js;
backend/src/validators/{financialValidators,paymentValidators}.js;
frontend/src/components/financeiro/{ParcelamentoCartaoCampos,InstrumentoPagamentoFila,
CartoesRateadosFilaModal}.jsx; frontend/src/pages/{FinanceiroTituloDetalhe,
FinanceiroFilaPagamentos,FinanceiroFaturaCartaoDetalhe}.jsx;
frontend/src/navigation/filaWorkspaceDraft.js; frontend/src/utils/parcelamentoCartao.mjs;
scripts de QA e manifests npm; README financeiro e inventario de datas.
Inclui tambem BaixaMassaFilaModal.jsx, para evitar descarte silencioso do
parcelamento ao confirmar os instrumentos do lote.

- Novas suites backend/UI: 1 titulo/1 movimento/6 faturas; centavos; juros,
  multa/desconto; parcial no detalhe e restricao integral da fila; dois cartoes
  com parcelas diferentes; repetir requisicao sem duplicar; fatura paga;
  pagamento de fatura sem baixar titulo novamente; estorno; rollback no meio
  das parcelas; ACL/escopo/debito/status; migration repetivel sem dados.
- UI real desktop/mobile, previa sem chamadas de escrita, modal sobreposto ao
  registro de baixa, Escape/retorno mantendo campos, 60 parcelas com rodape
  acessivel, duplo clique e retry usando a mesma chave, usuario somente leitura.
- Regressao aprovada de instrumentos, previsao/desvinculacao de fatura, cartao
  opcional, liquidacao rateada, intercompany, multiplas fontes/permuta/carteira,
  detalhe com rascunho e janela de fila. Build aprovado; warnings preexistentes
  de browserslist/chunk grande, sem atualizacao de dependencias.
- Evidencias locais em outputs/cartao-parcelamento-baixa-20261019, fora do Git.

## Riscos e proximo passo exato

Schema nao aplicado. Testes locais/inventario e revisao de diff concluidos; nao
publicar outputs ou ownership/auditoria privada preexistente. Quando o usuario
pedir commit/push, publicar somente este pacote na refactor/frontend, depois
fornecer roteiro DEV fixado em SHA e autorizando somente a nova migration,
com backup/identidade/PM2/flags preservados. Nao reutilizar cegamente roteiro
anterior que foi preparado sem migrations novas. Nunca acessar EC2 pelo agente.

No DEV, operador deve aplicar schema, conferir MySQL real e criar titulo de
teste: registrar compra em 6x, conferir soma das seis faturas, pagar uma fatura
e confirmar protecao do estorno; repetir com dois cartoes e encargos. Efetuar
essa homologacao somente em dados de teste, sem mexer nos titulos de producao.

Validacao final: suite ampla da fila real aprovada (650 titulos, 13 paginas,
8 cards/status, selecao/anexos/rolagem/estorno/colunas desktop e mobile).
Fixture antiga recebeu fechamento/vencimento nos cartoes simulados; nenhuma
asserção foi removida. Mapa deterministico: 1834 fontes, 2289 conversoes, zero
erros de parser. Build, suites novas, navegacao, documentacao e diff-check OK.
Implementacao local encerrada, sem execucao de migration.

## Publicacao DEV autorizada

Usuario autorizou commit/push e comandos de atualizacao DEV com migration e
validacao MySQL. Sem acesso EC2 pelo agente. Branch remota refactor/frontend
conferida ainda em 4ffdb9ae antes da publicacao; checkout de trabalho isolado
em codex/fila-multiplas-fontes-20261018. Nao mover/resetar outros worktrees.

- Novo roteiro `ops/deploy/atualizar-dev-cartao-parcelamento-20261019.sh` recebe
  SHA completo e --backup-dev-conferido. Checa identidade anterior e flags,
  permite fast-forward, instala lockfile/testa, aplica apenas a migration nova,
  verifica schema/SQL e reinicia somente backend-dev sem --update-env.
- Novo helper `backend/scripts/aplicarMigrationCartaoParcelamentoDev.js` usa
  allowlist de uma migration e o runner estrutural existente; outra pendencia
  interrompe, idem flag global de migration ligada ou identidade diferente.
  Reusa guardas de sessao/PILOT e restaura autorizacao temporaria ao terminar.
- Novo `backend/scripts/verificarCartaoParcelamentoMySqlDev.js` somente leitura
  em conexao separada: identidade UUID, schema/indices/FKs, SELECT/EXPLAIN reais,
  consistencia de valores/quantidade/status/referencias com rollback final.
  Nao executado contra MySQL nesta conversa: sera executado pelo operador DEV.
- Novo teste `backend/scripts/validarDeployCartaoParcelamentoDev.js`: fixtures
  com identidade/ambiente/watch incorretos, outras migrations, repeticao, falha
  DDL, limpeza da flag, leitura vazia/com amostra, erro SQL e rollback.

Roteiro recusa outras pendencias e conserva .env, PILOT, sessao 12h e processos
alheios ao DEV. Backup DEV deve estar conferido antes de passar o argumento.
DDL MySQL nao e transacional: se houver falha, nao executar down nem remover
colunas/dados; guardar erro e repetir somente apos conferir causa. Migration
e idempotente; preflight tolera exclusivamente ela pendente em nova tentativa.
Nao testar SOL-6104 de producao. Titulos de teste DEV para 6x, dois cartoes,
centavos, repeticao, fatura paga e bloqueio do estorno. Repetir verificacao
MySQL apos esses testes. Frontend segue deploy da branch pela Vercel.

Validacoes repetidas para publicacao: suites novas backend e UI real desktop/
mobile; multiplas fontes; instrumentos/previsao/desvinculacao; cartao opcional;
permissoes de rotas; teste do roteiro/guardas/MySQL com fixtures; mapa de datas,
build frontend, documentacao, sintaxe Bash e git diff --check aprovados. MySQL
real, migration e reinicio DEV serao feitos exclusivamente pelo operador.
