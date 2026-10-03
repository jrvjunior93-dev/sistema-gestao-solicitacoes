# ListaAvancada — como plugar uma nova lista

Componente reutilizável de lista do sistema
(`frontend/src/components/lista-avancada/ListaAvancada.jsx`). Solicitações
é a primeira instância; Contas a Pagar, Pedidos de Compra e Contratos
migram usando o mesmo contrato descrito aqui.

## Divisão de responsabilidades (contrato "dados controlados")

- **A página dona é dona dos DADOS**: fetch, live updates, permissões,
  handlers de ação e modais. Nada disso muda ao adotar o componente —
  por isso a migração preserva integralmente filtros e regras.
- **O componente é dono da APRESENTAÇÃO e do estado de consulta**:
  visões, filtros rápidos combináveis com etiquetas removíveis, filtros
  nomeados salvos, busca única, ordenação, agrupamento, tabela⇄cards,
  colunas + larguras redimensionáveis, seleção, rolagem
  infinita/paginação.
- **Preferências no banco, por usuário e por lista** (`id` é a chave):
  tabela `usuario_lista_preferencias` (colunas, larguras, modo,
  paginação, agrupamento) e `usuario_lista_filtros` (filtros nomeados) —
  endpoints `GET/PUT /api/listas/:lista/preferencias` e
  `GET/POST/DELETE /api/listas/:lista/filtros`. Nunca em localStorage:
  o usuário não perde nada ao trocar de máquina ou limpar cache.

## Fluxo

1. O componente monta, carrega preferências/filtros salvos e chama
   `onQueryChange({ visao, filtros, busca, ordenacao })`.
2. A página guarda essa consulta (ref), traduz para os parâmetros da SUA
   API e busca a página 1.
3. A página passa `itens`, `total`, `totalPaginas`, `pagina`,
   `carregando`, `erro` de volta como props.
4. Rolagem infinita/paginação chamam `onPageRequest(pagina, { acumular })`
   — a página busca e (se `acumular`) concatena.

## Exemplo mínimo

```jsx
const listaRef = useRef(null);
const consultaRef = useRef({});

<ListaAvancada
  ref={listaRef}
  id="pedidos-compra"                    // chave de persistência
  itens={itens}
  total={meta.total}
  totalPaginas={meta.total_pages}
  pagina={pagina}
  carregando={loading}
  onQueryChange={(consulta) => { consultaRef.current = consulta; recarregar(1); }}
  onPageRequest={(p, { acumular }) => recarregar(p, acumular)}
  fetchContadores={buscarContadores}     // opcional: números das visões
  visoes={[{ id: 'abertos', rotulo: 'Abertos', params: { status: 'ABERTO' } }, ...]}
  visaoInicial="todas"
  filtrosRapidos={[{ id: 'obra', rotulo: 'Obra', opcoes: [{ valor, rotulo }] }]}
  filtrosAvancados={() => <MeusFiltrosCompletos/>}   // bloco atual, recolhido
  filtrosAvancadosAtivos={nAtivos}
  busca={{ placeholder: 'Código, fornecedor…' }}
  colunas={[{ id, titulo, render, ordenavel, larguraPadrao, principal, padrao, tituloCelula }]}
  agrupamentos={[{ id: 'obra', rotulo: 'obra', valor: (i) => i.obra?.nome }]}
  renderCard={(item) => <MeuCardCompacto item={item}/>}
  urgencia={(item) => urgenciaVencimento(item.data_vencimento)}  // 'danger'|'warning'|null
  acoesLote={[{ id, rotulo: (n) => `Exportar ${n}`, visivel?, desabilitada?, executar(selecionadas) }]}
  aoAbrirItem={(item) => navigate(`/pedidos-compra/${item.id}`)}
  onSelecaoChange={(ids, itens) => setSelecionados(ids)}
/>
```

## Regras de UX embutidas (não reimplemente na página)

