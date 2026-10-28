# Reabertura de pedido apos exclusao dos titulos - 28/10/2026

## Pedido, estado e limites

Usuario informou que excluiu titulos da solicitacao; Reabrir pedido aparecia,
mas backend ainda exigia GEO. Analise e correcao locais sobre ece109c9, sem
EC2, banco real, migration, commit/push ou deploy. Alteracao anterior local
de favorecido explicito permanece preservada e independente desta correcao.
Nao foi consultado um pedido real nem confirmada a exclusao de suas linhas.

## Causa encontrada no codigo

DTO/resumo financeiro usava buscarTitulosPedido, que resolve titulos existentes
com defaultScope deleted_at=null e projecoes/vinculos legados. A validacao de
reabertura contava PedidoCompraTitulo/alocacoes/fretes com IDs de titulo, sem
conferir se o titulo ainda existia. Referencia historica sobrevivente a exclusao
causava resumo sem titulo e erro REABERTURA_EXIGE_APROVACAO_GEO na mesma acao.

## Correcao

Somente assertPedidoPodeReabrirDiretamente em pedidoCompraService.js passa a
usar buscarTitulosPedido com incluirLegados=true e a transaction existente.
Nao remove vinculos, nao altera titulos nem solicita/aprova GEO automaticamente.
Sem titulo existente, permite seguir a reabertura normal; com titulo existente,
mantem GEO. CANCELADO/ESTORNADO ainda existentes continuam sujeitos a mesma
regra anterior. Excluir nao equivale a apenas cancelar ou estornar.

Mesma consulta atende vinculo direto, alocacao antiga, frete, compartilhamento
e projecoes renegociadas. Cadeia de autorizacao, escopo, pedido cancelado,
justificativa, locks, historico, rollback e replay continuam existentes.
O servico financeiro e o frontend nao foram alterados.

## Arquivos e validacao

- backend/src/services/pedidoCompraService.js (um unico helper).
- backend/scripts/validarPedidoReabertura.js: fixture exportada sob guarda
  require.main, consulta financeira simulada no harness, suite antiga mantida.
- backend/scripts/validarPedidoReaberturaTitulosExcluidos.js (novo).
- README Compras e ownership.

QA novo executa ambos os servicos reais, com pedido/historico em memoria e
consulta financeira Sequelize real em SQLite :memory: com defaultScope.
Tres casos diretos/alocacao/frete: titulos existentes PREVISAO/ABERTO/PARCIAL/
QUITADO/CANCELADO/ESTORNADO/RENEGOCIADO exigem GEO; titulo excluido logicamente
ou fisicamente nao bloqueia por vinculo antigo. Outro pedido nao interfere.
Resumo e validacao concordam; titulo/vinculos SQL permanecem identicos antes/
depois da reabertura; historico de reabertura unico no replay.
Projecoes renegociadas/compartilhadas usam fronteira simulada nesse teste;
regressao propria de renegociacao foi executada separadamente.

--baseline carrega somente o helper antigo de ece109c9 no harness: os mesmos
tres cenarios falham apos exclusao exigindo GEO. Codigo atual passa os3testes.
Regressoes aprovadas: validarPedidoReabertura (servico/controller/SQL/locks/
permissao/rollback), validarTitulosPorPedido, validarPedidoCompraFinanceiroGeo
e validarTituloRenegociacaoVinculos sob semRedeQa; UI real1366/390 em
validarPedidoReabertura.mjs (APIs ficticias). Sintaxe/diff e docs conferidos.
Nenhuma medicao de carga/MySQL real; nenhuma acao real de reabertura executada.

## Proximo passo

Entrega ainda local. Se autorizado, publicar seletivamente em refactor/frontend
para homologacao antes de promover a main, preservando recursos exclusivos DEV
e a entrega anterior de favorecido. Eventual atualizador EC2 deve ser pacote
novo, manter PROD4096/DEV/envs e sem SQL/migrations; agente nao acessa EC2.
Nao reutilizar manifestos fechados anteriores que incluem hashes deste servico.
