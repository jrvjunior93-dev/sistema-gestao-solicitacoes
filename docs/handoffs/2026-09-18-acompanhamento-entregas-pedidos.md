# Acompanhamento de entregas por pedido — 18/09/2026

## Estado

Implementação concluída na `refactor/frontend`, a partir de `bd0460aa`, com commit
e publicação autorizados pelo usuário em 18/09/2026. Migration e deploy deverão ser
executados pelo usuário na EC2 dev. Não foi acessado/escrito banco externo.
Preservados o guia de homologação previamente modificado e `outputs/` preexistente.

## Regras implementadas

- Obra vinculada informa recebimentos individuais ou em lote, independentemente do
  setor global da solicitação. O comentário geral e as demais ações continuam nas
  permissões/setor existentes.
- Quantidade informada é incremental; padrão = saldo restante. Menor = parcial;
  maior = divergência. "Não entregue" é declaração explícita, sem recebimento zero.
- Estado/responsabilidade por item do pedido, sem transferir `area_responsavel`.
  Comentários mantêm a referência original do item em todas as etapas.
- Novos pedidos da cotação exigem previsão absoluta confirmada antes da geração;
  todos começam nessa data. Reprogramação permite datas diferentes por item.
  Pedidos adicionais manuais exigem confirmação no acompanhamento antes do
  fechamento com fornecedor. O pedido completo possui atalho para a solicitação.
- Pedidos anteriores à migration não ativam bloqueios retroativos. Compras precisa
  confirmar uma previsão para iniciar o controle; recebimentos informados criam
  controle e pendências normalmente.
- Após a previsão vencer, a obra fica impedida de criar Solicitação de Compra e
  Compra Direta enquanto houver itens vencidos sem declaração. Outras obras e outros
  tipos de solicitação não são bloqueados.
- Parcial/não entregue transfere a tarefa para Compras e libera a obrigação da Obra
  daquele ciclo. Prazo: até o fim do segundo dia útil posterior à declaração,
  considerando sábado/domingo e `COMPRAS_ENTREGA_FERIADOS`.
- Feriados são configuráveis na tela de Configurações de Cotações; não há calendário
  oficial pré-carregado. Alterações afetam novos prazos, não recalculam os já salvos.
- Compras fica impedido de gerar novos pedidos, em todas as entradas do serviço,
  quando qualquer reprogramação ultrapassar o prazo. Cotações continuam permitidas.
  Nova data válida devolve acompanhamento à Obra. Outra entrega parcial não prorroga
  um prazo de Compras já em andamento.
- Divergência por excesso tem tarefa própria de Compras. Pode-se registrar devolução
  do excesso ou corrigir total recebido com motivo, por lançamento de ajuste auditado.
  Não são criados valores ou títulos adicionais automaticamente.
- Cancelamento do saldo preserva os recebimentos, reduz alocações/valores ainda sem
  vínculo financeiro e registra quantidade cancelada + snapshots. Vínculo financeiro
  ativo bloqueia a ação, exigindo tratamento prévio pelo GEO/Financeiro. Não há estorno
  automático. Cancelamento comum, remoção, mudança de quantidade ou remanejamento
  de item já recebido são protegidos para não apagar o recebimento.
- Pendência persistente e leitura de comentários são independentes. Fila destaca
  pendências em laranja e ações vencidas em vermelho. Ordenação acontece no banco
  antes da paginação; eventos de entrega recarregam a janela. Virada do dia é verificada
  nas telas abertas, e os bloqueios sempre usam a data atual no servidor.
- Operação em transação, lock no pedido/itens, versão por item e chave idempotente
  com hash do conteúdo/autor. Lote é atômico. Interfaces bloqueiam duplo envio e
  conservam a chave para repetir após falha de rede.

## Arquivos principais

- Migration `backend/migrations/202609180001_pedidos_acompanhamento_entrega.js`.
- Models `PedidoCompraEntrega`, `PedidoCompraEntregaOperacao`, campo opt-in em
  `PedidoCompra`, registro dos models em `index.js`.
- `pedidoEntregaDomain.js`, `pedidoEntregaService.js`, `PedidoEntregaController.js`.
- Integrações em `pedidoCompraService.js`, `SolicitacaoController.js`,
  `SolicitacaoCompraController.js`, `SolicitacaoCompraEtapasController.js`,
  `ConfiguracaoSistemaController.js`, `pendenciasVisoes.js`, rotas e validador de
  encerramento da cotação.
- Frontend: `SolicitacaoDetalhe/PedidoEntrega.jsx`, `CompraEtapas.jsx`, detalhe da
  solicitação, gestão de cotação, pedido completo, listas, CSS compartilhado de
  destaque, configurações de cotação e `services/compras.js`.
- Testes `validarPedidoEntregas.js`, `validarPedidoEntregasAcesso.js`,
  `validarPedidoEntregaUI.mjs`; comandos nos respectivos package.json.

## Validações executadas

- Backend `npm run test:pedido-entregas`: calendário, limites de datas, legado,
  recebimento parcial/total/excedente, devolução, correção, ciclo de reprogramação,
  replay, hash divergente, versão desatualizada, rollback de lote, duas operações
  concorrentes, cancelamento do saldo, escopo da obra e bloqueios. Persistência e
  serialização de transações simuladas em memória, sem banco real.
- Acesso isolado: permissão de leitura, vínculo da Obra, competência por ação,
  exceção administrativa e entrega com solicitação no Financeiro.
- Regressões: `test:compra-cotacao-envio`, `test:compra-remanejamento`,
  `test:pedido-financeiro-geo`, `test:bloqueio-retorno-obra`,
  `test:compras-delegacao`, `test:compra-oferta-saldo-mesmo-fornecedor`.
- Frontend `npm run build`; testes reais do componente em navegador Chrome headless
  local com APIs simuladas (seleção, parcial, excesso, retry, comentários, papéis,
  reprogramação, larguras 375/700/1200px), `validarCotacaoResponsiva.mjs` e
  `test:reaproveitamento-compra`.
- Captura visual inspecionada em `outputs/pedido-entrega-qa/entrega-compras.png`.
- Syntax checks dos arquivos backend alterados e `git diff --check`.
- Artefato de navegação refeito pelo prebuild foi restaurado ao conteúdo original
  porque nenhuma alteração de navegação é necessária nesta implementação.

## Próximo passo e riscos operacionais

1. Revisar/commitar somente este conjunto, excluindo alterações preexistentes no guia
   e outputs. Nenhuma migração para main faz parte desta tarefa.
2. No deploy dev autorizado: pull da branch, dependências, runner protegido de
   migrations, depois reiniciar SOMENTE `backend-dev`. A migration é estritamente
   estrutural; não contém seed/backfill nem ativação de pedidos antigos.
3. Homologar em MySQL/dev com pedidos de teste e usuários Obra/Compras. Os testes
   locais não substituem a validação de locks, SQL de fila, integridade de alocações,
   fretes e vínculos financeiros em banco real. Testar também dois pedidos de uma
   mesma solicitação e duas obras, com relatório vencido e reprogramação vencida.
4. Cadastrar os feriados aplicáveis antes do uso operacional. Confirmar a previsão
   apenas dos pedidos legados que devem entrar no acompanhamento.
5. Validar cobrança/baixa já existente continua independente. Cancelamento com título
   exige tratamento financeiro explícito; não contornar a proteção.

Nenhum dado real, título, baixa ou vínculo foi alterado nesta implementação local.
