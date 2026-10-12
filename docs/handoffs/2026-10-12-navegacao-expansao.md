# Expansao da navegacao - itens 2, 3 e 4

## Autorizacao e estado

Usuario autorizou aplicar integralmente Compras, Financeiro, Colaboradores e
os demais modulos do plano, em lotes testados, sem mudar visibilidade.
Este handoff registra um lote local em andamento, NAO a conclusao integral.
Base publicada: 9565eb3463c25d10bfb7be7bb517940fe6dee0e7,
worktree C:/Fluxy-refactor-frontend, refactor/frontend.
Sem commit/push, main, deploy, migration, banco ou escrita real de negocio.
Auditoria financeira e documentacao compartilhada alheias preservadas.

## Contrato preservado

- Somente inputs, IDs, filtros, selecoes e assinaturas de concorrencia em
  memoria da sessao. Sem DTO de permissao/saldo, URL assinada, token/passkey,
  confirmacao, resolvers, status de mutacao ou caches de respostas autorizadas.
- Arquivos de formulario podem ficar apenas em memoria (File/Blob), nunca
  serializados em disco. A comparacao distingue troca de arquivos.
- GETs autorizados novos materializam a tela; 403/404 nao recuperam DTO antigo.
- Permissoes e regras de visibilidade do backend nao foram editadas.
- Restaurar nao cria/baixa/envia/salva automaticamente. Autosave de pagamento
  RH aguarda acao explicita depois de restaurar edicao ainda nao salva.
- Troca de usuario/escopo continua invalidando a memoria pelo Layout existente.
- Nao foi ampliado keepalive: apenas NovaSolicitacao permanece retida.

## Arquivos e acoes deste lote

Compras:
GerenciarCotacaoSolicitacao.jsx: fornecedor selecionado por ID com releitura
de fornecedor/parceiro, itens de envio, motivo de cancelamento e encerramento;
confirmacao nao restaurada, mutex de encerramento.
PedidoCompraDetalhe.jsx + pedidoWorkspaceDraft.js: filtros, inputs do item,
cancelamento, frete, remanejo, comentarios e alvo de modal. Assinatura de
pedido/item/frete impede salvar input antigo sobre registro alterado.
Remanejo tambem compara o saldo/resposta dos destinos; mudanca bloqueia
confirmacao ate descarte explicito. Frete tem aviso dentro do modal e mutex
no cancelamento. PedidoEntrega conserva selecao, quantidade, datas e motivo
com versao atual; chave de tentativa idempotente sobrevive sem repetir envio.
GestaoCategorias, GestaoUnidades e GestaoFornecedores usam projecao de inputs,
ID e revisao fresca; filtros/tabela, importacao textual dos catalogos, GET
negado/removido e duplo salvar/excluir/desativar testados. Nenhuma ACL nova.
GestaoInsumos validado neste lote: formulario com projecao estrita,
filtros, texto e IDs da importacao; releitura de catalogos, conflito e
mutex antes de salvar/excluir/importar. Importacao parcial retira apenas
as linhas de sucesso confirmadas pelo contrato do endpoint existente.
Selecao de fornecedor/parceiro na cotacao testada em desktop/mobile: releitura
direta por ID fora do filtro, contato/nome atual, itens selecionados preservados,
item removido descartado e fornecedor inativo/GET negado retirado. Sem enviar
cotacao, gerar link ou recuperar DTO na negativa.

