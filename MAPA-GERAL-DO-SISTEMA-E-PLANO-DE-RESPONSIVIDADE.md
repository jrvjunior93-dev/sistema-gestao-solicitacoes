# Mapa geral do sistema e plano de responsividade

Levantado em 27/08/2026 **lendo o código**, não por amostragem. Reproduzível:

```bash
node qa/inventarioDeTelas.js
```

O script percorre `src/pages`, `src/components`, `src/modules` e `src/layout`, cruza com as rotas de
`App.jsx` e classifica cada arquivo pelos sinais de risco descritos abaixo.

> **A primeira versão deste levantamento estava incompleta.** Ela varria só `pages` e `components` e
> deixava `src/modules` de fora — **86 arquivos e sete módulos inteiros**: CRM, Custos/Recebíveis,
> Fiscal, Governança, Provisionamento Financeiro, Solicitação de Compra e SST. O número de arquivos
> com risco saltou de 51 para **84** quando eles entraram. Os números abaixo são os corrigidos.

---

# Parte 1 — o mapa

## Números gerais

| | |
|---|---|
| Rotas declaradas em `App.jsx` | **203** |
| Páginas | **220** — 182 com rota direta, 38 sub-telas compostas |
| Componentes | **67** |
| **Modais** (todas as formas) | **176**, em 54 arquivos |
| Arquivos com tabela | **130** |
| **Arquivos com algum risco** | **84** |

## Os cinco padrões de modal que convivem

| Padrão | Observação |
|---|---|
| `fixed inset-0` próprio | **68 instâncias** — é o padrão de fato |
| `role="dialog"` | frequentemente junto de outro |
| `className="modal…"` | CSS legado |
| `OverlayModal` | o componente compartilhado |
| `ModalPortal` | a base do `OverlayModal` |

## O sistema por bloco

| Bloco | Arquivos | Páginas | Modais | Tabelas | Com risco |
|---|---|---|---|---|---|
| **Sub-telas** (Solicitação/Detalhe, Solicitações, Login…) | 80 | 36 | 53 | 26 | **11** |
| **financeiro** | 28 | 28 | **61** | **104** | **13** |
| **modules/solicitacao-compra** | 22 | 19 | 30 | 28 | **10** |
| **modules/custosRecebiveis** | 18 | 1 | 6 | 13 | **8** |
| modules/crm | 15 | 15 | 4 | 11 | 2 |
| modules/sst | 12 | 12 | 0 | 5 | 2 |
| **compras** | 11 | 11 | 0 | **72** | **10** |
| rh-dp | 10 | 10 | 5 | 28 | 4 |
| **modules/fiscal** | 9 | 9 | 0 | 16 | **7** |
| modules/provisionamento-financeiro | 7 | 7 | 0 | 8 | 1 |
| comercial | 7 | 7 | 1 | 10 | 2 |
| contratos + obras + gestao-contratos | 5 | 5 | 13 | 17 | 5 |
| solicitacoes | 2 | 2 | 0 | 24 | 1 |
| modules/governanca | 3 | 2 | 0 | 2 | 2 |
| avulsos com risco | 5 | 5 | 0 | 3 | 5 |
| **~47 páginas de configuração** | 47 | 47 | 0 | ~10 | 0 |

Cinco blocos — sub-telas, financeiro, solicitação de compra, custos/recebíveis e compras — somam
**52 dos 84 arquivos com risco**.

---

## O que JÁ está resolvido — e por isso não entra no plano

`styles/responsive-system.css` (533 linhas) resolve transversalmente mais do que parecia. Medi antes
de planejar, e **duas suposições minhas estavam erradas**:

### O `OverlayModal` já é responsivo

Eu ia listá-lo como risco por causa do `largura="900px"`. Errado — ele aplica:

```js
width: `min(100%, ${largura})`,
maxHeight: 'min(88vh, 920px)'
```

`900px` vira `min(100%, 900px)`. Em 375px ele ocupa 375px. **Não há o que corrigir aqui.**

### Quase todo modal já tem trava de largura

Dos **68** overlays feitos à mão, **64** já usam `max-w-*` ou `w-full` do Tailwind.

