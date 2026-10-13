# Solicitacoes: filtros no retorno e Ctrl+clique - 2026-10-13

## Pedido e estado

Implementacao local concluida para preservar filtros ao abrir/voltar e abrir
uma solicitacao em nova aba com Ctrl+clique. Sem autorizacao de commit/push
nesta tarefa; nenhuma publicacao, migration, banco real ou deploy executado.
Worktree reutilizado `promocao-main-20261003/Fluxy`, branch
`codex/pedido-boleto-opcional-refactor`, base publicada `add83df9` em
`origin/refactor/frontend`. `outputs/` preexistente e resultados de QA ficam
fora do pacote; outros checkouts preservados.

## Mapeamento e arquivos

- `frontend/src/pages/Solicitacoes/index.jsx`: snapshot para ids/visao do Hub;
  restauracao complementar da consulta; links reais nos codigos da tabela e
  dos cards; evento modificado na linha abre navegador, comum mantem fluxo.
- `frontend/src/pages/Solicitacoes/consultaSessao.js`: projecao permitida da
  consulta em sessionStorage, separacao ativas/arquivadas, comparacao de
  usuario/escopo e prioridade dos filtros explicitos de URL. Sem DTO/credencial.
- `frontend/src/components/lista-avancada/ListaAvancada.jsx`: propaga evento
  como segundo argumento do callback de abertura. Solicitacoes e o unico
  consumidor desse callback atualmente; selecao e botoes internos preservados.
- `frontend/src/layout/Layout.jsx`: opt-in `data-native-tab` evita interceptar
  Ctrl/Cmd/clique do meio desses links; os demais mantem abas internas.
- `frontend/scripts/validarWorkspacePiloto.mjs`: testes unitarios da projecao,
  navegacao real em Chrome, complemento sem snapshots, Hub e negativas.
- README canonico de Solicitacoes e ownership atualizados.

Endpoint GET `/solicitacoes` e detalhe continuam usando authHeaders e filtros
atuais. Nenhum ajuste em autenticacao, impersonacao, backend, leitura de
arquivos, historico, financeiro ou regras de visibilidade. Nao se persiste
permissao de operacao/resultado de API; identidade de escopo so invalida UI.

## Validacoes

- `node scripts/validarWorkspacePiloto.mjs --solicitacoes-filtros-only` no
  frontend: 1366/390 px, Layout com/sem snapshots, busca/status/descricao,
  retorno, reload, Ctrl+clique nativo, clique do meio, Ctrl+linha, links reais,
  ids/visao do Hub, outro usuario/escopo, negativa 403 sem registros antigos.
  Inclui regressao da tabela opt-in/legada e ensaio limitado de memoria/latencia.
- `node scripts/validarWorkspacePiloto.mjs --correcoes-only`: negativas OBRA,
  Cards/Mapa, quantidade, exclusao/403/duplo clique e 166 predicados frontend.
- `node backend/scripts/validarSegurancaAcessoDireto.js`: 2304 comparacoes de
  visibilidade, ACL/anexos/usuarios, 66 casos por ID e 47 rotas HTTP; aprovado
  com modelos em memoria, sem banco nem rede externa.
- `npm run build` frontend: 582 modulos, aprovado; avisos preexistentes de
  Browserslist desatualizado/chunk acima de 500 kB.
- `git diff --check` e validador documental antes da entrega.

Falhas intermediarias foram do ensaio: seletor de filtro, nome acessivel no
celular, evento page/popup e mensagem generica de 403. O teste de Ctrl revelou
tambem a interceptacao global real, corrigida com excecao explicita de link.
Assercoes reexecutadas; nenhuma gravacao de negocio ou conexao externa.

## Proximo passo

Se o usuario autorizar publicacao, revisar somente estes arquivos, commitar e
publicar em refactor/frontend (fast-forward, sem promover main). Depois
homologar em dev autenticado: aplicar filtros, abrir pelo codigo/linha,
retornar pela seta e aba; Ctrl+clique deve manter a lista e abrir o registro em
outra aba do navegador. Conferir tambem celular e Solicitacoes Arquivadas.
Testes isolados nao substituem essa homologacao com usuarios reais.
