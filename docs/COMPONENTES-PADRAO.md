# Componentes padrão da reforma das telas (Leva 0)

Base para reformar as ~189 telas restantes sem reescrevê-las uma a uma.
Vive em `frontend/src/components/padrao/` + `frontend/src/styles/componentes-padrao.css`.
Pilotos de referência: `pages/Usuarios.jsx` (listagem de cadastro),
`pages/Parceiros.jsx` (tela mista) e `pages/FinanceiroTituloDetalhe.jsx` (detalhe).

## As regras de organização (decididas pelo cliente, 02/09)

1. **Cada tela responde UMA pergunta central.** O que responde vem primeiro e
   com mais peso; contexto depois e menor; raro fica recolhido. Dado que gera
   ação primeiro; histórico e registros por último (recolhidos por padrão).
2. **Largura é decisão.** Bloco principal em largura total; apoio divide o
   espaço abaixo. Secundário nunca fica lado a lado com o principal.
3. **Informação aparece UMA vez.** Repetição sai — remoção só visual, o dado
   continua no sistema. Exceção: segunda aparição com função diferente
   (referência × campo editável) fica, visualmente secundária.
4. **Campo/bloco vazio some, com contador** ("Ver todos os campos (N vazios)").
5. **Modulável onde a estrutura permitir** (mecanismo do detalhe/Home); fixo
   onde não der, com proposta aprovada.
6. **Denso, sóbrio-moderno**: canvas `--ui-canvas` acinzentado, blocos brancos;
   um primário por tela com barra de cor à esquerda; secundários em
   `--ui-surface-2` (branco rebaixado, criado nesta leva). Botões TODOS
   visíveis, em três pesos; destrutivo em vermelho suave, sempre apartado;
   ações raras também visíveis, na mesma barra (R36). Só tokens — nenhuma
   cor à mão.
7. **Adoção antes de criação**: ListaAvancada, StatusBadge, ResizableTable,
   ModalPortal/OverlayModal, `useFecharAoSair`, classes `app-*` já existentes.

## Os componentes

| Componente | Para quê | Observações |
|---|---|---|
| `PageHeader` | Cabeçalho de página: título+subtítulo, UMA `acaoPrincipal` sólida, `secundarias` em contorno, `destrutiva` apartada (objeto **ou lista**) | O `h1` é ocultado pelo CSS do shell (a topbar mostra o título da seção) — fica no DOM por acessibilidade. **Links para telas irmãs não entram** (menu e Ctrl+K resolvem; decisão de 02/09). A prop `mais` **não existe mais** (R36, 07/09) |
| `MenuMais` | Menu "⋯" para ações raras | **Em retirada (R36).** Sobrou UM ponto: a célula de ações da lista de Solicitações, onde os seis botões visíveis pedem 478px e a coluna tem 296px úteis — caso levado ao cliente. Nenhuma tela nova deve usá-lo |
| `BlocoConteudo` | O card padrão | `variante="primario"` (barra de cor via `cor`, ex. `var(--module-financeiro)` ou `var(--sem-info)`) / `"secundario"` (`--ui-surface-2`); `recolhivel` + `recolhidoPadrao` para raros/históricos |
| `StatGrid` + `StatTile` | Ladrilho de dado único (unifica InfoItem, app-summary-card, StatsCard, hub-pendencia-cartao) | `tom` semântico, `span`, `full`, `vazio` |
| `CamposComVazios` | O grid de campos do detalhe com o alternador de vazios | `campos=[{label, valor, sub, tom, span, contexto}]` — a contagem sai da própria lista (nada de espelhar condição à mão); `contexto:false` = campo que não pertence a este registro (fora da tela E da contagem) |
| `TabelaPadrao` + `CelulaDupla` | Tabela para cadastros/apoio/mistas | Colunas com `render`, larguras persistidas (ResizableTable/localStorage), `urgencia(item)` → tarja na linha, `acoesLinha` (visíveis, numa linha só — dimensionar `larguraAcoes`), `aoClicarLinha`; **no mobile as MESMAS colunas viram cards** — nunca dois markups para o mesmo dado. `CelulaDupla` põe dois dados relacionados numa coluna só |
| `FormSecao` + `CampoForm` | Formulário disciplinado | fieldset+legend de verdade, grid único (`colunas` 2/3/4, `span`, `linha`), label/hint/erro pelas classes `.form-*` (que existiam com zero uso) |

**Quando usar ListaAvancada vs TabelaPadrao**: a listagem PRINCIPAL de um
módulo (visões, filtros salvos, busca, lote) usa `ListaAvancada`
(`docs/LISTA-AVANCADA.md`); ela deliberadamente NÃO tem ação por linha (clique
abre o registro). CRUD de cadastro e tabelas de apoio — onde convite/ativar/
editar na linha são o dia a dia — usam `TabelaPadrao`.

