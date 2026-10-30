# Producao: Financeiro da solicitacao

Promocao isolada dos commits DEV abdc7bdf e 01940faf: juros/multa, baixa em lote, ordenacao por datas e alinhamento de botoes. Atualizador seletivo, sem SQL, migrations, install, regularizacao ou alteracao de HEAD/indice. Preserva heap4096 e DEV/Experience/ambientes/integracoes. Operador executa preparar/aplicar/conferir com Node PROD isolado, backup/janela/timer confirmados. Apenas backend-solicitacoes reinicia uma vez. Frontend via Vercel main. Deploy nao executa baixas.
