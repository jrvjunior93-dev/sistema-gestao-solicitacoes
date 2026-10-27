# Autorizacao PWA: botoes individual e coletivo - 2026-10-24

## Escopo e base

Usuario autorizou implementar/testar para refactor/frontend, sem producao.
Checkout de continuidade: `promocao-financeiro-20261019/Fluxy`, branch auxiliar
`codex/retirada-envios-dev-20261023`, HEAD d37d722e, igual a origin/refactor/frontend.
O checkout antigo C:/Fluxy-refactor-frontend possui outros trabalhos/documentos;
nao foi atualizado, alterado ou usado como base desatualizada.
Sem delegacao, commit/push, main, EC2, banco real, migration, PM2 ou Node alterados.

O relato de apenas um enviado pelo fluxo coletivo NAO foi reproduzido como
falha transacional: testes existentes aprovam 130 itens entre lotes/obras com
uma passkey. Foram reproduzidas ambiguidade de rotulos e acao coletiva escondida
apos todos os artigos. A autorizacao no detalhe e intencionalmente individual.

## Mapa de impacto preservado

- Selecionar/reconciliar continua por titulo, entre obras/paginas; snapshot e
  assinatura revalidados antes de decidir. Nenhuma aprovacao ao navegar/conferir.
- ACL `caps.can_decide`, autorizador nominal, escopo, pausa, passkey cadastrada,
  estado/saldo do titulo, fila existente e protecoes backend sem alteracao.
- Coletivo: POST painel/selecao/autenticacao/opcoes, uma passkey, POST
  painel/selecao/autorizar; transacao, desafio, locks e idempotencia existentes.
- Individual: endpoints lote/:id/autenticacao/opcoes e lote/:id/decidir existentes,
  um unico item. Nao converter automaticamente decisao individual em coletiva.
- Retirar envios, rejeitar saldo, parcelas/baixas, historico e documentos intactos.

## Arquivos da tarefa

- frontend/src/components/financeiro/AutorizacoesPorObra.jsx: lista interna rolavel,
  rodape com acao `Autorizar selecionados (N)`, conferencia focada com total/contagem.
- frontend/src/components/financeiro/AutorizacaoTituloDetalhe.jsx: rotulos e aviso
  explicitos de autorizacao individual, sem absorver a selecao externa.
- frontend/src/styles/financeiro-autorizacoes-pagamento.css: painel flexivel,
  rodape fora da rolagem, safe-area, foco e encaixe do rotulo individual no celular.
- frontend/scripts/validarAutorizacoesPorObra.mjs: seletores atualizados; conservar
  testes 130 itens, ACL, cancelamento, duplicidade, falha/reconciliacao e historico.
- frontend/scripts/validarAutorizacaoPwa.mjs: shell/rotas reais, APIs e biometria
  simuladas; toque/standalone Android/iOS, 320x568/390/768/1366, dois selecionados
  em lotes diferentes + terceiro aprovado individualmente; selecao dos dois
  preservada, uma passkey/POST coletivo apesar do duplo clique; demais pendentes.
- docs/modulos/financeiro/README.md e este handoff.
- docs/workspace/OWNERSHIP_ATIVO.md: apenas secao desta tarefa. Nao incorporar
  automaticamente o delta anterior do arquivo numa publicacao futura.

## Validacoes

- UI por obra: aprovado, 130 itens/uma passkey e regressoes isoladas.
- Backend validarAnaliseProprietario.js: aprovado, incluindo transacao coletiva,
  falha no segundo lote com rollback global, concorrencia/replay e ACL.
- UI PWA completa: aprovada com toque e modo standalone Android/iOS simulados,
  320x568/390/768/1366, hit-testing do botao antes/depois de rolar a lista,
  conferencia com foco e confirmacao no viewport, individual + coletivo separados.
  Desktop/tablet de duas colunas mantem filtros acima; o teste posiciona o painel
  na pagina externa antes de verificar a acao, sem percorrer os artigos.
