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

## Edicao de valor e vencimento

- Nos detalhes, `Editar valor` e `Editar vencimento` ficam no cabecalho.
  Na lista ativa (tabela ou cards), o icone de lapis fica junto a cada dado.
  A lista de arquivadas permanece somente leitura.
- Cada acao exige sua permissao: `solicitacoes.acoes.alterar_valor` ou
  `solicitacoes.acoes.alterar_data_vencimento`. Excecoes administrativas
  existentes permanecem alinhadas ao backend; escopo de obra segue validado
  pelo servidor.
- O modal edita somente um campo por vez e fixa o ID/codigo ao abrir.
  Durante a PATCH, impede novo envio e fechamento. Erro preserva o rascunho;
  cancelar nao grava; salvar sem alteracao nao faz PATCH.
- Valor editado e o total proprio da solicitacao, nao o saldo restante.
  Entrada brasileira: `2.000` ou `2.000,00` significa dois mil reais.
  Valores negativos/invalidos nao sao enviados. Zero e limpeza do valor
  continuam aceitos conforme o endpoint existente.
- Vencimento aceita hoje/data futura em Sao Paulo ou limpeza, mantendo a
  regra vigente do backend. Quando a lista mostra vencimento derivado de
  medicao, o editor usa `data_vencimento_solicitacao` e explica a diferenca.
- As rotas existentes `/solicitacoes/:id/valor` e
  `/solicitacoes/:id/data-vencimento` preservam historico, notificacoes,
  realtime e auditoria. Nenhum titulo, parcela contratual, item de compra,
  rateio ou status e recalculado por esta edicao.

Validacoes isoladas: `npm run test:solicitacoes-edicao-ui` no frontend e
`node scripts/validarEdicaoDadosSolicitacao.js` no backend. Sem banco/rede
externa, migration, nova permissao ou variavel de ambiente.

## Cadastro de credor e favorecido

Nome e CPF do representante legal sao opcionais no cadastro geral, inclusive
nos detalhes da solicitacao. CPF preenchido deve ser valido. Na Nova
Solicitacao, o modal de credor nao exibe nome, CPF ou cargo do representante;
nome fantasia continua disponivel e obrigatorio para nova PJ no cadastro
completo. Endereco, primeira chave PIX, permissoes e configuracao do cadastro
mantem suas regras. O modal rapido de favorecido permanece sem representante.

A qualificacao obrigatoria pertence ao fluxo proprio do contrato acima do
limite juridico configurado. Ocultar o cadastro do representante nao apaga
informacoes existentes nem dispensa essa validacao contratual.

O cadastro na Nova Solicitacao usa o comportamento real do tipo ativo,
incluindo o padrao habilitado do fluxo de contrato novo. A configuracao de
`cadastro_credor` por area/tipo/subtipo continua prevalecendo: desabilitar
o campo bloqueia tambem o endpoint. A tela envia o subtipo selecionado no
cadastro; esses campos de contexto nao sao gravados no parceiro. Tipos
inativos ou inexistentes nao permitem cadastro por esta rota.

Validacao isolada, sem banco ou rede:
`npm run test:cadastro-credor-tipo-subtipo` no backend. Exercita controller,
resolvedor e handler do frontend reais, com persistencia simulada.
Nao exige migration, nova permissao ou variavel de ambiente.

## Anexos removidos do historico

Ao remover um anexo, a linha original fica preservada para auditoria, mas
exibe `Anexo removido — arquivo indisponivel` em vez de Visualizar, Download e
Remover. O evento de remocao permanece no historico. Remocoes anteriores sao
reconhecidas pelos eventos existentes, sem atualizacao direta no banco.
A confirmacao pode ser cancelada; enquanto envia, a tela impede repetir a acao.
Falha de permissao ou de gravacao nao remove o arquivo da tela.

As regras de acesso e os limites de revogacao estao em
[Seguranca de anexos](../../seguranca/anexos.md).

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

## Recarga de cartoes por obra e centro de custo

