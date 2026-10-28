# Retomada manual do pacote de titulos adicionais PROD

Evidencia enviada pelo operador: fase `atualizando`, HEAD15a86635 preservado,
staged vazio,23 arquivos selecionados conhecidos (13 originais/10 release),
tres runtimes release, nenhuma fonte divergente e fora de escopo preservado.
O hash bruto do indice Git mudou; seus bytes incluem cache estatistico que
nao representa alteracao de conteudo. Nao resetar indice/HEAD ou apagar estado.

## Correcao limitada

O novo `retomar-prod-titulos-adicionais-20261028.cjs` carrega a release
b4dc99d2194ad7e2e7eccf0f9adca4de275f14e4 pelo objeto Git e valida o SHA256 do
aplicador congelado ef19173d58704efcab26b58ed8b718ded4c33859d6db16f0637cfd3841830961.
Nao altera o arquivo do aplicador antigo nem seu manifesto. Executa as mesmas
funcoes originais de instalacao, QA, locks, estado privado, snapshots e restart.
Substitui somente workingCheck durante esta execucao, com as verificacoes:

- Mesmo HEAD e release; inventario/targets/backup/modos do estado conhecidos.
- Fontes atuais somente original ou release; fases posteriores exigem release.
- Entradas do indice (blob, caminho e modo), todas stage0, identicas a arvore do
  HEAD. Flags assume-unchanged/skip-worktree sao recusadas. Hash bruto deve
  continuar igual durante cada leitura. Nenhum comando regrava o indice.
- Mesmo delta permitido nos tres runtimes e mesmo hash das fontes fora do escopo.

QA precede restart. A fase `reiniciando` existente observa o resultado, nunca
repete um restart incerto. Somente backend-solicitacoes pode reiniciar uma vez;
DEV/Experience/daemon/nodes/env/dumps/heap4096 e NSDOCS OFF continuam protegidos.
Nenhum SQL, migration ou registro de negocio; SQLite QA somente em memoria.
Nao e uma nova geracao de titulos: titulos existentes e historico permanecem.

## Comandos manuais

O agente nao acessa a EC2. Usuario envia o retomador por stdin, na raiz PROD,
usando o Node PROD isolado24.22.1. Nao repetir preparar. Conferir SHA256 do
retomador entregue no chat. Com backup/timer/janela atuais confirmados, executar
`node - aplicar` com CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
CONFIRM_PROD_MAINTENANCE=SIM e CONFIRM_TITULOS_ADICIONAIS_PROD=SIM.

Depois, nova invocacao por stdin do mesmo retomador com `node - conferir`.
Usar esse retomador tambem para conferencia futura desta release, pois o
aplicador instalado original continua com a guarda de bytes original.
Esperado TITULOS_ADICIONAIS_BACKEND_PROD_PRONTO, phase aplicado, commit b4dc99d2,
old_space_mib4096, sql0, migrations0 e titulos_criados0. Codigo desconhecido,
fonte divergente, staged real ou outra fase impede retomada. Enviar somente
saida sanitizada se houver erro; nao remover locks nem repetir reinicios.
