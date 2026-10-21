# Distribuicao gerencial: centros de custo como destinos

## Pedido e limites

- Usuario priorizou o ajuste da Nova Solicitacao: despesa vinculada ao
  Administrativo Escritorio deve poder ser distribuida entre centros de custo.
- Trabalho local para refactor/frontend; branch isolada da entrega RH,
  codex/rh-demissao-conclusao-20261021 (base DEV828ed2ec). Preservar todo o RH.
- Sem commit/push, producao, EC2/banco/storage reais, migration ou backfill.
- Reabertura/fechamento de pedidos nao foi implementada. Continua aguardando
  autorizacao especifica e logs que o usuario informou que vai executar.

## Arquivos e comportamento

- centroCustoDistribuicaoService: filtro de ativos por OBRA ou CENTRO_CUSTO com
  opt-in gerencial. Padrao da funcao continua somente obras para adiantamentos.
  Marketing/Comercial conservam obras privadas; centros ativos sao incluidos
  no gerencial. Mesma ACL da origem, vinculos OBRA, configuracao explicita,
  numericos/IDs distintos, soma de valores/percentuais e arredondamento anterior.
- Controller de elegibilidade ativa opt-in; validacao da distribuicao tambem.
  Configuracao SUPERADMIN aceita ambos os tipos. Listas existentes restritivas
  nao sao ampliadas sem o administrador incluir os novos IDs.
- NovaSolicitacao: rotulos e marcador de Centro de custo na lista existente,
  mesmos controles percentual/valor/TODAS, payload e envio protegido anteriores.
- Configuracao de destinos: textos/pesquisa e identificacao dos centros.
- Relatorio: DTO tipo_centro_custo, rotulos origem/destino, identificacao e filtro
  de centros. Atalhos/descricao da pagina de relatorios alinhados, catalogo
  compilado pode ser atualizado pelo prebuild.
- URLs/obras/obra_id/obras_ids/abrangencia OBRA sao nomes tecnicos legados
  conservados; todos os IDs pertencem a mesma tabela de obras/centros.
- Nao altera TituloFinanceiro, rateios reais, ResultadoObras/CentrosCusto,
  custos de destinos ou a logica financeira de adiantamentos.
- Novos testes backend/frontend, scripts npm e ajustes textuais nos QAs de
  adiantamento; o mock antigo de filtro agora respeita OR e tipo do cadastro.

## Validacoes

- Backend novo: ativos/centros/obras, vinculos/configuracao, Marketing privado,
  padrao somente-obras de adiantamento, origem negada, IDs inativos/inexistentes/
  repetidos, percentuais/valores/centavos/TODAS, bloco transacional real da
  criacao em memoria (origem unica, duas classificacoes, rollback) e relatorio.
- UI nova: Nova Solicitacao real com API isolada, Administrativo como origem,
  dois centros selecionados, percentual/valor/TODAS, erro de soma, retry sem
  perda de valores, duplo submit, payload unico, relatorio e configuracao.
- Nenhum cenario usa dados reais, banco/S3 ou acesso a EC2.
- Aprovados: test:centro-custo-distribuicao backend/frontend, regressoes backend
  AdiantamentoCentroCusto/AdiantamentoFavorecidos/CompraCentroCusto e RH conclusao;
  UI NovaSolicitacaoAdiantamento e AdiantamentoUI (prestacao/configuracao/devolucao).
- Build frontend aprovado (631 modulos, 10,88s), sintaxe Node dos arquivos do
  escopo, diff --check e documentacao594/19 aprovados. Catalogo compilado sem delta.
- Skill frontend-design aplicada aos textos/identificacao dos controles ja
  existentes, sem redesign ou mudancas no comportamento dos demais campos.

## Proximo passo

- Publicar em refactor/frontend apenas se solicitado. RH permanece pendente e
  preservado, assim como outputs privados. Nao incluir outputs na publicacao.
- Operador homologa em DEV: origem Administrativo Escritorio, tipo Despesa
  Administrativa, dois centros/obra como destinos, 100%/total, TODAS, escopo
  OBRA/configurado e relatorio sem custos reais no destino. Validar adiantamento.
- Somente apos homologacao/autorizacao considerar main/producao.
- Ownership liberado: entrega local concluida, sem commit/push. Permanecem
  dois pacotes locais separados funcionalmente: RH e distribuicao gerencial.
