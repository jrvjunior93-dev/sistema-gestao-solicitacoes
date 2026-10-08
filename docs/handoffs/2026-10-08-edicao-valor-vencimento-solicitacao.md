# Edicao de valor e vencimento da solicitacao - 2026-10-08

## Estado

Implementacao local em `C:/Fluxy-refactor-frontend`, branch
`refactor/frontend`, sobre `118209c080f53b1b3ddef246bcf83f334a85e9b8`.
Usuario autorizou restaurar edicao do valor e da data de vencimento na
lista e nos detalhes e depois commitar na refactor/frontend e promover
somente este ajuste para main. Nao incorporar o commit DP 118209c0.
Sem migration, EC2 ou banco real.
`outputs/` foi preservado fora do Git.

## Causa e escopo

A lista atual renderizava moeda/data apenas para leitura e nao usava as
celulas editaveis legadas em `LinhaSolicitacao.jsx`. O detalhe nao tinha
acao equivalente. Backend, permissoes e endpoints ja existiam.

- `Solicitacoes/index.jsx`: lapis ao lado dos dois campos, tambem nos cards;
  modal fora da linha e refresh do registro pelo mecanismo existente.
- `SolicitacaoDetalhe/index.jsx`: botoes secundarios no topo; mesmo modal
  e recarga silenciosa dos dados/historico apos salvar.
- `components/solicitacoes/AcaoEditarDadosSolicitacao.jsx`: botao acessivel
  com propagacao de clique/teclado interrompida, sem navegar ao editar.
- `components/solicitacoes/ModalEditarDadosSolicitacao.jsx`: um campo por
  PATCH, ID/codigo fixados, trava sincrona de envio/fechamento, cancelamento
  sem escrita, no-op sem PATCH, rascunho preservado apos erro.
- `utils/solicitacaoEdicao.js`: permissoes distintas alinhadas aos handlers,
  valor brasileiro e data propria da solicitacao (nao a parcela da medicao).
- Teste UI e script no frontend/package.json; teste offline dos handlers
  reais no backend; README Solicitacoes e ownership.

## Impactos preservados

Nao houve modificacao de controller, rota, validador, permissao registrada,
modelo ou migration. As rotas existentes verificam permissao/obra e geram
historico, notificacao e realtime. O frontend nao muda status nem baixa
titulos; nao sincroniza titulos, parcelas de contrato, compras ou rateios.
O proprio modal informa essa fronteira. Valores de compras/contratos podem
ser posteriormente sincronizados pelos respectivos fluxos existentes;
esta entrega nao cria uma segunda regra para tais fluxos.

A lista arquivada continua somente leitura. O endpoint de vencimento
continua aceitando hoje/futuro em Sao Paulo ou limpeza. Data efetiva de uma
medicao pode permanecer na lista mesmo apos editar a data da solicitacao;
isso e explicado no modal e nenhuma parcela e alterada.

## Validacoes

- `npm run test:solicitacoes-edicao-ui`: paginas, componentes e servicos reais
  com HTTP simulado local; tabela/cards, teclado, mobile390, detalhes,
  superadmin/Admin GEO/permissoes separadas/consulta, total vs saldo,
  formato BR, cancelamento, envios repetidos, fechamento durante PATCH,
  erro/retry, recarga e medicao. Sem API externa ou banco.
- `node scripts/validarEdicaoDadosSolicitacao.js`: handlers/validadores
  reais em VM, permissoes, escopo de obra, campos isolados, limpeza,
  historico, notificacoes e realtime. Sem modelos/DB/rede.
- `npm run test:solicitacao-vencimento` aprovado no backend.
- Build frontend aprovado; avisos preexistentes de Browserslist/chunks.
- Diff check e documentacao validados. Screenshots locais do modal390 e
  cabecalho desktop inspecionados; nao versionar outputs/.

## Proximo passo

Homologar como superadmin e usuario com apenas uma das duas permissoes.
Testar uma solicitacao comum e uma medicao com data efetiva derivada.
Origem publicada na refactor/frontend: 397868009f8bb7409905af5d0ec11f0eff922d26.
Integracao por cherry-pick isolado na codex/solicitacao-edicao-main, baseada
na main 119e426e96502f5e94b687da133249a51893539c. Conflitos somente em
ownership e frontend/package.json: incluir apenas esta tarefa e seu teste,
sem o teste/implementacao de Pessoal do commit 118209c0.

Testes offline de edicao e vencimento, UI real simulada, navegacao, abas,
documentacao e build aprovados novamente na integracao. Codigo funcional
de Solicitacoes identico ao commit de origem; arquivos funcionais RH_DP e
backend/package.json identicos a main base. Usuario confirmou backup
conferido no Drive cifrado e timer ativo nesta publicacao. Publicar a main
por fast-forward, sem merge integral da refactor. Deploy EC2 nao foi pedido.
