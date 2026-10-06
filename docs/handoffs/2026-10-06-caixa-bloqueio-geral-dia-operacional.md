# Caixa diario — bloqueio geral e virada de expediente

## Pedido autorizado

Aplicar bloqueio total somente aos responsaveis configurados quando a flag esta
ativa. Com caixa anterior aberto, fechar primeiro e abrir hoje. Caixa aberto e
fechado corretamente hoje cumpre a rotina ate o fim do mesmo dia, mas a conta
fechada nao aceita baixas. Na virada do dia, nova abertura obrigatoria mesmo com
o navegador aberto. Mostrar orientacao no topo e manter regularizacao acessivel.

## Implementacao

- `backend/src/services/caixaDiarioConfigService.js`: avaliacao por conta ativa
  marcada, data operacional America/Sao_Paulo, estados de abertura, fechamento
  anterior, divergencia e data futura. Flag desligada, usuario nao responsavel e
  SUPERADMIN nao sofrem bloqueio geral. Fechar um caixa antigo hoje nao substitui
  uma abertura de hoje. Nenhuma nova chave, tabela ou migration.
- `backend/src/middlewares/controleDiarioFinanceiro.js` e `backend/src/routes.js`:
  HTTP 423 em todas as rotas autenticadas de negocio, apos autenticacao/MFA.
  Excecoes explicitas para sessao e regularizacao (listagem de contas, painel,
  sessoes, abertura, fechamento, movimentos, estorno e decisao de divergencia).
  Guards originais preservados, sem conceder permissoes. Endpoints publicos de
  login, cotacao de fornecedor e webhooks preservados.
- `GET /auth/controle-diario-contas`: estado do proprio usuario, sem cache HTTP,
  com data operacional e relogio do servidor. Nao altera configuracao ou dados.
- `backend/src/services/financeiroCaixaSessionHelper.js`: data padrao usa Sao
  Paulo; protecao existente da conta fechada e locks das movimentacoes mantidos.
- `frontend/src/components/ControleDiarioCaixa.jsx` e servico correspondente:
  nao montam a pagina operacional sem verificar o estado. Aviso corporativo
  compacto no topo e redirecionamento para Caixa e Contas. Sem acesso granular a
  essa pagina, informa necessidade de permissao, sem loop ou concessao implicita.
  Revalidacao a cada 30 segundos, retorno a janela, eventos de caixa e deteccao
  da virada a cada segundo. Relogio do servidor ajusta o dia do navegador.
  Erro de verificacao suspende o conteudo e permite tentar novamente.
- `frontend/src/layout/Layout.jsx` e `frontend/src/services/api.js`: gate envolve
  conteudo; respostas 423 notificam o gate sem consumir o corpo da resposta e
  mutacoes bem-sucedidas de caixa provocam revalidacao. Logout continua acessivel.
- `frontend/src/utils/dataOperacional.js`, `FinanceiroCaixas.jsx`: data da rotina
  alinhada com Sao Paulo, sem alterar fluxos de comprovante/ajuste/fechamento.
- `ConfiguracoesControleDiarioContas.jsx` e documentacao do modulo: textos
  atualizados para o bloqueio geral, fechamento no mesmo dia e nova abertura.

## Validacoes locais

- `node backend/scripts/validarControleDiarioGeral.js`: aprovado; fixtures em
  memoria, sem banco. Estados de agosto, fechamento antigo hoje, fechamento de
  hoje, novo dia/fim de semana, divergencia, data futura, varias contas, flag,
  responsavel, superadmin, invalidacao de cache, HTTP 423, allowlist e locks.
- `node backend/scripts/validarCaixaFisico.js`: aprovado.
- `node backend/scripts/validarPermissoesFinanceiroRota.js`: aprovado, 72 rotas.
- Em `frontend/`, `node scripts/validarControleDiarioCaixa.mjs`: aprovado no
  Edge headless, componente/estilos reais. Conteudo bloqueado por URL, acesso ao
  caixa, desbloqueio, fechamento hoje, virada sem login, flag desligada, usuario
  nao sujeito, superadmin, falta de permissao, divergencia, falha/retry e eventos
  do wrapper de fetch. Capturas claro/escuro/celular inspecionadas em
  `qa/evidencias/controle-diario-geral-2026-10-06/` (ignorado pelo Git).
- `node scripts/validarCaixasLayout.mjs`: aprovado; fluxos reais existentes de
  abertura/fechamento, duplo envio, ajustes, comprovantes, estorno, OFX e permissao.
- `node scripts/validarNavegacao.mjs` e `node scripts/validarAbasInternas.mjs`:
  aprovados, 219 rotas e 216 destinos de navegacao preservados.
- `npm run build` em frontend e `git diff --check`: aprovados. Avisos ja existentes
  de Browserslist desatualizado e bundle grande; sem atualizar dependencias.

## Ativacao e riscos operacionais

Nao e variavel de ambiente. Em Configuracoes > Controle diario de contas e caixa
(`/configuracoes-controle-diario-contas`), selecionar responsaveis, marcar
"Bloquear o sistema enquanto houver rotina de caixa pendente" e salvar.
Persistencia: `FINANCEIRO_CAIXA_DIARIO_CONFIG`. Conferir que somente a conta
pretendida esta ativa e marcada `exige_abertura_fechamento=true`.

Antes de ativar, conferir permissoes de visualizar, abrir e fechar caixas;
movimentar/estornar somente se necessario. Divergencia exige outro aprovador com
`financeiro.caixas.decidir_divergencia`, sem autoaprovacao. Contas bancarias com
OFX previo pendente podem exigir apoio de operador nao bloqueado. O superadmin
mantem acesso para suporte. Invariante da conta fechada impede movimentacao que
exige sessao aberta independentemente do bypass do bloqueio geral.

Nao foi consultado o banco de producao para confirmar o caixa de 17/08/2026.
Se ainda estiver aberto na conta marcada, ativar a regra para o responsavel
exigira seu fechamento e abertura de hoje. Nao ha encerramento automatico,
alteracao de saldo ou baixa gerada por esta mudanca.

## Estado e proximo passo

Implementacao local no worktree `promocao-main-20261003`, branch main, baseada em
70b33f84. Sem commit/push/deploy, reinicio EC2 ou ativacao da configuracao nesta
tarefa. Ownership de edicao liberado ao concluir. Aguardar autorizacao para
publicar o conjunto e homologar com usuario responsavel em ambiente atualizado.
Atualizar backend e frontend juntos antes de ativar a regra.

Em seguida, em 06/10/2026, o proprietario autorizou commit/push deste conjunto
junto ao retorno de solicitacoes. Worktree ja em main; ativacao da configuracao,
homologacao operacional e atualizacao EC2 continuam pendentes e fora deste passo.
