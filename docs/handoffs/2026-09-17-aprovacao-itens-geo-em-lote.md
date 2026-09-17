# Revisao GEO de itens de solicitacao de compra

## Estado

Implementacao na `refactor/frontend`; deploy de desenvolvimento pendente.

## Alteracoes

- `backend/src/controllers/SolicitacaoCompraEtapasController.js`: leitura indica revisao GEO pendente; aprovacao atomica de ate 1.000 itens cadastrados/manuais, com validacao de vinculo, permissao, concorrencia, historico e bloqueio de itens em cotacao. A decisao individual tambem verifica novamente a etapa apos bloquear a compra.
- `backend/src/routes.js`: nova rota `PATCH /solicitacoes/:id/compra-itens/aprovacao-lote`.
- `backend/src/controllers/SolicitacaoCompraController.js`: encaminhamento para Compras exige ao menos um item explicitamente aprovado. Os itens restantes sem decisao sao registrados como `REJEITADO` na mesma transacao, com IDs e origem da analise externa no historico. O encaminhamento e bloqueado se qualquer item ainda sem decisao ja estiver vinculado a cotacao ou pedido.
- `backend/src/controllers/SolicitacaoController.js`: a aprovacao generica por tipo deixa de servir como caminho paralelo para compra estruturada normal; continua disponivel para outros tipos e compra direta.
- `frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`, `index.jsx`, `frontend/src/services/compras.js`: selecao multipla e acao de aprovacao em lote; itens legados sem status aparecem pendentes enquanto a revisao GEO esta aberta; antes de encaminhar com itens pendentes, a interface confirma a rejeicao automatica; botao generico oculto somente para compra estruturada normal.
- `backend/scripts/validarCompraCotacaoEnvio.js`: verificacoes de regressao da rota, do encaminhamento com rejeicao implicita, da protecao a cotacoes/pedidos e da interface.

## Validacoes

- `node --check` dos tres controllers alterados e `routes.js`: passou.
- `npm run test:compra-cotacao-envio`, `test:compras-delegacao`, `test:tipos-solicitacao-destino`, `test:bloqueio-retorno-obra`, `test:pedido-financeiro-geo`: passaram.
- `npm run build`, `npm run test:navegacao` e `npm run test:reaproveitamento-compra` no frontend: passaram.
- `npm run provas` parou em `contagemDeLinhas.mjs` por ausencia local de `playwright` em `frontend/node_modules`; os testes anteriores nessa cadeia passaram.
- Sem execucao contra banco ou solicitacoes reais.

## Riscos e proximo passo

Em homologacao, testar uma solicitacao pendente com itens legados `NULL`, marcar varios, aprovar em lote e encaminhar. Confirmar o aviso previo, a rejeicao dos restantes, o historico e a disponibilidade deles para nova solicitacao. Verificar tambem que um item sem decisao ja ligado a cotacao/pedido nao seja rejeitado automaticamente. Em compras antigas ja liberadas, itens sem status e sem vinculo de compra aparecem como nao aprovados implicitamente; itens com vinculo permanecem protegidos. Instalar dependencias de frontend no ambiente de teste antes de repetir `npm run provas`. Preservar os arquivos preexistentes nao relacionados (`docs/GUIA_REFATORACAO_FRONTEND_COLABORADOR_E_HOMOLOGACAO.md` e `outputs/`).
