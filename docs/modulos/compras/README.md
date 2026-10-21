# Modulo COMPRAS

## Promocao MAIN RH, centros e pedidos - 2026-10-21

Usuario autorizou os tres commits pendentes2d161b85/ba4a41b2/a00a15f6 e confirmou
backup cifrado/timer. Integracao sobre main80df6534 preserva hotfixes/scripts/
historico e leva runtime DEV sem alteracao adicional. RH homologado pelo usuario;
centros/pedidos validados em testes isolados. Sem DDL/dependencias/calculos
financeiros/.env/flags/memoria alterados. Roteiro PROD exclusivo com verificacoes
readonly e restart somente backend-solicitacoes, executado pelo operador.
[Escopo, testes, roteiro e recuperacao](../../handoffs/2026-10-21-promocao-rh-pedidos-centros-main.md).

## Promocao MAIN motivo encerramento - 2026-10-20

- DEV93f75 homologado: novos encerramentos sem pedido mostram somente o motivo
  no texto do historico principal, preservando data/autor/acao/status/metadados.
- Roteiro produtivo existente de cheques exige pacote93f75 e executa o QA
  antes de restart exclusivo backend-solicitacoes; .env/schema/TLS/12h/PILOT
  preservados, sem migration/dependencia/backfill ou alteracao do DEV.
- [Escopo, evidencias e recuperacao](../../handoffs/2026-10-20-promocao-main-motivo-encerramento.md).

## Reabertura e novo fechamento do pedido - 2026-10-21

Implementacao local para DEV baseada em refactor/frontend2d161b85. Os loaders
de cotacao/pedido carregam colecoes hasMany separadamente (itens, manuais,
fornecedores/respostas, alocacoes, pedidos/itens, logs e fretes/rateios), sem
limitar ou descartar registros. A sincronizacao de status por saldo le apenas
quantidades/alocacoes/status, sem repetir o grafo completo da cotacao. Preserva
a mesma transacao nos carregamentos internos e as regras de saldo existentes.

Reabertura e alteracao de status distinguem commit de leitura do detalhe:
se a escrita foi confirmada e o detalhe falhar, respondem202 com recibo
operacao_confirmada/detalhe_pendente, sem rollback pos-commit. Commit com
resultado incerto responde503. A tela exige consulta por GET antes de permitir
outra escrita; nunca repete PATCH automaticamente. Campos locais permanecem.

Pedido editavel exibe a acao secundaria `Fechar com o fornecedor`, usando o
PATCH/status existente com FECHADO_FORNECEDOR. Exige a permissao atual de
alterar status; entrega confirmada, financeiro, GEO, historico e sincronizacoes
continuam no servico original. Fechamento usa lock UPDATE/idempotencia por
estado; botoes compartilham trava contra duplo envio. Edicoes nao salvas
impedem fechar. Nao cria titulos ou baixa valores pelo novo botao.

Logs `[PEDIDO_OPERACAO]` no stdout/PM2 registram inicio, marcos pesados,
falha/negativa e fim, com UTC, PID, ID do pedido/operacao, etapa, duracao,
memoria e causa tecnica classificada. Sem SQL, stack, body, justificativa,
nomes, documentos ou credenciais. Falha do logger nao impede a operacao.
Cobrem as execucoes que chegam ao controller de reabertura/status; rejeicoes
anteriores dos middlewares conservam seu tratamento atual. OOM fatal pode
interromper o processo antes do log final; correlacionar PID/marcos com o
erro nativo. Nao alterar heap, flags ou producao para habilitar estes logs.

QA: `npm run test:pedido-reabertura` em backend e frontend. Servicos/controller
em memoria, SQL MySQL gerado sem conexao e tela/HTTP reais com API interceptada;
26 itens,1366/390, entrega/GEO/ACL, rollback/replay, recibo202, commit incerto,
resposta perdida, rascunho e rota anterior. Sem EC2/DB/S3 reais ou migrations.
Handoff: [reabertura segura](../../handoffs/2026-10-21-pedido-reabertura.md).

Limite de regressao: validarAcessoPedidos.mjs para numa expectativa antiga
do menu RH (rota global adicional); teste, navegacao e ACL nao foram alterados
nesta entrega. Negativas/positivas de acesso ao pedido sao cobertas pelo novo
QA e validarAcessoPedidosEscopo.js. Homologacao real em DEV continua pendente.

Publicacao DEV autorizada posteriormente com roteiro exclusivo
`ops/deploy/atualizar-dev-pedido-reabertura-20261021.sh`: SHA fixado, identidade/
schema somente leitura, ff-only, .env preservado e restart somente backend-dev.
Sem migrations, dependencias, flags ou ajuste de memoria. Frontend pelo deploy
DEV da Vercel; main/producao fora da publicacao. Roteiro/guardas no handoff acima.

