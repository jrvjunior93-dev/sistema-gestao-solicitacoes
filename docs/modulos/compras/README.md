# Modulo COMPRAS

## Papel e fronteira

Compras e dono da solicitacao de compra, origem normal/direta, itens, quantidades e rateios de apropriacao. Cotacoes, respostas e pedidos pertencem ao modulo COTACOES. Obras e dono das apropriacoes e Parceiros e dono dos credores/fornecedores referenciados.

## Cadastro de fornecedores

No cadastro de fornecedores de Compras, nome e CPF do representante legal sao opcionais. Se preenchido, o CPF deve ser valido. Nome fantasia continua obrigatorio na criacao de uma empresa. O contato comercial permanece separado do representante legal, e a sincronizacao com Pessoas preserva o ID do fornecedor e os vinculos das cotacoes.

Representante legal tambem e opcional no cadastro geral de Pessoas/credores. Os modais da Nova Solicitacao e da Compra Direta nao exibem seus campos. A qualificacao obrigatoria e propria da solicitacao de contrato cujo valor ultrapassa o limite juridico configurado; nao e uma exigencia do cadastro de fornecedor. Dados existentes e edicoes legadas sao preservados.

## Regras dos itens

- item pode vir do cadastro ou ser manual;
- quantidade e unidade devem ser validas;
- cada item exige apropriacao conforme a operacao;
- a soma das quantidades apropriadas deve fechar a quantidade solicitada do item;
- alteracao de quantidade e apropriacoes exige permissao especifica, escopo da compra e auditoria;
- alteracao de item depois de etapas dependentes precisa ser bloqueada ou versionada;
- cancelamento exige motivo, interrompe novas acoes e preserva o registro visivel no historico;
- exclusao de solicitacao integrada, cotada ou com pedido deve ser bloqueada.

## Criacao sem vinculo de visualizacao com a obra

`Configuracoes > Status e Vinculos > Criacao em Todas as Obras` permite aos setores
marcados criar compra normal ou direta em qualquer obra/centro de custo. A permissao
funcional `compras.solicitacoes.criar` continua obrigatoria conforme a matriz de
autorizacao existente. A excecao consulta `SETORES_CRIACAO_TODAS_OBRAS` e nao cria
vinculos `UsuarioObra`, nao altera `SETORES_ACESSO_TODAS_OBRAS` e nao amplia listas,
detalhes ou alteracoes de compras de terceiros. O acesso do proprio solicitante
ao recurso criado segue a regra ja existente.

A guarda de criacao tambem vale na importacao de itens da compra normal e no
download do seu modelo XLSX. Existencia da obra, tipos disponiveis, apropriacoes,
bloqueios operacionais e regras transacionais continuam validados no fluxo.
Desmarcar o setor remove a excecao na proxima consulta da configuracao.

Validacao local sem banco: `npm run test:compra-criacao-obras` em `backend/`.

## Compra direta

- usa fluxo proprio de criacao/revisao e pode importar itens por XLSX;
- exige obra e credor ativo marcado como fornecedor;
- permite localizar o credor na base de Parceiros ou cadastra-lo no proprio fluxo;
- cadastro rapido exige nome, CPF/CNPJ e telefone e aceita email e nome fantasia opcional;
- a rota de credor da Compra Direta possui validacao propria, sem ampliar os campos do cadastro financeiro nos detalhes da solicitacao; campos vazios de representante enviados por telas antigas sao aceitos, sem tornar o representante obrigatorio;
- valores, desconto, anexos, itens e apropriacoes sao validados no backend.
- o frete pode ser informado como ausente, embutido no pagamento ao credor principal ou pago a terceiro;
- todo frete informado compoe o custo total da compra direta;
- frete embutido e somado ao valor liquido dos itens e integra o valor devido ao credor principal;
- frete pago a terceiro exige valor, credor ativo, vencimento e dados para pagamento, compondo o total da solicitacao em uma obrigacao separada;
- ao gerar as contas da solicitacao, o financeiro recebe dois titulos preconfigurados: itens para o credor principal e frete para o credor informado, preservando valores e vencimentos separados;
- a criacao e a revisao exibem valor liquido dos itens, frete e valor total para impedir dupla contabilizacao.

