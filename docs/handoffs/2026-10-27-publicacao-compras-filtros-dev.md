# Publicacao DEV e alinhamento main - 27/10/2026

## Autorizacao e escopo

Usuario autorizou commit/push refactor/frontend de Compras paginadas/detalhes
sob demanda, formas disponiveis na Fila e filtro codigo da solicitacao/retorno/
visibilidade de Contas a Pagar/Receber. Pediu alinhar a base DEV com main,
preservar PROD/heap4096 e nao acessar EC2 nem alterar registros no banco.

Main revisada46ac88de88957ffc15e8b0db45dfcd6eed7bc34e; DEV publicada anterior
d4c2a1042dac21502b6b6eb38383cfc30caa4fee. Agente nao executa SSH/SSM/SQL.
Somente preparo/teste local, Git/GitHub e comandos para o usuario executar.

## Integracao e etapas

Commits funcionais locais c5100dbf (backend) e3d2a5e1e (frontend/documentacao).
Merge bd099296 une os ancestrais MAIN/DEV sem rebase/force/reset. Runtimes comuns
da main incorporados: hotfix OOM, Vale e otimizacao do historico. Preservados
backend do cartao repetido e APIs/componentes manuais exclusivos DEV fiscal
(FiscalDiagnostics/FiscalLogs/fiscalApi e nsdocs/manual). Demais telas fiscais
seguem main, sem remover esses recursos DEV. Main remota nao e alterada.

Conflitos de scripts de pacote resolvidos unindo QAs dos dois lados; dependencias
semanticamente iguais, sem install ou troca de versao. Lockfiles equivalentes;
duplicata textual saxes surgida no merge foi removida usando o lock DEV equivalente.
Historico/ownership/handoffs documentais de ambos os lados conservados. Catalogo
de navegacao regenerado pela fonte; QA de duplo clique/vinculos e otimizacao
historica da main preservados.

Publicacao em etapas e obrigatoria para compatibilidade: branch publicada
primeiro mantem frontend exatamente no origin/refactor/frontend anterior,
com backend integrado. Todos os commits main sao ancestrais; frontend final
integrado fica preparado em commit separado. Publicar esse segundo commit
somente apos usuario enviar COMPRAS_FILTROS_BACKEND_DEV_PRONTO da EC2 DEV.
Nao publicar frontend cartao2ff50ef5 de outra etapa por inferencia.

## Seguranca e efeito no banco

A paginacao nao insere/atualiza/remove registros: SELECT/COUNT/LIMIT/OFFSET,
apenas modelos count/findAll, acesso/filtros antes de paginar. Dois services
novos de filtro/paginacao auditados sem metodos de escrita. Novas preferencias
usam somente APIs comuns ja existentes quando usuario altera os filtros na UI;
nao sao mudancas em dados financeiros. Nao afirmar que o uso normal do sistema
inteiro nao grava; o aplicador e estas consultas nao gravam no banco.

Aplicador novo atualizar-dev-compras-filtros-20261027.cjs, manifesto fechado,
testes e roteiro em ops/deploy. Instala17runtimes selecionados + QAs, com hashes
de versoes DEV explicitamente revisadas/target, sem checkout amplo e sem mover
HEAD na EC2. Nenhum arquivo migration/env/dependencia/lockfile e instalado.
Backup privado de codigo e estado retomavel;20QAs offline antes de um unico
restart backend-dev. SQL/migrations/integracoes reais zero. Banco staging e
bucket/prefixo DEV validados em configuracao sem conexao. Captura NSDOCS OFF.

Guarda PROD4096 por configuracao PM2+metadado/proc (argv pode ser titulo PM2),
heap DEV preservado; fotografia de peers/env/NodeArgs/daemon/dumps/systemd/index
e alteracoes preexistentes fora do pacote. Nada de PM2save/update/resurrect/
update-env, reinicio PROD, alteracao de planos/XMLs ou retomada de cargas.

## Validacoes

20QAs backend do pacote aprovados apos merge, incluindo7paginacao,3formas,
2codigo de solicitacao, OOM/cotacao/entregas/reorganizacao/baixas/cartao/Vale/
NSDOCS/fiscal role. Testes do aplicador:9 aprovados (hashes/paths, apenas restart
DEV, heap4GB/DEV, retomada sem repetir restart, QA falho bloqueia, delta fechado,
dependencias iguais e leitura sem escrita). Browser de Compras e retorno/filtros
reais apos merge aprovados; build integrado aprovado17.91s. Demais regressoes
especificas e verificacao do inventario Git registradas na finalizacao.

Finalizacao integrada: UI Fila1366/390 e Vale/RH1366/390 aprovadas; regressao
de rascunhos, selecao parcial, permissao e reembolso aprovada. Docs681MD e
19canonicos PASS apos atualizar duas referencias documentais antigas para
codigo externo, sem mudar implementacao. Dependencias e locks parseados iguais.
Aplicador verifica entradas semanticas do index (ls-files --stage), evitando
falso bloqueio por atualizacao de cache/stat do Git. Inventario deve ser
conferido novamente contra os bytes do commit publicado antes dos comandos.

Sem testes em banco real/MySQL/carga real e sem deploy pelo agente. Docs de
implementacao anteriores continuam como evidencias da etapa local, nao como
estado de publicacao atualizado; este handoff governa a continuacao.

## Proximo passo exato

Backend publicado e confirmado por ls-remote em refactor/frontend:
c43c2d137de89f36ebf64c77544d1bf6b9bbce6f. Main remota inalterada46ac88de e ancestral
da refactor. Inventario conferido pelos bytes do Git desse commit; delta runtime
exatamente fechado. Frontend no commit publicado identico a DEVd4c2a104: ponte
temporaria ate atualizacao manual do backend. SHA256 aplicador
91e6c55d523a93c362d5da4d5ccde718c5ad7537b3ea719611177b121bc46374.

Frontend final restaurado do candidato validado b4c49dbd no commit local seguinte,
sem novo delta funcional; nao foi enviado. Permanece pronto para publicacao
apos PRONTO, junto com estes metadados/README atualizados. Nao fazer force-push.

Depois do push backend confirmado, fornecer SHA/hash e comandos do README.
Usuario executa apenas aplicador DEV e retorna saida sanitizada. Somente com
PRONTO conferir que origin/refactor/frontend continua no backend esperado e
publicar o commit frontend preparado sem sobrepor commits novos. Homologar no
DEV; nenhuma promocao para main ou producao esta autorizada nesta etapa.
