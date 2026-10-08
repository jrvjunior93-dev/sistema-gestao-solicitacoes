# Edicao da vigencia na Gestao de Contratos

- Sessao: codex-contrato-vigencia-2026-10-08.
- Pedido: permitir editar a vigencia do contrato na gestao ligada a Solicitacoes.
- Estado: implementado e validado localmente; commit e push na refactor/frontend
  autorizados pelo usuario em 08/10/2026. Deploy dev sera executado pelo usuario.

## Entrega

Selecionar o contrato > Editar > Inicio/Fim da vigencia > Salvar contrato.
Campos reutilizam DateInputBR e exibem as datas existentes. Datas invalidas ou
incompletas e periodo invertido impedem envio. O modal preserva a permissao atual e
possui bloqueio sincrono contra duplo clique. Datas inalteradas nao entram no PATCH.

O backend aceita datas ISO/null, preserva campos omitidos e valida o periodo contra
o contrato recarregado com bloqueio UPDATE na transacao. Mudanca concorrente de obra
retorna 409 para nova conferencia de acesso. O historico da solicitacao vinculada
registra autor, antes e depois na mesma transacao; retry identico nao duplica esse
evento. Contratos legados sem solicitacao mantem a auditoria geral da rota.

Nao cria aditivo nem altera cronograma, parcelas, medicoes, titulos ou pagamentos.
Datas ausentes sao permitidas; limpar campo remove a data. Correcao cadastral pode
encurtar o periodo, desde que o fim nao preceda o inicio; prorrogacao formal continua
no fluxo existente de aditivos. Nao requer migration.

## Arquivos

- frontend/src/pages/GestaoContratos.jsx
- backend/src/controllers/ContratoController.js
- backend/src/validators/operationalValidators.js
- backend/src/services/contratoVigenciaEdicao.js
- backend/scripts/validarContratoVigenciaEdicao.js
- frontend/scripts/validarContratoVigenciaEdicao.mjs
- docs/modulos/contratos/README.md e registros de colaboracao.

## Validacoes executadas

- Sintaxe dos arquivos backend e git diff --check: aprovados.
- validarContratoVigenciaEdicao.js: controller/validator reais, persistencia e
  transacao simuladas; datas impossiveis, ano bissexto, PATCH parcial, legado,
  permissao negada, obra fora do escopo, 404, concorrencia, historico e rollback.
- validarContratoVigenciaEdicao.mjs: pagina, componentes, permissoes e servicos
  reais no Chrome headless, HTTP/sessao simulados e rede externa bloqueada.
  Carregamento, texto parcial/invalido, intervalo invertido, duplo clique, reabertura,
  nenhuma alteracao, omissao de datas inalteradas, limpeza e usuario somente leitura.
  Tela em 1366x768 e campo acessivel em 390x844.
- validarContratoAditivoVigencia.js, validarGestaoContratosOperacional.js,
  validarPermissoesContratosRotas.js e validarPermissoesContratos.mjs: aprovados.
- Build via node node_modules/vite/bin/vite.js build na pasta frontend: aprovado.
  Invocado diretamente para evitar geracao em arquivos compartilhados pelo prebuild.
  Avisos existentes de Browserslist desatualizado e bundle acima de 500 kB.
- npm run test:docs: aprovado.

## Limites e proximo passo

Nenhum banco real nem EC2 foi acessado. Validacao transacional usou doubles, nao um
MySQL real. Proximo passo: apos publicacao autorizada, homologar a edicao de um
contrato e conferir datas/historico e preservacao dos registros financeiros.

Outro agente atuou em autorizacao/fila de pagamentos no mesmo checkout; seus
arquivos nao foram editados. routes.js e package.json tambem ficaram fora do escopo.
Durante a tarefa, HEAD avancou por trabalho externo; apenas os arquivos listados
acima integram o commit desta entrega. Ownership liberado ao concluir a revisao.