## Importacao de itens na solicitacao normal

- a Nova Solicitacao de Compra permite baixar um modelo XLSX depois de selecionar a obra;
- o modelo traz abas de referencia de insumos ativos, unidades e apropriacoes analiticas da obra, sem expor IDs de banco ao usuario;
- a planilha normal nao recebe fornecedor, forma de pagamento, valor unitario ou valor total, porque esses dados pertencem as etapas posteriores de cotacao;
- a importacao aceita item cadastrado por codigo ou item manual por descricao e unidade, quantidade, especificacao, apropriacao, data necessaria e link do produto;
- apropriacao e data podem ser completadas na tela antes da revisao; quando informadas na planilha, devem respeitar a obra e o formato vigente;
- a importacao apenas alimenta o rascunho local e nao cria solicitacao, cotacao, pedido ou efeito financeiro;
- qualquer erro bloqueia o arquivo inteiro, e o usuario revisa os itens importados na grade antes de seguir pelo fluxo existente;
- o limite permanece em 300 itens considerando o que ja existe no rascunho, e multiplos envios simultaneos ficam bloqueados no frontend;
- baixar e importar exigem `compras.solicitacoes.criar`, alem do escopo da obra validado no backend.

## Catalogacao de itens manuais

- Solicitacao de Compra e Compra Direta compartilham o tratamento na tela de detalhes;
- o item manual permanece na tabela e no historico original, mesmo depois da catalogacao;
- a acao pode vincular um insumo ativo existente ou criar um novo cadastro oficial;
- novos codigos usam sequencia transacional no formato `INS-000001`, com protecao contra concorrencia;
- a descricao manual e registrada como alias quando difere do nome oficial, permitindo reconhecimento exato em novas importacoes;
- nomes e aliases duplicados sugerem o cadastro existente em vez de criar duplicidade silenciosa;
- o salvamento nao exige justificativa digitada; criacao, vinculo e correcao continuam registrados no log da solicitacao;
- depois do salvamento, a relacao de itens passa a exibir o nome, a descricao e a unidade do cadastro oficial, preservando os textos manuais no registro de origem e no alias;
- apenas administradores ou usuarios com `compras.insumos.catalogar_itens_manuais` podem executar a acao;
- a ausencia de configuracao granular nao libera a escrita no cadastro mestre por compatibilidade legada;
- o backend revalida permissao, escopo da obra e item pertencente a solicitacao, usa transacao e bloqueio de linha;
- itens catalogados passam a compor busca por alias, ultimo preco e relatorios agregados pelo insumo oficial;
- a migration `202608200051_catalogacao_itens_manuais.js` deve ser aplicada antes de publicar o backend e o frontend deste fluxo.

Endpoint protegido: `POST /compras/solicitacoes/:id/itens-manuais/:itemId/catalogar`.

## Fluxo

1. usuario cria a compra;
2. itens e apropriacoes sao validados;
3. compra normal nasce `PENDENTE` em GEO para revisao de quantidades e apropriacoes;
4. `compras.solicitacoes.editar_itens` permite gerenciar esses dois dados somente enquanto a solicitacao esta no GEO;
5. `compras.solicitacoes.encaminhar_compras` conclui a revisao, move a solicitacao para Compras e altera o registro operacional para `LIBERADO_PARA_COMPRA`;
6. compra direta nasce em `ENVIADO` e segue para Gerencia de Processos;
7. nao existe aprovacao previa por diretoria para novos registros;
8. cancelamento posterior precisa verificar cotacoes, pedidos, fiscal e financeiro.

Campos e rotas de diretoria ainda presentes no backend atendem somente compras antigas formalmente marcadas com esse fluxo e nao definem a criacao vigente.

## Frete em cotacao e pedido

