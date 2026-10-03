# Handoff — valores das formas de pagamento no título da solicitação

## Escopo

Corrigida a divergência entre o valor pré-preenchido e as parcelas efetivas no modal de criação de título do detalhe da solicitação. Para boleto, PIX, cheque e outros, a parcela passa a ser preparada na leitura do formulário mesmo quando a solicitação é atualizada depois do carregamento das formas. Os campos de valor e vencimento ficam visíveis e editáveis. Para cartão e transferência, permanece o valor direto da forma. A validação, o total e o payload usam a mesma lista preparada.

Arquivos: `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx` e `frontend/scripts/validarValoresFormasTituloSolicitacao.mjs`.

## Validações locais

- `node scripts/validarValoresFormasTituloSolicitacao.mjs`: boleto, PIX, cheque, outros, cartão, transferência, três parcelas e frete separado.
- `npm run build`: aprovado.
- `git diff --check`: aprovado.

## Risco e próximo passo

Sem migration e sem escrita em banco. O caso foi validado localmente, não em ambiente autenticado com a conta da usuária. Próximo passo: testar o modal com essa conta em dev após publicação autorizada; confirmar que o PIX pré-preenchido exibe a parcela editável e que o título é criado uma única vez. Não houve acesso à EC2/RDS, commit, push ou deploy nesta tarefa.
