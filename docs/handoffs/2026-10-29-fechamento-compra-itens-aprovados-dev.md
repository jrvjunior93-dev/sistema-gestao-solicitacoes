# Fechamento de compra respeita aprovacao - DEV

## Escopo e estado
Usuario autorizou implementar em refactor/frontend, sem EC2/banco. Branch codex/compras-aprovacao-fechamento-dev, base origin/refactor/frontend81b0e545578adbff5d475ce15f1c0ee6cf3d1ecd. Semcommit/push/deploy ou migracao paraMAIN. Somente runtime backend/src/services/pedidoCompraService.js, novo QA backend/scripts/validarCompraFechamentoAprovacao.cjs e docs deownership/handoff.

## Diagnostico confirmado
SOL6658(id6693)/compra687: itens28250/285200 fechados porPC303/302; aprovados28320 e28420 restantes;286100 rejeitado. Frontend filtra rejeitados/pendentes; mapa backend incluia todos e exigia parcial mesmo ao selecionar todo saldo aprovado.

## Mudancas
- itemAptoParaFechamento: APROVADO oustatusnull/vazio/ausente (compatibilidade legado/direta). Usado em itens cadastrados e manuais do mapa de saldos. Rejeitados/pendentes permanecem nos registros, apenas fora do saldo autorizado.
- Nova alocacao normalizada revalida aprovacao do item original e recusa409 COMPRA_ITEM_NAO_APROVADO_PARA_FECHAMENTO, mesmo excedente oumapa comsaldo. Nao altera leitor historico obterBaseItemPorResposta.
- Sincronizacao de status inclui status_aprovacao na projecao de itens; evita perderfiltroemconsultaotimizada. Nenhuma sincronizacao retroativa foi executada.
- Pedidos/alocacoes/itens/historicos existentes nao excluidos/alterados porrotinaadministrativa. Aplicacao futura segue fechamentonormal, locks,idempotencia,entrega,autorizacao/financeiro existentes. Nao reduzguardasparcial/final/excedente ou disponibilidades de fornecedor.

## Validacao
7cenarios emVM com servico real e modelos simulados:SOL6658 saldo40, ultima rodadaseleciona20+20 classificadaFINAL, parcialaindaexigeconfirmacao, permissoesfinalpreservadas, bloqueiorejeitado/pendenteinclusiveexcedente,manuais, legadosNULL e sincronizacaoSQLprojetada nao reabre encerrada poritemrejeitado. TesteFINAL intercepta antes da primeira persistencia de fechamento; nenhum pedido real gerado.
Regressoes aprovadas com preloadsemRedeQa: validarPedidoReabertura.js, validarPedidoReaberturaTitulosExcluidos.js(3), validarCompraRemanejamento.js, validarCompraCotacaoEnvio.js, validarPrecisaoCompras.cjs --backend-only (7pass/1frontendskip), validarPedidoCompraFinanceiroGeo.js. Syntaxcheck e gitdiffcheck aprovados. Semalteracaofrontend/buildnecessario. Nenhuma conexao banco/EC2/S3 oualteracaodadosreais.

## Proximo passo
Usuario pedir commit/push:atualizarrefs, conferir ownership, commitar somente escopo e preparar deployDEVseletivo1runtime preservando overlays/heap/processos. Depois homologarSOL6658 somente comdadosautorizados. Nao aplicar correcao direta no banco nem alteraritem286/pedidos302303.

## Publicacao autorizada
Usuario autorizou commit e push somente refactor/frontend. Atualizador DEV seletivo preparado para 1 arquivo runtime, sem SQL/migrations, preservando HEAD, ambiente e producao. Testes do aplicador: 11 aprovados; teste funcional repetido: 7 aprovados. Sem acesso ao servidor. Proximo passo: publicar commit e fornecer comandos ao operador.