**Só 4 não têm trava nenhuma:** `ModalAditivoContrato`, `PreviewAnexoModal`, `FinanceiroTitulos`,
`Layout`.

### 101 de 130 arquivos com tabela já rolam sozinhos

O CSS transversal dá `overflow-x: auto` a nove classes de wrapper (`table-wrapper`,
`app-table-shell`, `app-dense-table-wrapper`, `compras-table-wrapper`,
`finance-operation-table-shell`, `sol-table-wrapper`, `table-responsive`, `[data-table-scroll]`,
`resizable-table-scroll`). **101 arquivos usam alguma delas.**

---

## Os buracos reais, medidos

### 1. A faixa de tablet não tem regra de tabela nenhuma

A rede de proteção para tabela sem wrapper existe **só** em `@media (max-width: 767px)`:

```css
.layout-main :where(div, section, article):has(> table) { overflow-x: auto; }
```

Conferido: **zero regras de tabela entre 768px e 1023px**. Uma tabela sem wrapper empurra o
documento de lado em qualquer tablet e em janela de notebook estreita.

E o seletor usa `>` — **filho direto**. Tabela aninhada um nível abaixo escapa mesmo abaixo de 767px.
É exatamente o erro que me custou três tentativas no card da Jornada.

### 2. Trinta e sete arquivos com tabela sem wrapper

Concentrados, e é o que torna o plano possível:

| Bloco | Arquivos |
|---|---|
| **Custos/Recebíveis** | 8 — `CrPlanejamentoView` (4 tabelas), `CrMonthlyDetailView` (3), `CrComparativoView`, `CrImportacoesView`, `CrObrasView`, `CrPlanningImportModal`, `CrPlanoWorkspace`, `CrRealizadoView` |
| **Solicitação de Compra** | 10 |
| **Fiscal** | 7 — `FiscalDashboard`, `FiscalDocuments`, `FiscalLogs`, `FiscalAccountingBatches`, `FiscalCompanies`, `FiscalDivergences`, `FiscalDocumentDetail` |
| **Contratos** | 5 — `BlocoContratoFluxoNovo`, `BlocoMedicaoContrato`, `RateioApropriacoesContrato`, `ContratoFluxoNovo`, `TiposMacroContrato`/`TiposSubContrato` |
| **Obras** | `ObraGestao` (**5 tabelas**) |
| Solicitações | `SolicitacaoTable`, `TabelaSolicitacoes` |
| Avulsos | `AuditoriaOperacional`, `GovernancaSistema`, `CotacaoFornecedorPublica`, `SstObservabilidadeAvancada`, `StatusSetor` |

### 3. Dezesseis grades que não colapsam

`grid-cols-2..9` sem prefixo `md:`/`lg:` mantêm o mesmo número de colunas no celular. Concentradas
em Financeiro (`FinanceiroCaixas`, `FinanceiroConciliacao`, `FinanceiroResultadoCentrosCusto`,
`FinanceiroResultadoObras`, `FinanceiroTitulos`, `FinanceiroTitulosImportacaoPanel`), mais
`RecargaCartaoFields`, `Obras`, `PrioridadesDiretoria` e as dos módulos.

### 4. Larguras de coluna em pixel — **fora deste plano**

**33 arquivos** passam largura de coluna em px ao `ResizableTable`, gravada em `localStorage`. Isso
**não quebra a tela** — a tabela rola. É o que impede a tabela de acompanhar mudança de escala, e
pertence à decisão de densidade (zoom 80%) que está pendente. Misturar faria uma mudança mascarar a
outra.

### 5. Seis larguras fixas ≥600px fora de modal

`ModalConferenciaCredores`, `ComunicacaoInterna`, `RhDpPessoal`, `RhDpPessoalSolicitacoes` e duas
nos módulos.

---

# Parte 2 — o plano

## O critério de pronto, e ele é medível

Uma tela está pronta quando, em **375px**, **768px** e **1280px**:

1. `document.documentElement.scrollWidth <= clientWidth + 2` — **a página não rola de lado**;
2. todo bloco largo rola **dentro de si**;
3. nenhum controle fica abaixo de 42px de altura de toque;
4. nenhum texto sai do container.