- UI retirada: aprovada em StrictMode/1366/390, sem conceder poder de decidir.
- validarDatasObservacoesAutorizacao.mjs e git diff --check: aprovados.
- test:docs: falha PREEXISTENTE, documento de autenticacao ainda cita 399
  permissoes, catalogo atual tem 401; ambos identicos ao HEAD e fora deste delta.
  Nao alterar matriz nem documento de seguranca incidentalmente nesta tarefa.
- npm --prefix frontend run build: aprovado (648 modulos). Prebuild gerou
  catalogo sem delta versionado. Avisos preexistentes de Browserslist antigo,
  Tailwind no harness e chunk >500kB; nenhum erro de compilacao.

## Pendencias e proximo passo

QA visual inspecionado em screenshots de selecao, conferencia e individual.
O teste de tela curta encontrou conteudo encoberto pelo resumo fixo; corrigido
movendo resumo/selecao para a area rolavel, mantendo so voltar e acoes fixos.
Build final aprovado e git diff --check limpo. Ownership funcional liberado;
delta segue local nao commitado para publicacao futura apenas se autorizada.
Publicacao depende de pedido explicito; nao ha migration ou backend novo.
Depois de autorizado e publicado em DEV, homologar no aparelho real do
proprietario, distinguindo detalhe individual de selecao coletiva e conferindo
quantidade/total antes da biometria. Nunca testar aprovando titulos em producao
sem autorizacao especifica e controle operacional.

Preservar arquivos Node24, handoff/README Node, diagnostico e outputs anteriores
nao commitados neste checkout. Nenhum desses arquivos pertence a este delta.

## Publicacao DEV autorizada

Usuario autorizou commit/push na refactor/frontend e comandos de atualizacao DEV.
Publicar somente os cinco arquivos frontend listados, README financeiro e este
handoff. OWNERSHIP_ATIVO.md tem outras reservas locais; nao entra no commit.
Base remota reconferida d37d722e; main permanece a860f94a.

Este delta nao muda backend, migrations, dependencias, flags ou autenticacao.
A Vercel publica a tela DEV a partir da branch. A EC2 NAO necessita reinicio
ou migration. Sincronizacao opcional do checkout deve exigir caminho DEV exato,
branch refactor/frontend, arvore versionada limpa, ancestralidade fast-forward,
alvo fixado no commit publicado e backend identico entre HEAD/alvo. Se houver
backend pendente, parar e pedir a saida sem segredos; nao executar runner antigo
nem pular protecoes. Nunca usar PM2 save/update/restart, --update-env ou trocar
Node neste ajuste. Os Nodes isolados e os dumps persistidos nao sao tocados.

Homologacao apos deploy Vercel: fechar/reabrir o PWA DEV, entrar com autorizador
nominal real (nao Testar usuario), marcar dois titulos de teste na mesma obra,
conferir botao N=2/total e confirmar uma biometria; ambos devem ir a fila.
Nao selecionados permanecem pendentes. Conferir que detalhe individual afeta
so o aberto e conserva os demais marcados. Repetir em toque com lista longa e
usuario sem permissao; cancelar antes da biometria nao deve enviar nada.

QA repetidos para publicacao: UI por obra (130 itens/uma passkey), PWA completo
com toque/standalone e fluxo individual+coletivo, retirada StrictMode, backend
transacional e build648 aprovados novamente; diff --check limpo. A divergencia
documental399/401 continua preexistente e fora do delta. Sete arquivos no escopo
do commit; envio remoto exclusivo refactor/frontend, sem force. Conferir SHA
remoto e status Vercel apos o push. Nao executar EC2 ou aprovacao real pelo agente.

Skill frontend-design usada para responsividade/toque, rotulos explicitos e
foco da conferencia, subordinada ao padrao operacional existente do Fluxy.
Nao houve redesenho estetico, aprovacao real nem teste de passkey em aparelho
fisico. Capturas em outputs/autorizacao-pwa-20261008/pwa-{selecao-acessivel,
conferencia-coletiva,autorizacao-individual}-*.png; outputs fora do commit.