Financeiro:
FinanceiroFilaPagamentos.jsx + filaWorkspaceDraft.js: selecao e campos de
trabalho por linha, juros/multa/cheque, conflito de saldo/status, mutex de
operacao, limpeza apenas dos drafts afetados apos sucesso.
O draft por linha agora guarda somente o patch digitado (e valor derivado
quando o usuario altera juros/multa), nao os defaults do DTO. Importacao de
comprovantes conserva Files/IDs manuais em memoria, nao a previa; exige
releitura explicita atual para confirmar, remove lotes ja concluidos em falha
parcial e protege leitura/vinculo contra duplo clique. Submodal de cheque
proprio conserva campos incompletos por linha, bloqueia revisao alterada e
nao aparece para linha que virou somente consulta.
FinanceiroTitulos.jsx + titulosWorkspaceRevision.js: filtros digitados e
aplicados, ordenacao/paginacao/selecao, baixa em massa com input e assinatura
separados; bloqueio por saldo/status alterado, sem replay.
FinanceiroTituloNovo.jsx: inputs e preparo Pix; limpar apenas apos sucesso.
Trocar tipo preserva os demais parametros de origem e usa replace na URL;
correcao encontrada na regressao ampla, evitando mudar o slot do formulario.
FinanceiroTituloEditar.jsx: somente campos alterados sobre GET atual,
assinatura estavel inclusive para rateios/impostos sem ID; sucesso limpa
workspace. FinanceiroAutorizacoesPagamento.jsx: motivo/selecao por lote,
itens pendentes filtrados pelos dados atuais, desafio/passkey fora da memoria;
falha de leitura esvazia lista autorizada.
FinanceiroTituloDetalhe: inputs de baixa/cobranca e ID da correcao; GET atual,
revisao de saldo/movimentos, mutex antes de confirmar, nenhuma repeticao de
estorno ou baixa no retorno, solicitacao vinculada abre independente.
FinanceiroFaturasCartao e FinanceiroFaturaCartaoDetalhe: filtros e tabela,
abertura independente, inputs de conta/data/observacoes sobre GET novo,
conflito de saldo/status, negativa e modo leitura; baixa explicita unica.
TituloNegociacaoModal: inputs de motivo/parcelas/data/encargos e parcelas
editadas projetados, titulos por IDs relidos e conflito por revisao. Previa,
hash, aceite e chave de confirmacao nao sao restaurados. BaixaCompostaModal:
inputs, fontes/alocacoes por ID, conta/empresa/valor de cheque derivados de
catalogos atuais. Previa e confirmacao fora do workspace; mutex/retry conservam
a chave e o payload da tentativa enquanto montada. Nenhum POST ao restaurar.
NovaProvisaoFinanceira: sete campos e Files apenas em memoria; contexto,
obra e permissao atuais antes de criar. Mutex contra duplo submit; sucesso
limpa inputs/Files mesmo se upload falhar, sem repetir criacao ao retornar.
ProvisionamentosFinanceiros: filtros, ordem e pagina, detalhe independente,
GET novo e descarte de resposta tardia. Remontar o indicador da ordenacao
nao reinicia a pagina: apenas uma mudanca de ordem faz isso.
ProvisionamentoFinanceiroDetalhe: seis inputs alterados e comentario proprio,
GET/contexto atuais, revisao de campos/status/obra, conflito e mutex unico
para editar/comentar/anexar. Comentario/upload nao apagam edicao pendente.
Status fechado/consulta sem editar oculta inputs; GET negado oculta o detalhe.
Preview/anexos/URL assinada nao entram no draft; abrir arquivo continua usando
o mesmo endpoint autorizado. Backend/servicos/guards nao editados.

Colaboradores:
RhDpPessoal.jsx: filtros, IDs de selecao, pedido/admissao e alvo de pagamento.
Retorno ao pagamento usa ID criado, nao outro POST de criacao.
RhDpPagamentoModal.jsx + rhPagamentoWorkspaceDraft.js: projecao estrita de
inputs, inclusive conta/reembolso; salario/status/revisao continuam atuais;
editor Pix incompleto preservado, conflito bloqueia salvar/enviar.
RhDpColaboradores.jsx: filtros, campos alterados e modal sobre cadastro relido;
conflito e negativa de acesso. RhDpPessoalSolicitacoes.jsx: filtros e comentario
separado por solicitacao (sem DTO historico/restauracao de decisoes).
Eventos recorrentes: projecao estrita de campos/parcelas, estado/aplicacao
atual, conflito e mutex salvar/cancelar. Transferencias: filtros, inputs,
ID do detalhe e comentario proprio com permissoes atuais; consultas/timer
original desmontados, sem repetir decisao. Documentos: filtros/tabela com
lista nova, upload explicito/mutex, sem URL em memoria. Relatorio operacional:
filtros digitados separados dos aplicados e relatorio relido. Importacoes:
inputs e ID do preview, GET atual de lote; troca de ID remonta a tabela,
nenhum upload/confirmacao automatico. Jornada/apuracao/ticket nao concluidos.