## Motivo de encerramento sem pedido no historico - 2026-10-20

Novos encerramentos pelo botao `Encerrar sem pedido` incluem a justificativa
no texto do evento `COTACAO_ENCERRADA_SEM_PEDIDO` do historico da solicitacao
principal: somente o motivo informado, sem resumo do encerramento ou do saldo.
Data, responsavel, acao e transicao de status do registro continuam visiveis.
O motivo continua salvo no fechamento e nos metadados existentes. Antes,
esses dados existiam, mas o texto exibido pelo historico nao os incluia.

Sem alteracao de UI, limites da justificativa (10 a 2000 caracteres), permissoes,
escopo, confirmacao, idempotencia, status ou pedidos existentes. Registro usa
a mesma transacao; falha no historico impede concluir o encerramento. Reenvio
idempotente nao duplica o evento. Sem migration/backfill de encerramentos antigos.

Validacao isolada: `node scripts/validarEncerramentoSemPedidoHistorico.js` no
backend; servico/controller reais com modelos/transacao em memoria, sem banco.
Regressao: `node scripts/validarCompraCotacaoEnvio.js`. Handoff em
[motivo no historico](../../handoffs/2026-10-20-encerramento-sem-pedido-historico.md).

## Boletos dos titulos de pedido na fila e historico - 2026-10-16

Os arquivos enviados por Compras na geracao dos titulos do pedido conservam
os tipos `BOLETO_COMPRA` e `BOLETO_FRETE`. A fila e o modal de arquivos aceitam
esses tipos junto com `BOLETO`, excluindo anexos removidos. A lista identifica
compra/frete; conferir documento e parcela antes de pagar. A vinculação continua
sendo por solicitacao/pedido, nao uma associacao nova e automatica a cada parcela.

Novo anexo do pedido registra `ANEXO_ADICIONADO` na mesma transacao dos titulos,
com anexo/documento/pedido, caminho, autor e origem Compras. Retry nao duplica
evento nem arquivo. Falha de auditoria propaga para rollback. Nao copia o S3.

Arquivos antigos sem evento aparecem em `Boletos dos pedidos` no Historico da
solicitacao, via consulta autorizada dos anexos ao expandir o bloco. Nao executa
backfill nem inventa data/autoria de evento; novos eventos nao sao duplicados
nessa lista. Presign/download seguem os endpoints e ACL existentes; exclusoes
e escopo sao preservados. Nenhuma migration ou mudanca de valores/baixas.

Validacao isolada: `npm run test:boletos-pedido` em backend e frontend.
Homologacao real em DEV ainda necessaria; sem operacoes em producao nesta etapa.

## Compra consolidada / titulos compartilhados - 2026-10-16

Em pedido fechado e adotado no fluxo financeiro, `Gerar titulos compartilhados`
permite buscar outras solicitacoes/pedidos visiveis e consolidar a divida do
mesmo fornecedor. Obras e CNPJs devedores diferentes **nao bloqueiam a criacao**.
Cada parcela e um titulo unico, vinculado a todas as origens, com participacoes
por empresa/obra/pedido; nao duplicar o valor total em cada pedido.

Pedidos participam pelo total fechado do fornecedor, incluindo frete embutido;
frete de terceiro permanece no fluxo separado e precisa estar regularizado.
Nao substitui cotacao, fechamento de pedido, aprovacao ou gestao de fretes.
Origens ja tituladas, pedidos legados nao adotados e fluxos especializados nao
podem ser reintroduzidos como nova divida. Permissoes/modulo/visibilidade atuais
sao revalidados na busca, previa e confirmacao, inclusive em retry.

Conferir credor/favorecido, forma, instrucoes, empresa/CNPJ de cada origem e
parcelas; aceitar a previa para gerar. Alterar qualquer condicao exige nova
conferencia. Duplo clique/retry da mesma chave nao gera outra leva. Baixa parcial,
estorno e cancelamento integral sem pagamentos conservam os vinculos/auditoria.
Pedido mostra sua participacao; operacoes financeiras sobre o titulo inteiro
exigem escopo de todas as obras e as permissoes financeiras atuais.

Homologar em dev: duas obras/CNPJs, mesmo fornecedor, duas parcelas com centavos;
conferir um unico titulo por parcela em todas as origens/fila; baixar parcialmente,
estornar, conferir saldos/relatorios por empresa e repetir envio; testar usuario
sem acesso a uma origem. Testar cancelamento integral com motivo, negativa com
pagamento/fila ativa e bloqueio de duplicacao pelo fluxo individual.

