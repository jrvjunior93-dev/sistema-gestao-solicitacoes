# Nova oferta para saldo do mesmo fornecedor

## Objetivo

Permitir que uma solicitacao de compra com fechamento parcial gere um novo pedido para o mesmo fornecedor, com quantidade, preco, prazo, tributos, desconto e frete diferentes dos registrados na rodada anterior.

## Regra operacional

- A acao `Nova oferta para o saldo` aparece quando a solicitacao esta em `FECHAMENTO_PARCIAL`, existe saldo no item e o fornecedor ja possui pedido ativo na cotacao.
- A quantidade informada representa somente a disponibilidade da nova oferta, e nao a disponibilidade acumulada desde a primeira resposta.
- Cada fechamento continua gerando um pedido separado por fornecedor e por rodada.
- O pedido e as alocacoes anteriores nao sao atualizados quando a nova oferta e salva.
- O preco usado no novo pedido e o preco da nova oferta. O primeiro pedido conserva o preco registrado na primeira rodada.
- Disponibilidade e valores ja consumidos sao descontados apenas dentro da mesma oferta. Isso inclui IPI, ICMS, ST, DIFAL, desconto e frete.
- A chave idempotente do frete inclui o fechamento, permitindo fretes distintos em pedidos diferentes do mesmo fornecedor.

## Auditoria e seguranca

- A resposta anterior e preservada por exclusao logica.
- A nova resposta recebe `escopo_disponibilidade = OFERTA_SALDO`.
- O historico registra `NOVA_OFERTA_SALDO_FORNECEDOR`, os valores anteriores, os novos valores e o usuario interno.
- O backend recusa a operacao se ainda nao houver fechamento parcial/final ou pedido ativo anterior do fornecedor.
- O fechamento da rodada permanece transacional e protegido pela chave de idempotencia existente.

## Exemplo

1. Item solicitado: 10 unidades.
2. Primeira oferta: 5 unidades a R$ 100,00; gera o primeiro pedido.
3. Saldo da solicitacao: 5 unidades.
4. Nova oferta do mesmo fornecedor: 5 unidades a R$ 115,00 e novo prazo.
5. O segundo fechamento gera outro pedido a R$ 115,00, sem alterar o pedido anterior de R$ 100,00.
