# Handoff — pedido de aditivo do fluxo novo

## Escopo concluido

Quando um termo aditivo e solicitado para um contrato do fluxo novo, a solicitacao-mae passa, na
mesma transacao, para:

- setor `GEO` (Gerencia de Processos);
- status `PED. ADITIVO`.

O encaminhamento gera `ADITIVO_SOLICITADO` com a transicao de status e, quando ha mudanca de fila,
`ENVIADA_SETOR` no formato operacional `De <origem> para GEO`.

## Arquivos alterados

- `backend/src/services/contratoAditivoService.js`
- `backend/migrations/202608260056_status_pedido_aditivo_geo.js`
- `backend/scripts/validarEncaminhamentoPedidoAditivo.js`

## Banco local

- Migration aplicada em `fluxy_main_copia`.
- Etapa confirmada: `GEO / PED. ADITIVO / ordem 4 / ativa`.
- Nenhuma solicitacao preexistente foi atualizada pela migration.

## Validacoes

- `node --check` nos tres arquivos: aprovado.
- Teste reversivel `node scripts/validarEncaminhamentoPedidoAditivo.js`: aprovado.
- A limpeza removeu e conferiu a ausencia de todos os IDs criados pelo teste.
- Backend local iniciado na porta 8100 e `/health` respondeu `200`.

## Limites do escopo

- Contratos legados mantem o comportamento anterior.
- Esta entrega define a transicao de abertura do pedido. Nao altera a regra de destino/status apos
  aprovar, rejeitar ou cancelar o aditivo.
