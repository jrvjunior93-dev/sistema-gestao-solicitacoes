# Carteira de cheques de terceiros e baixa com multiplas fontes

## Objetivo

Registrar cheques recebidos de terceiros como ativos sob custodia e permitir que um ou mais titulos a pagar do mesmo credor sejam quitados por uma composicao de operacoes financeiras, por exemplo Pix mais um ou mais cheques.

Cheque em carteira nao e conta bancaria e nao cria saldo financeiro ficticio. A conta bancaria somente e informada quando o cheque e depositado. Quando o cheque e entregue diretamente ao credor, ele e consumido como uma fonte da baixa composta.

## Regras de negocio

### Custodia do cheque

- todo cheque pertence a uma empresa do grupo;
- obra de origem e opcional para o saldo legado sem lastro conhecido;
- numero, titular, valor, vencimento e justificativa da origem sao obrigatorios;
- CPF/CNPJ do titular e opcional para saldos legados, mas, quando informado, deve ser valido; a interface aplica mascara e o backend persiste somente os digitos;
- nome e CPF/CNPJ consultam os parceiros ativos por autocomplete; a lupa abre a lista responsiva de cadastros e a selecao apenas copia os dados para o cheque, sem alterar o parceiro;
- a data operacional da custodia e a `data_entrada`; data de emissao nao e solicitada no cadastro nem no novo modelo de importacao;
- estados: `EM_CARTEIRA`, `UTILIZADO`, `DEPOSITADO`, `COMPENSADO`, `DEVOLVIDO` e `CANCELADO`; `RESERVADO` fica disponivel para evolucao futura;
- transferencia entre empresas altera a custodia e grava origem, destino, usuario e data;
- deposito exige conta bancaria ativa da mesma empresa, gera um movimento bancario proprio e exige chave de idempotencia;
- `DEPOSITADO` significa que o cheque foi enviado ao banco, mas o credito ainda nao foi confirmado;
- o cheque muda para `COMPENSADO` somente quando o credito do extrato e conciliado com o movimento do deposito;
- cheque utilizado em pagamento sai da carteira e fica ligado ao grupo, componente e movimentos da baixa;
- estorno integral da baixa devolve o cheque para `EM_CARTEIRA`, desde que nao exista movimentacao posterior;
- o estorno comum do recebimento que originou um cheque so e permitido enquanto ele ainda estiver em carteira;
- a devolucao do cheque reabre o titulo a receber de origem quando esse vinculo existe; cheque avulso continua sem titulo artificial;
- se o cheque ja tiver sido usado para pagar um fornecedor, a devolucao estorna primeiro esse pagamento e libera o titulo a pagar para nova forma de pagamento;
- a devolucao bancaria depois da compensacao e confirmada pelo par de lancamentos do extrato, gera movimento de saida e preserva os dois vinculos de conciliacao.

### Conciliacao dos cheques

- cheque proprio usado em conta a pagar permanece como baixa vinculada a conta bancaria e e conciliado quando o debito aparece no extrato;
- por ser pre-datado, o cheque proprio pode ser associado ao debito apresentado posteriormente, dentro da janela maxima de 180 dias;
- cheque de terceiro recebido nao movimenta saldo bancario no ato do recebimento: ele quita o cliente e entra na carteira;
- quando depositado, o cheque de terceiro gera `DEPOSITO_CHEQUE_TERCEIRO`; esse e o movimento que entra na conciliacao da conta;
- uma devolucao confirmada pelo extrato gera `DEVOLUCAO_CHEQUE_TERCEIRO`, anulando o efeito bancario do deposito sem apagar historico;
- movimentos de custodia sem conta bancaria nao entram no relatorio de movimentacao das contas.

### Saldo inicial legado e importacao

- o cadastro manual e a importacao representam saldo inicial sem lastro de obra identificado;
- a justificativa e obrigatoria e a origem tecnica e `SALDO_INICIAL_LEGADO`;
- a planilha aceita empresa, identificacao bancaria, titular, valor, datas, obra opcional e observacoes;
- preview e confirmacao sao separados;
- o preview permite corrigir, incluir e excluir linhas;
- a confirmacao revalida todo o lote, exige `Idempotency-Key` e usa uma unica transacao;
- uma linha invalida impede todo o lote;
- a identificacao de possivel duplicidade e validada pelo servico. A migration nao cria unicidade retroativa que possa falhar por duplicidades historicas.

### Baixa composta

