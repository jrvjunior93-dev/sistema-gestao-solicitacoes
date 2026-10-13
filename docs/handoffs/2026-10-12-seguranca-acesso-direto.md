# Handoff - seguranca de acesso direto - 12/10/2026

## Estado

Usuario autorizou corrigir acesso a solicitacao excluida e revisar seguranca
por etapas. Implementacao local na refactor/frontend, base 3a75c3f0.
Usuario autorizou depois commit/push somente deste pacote na refactor/frontend.
Sem main, banco, execucao na EC2, migrations ou deploy. Auditoria financeira
alheia, outputs e docs/workspace preexistentes preservados. Sem delegacao.

## Arquivos proprios

- backend/src/middlewares/solicitacaoDisponivel.js (novo)
- backend/src/services/solicitacaoDisponibilidade.js (novo)
- backend/src/routes.js (somente montagem de guarda operacional)
- backend/src/controllers/SolicitacaoController.js e AnexoController.js
- backend/src/services/solicitacaoRetornoService.js e fileAccessService.js
- backend/scripts/validarSegurancaAcessoDireto.js e mapearRotasSeguranca.js (novos)
- backend/scripts/validarDevolucaoRetornoSolicitacao.js e validarSecurityHardening.js
- frontend/scripts/validarWorkspacePiloto.mjs (teste 404, nenhum runtime FE)
- docs/auditorias/SEGURANCA_ACESSO_DIRETO_20261012.md, este handoff e apenas
  a secao propria do OWNERSHIP_ATIVO.md (arquivo com alteracoes alheias).

## Validacoes

Nova suite: 2.304 paridades de ACL ativa, 47 rotas HTTP reais de guarda sob
/api, DELETE real -> GET/comentario 404, repeticao/auditoria unica e titulos
preservados; services por ID/objeto parcial, anexos/financeiro, auth JWT real,
usuarios e 66 casos de recurso/obra. Nenhum banco ou transporte externo.
Regressoes: superadmin/exclusao, retorno/devolucao, bloqueio retorno, remocao
e leitura de anexos, hardening, pedidos/acesso, permissoes Financeiro (73) e
Contratos, RH/DP/locais, dev switch, fila/solicitacao, compra direta GEO,
acompanhamento GEO, adiantamentos, interacoes e medicao/recarga aprovadas.
Suite UI completa aprovada novamente com negativas 403 E 404, preservacao de
rascunhos/filtros, isolamento de identidade e limpeza de dados/modais negados.
Benchmark local interceptado: p95 base 32,70 ms / piloto 32,45 ms; nao mede
MySQL/EC2. IDs numericos malformados testados com 400 antes de coercao SQL.
Revalidacao final: nova suite de seguranca, remocao/leitura de anexos e ciclo
de retorno aprovados; sintaxe dos 12 JS/MJS alterados, diff --check e
documentacao (488 Markdown / 19 canonicos) aprovados.

Inventario AST local: 1.126 declaracoes / 516 parametrizadas / 52 mounts em
10 arquivos. Nao e auditoria aprovada de 1.126 endpoints. Script de mapa
depende do parser de QA do frontend e nao deve ser usado como gate EC2.

## Riscos/proximo passo

Disponibilidade nao altera ACL de ativos, status CANCELADA ou arquivamento.
Consulta financeira existente preservada; nenhuma nova rota de leitura de
excluidas nem exclusao de titulos/objetos. Sem cache de estado no middleware.
Guarda acrescenta uma leitura PK; medir custo real em DEV. Revalidacoes sob
lock de retorno preservadas; corrida entre DELETE e cada outro handler deve
ser auditada na etapa financeira/concorrencia, nao foi certificada aqui.

Codigo local: /uploads legado monta arquivos ativos sem JWT fora do router.
Usuario informou que o caminho JA FOI CORRIGIDO na EC2; nao afirmar exposicao
atual do ambiente. Solicitado identificar Nginx/backend para reconciliar a
protecao com codigo/deploy. Existencia/referencias em EC2 nao verificadas;
nenhuma alteracao cega na entrega de fornecedor/preview/boletos. Plano de
etapas, evidencias e criterios em SEGURANCA_ACESSO_DIRETO_20261012.md.

Proximo passo exato: entregar etapas 1/2 locais e etapa 3 iniciada, com QA
final registrado. Publicacao deste pacote autorizada; homologar DEV com
registro ficticio. Em continuidade, conferir a protecao de /uploads que o
usuario informou ja existir na EC2 e inventariar referencias somente leitura;
completar handlers/filhos de Compras e Financeiro seguindo o plano. Nao
certificar ambiente produtivo nem mudar regras de visibilidade existentes.

Usuario nao lembra se a correcao foi no Nginx/backend e vai consultar a EC2.
Fornecer consulta somente leitura de regra /uploads e codigo efetivo dos
processos, sem dump de env/credenciais, restart ou alteracao no ambiente.

## Evidencia posterior enviada pelo usuario e publicacao

Consulta nginx -T filtrada por /uploads nao retornou linhas. App.js efetivo
de backend-dev e backend-solicitacoes tem a mesma montagem express.static,
apenas bloquearAnexoLocalRemovido e headers. Esses trechos nao demonstram
autenticacao de arquivo ativo. Nao comprova que existam arquivos expostos nem
exclui protecao generica anterior; conferir inventario e acesso efetivo em
etapa separada. Nenhum app.js/Nginx e alterado neste pacote.

EC2 dev confirmado: /home/ubuntu/sistema-gestao-solicitacoes-dev/backend/server.js.
Atualizacao exclusiva: checkout limpo e branch refactor/frontend, pull ff-only,
dependencias backend pelo lockfile, suite isolada validarSegurancaAcessoDireto
e validarDevolucaoRetornoSolicitacao, restart somente backend-dev --update-env.
Nenhuma migration nova neste pacote, nao executar migrate para esta correcao.
Nao reiniciar backend-solicitacoes. UI runtime sem alteracao; somente teste FE.

Revalidacao de publicacao aprovada: seguranca de acesso direto, devolucao,
superadmin/exclusao, hardening, anexos, docs, sintaxe e diff --check. Tambem
executados os dois testes indicados para EC2 a partir de backend/, sem banco.
Stage restrito aos 14 arquivos proprios e secao propria de ownership, sem
auditoria financeira/docs alheias/outputs. Suite UI 403/404 aprovada na etapa
de implementacao; nenhuma alteracao de runtime frontend neste commit.
