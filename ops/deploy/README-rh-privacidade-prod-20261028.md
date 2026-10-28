# PROD: privacidade RH, cadastro da obra e transferencias - 28/10/2026

Promocao seletiva de f5f47ecb/0b89f480, homologada em DEV. Operador executa os
comandos EC2; agente nao acessa o servidor. Backend/schema antes do frontend.

## Escopo

Salario restrito por colaborador, valores calculados ocultos da obra em RH,
percentuais/ajustes preservados e conferencia financeira pelo DP. Edicao da obra
somente observacoes e documentos de origem de obra autorizada. Financeiro com
permissao expressa mantem os valores. Transferencia operacional de ativo com
auditoria/historico preservados; pagamento preparado fica na obra da solicitacao.
Nenhum colaborador e transferido nem salario marcado como restrito no deploy.

12 runtime RH novos/alterados. O pacote tambem confere o validador de consulta
paginada de Compras que ja esta na main2d6af625. O operador nao sabe se concluiu
a aplicacao anterior: reconhece somente2d6af625, ece109c9 ou ceaf8da7, e apenas
as2 diferencas revisadas de compras-query. Outras versoes/conteudos interrompem.
Nao remove estados/backups antigos. Se a correcao ja esta instalada, conserva-a;
caso contrario incorpora exatamente a correcao ja aprovada. Nao executar depois
um aplicador antigo sobre este pacote. OOM, SQL paginado e detalhes sob demanda
de Compras permanecem intactos.

Nao leva conectores/migration fiscal DEV, outras alteracoes de Compras pendentes,
dependencias, configuracoes ou banco staging para producao.

## Migration unica

202610280001_rh_privacidade_obra.js: adiciona salario_restrito_obra (booleano,
padrao false), obra_origem_id e chave_envio_obra (nullable), mais2 indices.
Sem UPDATE/DELETE, backfill ou alteracao de salario/pagamento/documento existente.
Somente consultas de metadados, DDL aditivo e registro em schema_migrations.
MySQL pode fazer commit implicito de DDL; retomada revalida o que existe, sem
rollback destrutivo. Down recusa remocao automatica. Nao executar migrations gerais.

Runner exclusivo PROD valida processo/Node/cwd/main, endpoint, UUID e TLS,
canal dedicado, lock, outras migrations pendentes e tipos/default/indices.
Somente5 DDL gerados pelo Sequelize MySQL sao liberados. Banco DEV rejeitado.
Nao usa models/index, sync ou o runner geral de migrations.

## Execucao manual

1. Conferir backup PROD recente, timer ativo e janela de manutencao. O comando
   de aplicar reinicia somente backend-solicitacoes; programar breve interrupcao.
2. No CMD, entrar no worktree compras-paginacao-local-20261027/Fluxy. Definir
   EC2_CHAVE, EC2_FLUXY e COMMIT_RH_PROD com os valores do chat.
3. Conferir SHA256 do novo aplicador atualizar-prod-rh-privacidade-20261028.cjs.
4. Executar preparar COMMIT_RH_PROD por stdin no Node24.22.1 PROD, diretorio
   /home/ubuntu/sistema-gestao-solicitacoes-main. Prepara backup privado de codigo;
   nao aplica schema, nao consulta banco nem reinicia processos.
5. Com CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
   CONFIRM_PROD_MAINTENANCE=SIM e CONFIRM_RH_PRIVACIDADE_PROD_SCHEMA=SIM,
   executar aplicar por stdin e encadear conferir no aplicador instalado.
6. Enviar saida RH_PRIVACIDADE_BACKEND_PROD_PRONTO; depois publicar frontend.

Guardas preservam heap4096, DEV/Experience, Nodes, env, dumps, daemon e flags.
Plano NSDOCS original/complemento/historico/XMLs preservados, automatico OFF.
Recusa captura/discovery ativa e nao interrompe executor nem remove seus locks.
Usa lock proprio para operacao; libera somente locks que ele mesmo criou.
Sem install, PM2 save/update/resurrect/update-env ou escrita de negocio.
Estado/backups privados: .git/fluxy-rh-privacidade-prod-20261028 no checkout PROD.

Esperado phase aplicado, runtime_files13 (12 RH + validador Compras conferido),
old_space_mib4096, migration nomeada, somente_schema_aditivo true,
business_data_writes/financial_data_writes/storage_calls0 e frontend_liberado false.
Os dois JSONs correspondem a aplicar e conferir. Revalidacao final consulta apenas
metadados de schema. Nao afirmar sql0, pois migration/ledger exigem SQL controlado.

Em falha, preservar estado/estrutura/locks e enviar codigo sanitizado. Nao repetir
restart nem aplicar down/rollback de banco. Restart de resposta incerta somente e
conferido na retomada; nunca e disparado novamente automaticamente.

## Conferencia depois do frontend

DP: configurar restricao no colaborador escolhido e conferir valores completos.
Obra: salario/bruto/liquido/totais ocultos, percentuais e ajustes disponiveis,
cadastro somente observacoes/arquivos autorizados. Financeiro autorizado mantem
valores. Conferir transferencia e continuidade do pagamento preparado na origem.
Sem usar operacoes financeiras/transferencias reais como teste descartavel.

Rollback de codigo/frontend exige pacote revisado especifico, preservando schema
aditivo/documentos novos e historico. Nao executar down nem restaurar banco antigo.