## Padrão de TELA MISTA (aprovado no piloto Parceiros)

Lista em largura total como bloco principal; o formulário abre como painel
ACIMA da lista quando acionado (Nova pessoa / Editar / clique na linha) e,
enquanto ativo, assume a barra de cor — a lista rebaixa para neutra (um
primário por tela; a hierarquia segue o foco). Campos raros do form em
`BlocoConteudo` recolhível que nasce aberto quando o registro já tem dado
(`recolhidoPadrao={!temDado}`, com `key` por registro para remontar). Mesma
rota, mesmos handlers — reorganização pura.

## Escala e decisões nos componentes (pivô de 02/09)

- **Critério vigente: CONFORTO E CLAREZA DE LEITURA** (correção de direção do
  cliente, 02/09 — substitui o "denso"): linha de tabela com respiro (corpo
  14px, altura de linha 1.5, vão de 12px), blocos que respiram, nada abaixo
  de 12px. Entre "cabe mais" e "lê-se melhor", vence a leitura.
- **`styles/escala.css` é a única fonte de medida** — espaço 4/8/12/16/24/32/48,
  tipo 12/14/18/22 com papel fixo, raios 8/12/14. Tela reformada não escreve
  pixel (R10 no docs/REGRAS-LAYOUT.md; o verificador reprova).
- **`Pagina`**: raiz de toda tela reformada. Dá o ritmo vertical (16px entre
  blocos) e o título de página (22px). A tela só declara os blocos na ordem.
- **Coluna de `TabelaPadrao` declara `tipo`, não largura**: `texto` (sobra),
  `codigo` 130, `valor` 150 à direita tabular, `numero` 110, `data` 110,
  `status` 96, `badge` 120. `largura`/`minWidth` só sobrevivem como exceção
  registrada no manifesto.
- **`CampoForm` aceita `tipo`** (`texto-longo`/`observacao` tomam a linha);
  moeda continua na classe `.input-moeda` do input.
- **`.app-painel-lateral`**: painel de apoio ao lado da lista (mín. 320px em
  tela larga) — a medida mora na classe, não na tela.

## Regras de 02/09 (segunda rodada) já nos componentes

- **`BlocoConteudo` com `contagem`/`descricao`**: o texto de apoio ancora no
  bloco a que se refere (`.app-bloco-lead`); o `PageHeader` não renderiza
  mais texto — só o h1 de acessibilidade e as ações (R5 revisto).
- **Comparações**: `.serie-prevista`/`.serie-realizada` e
  `.texto-previsto`/`.texto-realizado` — previsto azul, realizado vermelho
  (R8 revisto).
- **`tipo: 'identidade'`** na coluna de TabelaPadrao: nome/razão/obra/
  empresa/parceiro exibidos SEMPRE em maiúsculas (só exibição).
- **Redimensionar coluna é Excel**: arrasto muda SÓ a coluna arrastada; a
  regra `width: 100%` que esticava a tabela foi removida (o card enche via
  coluna flex medida no mount) e o drag-check do roteiro de capturas prova.
- **Menu "⋯" sem navegação** (R11) e **`BarraFiltros`** no lugar de select
  de filtro (R12) — busca larga em cima, marcação múltipla, etiquetas.

## Tokens e utilitários novos

- `--ui-surface-2` (`#f7f9fc` claro / `#182642` escuro): branco rebaixado de
  bloco secundário. `--ui-surface-soft` NÃO serve para isso (é igual ao canvas).
- `.tarja` + `.tarja--danger/--warning/--info/--success`: a barra lateral de
  4px que existia copiada em 3 lugares (ListaAvancada linha/card, cartão da
  Home) — para item novo, use o utilitário.
- `.btn-perigo-suave`: destrutivo visível em vermelho suave (com `.btn
  .btn-outline`); o `btn-danger` cheio fica para confirmações finais.
- `.app-celula-dupla`, `.app-actionbar` + `.app-actionbar-apartada`.

## Consertos da leva

- `ui/EmptyState.jsx` usava classes `-icon/-title/-message` que não batiam com
  o CSS (`__icon/__title/__description`) — o estilo nunca aplicava. Corrigido.
- Bloco morto de 65 linhas (`{false && ...}`) removido de `Parceiros.jsx`
  (aprovado 02/09 — código que não renderiza não é funcionalidade).

## Capturas desta leva

Geradas servindo o BUILD (`vite preview`) com a API interceptada no navegador
(dados de amostra — roteiro em `scratchpad` da sessão; sem backend, sem
credencial). No preview publicado o comportamento é o mesmo com dados reais.
