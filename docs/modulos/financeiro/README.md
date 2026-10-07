# Modulo FINANCEIRO

## Papel e propriedade

Financeiro e dono de titulos a pagar/receber, parcelas financeiras, movimentos, baixas, estornos, contas bancarias, categorias, conciliacao e calculos de previsto/realizado. Modulos de origem nao podem criar movimentos diretamente.

## Titulos

- tipo obrigatorio `PAGAR` ou `RECEBER`;
- origem pode ser solicitacao, compra, comercial, RH/DP ou lancamento manual;
- parceiro, empresa, categoria, vencimento e valor devem ser consistentes;
- referencia de origem deve impedir titulo duplicado;
- status e saldo derivam dos movimentos ativos;
- edicao de titulo movimentado possui restricoes e auditoria.

## Cartao na geracao pela solicitacao

Na aba Financeiro dos detalhes da solicitacao, o cartao utilizado e opcional
para as formas Cartao de Credito e Cartao de Debito. Sem cartao informado,
o titulo nasce em `ABERTO`, sem baixa, movimento, fatura ou quitacao automatica.
Com cartao informado, continuam as validacoes de atividade, tipo e conta
pagadora e a quitacao automatica existente (credito com fatura ou debito).
A escolha explicita de `PREVISAO` preserva o comportamento de previsao.

A baixa posterior pelo Financeiro exige informar o cartao efetivamente
utilizado e registra o pagamento no titulo original. Parcelamento, datas,
rateios, empresa e permissoes existentes permanecem inalterados. Esta
dispensa pertence somente ao servico `criarTituloPorSolicitacao`, chamado
por `POST /solicitacoes/:id/gerar-conta` com `financeiro.titulos.criar`;
nao e flag de payload e nao dispensa cartao no lancamento manual nem na baixa.
Nao requer nova permissao, variavel ou migration.

Validacao sem banco: `npm run test:cartao-opcional-solicitacao` no backend.
Formulario real com APIs simuladas: `npm run test:cartao-opcional-solicitacao-ui`
no frontend, com Playwright e Chrome disponiveis.

## Recargas de cartoes

Uma solicitacao de recarga pode conter varios cartoes. Cada cartao gera seu
proprio titulo PAGAR em PREVISAO, com fornecedor, empresa e categoria do
cadastro do cartao. A liberacao da solicitacao abre todos os titulos ainda em
previsao; baixa e prestacao de contas continuam separadas por cartao.

O status agregado fica `PARCIALMENTE PAGO` enquanto houver cartao com valor
pendente e muda para `PAGA` quando todos estiverem integralmente pagos. A
regra anterior de recarga parcial permanece: a baixa encerra o titulo pelo
valor efetivamente pago e registra o valor nao recarregado no ciclo; esse caso
mantem o agregado parcial. Estornos nao foram ampliados nesta entrega e devem
seguir as restricoes financeiras existentes.

A primeira baixa nao retira do Financeiro uma solicitacao com outros cartoes
aguardando pagamento. Quando todos os ciclos estiverem pagos ou cancelados,
o retorno ocorre para OBRA ou, em Centro de Custo, para o setor criador.
Prestacao validada grava somente os rateios do titulo daquele cartao e libera
sua classificacao de custo. Repetir a sincronizacao sem nova baixa nao desfaz
o status ATENDIDO/APROVADA da prestacao.

