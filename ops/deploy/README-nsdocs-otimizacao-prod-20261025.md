# Atualizar a descoberta NSDOCS de producao — 25/10/2026

Publicar somente main. O agente nao aplicou estes comandos na EC2.
Nao usar os launchers antigos, que fixam o commit anterior.

## Escopo e preservacao

O filtro confirmado e exatamente `NF-e` (nao `nfe`). A descoberta prioriza
os menores intervalos pendentes e mantem janelas concluidas, IDs e checkpoints.
As 150 NF-e ja identificadas continuam sendo metadados no plano privado.
As 46 NF-e de origem e seus XMLs permanecem no banco/S3. O teste do aplicador
nao escreve no banco nem no S3 e nao chama NSDOCS.

A atualizacao altera dois arquivos de runtime da CLI. Sem restart, migration,
install, frontend, alteracao de .env, Nodes, PM2 ou DEV. O automatico permanece
OFF. A CLI e carregada novamente a cada execucao; nenhum restart e necessario.

O operador exige o mesmo plano, pelo menos 150 metadados e 46 chaves de origem,
verifica automatico/fixtures OFF, backup timer ativo e snapshots dos processos,
Nodes, ambientes e dumps. Guarda codigo anterior e plano privado para auditoria.
Recusa locks existentes; nao apaga locks de terceiros. A copia do plano fica
em .git/fluxy-nsdocs-otimizacao-prod-20261025/complemento-antes.json, modo600.

## Windows CMD: preparar e aplicar

Executar no checkout local publicado, conferir o SHA divulgado na resposta.
A variavel abaixo deve conter o commit aprovado publicado em main. Os comandos
nao sao PowerShell e devem ser executados individualmente, verificando a saida.

```bat
cd /d "C:\Users\Ricardo\.codex\worktrees\retirada-envios-main-20261024\Fluxy"
for /f %I in ('git rev-parse HEAD') do set "NSDOCS_OTIMIZACAO_COMMIT=%I"
certutil -hashfile "ops\deploy\atualizar-prod-nsdocs-otimizacao-20261025.cjs" SHA256
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar %NSDOCS_OTIMIZACAO_COMMIT%" < "ops\deploy\atualizar-prod-nsdocs-otimizacao-20261025.cjs"
```

Somente depois de PREPARADO, com backup recente conferido e timer ativo:

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_OTIMIZACAO_UPDATE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-nsdocs-otimizacao-20261025.cjs conferir" < "ops\deploy\atualizar-prod-nsdocs-otimizacao-20261025.cjs"
```

Exigir APLICADO e CONFERIDO, phase=aplicado, automatico_desligado=true,
documents_discovered>=150, source_documents=46. Se falhar, guardar a saida
sem segredos; nao forcar Git, repetir captura ou remover locks.

## Uma consulta piloto no mesmo plano

Aguardar pelo menos 60s da ultima chamada real e fim de qualquer rodada ativa.
Este comando faz ate 1 GET real e grava apenas o checkpoint/historico privado.
Nao baixa XMLs nem insere NF-e na caixa do sistema.

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && sleep 60 && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CAPTURE=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node scripts/nsdocsProdComplement.js --descobrir --empresa-id 1 --cnpj 27123008000100 --plano-id c456781c-4393-468b-858f-dbf220d8f215 --max-consultas 1 --confirmar-chamada-real"
```

Conferir ausencia de erro, needs_review=false, pelo menos150descobertos e
source_documents=46. Contagem de pendencias pode subir ao dividir uma janela;
source_documents_missing significa ainda nao reencontrada na descoberta, nao
exclusao do banco. Nao criar outro plano e nao reiniciar o plano original.

## Retomar descoberta em segundo plano

Depois do piloto aprovado, se enumeration_complete=false, executar uma vez.
O launcher espera60s e executa ate10consultas seriais, com60s entre chamadas.
nohup permite desconectar o SSH sem encerrar a rodada; nao instala agenda/job.

```bat
certutil -hashfile "ops\deploy\iniciar-descoberta-nsdocs-otimizada-prod-20261025.sh" SHA256
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CAPTURE=SIM /bin/bash -s -- --confirmar-descoberta-real --commit %NSDOCS_OTIMIZACAO_COMMIT%" < "ops\deploy\iniciar-descoberta-nsdocs-otimizada-prod-20261025.sh"
```

Guardar LOG_PRIVADO impresso. Consultar sem rede NSDOCS e sem escrita:

```bat
ssh -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node scripts/nsdocsProdComplement.js --consultar --empresa-id 1 --cnpj 27123008000100 --plano-id c456781c-4393-468b-858f-dbf220d8f215"
```

Para acompanhar log, usar tail -n20 -f no caminho LOG_PRIVADO retornado. Ctrl+C
nesse acompanhamento interrompe apenas tail. Nova rodada somente apos footer
NSDOCS_RODADA_ENCERRADA codigo=0, sem erro e ainda com pendencias.
Se enumeration_complete=true, nao iniciar outra descoberta: enviar o estado
para conferir cobertura, revisoes e source_documents_missing=0 antes dos XMLs.
A captura complementar de dados/XMLs e a etapa seguinte, nao executada aqui.

## Retorno de codigo

Se necessario, usar o mesmo operador com acao voltar e as tres confirmacoes de
backup/timer/OTIMIZACAO_UPDATE. So restaura os dois arquivos de runtime e conserva
o HEAD novo com tracked alterado esperado. Nunca restaura checkpoint anterior,
XML, banco, credenciais ou historico. Se a descoberta ja avancou, seu progresso
permanece atual. Retorno interrompido e retomavel; nao usar reset/clean.

## Validacao

120 testes fiscais passaram (15novos); transporte e storage simulados, SQLite
em memoria. Cenario controlado: mesmo conjunto217NF-e, 4GETs anteriores contra
2GETs novos, com150metadados e46originais preservados. Nao promete metade do
tempo real. Operador/launcher:13testes; sondas:21testes, somente fixtures.
