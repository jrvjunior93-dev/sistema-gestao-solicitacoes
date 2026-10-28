# Reabertura depois de excluir titulos pela tela

Promocao da regra homologada em DEV (2b1d3e7a), sobre main15a86635. O pedido
pode ser reaberto diretamente quando a leitura financeira canonica nao encontra
mais titulos existentes. Vinculos historicos, inclusive de fretes e alocacoes,
permanecem gravados. Titulos existentes de qualquer status continuam exigindo GEO.
Permissoes, transacao, bloqueios e auditoria da reabertura continuam no fluxo normal.

## Escopo do instalador

Operacao manual pelo usuario, sem acesso remoto do agente. Somente uma funcao do
servico muda em producao, mais os testes/aplicador. Nenhuma migration, SQL, escrita
de negocio, reabertura, captura NSDOCS ou chamada S3 e executada pelo instalador.
QA usa fixtures e SQLite efemero em memoria com conexoes externas bloqueadas.

Este pacote aceita HEAD117e34a4, d6e3cc1e ou15a86635 e somente os hashes exatos
revisados. A producao pode ainda estar sem a precisao decimal promovida em outro
chat. Por isso o aplicador substitui apenas a funcao de reabertura na fonte
instalada, preservando todos os demais bytes. Nao instala a precisao nem seu schema.
HEAD e indice Git da EC2 ficam preservados; o arquivo alterado aparece como
modificado no checkout, com hashes e backup privados no estado do aplicador.
Nao executar Git pull/reset ou pacote antigo por cima: uma proxima publicacao deve
reconhecer este overlay e preservar a guarda corrigida. Bases diferentes param
para revisao, sem tentativa de forcar a atualizacao.

Snapshot confere Node24 isolado e flag4096, ambiente, peers DEV/Experience, daemon,
dumps, planos/historico NSDOCS e automatico OFF. Sem mudar flags ou configuracao
persistida do PM2. Um restart somente de backend-solicitacoes; interrupcao de resposta
na fase de restart permite somente conferir o restart emitido, sem repeti-lo.
Locks alheios e executor NSDOCS ativo bloqueiam a operacao.

## Operacao no CMD do Windows

Na pasta deste repositorio, definir EC2_FLUXY=ubuntu@3.142.33.181,
EC2_CHAVE com o caminho da chave local e COMMIT_REABERTURA com o SHA completo
publicado na main. Conferir o SHA256 do aplicador recebido no chat.

1. Enviar o script por stdin para Node24 de producao, no diretorio raiz do checkout,
   com argumentos `preparar %COMMIT_REABERTURA%`. Cria apenas backup/estado privado;
   codigo em uso, banco e processos permanecem intactos.
2. Com backup/timer/janela conferidos, executar o mesmo script com `aplicar`, usando
   CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
   CONFIRM_PROD_MAINTENANCE=SIM e CONFIRM_REABERTURA_PROD=SIM.
3. Executar o script instalado `ops/deploy/atualizar-prod-reabertura-20261028.cjs conferir`.
   Esperado REABERTURA_BACKEND_PROD_PRONTO, phase=aplicado, old_space_mib4096,
   sql0, migrations0 e reaberturas_executadas0. Enviar a saida sanitizada.

Atualizar a pagina e verificar a disponibilidade da acao. A execucao real de
reabrir fica para o usuario, pelo fluxo normal e com motivo no historico. Se houver
titulo existente ou erro, nao corrigir registros manualmente nem apagar vinculos.
O health do instalador valida disponibilidade basica; nao substitui a conferência
do pedido na tela pelo usuario.
