# Campos da Nova Solicitacao: todos os tipos ativos em GEO

## Pedido e causa

O tipo PAGAMENTO DE MAO DE OBRA foi disponibilizado para a obra, mas a
configuracao de seus campos estava em Departamento Pessoal. A abertura pela
obra consulta as regras de GEO, pois o backend define o destino inicial como
GEO/PENDENTE. O seletor administrativo de campos filtrava os tipos de GEO
pela matriz Tipos por Setor, com excecoes apenas para alguns fluxos.

## Alteracoes

- `frontend/src/utils/tiposConfiguracaoCampos.js`: filtro administrativo
  separado; GEO lista todos os tipos ativos, inclusive os de outros setores.
  Reconhece GEO pela capability `eh_setor_geo` e pelos aliases existentes.
- `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx`: utiliza o filtro e
  explica que a listagem ampliada nao muda disponibilidade ou permissoes.
- `frontend/scripts/validarTiposConfiguracaoCampos.mjs`: regressao do filtro
  e da independencia das regras de campos de GEO e DP.
- `docs/workspace/OWNERSHIP_ATIVO.md`: ownership desta tarefa.

## Dependencias preservadas

A pagina continua protegida por `ConfiguracoesAreaRoute` de solicitacoes.
Carrega tipos, setores, matriz por setor e campos pelos endpoints existentes.
O salvamento segue em PATCH `/configuracoes/nova-solicitacao-campos`, com a
autorizacao existente e a mesma estrutura de regra por area/tipo/subtipo.
Nao foram alterados endpoints, disponibilidade por obra, permissoes,
comportamento de tipos, destino inicial ou dados persistidos. Os filtros das
demais areas e as regras ja salvas em DP continuam intactos.

## Validacao executada

- `node frontend/scripts/validarTiposConfiguracaoCampos.mjs`: passou.
  Inclui tipo ativo de DP fora da lista de GEO, exclusao de inativos,
  GEO renomeado reconhecido por capability e filtros dos demais setores.
  Executa tambem os resolvedores reais de campos do frontend e da API com
  dados em memoria; acesso ao modelo de configuracao da API substituido por
  stub, sem conexao, leitura ou escrita no banco.
- `npm run build` em `frontend/`: passou. Avisos de Browserslist desatualizado
  e chunk acima de 500 kB; nenhum erro de compilacao.
- `git diff --check`: passou.

## Estado e proximo passo

O proprietario autorizou commit e push para `main` no pedido seguinte.
O worktree ja esta em `main`, sem necessidade de merge adicional. Mudanca
somente de frontend; deploy nao foi verificado. Sem migration, variavel de
ambiente nova ou necessidade de reiniciar a EC2.
Depois da publicacao do frontend, abrir Campos da Nova Solicitacao, selecionar
GEO e PAGAMENTO DE MAO DE OBRA, configurar os campos e salvar. A regra de DP
nao foi copiada automaticamente para GEO. Conferir na Nova Solicitacao da
obra apos recarregar a pagina. Teste em navegador de producao nao executado.
