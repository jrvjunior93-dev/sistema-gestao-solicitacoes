# Compras: paginacao SQL e detalhes sob demanda - 27/10/2026

## Escopo e autorizacao

Usuario autorizou implementar/testar localmente a paginacao no banco e detalhes
sob demanda, preservando permissoes/filtros, sem EC2, producao ou registros
reais. Worktree gerenciado compras-paginacao-local-20261027/Fluxy, branch
codex/compras-paginacao-local-20261027, base46ac88de88957ffc15e8b0db45dfcd6eed7bc34e.
Sem commit/push/deploy/migration/install. Dependencias locais reutilizadas por
junction; nao alterar arquivos de node_modules ou checkouts de origem.

Usuario confirmou que o rascunho SC650 salvou apos a correcao OOM anterior.
Isso valida aquela operacao, sem garantir ausencia definitiva de outras causas
de OOM. Esta implementacao NAO foi aplicada em producao.

## Mapeamento e implementacao

- SolicitacaoCompraController.index tinha lista completa e filtros de
  acompanhamento posteriores ao findAll. Busca/status eram aplicados no
  navegador. Novo ramo opt-in page/limit usa servico
  solicitacoesCompraPaginacao.js; parametros invalidos retornam400.
- Permanece a montagem anterior de escopo por setor/usuario, revisao GEO,
  diretoria, origem e obras. Predicado de acompanhamento de Compras e
  traduzido para SQL ANTES de paginar; testes comparam conjuntos permitidos
  com as funcoes REAIS da versao anterior em perfis distintos.
- Buscar codigo SC com zeros e IDs maiores que5digitos, obra/codigo,
  solicitante, status multiplos/sinonimos/desconhecidos e obra antes do COUNT.
  INSTR trata percentuais/underscore/aspas como texto. SQL parametrizado pelo
  Sequelize; nao aceita nomes de coluna/SQL do cliente.
- DTO com campos de lista e quatro belongsTo leves; sem colecoes/observacoes/
  dados de pagamento. Contagens agregadas somente para IDs da pagina. As
  facetas de status seguem o escopo autorizado da obra, nao apenas a pagina.
- Tela chama listarPaginaSolicitacoesCompra (contrato validado), hook com
  serializacao/cancelamento, debounce e identidade da consulta, Paginacao do
  padrao e paginaLocal0 na TabelaPadrao. Nenhuma mudanca visual global.
- Acoes de abrir/PDF/encaminhar/inativar mantem permissoes/endpoints/ref de
  operacao. Selecao por pagina e explicita; mudar pagina/filtro limpa selecao
  e invalida confirmacao antiga. Realtime atualiza somente a pagina atual.
- Detalhe continua por GET /compras/solicitacoes/:id ao abrir a SC, sem
  prefetch dos itens/detalhes das outras SCs. Endpoint de detalhe, permissao
  de escrita e financeiro nao foram alterados.
- Delegacao e consumidores sem page/limit mantem array legado. Paginacao
  em contexto de delegacao e recusada400, evitando metadados incorretos de
  pedidos fechados. Escopo desta entrega e lista principal; nao afirmar que
  todas as listas de Compras foram convertidas.

## Validacoes aprovadas

- 7 testes backend novos: SQLite :memory: com controller/ACL reais antes e
  depois, conjuntos permitidos/paginas completas, filtro distante, status
  sinonimos/underscores desconhecidos, texto literal/injecao, obra/escopo
  vazio/sem autenticacao, facetas sem vazamento, DTO, contagens, limite,
  pagina excedente, ordenacao deterministica e contrato legado. SQL MySQL
  gerado com LIMIT/OFFSET/LPAD/GREATEST/REGEXP_REPLACE, sem conexao MySQL.
- Playwright com tela/hook/servico reais e fetch ficticio: 125registros em
  3paginas, filtrosglobais/totais, detalhe apenasaposclique, selecao por
  pagina, confirmacao obsoleta semmutacao, refresh coalescido/max1emvoo,
  abort/desmontagem, erro/contratoantigo e permissoes de acoes. Sem chamadas
  a API real, sem login/credenciais ou escrita real. Captura mobile local em
  outputs/compras-paginacao-mobile.png e fixture, nao tela de producao.
- Regressoes: validarComprasCarregamentoSemProduto, validarCompraCotacaoEnvio,
  validarPedidoEntregasAcesso, validarCompraReorganizacao(14casos SQLite em
  memoria), validarCompraRemanejamento e validarPedidoEntregas aprovados sob
  preload semRedeQa.
- npm run build frontend aprovado. Avisos existentes de Browserslist e chunk
  grande nao impediram o build. Sintaxe e git diff --check aprovados.

## Limites e proximo passo

Nao medido desempenho em MySQL real/carga real; nenhuma consulta externa ou
EC2 foi executada. OFFSET nao cria um snapshot imutavel: novas SCs durante a
navegacao podem mudar sua posicao; cada pagina representa o estado consultado.
O count e as facetas sao agregacoes no banco, sem materializar detalhes de
todas as SCs no Node. Nenhum indice/schema foi criado.

Publicar somente se usuario solicitar: backend antes frontend e homologacao
controlada. Nao reutilizar aplicador do hotfix46ac sem criar novo inventario
para este escopo. Preservar limite4GB/DEV/planos/ambientes no futuro pacote.
Sem migrations nesta entrega. Handoff sensivel atualizado antes de pausar.

Pedido seguinte concluido localmente APOS esta etapa: filtro Forma de pagamento
abre as formas presentes na fila autorizada, sem exigir digitacao. Escopo e
testes no [handoff financeiro](2026-10-27-fila-formas-disponiveis-local.md).
Ambas as entregas continuam sem commit/push/deploy ou acesso a EC2.
