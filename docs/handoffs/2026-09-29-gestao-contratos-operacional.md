# Gestão operacional de contratos — legado e fluxo novo

Data: 29/09/2026

## Resultado

- A listagem passou a usar as nomenclaturas `Contratado`, `Saldo` e `Aditivos`.
- O status operacional é calculado a cada consulta: `ATIVO`, `TOTALMENTE_MEDIDO`, `CONCLUIDO` ou `RESCINDIDO`.
- O detalhe do contrato reúne medições, solicitações vinculadas, títulos, valores movimentados, saldo contratual e saldo financeiro.
- A rescisão funciona nos contratos legados e novos, com bloqueio transacional contra repetição.
- A rescisão cancela somente o saldo não medido. Títulos com medição ou movimento financeiro permanecem devidos.

## Compatibilidade dos fluxos

### Legado

- Cada medição continua sendo uma solicitação própria.
- O vínculo explícito `solicitacoes.contrato_id` é a autoridade; o texto `codigo_contrato` não é usado para contabilizar silenciosamente.
- A apuração financeira prioriza títulos e suas baixas, depois pagamentos legados e, apenas como fallback auditável, o status histórico `PAGA`.
- Comprovante é evidência documental e não transforma uma solicitação em pagamento.

### Fluxo novo

- As medições continuam em `contrato_medicoes`/`medicao_parcelas` e os títulos continuam vinculados às parcelas.
- Uma rescisão exclui somente previsões sem medição e sem movimento financeiro.
- Títulos abertos ou parcialmente pagos de parcelas medidas não são reduzidos nem excluídos.

## Segurança da migration e produção

A migration `202609290002_contrato_rescisao_rastreabilidade.js` é somente estrutural. Ela adiciona quatro colunas anuláveis:

- `rescindido_em`
- `rescindido_por`
- `motivo_rescisao`
- `saldo_rescindido`

Ela não contém `UPDATE`, `bulkUpdate`, `bulkInsert`, backfill ou classificação de contratos. Portanto, não existe fotografia tirada em dev que possa deixar contratos criados ou alterados antes do deploy da produção fora da classificação.

O comando `npm run audit:contratos-operacional` é somente leitura e recalcula a auditoria usando o conteúdo atual do banco em que for executado. Ele não é etapa necessária para o funcionamento do sistema.

## Ordem segura de deploy

1. Fazer `git pull` sem reiniciar o processo atual.
2. Executar `npm install` no backend.
3. Executar `npm run test:contratos-operacional`.
4. Executar `ALLOW_SCHEMA_MIGRATIONS=true npm run migrate` enquanto o processo antigo ainda atende requisições.
5. Executar `npm run preflight:schema` e exigir zero migrations pendentes.
6. Reiniciar somente o processo do ambiente correto.
7. Validar `/health` local e público.
8. Executar `npm run audit:contratos-operacional` para conferir a distribuição real, sem escrita.
9. Publicar o frontend somente depois do endpoint novo estar disponível.

Essa ordem evita que o novo model tente ler as colunas antes de elas existirem e evita que o frontend chame o endpoint de detalhe antes do backend ser atualizado.

## Validações executadas

- `node --check` nos services, controller, routes, migration e scripts alterados.
- `npm run test:contratos-operacional` aprovado.
- `npm run build` do frontend aprovado.
- O teste de domínio também verifica que a migration não possui comandos de classificação em massa.
- O teste de domínio confirma que a rescisão preserva títulos medidos ou já movimentados e exclui
  apenas previsões futuras sem medição nem pagamento.

## Pendência operacional

- Aplicar a migration em dev antes de testar os endpoints reais.
- Rodar a auditoria somente leitura em dev após a migration e validar visualmente pelo menos um contrato legado, um novo parcialmente medido, um totalmente medido e um rescindido.
