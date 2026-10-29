# DEV - comprovantes compartilhados e filtros DP - 29/10/2026

Publicacao conjunta autorizada pelo usuario. Base refactor/frontend6aa7d0fa.
Seis runtimes backend: routes,servico dehistorico,projecao compartilhada,
servico titulo financeiro e novo servico/controller de leitura pororigem.
Frontend inclui card/cliente de comprovantes ecorrecao usePosicaoFlutuante.
Sem dependencias,SQL,migration,backfill,uploadS3oubaixa durante odeploy.
Simulacao das SOL6453/SOL6554 nao e executada pelo aplicador.

Guardas derivadas doDEVhomologado: NodeDEV24.22.1,porta8001,stagingconfigurado,
backuppelooperador,snapshotPM2/processos/envs/dumps/systemd ePRODheap4096,
flagsNSDOCSoff. Copia apenaslista fechada comhashes ebackups privados/modos.
Mantem HEAD/index,sem pull/checkout/reset. Testes isolados antes deumrestart
somente backend-dev. Fases prepared/files_ready/restarting/done; retomada de
restarting observa,naoreinicia novamente. Nao apagar locks/estado se bloquear.

CONFIRM_DEV_BACKUP=SIM e CONFIRM_COMPROVANTES_COMPARTILHADOS_DEV=SIM.
Operador via stdin --backend COMMIT; conferencia scriptinstalado --conferir.
Comandos pinados no chat. FrontendVercelDEV segue push; backendantes homologar.
Se frontend atualizar antes dobackend,pode faltar a rota nova ate concluir.

QA backend: comprovantesorigens/ACL/replay/rollback,filacomprovante,
tituloscompartilhados,baixacomposta eestorno. Geradores/documentos/casos reais
permanecem apenas evidenciados; nada financeiro real executado pelo agente.
QAfrontend: card/clienteHTTPreal eDP16combinacoes;camadas1920/1366/390,build.
Homologar leitura do12333.pdf no card e,em novo fluxo autorizado,futuro
historico pororigem. Aregularizacao antiga continua unaplicada.