- somente titulos `PAGAR`, abertos ou parciais;
- todos os titulos devem pertencer ao mesmo credor; podem estar vinculados a empresas diferentes do grupo;
- cada componente usa uma forma de pagamento ativa cadastrada no sistema;
- cartao de debito pode compor o grupo; cartao de credito que gera fatura permanece na baixa simples, pois esse fluxo altera vencimento e vinculo da fatura;
- cada componente informa sua empresa fonte; conta bancaria, cartao ou cheque devem pertencer a essa empresa;
- cheques `EM_CARTEIRA` de qualquer empresa do grupo podem ser selecionados, respeitando a empresa detentora como origem da fonte;
- quando a empresa fonte difere da empresa do titulo, cada movimento recebe origem, destino, natureza e grupo intercompany para preservar conciliacao e consolidacao;
- o cabecalho da baixa conserva uma empresa de referencia, enquanto a empresa efetiva de cada operacao fica persistida no componente e no movimento;
- o cheque e sempre usado pelo valor integral de face;
- cada componente deve ser integralmente distribuido entre os titulos;
- cada titulo nao pode receber valor superior ao saldo e o total das fontes deve ser igual ao total alocado;
- juros, multa e desconto continuam no fluxo de baixa simples. A baixa composta atual aceita somente principal para preservar a reconciliacao dos componentes;
- preview nao grava movimentos;
- confirmacao bloqueia os registros, usa uma unica transacao, exige idempotencia e impede duplo clique no frontend;
- falha em qualquer componente desfaz todo o grupo;
- estorno e sempre integral por grupo, preservando os movimentos como `ESTORNADO` e a trilha de auditoria.

## Estrutura tecnica

Migrations: `202608070001_financeiro_carteira_cheques_baixa_composta.js`, `202608100001_baixa_composta_intercompany_fontes.js` e `202609150002_cheques_ciclo_compensacao.js`.

Tabelas novas:

- `baixas_financeiras_grupos`: cabecalho idempotente do pagamento;
- `baixas_financeiras_componentes`: fontes usadas no grupo, incluindo a empresa detentora/pagadora de cada fonte;
- `baixas_financeiras_alocacoes`: distribuicao de cada fonte por titulo;
- `cheques_terceiros_movimentos`: historico imutavel de custodia.

Os movimentos financeiros recebem `baixa_grupo_id` e `baixa_componente_id`. Os cheques recebem empresa, obra opcional, entrada, saida, movimentos de origem/destino, movimentos e conciliacoes de deposito/devolucao e chaves de idempotencia.

## Endpoints

- `GET /api/financeiro/cheques-terceiros`
- `POST /api/financeiro/cheques-terceiros`
- `GET /api/financeiro/cheques-terceiros/:id`
- `POST /api/financeiro/cheques-terceiros/:id/movimentar`
- `GET /api/financeiro/cheques-terceiros/modelo.xlsx`
- `POST /api/financeiro/cheques-terceiros/importacoes/preview`
- `POST /api/financeiro/cheques-terceiros/importacoes/confirmar`
- `POST /api/financeiro/baixas-compostas/preview`
- `POST /api/financeiro/baixas-compostas/confirmar`
- `GET /api/financeiro/baixas-compostas`
- `GET /api/financeiro/baixas-compostas/:id`
- `POST /api/financeiro/baixas-compostas/:id/estornar`

## Permissoes

- `financeiro.cheques.visualizar`
- `financeiro.cheques.cadastrar`
- `financeiro.cheques.importar`
- `financeiro.cheques.depositar`
- `financeiro.cheques.devolver`
- `financeiro.cheques.cancelar`
- `financeiro.cheques.transferir`
- `financeiro.baixas_compostas.visualizar`
- `financeiro.baixas_compostas.criar`
- `financeiro.baixas_compostas.confirmar`
- `financeiro.baixas_compostas.estornar`

As permissoes devem ser concedidas no painel granular. Visualizar Contas a Pagar, isoladamente, nao libera as novas operacoes.

## Interfaces

- `Financeiro > Cheques de Terceiros`: carteira, filtros, indicadores, cadastro, importacao e historico;
- `Financeiro > Contas a Pagar`: acao `Baixa com multiplas fontes` para os titulos selecionados;
- `Financeiro > Baixas com Multiplas Fontes`: consulta da composicao e estorno integral do grupo;
- a baixa simples e a baixa em massa existentes permanecem inalteradas.

## Limites desta entrega

- nao existe fracionamento de um unico cheque entre datas diferentes: ele pode ser rateado entre titulos somente dentro do mesmo grupo atomico;
- a compensacao depende da conciliacao do extrato; o deposito isolado nunca confirma credito por conta propria;
- a janela especial de apresentacao do cheque proprio e de 180 dias e a associacao fora da mesma data permanece manual;
- transferencia entre empresas registra custodia, nao contabilizacao intercompany;
- relatorios contabeis formais continuam dependendo da classificacao definida pela contabilidade.
