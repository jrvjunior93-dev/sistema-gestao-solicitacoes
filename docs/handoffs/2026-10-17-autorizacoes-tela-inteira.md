# Autorizacoes: area util e titulo em tela inteira - 2026-10-17

## Autorizacao e estado

- Usuario pediu ocultar area marcada nos prints (cabecalho geral/abas/banner),
  mesma visao para todos com acesso inclusive SUPERADMIN, abrir titulo em toda
  a tela com Anterior/Rejeitar/Aprovar/Proxima e obras com fundo destacado.
- Agente unico; base origin/refactor/frontend 9ef3b136, branch local
  codex/autorizacoes-tela-inteira-20261017, worktree performance-fila-dp.
- Implementacao inicialmente entregue sem commit/push; usuario autorizou agora
  publicacao somente na refactor/frontend e comandos de homologacao DEV.
  Sem EC2/RDS/PM2/.env/migrations reais executados pelo agente.
  Outputs preexistentes e outros checkouts preservados. Nada em producao.
- Evidencia anterior do operador: DEV9ef3b136/schema/sessao12h/health200,
  SQL MySQL4 obras/9 titulos em213ms. Isso NAO homologa os novos cursores abaixo.
  Auditoria MAIN: origens dos acordos3/4/5 RENEGOCIADO/saldo0; TIT-003948/3949/
  3950 abertos e fora dos acordos. Nao houve autorizacao para regularizar dados.

## Mapa e invariantes

- autorizacaoPagamentoPwa.js: regra de compactacao por rota e capacidade atual,
  independente de instalacao ou perfil. isAutorizadorPwa/resolverRotaInicial
  permanecem restritos ao autorizador nominal PWA para destino inicial.
  Layout.jsx consome o helper existente: nao precisa alterar layout global.
- FinanceiroAutorizacoesPagamento.jsx: sem PageHeader/banner, toolbar compacta
  com seletor de visao/refresh/Opcoes, passkeys/push somente para can_decide.
  Dispositivos recolhidos, configuracao nominal preservada. Visao inicial obras
  para todos; deep links de motivo/justificativa continuam no historico por lote.
- AutorizacoesPorObra.jsx: codigo vira botao de detalhe; checkbox continua
  independente. Filtro/obra capturados na abertura. Polling pausa durante detalhe.
  Selecao entre obras/paginas preservada, remove apenas titulo decidido.
- AutorizacaoTituloDetalhe.jsx: ModalPortal reutilizado para rolagem/Escape/foco,
  fullscreen especifico sem mudar outros modais. Root inert enquanto ativo,
  foco ciclico, safe areas, corpo rolante e rodape fixo com quatro acoes.
  Dados do dossie + saldo/status/justificativa atuais; sem formulario de edicao.
  Anexos pelo callback de presign/visualizador existente, sem novo acesso amplo.
- Aprovar/rejeitar usam prevalidacao GET, conferencia explicita e contrato
  passkey/POST existente somente com ID atual. Duplo clique trava por ref;
  INVALIDADO/erro nao vira sucesso. Role, paused, saldo ou passkey ausente
  desabilitam a decisao. Nenhum autoavanco/decisao automatica por navegar.
  Motivo nao enviado e descartado ao navegar/fechar, sem dirty orfao no workspace.
- pagamentoAutorizacaoConsultaService.js: somente extensao de leitura GET com
  cursor parametrizado por vencimento atual+ID (mesma ordem da lista). Anterior
  inverte ordem e retorna vizinho imediato. Null antes de datas conforme MySQL.
  Cursor funciona mesmo apos atual sair do filtro, sem OFFSET crescente ou lista
  integral em memoria. ACL/modes permanecem antes da consulta no servico existente.
  Sem novas rotas, POSTs, permissao, dependencia, snapshot ou migration.
- verificarPainelAutorizacoesDev.js: exercita ambos sentidos no DEV, sem alterar
  config/schema/processos, rejeita producao. Deve ser repetido apos publicacao.
- CSS restrito a autorizacoes; superficie das obras usa ui-surface, fontes e
  tokens corporativos preservados. Nao aplicar este shell em outras rotas.

## Validacoes locais

- Backend painel/negativas/ACL/1001lotes, SQL real da CTE em SQLite memoria:
  650titulos/150obras, cursor bidirecional, vencimentos distintos/null, bordas,
  pagina reduzida apos50 quitacoes sem pular os proximos; sem SQL de escrita.
  SQLite Node24 nao substitui MySQL/EXPLAIN DEV.
- Autorizacao proprietario e analise real com models/biometria simulados:
  segregacao, replay, concorrencia, paid/partial protections e snapshots.
- UI por obra: selecao130/varias paginas/obras e fluxo de lote parcial anterior;
  fullscreen390/768/1366, anterior/proxima sem POST inclusive apos conferencia,
  cruzar pagina, aprovar um sem afetar selecao geral, rejeitar com motivo,
  doubleclick, INVALIDADO/quitacao concorrente, readonly/no passkey/paused,
  anexos empilhados/Escape, root inert/foco e retorno com selecao preservada.
- Shell real PWA Android/iOS/navegador: capacidades leitor/preparador/configurador
  SUPERADMIN, area util, modos/passkey/tema/saida, guardas e outras rotas.
- Polling serial/backoff e navegacao/abas aprovados. Shell PWA/rota inicial,
  UI final fullscreen e build613 modulos aprovados. Docs539 Markdown/19
  canonicos e diff sem erros. Avisos preexistentes de Browserslist/chunk grande
  e trinco ModuloRelatorios nao foram alterados nesta tarefa.

## Proximo passo exato

- Implementacao e verificacoes locais concluidas, reserva liberada. Entregar resultado local;
  nao dizer que DEV/producao ja receberam este pacote.
- Publicacao autorizada: revisar e commitar apenas este pacote backend+frontend
  na refactor/frontend, sem force, verificando parent/tree e main inalterada.
  Informar SHA publicado na entrega. Nenhuma migration nova.
- No DEV, guardas de identidade/schema/flags/processo/sessao existentes, executar
  verificarPainelAutorizacoesDev.js --verificar, reiniciar somente backend-dev,
  health8001. Validar celular real/browser e SUPERADMIN leitor sem bypass.
- Nao alterar main, pagamentos, arquivos antigos da SOL-5419, TLS ou PILOT.

## Roteiro DEV para a publicacao autorizada

- Validar checkout/caminho refactor/frontend e arquivos rastreados limpos;
  lock exclusivo, fetch e fast-forward para SHA fixado na entrega.
- npm ci --omit=dev no backend. configurarSessao12hDev.js --verificar confere
  identidade do banco, processo backend-dev/8001, schema e flags sem gravar.
- Testes locais backend painel e autorizacao-proprietario nao usam banco real.
  SQL local SQLite e opcional/Node24; nao e requisito para EC2.
- timeout60s node scripts/verificarPainelAutorizacoesDev.js --verificar executa
  EXPLAIN do painel e consultas reais, incluindo logs cursor_dev ANTERIOR/PROXIMA.
  Se nao houver dossies no DEV, logs de cursor nao aparecem e a prova com dados
  fica pendente. Nao criar dados por SQL para contornar.
- Reiniciar apenas backend-dev depois das validacoes; revalidar sessao12h e
  health8001 HTTP200. Nenhuma migration, .env, main ou backend-solicitacoes tocados.
