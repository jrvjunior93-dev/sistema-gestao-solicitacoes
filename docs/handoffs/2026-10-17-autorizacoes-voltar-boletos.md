# Autorizacoes: voltar do aparelho, area util e boletos - 2026-10-17

## Escopo e estado

- Usuario relatou retorno ao Inicio pelo aparelho e pediu retorno hierarquico.
  Depois pediu ocultar a area marcada dentro da obra, corrigir o campo/menu
  cortado e conferir que somente campos de boleto alimentam a lista da fila.
- Agente unico, worktree performance-fila-dp, branch
  codex/autorizacoes-voltar-aparelho-20261017 baseada na refactor/frontend
  publicada 9b960708. Usuario autorizou agora commit/publicacao somente na
  refactor/frontend e comandos para atualizar EC2 DEV, sem operar producao.
- Nenhuma conexao real ao banco, EC2, PM2, S3, .env, migration ou producao.
  Outputs preexistentes preservados; evidencias QA somente em outputs/.

## Mapa das alteracoes e invariantes

- useAutorizacaoHistorico.js: entradas React Router na mesma rota com tokens
  opacos; estados de obra/detalhe em cache de sessao do workspace, limitado
  a128 entradas. Sem nomes/snapshots no history.state ou URL. A etapa pai e
  preservada mesmo apos centenas de aberturas na obra. Outra obra substitui
  a etapa da obra; abrir titulo cria etapa filha. Anterior/Proxima
  do titulo nao empilham historico. POP/Forward reconstroem a etapa e o detalhe
  faz a GET de revalidacao existente antes de habilitar decisao.
- AutorizacoesPorObra.jsx usa esse historico em abrir/fechar/voltar/filtrar.
  Selecao e paginas continuam nos slots existentes, sem decisao por navegacao.
  AutorizacaoTituloDetalhe.jsx informa consulta/operacao ocupada ao pai.
- Layout.jsx prioriza a etapa interna antes do fallback do workspace no
  botao nativo e facade. ModalPortal acrescenta dono opcional sem mudar o
  fechamento padrao de outros modais. POP capturado apenas pelo componente
  montado repoe a entrada EXISTENTE durante operacao ou fecha anexo superior.
  Sem pushState bruto, entradas extras para restauracao ou POST novo.
- Reload sem cache vai para obras; nunca restaura snapshot sensivel do disco.
  Sem alteracao das rotas, ACL nominal, passkey, PILOT ou financeiro.
- CSS mobile: esconder toolbar/resumo somente quando a obra esta aberta;
  manter voltar/checkboxes/selecao e decisao explicita. Opcoes ancora ao
  toolbar e nao ao botao que pode quebrar de linha. Conta conserva ancoragem.
  Situacao em linha inteira evita cortar Aguardando aprovacao em320px.
- Auditoria dos uploads: NovaSolicitacao grava BOLETO; solicitacao de compra
  normal gera titulos/boletos pelo pedido. PedidoFinanceiro ja espelha compra/
  frete com BOLETO_COMPRA/BOLETO_FRETE em transacao e conserva idempotencia.
- Encontrada lacuna na compra direta: anexarArquivosCabecalhoSolicitacao em
  SolicitacaoCompraController gravava TUDO como ANEXO, ate campo BOLETO.
  Corrigida classificacao da gravacao nova pela origem explicita. Anexo
  comum/nota fiscal continuam ANEXO, mesmo que o nome contenha boleto.
  compraDiretaGestaoService.anexarBoletoFrete corrigido para BOLETO_FRETE.
  Preservadas validacoes de upload, ACL, escopo, auditoria e replay existentes.
- Nao reclassificar legados por nome/extensao. Dossies assinados e seus
  documentos nao sao alterados; lista de boletos da fila e um fluxo distinto.

## Validacao e proximo passo

- Suites locais com APIs/modelos isolados: test:autorizacoes-obras,
  test:autorizacao-pwa, test:boletos-pedido (front e back),
  validarCompraDiretaGestao.js. Incluem BrowserRouter/WorkspaceView/Layout reais,
  callback do botao nativo, Back/Forward/reload, anexo superior, ocupacao,
  selecao preservada, ACL, passkey e duplo clique. Sem dispositivo fisico.
- Provas visuais em outputs/autorizacao-pwa-20261008:
  opcoes-inteiras-320.png, opcoes-inteiras-390.png, obra-aberta-compacta.png.
  Testes medem viewport do menu e texto completo do status selecionado.
- Tambem aprovados: build frontend (614 modulos), test:navegacao,
  test:tela-inicial, test:polling-seguro, test:docs backend e node --check nos
  dois arquivos backend alterados. Avisos preexistentes de Browserslist,
  chunk maior que500KB e fonte unica de ModuloRelatorios nao sao falhas.
- Proximo passo autorizado: revisar diff, commitar/publicar
  somente refactor/frontend e homologar no DEV. Sem migration nova. Confirmar
  no Android/iPhone: titulo -> lista da obra -> obras; menu inteiramente visivel;
  boleto de compra/frete novo visivel na fila e anexo comum ausente da lista.
- Arquivos antigos classificados ANEXO nao aparecem automaticamente como
  boleto. Qualquer regularizacao exige auditoria por origem e pedido separado;
  nunca aplicar alteracao em massa em producao a partir desta correcao.

## Roteiro DEV da publicacao

- Checkout /home/ubuntu/sistema-gestao-solicitacoes-dev, branch
  refactor/frontend, arquivos rastreados limpos e flock exclusivo no deploy.
- Fetch e fast-forward para o SHA exato informado na entrega; parar se HEAD
  divergir, sem reset/stash e sem apagar arquivos locais de auditoria.
- npm ci --omit=dev no backend; configurarSessao12hDev.js --verificar confere
  UUID/host DEV, processo backend-dev/8001, schema e sessao. Somente leitura.
- Testes backend de boletos e compra direta usam dependencias em memoria.
  verificarPainelAutorizacoesDev.js --verificar faz SELECT/EXPLAIN reais
  somente no DEV, incluindo cursores quando houver dossies. Sem dados novos.
- Reiniciar apenas backend-dev --update-env; conferir sessao novamente e
  health8001 com retries. Nenhuma migration nova ou alteracao de .env/flags.
- Frontend e Vercel: aguardar o deployment da refactor/frontend ficar Ready
  e recarregar o navegador/PWA. Sem build frontend ou restart da producao EC2.
