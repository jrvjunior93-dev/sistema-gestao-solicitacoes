# DEV: Financeiro da solicitacao (30/10/2026)

Atualizador seletivo: juros/multa, baixa em lote e ordenacao por datas. Somente backend-dev, sem SQL, migrations, install ou regularizacao. Preserva HEAD, processos/ambientes/heap de PROD e demais servicos. Backup privado de codigo e validacao de integridade, QA antes do unico restart, retomada conferida. Requer backup DEV confirmado. Frontend segue publicacao Vercel da refactor/frontend.

Comandos: node isolado DEV executar este arquivo via git show do commit publicado com --backend COMMIT e confirmacoes CONFIRM_DEV_BACKUP=SIM e CONFIRM_FINANCEIRO_SOLICITACAO_DEV=SIM. Depois --conferir COMMIT. Nao executar os endpoints de baixa durante deploy.
