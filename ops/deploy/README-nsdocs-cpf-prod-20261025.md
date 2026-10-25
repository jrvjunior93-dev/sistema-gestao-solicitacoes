# Patch CLI: emitente CPF da NF-e

Somente4runtimefiles; base3f5506fc, sem restart, migration, deps, frontend ou
alteracao de ambientes. CPF valido so no emitente; empresa/destinatarioCNPJ
preservados. Metadata tipadaCPF e XML/chave correspondentes; nao inferir CNPJ
nem transformar CPF em outro documento. MOC7pagina19 fundamenta zeros apenas
no trecho da chave. Assinatura digital nao e validada por esta captura.

## Operacao manual

No CMD local, conferir SHA256 do novo aplicador informado no recibo da publicacao.
Usar SHA exato publicado; nao git pull nem executar operadores antigos antes.

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar SHA_PUBLICADO" < "ops\deploy\atualizar-prod-nsdocs-cpf-20261025.cjs"
```

Preparar apenas confere e cria backup privado. Depois de PREPARADO, com backup
conferido/timer ativo para a operacao, aplicar e conferir:

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CPF_UPDATE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-nsdocs-cpf-20261025.cjs conferir" < "ops\deploy\atualizar-prod-nsdocs-cpf-20261025.cjs"
```

Checks com guards/locks/hashes/QA e preservacao dos planos/journal/credencial e
PM2/Nodes/env/dumps. Sem rede NSDOCS, banco ou S3 na aplicacao. Enviar resultado
antes de retomar um GET piloto. Lancador anterior exige HEAD3f5506fc; nao serve
para nova versao. Plano c456781c-4393-468b-858f-dbf220d8f215 nao deve ser recriado.

## Retorno do codigo

Mesmos contexto/flags, acao voltar. Somente quatro fontes, sem reverter dados ou
planos; preserva HEAD e gera tracked alterado esperado. Retorno interrompido
entre arquivos e retomavel; replay do retorno apenas confere as fontes antigas.

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CPF_UPDATE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - voltar" < "ops\deploy\atualizar-prod-nsdocs-cpf-20261025.cjs"
```

Se interrompido enviar saida sem segredos; nunca force Git ou remova locks.