- a resposta publica do fornecedor e a edicao interna usam o mesmo contrato de frete: `SEM_FRETE`, `EMBUTIDO` ou `TERCEIRO`;
- o lancamento pode ser `GLOBAL` ou `POR_ITEM`; no modo por item, cada item pode ter frete positivo ou zero;
- o fechamento proporcional considera somente a quantidade comprada e preserva o saldo de frete para rodadas futuras;
- o pedido guarda o frete rateado em cada item, o frete total da rodada, o total da aquisicao e o total devido ao fornecedor;
- frete embutido integra o valor devido ao fornecedor; frete de terceiro integra o custo da aquisicao, mas gera obrigacao financeira separada;
- edicao e remanejamento recalculam os rateios e totais dentro da transacao existente, sem mudar rotas, permissoes ou estados do pedido;
- detalhe, comparativo e PDF exibem o frete e o total da aquisicao para evitar que um frete informado fique apenas como texto.

## Gestao financeira do pedido pelo GEO

- a solicitacao de compra continua no setor de Compras durante as rodadas de cotacao e a geracao de varios pedidos;
- cada pedido fechado com um fornecedor entra individualmente na fila financeira do GEO, sem aguardar o encerramento dos demais pedidos da solicitacao;
- o GEO acessa a area de Pedidos por permissoes granulares proprias, sem receber permissao para editar itens, cotacoes ou outras operacoes exclusivas de Compras;
- o GEO distribui o total devido ao fornecedor em um ou mais titulos `PREVISAO`, com vencimentos informados por parcela e vinculo explicito entre pedido e titulo;
- nota fiscal, comprovante de compra ou outra confirmacao fica vinculada ao pedido; ao menos uma confirmacao e obrigatoria antes da liberacao;
- a liberacao e manual e seletiva: apenas os titulos escolhidos mudam de `PREVISAO` para `ABERTO` e recebem a forma de pagamento definida pelo GEO;
- novos pedidos do mesmo fornecedor permanecem registros independentes e geram seus proprios vinculos financeiros;
- pedidos anteriores a implantacao nao sofrem backfill ou alteracao automatica: aparecem como legados pendentes de revisao e somente entram no fluxo quando o GEO os adota expressamente;
- se o pedido ja teve qualquer titulo vinculado, inclusive previsao ou titulo historico cancelado, Compras nao pode reabri-lo diretamente e precisa solicitar decisao do GEO;
- o GEO pode aprovar a reabertura quando todos os titulos estiverem em `PREVISAO`, `CANCELADO` ou `ESTORNADO`; previsoes ainda ativas sao canceladas na mesma transacao antes da reabertura;
- titulo `ABERTO`, `PARCIAL` ou `QUITADO` bloqueia a aprovacao ate o Financeiro regularizar o efeito financeiro;
- criacao de previsoes e solicitacao de reabertura exigem chave de idempotencia, e criacao, liberacao, cancelamento de previsao e reabertura sao transacionais.

A estrutura e criada pela migration `202609070050_pedido_compra_gestao_financeira_geo.js`, que nao altera pedidos ou titulos existentes.

As rotas antigas `PATCH /compras/solicitacoes/:id/integrar` e `PATCH /compras/solicitacoes/:id/liberar` respondem `410`. O codigo depois desse retorno e legado inacessivel e nao define a regra vigente.

## Dependencias

- parceiro fornece solicitante/fornecedor quando aplicavel;
- Obras fornece apropriacoes;
- Solicitacoes pode ser origem, sem perder sua propria trilha;
- Cotacoes consome a compra normal somente depois da revisao GEO e do encaminhamento para Compras;
- Fiscal e Financeiro consomem pedidos e obrigacoes posteriores, nao o rascunho da compra.

## Delegacao de compras

- a lista de responsaveis aceita somente usuarios ativos vinculados a setor ativo com a capacidade `eh_setor_compras`;
- o vinculo pode ser o setor principal do usuario ou um setor adicional registrado em `usuario_setores`;
- o endpoint dedicado `GET /compras/delegacao/usuarios` exige permissao de gerenciamento da delegacao e nao altera o endpoint generico de usuarios usado por outros fluxos;
- o backend revalida a elegibilidade dentro da transacao ao salvar, protegendo contra desativacao ou troca de setor ocorrida depois do carregamento da tela;
- os historicos da solicitacao de compra e da solicitacao principal exibem o nome do responsavel delegado; o ID permanece somente nos metadados tecnicos de auditoria;
- atribuições historicas a usuarios fora de Compras sao preservadas para consulta, mas um novo salvamento gerencial exige trocar ou remover esse responsavel.

