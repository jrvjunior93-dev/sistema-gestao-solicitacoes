# Destaques e prioridade operacional das solicitações

Pedido aprovado nesta conversa: separar atividade/leitura/acompanhamento e
priorizar aprovar retorno para GEO, com legenda. Trabalho isolado na branch
codex/solicitacoes-destaques-geo, base origin/refactor/frontend720d4acd.
Sem commit/push/deploy solicitado nesta etapa. Sem EC2/banco/migration.

Alterações: SolicitacaoController somente contexto/resumo/ordenacao SQL;
service puro solicitacaoFilaOperacional; AtencaoPendente só leitura; novos
AtividadePendente/LegendaDestaques; index/LinhaSolicitacao; estilos semânticos;
testes específicos e regressões ajustadas. Nenhum endpoint de decisão, envio,
anexo, leitura ou financeiro alterado. Campo legado retorno_solicitado_pendente
preservado na API; atividades_pendentes e acompanhamento_setor são aditivos.

GEO recebe amarelo/Aprovar retorno somente com permissão de decidir e setor
principal atual (aliases normalizados); SUPERADMIN conserva exceção existente.
Sem SLA para retorno, sem vermelho fictício. Entregas de outro setor não viram
trabalho do GEO. Vermelho usa apenas atrasos dos controles operacionais reais.
Leitura atualiza somente o azul. Pedido de retorno conserva prioridade até
decisão/cancelamento/expiração/saída do setor. Prioridade é SQL antes de paginar.

Pontos de integração revisados: listagem paginada e legada, resumo individual,
eventos INTERACTIONS_READ/RETORNO_*/SENT_TO_SECTOR/PURCHASE_DELIVERY_UPDATED,
ACL retorno.decidir/setor principal, relógio de entrega e contadores já existentes.
Resumo individual agora também recebe usuário para não perder metadados no
refresh de uma linha. Pedidos são ordenados pela entrada mais antiga, sem
promover acompanhamento por updatedAt. Código financeiro/solicitações/S3 intacto.

Testes: 6 testes de domínio/SQL executável SQLite passaram, incluindo pedido
que estava fora da primeira página; interações backend e ciclo retorno passaram.
UI de interações/telas reais passou: leitura individual,403 preserva marcador,
retorno independente, atalhos/teclado/desktop/mobile. Mock col/fn da regressão
de retorno estava defasado para NotificacaoController da base e foi atualizado
somente no teste. Tailwind dos fixtures aponta config explícita da aplicação.
UI nova validou tabela/cards, claro/escuro, cores CSS, fuso DATE, ausência de
rolagem horizontal mobile e ações sem propagar clique/Enter para a linha.
Build passou (15,64s; apenas avisos já existentes de Browserslist/chunks).

Limites: não existe catálogo completo de atividades por tipo/SLA novo. Esta
etapa reconhece retornos e entrega já rastreada; novos tipos exigem mapeamento.
SQL testado localmente em SQLite, não executado contra MySQL/produção. Regras
de entrega/tolerância existentes preservadas, nenhuma obrigação criada/encerrada.
Fotos de QA usam dados fictícios, não evidência de produção.

Próximo passo: publicar somente após autorização do usuário para commit/push.
Conferir origin/refactor/frontend novamente antes de integrar, preservar demais
agentes. Backend e frontend juntos; sem migration/restart pelo agente.

Encerramento local: UI nova passou com cores computadas nos2temas, mobile sem overflow e atalho Enter isolado; regressao UI de interacoes/telas completas passou; backend SQL/dominio6casos, interacoes e retorno passaram. Documentacao valida698MD/19canonicos. Build final registrado em outputs/destaques-solicitacoes-20261029/build.log. Screenshots4temas/tamanhos na mesma pasta. Sem commit/push/publicacao. Ownership de edicao liberado; manter worktree com delta e artefatos para integracao autorizada.

## Publicacao DEV autorizada

Usuario autorizou commit/push refactor/frontend e comandos para EC2DEV. Fetch
confirmou mesma base720d4acd, sem conflito. Preparado novo aplicador exclusivo
DEV em ops/deploy/atualizar-dev-destaques-solicitacoes-20261029.cjs, teste,
manifesto e README. Derivado do operador de titulos-adicionais da mesma base,
mantendo guardas/backup/snapshot/ambientes/Nodes/heap/idempotencia. Runtime
fechado em SolicitacaoController.js e solicitacaoFilaOperacional.js; QA e
infra de teste sem rede. Conteudo de controller a35a2139 e720d4acd conferido
identico para suportar checkout DEV com HEAD antigo e arquivos isolados.

Aplicador passou10testes locais: manifesto/hashes, inventario, dependencias,
somente restart DEV, preservacao de pares/dumps/systemd, retomada incerta sem
novo restart e recusa de fonte antiga/fora de escopo. TresQAs do aplicador
executados com preloader semRedeQa aprovados. Sem migrations ou install.
Frontend segue Vercel; depois de backend pronto e build da branch, homologar.
