# Contrato — aditivo aprovado volta para Obra

## Regra entregue

Ao aprovar um termo aditivo, a solicitacao vinculada deixa a fila `GEO / PED. ADITIVO` e passa
automaticamente para `OBRA / APROVADA`.

A movimentacao ocorre dentro da mesma transacao que aprova o aditivo, atualiza o contrato e gera
ou ajusta suas parcelas. Assim, uma falha em qualquer etapa desfaz toda a operacao e nao deixa o
aditivo aprovado parado na fila de decisao.

## Compatibilidade

- Fluxo novo: movimenta a solicitacao-mae vinculada ao contrato.
- Contrato legado: movimenta a solicitacao especifica criada para o pedido de aditivo.
- A rejeicao e o cancelamento permanecem com o comportamento anterior.
- O contrato, os titulos e as parcelas continuam seguindo as regras existentes.

## Historico e visibilidade

- `ADITIVO_APROVADO` registra a transicao de status e as areas anterior e nova.
- `ENVIADA_SETOR` registra `De GEO para OBRA`, com `setor = OBRA`.
- O formato preserva a regra de visibilidade que reconstrói os setores percorridos pela solicitacao.

## Arquivos alterados

- `backend/src/services/contratoAditivoService.js`
- `qa/medicao/46-aditivo-aprovar-rejeitar-cancelar.js`

## Validacoes

- `node --check`: aprovado nos dois arquivos.
- `git diff --check`: aprovado.
- Suite QA reversivel de aditivos: aprovada integralmente.
- Provas especificas:
  - solicitacao resultou em `OBRA|APROVADA`;
  - ultimo envio resultou em `OBRA|De GEO para OBRA`;
  - aprovacao continuou somando o valor do aditivo e gerando a parcela;
  - rejeicao, cancelamento, permissoes e teto permaneceram aprovados.
- Limpeza conferida: zero contratos e zero aditivos QA restantes.
- Backend local reiniciado na porta 8100; `/health` respondeu `{"ok":true}`.

## Banco e deploy

- Nenhuma migration criada ou aplicada.
- Nenhum dado de QA permaneceu no banco.
- Nenhum acesso a GitHub, EC2 ou producao.
