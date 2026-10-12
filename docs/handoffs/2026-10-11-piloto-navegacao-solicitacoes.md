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
