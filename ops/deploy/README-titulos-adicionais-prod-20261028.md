# PROD: novos titulos na solicitacao de compra e no pedido

Promocao seletiva da funcionalidade DEV720d4acd, cujo backend foi aplicado e
conferido pelo operador. Base main ade6e6dc, preservando reabertura e precisao
decimal. Nao e merge geral da refactor/frontend; ajustes DEV de favorecido/PIX
que nao fazem parte desta funcionalidade nao sao trazidos junto.

## Regra autorizada

Novas criacoes individuais continuam disponiveis na solicitacao e no pedido mesmo
com titulos anteriores suficientes, abertos, parciais ou quitados. Cada geracao
com chave nova cria outra obrigacao intencional. Mesma chave nao cria novamente.
O pedido conserva fechamento/adocao, categoria, parceiro e dados de pagamento;
ACL, transacoes, parcelas e fretes mantidos. Titulos/baixas/historicos anteriores
nao sao excluidos ou recalculados. O fluxo de reabertura continua exigindo GEO
quando ha titulo existente. Essa aprovacao nao e dispensada por esta publicacao.

## Aplicacao manual pelo usuario

O agente nao acessa EC2 ou banco. Conferir o SHA256 e o commit completo entregues
no chat. Na raiz /home/ubuntu/sistema-gestao-solicitacoes-main, pelo Node PROD24.22.1:

1. Enviar o aplicador por stdin com `preparar COMMIT_TITULOS_PROD`. Faz backup
   privado de codigo/estado; nenhum codigo de funcionamento ou processo e alterado.
2. Com backup/timer/janela conferidos, enviar com `aplicar`, usando
   CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
   CONFIRM_PROD_MAINTENANCE=SIM e CONFIRM_TITULOS_ADICIONAIS_PROD=SIM.
3. Encadear o aplicador instalado com `conferir`. Esperado
   TITULOS_ADICIONAIS_BACKEND_PROD_PRONTO, phase aplicado, runtime_files3,
   old_space_mib4096, sql0, migrations0, titulos_criados0 e baixas_executadas0.

A copia e seletiva: somente tres runtimes financeiros e arquivos de QA/aplicador.
Sem migrations, SQL real, install, Node/PM2 global, ambiente ou flags novas.
QA em mocks/SQLite :memory: e com conexoes bloqueadas; precisao backend-only.
Somente um restart backend-solicitacoes, preservando DEV/Experience/daemon/env/
dumps, Node isolado e4096. Estado de restart incerto permite observar, nao repetir.
Planos/historico/XMLs NSDOCS e automatico OFF preservados. Executor NSDOCS ativo
ou locks alheios impedem o aplicador, sem remocao de locks pelo instalador.

A EC2 foi confirmada em HEAD15a86635 com reabertura ade6e6dc como overlay. Esse
estado e aceito, assim como HEADade6e6dc. Reabertura/precisao em funcionamento
precisam corresponder a base revisada. HEAD e indice ficam preservados; outros
arquivos alterados no checkout conservam seus hashes. Fontes desconhecidas param
para revisao. Nao usar git pull/reset/checkout ou aplicar pacote antigo por cima.
Os backups ficam em .git/fluxy-titulos-adicionais-prod-20261028, modo privado.

Frontend usa o contrato de API anterior e header aceito pelo servidor, podendo
seguir a Vercel junto ao push. Antes de atualizar o backend, o servidor antigo
continua aplicando seus bloqueios antigos. Depois de PRONTO/Vercel concluida,
atualizar a pagina. Nenhuma criacao real de titulo faz parte do deploy; o usuario
executa novas criacoes somente pelo fluxo normal, quando desejar.
