# Correcao OOM Compras em producao - 27/10/2026

Pacote restrito a duas consultas: carregamento de cotacao por token e listagem de SC. Colecoes HasMany passam a consultas separadas; campos, filtros, permissoes e regras de persistencia continuam iguais. Nao e isolamento de processos nem uma protecao nova contra cliques simultaneos.

SC 650/cotacao 313: 6 itens cadastrados, 57 manuais, 63 respostas ativas e 63 itens selecionados. Contagens manuais indicam 1.357.398 linhas intermediarias possiveis no JOIN antigo. Nao se executou esse JOIN para medir e nao se atribuiu memoria exata por requisicao. O patch elimina essa multiplicacao entre colecoes.

## Antes de executar

- Operador executa os comandos; agente nao acessa EC2.
- Informe uma breve janela para um restart exclusivo de backend-solicitacoes. Preserve dados nao enviados nos formularios; evite novos salvamentos enquanto houver manutencao.
- Backup recente conferido, timer ativo, ambiente automatico NSDOCS desligado e carga historica pausada.
- Node PROD deve continuar com --max-old-space-size=4096 na configuracao PM2. Se o PM2 ocultou argv ao reescrever process.title, o pacote exige titulo exato do processo e metadado node_args4096 do filho, sem NODE_OPTIONS. Nao se usa cmdline sem flags como prova de perda do limite, nem se mede o heap efetivo por inspector.
- Nenhuma migration, install, SQL, alteracao de registros, cancelamento de SC ou chamada S3/cotacao pelo aplicador.
- QA utiliza mocks e SQLite em memoria sob bloqueio de rede. A API reiniciada continua apta a executar as gravacoes normais solicitadas pelos usuarios; nao se desabilitam regras, rotas ou jobs existentes.

Use CMD no worktree desta publicacao. Defina COMMIT_COMPRAS com o SHA completo publicado e confira o SHA256 do aplicador entregue no chat.

```bat
set "EC2_FLUXY=ubuntu@3.142.33.181"
set "EC2_CHAVE=C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem"
certutil -hashfile "ops\deploy\atualizar-prod-compras-oom-20261027.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar %COMMIT_COMPRAS%" < "ops\deploy\atualizar-prod-compras-oom-20261027.cjs"
```

Preparar cria backup privado de codigo e registra hashes de ambiente, Nodes, dumps, planos e historico; nao reinicia. So prossiga com COMPRAS_OOM_PROD_PREPARADO e backup/janela conferidos.

```bat
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_PROD_MAINTENANCE=SIM CONFIRM_COMPRAS_OOM_PROD=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-compras-oom-20261027.cjs conferir" < "ops\deploy\atualizar-prod-compras-oom-20261027.cjs"
```

Esperado: COMPRAS_OOM_BACKEND_PROD_PRONTO, phase aplicado, old_space_mib 4096, runtime_files 2, migrations 0, direct_database_writes 0 e preservacao dos pares/ambientes/dumps. O aplicador confere apenas /health (sem banco); valide tambem login/MFA e abertura das telas no navegador, sem repetir deliberadamente a operacao que causava queda. Uma checagem basica de saude nao comprova ausencia definitiva de OOM.

Se houver erro, envie somente a saida sanitizada. Nao remova locks/estado nem force Git, PM2 save/update/resurrect/update-env ou reinicios sucessivos. Estado exclusivo: .git/fluxy-compras-oom-prod-20261027/estado.json. Falhas antes do restart nao disparam restart. Se a fase reiniciando for retomada, o contador/PID impede um segundo restart quando o primeiro ja ocorreu; reinicios adicionais bloqueiam.

## Reversibilidade e limites

O backup privado contem os bytes anteriores dos arquivos alterados e os hashes do estado protegido. Nao existe rollback automatico que possa desfazer registros. Em caso de regressao, preservar esse estado para preparar uma reversao de codigo por escopo, sem reset/clean nem restauracao de banco. Nao executar ferramentas de outra tarefa (heap/cancelamentos/captura) como parte deste pacote.

O heap 4096 e preservado apenas como ja esta no PM2 em memoria. Este deploy nao altera o dump de boot: nao torna esse limite persistente apos um futuro reboot. O DEV nao e reiniciado nem recebe codigo.

## Correcao do preflight apos retorno do operador

O primeiro preparar bloqueou antes de criar estado porque exigia flag em cmdline. Leitura manual de 27/10/2026 17:29:47Z confirmou PM2/configuracao e metadado do filho4096, NODE_OPTIONS ausente e titulo PM2 reescrito; estado de deploy inexistente. Preflight corrigido e testado para esse caso, recusando limites ausentes/divergentes/ambiguos, titulo desconhecido e NODE_OPTIONS. Nao reaplicar heap, reiniciar ou remover locks por causa dessa mensagem.

Utilizar o NOVO SHA publicado no chat, que tem como pai 51e8fef738da25b78970664b6bc3eebeb59e4e85. O manifesto cobre a cadeia fechada desde2f6 e mantem os mesmos controllers/QA funcional. Nao reutilizar o commit anterior com o aplicador novo.
