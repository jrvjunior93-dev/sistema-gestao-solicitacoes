# Promocao MAIN da reprogramacao parcial - 23/10/2026

## Autoridade, bases e escopo

Usuario confirmou teste DEV da reprogramacao parcial e digitacao do valor e
autorizou promover este ajuste e fornecer comandos EC2 de producao. Backup
recente conferido no Drive cifrado e timer ativo reconfirmados nesta conversa.
Agente unico, sem delegacao/PR. Branch codex/promocao-contrato-reprogramacao-main-20261023
criada da main8982855e006a332861aa3288abe1c3ccc6a5e631, integrando por merge o
DEVfee28b6dd33e1f6a4d5a6f453bb7b0fbb63aa662; nao substituir arvore MAIN por DEV.
Nenhuma EC2/SSH/DB/S3/Redis/baixa/estorno/reprogramacao real pelo agente.
Push main pode disparar deploy frontend Vercel; backend sera atualizado pelo
operador. DEV remoto intocado e outputs privados excluidos do commit.

Delta funcional exato: contratoSaldoReprogramacaoService e ReprogramarSaldoContrato.
Soma positiva ate o saldo livre (nao igualdade obrigatoria); sobra preservada,
historico do valor efetivo e restante, atualizar saldo/referencia na tela,
digitar texto sem mascara a cada tecla (formatacao no blur). ACL, locks,
idempotencia/replay persistente, rollback e limite24 continuam. Nenhuma mudanca
em valor/aditivos do contrato, parcelas/medicoes/baixas anteriores, motor de
calculo do saldo, dependencias/pacotes/locks/migrations, .env/flags/memoria.

## Integracao e operacao

Merge sem conflito funcional. Conflitos somente README Financeiro e ownership,
resolvidos mantendo registros de ambos os lados. Guardas/roteiros/handoffs
exclusivos main preservados. Runtime backend/src e frontend/src identico ao
DEVfee28. Novo roteiro PROD e QA proprios, sem reutilizar roteiro DEV.

ops/deploy/atualizar-producao-contrato-reprogramacao-20261023.sh:

- SHA completo, base MAIN8982855e, backup/timer SIM, timer systemd ativo,
  checkout main limpo/exato e flock. PM2 somente backend-solicitacoes8000,
  online/sem watch/DDL automatico e Node com suporte aos QAs atuais.
- Antes do ff-only: alvo remoto/ancestralidade do DEV homologado e instalado,
  manifests/locks/migrations/guarda antiga iguais; inventario somente dois
  runtimes, mesmos conteudos DEV e nenhum arquivo MAIN removido.
- Preflight readonly existente verificarFinanceiroProducao20261019 e
  verificarReenvioAutorizacaoProducao preservados: UUID/banco/TLS/JSON/schema,
  sessao12h, flags/PILOT/push/PM2/configuracao persistida. Nao envia notificacao.
- Testes isolados antes do restart, hash .env preservado, timer revalidado,
  somente restart backend-solicitacoes sem update-env ou DDL herdado. Health
 8000 e verificadores readonly finais; DEV nao recebe reinicio.

Sem migration nova ou runner DDL neste pacote. Exige atualizacao anterior
8982855e/schema ja concluida; se nao estiver, para antes de alterar checkout.
Nao contornar guardas, usar reset/down nem rodar migrations gerais. Se parar
apos ff-only e antes do restart, diagnosticar saida; reexecucao do SHA exato
e permitida sem operacao financeira automatica. Nada garante rollback do
banco/operacoes posteriores por voltar codigo; recuperacao exige plano proprio.

## Evidencias e limites

Novos QA PROD e Bash -n aprovados; blocos Node reais em VM, PM2 incorreto,
DDL/watch/porta, arquivo fora do escopo, runtime divergente e exclusividades
MAIN removidas bloqueados. Guardas de backup/timer/ancestralidade obrigatorias.
Dezesseis suites backend aprovadas nesta integracao: saldo/reprogramacao,
totalmente medido, gestao/vigencia/aditivos/aprovacao/retorno, medicao/favorecidos/
pagamento/recarga, ACL2304comparacoes/48rotas e guardas PROD/DEV/preflight/retomada.
Tres suites UI aprovadas em Chrome1366/390: saldo/cursor/retomada, marcacao GEO e
valor medido/pagamento. Build637modulos/10,80s; apenas avisos preexistentes de
Browserslist/chunk. Documentacao621Markdown/19canonicos, Node/Bash/diff,
inventario funcional de dois arquivos e igualdade runtime DEV conferidos.
Testes isolados nao substituem concorrencia MySQL real; usuario ja homologou
a funcionalidade no DEV. Sem migrations/dependencias ou operacoes reais.

## Proximo passo

Concluir validacoes, publicar merge main sem force, verificar SHA remoto e
DEVfee28 inalterado, fornecer comandos PROD com versao fixa. EC2/DDL/restart
nao executados pelo agente. Depois de backend/health e frontend main na Vercel,
conferir tela/saldo por leitura; nao criar reprogramacoes ou repetir pagamentos
reais apenas para smoke test de producao.
