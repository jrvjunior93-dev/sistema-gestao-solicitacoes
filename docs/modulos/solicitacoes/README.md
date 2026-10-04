# Modulo SOLICITACOES

## Documentacao operacional relacionada

- [Fluxos de solicitacoes iniciais do setor OBRA](./FLUXOS_INICIAIS_OBRA.md): matriz de producao, campos, destinos, automacoes, fluxogramas e separacao entre regra vigente e legado.

## Papel e fronteira

Solicitacoes e o hub operacional entre usuarios, setores, obras, parceiros, contratos, compras e financeiro. O modulo e dono da abertura, area atual, destino, atribuicao, status setorial, comentarios, anexos, historico e regras de movimentacao. Nao e dono de apropriacao, contrato, pedido ou titulo financeiro.

## Dados e regras

- solicitacao comum exige obra/centro de custo e tipo compativel; `CADASTRO DE OBRA`
  e excecao explicita e nasce sem origem preexistente;
- parceiro, valor, vencimento, contrato e apropriacao dependem do tipo e dos modulos ativos;
- o backend valida a combinacao entre tipo e Obra/Centro de Custo;
- a tela Nova Solicitacao nao recebe mais a area responsavel do usuario;
- o backend define o destino inicial como o setor com capacidade `eh_setor_geo` e grava status `PENDENTE`;
- todas as Obras compartilham o catalogo marcado em `tipo_solicitacao.disponivel_para_obras`;
- cada Centro de Custo usa somente os tipos explicitamente vinculados em `centro_custo_tipos_solicitacao`;
- Centro de Custo sem vinculos nao recebe catalogo por fallback; a criacao fica bloqueada ate a configuracao;
- subtipos ativos herdam a disponibilidade do tipo macro;
- assumir e enviar dependem do setor atual e das permissoes do usuario;
- usuarios podem possuir setor principal e setores adicionais;
- `SUPERADMIN` e excecao administrativa, mas a excecao deve continuar auditada;
- setor `OBRA` respeita vinculo e restricoes especificas;
- arquivamento e individual por usuario e nao altera o registro global;
- alteracoes de status, envio e automacao geram historico.

## Boleto e rateio na Nova Solicitacao

- Na Nova Solicitacao comum, Boleto dispensa o favorecido de pagamento
  separado em todos os tipos, mesmo se o campo `Favorecido` estiver marcado
  como obrigatorio na configuracao do tipo. O arquivo do boleto continua
  obrigatorio; `Credor` segue a regra do tipo (e e obrigatorio em Despesa
  Eventual). PIX e outras formas preservam a exigencia de favorecido.
- A Medicao do fluxo novo possui instrucao de pagamento e aprovacao proprias;
  sua regra de favorecido nao e controlada por esta excecao da Nova Solicitacao.
- `Apropriacao principal` em `Campos da Nova Solicitacao` controla a visibilidade
  e a obrigatoriedade do campo na obra. A selecao unica continua sendo o padrao.
  Ao optar por dividir, o usuario informa ao menos duas apropriacoes analiticas
  ativas da mesma obra e percentuais que fecham 100% do valor da solicitacao.
- O backend valida novamente obra, disponibilidade e soma, e grava a solicitacao
  e as linhas de rateio na mesma transacao. O custo financeiro por apropriacao
  usa esse rateio quando o titulo nao possui rateio proprio. O total do
  Resultado de Obras nao muda: o rateio reparte o custo dentro da mesma obra.
- Solicitacoes antigas com uma apropriacao nao sao alteradas. A edicao posterior
  continua sujeita a permissao, historico e bloqueio apos titulo financeiro ou
  pedido de compra.

## Fluxo independente de Cadastro de Obra

O botao `Solicitar cadastro de obra` abre um formulario proprio e nao exige selecionar
uma origem. O destino GEO e derivado no backend e nao aparece como escolha.

Campos atuais:

- nome resumido da obra;
- tipo `PUBLICA`, `PRIVADA` ou `PROPRIA`;
- fase `PRE_OBRA` ou `OBRA_INICIADA`;
- valor da obra em moeda;
- responsavel tecnico como texto curto;
- endereco;
- ao menos um usuario ativo que recebera acesso;
- planilha orcamentaria obrigatoria para `OBRA_INICIADA`;
- ART e demais documentos pertinentes.

Os dados ficam vinculados a solicitacao. No detalhe, quem possui
`obras.cadastro.gerenciar` pode abrir o modal de cadastro definitivo pre-preenchido.
A operacao e transacional e idempotente por solicitacao.

## Centros de Custo

Marketing, Comercial e Administrativo/Escritorio podem usar tipo automatico conforme
a configuracao vigente. A distribuicao gerencial por obra registra destino percentual
ou financeiro no relatorio do Centro de Custo, sem atribuir o custo real a obra. A
opcao `TODAS` permanece como classificacao propria e nao e rateada.

Para `DESPESA ADMINISTRATIVA`, as regras de `Campos da Nova Solicitacao` do setor
inicial GEO (tipo e eventual subtipo) valem independentemente do Centro de Custo
selecionado. O nome `ADMINISTRATIVO/ESCRITORIO` nao cria uma regra de campos
prioritaria; esse tipo tambem pode ser vinculado explicitamente a outros Centros
de Custo sem duplicar a configuracao do formulario.

## Encaminhamento atual, compatibilidade e automacoes

Novas solicitacoes abertas pela tela entram em `GEO / PENDENTE`; o navegador nao pode substituir esse destino por payload. Os campos e endpoints de diretoria permanecem no backend somente para compatibilidade com registros antigos que ja possuam `fluxo_aprovacao_diretoria = true`; eles nao devem ser reutilizados para criar novos fluxos. Prioridades da diretoria continuam sendo um dominio operacional separado e nao alteram o setor responsavel. A configuracao `Tipos por Setor (Recebimento)` continua controlando visibilidade e modo de recebimento depois que a solicitacao chega a um setor, mas nao controla o catalogo de abertura. Automacao por status so ocorre depois de uma transicao valida e nao pode ignorar permissoes ou consistencia.

## Dependencias

- recebe obra e apropriacao de `OBRAS`;
- recebe parceiro do cadastro mestre;
- recebe contrato de `CONTRATOS` quando habilitado;
- pode originar `COMPRAS` e `FINANCEIRO` por acoes explicitas e idempotentes;
- publica historico e notificacoes para os interessados.

## Permissoes e seguranca

Visibilidade combina perfil, setores, obra, autoria, atribuicao, historico e configuracoes especiais. Filtros e exportacao devem usar o mesmo universo autorizado da listagem. O frontend apenas oculta acoes; o backend revalida detalhe, anexos, status, envio, assuncao e exportacao.

## Mudanca segura

Alteracoes em status, area, tipo, obra, parceiro ou apropriacao exigem testes do catalogo comum de Obras, catalogo explicito de Centro de Custo, Cadastro de Obra sem origem, criacao inicial em GEO/PENDENTE, rejeicao de payload com tipo nao permitido, compatibilidade de registros antigos de diretoria, detalhe, listagem, filtros, exportacao, prioridades, automacao, compras, contratos, financeiro, notificacoes e usuarios multissetor.
