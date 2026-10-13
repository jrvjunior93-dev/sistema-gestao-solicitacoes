# Handoff: base e piloto de navegacao em Solicitacoes

## Estado

Implementacao local na refactor/frontend em C:/Fluxy-refactor-frontend;
base ade1d5acf4eb9cfe47a5e625d13bac2d3ca7fbbc. Iniciada 11/10, validada
12/10/2026. Publicacao por commit/push na refactor/frontend autorizada em
12/10/2026; sem main, EC2, restart, banco ou migration real.
Auditoria financeira de outra conversa preservada e fora da entrega.

Contrato, evidencias e limites:
[piloto de navegacao](../arquitetura/2026-10-11-piloto-navegacao-solicitacoes.md).

## Arquivos proprios

- frontend/src/navigation: novo workspaceModel, WorkspaceContext,
  WorkspaceView e useWorkspaceController; useWorkspaceTabs conserva
  implementacao legada para rollback por VITE_WORKSPACE_PILOT=off.
- Layout.jsx, utils/navigation.js: fachada, historico/origem, guardas,
  memoria por usuario/escopo, fechamento e Voltar com modal superior.
- ModalPortal, OverlayModal, useFecharAoSair: portals/listeners inativos
  suspensos na unica pagina nova retida; sem alterar fluxos de anexos.
- ListaAvancada e BlocoConteudo: adapters opt-in para consulta/scroll/blocos,
  sem alterar preferencias existentes de outros modulos.
- NovaSolicitacao: formulario unico retido, guardas e limpeza no sucesso.
- Solicitacoes/index e novo consultarJanela: snapshots leves, detalhe em
  nova aba e reconstituicao correta de janela usando GET autorizado atual.
- SolicitacaoDetalhe/index, Conversa, Timeline, CompraEtapas: contexto mobile,
  comentarios/mencoes/arquivos e respostas tardias; nenhuma permissao nova.
- ModalEditarDadosSolicitacao: draft/revisao minima, DTO atual e conflito.
- frontend/scripts/validarWorkspacePiloto.mjs: QA isolada e medicao ABBA;
  diagnosticarAbasEstado.mjs usa o hook legado para conservar o baseline.
- backend/scripts/validarEdicaoDadosSolicitacao.js: mock da dependencia
  de adiantamentos ja existente. Nenhum arquivo backend/src foi modificado.
- Contrato/handoff atuais e acrescimos proprios nos quatro paineis workspace.
  Mapa/plano/scripts da etapa diagnostica anterior tambem continuam locais.

## Verificacoes

QA real desktop/mobile com transporte localhost interceptado, ultimo
caractere, origem/POP/Forward/replace, limites, scroll/busca/pagina/selecao,
comentario/File, isolamento, permissao alterada, 403/carga lenta/conflito,
quota indisponivel e limpeza ao sucesso. 403 na lista ativa limpa alvos e
um 200 tardio da consulta anterior nao os reapresenta. Sem novas escritas de negocio.
Backend: ACL GEO/Compras, edicao, fila/anexos, interacoes, dev-user e
adiantamentos; somente testes isolados/mocks, sem alterar dados reais.

Validadores existentes de navegacao, abas, edicao, interacoes, Nova e
visualizadores; build e documentacao/diff. QA comparativa 31,75/31,95 ms p95;
heap delta ~0,34 MiB apos ciclos e GC. Inicial gzip ~150 kB versus 143,50 kB
no HEAD exportado, dentro do gate +10%. Relatorio gerado em
outputs/workspace-piloto-20261011/resultado.json. Outputs sao evidencias
locais, nao dados para versionar indiscriminadamente; baseline tem junction
de node_modules, nao remover recursivamente sem validar esse alvo.

Pendencias globais anteriores: validarLayout 86; check antigo do botao em
validarSecurityHardening. Evidencias e fronteiras detalhadas no contrato;
nao declarar a suite global toda verde nem alterar ACL para satisfazer check.

## Proximo passo exato

Publicar somente o diff proprio na refactor/frontend e homologar em dev.
Comandos EC2 devem conferir o range de backend antes do fast-forward:
este pacote nao requer restart/migration, mas pendencias anteriores podem
requerer um roteiro diferente. Frontend e publicado pela Vercel.
Testar GEO/Obra, 1/6/12 abas, anexos,
PDFs, rede lenta e Android/iPhone; validar o ciclo salvar/erro/duplo clique
das operacoes reais antes de expandir para modais criticos e demais modulos.
Rascunhos nao sobrevivem F5/logout; mudanca de escopo limpa memoria.
Rollback por build com VITE_WORKSPACE_PILOT=off, sem banco/migration.
Nenhuma autorizacao de main ou de incluir DP deve ser inferida desta tarefa.
Ownership da implementacao liberado apos verificacoes locais.