O fluxo aceita o tipo Recarga de Cartao e subtipos marcados com
`usa_fluxo_recarga_cartao`. O subtipo pode ser vinculado ao tipo comum fixo do
Centro de Custo, sem trocar o tipo principal. Contrato novo, medicao, cadastro
de obra e tipos exclusivos do sistema nao aceitam essa combinacao.

Configuracao pela interface, depois da migration estrutural:

1. Em `Subtipos de Solicitacao`, criar/editar o subtipo, marcar o fluxo de
   recarga e vincular ao tipo principal disponivel no Centro de Custo.
2. Em `Cartoes de recarga`, informar as obras/centros atendidos por cada cartao.
   Empresa, fornecedor e categoria financeira continuam obrigatorios.
3. Na Nova Solicitacao, selecionar a origem, o subtipo quando aplicavel, os
   cartoes e um valor por cartao. O total e calculado, nao digitado separadamente.

Qualquer usuario com acesso normal a origem pode selecionar seus cartoes
ativos, sem vinculo individual usuario-cartao. Isso nao dispensa permissoes
de criacao, visualizacao e interacao da solicitacao. Os vinculos individuais
antigos permanecem para compatibilidade; nao liberam novas recargas sem
vinculo do cartao a origem. Nenhuma origem e atribuida automaticamente aos
cartoes existentes: o administrador deve configurar os vinculos pela tela.

Uma solicitacao comporta ate 30 cartoes distintos, com titulo e prestacao
independentes. Criacao, titulos e distribuicao gerencial do Centro de Custo
usam a mesma transacao. Locks de cartao e ciclo anterior impedem repetir uma
recarga ativa. Valor zero, repeticao de cartao e soma divergente sao rejeitados.

A prestacao possui rateios e comprovantes por cartao. Documento de um cartao
nao satisfaz a exigencia de outro. Em solicitacoes multiplas, o tipo do anexo
e `PRESTACAO_RECARGA_<id da recarga>`; solicitacoes de um cartao preservam
`PRESTACAO_RECARGA`. As acoes indicam `recarga_id`; omiti-lo num conjunto
com varios cartoes e erro, evitando operar o primeiro por engano. Obras exigem
apropriacao analitica valida; Centros de Custo nao usam apropriacao de obra.

