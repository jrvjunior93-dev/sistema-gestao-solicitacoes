# Autorizacao parcial do proprietario no DEV

Pacote de `refactor/frontend`. Publicar o commit de backend antes do frontend. Nao usar `git pull`, migrations gerais, `npm install`, PM2 `save/update/resurrect` ou `--update-env` para esta etapa. O aplicador faz o fast-forward ate o SHA de backend informado e confere o manifesto.

## Precondicoes

- Backup DEV conferido pelo operador antes da execucao.
- Checkout EC2 `/home/ubuntu/sistema-gestao-solicitacoes-dev`, branch `refactor/frontend`, arquivos rastreados limpos. Bases aceitas: `a78a5b1b` (atual conferida somente leitura) ou `f05705e3`; outros estados param.
- Processo `backend-dev`, porta 8001, Node `/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node`; demais apps e daemon com seus Nodes isolados. A configuracao efetiva do app e reutilizada somente no filho de verificacao/migration, sem imprimir segredos ou alterar `.env`/PM2.
- Banco de staging com UUID `60f043e9-4025-11f1-9a61-06d8a063012d`, TLS validado pela CA AWS existente. Nenhuma chamada NSDOCS/AWS, captura, escrita financeira ou alteracao de flags.

## Etapa backend / schema

No CMD Windows, entrar no worktree desta publicacao e definir `COMMIT_BACKEND` com o SHA entregue no chat. Conferir o SHA256 do aplicador com o valor entregue. A chave e usada pelo SSH; nunca imprimir seu conteudo.

```bat
certutil -hashfile "ops\deploy\atualizar-dev-autorizacao-valor-20261026.cjs" SHA256
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-dev && CONFIRM_DEV_BACKUP=SIM CONFIRM_AUTORIZACAO_VALOR_DEV_SCHEMA=SIM /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node - --backend %COMMIT_BACKEND%" < "ops\deploy\atualizar-dev-autorizacao-valor-20261026.cjs"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -i "C:\Users\Ricardo\Documents\AWS FLUXY\backend-key.pem" ubuntu@3.142.33.181 "cd /home/ubuntu/sistema-gestao-solicitacoes-dev && /home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node ops/deploy/atualizar-dev-autorizacao-valor-20261026.cjs --conferir %COMMIT_BACKEND%"
```

O aplicador executa QA sem rede, confere schema, aplica somente duas colunas JSON anulaveis (`autorizacao_valor_json`) e registra a migration `202610260001_pagamento_autorizacao_valor.js`. Nao executa o runner generico nem backfill/UPDATE/DELETE de cadastros, notas ou titulos.

A base atual EC2 e anterior ao historico NSDOCS: a migration `202610240003` e uma segunda identificacao da estrutura que a `202610240001` ja criou no DEV. O doctor exige a 001 no ledger, executa a verificacao 003 sob guarda **somente leitura**, normaliza tipos MySQL e registra sua compatibilidade no ledger de migrations. Qualquer tentativa de DDL da 003 e bloqueada. Nao cria/modifica tabela NSDOCS ou seus dados. Pendencias de outras migrations interrompem a operacao.

Somente depois de schema completo reinicia `backend-dev`, sem trocar Node ou ambiente. Confere os PIDs/env dos pares, daemon, dumps e systemd. Estado privado em `/home/ubuntu/.config/fluxy-autorizacao-valor-dev-20261026/backend.json`; nao editar nem remover locks. Uma interrupcao durante DDL aditiva permite retomar o mesmo SHA. Se estiver em fase de reinicio, o aplicador confere a transicao antes de concluir; nao reiniciar manualmente por fora.

Saida esperada: `AUTORIZACAO_VALOR_BACKEND_DEV_PRONTO`, `frontend_liberado:false`, `financial_data_writes:0` e processos protegidos preservados. Enviar a saida antes de publicar o frontend.

## Etapa frontend e homologacao

Frontend fica em commit separado local. Publicar somente apos a conferenca acima; a Vercel pode disparar pelo push. Nenhuma mudanca na main nesta tarefa.

1. Em uma solicitacao/titulo ficticio no DEV, preparar dossie pelo usuario de origem e acessar com o proprietario nominal autorizado, sem "Testar usuario" para decisoes.
2. Usar o filtro **Solicitacao** por codigo/descricao; conferir tambem titulo compartilhado de outra solicitacao. Na fila, preservar o filtro Solicitação ja existente.
3. Para titulo com saldo 1.000, editar autorizacao para 600. Conferir 600 autorizado/400 restante e confirmar a passkey. A decisao nao faz baixa ou altera o titulo.
4. Na fila, conferir 600 como valor de pagamento e a observacao de edicao. Tentativa de 601 deve ser recusada, inclusive via baixa composta. Nao baixar titulo real de producao.
5. Em fixture homologada, pagar 600: fila concluida, titulo PARCIAL com saldo 400. O restante passa por novo dossie/autorizacao. Estorno restaura somente o limite dessa autorizacao.
6. Conferir cancelamento de biometria, duplo clique, historico, comprovantes, permissao somente leitura, valor integral sem edicao e regressao de baixas parciais. Regras de cartao de credito que exigem quitacao integral permanecem.

Biometria real e concorrencia MySQL dependem desta homologacao. Testes locais usam fronteiras simuladas/SQLite em memoria, sem banco externo.
