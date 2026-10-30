# Comparativo por item com valores recuperados de pedidos - DEV

## Escopo e causa
Autorizado pelo usuario em30/10/2026 apos apontar que o historico separado nao resolvia o mapa de comparacao. Base DEV79213894. A resposta atual327 mantem apenas ultima selecao/resposta; precisamos ver os valores de cones/tela/placa preservados em cada pedido dentro do proprio comparativo. Nenhuma EC2/banco/S3/integracao acessada. Sem migration ou gravacao de dados.

## Implementacao
- SolicitacaoCompraController.carregarSolicitacaoCompra: include separado de itens dos pedidos, ja existente, passa a ler tambem tipo/IDs de origem, descricao, unidade, quantidade/preco unitario e quantidade cancelada. Sem nova varredura global/consulta por linha/join de respostas atuais.
- montarComparativoSolicitacao acrescenta pedidos_recuperados usando projecao permitida historicoPropostasCompra. Pedidos apenas da mesma compra, ordenados; zero/ausencia/cancelados preservados. Respostas atuais, menor preco, saldos e alocacoes nao recebem registros recuperados. Workspace devolve comparativo tambem quando existem pedidos sem fornecedores atuais. ACL existente continua antes da resposta.
- historicoPropostasCompra inclui identidade direta dos itens. Nao identifica item pela resposta sobrescrita, nome ou fornecedor.
- GerenciarCotacaoSolicitacao.SecaoComparativo exportada como componente reutilizavel. Mapa mantem colunas de cotacoes atuais e acrescenta uma coluna SOMENTE LEITURA por pedido, inclusive cancelado. Exibe fornecedor/codigo/status, quantidade, preco unitario preciso, total registrado do item, condicao registrada e exclusoes. Nao somar como obrigacao nova. Checkbox Valores dos pedidos controla somente exibicao. Cards mostram os mesmos registros por item.
- Utilitario organiza por tipo+ID persistido, preserva multiplas ocorrencias e distingue IDs numericos iguais entre manual/cadastrado. Sem correspondencia com itens atuais fica visivel no comparativo como registro nao associado; ausencias nao sao inventadas. Comparativo sem itens atuais ainda mostra esses registros.
- Componente recuperado nao recebe callbacks/selecoes e nao cria controles de escrita. Cotacao atual permanece unica fonte para selecionar e gerar pedido. Historico separado existente preservado.

## Arquivos deste escopo
backend/src/controllers/SolicitacaoCompraController.js
backend/src/services/historicoPropostasCompra.js
backend/scripts/validarCompraCotacaoEnvio.js (injecao explicita da projecao pura no isolamento)
backend/scripts/validarComparativoPedidosRecuperados.cjs
frontend/src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx
frontend/src/modules/solicitacao-compra/components/PedidosRecuperadosComparativo.jsx
frontend/src/modules/solicitacao-compra/utils/pedidosRecuperadosComparativo.js
frontend/scripts/fixtures/comparativoPedidosRecuperados.html/.jsx
frontend/scripts/validarComparativoPedidosRecuperados.mjs
ownership e este handoff.

## Validacoes
Backend com semRedeQa: novo teste3casos exercita montagem real/reader real mockado e403de workspace antes de dados; preservacao dos inputs, filtros entre compras, precision e ausencia de ofertas sinteticas. Suites historico5casos, resumo de etapas, cotacoes independentes9casos, envio de cotacao, reabertura e fluxo financeiro GEO aprovadas.
Frontend real no Edge headless: mapa/cards,4colunas por pedido simulado, cones/tela com valores, cancelado, desconhecidos, tipos distintos e ocorrencias multiplas. Sem controles nos recuperados; selecionar resposta atual produz apenas ID2115. Ocultar/exibir pedidos nao altera selecao. Escape de texto, zero APIs externas e sem overflow de pagina desktop1440/mobile390. Screenshots revisados em outputs/comparativo-pedidos-recuperados-20261030; dados de QA simulados, nao nova captura da SOL6758. Build Vite aprovado, avisos habituais.

## Pendencias e proximo passo
Sem commit/push/deploy. Publicar apenas arquivos deste escopo quando autorizado; exige atualizar backend e frontend, pois o leitor antigo nao carrega identidade/valores dos itens. Novo aplicador seletivo deve copiar controller e projecao, atualizar os hashes e incluir novo QA. Nao usar aplicador antigo de historico com hashes anteriores.
A correcao de baixa lote fora de setor segue pendente e SEPARADA (baixaLoteSolicitacaoService e validarBaixaLoteSolicitacao); nao inclui-la inadvertidamente. Handoff antigo de posicionamento tambem tem alteracao documental pendente. Nao executar backfill ou recriar cotacoes antigas.

## Publicacao autorizada
Usuario autorizou commit/push deste ajuste junto da correcao de baixa lote fora do setor. Atualizador seletivo DEV comparativo-baixa-20261030 com3runtimes, QA backend isolado e frontend pela Vercel. Sem escrita no banco durante deploy. Homologar mapa/cards da SOL6758 e tentativa de conferir/baixar por usuario financeiro autorizado com solicitacao em OBRA (apenas pelo operador).
