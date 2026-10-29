# PROD - comprovantes compartilhados e filtros DP - 29/10/2026

Base main40e3239a. Funcional/testes/evidencia identicosDEV40ae697b homologado.
Seis runtimes backend:routes,historico/projecao/titulos e novos service/controller.
Frontend:comprovantes no card eposicionamento dosfiltros,sem demaisalteracoesDEV.

Guardas preservam HEAD/index semantico,PRODheap4096,DEV/Experience/Nodes/envs/
dumps/systemd,planos/historicoNSDOCS eflagsautomaticasOFF. Inventariofechado
comhashes/backupsprivados e modos preservados. So backend-solicitacoes reinicia,
umavez aposQA. Retomada reiniciando somenteobserva,semsegundo restart.
OverlayscompraTitulosAdicionais e filaoperacional so aceitos comhashigualBASE.
Sem SQL,migration,install,upload,baixa ou backfill peloaplicador.

Simulador/evidencia permanecem extrasoffline conferidos doGit,nao instalados
ouexecutados. Historicos antigos das SOL6453/6554 seguemsemregularizacao ate
etapa separada autorizada. GET do card le arquivoexistente sem criar registros.

Operador prepara/aplica/conferir no checkoutmain NodePROD24.22.1 porcomandos
pinados dochat;backup/timer/janela e CONFIRM_COMPROVANTES_COMPARTILHADOS_PROD=SIM.
Nao usar operadorDEV naPROD,nao apagar estados/locks,nem restartmanual.
FrontendVercelmain segue push;validar depois do backendPRONTO e CtrlF5.
Nao acessadaEC2/DB/S3 peloagente.
