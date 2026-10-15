# Promocao das pendencias homologadas para main - 2026-10-15

## Ownership temporario e autorizacao

- Agente unico desta conversa, sem delegacao. Reserva: integracao dos seis commits
  `d72a9c93..10c58364`, este handoff, registro de ownership, script exclusivo de
  producao e seu teste isolado. Sem alteracoes funcionais adicionais.
- Usuario autorizou promocao, confirmou todos os ajustes aprovados em dev e backup
  recente conferido no Drive cifrado com timer ativo nesta promocao.
- EC2 confirmou main em `8ecde6ff73e160e245b9c128e67ac8659d3ea8e1`, UUID
  `5ed4b970-009f-11f1-809c-0ad0e0c90c53`, banco `gestao_solicitacoes`.
- Inventario corrigido na raiz Git: 269 migrations no alvo; somente pendentes
  `202610150001_cartoes_recarga_saldo.js` e
  `202610150002_comprovante_compartilhado_fila.js`.
- Primeiro inventario retornou vazio por pathspec relativo incorreto em backend;
  foi descartado, corrigido com `git -C ..` e repetido pelo usuario.

## Preservacao e plano

- Integracao criada de origin/main, nunca substituicao do seu historico.
- Refactor congelada em `10c583645037695ff3e8d8ea327497d9b24f6190`.
- Referencia remota de recuperacao `backup/main-pre-pendencias-20261015-8ecde6ff`.
- Tag local de mesmo nome e bundle completo fora da EC2, verificado com
  `git bundle verify`: `outputs/main-8ecde6ff-pre-pendencias-20261015.bundle`.
  SHA256: `8F0CC2AEBCB4150EC66137C9A0BE0E644032382C9F838717533C64731A7BFC27`.
- Nao executar EC2, migrations, seeds, backfills ou reinicios pelo agente.
- Revisar merge, testar regras backend/ACL, build e navegacao frontend e docs.
- Preparar script de producao com allowlist exclusiva das duas migrations,
  identidade/PM2/porta/flags, esquema antes/depois e health exclusivo em 8000.
- Rollback de codigo para 8ecde6ff e artefato Vercel anterior, sem down/restore
  automatico; preservar auditoria, pagamentos e anexos ja criados.

## Integracao e verificacao

- Merge de historicos, com quatro conflitos somente documentais no workspace;
  ambos os lados preservados. Nenhum arquivo de producao removido.
- Runtime backend/src e frontend/src, manifestos/lockfiles e configuracoes iguais
  aos da refactor homologada; scripts exclusivos de main mantidos. Dois testes
  receberam automaticamente os adaptadores isolados exclusivos de main.
- Saldo: tres colunas nullable de prestacao e tabela/indices de ajustes auditados.
  Sem reescrever prestacoes antigas, seed, backfill ou novas FKs.
- Comprovantes: primeiro indice unico por fila/hash, depois indices de consulta
  e retirada da unicidade global de hash. Sem apagar arquivos/vinculos/baixas.
  Reexecucao estrutural segura; nao restaurar unicidade global em rollback.
- Bundle na estacao do operador, nao afirmar envio deste bundle ao Drive.

## Validacoes locais aprovadas

- CompraDiretaGestao, CompraDiretaFreteFinanceiro, CompraDiretaGeoAcesso,
  RhAdmissaoCatalogo, FinanceiroObrasComprometido, AdiantamentoFinanceiro,
  MedicaoRecargaFluxoPagamento e RecargasMultiplosCartoes.
- RecargaRegularizacao, SaldoCartaoSchemaLimiteDp, RhPagamentoSolicitacao,
  RhPagamentoEnvioParcial, RhPessoalPorSolicitacao, EscopoRhDpUsuarioObra.
- FilaComprovantePendente, ComprovantesPdfFila, FilaPagamentosManuais,
  SegurancaAcessoDireto (2304 comparacoes/48 rotas), AcessoAnexosSolicitacoes,
  FilaPagamentoSolicitacaoAcesso e ComprovanteCompartilhadoSchema.
- DeployPendenciasProducao: blocos reais em VM, identidade/host/UUID/porta/PM2,
  negativa dev, flags preservadas/defaults, migrations estritamente permitidas,
  ambas/uma/nenhuma pendente, erro/retomada, restauracao da flag e health.
- Regressao dos deploys anteriores CompraDiretaAdmissaoProducao,
  DpComprovanteCompartilhadoDev e SaldoCartoesDev.
- Frontend: build e navegacao/abas, UI real RhPagamentoSolicitacao (inclui gestao
  DP e fechamento somente leitura), FilaInstrumentos (inclui comprovante em lote),
  SaldoCartoes e RecargaRegularizacao, todos com APIs simuladas desktop/mobile.
- UI de saldo/regularizacao repetida com Chrome instalado apos detectar ausencia
  do Chromium empacotado do Playwright; sem alterar codigo/dependencias.
- Bash -n do script PROD, sintaxe Node, docs (542 Markdown/19 canonicos),
  git diff --check. Avisos preexistentes de Browserslist e chunk >500kB no build.

## Operacao e limites

- Script: ops/deploy/atualizar-prod-pendencias-20261015.sh.
- npm ci, testes isolados, guarda de checkout/ancestrais/PM2/porta/flags/banco,
  allowlist das duas migrations reais, assert de schema, restart exclusivo PROD
  e health8000; mutex contra execucao simultanea. Dev8001 intocado.
- Qualquer pendencia diferente bloqueia antes de executar migrations/restart.
  Falha de DDL exige diagnostico: MySQL pode ter aplicado parte da estrutura.
  Nao marcar migrations manualmente nem executar down para contornar falha.
- Sem alteracao de .env, flags, seeds/backfills, permissoes concedidas ou dados
  de negocio pelo deploy. A mudanca funcional ocorre apenas no uso autorizado.
- Homologacao real em dev e inventario real de producao fornecidos pelo usuario;
  agente nao acessou banco real, EC2, PM2, S3 ou Vercel para alterar estado.

## Estado e proximo passo

Integracao validada, ownership liberado para publicar branch/PR e merge normal
autorizado. Conferir SHA/tree remotos antes de entregar comandos fixados ao
operador. EC2 e migrations ainda nao executadas pelo agente.
Depois do backend saudavel, conferir Vercel Production/Ready no mesmo SHA e
smokes de frete, saldo/regularizacao GEO, cancelamento DP e comprovante em lote,
preservando as permissoes e visibilidade atuais. Nao executar baixas reais para
testar sem autorizacao propria. Rollback somente de codigo/artefato, sem down.
