# Consolidacao main com checkout de producao

## Autorizacao e diagnostico

Usuario mostrou HEAD main da EC2 em f123f9f0 e flags .env corretas:
DEPLOYMENT_ENV=production, DEV_USER_SWITCH_ENABLED=false,
PRODUCTION_USER_SWITCH_ENABLED=true. O codigo instalado nao tinha a nova flag.
Main remota 4f8f02f1 e f123f9f0 divergiam desde fe6d9c5c. Atualizar com reset
removeria Ticket conta/estorno; --ff-only recusava a divergencia.
Usuario confirmou consolidar ambos, preservando os quatro fluxos e testes.
Backup recente no Drive cifrado/timer ativo confirmados nesta mesma janela.

## Integracao e estado

Branch codex/consolidacao-main-ec2-20261013, criada de origin/main 4f8f02f1.
Merge real de f123f9f0ad4d2037a47cda5bfac040b51e7ac32f; nao squash.
Somente conflito documental OWNERSHIP_ATIVO.md, preservando os dois lados.
Nao alterar regras de visibilidade, permissoes nao solicitadas ou registros.
Nenhuma migration/dependencia nova; preservar schema e runner da main.
Outputs QA preexistentes fora do Git; nenhum acesso EC2/banco pelo agente.

Snapshot: tag backup/main-pre-consolidacao-20261013-4f8f02f1 e bundle completo
local tmp/main-code-backup-20261013-consolidacao/main-4f8f02f1.bundle verificado.
Main, origem f123 e arquivos de auditoria da EC2 devem permanecer recuperaveis.

## Validacoes e proximo passo

Backend Ticket Boleto/Pix/Conta, permissao independente de estorno, baixa/
estorno atomico, liquidacao rateada e 74 rotas financeiras aprovados.
Suites HTTP auth/MFA/CSRF/forja/ACL/auditoria/kill switch, flags, acesso direto
(2304 comparacoes), hardening e auditoria aprovadas. Escopo/regras RH aprovados
com getConnection bloqueado contra banco real. Runner de release e acesso aos
anexos da fila aprovados. UI de troca/retorno/rascunho/SSE, modal de titulo,
Ticket Boleto/Pix/Conta e fila/instrumentos/estorno aprovadas em desktop/celular.
Navegacao/abas aprovadas; build 586 modulos em 11,24s. Avisos preexistentes
de Browserslist e chunk >500 kB mantidos; nenhuma dependencia nova.
Arquivos funcionais de Ticket/estorno identicos a f123; troca/modal identicos
a main 4f8f02f1; migrations e manifestos/lockfiles sem diferenca.
Concluir commit de merge preservando f123; publicar PR de consolidacao para
main e usar metodo merge, nunca squash/rebase.
Conferir f123 e 4f8f02f1 como ancestrais da main final e os dois builds Vercel.

Deploy pelo usuario: branch main, arquivos rastreados limpos, backup do HEAD,
git merge --ff-only ao SHA exato publicado. Validar processo backend-solicitacoes
e flags .env, preflight somente leitura com UUID/producao e schema sem pendencias.
Nao executar --aplicar, migrate, seeds ou down. Restart somente producao com
overrides explicitos das tres flags; conferir health e flags efetivas sem segredos.
Nao alterar .env ja correto, nao copiar dev, nao reiniciar backend-dev.

Smoke autenticado pendente: SUPERADMIN com MFA/lista autorizada assume/retorna;
ADMIN/comuns negados. Ticket Conta/Boleto/Pix e Estornar sem Resolver preservados;
modal de titulo mantem rascunho em atualizacoes. Nao testar pagamentos reais
apenas para validar navegacao. Configuracoes/alvos de producao nao sao copiados.