Configuracao, documentos e escopo:
[Recarga de cartoes por origem](../solicitacoes/README.md#recarga-de-cartoes-por-obra-e-centro-de-custo).
Implementacao: `recargaCartaoService` e `solicitacaoFinanceiroStatusService`.
Validacao sem banco: `npm run test:recargas-multiplas` no backend.

## Importacao em massa de contas a pagar

A importacao em massa esta implementada no repositorio e depende da migration `202607200001_financeiro_titulos_importacao.js` no ambiente de destino. O fluxo e exclusivo para `PAGAR`: o usuario exporta o modelo versionado em Contas a Pagar, envia o `.xlsx`, revisa o preview persistido e confirma a criacao atomica.

- permissao especifica `financeiro.titulos.importar`;
- `empresa_codigo` + `obra_codigo` identificam a obra pela referencia operacional conhecida pelo usuario; `apropriacao_codigo`, quando informado, identifica a apropriacao dentro dessa obra; o backend resolve os IDs internos e deriva da obra a empresa e a DRE do titulo;
- `credor_cpf_cnpj` identifica o parceiro pelo documento visivel na tela, com ou sem mascara, e `categoria_nome` usa o nome exibido no cadastro;
- o modelo de importacao nao expoe IDs internos de obra, credor, categoria ou apropriacao e bloqueia referencias inexistentes, ambiguas, inativas ou fora do escopo;
- o credor e global e pode representar colaborador cadastrado em outra empresa;
- em Contas a Pagar, o filtro de credor pesquisa todos os parceiros ativos do cadastro central, incluindo credores e fornecedores de Compras ja vinculados; a lupa abre a listagem completa com busca por nome ou CPF/CNPJ e rolagem responsiva;
- o modelo `1.4` separa as referencias em `EMPRESAS`, `OBRAS`, `APROPRIACOES`, `CREDORES`, `CATEGORIAS`, `FORMAS_PAGAMENTO` e `DOMINIOS`, todas com filtro e pesquisa do Excel; `CREDORES` informa se o favorecido bancario/PIX esta pronto;
- as listas suspensas usam essas abas, mas a planilha representa um retrato dos cadastros no momento da exportacao; para incluir referencias criadas depois, o usuario deve exportar um novo modelo;
- referencias sao revalidadas no preview e na confirmacao;
- parcelas, rateios e impostos usam abas relacionadas por `chave_importacao`;
- formulas, macros, linhas ocultas e colunas ocultas com dados sao rejeitadas;
- confirmacao exige `Idempotency-Key`, bloqueio transacional e rollback integral em erro;
- titulos recebem origem `IMPORTACAO` e nao criam baixas, movimentos, intents, faturas ou vinculos operacionais.

Detalhes tecnicos e cenarios de aceite estao em [`PLANO_IMPORTACAO_TITULOS_PAGAR.md`](./PLANO_IMPORTACAO_TITULOS_PAGAR.md).

## Baixa e estorno

- baixa pode ser parcial ou total;
- a baixa em massa lista somente formas ativas de `financeiro_formas_pagamento` e grava
  `forma_pagamento_id` no movimento, preservando `forma_recebimento` como classificacao
  tecnica retrocompativel;
- o tipo cadastrado dirige as regras existentes: `CARTAO_CREDITO` e `CARTAO_DEBITO`
  executam a regra `CARTAO`; formas como `FOPAG` podem permanecer distintas no cadastro
  e executar a regra `TRANSFERENCIA`;
- movimentos legados sem `forma_pagamento_id` continuam validos e as APIs antigas ainda
  podem enviar apenas a classificacao tecnica aceita;
- exige conta, data, valor base e ajustes de juros, multa ou desconto;
- transacao bloqueia pagamento acima do saldo;
- estorno marca o movimento como `ESTORNADO` e recalcula o titulo;
- estorno nunca remove a trilha;
- nova baixa depois do estorno e uma nova operacao auditada;
- comprovantes e conciliacoes vinculados precisam ser revistos.

## Fila manual de pagamentos

A Fila de Pagamentos separa a preparacao da carteira da execucao no banco. Em Contas a Pagar, quem possui `financeiro.fila_pagamentos.preparar` seleciona titulos abertos e os encaminha para a fila; o operador pode ter acesso somente a essa tela pelas permissoes do grupo `financeiro.fila_pagamentos`.

- a tela operacional e uma tabela responsiva com rolagem horizontal, sem modal de baixa;
- cada linha mostra titulo, credor/favorecido, documento, PIX ou codigo do boleto, vencimento, saldo e forma de pagamento;
- o operador informa data da baixa, conta pagadora e valor efetivamente pago; a empresa e derivada da conta bancaria e validada contra a empresa do titulo;
- valor exato registra baixa total, valor menor registra baixa parcial e cria alerta de divergencia, valor maior nao baixa e permanece divergente;
- `NAO_PAGO` mantem o titulo aberto e exige motivo;
- a grade de Contas a Pagar mostra na propria linha os estados `Em fila de pagamento`, `Pagamento nao realizado` e `Pagamento divergente`;
- titulos de cartao continuam no fluxo da fatura e nao entram nesta fila;
- o lote usa uma unica transacao e locks por titulo/item: se uma linha falhar, nenhuma baixa do lote e confirmada;
- uma chave de idempotencia protege criacao e processamento contra clique ou envio repetido.

Permissoes independentes: `visualizar`, `preparar`, `baixar`, `reportar` e `resolver`. Elas nao liberam as demais telas do Financeiro.

### Analise do proprietario e envio independente

Solicitar autorizacao exige `financeiro.autorizacoes_pagamento.preparar`.
Enviar para pagamento exige somente `financeiro.fila_pagamentos.preparar`,
em OFF, PILOT, ENFORCED e PAUSED. As permissoes sao independentes: quem
possui ambas ve os dois botoes. O envio direto usa a confirmacao habitual,
sem declaracao de autorizacao em papel ou permissao adicional. A auditoria
registra o responsavel pelo envio, sem simular assinatura do proprietario.

O status interno nativo `EM ANÁLISE DO PROPRIETÁRIO` pode ser aplicado
individualmente ou em massa com `financeiro.titulos.status_interno`.
Preparar um dossie digital aplica o mesmo status e atualiza as solicitacoes
vinculadas, sem mudar o setor, saldo ou status financeiro. Analise nao
significa autorizacao nem baixa. O ingresso efetivo na fila muda o status
interno para `ENVIADO PARA PAGAMENTO` e encaminha a solicitacao ao Financeiro.
Rejeicao ou invalidacao digital sinaliza ajuste; estados finais sao preservados.

A camada digital usa PWA, passkey, dossie isolado, segregacao entre preparador
e autorizador, revalidacao material e reuso transacional da fila atual.
Dossie ativo impede envio concorrente do mesmo titulo pela via direta.
O contrato, configuracoes e limites estao em
[`AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md`](./AUTORIZACAO_PROPRIETARIO_PAGAMENTOS_PWA.md).

Em OFF ou PAUSED, o botao de solicitar autorizacao permanece visivel para
quem tem a permissao, mas desabilitado. A marcacao manual de analise e o
envio direto continuam disponiveis pelas suas proprias permissoes. Este
ajuste nao exige migration, variavel nova ou seed de status em producao.

## Cheques de terceiros e baixa com multiplas fontes

Cheques recebidos de terceiros sao controlados em carteira de custodia, sem simular uma conta bancaria. O financeiro pode registrar/importar saldo legado, transferir a custodia entre empresas, depositar em conta da mesma empresa ou utilizar o cheque integralmente como um componente de uma baixa composta.

A baixa composta permite combinar Pix, transferencia, dinheiro, cartao e cheque conforme as formas ativas cadastradas, distribuindo cada fonte entre titulos `PAGAR` do mesmo credor e empresa. Preview, confirmacao e estorno sao atomicos, idempotentes e auditados. A baixa simples e a baixa em massa anteriores continuam disponiveis.

Regras, endpoints, permissoes e limites: [`CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md`](./CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md). Matriz operacional: [`MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md`](./MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md).

## Relatorios

- previsto: titulos `PREVISAO`, `ABERTO` ou `PARCIAL`, conforme periodo e data de corte;
- realizado: movimentos ativos;
- movimentos estornados nao compoem realizado;
- DRE por competencia e fluxo de caixa por movimento nao podem usar a mesma data sem regra explicita;
- Resultado de Obras deve refletir estorno imediatamente;
- toda agregacao deve permitir rastrear o lancamento de origem.

### Fluxo de caixa previsto x realizado

- historico planejado preserva o valor original do titulo para datas ja alcancadas;
- projecao futura usa o saldo ainda aberto e nao repete titulo quitado;
- realizado usa `data_movimento` e nunca trata data futura como baixa;
- comparativo limita previsto e realizado a mesma data de corte;
- datas futuras do realizado aparecem como indisponiveis, nao como zero acumulado;
- seletor oferece periodos historicos, atuais, futuros e intervalo personalizado;
- nas visoes por natureza, entradas sao verdes e saidas vermelhas; no comparativo,
  as cores distinguem previsto e realizado.

## Contrato de venda recebido por cheque

Quando a forma efetiva do contrato de venda e cheque, o titulo a receber deve nascer
quitado e o cheque permanece em carteira/custodia. A quitacao e o cadastro do cheque
sao atomicos e idempotentes. Devolucao do cheque reabre a obrigacao vinculada, sem
apagar a baixa ou a trilha anterior; os novos cheques podem compor nova baixa conforme
as regras da baixa composta.

## Conciliacao OFX

OFX serve para conferencia. Importacao bloqueia arquivo/transacao duplicada, sugere candidatos e exige confirmacao humana. Nao cria titulo nem baixa automaticamente.

Na conciliacao de transferencias, o sinal do OFX define o sentido financeiro: debito na conta atual significa conta atual para contraparte; credito significa contraparte para conta atual. Quando existir um unico lancamento pendente na outra conta, com mesma data e valor exatamente oposto, o sistema preseleciona a conta e vincula os dois OFX a uma unica transferencia. Empates permanecem manuais para evitar associacao indevida.

Conciliacoes podem ser estornadas pelo relatorio de Conciliacao bancaria quando o usuario possui `financeiro.conciliacao.estornar`. O fluxo reabre o lancamento OFX para conferencia manual e registra o motivo na auditoria. Transferencias sao canceladas, tarifas criadas pela conciliacao sao estornadas e vinculos com titulos, faturas ou movimentos preexistentes sao desfeitos sem apagar o registro financeiro original. O relatorio aceita filtros por periodo, conta, status, natureza, tipo de vinculo e texto do extrato.

Liberacoes e amortizacoes de credito rotativo sao registradas diretamente a partir do lancamento OFX pendente. Nao existe cadastro de linha de credito nesta fase: credito na conta gera `LIBERACAO_CREDITO_ROTATIVO` e debito gera `AMORTIZACAO_CREDITO_ROTATIVO`, sempre com valor e data derivados do extrato. Esses movimentos alteram o caixa, compoem o saldo de endividamento e aparecem nos relatorios de movimentacao, conciliacao e endividamento, mas nao recebem categoria financeira e nao compoem a DRE. O estorno devolve o OFX para `PENDENTE` e retira o movimento ativo dos saldos e relatorios.

Quando o banco credita a devolucao de uma tarifa ja registrada, o usuario usa `Acoes rapidas > Estorno de tarifa bancaria`. O sistema lista somente tarifas ativas da mesma conta, empresa e valor integral, com data igual ou anterior ao credito. A confirmacao cria `ESTORNO_TARIFA_BANCARIA` vinculado ao movimento original, reaproveita a categoria financeira e neutraliza caixa e DRE sem apagar nenhum dos dois registros. Uma tarifa nao pode receber dois estornos ativos; se houver mais de uma candidata, a escolha permanece manual e auditavel.

## Dependencias e risco

Recebe dimensoes de Parceiros, Empresas, Obras e Apropriacoes; recebe origens de Solicitacoes, Compras, Comercial e RH/DP; alimenta Obras, Provisionamento, Boletos, relatorios e Governanca. Qualquer mudanca em saldo, status ou movimento exige reconciliacao de todos esses consumidores.

## Idempotencia

Geracao de titulo, baixa, estorno, importacao OFX e conciliacao sao transacionais e protegidos contra repeticao. O frontend bloqueia duplo clique e o backend garante unicidade e estado valido.
