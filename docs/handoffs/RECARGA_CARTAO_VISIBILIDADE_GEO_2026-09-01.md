# Recarga de Cartao — visibilidade GEO / Gerencia de Processos

## Sintoma

A solicitacao `SOL-1980`, do novo fluxo de Recarga de Cartao (titulo automatico, controle de saldo
e prestacao de contas), estava persistida no setor `GEO`, mas nao
aparecia na lista do usuario Kauan Dutra, cujo setor cadastrado e `GERENCIA DE PROCESSOS`, mesmo
com a permissao granular `solicitacoes.lista.visualizar_setor` ativa.

O detalhe continuava acessivel ao criador da solicitacao pelo escopo de solicitacoes proprias.

## Causas

O sistema considera `GEO`, `GERENCIA DE PROCESSOS` e `GERENCIA_PROCESSOS` aliases do mesmo setor
operacional em regras de roteamento, acesso ao detalhe e historico. Na listagem de solicitacoes,
entretanto, o ramo de usuario comum montava a condicao do setor apenas com os valores literais do
cadastro do usuario. Assim, `GERENCIA DE PROCESSOS` nao correspondia ao valor persistido `GEO`.

A listagem ainda possui uma segunda etapa para aplicar o modo de recebimento por tipo. Essa etapa
consultava a configuracao usando somente `solicitacoes.area_responsavel` (`GEO`), em vez dos tokens
do setor do usuario. Com configuracoes distintas entre os aliases, a solicitacao podia passar pelo
SQL e ser removida depois pela regra `ADMIN_PRIMEIRO` do alias incorreto.

## Correcao

Em `backend/src/controllers/SolicitacaoController.js`, a condicao direta de visibilidade do setor
passou a usar `setorTokens`, conjunto que ja contem id, codigo, nome e os aliases GEO/Gerencia de
Processos. A alteracao fica limitada ao escopo da permissao "Ver solicitacoes do setor" e nao
inclui nenhum outro setor.

A etapa posterior de recebimento por tipo tambem passou a resolver a regra com `setorTokens`. Com
isso, a Recarga de Cartao usa o modo configurado para o setor real do usuario, mesmo quando a
solicitacao estiver persistida por outro alias equivalente.

A precedencia tambem foi corrigida de forma geral: quando o usuario possui permissoes granulares
configuradas e `solicitacoes.lista.visualizar_setor` esta ativa, a permissao explicita prevalece
sobre o modo legado `ADMIN_PRIMEIRO`, para qualquer setor e qualquer tipo de solicitacao. O modo
por tipo continua sendo aplicado somente ao comportamento legado, quando essa permissao granular
nao foi configurada. As permissoes das acoes continuam independentes da simples visibilidade.

A mesma precedencia passou a ser aplicada na autorizacao do detalhe. Assim, uma solicitacao que
aparece pela permissao granular tambem pode ser aberta. Se ela estiver no setor principal do
usuario (incluindo os aliases GEO/Gerencia de Processos), o contexto de interacao e liberado; cada
acao ainda exige sua propria permissao granular quando aplicavel.

A precedencia do detalhe foi centralizada antes das regras especializadas de GEO e Administrativo.
Na lista do setor Administrativo, a permissao tambem passou a incluir o proprio setor, nao apenas
setores extras configurados. Usuarios de OBRA continuam sujeitos ao vinculo com a obra.

## Impacto

- usuarios de GEO enxergam solicitacoes atuais da Gerencia de Processos;
- usuarios da Gerencia de Processos enxergam solicitacoes atuais persistidas como GEO;
- qualquer solicitacao do setor deixa de ser escondida por `ADMIN_PRIMEIRO` quando a permissao
  granular "Ver solicitacoes do setor" estiver ativa;
- a listagem e o detalhe passam a usar a mesma precedencia, evitando item visivel com clique
  negado;
- continuam valendo as permissoes granulares e os vinculos de obra;
- usuarios sem `solicitacoes.lista.visualizar_setor` nao recebem essa ampliacao;
- nao ha migration nem alteracao de dados.

## Validacao recomendada em dev

1. entrar como Kauan Dutra;
2. manter ativas "Ver suas proprias solicitacoes" e "Ver solicitacoes do setor";
3. abrir Minhas Solicitacoes sem filtro e confirmar a presenca da `SOL-1980`;
4. desmarcar temporariamente "Ver solicitacoes do setor" e confirmar que uma solicitacao de outro
   usuario deixa de aparecer; reativar a permissao ao final;
5. confirmar que solicitacoes de setores sem relacao com GEO/Gerencia continuam invisiveis.
