# Ownership Ativo

Ownership temporario da sessao `/root` em 2026-09-17 para manter comentarios
dos itens livres a quem visualiza e bloquear comentarios da conversa geral fora
do setor: `backend/src/controllers/SolicitacaoController.js`,
`backend/src/services/solicitacaoRetornoService.js`,
`frontend/src/pages/SolicitacaoDetalhe/index.jsx`,
`frontend/src/pages/SolicitacaoDetalhe/RetornoSolicitacaoBar.jsx`,
`frontend/src/pages/SolicitacaoDetalhe/Conversa.jsx`,
`backend/scripts/validarBloqueioRetornoObra.js` e handoff correspondente.
Preservar alteracoes alheias no worktree.
Ownership liberado apos validacoes e registro em
`docs/handoffs/2026-09-17-comentarios-fora-do-setor.md`.

Ownership temporario da sessao `/root` em 2026-09-17 para corrigir a validacao
dos parametros de decisao/recebimento por item e a consulta indevida do resumo
de conversas sem permissao: `backend/src/validators/securityValidators.js`,
`backend/src/routes.js`, `backend/scripts/validarCompraCotacaoEnvio.js`,
`frontend/src/layout/Layout.jsx` e handoff de regressao. Preservar os arquivos
alheios ja modificados no worktree.
Ownership liberado apos validacoes e registro em
`docs/handoffs/2026-09-17-correcao-parametros-compra-comunicacao.md`.

Ownership temporario da sessao `/root` em 2026-09-17 para classificar itens
legados sem decisao no reaproveitamento, sem duplicar os que ja entraram em
cotacao ou pedido. Escopo: `backend/src/controllers/SolicitacaoCompraEtapasController.js`,
`backend/src/controllers/SolicitacaoCompraController.js`,
`frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`,
`frontend/src/modules/solicitacao-compra/utils/reaproveitamentoItensCompra.js`,
`frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`,
`frontend/scripts/validarReaproveitamentoCompra.mjs` e handoff correspondente.
Ownership liberado apos validacoes e atualizacao dos handoffs
`docs/handoffs/2026-09-17-aprovacao-itens-geo-em-lote.md` e
`docs/handoffs/2026-09-17-reaproveitamento-itens-compra.md`.

Ownership temporario da sessao `/root` em 2026-09-17 para concluir o
reaproveitamento de itens rejeitados apos encaminhamento da compra:
`frontend/src/pages/SolicitacaoDetalhe/CompraEtapas.jsx`,
`frontend/src/pages/SolicitacaoDetalhe/index.jsx`,
`frontend/src/modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`,
`frontend/src/modules/solicitacao-compra/pages/RevisarSolicitacaoCompra.jsx` e
`frontend/src/modules/solicitacao-compra/utils/reaproveitamentoItensCompra.js`, alem do
`frontend/scripts/validarReaproveitamentoCompra.mjs` e `frontend/package.json`.
Preservar mudancas existentes destes
arquivos e demais alteracoes nao relacionadas no worktree.
Ownership liberado apos validacoes e registro em
`docs/handoffs/2026-09-17-reaproveitamento-itens-compra.md`.

Ownership temporario da sessao `/root` em 2026-09-17 para alinhar a aprovacao de
solicitacao de compra por item: `backend/src/controllers/SolicitacaoController.js`,
`backend/src/controllers/SolicitacaoCompraController.js`,
`backend/src/controllers/SolicitacaoCompraEtapasController.js`, `backend/src/routes.js`,
`backend/scripts/validarCompraCotacaoEnvio.js`, `frontend/src/pages/SolicitacaoDetalhe/`
e `frontend/src/services/compras.js`. Outros arquivos ja modificados no worktree
nao fazem parte desta tarefa.
Ownership liberado apos as verificacoes e o handoff em
`docs/handoffs/2026-09-17-aprovacao-itens-geo-em-lote.md`.