Migration nova `202610160001_titulos_compartilhados.js` ainda nao aplicada nesta
etapa local. Detalhes, limites e caminhos preservados (inclusive bancario
automatico) no [README Financeiro](../financeiro/README.md#titulos-compartilhados-entre-origens-e-cnpjs---2026-10-16).

## Compra Direta: quantidade e frete depois da criacao - 2026-10-15

No detalhe, `Gerenciar todos os itens` e `Editar` permitem alterar a quantidade
de itens cadastrados ou manuais (ate duas casas decimais, conforme o schema).
O preco unitario e preservado; a compra e recalculada, mantendo o desconto total
e redistribuindo-o entre itens. As apropriacoes do item alterado conservam seus
destinos e proporcoes. A divisao entre formas de pagamento acompanha o novo
total do fornecedor proporcionalmente, com fechamento de centavos.

`Frete da compra` usa o modelo existente: sem frete, embutido ou pago a terceiro;
valor global ou por item. Terceiro exige credor fornecedor ativo, vencimento e
forma ativa (exceto FOPAG); favorecido ativo e PIX quando aplicavel. Boleto novo
deve vir do upload temporario do proprio operador; boleto existente nao excluido
pode ser mantido. O anexo entra na mesma transacao, sem duplicacao por repeticao.
Frete embutido integra o valor do fornecedor; terceiro integra apenas o total
da solicitacao. A regra financeira abaixo substitui a preservacao integral de
titulos apenas para a acao FRETE, conforme autorizacao posterior do proprietario.

Permissoes novas, nominais, independentes da edicao de apropriacoes:

- `compras.compra_direta.editar_quantidade`;
- `compras.compra_direta.gerenciar_frete`.

Exigem tambem leitura/criacao para revisar a compra, modulo habilitado, escopo
e interacao no setor atual da solicitacao. Bypass administrativo existente
permanece. A permissao de frete libera somente seu catalogo de formas e upload
temporario, sem conceder criacao de compras, acesso geral ao Financeiro ou a
cadastros. A sincronizacao e uma consequencia restrita da gestao do frete,
validada no servidor; nao aceita IDs/valores arbitrarios de titulos pelo corpo.

PATCH `/compras/solicitacoes/:id/gestao-compra-direta` recebe acao, motivo e
`revisao_gestao` da consulta. Locks na solicitacao, compra e itens serializam
escritas; revisao de conteudo impede salvar sobre outra edicao. Repeticao igual
nao cria auditoria duplicada. Compra cancelada/nao direta e recusada. Falha em
validacao ou auditoria reverte a transacao inteira.

**Quantidade continua sem alterar titulos. Ao salvar FRETE:**

- Embutido: aplica somente a diferenca do frete, sem aproveitar diferencas de
  quantidade anteriores. Atualiza titulos do fornecedor em ABERTO/PREVISAO e sem
  baixa, proporcionalmente quando ha varias parcelas, com centavos exatos.
  Rateios financeiros e fila pendente sem baixa/conferencia acompanham o valor.
- Havendo titulo do fornecedor pago/parcial ou movimento ativo: preserva os
  originais e cria complemento apenas do acrescimo, com origem rastreavel e
  rateios/dados de pagamento do fornecedor. Reducao exige acerto no Financeiro.
- Terceiro: gera titulo PAGAR separado automaticamente, mesmo antes da geracao
  do fornecedor. Se ja existe, atualiza somente o necessario; com pagamento,
  acrescimo gera complemento separado e reducao/troca de favorecido e bloqueada.
  Remocao de frete nao pago cancela seu titulo e eventual fila ainda pendente.
- Sem titulo do fornecedor, embutido segue no valor da geracao inicial normal.
  O formulario Financeiro omite frete terceiro ja gerado. Backend verifica a
  divisao e a revisao sob locks; regenerar o fornecedor e recusado. Fretes da
  geracao inicial recebem marcador de origem validado pelo servidor.
- Nunca cria baixa, debita conta ou envia titulo automaticamente a fila ou a
  autorizacao. Terceiro sem classificacao existente nasce sem categoria/DRE e
  deve ser conferido/classificado pelo Financeiro antes do uso gerencial.
- Negociacao, cartao/fatura, impostos/desconto, cobranca/cheque emitido, retorno
  bloqueado, integracao externa ou autorizacao ativa exigem regularizacao pelo
  Financeiro antes de reescrever um titulo. Vinculo legado ambiguo e bloqueado
  para nao cobrar frete duas vezes. Credor/forma/empresa/favorecido sao validados.
- Compra, anexo, titulos, rateios, fila e auditoria compartilham a transacao.
  Repeticao identica nao duplica titulos. Revisao obsoleta/conflito de lock
  exige reabrir e conferir; nao ha repeticao cega de criacao.

Descricao/PDF historicos de criacao nao sao reescritos; novos valores ficam nos
dados estruturados, no total e na auditoria. Sem migration ou alteracao de banco
real nesta implementacao.

Testes: backend `validarCompraDiretaGestao.js`, `validarCompraDiretaFreteFinanceiro.js`,
`validarCompraDiretaGeoAcesso.js`; frontend `validarCompraDiretaGestao.mjs` e
`validarTituloSolicitacaoAtualizacao.mjs --frete` (desktop/mobile).
[Handoff financeiro](../../handoffs/2026-10-15-compra-direta-frete-financeiro.md).

## Remocao isolada de arquivo financeiro do pedido - 2026-10-13

Documentos financeiros possuem vinculo proprio; excluir titulos nao remove
boletos do pedido. Remover anexo agora abre confirmacao e desvincula somente
arquivo_url/arquivo_nome do documento, com auditoria no historico da solicitacao.
Preserva metadados, titulos, baixas, anexos da solicitacao e objeto armazenado.
Boleto sem arquivo sai da lista; notas/comprovacoes sem arquivo podem continuar
como registro de numero/documento. Nao e exclusao global do arquivo.

DELETE `/compras/pedidos/:id/financeiro/documentos/:documentoId/arquivo` exige
as permissoes existentes de anexar documento financeiro do pedido E excluir
anexo de solicitacao, alem do mesmo escopo/ACL do pedido. O documento deve
pertencer ao pedido da URL. Transacao e locks tornam repeticao idempotente;
falha de auditoria reverte a desvinculacao. Confirmacao tem mutex/botao bloqueado.
Atualizar documentos preserva pagamentos em preenchimento se seus dados-base
nao mudaram. Sem nova permissao, migration, consulta real ou exclusao fisica.

Testes: `validarPedidoDocumentoRemocao.js`, `validarPedidoBoletoOpcional.js`,
`validarPedidoBoletoOpcionalUI.mjs` e `validarWorkspacePiloto.mjs --pedido-only`.
[Handoff](../../handoffs/2026-10-13-pedido-anexos-fila-cabecalho.md).

## Boleto opcional na criacao de titulos do pedido - 2026-10-13

Compras pode criar titulos do pedido com forma Boleto sem anexar o arquivo,
tanto para o fornecedor quanto para frete pago a terceiro. Se informados,
os boletos continuam registrados no pedido e na solicitacao pela mesma
transacao, aceitando multiplos arquivos. Categoria, favorecido, valores,
vencimentos, permissoes e escopo continuam obrigatorios conforme o fluxo atual.
Nao altera exigencias da Nova Solicitacao, autorizacao/baixa de pagamentos,
comprovantes nem dados existentes. Sem migration.

Testes locais: `node scripts/validarPedidoBoletoOpcional.js` no backend e
`node scripts/validarPedidoBoletoOpcionalUI.mjs` no frontend, sem banco real.

## Delegacao: abrir em outra aba - 2026-10-12

Abrir preserva a Delegacao e abre uma aba interna para a solicitacao
principal; sem principal, abre o detalhe da compra. Filtro e edicoes nao
salvas ficam em memoria, isolados por usuario/escopo/aba, sem cache de DTO.
Ao retornar, o mesmo GET com contexto/visao delegacao atualiza a lista;
403 limpa registros, usuarios e alvos antigos. Salvamento continua usando
o endpoint e permissoes existentes, bloqueando saida enquanto em andamento.
Limite de 12 abas nao substitui a tela de origem. Sem provider/piloto,
o Abrir conserva o comportamento legado. Sem banco ou migration.

## Titulo e data da necessidade - 2026-10-11

Solicitacao de Compra e Compra Direta possuem titulo opcional no cabecalho,
ate 255 caracteres. Rascunho e revisao preservam o campo; a descricao da
solicitacao principal o inclui para a pesquisa existente, sem ampliar acesso.

Compra comum exige Necessario para no cabecalho e no POST de criacao,
independentemente das datas dos itens. Rascunho incompleto pode ser salvo,
mas precisa da data para criar. Compra Direta conserva Data de vencimento.
Nenhum registro existente e reescrito, sem migration para esses campos.

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

Depois do envio GEO para Compras, usuarios GEO com permissao de visualizar
podem continuar consultando o detalhe da compra que possui encaminhamento
auditado do GEO, desde que tambem tenham acesso a solicitacao principal.
Essa excecao e opt-in somente nos GETs de detalhe e de itens por solicitacao;
nao amplia listas gerais de Compras, cotacoes, pedidos ou permissoes de escrita.
Nenhuma permissao do usuario e alterada automaticamente.

Na aba de etapas da solicitacao, uma falha ao recarregar depois de uma acao
gravada nao anuncia falha de envio. O sucesso permanece informado com aviso
de atualizacao pendente; uma negativa real da gravacao continua como erro.
Duplo clique continua bloqueado ate o fim do processamento.

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

### Acoes granulares e cartoes do pedido (13/10/2026)

- O rodape do comparativo tambem aparece quando nao ha respostas comparaveis. Cada acao e exibida pela sua permissao granular; `encerrar_sem_pedido` nao concede geracao de pedidos.
- Bloqueios de contexto, setor, status ou saldo mantem a acao desabilitada com explicacao. As regras de escrita do backend e a visibilidade da solicitacao nao foram ampliadas.
- O formulario financeiro do pedido autorizado recebe somente identificacao minima dos cartoes ativos (id, nome, tipo e ultimos digitos). Resumos leves nao consultam cartoes.
- Credito/debito permitem escolher o cartao compativel e informar a data da compra, inclusive no frete de terceiro. O backend revalida os instrumentos e usa a criacao financeira canonica: credito vincula parcelas as faturas, debito usa a conta cadastrada no cartao.
- A curadoria existente das formas de pagamento permanece igual; apenas a propriedade `gera_fatura` foi incluida na resposta para descrever corretamente o fluxo de credito.
- Os testes simulam usuario comum de Compras com permissoes explicitas, sem acesso ao cadastro real de Luiz Afonso Pirovani Barradas. Homologar esse usuario em dev antes da publicacao.
- Validacoes: `validarPedidoBoletoOpcional.js`, `validarCartaoOpcionalSolicitacao.js`, `validarPedidoBoletoOpcionalUI.mjs` e `validarWorkspacePiloto.mjs --correcoes-only`, com regressoes de escopo/seguranca e build. Sem migration de Compras. Handoff: `docs/handoffs/2026-10-13-compras-acoes-granulares-cartoes.md`.

### Comparativo e superadmin (12/10/2026)

Cards/Mapa sao controles de leitura, separados do bloqueio de gravacao da
cotacao embutida. Em acompanhamento, visualizar nao habilita criar fornecedor,
responder, comentar, encerrar, cancelar ou gerar pedido. SUPERADMIN efetivo
na sessao nao depende do setor principal para operar a solicitacao autorizada.

Quantidade comprada seleciona o texto ao receber foco. Apagar/zerar durante
a digitacao mantem checkbox, campo e foco; somente desmarcar explicitamente
remove a alocacao. Encerramento rejeita selecao com quantidade vazia/zero,
mantendo as validacoes existentes de saldo, disponibilidade e idempotencia.
No mapa mobile, as colunas de referencia rolam para nao cobrir os controles;
em desktop continuam fixas. Testes reais de UI em 1366/390px:
`node frontend/scripts/validarWorkspacePiloto.mjs --correcoes-only`.

### Navegacao incremental E3a (12/10/2026)

Listas de Solicitacoes de Compra, Pedidos e Cotacoes preservam busca e
filtros em memoria por usuario/aba; selecao de solicitacoes e revalidada no
GET de retorno. Tabela preserva janela e rolagem; nao guarda os registros
consultados. Detalhes abrem em outra aba interna, mantendo origem e
reutilizando o registro ja aberto. Portais publicos continuam externos.
401/403 limpam resultados e respostas atrasadas nao restauram acesso.
Parametros das consultas, permissoes, visibilidade e endpoints de negocio
continuam iguais. Nao prometer rascunho de wizard/editor de cotacao/pedido
neste lote nem recuperacao apos F5/logout.

No cadastro rapido da cotacao, CNPJ mostra Nome fantasia (exigencia do
servico central ja existente); CPF dispensa esse campo. Nome e CPF do
representante legal nao sao exibidos nem exigidos nesse card. O cadastro
geral de Pessoas permanece completo. Criar fornecedor e gerar links sao
bloqueados durante a gravacao do cadastro rapido, evitando concorrencia.

Testar compra normal e direta, destinos iniciais, compatibilidade de registros antigos, credor, itens cadastrados/manuais, importacao, rateio, edicao de apropriacoes, permissoes, cancelamento, cotacao, pedido, relatorios de compras e registros de origem.
