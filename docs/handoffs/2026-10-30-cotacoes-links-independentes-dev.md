# Cotacoes independentes por fornecedor - DEV

## Pedido e limites
Implementacao autorizada na base origin/refactor/frontend ea14b7fbb895fdccdb8f2c7c5e18b985ff94435c, branch codex/cotacoes-multiplos-links. Commit e push na refactor/frontend autorizados pelo usuario. Deploy somente pelo operador. Nenhuma EC2, conexao com banco real, S3 ou integracao acessada. Nenhuma migration ou regularizacao executada. Nao reconstruir versoes antigas da SOL6758 que nao existem.

## Comportamento
Cada envio gera novos registros SolicitacaoCompraFornecedor e itens selecionados, com token aleatorio independente. Nao reutiliza fornecedor+compra como identidade nem apaga itens/respostas antigos. Novo campo opcional chave_envio e log LINKS_INDEPENDENTES, protegidos pelo lock UPDATE existente da compra. Retry da mesma chave/payload devolve os links; divergencia de payload retorna409. Clientes antigos sem chave usam fingerprint do payload para evitar duplicacao silenciosa.
Frontend gera chave por tentativa, mantem em falha e impede clique simultaneo. Botao explicita novos links independentes; copiar link existente continua disponivel. Cotacao identificada por numero do vinculo, uma coluna por cotacao no mapa e chaves de linha por resposta. Link do pedido deriva de resposta_item_id, nao de primeiro/ultimo pedido do fornecedor.

Fechamento agrupa por vinculo de cotacao, com descontos, fretes, tributos e disponibilidade isolados. Saldo global aprovado, excedentes, permissoes, locks e idempotencia de fechamento permanecem. Previsoes de entrega recebem cotacao_fornecedor_id opcional e sao confirmadas por cotacao. Payload antigo por fornecedor funciona quando nao ambiguo. Reabertura sincroniza somente vinculos de origem do pedido por resposta; encerramento global da compra mantem finalizacao global anterior.
Endpoint antigo de criar pedido somente por fornecedor recusa ambiguidades e orienta comparativo. Edicao/adicao usa linhagem da resposta, sem escolher primeiro vinculo repetido. Alocacoes antigas com origem ambigua impedem novo fechamento para conferencia, sem alterar historico.

## Arquivos
Controllers SolicitacaoCompraController e CotacaoFornecedorController (contagem de pedido anterior e reabertura de oferta por resposta do link); services cotacoesIndependentes e pedidoCompraService; operationalValidators; pagina GerenciarCotacaoSolicitacao e ConfirmarEntregasPedidos; testes validarCotacoesIndependentes, validarCompraFechamentoAprovacao, validarCompraCotacaoEnvio e validarPedidoReabertura; ownership.

## Validacao local
9 cenarios de links: controller real com modelos simulados, dois links mesmo fornecedor, legado intocado, replay, conflito409, rollback, concorrencia8envios sob lock simulado, previsoes por cotacao, agrupamento real e identidades do frontend.
9 cenarios de fechamento: inclui saldoSOL6658, aprovacao, permissoes, valores separados de desconto/frete/DIFAL e saldo global entre links.
Regressoes aprovadas: envio de cotacao, remanejamento, reabertura, titulos excluidos(3casosSQLite simulado), fluxo Compras/GEO/Financeiro e precisao backend(7pass/1frontend skip). Oferta adicional do mesmo fornecedor tambem aprovada. Todos backend com preload semRedeQa. Build frontend aprovado. Sem teste em ambiente conectado ou homologacao real.

## Proximos passos
Revisar diff e publicar somente mediante pedido de commit/push. Preparar deploy DEV seletivo com base operacional conferida; nao usar git pull no servidor com overlays. Homologar duas cotacoes do mesmo fornecedor com itens/parcelamentos/datas distintos, responder cada token e gerar pedidos independentes; conferir saldo global e pedido/link de origem. Historico antigo nao recebe backfill; fluxo novo preserva a partir de novos envios. Cancelamento global de cotacao continua com alcance global existente; nao foi criado botao de cancelamento individual nesta tarefa.

## Publicacao
Atualizador seletivo DEV preparado: cinco runtimes, nove scripts QA, onze testes do aplicador aprovados. QA de frontend executado localmente; no servidor --backend-only pula apenas o caso que depende do fonte frontend. Sem SQL ou migrations.
