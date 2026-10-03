# Arquitetura - Fluxos Principais

## 1. Solicitacao Operacional

1. Usuario cria a solicitacao.
2. Sistema grava obra, tipo, parceiro, apropriacao e dados operacionais.
3. Setor responsavel assume, comenta, anexa, altera status ou envia para outro setor.
4. Historico e notificacoes registram a trilha.

## 2. Solicitacao para Financeiro

1. Solicitacao recebe parceiro e valor.
2. Usuario gera titulo financeiro manualmente a partir dela.
3. Titulo segue para baixa, estorno e relatorios.

## 3. Conta Manual

1. Usuario abre `Nova conta manual`.
2. Escolhe `PAGAR` ou `RECEBER`.
3. Seleciona obra, parceiro e categoria financeira compativel.
4. Titulo nasce sem solicitacao vinculada e entra no previsto.

## 4. Compras e Cotacao

1. Usuario cria solicitacao de compra.
2. Adiciona itens e rateia as quantidades em apropriacoes validas da obra.
3. A compra normal nasce `PENDENTE` em GEO, sem aprovacao da diretoria.
4. Usuario GEO autorizado pela permissao `compras.solicitacoes.editar_itens` revisa quantidades e apropriacoes.
5. Usuario GEO com `compras.solicitacoes.encaminhar_compras` conclui a revisao e envia para Compras.
6. A compra passa a `LIBERADO_PARA_COMPRA` e fica apta a cotar sem integracao externa adicional.
7. Comprador seleciona fornecedores e define os itens enviados a cada um.
8. Sistema valida o pertencimento dos itens e gera tokens/links individuais.
9. Fornecedor salva rascunho ou responde no portal publico; operador autorizado pode registrar resposta interna.
10. Comprador compara respostas e define vencedor/quantidade por item.
11. Encerramento gera e fecha os pedidos uma unica vez e finaliza as cotacoes nao canceladas.

## 5. Pedido de Compra

1. Pedido nasce dos vencedores definidos no encerramento da cotacao.
2. Usuario pode ajustar itens, quantidades e valores.
3. Toda edicao gera auditoria.
4. Status configuravel pode bloquear edicao.
5. Pedido pode gerar PDF para envio ao fornecedor.

## 6. Baixa e Conciliacao

1. Usuario registra a baixa do titulo.
2. Sistema cria movimento financeiro.
3. Usuario importa OFX da mesma conta bancaria.
4. Sistema sugere match.
5. Conciliacao e confirmada manualmente.

## 7. Gestao de Obras

1. Obra consolida apropriacoes.
2. Orcamento usa apropriacoes como estrutura base.
3. Custos pagos vem de movimentos financeiros.
4. Parcelas abertas vem de titulos a pagar/parcial.
5. Pedidos e arquivos compoem a visao final da obra.

## 8. Comercial e Carteira de Recebimentos

1. Usuario cadastra empreendimento e unidades.
2. Cliente e vinculado a uma unidade e a um contrato comercial.
3. Contrato gera agenda de recebiveis e titulos financeiros a receber.
4. Recebimentos podem ocorrer por dinheiro, PIX, cartao, boleto, permuta ou bens.
5. Financeiro continua como motor de titulos, baixas, estornos e relatorios.
6. Boleto deve ficar em submodulo independente para homologacao bancaria posterior.