O item 1 é o que separa "quebrada" de "apertada", e é objetivo.

**Sem essa medição automatizada o plano não se sustenta.** É o único jeito de garantir, em 203
rotas, que a fase seguinte não desfez a anterior.

## Fase 0 — a fundação (obrigatoriamente primeiro)

Nada de tela; só o alicerce. Maior alcance e maior risco, por isso vem antes de qualquer módulo —
assim cada fase seguinte já nasce medida.

1. **Fechar a faixa de tablet** — levar a rede de proteção de tabela para `max-width: 1023px`.
2. **Trocar `>` por descendente** no seletor de emergência, para alcançar tabela aninhada.
3. **Um wrapper canônico** (`data-table-scroll`); as outras oito classes viram apelido dele.
4. **O arnês de medição** — percorre as 203 rotas em três larguras e reporta as quatro condições.

**Risco: alto** — mexe em regra que alcança o sistema inteiro. Mitigação: o arnês roda **antes**
(linha de base) e **depois**; qualquer rota que piore é regressão.

## Fases seguintes — a ordem e por quê

A ordem é por **acoplamento**, não por tamanho. Os blocos isolados vêm primeiro para provar a
fundação em tela real, antes de mexer no que o sistema inteiro compartilha.

| Fase | Bloco | Arquivos com risco | Por que aqui |
|---|---|---|---|
| **1** | **Custos/Recebíveis** | 8 | maior aglomerado sem wrapper e **totalmente isolado** — campo de prova da Fase 0 |
| **2** | **Fiscal** | 7 | também isolado, mesmo defeito, mesma correção — confirma que a Fase 1 não foi sorte |
| **3** | **Solicitação de Compra** | 10 | módulo próprio, 30 modais; ainda isolado, mas já exercita modal a sério |
| **4** | **Financeiro** | 13 | **o maior** (61 modais, 104 tabelas) — só depois da fundação provada três vezes; subdividir em títulos / conciliação / relatórios |
| **5** | **Compras** | 10 | 10 dos 11 são relatórios de mesma estrutura — repetitivo e de baixo risco |
| **6** | **Sub-telas: Solicitações + Solicitação/Detalhe** | 11 | **o mais compartilhado** — quase toda tela abre alguma delas; por isso vem com a fundação madura |
| **7** | **Contratos + Comercial + Obras** | 9 | `ObraGestao` sozinha tem 5 tabelas sem wrapper |
| **8** | **CRM + SST + Governança + Provisionamento** | 7 | módulos periféricos, correção repetitiva |
| **9** | **RH/DP** | 4 | **já em boa parte feito** — restam 2 larguras fixas e varredura |
| **10** | **~47 páginas de configuração** | 0 | grande em número, trivial em conteúdo — tratáveis em lote |
| **11** | **Os 4 modais sem trava + as 16 grades** | — | avulsos, varredura final com o arnês |

## O que NÃO entra, e por quê

- **Larguras de coluna em px** (33 arquivos): dependem da decisão de densidade/zoom, em aberto.
- **Unificar os cinco padrões de modal**: é refatoração, não responsividade — 64 dos 68 já se
  comportam. Vale fazer, com outro objetivo.
- **Filtros de página sem label**: assunto da rodada de labels.

## Como cada fase evita quebrar a anterior

1. arnês roda e grava a linha de base **antes** de tocar no bloco;
2. correção;
3. arnês roda em **todas** as 203 rotas, não só nas do bloco;
4. qualquer rota que piore em relação à linha de base bloqueia a fase.

O passo 3 é o que importa: uma correção em Financeiro pode quebrar Compras se as duas dividirem uma
classe, e só a varredura completa mostra isso.

## O que preciso de você

**Uma sessão autenticada.** O arnês precisa navegar logado nas 203 rotas — login com senha eu não
faço. Sem isso a medição fica limitada à leitura de código, que é justamente o que **não** pega tela
quebrada.

E confirmar a ordem: pus os blocos isolados antes do núcleo compartilhado, para provar a fundação em
terreno seguro. Se preferir atacar Financeiro logo — é o mais usado —, dá; mas o risco de regressão
nas primeiras fases fica maior.
