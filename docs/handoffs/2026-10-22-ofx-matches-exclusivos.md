# OFX: movimentos exclusivos e codigo real do titulo

## Autorizacao e base

Implementar/testar em refactor/frontend, sem producao. Adicao do usuario:
numero do titulo no card Lancamento Fluxy. Agente unico, branch de trabalho
codex/ofx-matches-exclusivos-20261022 sobre DEVbc2c69ed84259e7e97914180b37b7855ec2eb1ab.
Main b6546229 somente leitura. Nenhum commit/push/deploy autorizado nesta etapa.
Checkout gerenciado promocao-financeiro-20261019/Fluxy; nao usar C:/Fluxy antigo.

## Mapa e arquivos

- Backend conciliacaoBancariaService: GET/listar e sugestoes manuais usam o mesmo
  escopo financeiro e filtro de movimentos usados (FK direta e inversa). Consulta
  candidatos exatos uma vez por conta/data/valor com sinal por requisicao; pool
  unico em meta.grupos_match, contagem integral e sugestoes de linha limitadas20.
  SELECTs e DTOs de titulo/sugestao incluem codigo real, sem gerar por ID.
- Novo conciliacaoGruposMatch: leitura global dos grupos visiveis em lotes100,
  pendentes e conciliados nao excluidos. Filtros/page_size nao podem esconder
  um concorrente do mesmo grupo. Primeiro pendente por ID recebe o candidato
  unico apos match confirmado. Alertas de estorno preservam o fluxo especifico.
- Confirmar mantem endpoint/payload/ACL/escopo, mesma conta/empresa/tipo/data/valor,
  cheques e uso legado. Revalida banco e movimentos sob locks ordenados e mesma
  transacao; principal e ordem historica continuam pela ordem do payload. Falha
  desfaz todo o conjunto; nao cria pagamentos, titulos ou novo saldo. Auditoria
  existente permanece apos commit, sem novo historico ao apenas preparar.
- Novo frontend conciliacaoAlocacao: projecao pura por movimento, reservas locais
  manuais/automaticas, exclusao de candidatos ja preparados, recalculo apos
  liberar e reserva fora da pagina. Dois movimentos parciais do mesmo titulo
  nao sao colapsados. Escolha manual multipla reserva todos os seus movimentos.
- FinanceiroConciliacao: usa projecao nos cards/consulta manual, verifica reserva
  novamente no clique, trava confirmacao simultanea por ref e desabilita lote
  enquanto houver preparacao manual. Resposta perdida/409 exige GET fresco,
  sem retry do POST. Respostas GET antigas nao substituem leitura mais nova.
- Codigo TIT real em sugestoes/opcoes/preparadas/confirmadas; movimentos de um
  mesmo titulo mostram o codigo uma vez no card conjunto. Sem codigo nao inventa.
  Header e card usam mesmos componentes/acoes; card empilhado abaixo de md para
  caber no celular. Corrigido indicador de progresso falso quando ambos IDs null.
- Novos QAs backend/scripts/validarOfxMatchesExclusivos.js e
  frontend/scripts/validarOfxMatchesExclusivos.mjs; packages so novo comando QA.
  Canonico Financeiro e quatro controles atualizados. outputs sao privados.

## Validacoes

- Backend service real em VM, mocks fail-closed de models/locks/transacao, sem
  DB/rede: 2/1,3/2, pool >20, consulta unica por grupo, pagina com primeiro pendente
  oculto, conta/data/sinal separados, codigo TIT nos SELECTs/DTOs, ambos vinculos
  legado/inverso, lotes100/100/5, parcial mesmo titulo, soma multipla/principal,
  lock ordenado, concorrencia mesmo banco/movimento, replay, rollback tardio,
  mudanca concorrente de valor/data/obra, ACL403/escopo vazio/conta negativa.
  Lote nao confirma ambiguos e apos escolha confirma apenas o remanescente.
- Frontend pagina/services/CSS reais com HTTP interceptado, Chrome1366/390:
  contagem2/1 e3/2, preparar/liberar/realocar e vazio excedente, TIT nas opcoes,
  preparadas e confirmadas, nenhum POST ao preparar, duplo clique bloqueado,
  409 e resposta perdida sem retry, somente leitura sem Usar/Conciliar.
  Helper cobre pagina oculta, >20, parciais e imutabilidade. Capturas em
  outputs/ofx-matches-20261022 revisadas; botoes do card dentro da viewport.
  Modal manual real tambem exclui reservas de outras linhas e prepara soma60+40
  sem POST, sem oferecer os dois movimentos ao proximo lancamento. Codigo TIT
  deduplicado no card conjunto e confirmado verificado pela troca de filtro.
