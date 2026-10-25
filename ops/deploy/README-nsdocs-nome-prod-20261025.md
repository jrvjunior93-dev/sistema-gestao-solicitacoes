# Patch CLI NSDOCS: destinatario sem nome na listagem

Um unico arquivo runtime alterado: normalize.js. Nome exatamente vazio aceito
sem preencher valor ficticio. Identidade/dados/XML e demais campos preservados.
Backend03c91cfe ja implantado, frontend953b6a3a ja publicado. Novo commit de patch
na main, sem alteracoes de frontend/deps/schema. Refactor recebe delta comum.

## Preparar e aplicar

Usar SHA exato publicado informado no recibo/final. No CMD local, com o arquivo
atual do aplicador enviado por stdin (nao e necessario git pull antes):

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar SHA_PUBLICADO" < "ops\deploy\atualizar-prod-nsdocs-nome-20261025.cjs"
```

Preparar confere e cria backup privado do codigo; nao altera checkout ativo nem
plano, credencial, banco, S3, frontend, env ou processos. Exige checkout main e
HEAD03c91cfe ou953b6a3a com hashes conhecidos. Captura/consulta concorrente bloqueia.

Depois de PREPARADO, com backup/timer validos para esta operacao:

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_NOME_UPDATE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-nsdocs-nome-20261025.cjs conferir" < "ops\deploy\atualizar-prod-nsdocs-nome-20261025.cjs"
```

Aplicar verifica timer ativo, inventario fechado, QA sem rede e preservacao de
planos/progresso/journal/credencial, Nodes, env, dumps e processos. Nenhum restart,
install, migration, API NSDOCS, XML, escrita RDS/S3 ou update-env. A CLI nova e
carregada no proximo processo manual. Enviar saida antes de retomar descoberta.

## Retorno

Disponivel se QA/fonte falhar apos iniciar aplicacao ou se for necessario voltar.
Mesmo contexto, flags e operador, acao voltar. Restaura so o normalize.js anterior;
HEAD permanece no commit publicado com tracked alterado esperado. Nunca git reset,
restore global, limpeza de locks, retorno de schema ou alteracao de dados.

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_NOME_UPDATE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - voltar" < "ops\deploy\atualizar-prod-nsdocs-nome-20261025.cjs"
```

Preservar IDs: complemento c456781c-4393-468b-858f-dbf220d8f215 e origem
8e0a4179-506a-4670-88a2-d9079728e263. Nao repetir preparar-plano nem carga/XML
antes da conferencia. Se interrompido, enviar erro sanitizado; nao remover locks.
