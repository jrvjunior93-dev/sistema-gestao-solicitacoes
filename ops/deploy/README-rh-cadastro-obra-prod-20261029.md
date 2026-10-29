# Cadastro limitado RH - promocao isolada PROD 29/10

Base main1f07f3b1; funcional identico ao DEV6aa7d0fa homologado pelo usuario.
Somente1runtime rhColaboradorObraService.js: alias tipoDocumento na consulta/DTO.
Frontend modal com erro/retry e testes promovidos sem demais alteracoesDEV.

Operador exige Ubuntu/uid1000/NodePROD24.22.1, checkoutmain,backup/timer/janela
confirmados,PM2processos/ambientes/heap4096 preservados. QA antes de reiniciar
somente backend-solicitacoes. Sem SQL/migration/install/integrações/S3/baixas.
Preserva HEAD/index e overlays antigos. Indice conferido por entradas stage
(caminho/modo/objeto) e nao hash bruto de metadados. Dois overlays anteriores
compraTitulosAdicionaisService e solicitacaoFilaOperacional somente aceitos se
conteudo exatamente igual aBASE,arquivo regular/uid1000 e pastas semsymlink.
Demais diferencas runtime bloqueiam. Novos arquivos do deploy e QA possuem
inventario fechado/hashes; backups privados e fases idempotentes. Nao apagar
estado/locks nem repetir restartmanual se bloquear. Retomada de reiniciando
somente observa,sem reinicio duplicado. DEV/Experience/dumps/Nodes/flags intactos.

Operador via stdin preparar/aplicar COMMIT e script instalado conferir COMMIT.
Confirmacoes: CONFIRM_PROD_BACKUP,CONFIRM_PROD_BACKUP_TIMER,
CONFIRM_PROD_MAINTENANCE,CONFIRM_RH_CADASTRO_OBRA_PROD todasSIM.
Comandos completos/pinados no chat. FrontendVercel segue publicacao main.
Homologacao final pelo usuario com usuarioOBRA:observacoes/anexos sem outros
campos editaveis. Testes locais com banco/S3 simulados; agente nao acessaEC2.
