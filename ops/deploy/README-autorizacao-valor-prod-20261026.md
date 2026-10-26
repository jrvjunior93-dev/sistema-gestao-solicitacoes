# Autorizacao parcial e moeda brasileira — producao

Base main: `920f639c33ea3b7e8b6a1b9564862cd2bd8fd6e3`. Origem funcional: `fc369151`, `ba7393ab` e `ed211fab` da refactor/frontend. Promocao seletiva: nao sobrescreve S3, role fiscal, captura NSDOCS nem configuracoes de producao com variantes DEV.

O proprietario pode autorizar parte do saldo, com confirmacao biometrica e assinatura do valor escolhido. O titulo original permanece com seu valor; a fila usa o limite autorizado e mostra a observacao da edicao. Baixas, juros, multas, rateios e estornos respeitam esse limite e preservam o saldo restante. Inclui filtro por solicitacao e campo de moeda brasileira durante a digitacao.

## Ordem obrigatoria

1. Publicar somente o commit de backend na main. Frontend fica em commit local separado.
2. Conferir backup recente no Drive cifrado, timer ativo e janela de manutencao.
3. No CMD local, executar `preparar COMMIT_BACKEND` com o aplicador por stdin.
4. Executar `aplicar` e depois `conferir`. O aplicador atualiza apenas o codigo aprovado, executa QA offline, aplica somente a migration indicada, confere schema e reinicia exclusivamente backend-solicitacoes com seu Node isolado.
5. Somente apos `AUTORIZACAO_VALOR_BACKEND_PROD_PRONTO`, publicar o commit frontend na main e conferir a versao servida pela Vercel.

Migration exclusiva: `202610260001_pagamento_autorizacao_valor.js`. Adiciona `autorizacao_valor_json` JSON nullable em pagamento_autorizacao_itens e pagamentos_manuais_fila. Sem backfill, UPDATE/DELETE financeiro, runner geral, sync, install ou down destrutivo. O doctor valida UUID de producao, TLS e ledger; outra migration pendente bloqueia. DDL parcial pode retomar sem duplicar coluna; ledger so e registrado depois das duas colunas.

## Comandos (CMD do Windows)

No diretorio deste worktree, substituir COMMIT_BACKEND pelo SHA publicado entregue na conversa. Nunca usar o SHA do frontend nesta etapa.

```bat
certutil -hashfile "ops\deploy\atualizar-prod-autorizacao-valor-20261026.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar COMMIT_BACKEND" < "ops\deploy\atualizar-prod-autorizacao-valor-20261026.cjs"
```

Somente com backup recente conferido, timer ativo e manutencao autorizada:

```bat
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-main && CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_PROD_MAINTENANCE=SIM CONFIRM_AUTORIZACAO_VALOR_PROD=SIM /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - aplicar && /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-prod-autorizacao-valor-20261026.cjs conferir" < "ops\deploy\atualizar-prod-autorizacao-valor-20261026.cjs"
```

O aplicador faz a migration especifica; nao rodar migrate geral. O caminho do Node prod e mantido; nao usar npm install, update-env, PM2 save/update/resurrect ou alterar dumps. DEV e Experience devem manter PID, contador de restart e ambiente. NSDOCS automatico permanece OFF; nao retoma captura e nao chama fornecedor/S3.

## Interrupcao e retomada

Correcao do preflight apos c405f805: `/proc/PID/environ` fornece o ambiente inicial do processo, enquanto DB_HOST e outras variaveis sao carregadas pelo dotenv no backend. O doctor agora carrega `.env` com `override:false` antes de validar o contexto; nao altera arquivo ou ambiente PM2. A tentativa anterior interrompeu em arquivos_prontos sem colunas novas, registro de migration ou restart.

Para esse estado ja preparado, nao repetir preparar: usar o aplicador atualizado por stdin com `corrigir-preflight COMMIT_CORRECAO`. Essa acao confere o commit filho de c405f805, o manifesto integral e o delta limitado a doctor/testes/operador/documentacao; faz fast-forward e atualiza os hashes esperados do estado, preservando backups e snapshots originais. Nao aplica schema e nao reinicia. Se a conexao cair entre Git e estado, a mesma acao admite retomar. Depois executar o mesmo aplicar/conferir, com as confirmacoes atuais de backup/timer/manutencao. Frontend continua retido.

Preservar `.git/fluxy-autorizacao-valor-prod-20261026` e a saida de erro. Se uma etapa falhar, enviar a saida antes de agir. Reexecucao do mesmo `aplicar` retoma as fases verificadas; nao usa reset/force, nao repete DDL ja presente nem um restart ja contabilizado. Locks preexistentes bloqueiam a operacao e nunca sao removidos pelo aplicador. Sem reversao destrutiva das novas colunas de auditoria.

## Homologacao depois do frontend

- Com usuario proprietario autorizado, filtrar a solicitacao por codigo/descricao e selecionar um titulo com saldo conhecido.
- Digitar valor parcial em BRL (ex.: R$ 200,00 para saldo R$ 500,00); testar apagar, substituir selecao e colar. Conferir resumo antes da biometria.
- Confirmar por passkey; na fila, conferir R$ 200,00 e observacao de edicao pelo proprietario. O titulo original deve continuar R$ 500,00; o restante fica pendente.
- Validar baixa parcial/completa da parcela autorizada, preservacao de historico e limites. Nao pagar valores reais apenas para homologar; usar os testes automatizados e registros de teste autorizados.
- Usuario sem permissao continua sem editar/autorizar; repeticao de envio e valor alterado apos desafio biometrico devem ser rejeitados.
- Consultas NF-e/XML e relatorio Localizar pedidos continuam disponiveis; NSDOCS nao e habilitado por este pacote.

QA automatizado usa fixtures e SQLite em memoria, sem banco remoto, dados reais, biometria real ou chamadas externas. Build e testes de interface usam backend simulado. A verificacao final em producao depende da saida do aplicador e da homologacao do usuario.
