# PROD: historico recuperado de cotacoes

Promocao isolada DEV79213894, base main124bb97f. Somente GET/exibicao dos pedidos e fechamentos preservados, sem criar cotacoes/links ou registros de historicos. Dois runtimes; nenhum SQL/migration/regularizacao. Backup privado de codigo, QA antes de unico restart backend-solicitacoes. Preserva heap4096, HEAD/indice, DEV/Experience/ambientes/NSdocs/integracoes. Operador executa preparar/aplicar/conferir com Node PROD isolado e confirma backup/timer/janela e CONFIRM_HISTORICO_COTACOES_PROD=SIM. Frontend publica na Vercel main.
