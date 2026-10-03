# Solicitacao Detalhe — remocao do card Pagamentos

## Objetivo

Simplificar a tela de detalhes removendo o selo `Somente leitura` do Financeiro e retirando o card
Pagamentos para todos os usuarios, inclusive Obra e usuarios com acesso financeiro.

## Alteracoes

- Removida a montagem do componente `Pagamentos` em `SolicitacaoDetalhe/index.jsx`.
- Removidos, junto com o card, o resumo duplicado dos titulos, a relacao de pagamentos e a acao
  `Informar pagamento parcial` nessa tela.
- Removido o selo visual `Somente leitura` do cabecalho do card Financeiro.
- O modo somente leitura da Obra continua ativo internamente e continua ocultando todas as acoes
  financeiras.
- O arquivo `Pagamentos.jsx`, os endpoints e os registros no banco foram preservados; a mudanca
  nao apaga historico nem afeta as telas proprias do modulo Financeiro.

## Arquivos alterados

- `frontend/src/pages/SolicitacaoDetalhe/index.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/FinanceiroCard.jsx`

## Validacao

- Ausencia de import, montagem e permissao exclusiva do componente Pagamentos confirmada por
  busca estatica.
- Ausencia do texto visual `Somente leitura` confirmada no componente.
- `git diff --check`: aprovado.
- `npm run build`: aprovado, 365 modulos transformados.

## Banco e backend

- Nenhuma migration.
- Nenhuma alteracao de dados.
- Nenhum reinicio do backend necessario.
