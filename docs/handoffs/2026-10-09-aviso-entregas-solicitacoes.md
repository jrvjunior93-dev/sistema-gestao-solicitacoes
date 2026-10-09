# Aviso de entregas pendentes com solicitacoes principais

## Pedido e estado

Implementado localmente na refactor/frontend, base f7f91559. Usuario pediu
codigo da solicitacao normal/principal no bloqueio da criacao de Compra Direta
e Solicitacao de Compra, com todas as solicitacoes em um unico card.
Implementacao sem migration, banco real, reinicio ou deploy. Em seguida o
usuario autorizou commit e push somente na refactor/frontend; este handoff
acompanha a publicacao. Main e EC2 permanecem fora do escopo.

## Mapeamento e alteracoes

- Guard legado: `pedidoEntregaService.assertObraPodeCriarCompra`, chamado por
  SolicitacaoController e SolicitacaoCompraController. Consulta continua no
  mesmo escopo de obra e passa a ler o codigo via LEFT JOIN solicitacoes usando
  solicitacao_principal_id (nao o ID/codigo da solicitacao de compra).
- Guard de ciclos novos: controlePrazosOperacionais continua retornando 423
  com codigo OBRA_PRAZO_OPERACIONAL_PENDENTE e obras. Usa os codigos ja lidos
  pelo estado operacional e agrega apenas pendencias vencidas das obras afetadas.
- Novo avisoPendenciasEntregaService agrega uma linha por solicitacao principal,
  pedidos distintos e quantidade de itens. Guard legado conserva 409 e exclui
  itens acompanhados pelo ciclo operacional como antes. Nenhuma regra alterada.
- Respostas adicionam code COMPRA_ENTREGA_PENDENTE e details.solicitacoes.
  Catches dos dois controllers repassam somente detalhes desse erro conhecido.
- Transportes de compras ja preservavam code/details; transporte da solicitacao
  normal ja preservava data. Nao foi preciso alterar os servicos HTTP existentes.
- RevisarSolicitacaoCompra e seu wrapper RevisarCompraDireta usam a mesma lista.
  NovaSolicitacao tambem trata a resposta. Novo helper avisoPendenciasEntrega
  transforma somente os detalhes conhecidos em itens de texto do aviso.
- Avisos aceita itens opcionais no terceiro argumento, preservando mensagens
  antigas, fechamento e substituicao global do aviso anterior. Alert usa div
  para conteudo composto, evitando lista dentro de paragrafo. CSS limita apenas
  a lista a 40vh com rolagem/foco, sem novos cards ou botoes.
- Cadastro/envio, permissoes, preview obrigatorio, rascunho, idempotencia e
  bloqueio de multiplos cliques nao foram alterados. Nao ha novos links que
  possam ampliar visibilidade/acesso a solicitacoes.

## Arquivos

- Backend: novo helper de aviso, pedidoEntregaService, middleware operacional,
  catches de criacao em SolicitacaoController/SolicitacaoCompraController.
- Frontend: novo helper, Avisos, Alert, CSS componentes-padrao, catches de
  NovaSolicitacao e RevisarSolicitacaoCompra.
- Testes: validarPedidoEntregas, validarPrazosOperacionais,
  validarRelatorioTitulosSelecao (nova dependencia simulada), novo
  frontend/scripts/validarAvisoPendenciasEntrega.mjs.
- Documentacao: este handoff e ownership, liberado ao terminar.

## Validacoes aprovadas

- Backend: node scripts/validarPedidoEntregas.js,
  node scripts/validarPedidoEntregasAcesso.js,
  node scripts/validarPrazosOperacionais.js,
  node scripts/validarRelatorioTitulosSelecao.js e npm run test:docs.
- Frontend: node scripts/validarAvisoPendenciasEntrega.mjs (servicos HTTP,
  hook, portal e Alert reais, API local simulada; 1/2/30 solicitacoes, uma lista
  completa, legado, fechamento, 375/1366px e rolagem),
  node scripts/validarPedidoEntregaUI.mjs e npm run test:prazos-operacionais.
- npm run build aprovado; avisos conhecidos de Browserslist desatualizado e
  chunk acima de 500KB. Sintaxe JS backend e git diff --check aprovados.
- Screenshots locais em outputs/aviso-pendencias-entrega, fora do Git.
- Nao foi executada consulta real de banco. Testes do backend sao isolados.
- Primeiras tentativas do novo harness precisaram ajustes de transformacao
  virtual/porta e esperas de render; execucao final completa aprovada.

## Riscos e proximo passo

- Registros antigos sem codigo principal continuam bloqueando; exibem pedido
  e "Solicitacao sem codigo" em vez de inventar codigo SOL pelo ID interno.
- Lista nova exige frontend e backend deste ajuste. Backend antigo continua
  mostrando a mensagem anterior; frontend antigo ignora details sem falhar.
- Confirmar em DEV com pedido vencido real da obra, verificando SOL principal
  e regularizacao da entrega apos atualizar o ambiente. Nenhuma promocao a
  main ou operacao EC2 foi realizada.

## Publicacao DEV autorizada

- Commit preparado apenas com os arquivos deste ajuste, seus testes e docs;
  outputs/ excluido. Base local/remota f7f91559 conferida antes de publicar.
- Revalidacoes aprovadas antes do commit: entregas, prazos e relatorio de
  titulos (backend isolado), UI do aviso com transportes reais simulados,
  documentacao e diff. Build aprovado na implementacao, sem alteracao de
  codigo funcional na etapa de publicacao.
- Conferir o SHA remoto apos git push origin refactor/frontend; se falhar,
  informar a pendencia sem assumir publicacao ou fazer force push.
