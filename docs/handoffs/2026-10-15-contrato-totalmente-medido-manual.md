# Contrato totalmente medido manual - 2026-10-15

## Autorizacao / ownership

Agente unico; reserva registrada no ownership. Usuario confirmou marcador manual
GEO, novo/legado, mesmo com saldo; retirar da lista operacional da Obra e impedir
novas medicoes; reversao por GEO com motivo e auditoria. Preservar todo financeiro.
Sem commit/push/deploy/EC2/banco real/migration aplicada nesta etapa.

## Plano / invariantes

- Marcador administrativo distinto de status_contrato, ativo e rescisao. Nunca
  gerar medicao ficticia, consumir saldo, baixar/cancelar/excluir titulo/parcela.
- GEO autorizado a editar contratos e SUPERADMIN, respeitando escopo/modulo.
  Backend manda; controle de revisao, lock/transacao e replay sem nova auditoria.
- Guardas para criacao de medicao no fluxo novo e legado, inclusive API/formulario
  antigo; reprogramacao nao deve contornar o marcador. Eventos anteriores seguem
  consultaveis/processaveis com as permissoes existentes.
- UI compacta/reutilizavel, motivo visivel, confirmacao com alvo fixado e mutex.
  Obra deixa de receber o contrato na lista operacional, GEO mantem consulta e
  reversao. Historicos e referencias de registros anteriores nao desaparecem.
- Migration somente estrutural nullable, sem seeds/backfills. Testar isolado e
  homologar em dev pelo operador antes de publicar/producao.

## Implementado localmente

- Coluna JSON nullable contratos.medicao_encerramento, com estado/revisao/autor/
  data/motivo. Migration 202610150003_contrato_medicao_encerramento.js somente
  estrutural e idempotente, sem default/seed/backfill; nao aplicada.
- Service/controller/GET/POST especificos com modulo/sessao/escopo, permissao
  existente de editar contratos + GEO ou SUPERADMIN. Sem novos grants.
- Lock do contrato, revisao e estado desejado em vez de toggle; repeticao imediata
  nao duplica, pedido anterior a reversao nao pode remarcar. SecurityEventLog
  obrigatorio na mesma transacao; recibo permanente em LogExclusao com entidade
  propria e solicitacao_id nulo, sem criar autoria/interacao da solicitacao.
- Listas operacionais CRIACAO/OBRA ignoram marcador; consulta global e historica
  preservada. Resumo projeta Totalmente medido manual e guarda classificacao
  calculada; valores medidos/movimentados/saldos continuam reais e intactos.
- Criacao nova valida sob lock antes de gravar evento. Legado revalida sob lock
  na transacao que cria a solicitacao, inclusive rateio/distribuicao. Previa e
  criacao bloqueiam marcador; mesma ordem de locks contrato->parcelas. Medicoes
  anteriores continuam com seus fluxos de aprovacao/revisao/pagamento.
- Reprogramacao bloqueada sob lock; listagem de parcelas informa contrato e linhas
  nao mediveis sem alterar editabilidade financeira. UI explica o bloqueio sem
  afirmar falsamente que uma parcela sem medicao ja foi medida.
- Componente reutilizavel na gestao e solicitacao (novo/legado), motivo em campo,
  confirmacao com alvo fixado, mutex e reversao/historico dos 50 ultimos eventos.
  Nao faz POST ao abrir/fechar, nao aplica sucesso otimista ou concede permissao.
- Patch de fixture em validarSolicitacaoFavorecidosIntegracao inclui o callback
  real da nova guarda; testes de favorecidos/rollback continuam reais e isolados.

## Validacoes

- Novo backend: GEO/edicao/SUPERADMIN, negativas de papel/escopo/campos, motivos,
  marcar/desfazer novo/legado, financeiro intacto, GET sem escrita, auditoria e
  rollback de falha da auditoria/historico; duas chamadas simultaneas, replay e
  pedido obsoleto. Listas index/resumo reais, criacao legada real revalidada na
  transacao, registro/previa novos, reprogramacao negada e resumo com saldo real.
- Migration exercitada em queryInterface em memoria: nullable, nenhuma escrita
  de dados, reaplicacao sem nova coluna e down nao destrutivo.
- UI real em navegador com APIs simuladas: desktop1366/mobile390, motivo, Voltar,
  marcar/desfazer/historico, clique duplo, negativas, erro sem falso sucesso,
  troca de contrato durante GET e confirmacao, sem overflow. Capturas em outputs/
  (nao versionadas); mobile inspecionado visualmente. Skill frontend-design
  aplicada ao controle compacto e ao campo/confirmacao consistentes do sistema.
- Regressoes aprovadas: saldo/reprogramacao backend/UI, vigencia cadastral
  backend/UI, vigencia de aditivo, permissao de contratos, aprovacao exclusiva,
  retorno do aprovado para Obra, favorecidos/medicao, medicao mais recente e seu
  envio financeiro, cadastro de Obra, criacao com favorecidos, edicao de dados,
  seguranca direta (2304 comparacoes/48 rotas), sintaxe/diff e docs.
- validarFluxosPixApropriacoesSolicitacao falha na assercao textual da linha135,
  buscando Boolean(formaPagamentoSelecionada) && !pagamentoViaBoleto no arquivo
  NovaSolicitacao. Assinatura ja ausente no HEAD/base; NovaSolicitacao sem diff
  desta tarefa. Nao alterar teste/fluxo Pix fora de escopo para mascarar a falha.