## Revalidacao para publicacao - 2026-10-12

QA isolada repetida integralmente: desktop/mobile, negativas 403, resposta
tardia, troca de usuario/escopo, comentarios, navegacao e operacoes protegidas.
Ensaio ABBA p95: baseline 31,40 ms e piloto 31,75 ms; heap delta piloto
~0,34 MiB. Build de producao aprovado (569 modulos; inicial gzip 149,64 kB).
Runtime backend, migrations, App.jsx e transporte API continuam sem diff.
Auditoria financeira e outputs permanecem fora do commit do piloto.

## Homologacao DEV: nomes, Delegacao e login - 2026-10-12

Relato do usuario apos publicar 0fb4822d: aba conserva nome/identidade
anterior, Abrir na Delegacao substitui origem e Voltar chega ao login.
Mapeados: useWorkspaceController/WorkspaceView, Abrir/GET/delegar em
ComprasDelegacao e Login/PrivateRoute/AuthProvider. Nenhum endpoint/ACL novo.

Correcao local: estado de transicao isolado e refs confirmadas no commit,
PUSH ao abrir/ativar aba, Delegacao com snapshots apenas de filtro/entrada,
GET autorizado ao retornar e limpeza no 403; login com replace e guarda
de sessao ativa/restauracao/MFA. Backend, AuthProvider, PrivateRoute,
App.jsx e transporte API inalterados. Sem commit/push/deploy nesta etapa.

Testes ampliados para flags reais do BrowserRouter, rota lazy/Suspense,
nomes/aba ativa, Delegacao principal/fallback/limite/filtro/edicao, 403,
login antigo/sessao ativa/logout/restauracao/anonimo/MFA e POST simulado
de login em localhost. Baseline opcional --baseline-controller carrega
somente o controlador de 0fb4822d via git show (sem alterar arquivos):
reprovado na sincronizacao da aba da consulta lazy, como esperado.
Revalidacao ampliada aprovada em 1366/390 px, incluindo botao +/busca
reais, reutilizacao de detalhe ja aberto e campos da Delegacao preservados.
P95 baseline 31,75 ms / piloto 31,50 ms; heap delta ~0,34 MiB. Build
aprovado (569 modulos, inicial gzip 149,82 kB, contra 149,64 kB no piloto
publicado). Navegacao/abas/tela inicial, ACL GEO/Compras, troca DEV,
acesso a anexos, documentacao e diff aprovados. Nenhum dado real acessado.
Pendencias anteriores de validarLayout/SecurityHardening seguem documentadas;
nao declarar toda a suite global verde. Ownership desta correcao liberado.
Publicacao desta correcao autorizada pelo usuario na refactor/frontend em
2026-10-12. Revalidar e publicar somente o pacote proprio, preservando a
auditoria financeira alheia. Proximo gate: homologacao DEV apos o deploy
frontend da Vercel; sem main, migrations ou restart de backend neste pacote.

Revalidacao para esta publicacao: QA ampliada integral aprovada em 1366/390
px; p95 baseline 32,10 ms / piloto 32,05 ms; heap delta ~0,34 MiB.
Build, tela inicial, navegacao, abas, documentacao e testes isolados de
ACL GEO/Compras, troca DEV e acesso a anexos aprovados. Runtime backend,
migrations, AuthProvider, PrivateRoute, App.jsx e API continuam sem diff.
Reserva documental encerrada. Arquivos da auditoria financeira nao fazem
parte deste pacote. Push deve ser confirmado no remoto antes da entrega.

## E3a listas de Compras e fornecedor rapido - 12/10/2026

Usuario confirmou 0658c9e8 funcionando em DEV e autorizou a proxima etapa,
sem alterar regras de visibilidade. Pedido adicional: no card de cotacoes
do detalhe, mostrar Nome fantasia e nao exibir/exigir representante legal.
Lote incremental autorizado: listas de Solicitacoes de Compra, Pedidos e
Cotacoes; nao considerar toda a E3 concluida. Sem commit/push/deploy/main.

Arquivos proprios: WorkspaceView.jsx, useWorkspaceController.js e
workspaceModel.js; hooks novos useQueryRevision.js e
useWorkspaceOpenRecord.js; TabelaPadrao.jsx; SolicitacoesCompra.jsx,
PedidosCompra.jsx, ListaCotacoes.jsx e GerenciarCotacaoSolicitacao.jsx;
validarWorkspacePiloto.mjs; plano/contrato/README Compras e este handoff.
OWNERSHIP_ATIVO.md possui reserva desta tarefa e alteracoes alheias: separar
o acrescimo proprio se houver pedido de publicacao. Auditoria financeira,
scripts, outros paineis e outputs preservados, fora do futuro pacote.

