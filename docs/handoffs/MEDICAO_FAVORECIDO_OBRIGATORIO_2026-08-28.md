# Medicao: favorecido obrigatorio e dados para pagamento

## Objetivo

Impedir que novas medicoes ou outras solicitacoes com forma de pagamento sejam gravadas sem
favorecido e fornecer ao Financeiro a instrucao necessaria nas formas diferentes de PIX e boleto.

## Regras implantadas

- PIX: exige favorecido ativo e chave PIX; contato continua opcional.
- Boleto: exige favorecido ativo, arquivo geral da medicao e arquivo identificado como boleto.
- Demais formas: exige favorecido ativo e o campo `Dados para pagamento`.
- Toda medicao continua exigindo confirmacao dos dados e ao menos um arquivo.
- A aprovacao revalida favorecido, forma, anexos e dados para pagamento no backend, inclusive para
  registros inseridos fora da tela.
- Na Nova Solicitacao generica, selecionar qualquer forma de pagamento torna o favorecido
  obrigatorio no frontend e no endpoint `POST /solicitacoes`.

## Arquivos alterados

- `backend/src/services/medicaoContratoService.js`
- `backend/src/controllers/SolicitacaoController.js`
- `frontend/src/components/contratos/BlocoMedicaoContrato.jsx`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/SolicitacaoDetalhe/ModalMedicao.jsx`
- `qa/medicao/42-medicao-pagamento-e-aprovacao.js`

## Validacoes

- `node --check` nos dois arquivos de backend e na suite de QA: aprovado.
- `npm run build` no frontend: aprovado, 372 modulos transformados.
- Suite `qa/medicao/42-medicao-pagamento-e-aprovacao.js`: aprovada integralmente para PIX,
  boleto, forma sem documento proprio, persistencia, aprovacao, permissoes, anexos e estados das
  parcelas/solicitacao.
- Limpeza da suite: zero contratos QA e configuracao de formas restaurada exatamente ao estado
  anterior.
- Nenhuma migration foi necessaria.

## Observacao sobre legado

Medicoes historicas ja aprovadas com `favorecido_id` nulo nao foram alteradas automaticamente.
Uma eventual regularizacao precisa ser auditada separadamente para nao atribuir o recebedor errado.