Base: WorkspaceView.jsx habilita adapters somente nas rotas revisadas;
workspaceModel.js normaliza apenas `tipo` em titulo novo, mantendo origens de
frete distintas; useWorkspaceRecordDraft.js compartilha hidratacao/diff de
input, descarte e ocultacao sem apagar draft na negativa.

## Validacoes

Transporte dos testes totalmente isolado; nenhum acesso ao banco/rede de
negocio. Homologacao em DEV/aparelhos e teste de latencia real sao separados.

- validarWorkspacePiloto.mjs: cenarios novos de pedido, fila, titulo novo,
  autorizacoes, titulo/lista/baixa em massa. Desktop 1366 e mobile 390.
  Rerodar integralmente antes de publicar; consultar resultado terminal
  mais recente, nao assumir que um cenario ainda em ajuste passou.
- validarRhPagamentoSolicitacaoUI.mjs: suite anterior passou apos alteracoes;
  modo --workspace-only passou desktop/mobile (ID existente, sem POST/PUT
  no retorno, ultima edicao/editor, salario atual, revisao e GET negado).
- validarTituloJurosMultaUI.mjs passou: hidratacao real, retorno sem salvar,
  conflito de saldo, descarte, payload juros/multa, acesso negado e baixado.
  Chrome local usado via PLAYWRIGHT_EXECUTABLE_PATH porque o headless shell
  bundled nao esta instalado.
- validarRhColaboradorContatos.mjs: regressao anterior passou; cenarios novos
  de workspace cadastro/admissao passaram, incluindo obra de ID 7.
- validarRhPessoalPorLocal.mjs passou: seis abas, Obra/DP, locais/global,
  centros de custo, escopos negativos e mobile (fluxos legados).
- npm run build passou antes da adesao de insumos: 579 modulos; entry gzip
  150,45 kB (base 150,14 kB). Repetir apos as alteracoes do lote atual.
  Avisos existentes de Browserslist/chunk grande; sem novo erro de build.
- Ensaio ABBA isolado anterior neste lote: P95 31,40 ms legado / 31,45 ms
  novo, crescimento de heap ~319 kB apos ciclos, abaixo do gate 8 MiB.
  Nao e medicao de producao nem certificacao de desempenho de todos modulos.
- validarPedidoEntregaUI.mjs passou: regressao de entrega/idempotencia e
  workspace em 1366/390, ultima tecla, revisao, readonly e chave de retry.
- validarComprasCadastrosWorkspace.mjs passou: categorias/unidades/fornecedores
  e insumos (sessao 12101)
  em 1366/390, inputs/edicao/filtros, conflito, 403, removido e mutex; formulario
  do fornecedor desaparece em modo leitura. Sem banco/rede externa.
- validarTituloDetalheWorkspace.mjs passou em 1366/390: baixa/cobranca,
  correcao sem repetir estorno, conflito, permissao atual e negativa.
- validarRhWorkspaceSecundario.mjs passou em 1366/390: eventos, transferencias,
  documentos, relatorio e importacoes reais com APIs isoladas.
- validarFilaComprovantesWorkspace.mjs passou em 1366/390: Files/IDs, leitura
  explicita, negativa, desaparecimento de titulo elegivel, falha parcial,
  duplo clique e editor de cheque com conflito/readonly; repeticao apos os
  ajustes de campos da fila passou (sessao 13806).
- validarFaturasWorkspace.mjs passou em 1366/390: lista/filtros/nova aba,
  conta/observacoes, saldo atual e conflito, descarte, baixa unica, negativa e
  perfil somente leitura. Nenhuma escrita real ou repeticao no retorno.
- validarFilaInstrumentosUI.mjs passou integralmente: cartao/cheque/Pix,
  pendente de PDF, encargos, massa, dados, preview, colunas/foco/rolagem. A
  fixture deixa titulo PENDENTE apos baixa simulada; nova tentativa configura
  forma/conta novamente. Assercoes agora exigem bloquear saldo alterado, nao
  sobregravar o valor digitado, descartar/revalidar e entao baixar uma vez.
- validarWorkspacePiloto.mjs integral passou apos o patch de campos da fila
  e faturas (sessao 80152): P95 isolado 32,35 ms base / 32,55 ms novo;
  crescimento de heap ~356 kB novo, abaixo do gate 8 MiB. O ensaio agora
  aguarda o commit de navegacao antes de ler/fechar a aba no ciclo de limpeza.
  Repetir se houver novos edits de runtime; nao certifica toda a expansao.