Ownership da sessao `/root` iniciado em 2026-09-17 para integrar a
operacao de Compras ao detalhe da solicitacao, decidir e comentar itens por etapa,
registrar recebimento por item e destacar novas interacoes nas listas. Escopo
reservado: controllers, services, models, migrations e testes de solicitacoes,
solicitacao-compra, pedidos e alertas; `frontend/src/pages/SolicitacaoDetalhe/`,
`frontend/src/pages/Solicitacoes/`, telas de Compras envolvidas e servicos
correspondentes. Ownership liberado apos validacoes e registro do handoff em
`docs/handoffs/2026-09-17-detalhe-solicitacao-compras-etapas.md`.

## Ownership ativo

Ownership temporario da sessao `/root` em 2026-09-16 para calcular VGV das
obras privadas sem VGV cadastrado a partir do valor base de venda das unidades.
Arquivos reservados:

- `backend/src/services/obraVgvService.js`
- `backend/src/controllers/ResultadoObrasController.js`
- `backend/src/services/obraGestaoService.js`
- `backend/scripts/validarVgvUnidadesObra.js`
- `frontend/src/pages/FinanceiroResultadoObras.jsx`
- `frontend/src/pages/Obras.jsx`
- `docs/handoffs/VGV_OBRAS_UNIDADES_2026-09-16.md`
- `docs/workspace/OWNERSHIP_ATIVO.md`

Ownership desta sessao liberado em 2026-09-16 apos testes e handoff.

Ownership da sessao `/root` iniciado em 2026-09-16 para corrigir a composicao
do Financeiro de Obras (Comprometido = Realizado + A realizar), incluindo historico
legado, PDF, orientacoes da tela e teste de regressao. Arquivos reservados:

- `backend/src/services/relatorioFinanceiroService.js`
- `backend/src/services/financeiroObrasRelatorioPdfService.js`
- `backend/scripts/validarFinanceiroObrasComprometido.js`
- `backend/package.json`
- `frontend/src/pages/FinanceiroObras.jsx`
- `docs/handoffs/FINANCEIRO_OBRAS_COMPROMETIDO_2026-09-16.md`

Ownership desta sessao liberado em 2026-09-16 apos validar a composicao,
documentar o handoff e preservar as alteracoes sem commit.

Antes de trabalho paralelo, registrar agente, escopo, arquivos reservados e horario de inicio. Remover a reserva ao concluir o handoff.

Ownership ativo da sessao `/root` iniciado em 2026-09-14 para corrigir a sincronizacao
de vencimento entre titulo financeiro e parcela comercial, reorganizar responsivamente a
tela de Contratos de Venda e avaliar a promocao isolada do modulo Comercial. Arquivos reservados:

- `backend/src/services/tituloFinanceiroService.js`
- `backend/src/services/comercialService.js`
- `backend/scripts/validarComercialTituloVencimento.js`
- `backend/package.json`
- `frontend/src/pages/ComercialContratos.jsx`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/COMERCIAL_CONTRATOS_RESPONSIVIDADE_VENCIMENTO_2026-09-14.md`

Ownership desta sessao liberado em 2026-09-14 apos corrigir a fonte operacional do
vencimento, sincronizar o status comercial, reorganizar responsivamente a tela, concluir
os testes e documentar o plano de backport isolado. Alteracoes permanecem sem commit.

Ownership ativo da sessao `/root` retomado em 2026-09-14 para permitir selecao de centenas
de comprovantes, mantendo lotes internos pequenos e seguros. Arquivos reservados:

- `frontend/src/pages/FinanceiroFilaPagamentos.jsx`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/FILA_PAGAMENTOS_COMPROVANTES_PDF_2026-09-14.md`

Ownership deste ajuste liberado em 2026-09-14 após compilação do frontend, prova
responsiva e revisão da estratégia de processamento em lotes. O usuário pode selecionar
até 500 PDFs em uma única ação, enquanto o backend continua protegido por lotes de 10.

Ownership ativo da sessao `/root` iniciado em 2026-09-14 para implementar a primeira fase da
leitura deterministica de comprovantes PDF na Fila de Pagamentos, com previa, deduplicacao,
sugestao de titulo, confirmacao humana e preenchimento da baixa sem executa-la automaticamente.
Arquivos reservados:

