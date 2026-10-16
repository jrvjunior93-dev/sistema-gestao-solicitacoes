# Fila: paginas ou rolagem progressiva

## Pedido e escopo

Usuario pediu rolagem em todos os cards da fila e alternador Paginas/Rolagem
igual a Solicitacoes. Implementacao local sobre 0968e6fc, worktree
`C:/Users/Ricardo/.codex/worktrees/performance-fila-dp-20261015/Fluxy`.
Agente unico, sem delegacao. Sem commit/push, producao, EC2, .env, banco real,
PM2 ou migration. Outputs QA ficam fora do Git.

## Mapeamento operacional

- Todos os 8 status usam loadConsulta/getFilaPagamentos e a mesma tabela:
  PENDENTE, PENDENTE_COMPROVANTE, NAO_PAGO, DIVERGENTE, EM_EDICAO, BAIXADO,
  RESOLVIDO e TODOS. Cards e select conservam applyFilters/ACL atual.
- Escritas continuam nos endpoints existentes com permissoes atuais:
  preparar/baixar, anexar, autorizar divergencia, resolver, estornar.
  Selecao fora da janela continua revalidada por fila_ids, revisao e escopo
  antes do lote; limites 200 baixas / 100 comprovantes inalterados.
- useConsultaSerial e useQueryRevision continuam bloqueando consultas
  simultaneas e respostas atrasadas. Nenhum endpoint novo nem aumento de LIMIT.
- Modelo da UI: ListaAvancada mostra modo atual no botao e carrega por
  IntersectionObserver. Preferencia da fila reutiliza PreferenciasContext,
  TIPO_VISUAL/numerada, por usuario/lista, sem criar persistencia de DTO.

## Implementacao

- Alternador compacto Rolagem/Paginas na barra da fila; sem preferencia salva,
  padrao e rolagem. Troca de modo volta ao inicio sem limpar selecao/rascunhos.
- consultarJanelaFila.js: proximo lote de 50, cache apenas em memoria;
  refresh serial reconstitui a janela visitada. Deduplica por ID, inclusive
  rejeicoes com ID negativo, descarta resposta de outra consulta e reconstroi
  janela se o servidor ajustar a pagina porque a fila encolheu.
- NavegacaoRolagemConsulta.jsx: observer com trava, fim/contagem e botao
  acessivel de carregar mais/repetir. Carga automatica pausa em aba oculta,
  operacao ou modal; nao faz retry automatico apos falha.
- Paginas conserva navegacao anterior. Selecionar todos afeta a pagina atual;
  Rolagem afeta somente elegiveis carregados. Limpar selecao afeta tudo.
- Linhas existentes continuam montadas durante acrescimo, preservando campos
  e rolagem. Operacoes/inputs bloqueados durante carga; regra financeira nao
  recebeu baixa otimista. Falha transitoria preserva janela para tentativa
  manual; 401/403 e falhas de validacao retiram dados e selecao.
- financeiro.js mudou apenas getFilaPagamentos: acrescenta status HTTP ao erro
  para nao confundir negativa de autorizacao com falha transitoria de carga.
- README financeiro, ownership, script npm e QA documentam os dois modos.

## Validacoes

- validarJanelaFila.mjs: 650 registros, avanco somente proxima pagina,
  refresh serial, mudanca de consulta, stale, erro sem cache parcial,
  encolhimento, IDs negativos e preservacao de HTTP 403/503 no servico real.
- UI real com APIs isoladas: oito recortes, desktop 1366/mobile 390,
  650 linhas, selecao/limpeza/alternancia, anexo entre lotes sem baixa,
  retry e retirada de dados apos 403 aprovados na primeira execucao.
- Regressao backend performance/paginacao/filtros/relatorio DP e previsao
  de cartao aprovada sem banco/rede. Build inicial aprovado (606 modulos).
- Capturas desktop/mobile inspecionadas em outputs/fila-rolagem-*.png.
  Skill frontend-design aplicada com interacoes/labels e padrao corporativo
  compacto, sem redesenhar os cards ou ampliar controles financeiros.
- Validacao ampliada de rolagem aprovada: oito recortes, 650 linhas em desktop/
  mobile, campos/selecoes entre modos, anexo sem baixa, retry/403, resposta
  atrasada por card, preferencia apos reload e fallback sem observer.
  O teste de troca de card exigiu fixar a fixture de volume na montagem (a URL
  da tela remove parametros QA ao filtrar); nao era mistura de DTO no produto.
  Label Status explicito estabiliza acessibilidade e automacao.
- Build final (606 modulos), sintaxe, documentacao (534 Markdown/19 canonicos)
  e diff aprovados. Avisos preexistentes Browserslist/chunk >500KB, sem erro.
- Regressao completa da fila aprovada: instrumentos, baixa individual/massa,
  desconto/cheques/carteira, cancelar/mutex, estorno, devolver nao pago,
  arquivos/preview/copias, colunas/persistencia/isolamento por usuario,
  650 titulos/13 paginas/8 recortes e revalidacao negativa fora da pagina.

## Riscos e proximo passo

Nao e virtualizacao: mais linhas carregadas consomem memoria do navegador.
Nao e benchmark nem prova de capacidade ilimitada/RDS. Atualizar janela grande
reconsulta suas paginas em serie; nao foi criado polling novo ou fetch de toda
a base na abertura. Paginacao por offset conserva contrato existente; dados
podem mudar entre leituras e escritas sempre revalidam estado/ACL no servidor.

Implementacao e validacao local concluidas; ownership liberado. Homologar em
DEV antes de promocao. Commit/push e deploy dependem de novo pedido do usuario.
Sem migration e sem operacao real na SOL-6104 ou outros dados financeiros.

## Publicacao autorizada

Usuario autorizou commit/push na refactor/frontend e entrega dos comandos EC2
DEV em 16/10/2026. Remote conferido na base 0968e6fc, sem divergencia.
Essa base ja inclui a desvinculacao auditada/forma efetiva de cartao; o delta
atual e somente frontend/documentacao/testes, sem backend ou migration nova.
Na revisao de publicacao foram repetidos build e regressoes backend de
performance/filtros/paginacao/relatorio DP, fila manual e guard DEV.
QA de rolagem repetida e aprovada com 650 titulos/8 recortes/desktop/mobile,
preferencia, selecao/rascunho, anexo, retry/403 e concorrencia. A regressao UI
completa desta mesma versao ja esta registrada acima. Entrega EC2 com SHA fixado, guard DEV
em leitura e eventual restart exclusivo backend-dev, sem tocar producao.
O agente nao executa EC2, .env, PM2 ou consultas ao banco real.