- test:navegacao passou: 220 declaracoes App, 217 destinos, aliases intactos.
  test:docs passou: 490 Markdown/19 canonicos. diff --check sem erros.
- validarLayout continua REPROVADO por 87 ocorrencias legadas. Comparacao
  estruturada atual vs HEAD confirmou 87/87 e nenhuma ocorrencia nova (26
  fontes antigas lidas por overlay somente leitura). Nao declarar gate verde.
- validarTituloNegociacaoModal.mjs e validarBaixaCompostaWorkspace.mjs passaram
  em 1366/390: campos, titulos/catalogos atuais, conflito, negativa/readonly,
  mutex e retry de payload/chave sem baixa/negociacao real. Suite integrada
  --financeiro-only passou (sessao 11114); modo integral tambem (44061).
- validarWorkspacePiloto.mjs --cotacao-only passou (6237): selecao/releitura
  de fornecedor/parceiro fora do filtro e casos negativos descritos acima.
  Integral 44061 passou antes da adesao de Provisoes: P95 isolado 32,25 ms
  base / 32,30 ms novo, crescimento de heap ~356 kB. Nao e medicao real DEV.
- validarProvisaoNovaWorkspace.mjs passou (78657) em 1366/390: campos/Files,
  contexto/obra atuais, negativa, modo leitura, mutex e sucesso/upload falho
  sem repetir criacao. Integracao Layout --provisao-only passou (69402)
  antes de incluir lista/detalhe: P95 32,40 ms base / 32,25 ms novo.
- validarProvisoesWorkspace.mjs passou (59594) em 1366/390: filtros/ordem/
  pagina, detalhe independente, dados relidos, negativa e resposta tardia.
- validarProvisaoDetalheWorkspace.mjs passou (71365) em 1366/390: campos,
  comentario/upload sem perder edicao, conflito, mutex, sucesso sem replay,
  registro fechado, modo leitura e GET negado. Sem rede de negocio/banco.
- Build 79849 passou apos Nova Provisao, antes de lista/detalhe: 579 modulos,
  entry gzip 150,44 kB. Resultados mais recentes consolidados abaixo.

### Retomada: lote Provisoes em 12/10/2026

- Integracao --provisao-only passou (77102) com Layout/Router/abas reais em
  1366/390: nova/lista/detalhe, filtros/pagina, nome por codigo, edicao e
  comentario, contexto atual, negativa, mutex e bloqueio de aba ocupada.
  Corrigido o seletor de formulario da fixture, sem afrouxar assercoes.
- Suite integral passou (75907), incluindo todos os cenarios anteriores e
  nova/lista/detalhe de Provisoes: P95 ABBA 32,05 ms base / 32,55 ms novo;
  heap novo ~356 kB apos ciclos, dentro do gate 8 MiB. Transporte isolado,
  nao certifica todos os modulos nem desempenho da EC2/latencia real.
- Build 85866 passou: 579 modulos, entry gzip 150,45 kB (base 150,14 kB).
  Apenas os avisos existentes de Browserslist/chunk >500 kB.
- test:navegacao passou: 220 declaracoes App/217 destinos e aliases intactos.
  test:docs passou: 490 Markdown/19 canonicos. diff --check passou.
- Layout diferencial (23349): base 87/atual 87, 32 fontes de HEAD lidas em
  overlay somente leitura; nenhuma nova ocorrencia. Gate global continua
  reprovado pelo passivo legado, nao declarar verde.
- Backend/src, servicos, guards, migrations e dependencias sem diff neste
  lote. Nenhuma baixa, upload, comentario ou edicao real; nenhum deploy.
- Apos a suite integral, detalhe passou a publicar titulo neutro "Provisao"
  quando nao possui DTO autorizado. Repeticao --provisao-only passou (52341),
  incluindo assercao do titulo neutro apos 403, em 1366/390; P95 31,80 ms
  base / 32,20 ms novo, heap novo ~355-356 kB. Build final 43851 passou
  (579 modulos, entry gzip 150,46 kB). Nenhuma ampliacao de ACL.
