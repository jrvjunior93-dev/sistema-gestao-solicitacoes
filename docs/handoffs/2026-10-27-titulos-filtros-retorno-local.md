# Titulos: codigo da solicitacao e persistencia dos filtros - 27/10/2026

## Escopo autorizado e estado

Usuario pediu adicionar o filtro por codigo da solicitacao em Contas a Pagar
e a Receber, corrigir retorno que abria Receber ao sair de Pagar e perda da
escolha de filtros visiveis. Implementacao/testes somente locais no worktree
compras-paginacao-local-20261027/Fluxy, branchcodex/compras-paginacao-local-20261027,
base46ac88de. Entregas anteriores de Compras e Forma de pagamento da Fila
continuam preservadas e nao publicadas neste mesmo worktree.

Sem EC2, banco real, credenciais, mutation financeira real, migrations,
install, commit/push/deploy ou reinicio. Testes usam dados ficticios em memoria,
SQLite :memory: e navegador isolado. APIs reais nunca foram acessadas.

## Mapeamento e alteracoes

- FinanceiroTitulos e a tela comum das duas carteiras, diferenciadas por
  URL ?tipo=pagar/receber. Valores/colunas/visibilidade ja possuem chaves
  distintas por carteira. Permissoes financeiras e escopo de obras permanecem
  nos endpoints existentes; nenhuma regra de baixa foi alterada.
- Novo filtro opcional Codigo da solicitacao em Filtros visiveis (oculto por
  padrao, como Titulo/N.documento). Aceita codigo completo SOL-5426 ou numero5426,
  ignorando caixa/padding numerico. Busca codigo exibido, nao ID interno de
  solicitacao, pedido, SC ou titulo. Codigos de outros formatos aceitam igualdade
  literal. Max40caracteres, apenas string; percentual/aspas nao viram wildcard/SQL.
- GET /financeiro/titulos recebe solicitacao_codigo, validado pela mesma
  validacao de consulta usada no relatorio. Filtro EXISTS no SQL antes de
  COUNT/LIMIT, aplicado a origem direta e origens de titulo compartilhado e
  negociado. Nao multiplica linhas, nao carrega toda carteira no Node. Mantem
  tipo, status, demais criterios e escopo completo das obras. Relatorios usam
  o mesmo pipeline filtrado, sem alterar permissao exportar.
- Novo useRetornoTitulos le somente metadados do workspace: retorna a ultima
  lista da propria aba, ou de sua origem, com query original. Mantem snapshot
  de pagina/valores/ordenacao ao voltar. Nao percorre abas nao relacionadas e
  nao volta para editar apos detalhe-editar-detalhe. Entrada direta sem lista
  anterior usa carteira do titulo. PageHeader continua usando Link, preserva
  modificadores e guardas de navegacao existentes. No editar, somente retorno
  do estado sem registro foi ajustado; salvar e demais fluxos ficam iguais.
- Tabela notificava ordem ao remontar e a pagina sempre zerava a paginacao.
  Callback agora muda pagina somente se a ordenacao realmente mudou.
- PreferenciasContext permitia GET inicial atrasado sobrescrever marcacao feita
  durante a carga, inclusive apos PUT ja enviado. Escolha alterada na sessao
  agora vence a carga inicial/adocao atrasada, sem impedir outras preferencias.
  PUTs/reset por chave+tipo sao serializados, coalescendo a ultima escolha
  pendente; respostas invertidas nao deixam uma gravacao antiga vencer a nova.
  Chaves distintas continuam independentes. Logout impede continuacao antiga.
- Filtros ja digitados nao sao substituidos por valores gravados que chegam
  tarde. Esconder um filtro limpa seu valor no rascunho, consulta e preferencia
  salva/espelho local; caso contrario o criterio antigo voltava a revela-lo na
  abertura seguinte. Outros campos ainda nao consultados nao sao gravados
  por essa limpeza. Ref preserva limpezas multiplas no mesmo evento.

## Arquivos desta etapa

Backend: financialValidators.js (consulta de titulos), tituloFinanceiroService.js
(somente listarTitulos), novo tituloSolicitacaoCodigoFiltro.js e
backend/scripts/validarTitulosSolicitacaoCodigo.js.