- Regressoes: validarConciliacaoMatchesExatos, validarConciliacaoRendimentos,
  validarCarteiraChequesBaixaComposta, validarOfxObrasFinanceiro backend/frontend.
- Build frontend633 modulos/17,20s aprovado. Avisos preexistentes Browserslist e
  chunk >500kB; sem atualizar dependencias. Sintaxe e git diff --check aprovados.
- Documentacao599 Markdown/19 canonicos aprovada; ownership liberado.
- Nenhum banco/EC2/S3/Redis real foi acessado; concorrencia usa modelo em memoria,
  nao substitui homologacao do banco MySQL DEV com dados controlados.

## Limites e proximo passo

Preparar/realocar e estado desta tela, nao reserva persistida entre usuarios/abas.
Outro operador pode ver sugestao anterior ate atualizar; no POST o lock/revalidacao
impede confirmar o mesmo movimento duas vezes. Cancelar/recarregar nao deixa
reservas presas no banco. Todas as sugestoes exigem Conciliar ou lote explicito.
Nao amplia escopo: candidates continuam limitados as obras financeiras autorizadas.
Nao altera recebimentos parciais, valores, estornos, faturas, tarifas, transferencias,
cheques ou relatorios; sem DDL/migration/backfill, .env, flags, dependencias ou memoria.

Alteracoes ainda locais e nao commitadas. Aguardar autorizacao de commit/push DEV;
depois conferir remote/ff-only e publicar somente este pacote sem outputs. Atualizar
primeiro backend-dev (novo meta/codigo), depois frontend e homologar 2/1,3/2,
parciais e concorrencia em DEV. Nunca reiniciar backend-solicitacoes nem tocar main.

## Publicacao DEV autorizada em 22/10/2026

Usuario autorizou commit/push dos ajustes OFX e codigo TIT para refactor/frontend,
com comandos EC2 DEV, sem producao. Fetch confirmou HEAD/origin DEVbc2c69ed e
origin main b6546229. Pacote publicado somente por fast-forward, sem force e sem
outputs privados. Nenhum deploy/DB real executado pelo agente.

Novo ops/deploy/atualizar-dev-ofx-matches-exclusivos-20261022.sh recebe SHA completo
fixado e exige checkout DEV fisico/branch limpa, flock, PM2 online em8001 sem watch,
schema automatico desabilitado e identidade/schema readonly via helper DEV existente.
Exige basebc2c69ed ja presente no HEAD EC2 e HEAD ancestral do alvo; se EC2 estiver
anterior a essa base, parar e conferir a atualizacao anterior, sem contornar guardas.
Aceita somente runtime OFX (dois arquivos backend e dois frontend), nenhum delta
de migration/lockfiles e somente o novo comando de QA exato nos packages.

Antes do restart executa QAs isolados e verifica .env identico. Reinicia somente
backend-dev preservando ambiente PM2; confirma health8001 e identidade/schema
readonly novamente. Nao executa install/migration, update-env ou ajuste de memoria.
Novo backend/scripts/validarDeployOfxMatchesDev.js testa texto/ordem/negativas do
roteiro e compara packages pelo git, sem DB ou processos reais.

Teste manual DEV: 2 valores iguais/1 movimento deve mostrar1 compativel em ambos;
escolher em um retira do outro. 3 valores/2 movimentos deve mostrar2, depois da
escolha oferecer o restante em apenas uma outra linha, deixando a terceira vazia.
Confirmar exige clique explicito; liberar selecao recalcula. Conferir TIT real
nas opcoes/preparadas/confirmados, baixas parciais distintas do mesmo titulo e
consulta manual sem reutilizar movimentos. Testar somente dados controlados DEV.
Frontend depende do novo backend/meta; apos atualizar EC2, aguardar deploy Vercel
da refactor/frontend, abrir refactor-dev.jrfluxy.com.br e atualizar com Ctrl+Shift+R.
Nao repetir confirmacao se houver falha de rede: atualizar e conferir estado antes.

Validacoes de publicacao repetidas e aprovadas: QAs backend OFX/matches/rendimentos/
cheques/obras e frontend matches/modal/obras1366/390, build633/13,79s, guardas
puras/negativas/pacotes, Node/Bash/docs599/19/diff. Ajuste somente no harness UI:
timeout de navegacao45s para primeira compilacao fria do Vite; asserts/acoes
permanecem em12s. Sem mudanca de runtime durante esta publicacao.
Ownership liberado para commit/push exclusivo DEV; homologacao EC2 com operador.
