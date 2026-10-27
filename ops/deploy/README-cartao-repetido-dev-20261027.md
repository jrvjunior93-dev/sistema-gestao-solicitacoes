# Cartao repetido: atualizacao exclusiva do backend DEV

Correcao para varias passagens do mesmo cartao, com valores/datas/parcelas separados. Backend publicado primeiro em refactor/frontend. Frontend somente depois de CARTAO_REPETIDO_BACKEND_DEV_PRONTO enviado pelo usuario. Nao aplicar estes comandos em producao.

## Aplicador

Arquivo atualizar-dev-cartao-repetido-20261027.cjs, executado manualmente pelo usuario via node - no checkout /home/ubuntu/sistema-gestao-solicitacoes-dev. Exige NodeDEV24.22.1 isolado, branchDEV e revisao anterior conhecida (6618f6ca ou b620379f). Confere flagsNSDOCSOFF, ambienteDEV/porta8001/hoststaging e fiscalS3DEV, sem acessar banco/S3.

Atualizacao seletiva: somente pagamentoFilaLiquidacaoService.js, teste novo, scriptQA de package.json e arquivos deste aplicador. HEAD Git e arquivos de outras tarefas sao preservados. Isso evita promover a navegacao compilada pendente junto desta correcao. O Git mostrara diferencas locais esperadas nesses arquivos depois da atualizacao; **nao execute git pull/reset/restore por conta propria**. O estado privado e o manifesto permitem reconciliar em uma atualizacao futura.

Backup privado de codigo e estado em /home/ubuntu/.config/fluxy-cartao-repetido-dev-20261027, permissoes700/600. Snapshot de PM2/Node/env/dumps/daemon/systemd antes e depois; apenas backend-dev pode reiniciar uma vez. Sem alteracao de.env, dependencias, schema, migrations, SQL ou integracoes. O backup de codigo nao substitui o backup do ambiente conferido pelo usuario.

Os comandos completos com o commit imutavel serao fornecidos na conversa apos o push. Parametros:

```text
node - --backend COMMIT_BACKEND_DEV
node ops/deploy/atualizar-dev-cartao-repetido-20261027.cjs --conferir COMMIT_BACKEND_DEV
```

Na primeira execucao, confirmar CONFIRM_DEV_BACKUP=SIM e CONFIRM_CARTAO_REPETIDO_DEV=SIM. O operador faz fetch de refactor/frontend, valida ancestralidade, inventario/hash e byte anterior dos arquivos, guarda backups, atualiza somente os caminhos previstos, executa6regressoes em memoria com bloqueio de rede e testes do aplicador, reinicia somenteDEV e verifica estabilidade de health8000/8001 e preservacao dos pares.

Uma recusa por arquivo divergente, outroHEAD ou processo/ambiente inesperado exige revisar a saida; nao force/repare/remova locks. Se a resposta do restart for perdida, o estado fica restarting: nova execucao apenas confere a transicao, sem emitir outro restart. Se o processo nao tiver mudado, o operador recusa em vez de tentar novamente. Estado done pode ser conferido/reexecutado sem novo restart.

Health e vivacidade basica; nao prova conexao com banco nem fluxo financeiro real. Depois da liberacao frontend, homologar um titulo de teste noDEV e verificar duas passagens do mesmo cartao (mesmo dia/dias diferentes), previa/datas/parcelas e replay. Nao registrar pagamentos reais de producao para testar.

## QA local

```text
cd backend
npm run test:cartao-parcelamento-baixa
node scripts/validarFilaLiquidacaoRateada.js
node scripts/validarFilaBaixaComposta.js
node scripts/validarCarteiraChequesBaixaComposta.js
node scripts/validarFilaInstrumentos.js
cd ..
node --test ops/deploy/atualizar-dev-cartao-repetido-20261027.test.cjs
cd frontend
node scripts/validarCartaoParcelamentoUI.mjs
npm run build
```

Toda a QA usa modelos/APIs em memoria ou localhost. Nenhum agente acessa EC2 nesta tarefa.