- Limites: inputs de data foram testados completos. Texto parcial interno
  do DateInputBR e caso transversal ainda pendente de adapter/teste; nao
  certificar todos os preenchimentos parciais apenas pelo opt-in da rota.

## Pendencias obrigatorias: nao declarar os itens 2/3/4 completos

### Continuacao autorizada: categorias, dashboard, relatorio e datas parciais

Lote implementado localmente em Provisoes. Sem backend/API/ACL/migration,
dependencias novas, escrita de negocio ou publicacao. O visual operacional
existente foi preservado; validacao/foco/loading orientaram a skill frontend.

| Fluxo | Estado preservado em memoria | Leitura/acao e protecao |
| --- | --- | --- |
| Categorias macro | Inputs de criacao, ID e diferencas de edicao, tabela | GET incluindo inativas, alvo atual, revisao/conflito, mutex POST/PUT/PATCH; sucesso/cancelar limpam o draft sem gerar outro vazio |
| Dashboard | Cinco filtros, texto das datas, tabela | Contexto e GET atuais; aplicacao automatica original, sem consulta por tecla parcial que nao altera ISO; detalhes em aba independente |
| Relatorio operacional | Seis filtros digitados separados dos aplicados, texto das datas, tabelas | Duas consultas somente pelo recorte aplicado; limite 200/pagina 1/ordem intactos; duplo Atualizar protegido e detalhe em nova aba |
| DateInputBR | Texto, ISO correspondente e revisao de descarte, por pagina/campo | Opt-in explicito; sem onChange/submit no retorno, parcial/invalida bloqueiam submit, min/max preservados, reset limpa mesmo ISO ja vazio |

- Datas aderidas neste lote: Nova Provisao, detalhe/edit, lista, dashboard e
  relatorio. BarraFiltros apenas repassa o opt-in declarado pelo chamador.
  Demais chamadores mantem comportamento legado; nao certificar todas as
  datas do sistema nem ativar um adapter universal sem teste por fluxo.
- Categorias conserva canManageProvisionamentoCategorias; rotas do App e
  allowProvisoesCategorias/Module intactos. Dashboard/relatorio conservam
  guardas de dashboard e contexto atual. Backend usa getScopedObraIds,
  listScopedObras e assertObraScopeAccess, inclusive no dashboard. Nenhum
  destes helpers/endpoints foi alterado nem houve consulta real ao banco.
- Respostas de outra consulta/montagem sao ignoradas; negativas limpam os
  DTOs locais, nao restauram graficos, valores, alvos ou permissao da memoria.
- Datas parciais marcam trabalho pendente mesmo quando ISO permanece vazio.
  Descarte/sucesso removem a edicao; valor externo novo invalida texto antigo.
- Testes locais 1366/390 passaram: validarDataWorkspace (reset vazio,
  calendario/min/max, isolamento, legado, sem storage/submit),
  validarProvisaoCategoriasWorkspace (novo/edit, conflito, negado/removido,
  perfil leitura, mutex e sucesso sem draft artificial),
  validarProvisaoConsultasWorkspace (aplicacao automatica vs explicita,
  quantidade de consultas, detalhes, parcial/limpar, negado/contexto/escopo,
  resposta 200 tardia nao vence negativa).
- Regressao Nova/Detalhe/Lista passou com cenarios novos de data parcial e
  bloqueio de envio, sem criar/editar no retorno. Suite --provisao-only
  passou (38725), incluindo Layout/Router/abas reais para os seis fluxos,
  filtros pesados nao aplicados no retorno, nomes por codigo e negativas.
  P95 ABBA 32,45 ms base / 32,30 ms novo; heap novo ~356 kB (<8 MiB).
  Ensaio local isolado, nao certifica latencia ou desempenho da EC2.
- Apos a ultima correcao do descarte de categoria, teste de categorias
  repetido passou (83450). Suite integral passou (23186), incluindo todos
  os cenarios anteriores e categorias/dashboard/relatorio com Layout real.
  P95 ABBA 31,70 ms base / 31,65 ms novo; heap novo ~356 kB apos 30 ciclos.
- Build final passou (90557): 579 modulos, entry gzip 150,49 kB; avisos
  existentes de Browserslist/chunk >500 kB. test:navegacao passou: 220
  declaracoes/217 destinos. test:docs passou: 491 Markdown/19 canonicos.
