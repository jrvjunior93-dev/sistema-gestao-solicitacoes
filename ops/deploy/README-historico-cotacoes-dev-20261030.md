# DEV: historico recuperado de cotacoes

Somente consulta/exibicao dos registros preservados em pedidos e fechamentos. Nenhuma reconstrucao de links, backfill, SQL, migration, baixa ou regularizacao. Frontend identifica Dados recuperados e limita as evidencias ao que realmente esta preservado.

Atualizador seletivo com 2 arquivos runtime e QA em ambiente isolado de rede. Preserva HEAD, ambientes/heap de DEV e PROD, Experience, daemon e dumps. Backup privado de codigo antes da copia; unico restart backend-dev; conferir apos aplicar. Requer CONFIRM_DEV_BACKUP=SIM e CONFIRM_HISTORICO_COTACOES_DEV=SIM. Node DEV isolado; modos --backend COMMIT e --conferir COMMIT.
