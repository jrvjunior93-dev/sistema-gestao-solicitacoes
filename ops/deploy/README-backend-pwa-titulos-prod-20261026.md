# Backend PWA/titulos: producao 26/10/2026

Etapa1: somente service de titulos por pedido e QA. Interface mantida ate prova
do backend. Sem migrations, SQL direto, install, update-env ou PM2save/update.
Usuario confirmou backup noDrivecifrado/timerativo e autorizou restart exclusivo
backend-solicitacoes. Atualizacao sera executada MANUALMENTE pelo usuario.

Base obrigatoria:09b66e4b114e5f89219c58c8697a40bca04fbabd.
Operador: atualizar-prod-pwa-titulos-20261026.cjs, acoes preparar SHA/aplicar/
conferir/voltar. Manifesto fechado com1runtime+1QA; recusafrontend/extras.

Preparar faz fetch/main fixado, valida base/arvore limpa, Nodes/PM2/env/dumps,
saude, automaticoOFF, carga sem processos ativos, plano3529NF-e/origem46 e
checkpoint minimo361lotes. Guarda copias privadas de codigo/plano para auditoria.
Aplicar exige CONFIRM_PROD_BACKUP=SIM,CONFIRM_PROD_BACKUP_TIMER=SIM,
CONFIRM_PROD_MAINTENANCE=SIM,CONFIRM_PWA_TITULOS_PROD=SIM e timerativo. Faz
fast-forward, QAoffline e restart somente backend-solicitacoes com Nodeisolado,
sem update-env. Exige5checagens de saude/PIDestavel. Conferir preserva DEV,
Experience,daemon,dumps/Nodes/env e plano/historico/credencial/manifesto privado.
Nao chama banco/S3/NSDOCS; backend atende gravacoes normais da aplicacao.

12testes do operador aprovados. Testes de service/ACL/biometria/baixaparcial/
idempotencia/historico existentes passaram na preparacao; QAserver usa apenas
VMs/ORMsimulado do titulo/boleto/sobreposicao. Sem banco real nos testes.

Carga historica permanece PAUSADA comerroNSDOCS_HISTORICO_LIMITE:361concluidos/
345pendentes,1782XMLbaixados/23reaproveitados. Nao retomar launcher antigo fixado
noSHA09 apos atualizar. Nova retomada exige adaptar guardas e tratar limite de
historico preservando auditoria; nao apagar logs/locks, nao recriar plano.

Automatico NSDOCS novo nao ativado. Job fiscal atual eSEFAZ; base incremental
por recebimento, dedup/cursor/retentativas/historico precisa implementacao e
homologacao separadas. Nao basta mudar NSDOCS_V2_ENABLED (a CLIhistorica exigeOFF).

Retorno restaura somente codigo anterior do service e reinicia o mesmo backend;
HEADmantido comtrackedalterado esperado. Nao desfaz pagamentos, baixas, planos,
XML ou historico. Retorno interrompido e retomavel. Nao usar gitreset/clean.

Depois de PWA_TITULOS_PROD_APLICADO e CONFERIDO phaseaplicado, liberar commit
frontend separado. Enviar JSON da conferencia; emfalha preservar saida sanitizada
sem forceGit/locksremovidos. Nenhum frontend deve ser publicado antes disso.