A primeira baixa nao devolve o conjunto ao setor solicitante enquanto existir
cartao sem pagamento. Quando todos os ciclos financeiros estiverem encerrados,
Obras preservam o retorno para OBRA e Centros de Custo retornam ao setor
criador. Cada prestacao e enviada e validada separadamente; o conjunto segue
para GEO/ATENDIDO depois de todas serem enviadas e fica APROVADA depois de
todas serem validadas. Atualizar um cartao nao apaga o formulario em andamento
dos demais. A regra financeira de PAGA/PARCIALMENTE PAGO esta no
[modulo Financeiro](../financeiro/README.md#recargas-de-cartoes).

Implementacao: `recargaCartaoService`, `RecargaCartaoController`,
`SolicitacaoController`, `operationalValidators`, `TipoSubContratoController`,
`CartaoRecargaObra`, componentes de recarga e `NovaSolicitacao`.
Migration: `202610070004_recargas_multiplos_cartoes_origens.js`, somente
estrutura, sem inserir cadastros ou atualizar dados de negocio existentes.
Validacao isolada: `cd backend && npm run test:recargas-multiplas`.

## Encaminhamento atual, compatibilidade e automacoes

Novas solicitacoes abertas pela tela entram em `GEO / PENDENTE`; o navegador nao pode substituir esse destino por payload. Os campos e endpoints de diretoria permanecem no backend somente para compatibilidade com registros antigos que ja possuam `fluxo_aprovacao_diretoria = true`; eles nao devem ser reutilizados para criar novos fluxos. Prioridades da diretoria continuam sendo um dominio operacional separado e nao alteram o setor responsavel. A configuracao `Tipos por Setor (Recebimento)` continua controlando visibilidade e modo de recebimento depois que a solicitacao chega a um setor, mas nao controla o catalogo de abertura. Automacao por status so ocorre depois de uma transicao valida e nao pode ignorar permissoes ou consistencia.

## Retorno e devolucao ao setor anterior

Apos o retorno aprovado, quem o solicitou (ou SUPERADMIN) continua vendo a
faixa e a acao `Devolver solicitacao`. A confirmacao identifica o setor que
aprovou o retorno, registrado no pedido original. A devolucao preserva status
e titulos, respeita permissao/pendencias/cancelamento e usa a transacao e
protecao contra repeticao existentes. Colegas nao concluem o pedido alheio.

Pedidos de retorno geram um pop-up informativo abaixo do sino, com acao para
abrir a solicitacao. O canal consulta somente notificacoes nao lidas do
usuario autenticado via `GET /notificacoes?retornos_para_decisao=1`; revalida
permissao `solicitacoes.retorno.decidir`, visibilidade, setor atual e pedido
PENDENTE. Pedidos decididos, cancelados, de setor antigo ou sem acesso nao
geram o aviso. A configuracao do evento `RETORNO_SOLICITADO` continua vigente.

Atualizacao a cada 30 segundos, ao retomar a janela e no evento local de
atualizacao. Dispensa nao marca leitura; abrir usa o fluxo existente do sino
e marca a notificacao lida. A sessao do navegador evita repetir um pop-up ja
exibido, separadamente por usuario. O sino e os avisos de sucesso/erro continuam
independentes; falha do canal nao bloqueia operacoes nem aprova pedidos.

Testes sem banco: `node backend/scripts/validarDevolucaoRetornoSolicitacao.js`,
`node frontend/scripts/validarDevolucaoRetornoSolicitacao.mjs` e
`cd frontend && npm run test:retorno-popup-ui`. Sem migration ou ativacao nova.

## Dependencias

- recebe obra e apropriacao de `OBRAS`;
- recebe parceiro do cadastro mestre;
- recebe contrato de `CONTRATOS` quando habilitado;
- pode originar `COMPRAS` e `FINANCEIRO` por acoes explicitas e idempotentes;
- publica historico e notificacoes para os interessados.

## Permissoes e seguranca

O acompanhamento historico entre setores reconhece tanto `ENVIADA_SETOR`
quanto `SOLICITACAO_COMPRA_ENCAMINHADA_COMPRAS`. No segundo evento, origem e
destino sao lidos de `metadata.area_anterior/area_nova`, nao do ID numerico do
setor do ator. Isso mantem as compras ja encaminhadas visiveis para GEO na
lista, contadores, busca, detalhe e anexos conforme as permissoes existentes.
Historicos antigos sao reconhecidos na leitura, sem backfill ou nova migration.
Os caminhos JSON construidos no SQL usam `CHAR(36 USING utf8mb4)`: `CHAR(36)`
sem charset gera binary e provoca `ER_INVALID_JSON_CHARSET`, interrompendo
listagem e contadores. Validacao isolada: `node backend/scripts/validarAcompanhamentoGeoCompras.js`.
Para verificar a execucao real no MySQL configurado, executar no backend
`node scripts/validarAcompanhamentoGeoComprasMysql.js --somente-leitura`.
Esse teste usa apenas SELECT sobre fixtures constantes, sem ler tabelas de
negocio, alterar registros ou criar estruturas.
O acompanhamento nao permite editar/comentar fora do setor principal: o fluxo
de retorno e as validacoes de escrita continuam obrigatorios.

Visibilidade combina perfil, setores, obra, autoria, atribuicao, historico e configuracoes especiais. Filtros e exportacao devem usar o mesmo universo autorizado da listagem. O frontend apenas oculta acoes; o backend revalida detalhe, anexos, status, envio, assuncao e exportacao.

## Mudanca segura

Alteracoes em status, area, tipo, obra, parceiro ou apropriacao exigem testes do catalogo comum de Obras, catalogo explicito de Centro de Custo, Cadastro de Obra sem origem, criacao inicial em GEO/PENDENTE, rejeicao de payload com tipo nao permitido, compatibilidade de registros antigos de diretoria, detalhe, listagem, filtros, exportacao, prioridades, automacao, compras, contratos, financeiro, notificacoes e usuarios multissetor.
