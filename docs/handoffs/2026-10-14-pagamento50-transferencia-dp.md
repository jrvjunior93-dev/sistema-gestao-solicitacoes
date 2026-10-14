# Pagamento 50% e transferencias de pessoal - 14/10/2026

## Escopo e estado

Implementacao local na branch `codex/rhdp-pagamento50-transferencia-dp-20261014`,
base `origin/refactor/frontend` 1b9101df. Sem commit/push/promocao main/deploy,
migration, banco real, mudanca de usuario/permissoes/.env ou reinicio EC2.
O usuario autorizou os tres ajustes abaixo. Nao incluiu a tarefa de caixa que
esta em outro worktree. `outputs/` contem evidencias locais e nao e release.

## Regras implementadas

- Pagamento independente por solicitacao: 50% do salario base para mensalista,
  no individual, todos do local e grupo selecionado. Acrescimos/descontos
  entram integralmente; diarista conserva diaria x dias. Flag `parcela_50` no
  JSON, exclusiva de 40/60, retirada ao escolher 100%. Nao cria esquema
  automatico mensal 50/50, nao altera jornada legada nem pagamentos gerados.
  Conferencias legadas sem a flag conservam significado de false.
- UI reutiliza a tabela/toolbar/modal existente e guarda 50% no workspace.
  Backend antigo que ignora 50% no PUT bloqueia o envio financeiro na tela.
- DP com autorizacao de abrir solicitacao de pessoal pode pedir transferencia
  global entre obras/centros ativos, com efetivacao imediata como SUPERADMIN.
  A regra e calculada pelo servidor; nao cria responsabilidades ficticias.
  Auditoria identifica a excecao administrativa. Usuario operacional OBRA
  que acumule DP conserva escopo estrito e aprovacao da outra obra.
- Saida de colaborador da obra vinculada admite qualquer destino ativo,
  inclusive centro de custo sem vinculo do solicitante. Aprova responsavel ou
  substituto vigente do destino, DP ou SUPERADMIN. Entrada de outra obra para
  obra vinculada continua com aprovacao da origem. Terceiros->terceiros e negado.
  Origem vinculada prevalece ao determinar o lado solicitante, inclusive se
  o solicitante tambem e responsavel apenas pelo destino. Autor nao aprova seu
  pedido pendente. Automatica anterior de responsavel pelas duas obras preservada.
- Vigencia na aprovacao, justificativa, historico, transacao/locks, controles
  de admissao/vinculo/inatividade, duplicacao e replay preservados.

## Caso relatado do Savio

Imagem mostrava destinos com `sem vinculo de solicitacao`. O usuario esclareceu
a regra desejada, sem identificar colaborador/origem/destino. No codigo-base,
a habilitacao de todos os destinos ja existia quando a origem estava vinculada.
Nao foi provada a causa especifica no registro/sessao de producao. Ajustou-se
a prioridade do lado solicitante e adicionou-se orientacao explicita no modal.
Testes isolados demonstram saida para todos os destinos ativos, entrada para
local proprio e negativa para dois locais de terceiros. Nao houve liberacao
global para usuario de OBRA nem alteracao dos vinculos do Savio.

## Arquivos

- backend/src/services/rhPagamentoSolicitacaoDomain.js
- backend/src/services/rhPagamentoSolicitacaoService.js
- backend/src/services/rhTransferenciaService.js
- backend/scripts/validarRhPagamentoSolicitacao.js
- backend/scripts/validarRhPessoalFluxo.js
- frontend/src/components/rh/RhDpPagamentoModal.jsx
- frontend/src/navigation/rhPagamentoWorkspaceDraft.js
- frontend/src/pages/RhDpTransferencias.jsx
- frontend/src/styles/rh-pagamento-solicitacao.css
- frontend/scripts/validarRhPagamento50UI.mjs (novo)
- frontend/scripts/validarRhPessoalTransferencias.mjs
- docs/modulos/rh-dp/README.md e docs/workspace/OWNERSHIP_ATIVO.md

## Validacoes locais

Sem banco/S3/rede externa nos testes funcionais:

- validarRhPagamentoSolicitacao.js: calculo/centavos/negativas50%, tres modos,
  conferencia legada sem flag, titulos50% com valores corretos, envio simultaneo,
  historico financeiro anterior intacto, idempotencia e rollback.
- validarRhPessoalFluxo.js --transferencias: saida com apenas um vinculo para
  obra/centro, aprovacao destino/DP/SUPERADMIN, entrada preservada, terceiros
  negados, autor negado, DP automatico sem responsabilidades, flag adulterada
  ignorada, OBRA+DP estrito, admissao futura e rollback administrativo.
- validarRhPagamentoEnvioParcial.js e validarRhPessoalPorSolicitacao.js.
- validarEscopoRhDpUsuarioObra.js, validarSegurancaAcessoDireto.js,
  validarRhLotacaoCadastro.js, validarRhConsultaSalario.js, validarRhTicketPix.js.
- validarRhPagamento50UI.mjs: modal real individual/todos/selecionados, desktop
  e mobile, exclusividade, ajuste monetario, diarista, payload/envio e bloqueio
  com backend antigo.
- validarRhPagamentoSolicitacaoUI.mjs: fluxo existente completo, workspace,
  autosave, moeda, reembolsos, conferencia, parcial e revisao.
- validarRhPessoalTransferencias.mjs: tela real, destino fora do vinculo,
  entrada restrita, DP automatico, privacidade e escritorio/mobile.
- npm run build, npm run test:navegacao (frontend), npm run test:docs (backend),
  node --check dos services e git diff --check.

Avisos conhecidos: Browserslist desatualizado e chunks >500kB preexistentes.
O script legado `validarRhPessoalFluxo.js` sem flag nao completa Jornada:
seu mock VM nao disponibiliza `crypto` requerido pelo service. O problema de
fixture ja existe no HEAD-base; nao foi alterado o service legado para contornar.
O modo focado `--transferencias` passou, e Pessoal por Solicitacao passou em
seu script proprio. Nao interpretar o teste parcial como aprovacao de toda Jornada.

## Proximo passo exato

Se usuario pedir publicacao: conferir refs remotas e eventual mudanca concorrente
em refactor/frontend; integrar somente arquivos acima/handoff, excluindo outputs/
e caixa de outro worktree; executar novamente testes focados/diff/build, commitar
e fazer push para refactor/frontend. Frontend e backend precisam ser atualizados
juntos na homologacao (PM2 backend-dev). Fornecer comandos sem executar EC2.
Validar em dev os casos reais, incluindo colaborador atualmente lotado no local
do solicitante, antes de qualquer promocao main/producao. Nao precisa migration.

Ownership liberado apos validacao e handoff; mudancas locais preservadas.

## Publicacao autorizada

Usuario autorizou publicar todas as pendencias RH/DP desta conversa na
refactor/frontend, incluindo filtros e previa/exclusao dos outros dois handoffs.
Base remota e4ab208f, com Treinamento ja publicado e preservado. Validacoes
backend, UI desktop/mobile, pagamentos existentes/workspace, transferencias,
escopo, treinamento, build/navegacao/docs e diff repetidas e aprovadas. Sem
nova migration, dados reais, main ou EC2. Apenas outputs/ fica fora deste release;
caixa de outro worktree continua fora do escopo. Ownership liberado.
