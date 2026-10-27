# Atualizacao DEV: Compras paginadas e filtros financeiros - 27/10/2026

Somente o operador executa SSH. Agente nao acessa EC2. Backend antes frontend.
Nao executar git pull/reset, npm install, migrations gerais, SQL ou PM2
save/update/resurrect/update-env neste procedimento.

## O que ocorre e o que nao ocorre

Paginacao de Compras usa somente count/findAll (SELECT/COUNT/LIMIT/OFFSET),
sem INSERT, UPDATE, DELETE, DROP, ALTER ou migration. Filtro de solicitacao
e sugestoes de formas tambem sao leitura. Cache de filtros usa APIs normais
de preferencias somente quando usuario opera a interface; nao mexe em
titulos, pedidos, baixas, SCs, XMLs ou historicos financeiros.

Aplicador instala17arquivos runtime revisados mais QAs e seus proprios arquivos,
com backup privado de codigo. Atualiza tambem correcoes da main ausentes no DEV
(OOM de cotacoes, Vale e descoberta historica), sem executar suas operacoes.
Mantem captura manual DEV e cartao repetido no backend. Nenhum schema e aplicado,
nenhuma carga NSDOCS/SC/captura/operacao financeira e disparada.

Fotografa/verifica PROD/DEV/Experience, Nodes isolados, argumentos Node, ambientes,
daemon, unit systemd, dumps e index Git; confere PROD4096 em PM2 e metadado do
processo (titulo PM2 pode ocultar argv). Mantem o heap atual DEV. Faz20QAs
offline antes de reiniciar SOMENTE backend-dev, sem update-env. Confere health
8000/8001 e preservacao dos pares. Branch/head EC2 permanecem no estado anterior;
instalacao e seletiva por hash, nenhum checkout amplo ou frontend na EC2.

Precondicoes: backup DEV conferido, backend-dev online no checkout DEV8001,
Node24.22.1 dedicado, banco de staging configurado, fiscal bucket/prefixo DEV,
automatico NSDOCS desligado e schema ja homologado nas etapas anteriores.
O aplicador valida configuracao local sem conectar ao banco/S3/NSDOCS. Recusa
arquivos fora dos hashes revisados ou diferencas nas dependencias.

## Comandos Windows CMD

No worktree compras-paginacao-local-20261027/Fluxy, defina COMMIT_DEV com o SHA
de backend publicado informado na entrega. Nao usar o commit frontend pendente.

```cmd
cd /d "C:\Users\Ricardo\.codex\worktrees\compras-paginacao-local-20261027\Fluxy"
set "EC2_FLUXY=ubuntu@3.142.33.181"
set "EC2_CHAVE=C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem"
set "COMMIT_DEV=c43c2d137de89f36ebf64c77544d1bf6b9bbce6f"
certutil -hashfile "ops\deploy\atualizar-dev-compras-filtros-20261027.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-dev && CONFIRM_DEV_BACKUP=SIM CONFIRM_COMPRAS_FILTROS_DEV=SIM /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - --backend %COMMIT_DEV% && /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-dev-compras-filtros-20261027.cjs --conferir %COMMIT_DEV%" < "ops\deploy\atualizar-dev-compras-filtros-20261027.cjs"
```

Esperado COMPRAS_FILTROS_BACKEND_DEV_PRONTO, runtime_files17, sql0/migrations0,
producao_heap_4096_preservado e heap_dev_preservado true. Dois JSONs representam
aplicacao e conferencia, nao dois reinicios. Envie a saida para liberar a etapa
frontend ja preparada. Nunca enviar .env/chave/XML/credenciais.

Publicacao backend confirmada em origin/refactor/frontend:
c43c2d137de89f36ebf64c77544d1bf6b9bbce6f. SHA256 do aplicador:
91e6c55d523a93c362d5da4d5ccde718c5ad7537b3ea719611177b121bc46374.
Main remota permanece46ac88de. Frontend integrado fica em commit local posterior,
aguardando a conferencia DEV. Nao enviar esse commit antes da saida PRONTO.

## Interrupcao e recuperacao

Nao remover estado/locks, nao forcar Git ou repetir restart manual. O estado
privado em /home/ubuntu/.config/fluxy-compras-filtros-dev-20261027 guarda hashes,
fotografia sanitizada e backups de codigo. Se a resposta do restart se perder,
retomada em restarting apenas confere; nao reinicia novamente. Se QA bloquear,
nenhum restart e disparado. Apresente somente o codigo sanitizado da falha.
Rollback exige pacote especifico usando backups revisados; nao restaurar banco
ou dumps PM2 nem executar comandos destrutivos.