- `backend/package.json`
- `backend/package-lock.json`
- `backend/migrations/202609140002_fila_pagamentos_comprovantes_pdf.js`
- `backend/src/config/uploadComprovantesPagamento.js`
- `backend/src/constants/moduloPermissoes.js`
- `backend/src/controllers/PagamentoManualFilaController.js`
- `backend/src/generated/navegacaoFonteUnica.cjs`
- `backend/src/models/PagamentoManualFilaItem.js`
- `backend/src/models/index.js`
- `backend/src/routes.js`
- `backend/src/services/authorizationService.js`
- `backend/src/services/pagamentoComprovantePdfService.js`
- `backend/src/services/pagamentoManualFilaService.js`
- `backend/src/validators/paymentValidators.js`
- `backend/scripts/validarComprovantesPdfFila.js`
- `frontend/src/pages/FinanceiroFilaPagamentos.jsx`
- `frontend/src/services/financeiro.js`
- `frontend/src/utils/acessoProduto.js`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/FILA_PAGAMENTOS_COMPROVANTES_PDF_2026-09-14.md`

Ownership deste escopo liberado em 2026-09-14 após validação dos sete modelos reais,
testes da fila e permissões, compilação do frontend, prova responsiva dos modais e registro
do handoff. As alterações permanecem sem commit até autorização explícita do usuário.

Ownership da sessao `/root` iniciado em 2026-09-14 para permitir a edicao parcial da
configuracao de Aprovacao por Tipo sem revalidar regras antigas nao alteradas. Arquivos trabalhados:

- `backend/src/controllers/ConfiguracaoSistemaController.js`
- `backend/src/services/solicitacao/aprovacaoTipoConfig.js`
- `backend/scripts/validarFluxosPixApropriacoesSolicitacao.js`
- `frontend/src/pages/AprovacaoSolicitacaoPorTipo.jsx`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/APROVACAO_TIPO_EDICAO_PARCIAL_2026-09-14.md`

Ownership deste escopo liberado em 2026-09-14 apos teste automatizado do fluxo, compilacao
do frontend e registro do handoff.

Ownership da sessao `/root` iniciado em 2026-09-14 para corrigir a validacao Linux da
recarga e implementar troca rapida de usuario exclusiva do ambiente de desenvolvimento. Arquivos trabalhados:

- `backend/scripts/validarRecargaCartao.js`
- `backend/.env.example`
- `backend/src/config/env.js`
- `backend/src/controllers/AuthController.js`
- `backend/src/controllers/DevUserSwitchController.js`
- `backend/src/generated/navegacaoFonteUnica.cjs`
- `backend/src/middlewares/auth.js`
- `backend/src/modules/governanca/services/auditoriaOperacionalService.js`
- `backend/src/routes.js`
- `backend/src/services/devUserSwitchService.js`
- `backend/src/services/securityLogService.js`
- `backend/scripts/validarDevUserSwitch.js`
- `backend/package.json`
- `frontend/src/App.jsx`
- `frontend/src/components/DevUserSwitcher.jsx`
- `frontend/src/contexts/AuthContext.jsx`
- `frontend/src/index.css`
- `frontend/src/layout/Layout.jsx`
- `frontend/src/navigation/navigationConfig.jsx`
- `frontend/src/pages/ConfiguracaoUsuariosTesteRapido.jsx`
- `frontend/src/services/auth.js`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/TROCA_RAPIDA_USUARIOS_DEV_2026-09-14.md`

Ownership deste escopo liberado em 2026-09-14 apos validacoes de seguranca, auditoria,
compilacao do frontend e registro do handoff.

Ownership ativo da sessao `/root` iniciado em 2026-09-14 para corrigir o fluxo de aprovacao
por tipo e a classificacao financeira automatica da recarga de cartao. Arquivos reservados:

- `backend/src/controllers/ConfiguracaoSistemaController.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/models/CartaoRecarga.js`
- `backend/src/models/index.js`
- `backend/src/services/recargaCartaoService.js`
- `backend/src/services/solicitacao/aprovacaoTipoConfig.js`
- `backend/scripts/validarRecargaCartao.js`
- `backend/scripts/validarFluxosPixApropriacoesSolicitacao.js`
- `backend/migrations/202609140001_cartao_recarga_classificacao_financeira.js`
- `frontend/src/pages/AprovacaoSolicitacaoPorTipo.jsx`
- `frontend/src/pages/CartoesRecarga.jsx`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`
- `docs/handoffs/RECARGA_APROVACAO_E_CLASSIFICACAO_2026-09-14.md`

