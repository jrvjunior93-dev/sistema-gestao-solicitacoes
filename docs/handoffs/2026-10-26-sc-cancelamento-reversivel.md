# Cancelamento reversível SC — handoff local

## Publicação DEV autorizada nesta continuação

Usuário autorizou commit/push somente `refactor/frontend` e pediu os códigos para ele atualizar EC2 DEV. Foi preparado worktree `outputs/worktree-cancelamento-reversivel-dev`, branch `codex/sc-cancelamento-reversivel-dev-20261026`, base remota `ed211fabd4dfb2d0b43074af9e0a982b4b461822`. As alterações funcionais vieram do commit local `e6dc38d4`; somente o conflito documental de ownership foi resolvido mantendo as anotações DEV e acrescentando esta tarefa. Não transportar commits exclusivos da main.

Novos arquivos: doctor `backend/scripts/compraReorganizacaoDevSchema.js`, seu validador, aplicador/validador/manifesto `ops/deploy/*sc-reversivel-dev-20261026*` e README. A migration expõe sua estrutura para comparar o DDL nativo MySQL exato permitido; continua somente criando journal e índice. Doctor usa identidade/TLS staging, leitura em transação READ ONLY para conferir e canal transacional dedicado na aplicação (DDL MySQL pode fazer commit implícito), guardando apenas CREATE/índice exatos e uma entrada fixa no ledger. Não carrega models/index ou runner geral. NSDOCS permanece OFF.

Aplicador aceita base ed211fab ou backend fc369151 com árvores backend iguais, faz fast-forward somente ao commit inventariado, testa sem rede, aplica migration isolada e reinicia somente backend-dev; confere pares/ambientes/Nodes/daemon/dumps/systemd e saúde. Estado privado protege retomada e reinício duplicado. Não faz cancelamentos ou testes reais com escrita em SCs. Nenhum frontend novo.

QA desta continuação: 30 testes de domínio/serviços/cliente/permissões/schema, 5 do aplicador e 12 regressões existentes; sintaxe/diff/inventário conferidos. Sem EC2/RDS/NSDOCS pelo agente; sem mudança na main ou produção. Seguir README DEV e comandos finais com commit/SHA256 publicado. Depois da saída DEV, homologar somente por execução do usuário, com SCs de teste revisadas; os 95 alvos de produção continuam sem aprovação de execução. Os registros seguintes documentam a preparação original, anterior à autorização de publicação.

## Autorização e isolamento

Pedido atual: implementar a operação revisável, reversível integralmente ou por SC. Usuário proibiu acesso direto do agente à EC2, inclusive leitura. Somente o usuário executará os comandos remotos. Nenhum SSH/SSM/terminal remoto, deploy, restart, migration real, cancelamento, escrita financeira, alteração do DEV ou execução NSDOCS ocorreu nesta etapa. Não houve commit/push. Sem subagentes.

Worktree: `outputs/worktree-cancelamento-reversivel-sc`, branch `codex/sc-cancelamento-reversivel-20261026`, base main publicada `f429b6f22b78779fc2a1277a797323512aeea7c7`. O checkout original está antigo e contém outros artefatos: não transportar mudanças indiscriminadamente nem usar `git add .` nele. `backend/node_modules` é uma junction local para as dependências já existentes de `outputs/worktree-autorizacao-valor-main/backend/node_modules`; nenhuma instalação.

## Implementado

- Domain/service/store de reorganização: simulação sem journal/alteração de compras, aplicação e reversão por SC, hash de conteúdo, bloqueios e snapshot/diff transacional. Máximo 100 SCs no plano, 10 por chamada de escrita; commit por SC.
- Model `CompraReorganizacaoOperacao` e migration **somente nova tabela** `202610260002_compra_reorganizacao_reversivel.js`; valida estrutura/índice, sem backfill/down destrutivo. Não aplicada.
- Controller/rotas autenticadas `/compras/reorganizacao`: COMPRAS/COTACOES, autenticação/MFA/CSRF, permissão granular existente e escopos de compra/obra. Não altera regras de biometria ou financeiro.
- Helpers antigos recebem modo opcional de transação externa e preservação de IDs de rateio, usado apenas na operação nova; comportamento padrão mantido. Erro em transação externa não faz consulta de replay fora dela.
- CLI manual `backend/scripts/compraReorganizacaoHttp.js`: API allowlist, arquivo privado de sessão, seleção/confirmação explícita, sem banco/SQL/SSH/.env, sem retry, saídas exclusivas e persistidas por resposta.
- Builder LOCAL `prepararCompraReorganizacaoManifestos.js` e testes com transporte simulado/banco em memória. `.gitignore` protege arquivos `.jwt` e saídas sintéticas do QA.

