# Fluxo setorial de solicitações e pagamentos

## Regra central

A existência ou a criação de um título financeiro não transfere a solicitação ao Financeiro. A única ação que faz essa transferência é o envio de um título ativo para a fila de pagamentos.

## Fluxo geral

1. A solicitação aprovada permanece no GEO, com o status de aprovação configurado para o tipo.
2. O GEO analisa a solicitação e cria os títulos dos tipos que não possuem geração automática.
3. Com autorização obtida fora do sistema, o GEO seleciona os títulos no Contas a Pagar e usa **Enviar para pagamento**.
4. A entrada de pelo menos um título na fila altera, na mesma transação:
   - o título/fila para pendente de pagamento;
   - a solicitação para `ENVIADO PARA PAGAMENTO`;
   - o setor responsável da solicitação para Financeiro.
5. O Financeiro trabalha somente na fila conforme as permissões granulares, consulta a solicitação e seus arquivos, anexa os comprovantes e registra a baixa.
6. A primeira baixa, parcial ou integral, altera o status financeiro da solicitação e a devolve para Obra.
7. Se outro título da mesma solicitação for enviado depois, a solicitação volta ao Financeiro e repete o ciclo.

## Solicitação de compra

1. Depois da revisão do GEO, a solicitação de compra segue para Compras.
2. Ao gerar pedidos, ela permanece em Compras.
3. Enquanto houver saldo ainda não fechado, o status da solicitação principal é `PEDIDO_PARCIAL`.
4. Quando todo o saldo estiver fechado com fornecedores, o status é `FECHADO_FORNECEDOR`.
5. Compras cria os títulos diretamente no pedido, já como `ABERTO`.
6. Fornecedor, obra, valor, descrição e categoria padrão são preenchidos automaticamente. Compras ajusta parcelas, vencimentos e pode trocar a categoria por outra habilitada.
7. As categorias permitidas e a categoria padrão são configuradas por Superadmin em **Configurações > Compras > Categorias dos Títulos**.
8. A criação do pedido ou do título não envia a solicitação ao GEO nem ao Financeiro. O GEO autoriza o pagamento no Contas a Pagar.

## Transições automáticas mantidas para o GEO

As seguintes transições continuam intencionais porque representam análise operacional, não pagamento:

- criação inicial de solicitações cujo destino configurado é GEO;
- registro de medição, que retorna a solicitação de contrato ao GEO para conferência;
- correção e prestação de contas de recarga de cartão, que retornam ao GEO para análise;
- retornos de contratos/aditivos ao GEO previstos nos seus fluxos próprios;
- pedido de reabertura de pedido com histórico financeiro, que depende de decisão do GEO.

## Transições removidas

- aprovação de medição enviando imediatamente a solicitação ao Financeiro;
- aprovação comum de tipos não relacionados a Compras encaminhando ao Financeiro ou a outro setor;
- status legado “Encaminhada para Financeiro” alterando setor por texto;
- fechamento de pedido notificando o GEO para criar previsões financeiras;
- criação de pedido devolvendo a solicitação de compra ao GEO ou destacando sua linha por esse motivo.

## Permissões

- Compras precisa das permissões de visualizar e gerar títulos financeiros dos pedidos.
- GEO precisa de acesso ao Contas a Pagar e da permissão `financeiro.fila_pagamentos.preparar` para autorizar o envio.
- Financeiro pode receber somente as permissões da área `financeiro.fila_pagamentos` necessárias para visualizar, importar comprovantes, baixar, reportar e resolver.
- A leitura da solicitação e dos arquivos pelo Financeiro é liberada pelo vínculo ativo do título na fila, sem exigir que o setor tenha participado do fluxo antes.

## Idempotência e auditoria

- A fila rejeita títulos que já possuem item ativo ou pagamento bancário em andamento.
- A criação dos títulos do pedido exige chave de idempotência.
- Mudanças de status e de setor são registradas separadamente no histórico.
- Repetir a sincronização de fila ou baixa não cria nova movimentação quando setor e status já estão corretos.