## Gestao de fornecedores

- visualizar a pagina usa `compras.fornecedores.visualizar` ou `compras.fornecedores.gerenciar`;
- cadastrar, editar e desativar exige `compras.fornecedores.gerenciar` tanto no frontend quanto no backend;
- na ausencia de configuracao granular, permanece o fallback para usuarios do setor de Compras;
- a pesquisa por CPF/CNPJ ignora pontos, tracos, barras e espacos, sem alterar o documento armazenado nem a unicidade do cadastro central de Parceiros.

## Idempotencia

Criacao, encaminhamento, aprovacao, cancelamento e envio para cotacao devem impedir repeticao concorrente. O backend deve revalidar status em transacao; o frontend bloqueia multiplos cliques.

No fechamento de cotacao, a mesma chave de idempotencia nao pode repetir pedidos, alocacoes nem frete pago a terceiro. Quantidade acima da solicitada exige justificativa auditavel e nunca pode ultrapassar a disponibilidade declarada pelo fornecedor.

A disponibilidade e acumulada por fornecedor e item, sem depender do ID versionado da resposta. Uma edicao interna que aumente a capacidade total do fornecedor pode reabrir uma solicitacao `ENCERRADO` para `FECHAMENTO_PARCIAL`; o sistema abate tudo que ja foi comprado daquele fornecedor para o item e libera somente a diferenca real. A resposta publica continua bloqueada depois do encerramento.

Reabrir um pedido libera ajustes operacionais, mas preserva as alocacoes ja compradas. Sem historico financeiro, Compras pode executar a reabertura diretamente. Se existir ou tiver existido titulo do pedido, a reabertura exige aprovacao do GEO e o tratamento financeiro descrito acima. Edicao e remanejamento permanecem bloqueados enquanto houver efeito financeiro impeditivo ou frete titulado. No remanejamento, origem e destino sao atualizados na mesma transacao, com validacao do saldo do fornecedor, custos gerenciais, descontos e fretes pendentes. Depois do ajuste, o usuario fecha novamente os pedidos; a solicitacao e as cotacoes sao sincronizadas automaticamente conforme todos os pedidos ativos estejam fechados ou algum pedido seja cancelado.

## Cancelamento e remanejamento de itens

- cancelar um pedido sem efeito financeiro impeditivo marca seus itens como removidos, registra a quantidade cancelada e cancela as alocacoes ativas, liberando o saldo para nova decisao de compra;
- o cancelamento nao apaga pedido, item, alocacao nem historico;
- a tela do pedido cancelado pode oferecer candidatos de outras respostas da mesma cotacao para o item liberado;
- o remanejamento nao significa que a compra terminou: ele transfere a quantidade para o fornecedor escolhido, cria ou atualiza o pedido de destino e esse pedido segue o fluxo normal ate ser fechado;
- quantidade remanejada e limitada pelo saldo liberado na origem e pela disponibilidade ainda real do fornecedor de destino;
- itens com titulo financeiro, frete titulado ou outro efeito financeiro impeditivo precisam ser regularizados antes do cancelamento ou remanejamento;
- a rotina de regularizacao de pedidos cancelados existe para corrigir registros historicos em que o status do pedido foi cancelado, mas itens ou alocacoes permaneceram ativos; ela deve ser executada primeiro em simulacao e somente no banco explicitamente confirmado.

## Mudanca segura

Testar compra normal e direta, destinos iniciais, compatibilidade de registros antigos, credor, itens cadastrados/manuais, importacao, rateio, edicao de apropriacoes, permissoes, cancelamento, cotacao, pedido, relatorios de compras e registros de origem.