Arquivos funcionais: novos `compraReorganizacaoDomain/Service/Store.js`, controller, model, migration, CLI/builder, testes `validarCompraReorganizacao{,Cliente,Seguranca}.js`, helpers de QA. Alterados `models/index.js`, `routes.js`, `pedidoCompraService.js`, `pedidoEntregaService.js`, `pedidoCompraFreteService.js`. Documentação/ownership desta tarefa. Nenhum arquivo funcional do frontend alterado.

## Comportamento e riscos

Total exige SC sem pedidos/títulos; principal compartilhada bloqueia. Parcial distingue não comprado de não recebido. Itens financeiros bloqueiam a SC toda, sem cancelamento/estorno financeiro automático. Novos movimentos depois da aplicação bloqueiam reversão. Prazos vencidos não são reabertos; versões de entrega avançam. Fechamento novo é marcado REVERTIDO, rateio novo zerado, controle de entrega novo neutralizado; registros e históricos não são apagados. Audit do novo lote usa REORGANIZACAO_APLICADO/REVERTIDO, preservando eventos dos serviços existentes.

Hash de plano é integridade de conteúdo, não assinatura/autoridade. Cada ação revalida sessão, permissões e dados. Guardas SQL restritas à conexão da transação protegem lista de tabelas/campos; não há gancho global no Sequelize. Interface da operação é CLI HTTP, não botões no frontend. Não afirmar que a funcionalidade já está disponível nos ambientes.

## Base da revisão

Extrato executado pelo usuário: `outputs/conferencia-cancelamento-sc-20261026/conferencia-manual.jsonl`, 26/10/2026 13:38:04.287Z. 95 SCs: 71 totais sem pedidos, 24 parciais com 33 pedidos/86 itens, 57 itens com saldo registrado. 12 títulos, uma baixa de R$62,90; nenhuma alteração financeira proposta. Complemento de descrições/status/vencimentos ainda não recebido. Não usar extração anterior do agente como fotografia atual.

Builder gerou no checkout original `revisao/operador-reversivel/{total,saldo,pedidos,conferencia}.json`, sem rede/banco. Os dois manifestos parciais são alternativas por SC, não dois passos acumuláveis. Nenhuma aprovação de execução decorre desses arquivos. Dossiê HTML/builder original atualizado com implantação pendente, novos textos de auditoria e links para manifestos; 389 mensagens antigas permanecem referência de serviços anteriores, não contagem de inserções do operador. 119 textos novos consideram alternativas.

## QA

23 testes novos passaram com `node --require ./scripts/helpers/semRedeQa.js --test ...`. SQLite nativo Node24 em memória com Sequelize/models reais e dados sintéticos. Um teste de integração executa serviços reais de saldo, entrega, totais, frete e prazo, guarda SQL e reversão; hidratação da SC é adaptada só no teste. Concorrência de engine serializada no fixture; SQL/guarda da conexão MySQL testados sem conexão. Transporte HTTP e controller de autorização possuem dependências simuladas. Não é prova de locks MySQL ou sessão real.

12 regressões passaram com rede bloqueada: `validarPedidoEntregas`, `validarPedidoEntregasAcesso`, `validarCompraRemanejamento`, `validarEncerramentoSemPedidoHistorico`, `validarCompraEtapasResumoPedido`, `validarPedidoCompraFinanceiroGeo`, `validarTitulosPorPedido`, `validarVinculosNfePedidos`, `validarFilaBaixaEstorno`, `validarFilaBaixaComposta`, `validarAnaliseProprietario`, `auditarPermissoesGranulares`. Logs locais ignorados em `outputs/qa-reorganizacao` e `qa-*.log`. Artefatos do teste de cliente são sintéticos/ignorados e não devem ser publicados.

## Próximo passo exato

Revisar diff e roteiro `ops/operacao/README-sc-cancelamento-reversivel-20261026.md`. Somente após pedido de publicação: commitar arquivos deste pacote, integrar à branch DEV acordada sem perder alterações mais novas, preparar aplicador de **uma migration aditiva** com identidade/TLS/backup e guardas, e entregar comandos para o usuário executar. Não fornecer runner geral, não aplicar no RDS pelo agente. Homologar em DEV com SCs representativas via fluxos normais, simulação, reversão, conflitos, preservação financeira e perda de resposta. Depois preparar produção, obter revisão final de SCs/itens/motivos e confirmação atual de backup/timer/janela. Não cancelar nem reverter nada apenas porque a implementação está pronta.