Frontend: FinanceiroTitulos.jsx, FinanceiroTituloDetalhe.jsx,
FinanceiroTituloEditar.jsx (somente retorno sem registro), PreferenciasContext.jsx,
novo navigation/useRetornoTitulos.js, scripts/validarTitulosFiltrosRetorno.mjs e
scripts/validarPreferenciasConcorrencia.mjs. Fixture existente
validarTituloDetalheWorkspace.mjs recebeu somente mock fiscal de leitura que
faltava e gerava alerta HTML alheio ao teste; runtime fiscal nao foi alterado.
README financeiro, ownership e este handoff.

## Validacoes locais

- 2testes backend novos: validador e funcao REAL listarTitulos/whereRateado com
  SQL Sequelize/MySQL executado em SQLite :memory:, mais de600titulos, codigo
  diferente de ID interno, origens compartilhadas/negociadas, duplicatas,
  paginacao/count, carteiras/status, escopo completo,403/sem obras, filtro
  ID combinado, literal malicioso e resultado sem paginacao do relatorio.
- 3testes de concorrencia com funcoes REAIS do armazem: GET depois do PUT/reset,
  coalescencia/serializacao, carteiras independentes, erro sem loop, espelho
  preservado e logout sem continuar gravacao antiga.
- Playwright1366px e390px com paginas, services HTTP, PreferenciasProvider,
  router, WorkspaceView/controller REAIS; somente fetch ficticio. Filtrar nas
  duas carteiras, abrir e voltar na pagina2, valores/visibilidade independentes,
  GET velho depois do clique/PUT, criterio digitado preservado, nova ordenacao
  reinicia pagina, esconder limpa criterio salvo, recarregar preserva escolha,
  acesso revogado oculta registros antigos e URL direta/aba filha/retorno apos
  edicao. Nenhum endpoint financeiro de escrita chamado. Capturas ficticias em
  outputs/titulos-filtros-retorno/filtros-1366.png e filtros-390.png.
- Regressao de detalhe real desktop/mobile: baixa, cobranca, correcao, rascunho,
  revisao/saldo/permissao,403 e protecao de multiplos envios aprovadas. Teste
  de desvincular fatura tambem aprovado sem executar operacao real.
- Regressoes backend de relatorio selecionado (HTTP apenas127.0.0.1), titulos
  por pedido, baixa/estorno e baixa composta aprovadas. Regressao de filtros
  ordenaveis aprovada; Forma de pagamento da Fila permanece com3testes PASS.
- Build, sintaxe, diff check e documentacao conferidos na finalizacao.
- Finalizacao: build aprovado17.51s; docs655Markdown/19canonicos e diff/sintaxe
  PASS. Capturas desktop/mobile inspecionadas; sem mudanca estetica global.
  Regressao frontend validarRelatorioTitulosSelecao.mjs tambem aprovada com
  PLAYWRIGHT_EXECUTABLE_PATH apontando para o Chrome local; o Chromium
  empacotado nao esta instalado, nenhuma dependencia foi instalada.

Repetir apenas se houver alteracoes: backend node --require
./scripts/helpers/semRedeQa.js scripts/validarTitulosSolicitacaoCodigo.js;
frontend node scripts/validarPreferenciasConcorrencia.mjs e node
scripts/validarTitulosFiltrosRetorno.mjs (tambem --mobile). As fixtures recusam
chamadas reais. Regressoes de relatorio backend usam exclusivamente127.0.0.1,
por isso nao usar o preload que bloqueia inclusive localhost nesse teste.

## Limites e continuacao

Nao houve teste de carga/MySQL real; preservacao observada em fixtures nao e
medicao produtiva. Serializacao de preferencias e por instancia do app;
nao resolve concorrencia simultanea entre aparelhos/abas independentes. Falha
de rede preserva memoria/espelho e nao cria loop automatico de tentativas;
nao garante sincronizacao em outro aparelho enquanto a API estiver fora.
Pagina/rascunho do workspace sao memoria de sessao, nao cache de dados com
permissao antiga: lista reconsulta servidor ao voltar e limpa dados no erro.

Codigo ainda nao publicado. Se usuario solicitar promocao/deploy, backend
deve preceder frontend (novo parametro validado). Criar inventario/aplicador
proprio para todo escopo autorizado; nao reutilizar manifesto fechado do
hotfix46ac88de. Nenhuma migration necessaria. Preservar heap4GB, DEV, NSDOCS,
processos e ambientes em eventual atualizacao executada pelo operador.
