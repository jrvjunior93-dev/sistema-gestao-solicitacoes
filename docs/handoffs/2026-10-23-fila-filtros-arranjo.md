# Fila: placeholders e arranjo pessoal dos filtros - 23/10/2026

## Escopo e isolamento

Usuario pediu manter opcionais filtrando todos, sem Todos no campo, digitacao
imediata e configuracao de posicao/visibilidade. Base DEV45513bfd ja publicada
no turno anterior; mudancas atuais somente locais na branch de trabalho.
Agente unico, sem delegacao, backend/EC2/banco real/migrations/producao ou
commit/push nesta etapa. Nao ampliar permissoes nem alterar regras financeiras.
Skill frontend-design limitada ao padrao compacto do Fluxy, reaproveitando
autocomplete, painel, preferencias por usuario e slot do cabecalho existentes.

## Mapeamento e implementacao

- Consulta continua no mesmo applyFilters da fila e mesmos endpoints/validadores
  antes da paginacao. Nao altera getFila, sugestoes, payload de baixa ou guards.
- FiltroAutocomplete passa value vazio quando sem restricao, nao o identificador
  sintetico __TODOS__. Opcao Todos continua no menu e limpa criterio; placeholder
  por campo. Nova prop selecionarTextoAoFocar, default false no componente
  compartilhado, seleciona texto no foco/clique sobre selecao restaurada;
  editar a pesquisa nao altera o filtro ate escolher uma sugestao. Escape
  devolve selecao anterior. Outros usos do autocomplete nao mudam.
- Catalogo12grupos de filtros, incluindo Situacao, Vencimento (intervalo unido)
  e Busca geral obrigatoria. Grade renderizada pela ordem salva com chaves
  estaveis; remontar/reordenar nao muda drafts ou consulta financeira.
- useFiltrosVisiveis ganha ordenavel opt-in; padrao false preserva payload e
  comportamento anterior nas outras telas. Reconcilia IDs/duplicados/desconhecidos
  na leitura; filtros novos seguem padrao. Painel reaproveita CSS/posicao/fechar
  existentes e acrescenta drag/setas apenas com opt-in. disabled bloqueia a
  configuracao durante operacao financeira. Nao altera CSS global.
- Preferencia existente TIPO_FILTROS {ordem,visiveis,ocultas}; mesmos endpoints
  /me/preferencias e /listas/:lista/preferencias/filtros, com lista
  financeiro-fila-pagamentos:filtros:<usuarioId>. ID protege espelho local de
  estacao compartilhada; backend continua indexando pelo usuario autenticado.
  Nao cria preferencia automatica na abertura nem guarda valores de consulta,
  nomes/IDs de favorecidos, saldos ou dados bancarios.
- Reordenar/esconder vazio: apenas gravacao de preferencia, sem novo GET da fila,
  sem limpar selecao ou campos monetarios. Esconder preenchido: aviso explicito
  no painel, limpa somente aquele criterio via applyFilters, reinicia pagina/
  selecao como antes e preserva drafts. URL/workspace com campo oculto o revela.
- Situacao mantem Pendentes, conforme esclarecido na commentary; nao passa a
  Todos global. Se ocultada com outro status, volta para Pendentes. Cards
  continuam visiveis indicando o recorte. Busca geral nao pode ser escondida.
  Restaurar padrao apaga apenas preferencia desta chave/tipo, nao filtros,
  colunas, larguras, modo de paginacao, dados ou pagamentos.

## Validacoes e proximo passo

- Novo validarFiltrosOrdenaveis.mjs executa hook real em VM: legado sem ordem,
  novo opt-in, IDs novos/antigos/duplicados, dados congelados, revelar por valor,
  esconder/limpar somente criterio, trava Busca e reset; sem rede/storage.
- Novo filaFiltrosArranjoQA.mjs na pagina/contexto/painel reais, APIs interceptadas:
  placeholders de nove campos, primeira digitacao/substituicao/Escape, ordem por
  setas e arrasto, visibilidade vazia/preenchida/URL, reset, selecao/draft monetario,
  mesmo usuario em outro navegador, usuarios diferentes e mesma estacao, usuario
  consultivo e geometrias1366/390. Apenas preferencias simuladas, nenhuma baixa.
