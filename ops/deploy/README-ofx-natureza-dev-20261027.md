# DEV: filtro de credito/debito OFX - 27/10/2026

Somente o operador executa os comandos SSH. O agente nao acessa EC2.
Pacote exclusivo DEV, sem alteracao na main ou em producao.

## Escopo

- Atualiza somente dois arquivos runtime: conciliacaoBancariaService.js e
  financialValidators.js, mais QAs offline e arquivos deste aplicador.
- Faz backup privado de codigo, valida inventario/hashes e dependencias;
  nao executa git pull/reset/checkout, install, migrations ou SQL.
- Nao importa OFX, cancela SC, concilia lancamento, baixa titulo ou grava
  registros financeiros. Nao conecta ao banco, S3 ou NSDOCS na instalacao.
  Fixtures dos QAs sao somente memoria/SQLite :memory:, sob bloqueio de rede.
- Fotografa/verifica PROD/DEV/Experience, Nodes isolados, argumentos e ambientes,
  daemon PM2, dumps e unit systemd. Exige PROD com old-space4096 e preserva-o;
  mantem os argumentos atuais do Node DEV. Reinicia apenas backend-dev, uma vez,
  sem update-env/save/update/resurrect. Revalida health basico8000/8001.
- Mantem HEAD/index da EC2. Aceita o checkout preservado das atualizacoes
  anteriores e o overlay c43c2d13 ja conferido pelo operador. Conteudo fora
  dos hashes revisados interrompe; nao forcar ou remover locks.
- O frontend publicado na refactor/frontend continua funcionando com backend
  anterior, omitindo natureza. O seletor aparece quando a resposta de listagem
  anuncia filtro_natureza_disponivel=true. Recarregue o navegador apos PRONTO.
  Nao e necessario construir frontend na EC2. Permissoes e confirmacoes mantidas.

## Executar no Windows CMD

Backup DEV deve estar conferido antes de afirmar CONFIRM_DEV_BACKUP=SIM.
Defina COMMIT_OFX com o SHA completo publicado informado na entrega.
Nao usar o COMMIT_DEV antigo do pacote compras-filtros.

```cmd
cd /d "C:\Users\Ricardo\.codex\worktrees\compras-paginacao-local-20261027\Fluxy"
set "EC2_FLUXY=ubuntu@3.142.33.181"
set "EC2_CHAVE=C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem"
certutil -hashfile "ops\deploy\atualizar-dev-ofx-natureza-20261027.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "%EC2_CHAVE%" "%EC2_FLUXY%" "cd /home/ubuntu/sistema-gestao-solicitacoes-dev && CONFIRM_DEV_BACKUP=SIM CONFIRM_OFX_NATUREZA_DEV=SIM /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - --backend %COMMIT_OFX% && /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-dev-ofx-natureza-20261027.cjs --conferir %COMMIT_OFX%" < "ops\deploy\atualizar-dev-ofx-natureza-20261027.cjs"
```

Esperado OFX_NATUREZA_BACKEND_DEV_PRONTO, runtime_files2, sql0, migrations0,
financial_data_writes0, conciliacoes_executadas0, producao_heap_4096_preservado
e heap_dev_preservado true. Aplicar e conferir emitem dois JSONs; so um restart.
Envie somente essa saida, nunca .env/chave/credenciais/XMLs ou dumps completos.

## Conferencia funcional

No DEV abra Conciliacao OFX, Conferir manualmente: teste Todos, Credito e Debito
com Atualizar lancamentos, conta/datas/status, paginacao e Limpar. Essa
homologacao e somente leitura. Nao clique em importar, conciliar, ignorar,
remover, gerar titulo ou baixar para testar o filtro com dados reais.

## Se interromper

Estado e backups privados em /home/ubuntu/.config/fluxy-ofx-natureza-dev-20261027.
Nao remover locks/estado nem repetir restart manual. Retomada na fase restarting
apenas confere a transicao; nao reinicia novamente. Falha de QA para antes do
restart. Envie o codigo sanitizado. Reversao de codigo exige procedimento
especifico com os backups revisados; nao restaurar banco ou dump PM2.
