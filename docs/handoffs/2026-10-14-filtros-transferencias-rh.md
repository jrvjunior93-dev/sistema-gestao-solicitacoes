# Filtros nas transferencias RH - 14/10/2026

## Pedido e estado

Usuario pediu filtros em Transferencias entre obras, especialmente Situacao.
Implementado localmente no worktree promocao-dp-main-20261014/Fluxy, branch
codex/rhdp-pagamento50-transferencia-dp-20261014. Preservados os ajustes locais
de pagamento50/DP automatico/saida de colaborador do handoff anterior.
Sem commit, push, banco real, migration, .env, alteracao de permissao ou EC2.

## Mudanca

- BarraFiltros padrao, compacta, com Situacao multipla: Aberta (aguardando
  aprovacao), Rascunho, Aprovada, Rejeitada e Cancelada. Vazio mostra todas.
- Origem e Destino de valor unico, incluindo centros de custo do catalogo
  ativo existente. Busca por nome/matricula com debounce de 300ms.
- Etiquetas removiveis/limpeza, retorno a pagina1 ao mudar recorte; paginacao,
  Atualizar/polling conservam filtros. Estado em workspace sem guardar DTOs.
  Revisao de consulta descarta respostas anteriores a mudanca de filtro.
- Servico aplica filtros antes de contar/paginar, com validacao de situacoes
  e IDs. Clausulas Sequelize, sem interpolacao SQL de entrada. Busca escapa
  curingas; JOIN belongsTo para buscar nome/matricula sem subquery de limite.
- Escopo de leitura e local aberto sempre continuam em AND com os filtros;
  consulta nao amplia acesso, responsabilidade ou permissao de decisao.
  Acao de ler notificacoes mantem o escopo global/local anterior, independente
  do filtro visual. Nenhuma alteracao nos botoes/fluxos de aprovacao nesta tarefa.
- Frontend e backend devem ser publicados juntos; API anterior ignora os
  novos parametros. Nenhuma migration.

## Arquivos desta tarefa

- frontend/src/pages/RhDpTransferencias.jsx
- backend/src/services/rhTransferenciaService.js
- frontend/scripts/validarRhPessoalTransferencias.mjs
- backend/scripts/validarRhPessoalFluxo.js
- docs/modulos/rh-dp/README.md
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

Esses arquivos tambem contem edicoes do pedido anterior ainda nao commitado.
Nao excluir/reverter esse trabalho. outputs/ nao deve integrar o release.

## Validacoes

- validarRhPessoalFluxo.js --transferencias: 43 registros simulados, filtros
  antes da paginacao, multiplas situacoes, busca/matricula, origem/destino,
  escopo OBRA, DP global, local fixo, limpar, IDs/situacoes invalidas, entrada
  hostil tratada como dado; regras de transferencia anteriores preservadas.
- validarEscopoRhDpUsuarioObra.js e validarSegurancaAcessoDireto.js aprovados.
- validarRhPessoalTransferencias.mjs: componente real desktop1366/mobile390,
  situacoes multiplas, etiquetas, paginacao, Atualizar, origens/destinos,
  limpeza/busca, resposta obsoleta ignorada e retorno de aba com recorte mantido;
  fluxo de solicitacao/DP automatico/negativas anteriores aprovado.
- npm run build e npm run test:navegacao (frontend); npm run test:docs (backend);
  node --check do service e git diff --check.
- Screenshots em outputs/rh-pessoal-transferencias/filtros-{1366,390}.png.
  Build conserva avisos preexistentes de Browserslist/chunks grandes.
  Testes funcionais isolados, sem banco/rede externa.

## Proximo passo

Somente quando usuario pedir commit/push: conferir referencias remotas,
integrar estes arquivos junto com os ajustes pendentes do handoff
2026-10-14-pagamento50-transferencia-dp.md, excluindo outputs/ e alteracoes de
caixa em outro worktree. Reexecutar validacoes, publicar refactor/frontend
e fornecer comandos EC2 dev (backend-dev), sem executar deploy pelo agente.
Producao exige homologacao e autorizacao propria. Ownership liberado.

Publicacao de todas as pendencias RH/DP autorizada pelo usuario, a partir de
origin/refactor/frontend e4ab208f. Testes de filtros/ACL/transferencias reais na
UI desktop/mobile, pagamento/previa/exclusao, regressao, build/navegacao/docs
repetidos e aprovados. Sem migration nova, main ou EC2. outputs/ excluido do
commit; Treinamento publicado preservado e caixa de outro worktree nao incluida.
