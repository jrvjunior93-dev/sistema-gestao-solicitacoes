# Relatorio de permutas e tabela Obras

## Autorizacao e causa comprovada

Usuario autorizou implementar/testar somente na refactor/frontend apos diagnostico
somente leitura executado pelo proprio operador. DEV confirmou banco e UUID
esperados, `lower_case_table_names=0`, unica tabela `Obras` e erro
`ER_NO_SUCH_TABLE: gestao_solicitacoes.obras`. Agente nao acessou EC2/banco real.
BaseDEV93f75d67f773b9687bbf7acb9cf4664243f42c84, branch isolada, agente unico.

permutaRelatorioService montava JOIN obras em minusculas. Obra.getTableName()
retorna Obras. A fixture SQLite anterior tambem usava obras e nao distingue
identificadores por casing, mascarando a falha real do MySQL Linux.

## Correcao e testes

- Uma linha runtime: JOIN Obras no FROM compartilhado pelo resumo e detalhes.
  Sem mudar filtros/replacements, ACL/escopo, totais, paginacao ou legado.
- Teste carrega modelo Obra com Sequelize MySQL desconectado, sem .env/models
  reais; confirma getTableName. Schema SQLite fixture usa Obras.
- Antes de cada SELECT, confere nomes exatos de todas as tabelas FROM/JOIN
  contra schema fixture; forma antiga obras e rejeitada com ER_NO_SUCH_TABLE.
  Nao afirma ser teste de MySQL real: executor dos dados continua SQLite.
- Requisicao identica ao erro (statusATIVO/pagina1), busca pelo nome da obra,
  filtro receber/obra, todo periodo/limites/paginacao, ativos/estornos,
  legado PERMUTA/BENS/data0226 e exclusao de PIX aprovados.
- Escopo compartilhado completo/vazio, obra fora de escopo, ausencia de
  permissao granular e ausencia de acesso Financeiro negados antes do SQL.
- validarPermutasRelatorio.js, validarDeployPermutasDev.js e
  validarPermutasOperacionais.js aprovados. Verificador DEV com READ ONLY,
  EXPLAIN, rollback e guardas permanece existente e inalterado.
- Node/docs/diff aprovados. Sem frontend alterado; nao exige novo build UI.

## Pedido adicional: Contas a Receber

Usuario mostrou titulos de contrato de venda com forma de pagamento vazia,
esclarecendo que a pagina e Contas a Receber. Analise somente leitura:
ComercialContratos envia forma_recebimento_prevista; comercialService grava
esse campo em ContratoComercialParcela. buildTituloContratoPayload nao inclui
forma_pagamento_id; preenche forma_cobranca apenas para BOLETO/PIX/OUTROS.
FinanceiroTitulos renderiza exclusivamente titulo.formaPagamento.nome/codigo;
buildTituloInclude nao carrega parcelasComerciais para esse fallback.

Isso explica a lacuna do caminho de criacao; nao comprova valores do contrato
especifico sem consultar seus dados. Nenhum contrato/titulo/baixa foi alterado.
Eventual correcao deve distinguir forma prevista da forma efetiva da baixa,
preservar formas explicitamente vinculadas e nao reescrever legado/pagamentos.
Implementacao desse segundo tema depende de autorizacao separada.

## Continuidade

Ownership liberado, delta local sem commit/push, main/producao intactas.
Sem migrations/dependencias/configuracoes novas; nao renomear tabela nem
alterar lower_case_table_names. Publicacao e homologacao real DEV pelo operador
dependem de pedido; usar script existente verificarPermutasMySqlDev --verificar
apos publicar e conferir UI com mesmos filtros. Nao acessar servidor pelo agente.

Em21/10 usuario autorizou publicar tambem este delta pendente junto com a
quitacao do saldo com cartao. Roteiro conjunto:
ops/deploy/atualizar-dev-saldo-cartao-permutas-20261021.sh. Refactor/frontend
somente, sem migration, rename, .env, main ou producao. Outputs privados fora
do commit. SQL/ACL/escopo/operacao e guardas readonly repetidos e aprovados.
Diagnostico Contas a Receber acima nao equivale a implementacao nesta publicacao.
