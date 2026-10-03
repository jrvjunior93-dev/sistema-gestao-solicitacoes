# Handoff — titulo em previsao ate a medicao

Data: 2026-08-28

## Objetivo concluido

- Remover a duplicidade visual das parcelas/titulos na aba Financeiro do contrato do fluxo novo.
- Manter titulos automaticos de contrato e aditivo em `PREVISAO` ate a aprovacao da medicao correspondente.
- Mudar somente os titulos medidos para `ABERTO` quando a medicao for aprovada.
- Manter o botao `Gerar conta` visivel, mas desabilitado, em contratos do fluxo novo e em solicitacoes de Recarga de Cartao, pois esses fluxos geram titulos automaticamente.

## Regra financeira resultante

1. Contrato aprovado: parcelas e titulos automaticos permanecem em `PREVISAO`.
2. Aditivo aprovado: parcela nova e titulo automatico permanecem em `PREVISAO`.
3. Medicao registrada: o titulo ainda permanece em `PREVISAO`.
4. Medicao aprovada/liberada: somente os titulos das parcelas daquela medicao passam para `ABERTO`.
5. Pagamento posterior segue a regra existente de `PARCIAL` e `QUITADO`.

Titulos historicos que ja estavam em `ABERTO` nao foram convertidos retroativamente. Nao houve migration.

## Frontend

- `FinanceiroCard.jsx` usa a tabela compacta de parcelas como representacao unica no contrato do fluxo novo.
- O resumo generico e os cards repetidos de titulos continuam disponiveis para solicitacoes comuns e contratos legados.
- O botao `Gerar conta` fica desabilitado com explicacao acessivel em:
  - contrato do fluxo novo;
  - Recarga de Cartao;
  - instante de classificacao do contrato, evitando habilitacao temporaria indevida.
- `PrevisoesContrato.jsx` mostra `PREVISAO` ate a aprovacao da medicao e `ABERTO` depois dela.

## Backend

- `contratoFluxoNovoService.js`: aprovacao cria titulo e mantem parcela em `PREVISAO`.
- `contratoAditivoService.js`: parcelas/titulos de aditivo nascem em `PREVISAO`.
- `medicaoContratoService.js`: aceita medir titulo em `PREVISAO` e, na aprovacao, abre apenas os titulos vinculados a medicao dentro da mesma transacao.

## Validacoes executadas

- `npm run build` no frontend: aprovado, 372 modulos transformados.
- `node --check` nos tres servicos e nas suites ajustadas: aprovado.
- `qa/medicao/62-aprovacao-limite-segura.js`: aprovado; abaixo do limite gerou dois titulos `PREVISAO`; limpeza 0/0/0.
- `qa/medicao/42-medicao-pagamento-e-aprovacao.js`: aprovado; primeira aprovacao resultou em `1:ABERTO,2:PREVISAO` e a segunda em `1:ABERTO,2:ABERTO`; limpeza completa.
- `qa/medicao/37-aditivo-gera-parcela.js`: aprovado; titulo do aditivo de valor nasceu `PREVISAO` e as tres parcelas do aditivo de valor/vigencia ficaram `PREVISAO`; limpeza com zero contratos e usuarios QA.
- `git diff --check`: sem erro de whitespace; apenas avisos de conversao CRLF/LF em arquivos preexistentes do worktree compartilhado.

## Estado operacional

- Backend atualizado em execucao local na porta 8100.
- Nenhuma migration criada ou aplicada.
- Nenhum titulo real do banco foi reclassificado em massa.
