# Atualizacao PROD: cancelamento reversivel e Vale

O agente nao acessa EC2. Todos os comandos abaixo sao executados pelo usuario no CMD do Windows. O aplicador nao cancela SCs nem cria/baixa titulos. Somente instala backend e cria o journal de auditoria via migration aditiva202610260002_compra_reorganizacao_reversivel.js. Vale usa JSON existente. Nenhum dado da planilha e incluido no deploy.

## Preparar

No diretorio local outputs/worktree-sc-reversivel-vale-main, definir COMMIT_SC_VALE com o SHA backend publicado, informado na conversa. Conferir SHA256 do arquivo atualizar-prod-sc-vale-20261026.cjs com certutil.

Com SSH usando BatchMode=yes, StrictHostKeyChecking=yes, ConnectTimeout=15, ServerAliveInterval=30, ServerAliveCountMax=6, chave local C:/Users/Ricardo/Documents/AWS FLUXY/backend-key.pem e host ubuntu@3.142.33.181:

1. No diretorio remoto /home/ubuntu/sistema-gestao-solicitacoes-main, executar Node isolado /home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node - preparar COMMIT_SC_VALE; fornecer por stdin o aplicador local.
2. Apos SC_VALE_PROD_PREPARADO, conferir backup recente no Drive cifrado, timer ativo e janela de manutencao. Somente se conferidos, fornecer CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_PROD_MAINTENANCE=SIM CONFIRM_SC_VALE_PROD=SIM ao mesmo Node - aplicar, com o mesmo aplicador por stdin.
3. Executar o Node isolado com ops/deploy/atualizar-prod-sc-vale-20261026.cjs conferir.

O aplicar inclui a migration exclusiva e o restart SOMENTE backend-solicitacoes. Nao executar migration separadamente, runner geral, npm install, PM2 save/update/resurrect/update-env ou troca de Node. O resultado esperado e SC_VALE_BACKEND_PROD_PRONTO, cancelamentos_executados0, financial_data_writes0, automaticoOFF e frontend_vale_liberadofalse.

O preparar aceita somente98d04a21, f429b6f2 ou1ee8f852 conhecidos e confere hashes. Preserva os hotfixes main. O unico backlog backend permitido e o catalogo de apropriacoes ja publicado. Se a base diferir, interromper e enviar erro sanitizado; nao forcar Git.

## Retomada e conferencia

Fases persistidas em .git/fluxy-sc-vale-prod-20261026/estado.json, backup privado de codigo e plano antes. O mesmo aplicar retoma fases; um restart ja executado nao e repetido. Falha entre CREATE e indice e retomavel sem DROP. Se houver erro, preserve estado/locks e envie a saida, sem segredos. Nao remover locks alheios ou parar carga pelo atualizador.

## Frontend

Depois do backend confirmado, publicar separadamente o frontend Vale ja testado. O cancelamento reversivel nao depende de novo frontend. Enviar o retorno antes da publicacao. Entao verificar checkbox Vale apos100%, campo de valor, rotulos Pagamento de Vale/Pagamento e Vale e preservacao de controles. Nao gerar titulo/pagamento real como teste de deploy.

## Cancelamentos

Nenhum cancelamento real nesta etapa. Futuro lote sera limitado as95SCs da planilha (71totais/24parciais), com nova simulacao, revisao de conflitos/titulos/recebimentos e mensagens antes de executar. Deploy nao e autorizacao de cancelamento. Reversoes preservam historico e bloqueiam movimentos posteriores conflitantes; nao restaurar banco globalmente.

## Recuo

Se necessario, preparar recuo de codigo a versao anterior preservada e reiniciar somente PROD em janela aprovada; nunca executar down para remover journal nem desfazer dados financeiros. DEV/Nodes/env/NSDOCS ficam preservados.
