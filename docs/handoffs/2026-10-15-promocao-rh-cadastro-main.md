# Promocao main: cadastro atual na solicitacao de pagamento RH

## Autorizacoes e ambiente

- Usuario homologou o ajuste em dev e autorizou promocao para main/comandos EC2
  producao. Backup recente no Drive cifrado e timer ativo confirmados nesta janela.
- Operador executou consulta real somente leitura: UUID de producao
  5ed4b970-009f-11f1-809c-0ad0e0c90c53, banco gestao_solicitacoes,
  EC2 em 6af7b1926e44de17eec1b2450b583968aa3d5a7d e nenhuma migration pendente.
- Main congelada: 6af7b1926e44de17eec1b2450b583968aa3d5a7d.
- Dev homologada: b9ef16e4474833cb7f95ab285caf3708faf5a468, contendo a correcao
  41a380c1 e o ajuste do deploy dev para porta real 8001.
- Sem delegacao, banco real, EC2, restart ou migration executados pelo agente.

## Preservacao e integracao

- Tag anotada local codex/snapshot-main-rh-cadastro-20261015-092223.
- Bundle completo, verificado, fora da EC2 e fora dos commits:
  outputs/releases/main-antes-rh-cadastro-20261015-092223.bundle.
- SHA256: 3BC5C9E86E89ED854B3E3B90DCB7303C88BA1BA2399B592667637CC0EE9AFBAF.
- Branch codex/promocao-rh-cadastro-main-20261015 criada de origin/main;
  merge preserva historicos main/dev. Quatro conflitos somente documentais nos
  registros workspace; removidos apenas marcadores, mantendo ambos os lados.
- backend/src e frontend/src identicos ao homologado. Scripts/hotfixes/documentos
  exclusivos de main preservados. Nenhuma alteracao de dependencias, migrations,
  arquivo de ambiente, flags/permissoes ou rotas.
- Worktrees sujos de outros trabalhos e outputs/ nao fazem parte da promocao.

## Escopo funcional

Modal de pagamento para autor e DP carrega base salarial/diaria e conta salario
atuais; atualizacao explicita conserva inputs, assinatura invalida conferencia
obsoleta, save/envio revalidam cadastro. Contas personalizadas e PIX legado nao
sao substituidos silenciosamente. Linhas/titulos ja enviados conservam snapshot;
sem recalcular pagamentos antigos. Detalhes no handoff de implementacao
2026-10-15-pagamento-rh-cadastro-atual.md.

## Deploy e seguranca

Novo script ops/deploy/atualizar-prod-rh-cadastro-20261015.sh para operador:
checkout main limpo, ancestrais congelados, npm ci, testes financeiros em memoria,
preflight de deploymentEnvironment=production, caminho PM2 backend-solicitacoes,
porta8000, host/UUID/banco de producao e schema atualizado. Nenhuma migration e
executada; pendencia estrutural bloqueia o restart.

Compara flags de troca de usuario por valor efetivo com o mesmo parser/default
do config/env, evitando falso bloqueio por AUSENTE versus false. Divergencia
funcional continua bloqueada. PAYMENT_OWNER_APPROVAL_MODE preservado e validado.
Nao copia/edita .env, nao habilita migrations, nao muda configuracoes ou concede
permissoes. Reinicia somente backend-solicitacoes e consulta health8000.
Backend-dev8001 permanece intocado.

validarDeployRhCadastroProducao.js executa os blocos reais em VM com mocks;
positivos/defaults equivalentes, negativos de flags/env/porta/processo/banco/schema,
ausencia de escrita no ambiente e URL de health verificados sem rede/EC2.

## Validacao

Todos aprovados no candidato integrado:

- validarRhPagamentoSolicitacao.js, validarRhPagamentoEnvioParcial.js e
  frontend/scripts/validarRhPagamentoCadastro.mjs: calculos, cadastro autor/DP,
  rascunho/privacidade, conferencia, idempotencia, revisao/rollback e snapshots.
- validarRhPessoalPorSolicitacao.js, validarRhConferenciaGuiada.js,
  validarRhConsultaSalario.js, validarSegurancaAcessoDireto.js: consulta/escopos,
  salario nominal, negativas de acesso/rotas e troca de usuario.
- validarTreinamentoEdicaoVideo.js e validarTreinamentoRastreio.js.
- validarDeployRhCadastroDev.js, validarDeployRhCadastroProducao.js,
  validarReleaseProducao20261013.js (fixture historica), node --check e bash -n.
- validarRhPagamentoSolicitacaoUI.mjs --cadastro: autor/DP, contas, preservacao
  do formulario, regressao de moeda, envio parcial e workspace 1366px/390px.
- validarRhPagamento50UI.mjs: tres modos desktop/mobile, previa sem escrita,
  save/conferido, falha/retry/duplo clique e exclusao propria.
- npm run test:navegacao e npm run build (frontend, 589 modulos).
- npm run test:docs (533 Markdown, 19 canonicos) e git diff --check.

Inventarios migrations/env/dependencias identicos a main; runtime igual ao dev.
Build apenas com avisos preexistentes de Browserslist/chunks grandes. Nenhuma
atualizacao de dependencia incluida para tratar os avisos de npm audit.
Ownership de edicao liberado para publicacao autorizada.

## Proximo passo e rollback

Publicar branch/PR para main com guarda do head. Conferir merge SHA/tree e
fornecer comandos fixados ao operador.
Frontend Vercel deve estar Production/Ready no SHA da main depois do backend;
homologar cadastro atualizado nos dois perfis e manter historico do enviado.

Se houver incidente, parar o fluxo e, em janela autorizada, retornar backend e
artefato Vercel ao commit base 6af7b192. Nao reverter schema, apagar dados, resetar
checkout ou alterar flags automaticamente. Preservar novos registros/historico.