Contexto leve em memoria por usuario/aba: buscas, filtros e IDs de selecao,
janela/ordem/expansoes da tabela e rolagem. GETs/parametros existentes
reexecutados ao retornar; DTOs/catalogos nao sao restaurados. Guard de
revisao/lifecycle ignora respostas tardias; 401/403 limpa resultados e IDs
ausentes no GET autorizado saem da selecao. Detalhes abrem em outra aba e
reutilizam registro aberto; portais publicos permanecem target=_blank.
Confirmacao fixa alvo/revisao; mutex e busy evitam concorrencia/desmontagem
durante gravacao. Restaurar nao repete operacao. Tabela sem opt-in fica
legada. Shell nao grava o clamp de scrollY apos desmontar pagina longa;
mantem a ultima posicao registrada pelo listener, captura sincronamente
antes da navegacao interna (inclusive antes de scroll pendente) e restaura
apos carga. Captura nao leva DTOs no evento nem altera regras de acesso.

Fornecedor rapido: fantasia visivel para CNPJ, enviada em cadastrar e
selecionar e no fornecedor novo junto com links. CPF dispensa fantasia;
representante ausente/nao enviado, ja opcional no servico central. Criacao
rapida tem mutex/busy e bloqueia gerar links enquanto cadastra. Cadastro
completo de Pessoas, servicos e backend inalterados.

QA de Compras aprovada em 1366/390 px: buscas/status/obra e mesmos recortes
no GET de retorno, selecao, nova aba/origem/reuso, troca de usuario,
403/resposta tardia nas tres listas; componente de tabela opt-in/legado,
120 linhas/janela/ordenacao/expansao/scroll horizontal e vertical com
consulta curta; selecao ausente no GET; operacao simulada cancelar/duplo
clique/busy/retorno sem replay; PJ/PF, card embedded/standalone e fornecedor
inline com item/fantasia, sem representante. Router/componentes/servicos
reais, transporte local interceptado; nenhuma consulta/escrita real.

Regressoes executadas: navegacao, abas, tela inicial, envio Compras,
titulo/necessidade/wizard normal e direto, cotacao responsiva, frontend e
backend fornecedor, envio cotacao, delegacao, ACL GEO/Compras, acesso a
anexos e troca DEV. Documentacao/diff aprovados. Build 571 modulos;
inicial gzip 149,92 kB versus 149,82 kB no HEAD (+0,07%). Runtime backend,
migrations, AuthProvider, PrivateRoute, App.jsx e transporte API sem diff.
Suite ampliada integral do piloto aprovada; ensaio local ABBA p95 baseline
31,80 ms / piloto 31,95 ms, heap delta ~0,33 MiB apos 30 ciclos e GC. Teste
adicional aprovado para scroll+navegacao no mesmo tick (650 e zero), sem
esperar evento assincrono; reteste de tabela opt-in/legada aprovado.
Gate local sem regressao detectada; nao equivale a benchmark de producao.
Pendencias globais anteriores de layout e check
obsoleto de SecurityHardening continuam fora do escopo; nao declarar toda
a suite global verde nem alterar ACL para satisfaze-las.

Proximo passo exato: publicar somente diff proprio na refactor/frontend
quando usuario solicitar; homologar filtros/selecao/scroll/nova aba e
cadastro rapido de PJ no card embutido em DEV. Nenhuma migration/restart
necessario neste pacote frontend isolado. Conferir pendencias anteriores
de backend antes de fornecer roteiro EC2. Apos aceite DEV, E3b mapear e
aderir criacao/revisao de compra normal/direta, editor de cotacao/pedido,
entregas/uploads/modais com rascunho/conflito/idempotencia proprios.
Nao prometer que esses editores ja preservam tudo, nem rascunhos apos
F5/logout. Ensaios locais nao garantem latencia/memoria em aparelhos reais.
Ownership deste lote liberado; mudancas continuam locais, nao commitadas.

Publicacao E3a autorizada pelo usuario na refactor/frontend em 12/10/2026.
Revalidar QA/build e preparar commit somente dos arquivos proprios acima,
incluindo apenas a secao E3a do ownership compartilhado. Confirmar push
no remoto antes da entrega. Sem main, EC2, banco, migrations ou restart;
homologacao operacional DEV continua como proximo gate.

Revalidacao para publicacao E3a aprovada: suite ampliada integral em
1366/390 px, regressoes de Compras/navegacao e negativas de ACL/anexos/
troca DEV, documentacao e build. P95 local baseline 31,65 ms / piloto
31,80 ms; heap delta ~0,32 MiB. Build inicial gzip 149,92 kB, 571 modulos.
Backend/migrations, AuthProvider, PrivateRoute, App e servicos sem diff.
Reserva documental E3a encerrada; pacote separado da auditoria alheia.
Confirmar SHA remoto apos push. Comandos DEV devem parar se houver
alteracoes de backend anteriores pendentes no checkout da EC2.
