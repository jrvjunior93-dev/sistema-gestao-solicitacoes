# Boletos de titulos compartilhados - DEV

Base40ae697b, alteracao de4runtimes: routes, controllerFila, serviceFila e novo serviceBoletosPedidos. Copia somente lista fechada com hashes; mantem HEAD/index/ambientes/processos auxiliares e heapPROD4096. NodeDEV24.22.1; restart apenas backend-dev uma vez, com retomada protegida.
Sem SQL, migrations, install, dados financeiros, uploads ou regularizacao historica. Boletos existentes reaparecem por consulta. Nao enfileira titulos.
CONFIRM_DEV_BACKUP=SIM e CONFIRM_BOLETOS_COMPARTILHADOS_DEV=SIM. Via stdin --backend COMMIT; depois scriptinstalado --conferir COMMIT. Backupprivado de codigo e validacao de origem40ae/alvo; divergencia interrompe. Nao force/remove estado ou locks em caso de falha.
Frontend usa visualizador existente e secaoBoletosDosPedidosVinculados. Compativel combackendantigo (campo ausente oculta secao) mas exige backendnovo para visualizar/baixar. PublicacaoVercelDEV segue push. Homologar TIT012512/fila993 e TIT012513/fila1004:3boletosPC243/SOL6408, sem associacao automatica porparcela. TIT012514 continua semfila.
QA servico, ACL, erros, duplicidade, baixas/estornos e aplicador antes de restart. Testes simulados nao abrem banco/S3.
