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

## Cheques de terceiros e baixa com multiplas fontes

Cheques recebidos de terceiros sao controlados em carteira de custodia, sem simular uma conta bancaria. O financeiro pode registrar/importar saldo legado, transferir a custodia entre empresas, depositar em conta da mesma empresa ou utilizar o cheque integralmente como um componente de uma baixa composta.

A baixa composta permite combinar Pix, transferencia, dinheiro, cartao e cheque conforme as formas ativas cadastradas, distribuindo cada fonte entre titulos `PAGAR` do mesmo credor e empresa. Preview, confirmacao e estorno sao atomicos, idempotentes e auditados. A baixa simples e a baixa em massa anteriores continuam disponiveis.

Regras, endpoints, permissoes e limites: [`CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md`](./CARTEIRA_CHEQUES_BAIXA_COMPOSTA.md). Matriz operacional: [`MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md`](./MATRIZ_SMOKE_CHEQUES_BAIXA_COMPOSTA.md).

## Relatorios

- previsto: titulos abertos ou parciais;
- realizado: movimentos ativos;
- movimentos estornados nao compoem realizado;
- DRE por competencia e fluxo de caixa por movimento nao podem usar a mesma data sem regra explicita;
- Resultado de Obras deve refletir estorno imediatamente;
- toda agregacao deve permitir rastrear o lancamento de origem.

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