Escopo adicional da sessao `/root` iniciado em 2026-09-14 para priorizar e destacar
solicitacoes com pedido de retorno pendente. Arquivos reservados:

- `backend/src/controllers/SolicitacaoController.js`
- `backend/scripts/validarBloqueioRetornoObra.js`
- `frontend/src/pages/Solicitacoes/index.jsx`
- `frontend/src/pages/Solicitacoes/LinhaSolicitacao.jsx`
- `frontend/src/components/lista-avancada/lista-avancada.css`
- `docs/handoffs/SOLICITACAO_RETORNO_PRIORIDADE_VISUAL_2026-09-14.md`

Escopo adicional de prioridade visual do retorno liberado em 2026-09-14 após validação estática,
build do frontend e registro do handoff
`docs/handoffs/SOLICITACAO_RETORNO_PRIORIDADE_VISUAL_2026-09-14.md`.

Ownership da sessao `/root` liberado em 2026-09-12 apos remover a selecao redundante de empresa
dos fluxos em que a conta bancaria define a empresa, concluir build e validacoes financeiras e
registrar `docs/handoffs/FINANCEIRO_EMPRESA_DEFINIDA_PELA_CONTA_2026-09-12.md`.

Ownership da sessao `codex-snapshot-sanitizado-dev-v2-2026-08-29` liberado apos configurar
`export-ignore` para QA, ambientes, uploads, artefatos locais e scripts de dados no pacote de deploy.

Ownership da sessao `codex-migrations-somente-estrutura-2026-08-29` liberado apos converter
as duas migrations novas com cadastro funcional, proteger o runner contra DML, auditar as 38
migrations exclusivas da V4 e atualizar o procedimento de transformacao.

Ownership da sessao `codex-prontidao-transformacao-dev-v2-2026-08-29` liberado apos
preservar as correcoes especificas da dev-v2, bloquear migrations no bootstrap, criar o preflight
somente leitura, compilar o frontend e registrar o handoff
`docs/handoffs/TRANSFORMACAO_DEV_V2_PARA_V4_2026-08-29.md`.

Ownership da sessao `codex-compras-oferta-saldo-mesmo-fornecedor-2026-08-29` liberado apos
integrar o delta completo do commit fonte `0a222a18`, aplicar e conferir a migration aditiva,
executar as validacoes de Compras, compilar o frontend, reiniciar o backend e registrar o handoff.

Ownership da sessao `codex-retorno-setor-principal-2026-08-29` liberado apos restringir escrita
ao setor principal, confirmar o botao de retorno no CT-0028, fechar a prestacao de recarga fora do
setor, executar build e QA somente de leitura e registrar o handoff.

Ownership da sessao `codex-pagamento-contrato-instrucional-2026-08-29` liberado apos separar
cartao corporativo de instrucoes de pagamento do contrato, validar PIX/boleto/demais formas,
executar build e QA reversivel e registrar o handoff.

Ownership da sessao `codex-previsao-ate-medicao-2026-08-28` liberado apos ajustar o ciclo
PREVISAO -> ABERTO na aprovacao da medicao, remover a duplicidade visual, desabilitar a geracao
manual para contratos novos/recarga, executar as suites reversiveis e registrar o handoff.

Ownership da sessao `codex-medicao-favorecido-obrigatorio-2026-08-28` liberado apos build,
QA reversivel de PIX, boleto e demais formas, conferencia da limpeza e registro do handoff.

Ownership da sessao `codex-medicao-aprovacao-compacta-2026-08-28` liberado apos build,
validacao visual somente de leitura e health check aprovados.

Ownership da sessao `codex-matriz-regressao-continuacao-2026-08-27` liberado apos concluir
os 227 casos, a navegacao visual das 111 rotas do menu, o build final e o handoff consolidado.

Ownership da sessao `codex-matriz-mestra-regressao-2026-08-27` liberado apos criar a matriz de
227 casos, executar o primeiro bloco visivel, registrar a escrita visual em `SOL-5136` e publicar
o handoff `docs/handoffs/MATRIZ_MESTRA_REGRESSAO_2026-08-27.md`.