- UI antiga de vigencia repetida com PLAYWRIGHT_EXECUTABLE_PATH do Chrome
  instalado; o Chromium empacotado nao esta instalado. Nenhuma dependencia mudou.
- Build/navegacao aprovados; avisos preexistentes de Browserslist/chunk grande e
  trinco de ModuloRelatorios. SQL/schema real sera homologado em dev pelo usuario.

## Proximo passo / limites

Verificacoes finais aprovadas e ownership liberado. Nao commitado/publicado;
sem banco real/EC2/PM2/S3 ou migration executada. Publicar apenas com nova
autorizacao do usuario e entregar comandos DEV com allowlist desta migration;
nunca usar os scripts antigos que bloqueiam migrations diferentes. Homologar
marcar/desfazer, negativas GEO/OBRA/escopo, formulario ja aberto, saldo positivo
e titulo com baixa antes de qualquer promocao para main. Outros checkouts e
outputs/ preexistentes preservados.

## Retomada para publicacao em DEV - 16/10/2026

Usuario confirmou incluir contratos no pacote de promocao, mas somente apos
publicar e testar em DEV. Main ainda nao foi alterada. Preparar um commit
isolado deste delta e integra-lo sobre refactor/frontend 67c985e6, preservando
os cinco pacotes ja publicados. Repetir validacoes no resultado integrado.
Revisao de auditoria: SecurityEventLog complementado por LogExclusao permanente,
sem Historico da solicitacao, pois autoria/setor ali podem ampliar visibilidade.
GET mantem escopo e ultimos 50 recibos, inclusive apos retencao de security logs;
recibo e estado sao atomicos e falha de auditoria desfaz toda a operacao.
Teste do marcador repetido e aprovado; sem dados reais ou DDL executado.

## Integracao atual validada e entrega DEV

- Commit do delta antigo 0f32dc92 preservado no worktree de origem; cherry-pick
  individual b66a5e9b integrado sobre 67c985e6. Sem conflito funcional; ownership
  documental conciliado preservando ambos os lados. Nenhum reset/stash/descarte.
- Revisao adicional rejeita body null/array/texto com 400, sem escrita. Recibos
  independem da retencao dos logs, nao criam Historico e falha desfaz tudo.
- Novos aplicarMigrationContratoMedicaoDev.js e teste isolado, com mesmo guard
  de identidade UUID/host/banco, PM2 backend-dev/porta 8001, flags preservadas,
  allowlist exclusiva 202610150003 e retomada sem repeticao. Script
  ops/deploy/atualizar-dev-contratos-medicao-20261016.sh confere checkout/branch,
  ancestral 67c985e6/mutex, instala deps, testa, aplica somente a migration,
  verifica sessao 12h, reinicia somente backend-dev e confere health 8001.
  ALLOW_SCHEMA_MIGRATIONS transitorio, sem mudar .env. Backup DEV deve estar
  conferido pelo operador antes de executar. Nao executar wrappers antigos.
- Validacoes integradas aprovadas: marcador/ACL/escopo/replay/rollback/schema,
  guard de deploy/negativas de producao e outras migrations, favorecidos,
  saldo/reprogramacao, vigencia, aprovacao exclusiva, retorno a Obra, medicao/
  fila/comprovantes, titulos compartilhados, performance/relatorio DP,
  seguranca direta (2304 comparacoes/48 rotas), UI real do marcador e saldo
  desktop/mobile, permissoes de Contratos, build (607 modulos), navegacao,
  sintaxe/Bash, docs e diff. Screenshots inspecionados, outputs fora do Git.
- Skill frontend-design: controle corporativo compacto/reutilizavel, motivo e
  confirmacao; nenhuma reforma visual nem sucesso financeiro otimista.

## Promocao completa aguardando homologacao

Usuario pediu TODOS os ajustes pendentes e confirmou backup de producao no
Drive cifrado/timer ativo. Depois escolheu incluir contratos somente apos
publicar e testar em DEV. Portanto nao promover main nesta etapa.
Refs observadas: main=7e1015abf376afddde8d62b1e590271746881355,
refactor=67c985e61ff5418726099a13b574b99f55375588 antes desta entrega.
Cinco pacotes publicados pendentes: performance/paginacao/polling, titulos
compartilhados, documentos RH/sessao 12h, previsao/desvinculacao de cartao,
rolagem/paginas. Contratos e o sexto pacote agora entregue para homologacao.
Preservar commits exclusivos da main, inclusive protecao PILOT do deploy.
Antes do merge main, obter inventario SOMENTE LEITURA do banco/processo reais
de producao, SHA do checkout e migrations pendentes contra alvo congelado.
Possiveis migrations do pacote: 202610150003_contrato_medicao_encerramento.js e
202610160001_titulos_compartilhados.js; nao assumir que ambas estao pendentes
sem a consulta real. Guard futuro exclusivo producao/porta 8000, preservar
PAYMENT_OWNER_APPROVAL_MODE e configurar JWT12h somente no seu fluxo autorizado.
Main/EC2/bancos reais/PM2/S3 nao foram alterados pelo agente.