- QA de filtros anterior, regressao completa da fila (instrumentos, cheques,
  estorno, comprovantes, colunas, arquivos/copia,650titulos/13paginas/8status)
  aprovados. Backend preferencias por usuario/tipo e prova de ligacao de
  filtros52faixas/negativas aprovados. Build final640/16,61s aprovado apos ajuste
  de largura dos dois campos de data. Capturas de menu dentro do viewport
  conferidas; sem overflow horizontal da pagina.
- Rodada final novos testes unitarios/UI e filtros anteriores aprovada; teste
  --concorrencia com recortes atrasados, preferencia apos reload e fallback
  sem observer aprovado. Documentacao609Markdown/19canonicos e diffcheck
  aprovados. Somente frontend/docs alterados; nenhuma mudanca no backend.
- Implementacao local concluida, ownership liberado. Proximo passo exato:
  mediante pedido explicito, commitar/publicar delta para DEV e homologar no
  frontend DEV. Nao repetir roteiro antigo com inventario fechado de17arquivos
  usando SHA futuro: o delta atual tem outro inventario e nao muda backend.
  Sem dependencia nova/migration ou necessidade de mudar calculos/permissoes.
  Validacao isolada nao equivale a homologacao DEV real.

Arquivos: FiltrosFilaPagamentos.jsx, ApropriacaoAutocomplete.jsx,
PainelFiltrosVisiveis.jsx, novos QAs puros/UI, harness validarFilaInstrumentosUI,
frontend/package.json (somente script QA) e docs/ownership. Outputs fora do Git.
QA: `npm run test:fila-filtros-arranjo` no frontend.

## Publicacao DEV autorizada - baseae9df9d3

- Usuario autorizou agora commitar/push este complemento na refactor/frontend
  e fornecer comandos EC2 DEV. Tres componentes funcionais, testes frontend,
  manifesto somente script QA, README/ownership/handoff e roteiro dedicado.
- Novo atualizar-dev-fila-filtros-arranjo-20261023.sh aceita HEADae9df9d3 ou
  o alvo exato (retomada), exige SHA completo publicado, branch/cwd/lock,
  fast-forward e inventario fechado12arquivos. Confere manifesto sem mudar
  dependencia/qualquer outro script e preserva hash de backend/.env.
- NENHUM PM2, migration, instalacao, leitura/escrita em banco ou mudanca de
  configuracao. EC2 recebe somente checkout e testes puros de deploy/hook.
  Frontend e publicado pela Vercel DEV; nao fazer build na EC2 compartilhada.
- QA novo validarDeployFilaFiltrosArranjoDev.mjs executa a allowlist real em
  VM, recusa arquivos extras/backend/migration/lockfile/.env e alteracao de
  dependencias/scripts. Verifica guardas de HEAD/branch/ff/lock e ausencia
  de comandos de instalacao/reinicio/aplicacao. Sem rede ou banco real.
- Repetidos nesta publicacao: QA real de arranjo1366/390 com capturas conferidas,
  hook legado/opt-in, filtros digitaveis/DP/URL/paginacao, backend filtros/
  sugestoes/escopo/paginacao, preferencias por usuario/tipo, auditoria80rotas,
  prova52faixas e navegacao223rotas. Build643modulos/14,69s aprovado; avisos
  preexistentes de Browserslist e chunk grande nao bloquearam compilacao.
- Nenhum acesso DEV/producao pelo agente; suites usam fixtures/APIs isoladas.
  Aguardar publicacao do commit na Vercel DEV e homologar placeholders,
  sugestoes, setas/arrasto/visibilidade, recarga e isolamento por usuario.
  Ocultar preenchido avisa/limpa somente o criterio; Busca geral permanece
  disponivel. Situacao continua Pendentes por padrao e filtro Forma considera
  a prevista do titulo. Dados financeiros/permissoes permanecem intactos.
- Regressao COMPLETA da fila repetida nesta publicacao: instrumentos/cheques,
  estorno, comprovantes, anexos/preview/copia, colunas reais e persistencia,
  650titulos/13paginas/8status desktop/mobile aprovados. Allowlist real do
  roteiro executada contra o index12arquivos e manifesto reais: aprovada.
  Ownership liberado para commit/push, mantendo outputs/ fora do Git.