- Layout diferencial passou (73045): 87 base/87 atual, 37 fontes antigas
  em overlay somente leitura, nenhuma ocorrencia nova. Gate global segue
  reprovado pelo passivo legado. diff --check sem erros. Backend/src,
  App/guardas, servicos, acessoProduto, package/lock sem diff deste lote.
- Categorias repetidas (48568) com formulario preenchido e largura global
  medida em 1366/390: sem overflow horizontal, demais assercoes mantidas.
  Sem novos edits de runtime apos a suite integral/build final.

E3: reaproveitamento e demais modais ainda nao testados. Selecao/rehidratacao
de fornecedor na cotacao e insumos/catalogos deste lote ja validados.
Cadastros categorias/unidades/fornecedores, fretes/remanejo e entregas deste
lote possuem testes, mas nao equivalem a cobertura de todo Compras.
ModalPedidoFinal existente
esta sem chamador (componente legado); nao habilitar capacidade ao navegar.
E4: outras importacoes financeiras,
conciliacao, bancos/cartoes/caixas,
relatorios e demais formularios. Links para titulo/solicitacao devem ser
revisados para abertura independente onde previsto.
Faturas de cartao/lista/baixa deste lote ja validadas; cadastro de cartoes
e outros fluxos ainda nao equivalem a cobertura integral do modulo.
E5: jornada/apuracao/fechamentos, outros relatorios e ticket;
conferencia documental/upload pendente nos pedidos. Transferencias/eventos/
documentos/importacoes/relatorio operacional deste lote ja validados.
E6/E7: Custos/Obras/Contratos, Comercial/CRM, Fiscal/SST, cadastros/
configuracoes, comunicacao/biblioteca/treinamento, governanca/suporte,
aliases e rotas publicas. O inventario AST nao equivale a teste de fluxo.

## Proximo passo exato

1. Avancar nos demais fluxos E4/E5 ainda pendentes, mantendo a adesao
   explicita por rota/perfil. Provisoes deste lote nao equivalem a todo E4.
2. Reutilizar o opt-in de DateInputBR nas proximas telas mapeadas, com teste
   de parcial/min/max/descarte e sem memoria indiscriminada. Homologacao real
   DEV continua separada. Nenhum comando/rede real foi executado na EC2.
3. Expandir E3/E4/E5 por fluxo com IDs e inputs projetados, GET atual,
   guardas, busy/idempotencia e testes, antes de habilitar a rota no opt-in.
4. Executar E6/E7 e matriz por rota/perfil, sem adapter universal de DTO.
5. Atualizar este handoff e a cobertura ao concluir cada lote. Publicacao e
   homologacao DEV dependem de pedido separado; nao publicar pacote parcial
   como se o plano inteiro estivesse finalizado.

## Publicacao autorizada - 12/10/2026

Usuario autorizou commit/push das alteracoes pendentes desta etapa na
refactor/frontend e solicitou comandos de atualizacao da EC2 DEV. Nao
autorizou promover a main nem executar deploy/banco na EC2 nesta sessao.
Pacote limitado ao frontend, testes proprios e este handoff. Auditoria
financeira, pre-importacao de colaboradores, outputs e documentos
compartilhados com alteracoes alheias ficam fora do commit.

Este lote nao altera backend, servicos, guards, dependencias ou migrations.
EC2 DEV precisa atualizar o checkout; se estiver na base 9565eb34, nao
necessita instalar dependencias, executar migrations ou reiniciar PM2.
Frontend depende do deploy Vercel correspondente a refactor/frontend;
push nao confirma deploy concluido. Homologacao operacional e restante
do plano continuam pendentes; nao declarar producao homologada.

Revalidacao antes do commit: suite integrada completa passou (25613),
desktop 1366/mobile 390, cenarios anteriores e novos de Provisoes; P95
31,75 ms base / 31,70 ms atual e heap ~356 kB apos ciclos. Build e
test:navegacao passaram (3992); test:docs passou (491 Markdown/19 canonicos).
Layout permanece com 87 ocorrencias; gate global nao esta verde.
diff --check passou; backend/API/ACL/dependencias sem alteracao neste pacote.