- Visões são mutuamente exclusivas; filtros rápidos são COMBINÁVEIS
  (clicar outro adiciona) e viram etiquetas removíveis + "limpar tudo".
- Barra de lote só aparece com **2+** selecionados; rótulos com contagem
  ("Enviar 3 para outro setor"); "×" no contador limpa a seleção.
- Clique na linha/card abre o registro (`aoAbrirItem`); o checkbox é só
  para lote. Sem ações rápidas na linha (decisão do cliente).
- Tabela: sempre UMA linha por registro; texto truncado com reticências
  e tooltip; colunas redimensionáveis arrastando a borda do cabeçalho e
  REPOSICIONÁVEIS arrastando o próprio cabeçalho (ou os itens do menu
  Colunas, útil no toque). Ordem, largura e visibilidade são salvas no
  banco por usuário e por lista (`ordem_colunas`, `larguras`, `colunas`).
- Todo menu suspenso (Colunas, filtros rápidos) fecha ao clicar fora e
  com Esc.
- Abaixo de 768px a visualização é forçada para cards.
- Rolagem infinita por padrão; "Paginação numerada" é preferência do
  usuário (persistida).

## API de referência do componente

| Prop | Tipo | Observação |
|---|---|---|
| `id` | string | chave de persistência por usuário (obrigatória) |
| `itens/total/totalPaginas/pagina/carregando/erro` | dados | controlados pela página |
| `onQueryChange(consulta)` | fn | página refaz consulta na página 1 |
| `onPageRequest(pagina, {acumular})` | fn | rolagem infinita/paginação |
| `fetchContadores()` | fn→Promise | números das visões |
| `visoes` | `[{id, rotulo, params, contadorChave?}]` | `params` é interpretado pela página |
| `visaoInicial` | string | id da visão inicial |
| `filtrosRapidos` | `[{id, rotulo, opcoes:[{valor,rotulo}]}]` | multi-seleção |
| `filtrosAvancados` | render fn | slot do bloco completo de filtros |
| `colunas` | ver exemplo | `padrao:false` = só via seletor de colunas |
| `acoesLote` | ver exemplo | `visivel/desabilitada` recebem as selecionadas |
| ref | `refreshContadores() / getSelecionadas() / clearSelecao() / reconsultar()` | |

## Solicitações (instância de referência)

- Visões: Minhas pendências (`minhas=1`), **Fila do setor**
  (`sem_responsavel=1&area=<setor>` — pendentes sem responsável; escolhida
  no lugar de "Do meu setor" porque, para quem é o único do setor, "do meu
  setor" seria idêntico a "Todas"), Vencendo (7 dias), Atrasadas, Todas.
  Contadores: `GET /api/solicitacoes/contadores`, que usa o MESMO escopo
  de visibilidade da listagem (`montarEscopoVisibilidadeLista` +
  `filtrarRegraMistaPorTipo` no `SolicitacaoController`).
- Busca única: `?q=` (código, descrição, nº pedido, contrato, obra,
  fornecedor; caixa/acento-insensível pela collation do banco).
- Ordenação: `?ordenar=&direcao=` (whitelist no backend; padrão continua
  data de registro, mais recente primeiro).
- Texto: código/obra em MAIÚSCULAS e descrição em sentence case NA
  EXIBIÇÃO (`frontend/src/utils/formatarTexto.js`); registros antigos do
  banco não são reescritos; novas gravações são normalizadas em
  `backend/src/utils/normalizarTexto.js`.

## Agrupar por — critérios

Além de obra/tipo/setor, a lista de Solicitações agrupa por: status,
responsável, fornecedor/parceiro, mês de vencimento (ordem
cronológica), criador, apropriação, contrato vinculado e faixa de
valor (ordem das faixas). O agrupamento continua CLIENT-SIDE sobre os
itens carregados (mesma mecânica de sempre); "criador" precisou apenas
de um join leve (belongsTo `criador`) no include da lista. Critérios
com ordem própria passam `ordenarGrupos` (comparador) na config do
agrupamento.