Ownership da sessao `codex-auditoria-permissoes-granulares-2026-08-27` liberado apos auditoria
das 338 chaves, correcoes backend/frontend, build e provas somente de leitura.

Ownership da sessao `codex-correcao-recarga-cartao-2026-08-27` liberado apos corrigir a forma de
pagamento ausente, validar a edicao do cartao e concluir o QA transacional com rollback.

Ownership da sessao `codex-editar-cartao-recarga-2026-08-27` liberado apos tornar a edicao
explicita na tabela e concluir o build do frontend.

Ownership da sessao `codex-recarga-cartao-2026-08-27` liberado apos migration, script de dados,
build, QA transacional com rollback, conferencia da sequencia e consultas reais dos relatorios de obras.

Ownership da sessao `codex-despesa-eventual-2026-08-27` liberado apos migration, build,
QA somente de leitura/simulado e health check aprovados. Reinicio coordenado do backend e validacao
visual autenticada permanecem como proximo passo operacional.

Ownership da sessao `codex-codigo-contrato-no-tipo-2026-08-27` liberado apos integrar o numero do
contrato ao tipo, remover o card redundante, ajustar o Objeto para largura total e concluir o build.

Ownership da sessao `codex-reposicionar-titulo-vencimento-detalhe-2026-08-27` liberado apos
reposicionar Titulo e Vencimento no cabecalho da tela de detalhes e concluir o build do frontend.

Ownership da sessao `codex-retorno-solicitacao-por-setor-2026-08-27` liberado apos migration,
build, QA reversivel, conferencia da limpeza e health check aprovados. Validacao visual autenticada
permanece pendente porque o navegador interno estava na tela de login.

O ajuste de salvamento e exibicao do cadastro oficial dos itens manuais foi concluido e registrado
em `docs/handoffs/COMPRAS_CATALOGACAO_ITENS_MANUAIS_2026-08-20.md`.

Ownership da sessao `codex-formas-pagamento-nova-solicitacao-2026-08-26` liberado apos build,
validacao visual e teste reversivel de persistencia.

Ownership da sessao `codex-ocultar-trava-parcelas-2026-08-26` liberado apos build aprovado.

Ownership da sessao `codex-remover-numero-pedido-detalhe-2026-08-26` liberado apos build aprovado.

Ownership da sessao `codex-fluxo-novo-pedido-aditivo-2026-08-26` liberado apos migration e teste reversivel aprovados.

Ownership da sessao `codex-financeiro-obra-somente-leitura-2026-08-26` liberado apos build,
teste somente de leitura e health check aprovados.

Ownership da sessao `codex-remover-pagamentos-detalhe-2026-08-26` liberado apos build aprovado.

Ownership da sessao `codex-aditivo-aprovado-volta-obra-2026-08-26` liberado apos QA reversivel
e health check aprovados.

Ownership da sessao `codex-situacao-parcela-titulo-contrato-2026-08-26` liberado apos build,
QA reversivel dos tres estados e health check aprovados.

Ownership da sessao `codex-medicao-anexo-pagamento-condicional-2026-08-26` liberado apos build,
QA reversivel do pagamento/anexo, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-contrato-reenvio-evidencia-atendido-2026-08-26` liberado apos build,
QA reversivel da evidencia/status, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-contrato-juridico-status-pendente-2026-08-26` liberado apos QA reversivel,
conferencia da limpeza e health check aprovados.

Ajuste de fronteira da sessao `codex-contrato-juridico-status-pendente-2026-08-26` liberado apos
prova reversivel do valor exatamente no limite, limpeza e novo health check aprovados.

Ownership da sessao `codex-revisao-assinado-somente-origem-2026-08-26` liberado apos QA
reversivel, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-bloquear-cancelamento-geo-aguardando-assinatura-2026-08-26` liberado
apos QA reversivel, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-vencimento-boleto-conferencia-juridica-2026-08-26` liberado apos QA
reversivel, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-documentacao-juridica-abertura-contrato-2026-08-26` liberado apos
migration, build, validacao visual, QA reversivel, conferencia da limpeza e health check aprovados.

Ownership da sessao `codex-qualificacao-conjuge-contrato-2026-08-27` liberado apos build,
validacao visual, QA reversivel, conferencia da limpeza e health check aprovados.
