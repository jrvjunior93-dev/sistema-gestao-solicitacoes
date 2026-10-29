# Destaques e fila operacional — atualizacao seletiva PROD

Somente o delta homologado DEV72c0cc47; base main39f4e719. Sem merge geral da
refactor/frontend. Dois runtimes: resumo/ordenacao de SolicitacaoController e
service puro solicitacaoFilaOperacional. Frontend/backend compativeis de forma
aditiva: os campos novos sao opcionais para clientes antigos. A apresentacao
nova fica completa depois de backend pronto e build Vercel correspondente.

O usuario executa preparar/aplicar/conferir na raiz de producao. Preparar faz
backup privado de codigo e snapshots; aplicar exige backup/timer/janela e
CONFIRM_DESTAQUES_SOLICITACOES_PROD=SIM. QA em mocks/SQLite local, sem conexoes
reais; nenhuma migration, SQL de negocio, npm install ou integracao externa.
Somente um restart backend-solicitacoes, mantendo Node PROD24.22.1 e heap4096.
DEV/Experience, daemon, dumps, systemd, env, flags e progresso NSDOCS preservados.
Locks/executor ativos bloqueiam, sem matar processos ou remover locks alheios.

HEADs revisados:15a86635/ade6e6dc/39f4e719; os arquivos efetivos devem coincidir
com base39f4e719, incluindo hotfixes instalados como overlay. Nada de pull/reset
para contornar divergencias. HEAD/index e demais arquivos ficam preservados.
Modos atuais dos arquivos regulares (inclusive0664) sao registrados e mantidos
explicitamente apos escrita atomica, independentemente da umask do terminal.
Estado em .git/fluxy-destaques-solicitacoes-prod-20261029; retomada de restart
incerto apenas confere, nao dispara de novo. Nao alterar o estado manualmente.

Comandos completos e hash de commit no chat. Esperado
DESTAQUES_SOLICITACOES_BACKEND_PROD_PRONTO, runtime_files2, migrations0,sql0,
business_data_writes0, old_space_mib4096 e pares preservados. Sem atividade nova,
decisao de retorno, titulo ou baixa executados como teste do deploy.

Homologacao visual: retorno pendente autorizado fica amarelo antes de mensagens;
ler remove so azul; decidir/cancelar encerra a atividade; acompanhamento neutro;
legenda disponivel. Prazo de retorno ainda nao configurado: nao fica atrasado
apenas pela espera. Vencimento financeiro nao e prazo da atividade.

Nenhuma EC2 ou banco foi acessado pelo agente. Publicacao Git apenas; aplicacao
real/restart e confirmacoes de backup sao feitos pelo usuario.
