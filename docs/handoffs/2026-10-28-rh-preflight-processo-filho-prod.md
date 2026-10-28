# RH PROD: ambiente do processo auxiliar do preflight

## Evidencia e escopo

Promocao MAIN e comandos PROD ja autorizados; sem acesso EC2 pelo agente.
Operador recebeu erro generico em preparar dea03adf. Primeiro diagnostico:
HEAD2d6af625 limpo, GitHub/commit/ancestral OK,3 processos online, preflight
detalhado CONCLUIDO e todos checks true, estado e lock RH ausentes.
Rastreio com funcoes originais passou inventario e base, falhou NODE_PREFLIGHT
com status null, sem SQL/migration/restart/escrita. Codigo nativo/sinal nao
estava incluido no relatorio; nao afirmar que IPC foi a unica causa observada.

Defeito confirmado no codigo: procEnv repassava integralmente o ambiente
inicial do PM2 para novos processos CLI, incluindo NODE_CHANNEL_FD,
NODE_CHANNEL_SERIALIZATION_MODE e NODE_UNIQUE_ID. Fonte interna do Node
setupChildProcessIpcChannel/initializeClusterIPC remove essas variaveis em
process.env justamente para impedir heranca acidental; /proc conserva o
ambiente inicial. Helpers DEV anteriores tambem removem esses3 metadados.

## Correcao

Somente aplicador/teste/manifesto/README e docs. childEnv copia o ambiente e
remove apenas esses3 campos nos filhos de preflight e schema. ProcEnv bruto
permanece para snapshots e verificacoes. Nao alterar .env, ambiente PM2,
node_args/Node4GB, DEV/Experience, flags, runtime RH, migration ou regras.
NODE_OPTIONS/DB/configuracoes nao sao ocultados nem corrigidos pelo helper;
guardas originais continuam obrigatorias. run agora classifica erros nativos
e sinais por allowlist, sem imprimir stdout/stderr/args ou valores secretos.

BASE estrutural2d6af625 preservada. Novo backend e filho direto de dea03adf;
manifesto release_parent acompanha essa cadeia. Preparar reconhece as mesmas
bases revisadas. Estado inexistente foi confirmado antes da correcao; nao
remover estados/locks se aparecerem. Backend funcional/schema identicos aos
homologados e ja publicados em dea03adf.

## Validacao/proximo passo

19 testes do aplicador PASS, incluindo chamadas reais de preflight/schema em VM com
metadados IPC, preservacao de ambiente original/configuracoes, Node auxiliar
local real sem IPC invalido, codigos/sinais sanitizados e todas as regressoes
de manifesto/heap4096/snapshot/retomada. Manifesto/documentacao, sintaxe e diff
conferidos. Runtime RH, schema e dependencias sem delta contra dea03adf.
Nenhuma operacao remota ou de banco executada pelo agente.

Publicar somente backend corrigido na main; frontend ca7293aa deve ser aplicado
novamente sobre a correcao em commit LOCAL e aguardar PRONTO manual PROD.
Fornecer novo SHA/hash para preparar. Guardas de schema/backup/timer/janela e
reinicio exclusivo PROD permanecem; publicacao frontend posterior ja autorizada.
