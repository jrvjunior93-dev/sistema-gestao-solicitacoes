# Arquitetura - Visao Geral

## Topologia

- React/Vite no frontend web;
- Expo/React Native no aplicativo mobile;
- Capacitor disponivel no frontend web para empacotamento controlado, sem substituir o projeto Expo;
- API REST Node.js/Express;
- Sequelize e MySQL;
- S3 para arquivos privados;
- EC2, PM2 e Nginx no backend;
- Vercel no frontend.

## Responsabilidades

O frontend cuida de navegacao, formularios e apresentacao. O backend cuida de autenticacao, autorizacao, validacao, regras de negocio, transacoes, auditoria, persistencia e integracoes.

O banco persiste o estado oficial. Relatorios e dashboards devem derivar de dados rastreaveis e mostrar inconsistencias em vez de inventar valores.

## Inicializacao

`backend/server.js` valida o ambiente, confere em modo somente leitura se o schema ja contem todas as migrations, carrega configuracoes e inicia a API. O processo nao aplica migrations nem usa `sequelize.sync()` no runtime normal. Se houver incompatibilidade, a inicializacao falha sem alterar o banco.

## Modularidade

Os modulos sao controlados pela chave `MODULOS_HABILITADOS` de `ConfiguracaoSistema`. O catalogo, os valores padrao e as dependencias ficam em `backend/src/services/moduleConfigService.js`; o backend aplica `requireEnabledModule` nas rotas e o frontend recebe `modulos_habilitados` na sessao.

Dependencias declaradas devem ser aplicadas tanto no frontend quanto no backend. Desabilitar um modulo nao remove suas colunas, rotas ou tabelas e nao transfere a propriedade de seus dados para outro dominio.

Por compatibilidade, uma chave de modulo desconhecida e considerada habilitada no backend. O frontend tambem considera habilitado quando a sessao nao contem lista de modulos ou quando a chave nao existe nela. Portanto, todo novo modulo precisa ser incluido no catalogo, exposto na sessao, protegido no backend e frontend e coberto pela validacao documental. Esse comportamento de compatibilidade nao deve ser usado como mecanismo de habilitacao.

O inventario do runtime e os componentes descontinuados ainda presentes no codigo estao em `ESTADO_RUNTIME_E_LEGADOS.md`.

## Linhas de entrega

- `refactor/frontend`: homologacao ampla, incluindo backend, frontend, migrations,
  testes e documentacao apesar do nome da branch;
- `main`: producao;
- backend de desenvolvimento: processo `backend-dev` e porta local da EC2 dev;
- backend de producao: processo `backend-solicitacoes` e porta 8000.

Promocao exige reconciliar os commits exclusivos das duas branches. Nao substituir a
`main` pela refatoracao sem revisar os hotfixes de producao.

## Operacoes criticas

Criacao de solicitacao, titulo, lote, pedido, baixa, aprovacao, anexo e mudanca de
status deve combinar bloqueio de interface, idempotencia backend, transacao e lock
quando houver concorrencia. O frontend nunca e a unica barreira.

## Regra de mudanca

Antes de alterar uma tabela, status, endpoint ou permissao, consulte o mapa de modulos, a propriedade dos dados e o documento canonico do dominio. Mudancas transversais exigem teste em todos os consumidores identificados.
