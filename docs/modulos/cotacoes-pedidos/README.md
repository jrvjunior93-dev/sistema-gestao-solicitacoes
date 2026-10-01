# Modulo COTACOES E PEDIDOS

## Papel

O modulo administra fornecedores convidados, escopo de itens por fornecedor, tokens publicos, respostas, comparativo, escolha de vencedor e pedidos de compra. Ele depende de uma solicitacao aprovada/liberada pelo fluxo interno de Compras.

## Cotacao

- cada fornecedor possui vinculo e token proprios;
- a matriz `fornecedores[].itens` define quais itens cada fornecedor recebe;
- cada fornecedor precisa receber ao menos um item;
- IDs cadastrados e manuais sao normalizados e obrigatoriamente validados contra a mesma solicitacao de compra;
- o payload global de itens permanece apenas como compatibilidade; a matriz por fornecedor e o contrato canonico;
- token permite somente acesso ao escopo daquela cotacao;
- prazo pode ser configurado por fornecedor;
- resposta registra preco unitario, quantidade disponivel, minimo por item, condicao de pagamento, prazo geral em dias corridos/uteis e observacoes;
- a interface nao solicita nem exibe data de chegada por item; `data_chegada` continua aceito pelo backend apenas para preservar clientes e registros legados durante a transicao;
- quantidade disponivel vazia ou zero remove a oferta daquele fornecedor do mapa comparativo sem remover a demanda original;
- IPI, ICMS e ST sao valores gerenciais em reais por item para toda a quantidade disponivel informada, nao aliquotas;
- DIFAL e um valor gerencial em reais no cabecalho da resposta e e rateado proporcionalmente pelo valor das mercadorias selecionadas;
- frete pode ser `SEM_FRETE`, `EMBUTIDO` ou `TERCEIRO`; no frete de terceiro, valor e vencimento sao obrigatorios e nome/documento do transportador sao opcionais;
- fornecedor pode salvar rascunho e enviar resposta final;
- CSV, XLSX, PDF e uploads usam o mesmo escopo do token;
- operador autorizado pode registrar ou editar resposta interna sem ampliar o escopo de itens;
- reenvio deve atualizar de forma controlada, sem criar fornecedor duplicado;
- configuracoes de minimo e criterio de vencedor sao validadas no backend;
- aprovacao fora do menor preco ou sem minimo pode exigir justificativa.

## Fechamento parcial e final

- vencedor e selecionado por item;
- o mapa comparativo considera apenas fornecedores nao cancelados com resposta valida;
- itens sem resposta ou sem vencedor precisam de tratamento explicito;
- cada rodada e registrada em `SolicitacaoCompraFechamento` como `PARCIAL` ou `FINAL`;
- fechamento parcial exige permissao `compras.cotacoes.fechar_parcial` e confirmacao explicita; a pratica normal de fechar apenas parte dos itens nao exige justificativa;
- enquanto houver saldo, a solicitacao permanece em `FECHAMENTO_PARCIAL` e pode receber novas rodadas;
- fechamento final exige permissao de encerramento, consome todo o saldo elegivel e muda a solicitacao para `ENCERRADO`;
- encerramento sem pedido exige `compras.cotacoes.encerrar_sem_pedido`, confirmacao e justificativa; cria uma rodada `SEM_PEDIDO`, registra a quantidade nao comprada, preserva pedidos anteriores e nao cria alocacoes nem novos pedidos;
- o fluxo `SEM_PEDIDO` e distinto do cancelamento da cotacao e da geracao de pedidos selecionados, que permanecem inalterados;
- pedidos e alocacoes de uma nova rodada sao acrescentados e nunca substituem os gerados anteriormente;
- a chave de idempotencia e escopada pela solicitacao e impede repetir a mesma rodada;
- cotacoes nao canceladas recebem `FINALIZADA` na rodada final ou no encerramento sem pedido, bloqueando novas respostas pelos links publicos;
- usuario autorizado apenas ao fechamento parcial nao pode consumir todo o saldo;
- a quantidade fechada pode superar a solicitada somente ate a disponibilidade declarada pelo fornecedor;
- todo excedente exige confirmacao e justificativa obrigatoria, gravadas no fechamento e no log para auditoria;
- reabertura, quando permitida, deve registrar motivo e bloquear efeitos inconsistentes.

## Pedido

- pedido nasce de uma rodada de fechamento e referencia `fechamento_id` quando criado pelo fluxo atual;
- a condicao de pagamento da resposta e copiada para `PedidoCompra.condicao_pagamento` como snapshot no momento da geracao e aparece no detalhe e no PDF;
- editar somente a resposta da cotacao depois da geracao nao altera silenciosamente pedidos ja emitidos; quando um pedido existente e explicitamente reutilizado ou reaberto pelo fluxo operacional, o snapshot pode ser atualizado com registro de antes e depois no log;
- pedidos historicos recebem a condicao mais proxima disponivel no log da resposta anterior a criacao, com fallback para a cotacao atual; a leitura dos documentos preserva compatibilidade com associacoes legadas;
- o pedido preserva os valores rateados de IPI, ICMS, ST e DIFAL para formar o custo gerencial dos itens;
- frete embutido permanece como informacao da cotacao; frete pago a terceiro cria uma pendencia financeira idempotente, sem exigir credor na cotacao;
- quando o transportador nao for informado, o Financeiro escolhe o credor ao gerar o titulo de contas a pagar;
- pedidos legados sem `fechamento_id` continuam validos;
- alteracoes posteriores de quantidade, item e preco sao auditadas;
- status configuravel pode bloquear edicao;
- cancelamento verifica efeitos fiscais e financeiros; item/pedido sem efeito financeiro impeditivo marca a quantidade como cancelada, cancela as alocacoes ativas e devolve o saldo ao fluxo de remanejamento;
- itens de pedido cancelado permanecem no historico, mas o saldo liberado pode ser remanejado para outra resposta de fornecedor da mesma cotacao;
- o remanejamento cria ou reaproveita o pedido de destino conforme as regras da rodada, transfere a quantidade em transacao e registra origem, destino, quantidade e motivo; o pedido de destino ainda precisa seguir o fechamento operacional normal;
- titulo financeiro, frete titulado ou outro efeito financeiro impeditivo bloqueia cancelamento/remanejamento ate regularizacao pelo setor competente;
- PDF e uma representacao; o estado oficial permanece no banco.

## Dependencias

Compras fornece itens e apropriacoes. Parceiros fornece fornecedores. Fiscal pode vincular documentos ao pedido. Financeiro pode gerar obrigacao a partir do pedido conforme regra explicita. Obras e relatorios consomem valores e apropriacoes.

## Seguranca

Rotas publicas aceitam somente o token e os campos do fornecedor. Uploads, CSV, XLSX, PDF, rascunho e resposta possuem limites e validacao. Rotas internas separam permissoes de visualizar, operar, editar respostas, cancelar, fechar parcialmente, encerrar, reabrir e gerar pedidos.
