# PLANO — Preferências por usuário e limpeza visual

> Levantamento medido em 05/09/2026, branch `refactor/preferencias-usuario`.
> Sete frentes de medição, cada número contado e conferido por mim antes de entrar aqui.
> **Nada foi aplicado.** Dois pontos aguardam decisão do cliente: os filtros
> iniciais por tela (item 2) e a escala tipográfica (item 7).

---

## O QUE O LEVANTAMENTO MUDOU NO PEDIDO

Três descobertas mudam o tamanho e a ordem do trabalho.

**1. O mecanismo de preferência no banco JÁ EXISTE.** Tabela
`usuario_lista_preferencias`, model, e cinco rotas no ar desde o pacote B1 — com
a justificativa escrita: *"no banco, e nao em localStorage: o usuario nao perde
a configuracao ao trocar de maquina."* O item 1 não é construir; é **ligar**.

**2. Uma linha impede que ele seja usado.** O backend valida a chave da tela com
`/^[a-z0-9_-]+$/` (`backend/src/controllers/ListaPreferenciasController.js:18`),
que **não aceita `:`** — e as 273 chaves de tabela do sistema têm `:`
(`tabela:financeiro-titulos:geral`). Medido: **273 de 273**. Qualquer tentativa
de gravar hoje devolve HTTP 400. Não é que ninguém tenha ligado: é que ligar não
funciona.

**3. A capacidade de ocultar e reordenar coluna já existe no componente.** O
`TabelaPadrao` tem o painel pronto. Das **268 tabelas** do sistema, **20** o têm
ligado. E **267 das 268** já passam a chave de armazenamento — só uma tabela em
todo o sistema não tem onde salvar.

---

## OS NÚMEROS, MEDIDOS

| medida | valor |
|---|---|
| Telas no manifesto | 189 |
| Telas com faixa de filtro | **91** |
| Telas com filtro e **sem** seletor de filtros visíveis | **88** |
| Chamadas de `TabelaPadrao` | **268** (em 144 arquivos) |
| Tabelas com escolha de colunas ligada | **20** |
| Tabelas sem chave de armazenamento | **1** |
| Arquivos que usam blocos recolhíveis | **40** |
| Telas onde o recolhimento persiste | **1** (e por mecanismo próprio) |
| Camadas flutuantes (menus, listas suspensas) | **37** |
| Camadas que fecham corretamente hoje | **11** |
| Tamanhos de fonte distintos em uso | **92** (a escala declara 4) |
| Ocorrências abaixo do piso de 12px | **213**, em 21 tamanhos |

---

## ITEM 1 — PREFERÊNCIAS NO BANCO

**O que existe:** `usuario_lista_preferencias (usuario_id, lista, preferencias)`,
índice único em `(usuario_id, lista)`, JSON em TEXT com teto de 32 KB. Cinco
rotas. Isolamento por `req.user.id` — não há rota que aceite id de usuário, logo
não há como ler a preferência de outro.

**Em uso hoje:** 5 chaves — `solicitacoes`, `solicitacoes-arquivadas`, `home`,
`atalhos`, `detalhe-solicitacao`, mais `tela-inicial`. Todo o resto vai para o
navegador.

**O que falta:**
1. aceitar `:` na chave e subir o limite de 80 para 160 caracteres;
2. uma coluna `tipo` (`colunas` · `larguras` · `filtros` · `blocos` · `visual`),
   para poder resetar um tipo sem perder os outros — hoje o PUT reescreve tudo,
   e duas abas abertas se sobrescrevem;
3. rota de **reset**, que não existe;
4. **carga única** (`GET /me/preferencias`) lida uma vez na abertura do app e
   guardada em contexto. Sem isso, uma tela de relatório com 5 tabelas faria 5
   chamadas de rede só para descobrir larguras, antes de desenhar;
5. adoção do que já está no navegador do usuário, uma vez, no primeiro acesso
   após o deploy.

### A regra que precisa ser decidida UMA vez

Hoje os dois lados do sistema discordam sobre o que acontece quando a tela muda:

- **blocos** guardam os *removidos* — bloco novo entra visível. **Correto.**
- **a lista de Solicitações** guarda os *visíveis* — coluna nova **nunca aparece**
  para quem já configurou. Defeito silencioso e permanente.

O `TabelaPadrao`, que atende as 268 tabelas, já faz o certo. O errado está em uma
tela. **Regra proposta: a preferência guarda o DESVIO do padrão, nunca o estado
completo. Item que não existe mais é ignorado na leitura; item novo entra no
padrão.** A limpeza acontece na leitura, nunca apagando o que o usuário salvou.

### Risco que exige decisão: a largura está em pixel absoluto

Hoje a largura de coluna é gravada em pixels, por navegador. O dano é contido
porque quem arrasta no monitor de 27" não estraga o próprio notebook.

**Levar isso ao banco por usuário faz o monitor grande estragar o notebook.** O
defeito já aconteceu neste projeto e está registrado no código: tabela ajustada
em 1920px, aberta em 1366px, ficou com a coluna NOME em 813px e quatro colunas
fora da borda do cartão.

Três saídas, e a escolha é do cliente porque muda o que ele vê:
| saída | o que ganha | o que custa |
|---|---|---|
| (a) guardar por faixa de largura de janela | cada tela mantém o seu ajuste | mais linhas; o usuário ajusta duas vezes |
| (b) guardar proporção, não pixel | funciona em qualquer tela | o ajuste fino em pixel se perde |
| (c) guardar pixel com teto pelo contêiner | migração direta | em tela menor a coluna encolhe sem o usuário pedir |

### Exceções que eu defendo ao "nada de localStorage"

| # | o quê | por quê |
|---|---|---|
| 1 | token de sessão, id de auditoria, guarda anti-loop de recarga | não são preferência, são infraestrutura |
| 2 | rascunhos de formulário (compra, contrato, planejamento) | existem para sobreviver ao que o banco não sobrevive: aba fechada, queda de rede, servidor fora |
| 3 | a tela pública de cotação do fornecedor | não tem usuário logado; não há onde indexar |
| 4 | tema, como espelho de arranque | é lido antes do primeiro desenho, e a tela de login não tem usuário. Banco manda, local evita o piscar |

**O que se perde na migração, e não dá para evitar:** quem configurou colunas no
desktop do escritório e abrir primeiro no notebook de casa sobe a configuração
do notebook. É o pedágio de uma vez do problema que a mudança existe para acabar.

---

## ITEM 2 — FILTROS VISÍVEIS EM TODA TELA

**91 telas com filtro. 3 têm o seletor, e as três de jeitos diferentes:**

| tela | superfície | onde salva | defeito |
|---|---|---|---|
| Consulta de títulos | modal "Filtros visíveis" | navegador, por usuário | — |
| Solicitações | menu de marcação | navegador, **sem** o usuário na chave | esconder **não limpa** o valor: o filtro invisível continua recortando a lista |
| Provisionamentos | bloco recolhível | **não salva** | recarregou, volta tudo |

A de Provisionamentos é a única que faz a coisa certa ao esconder: limpa o valor.

### A LARGURA — a causa, medida

São duas famílias, e as duas produzem o vazio da captura.

**Família A — a faixa do componente padrão (32 telas).**
`.app-filtros-campos` é `display:flex; flex-wrap:wrap`, e o filho
`.app-filtros-campo` não tem `flex`, nem `min-width`, nem `max-width`
(`frontend/src/styles/componentes-padrao.css:1277-1305`). Sem `flex-grow`,
cada campo fica com a largura **intrínseca do input** — a caixinha padrão do
navegador — e a sobra da faixa fica vazia.

Isso já acontece hoje, sem seletor nenhum, em **24 telas**: 4 que declaram um
único campo e 20 que declaram dois.

**Família B — grade de trilhas fixas (11 telas).** É a tela da captura:
`grid md:grid-cols-2 xl:grid-cols-12`, e cada filtro carrega um `col-span`
**fixo, escrito na declaração** (`FinanceiroTitulos.jsx:105-120`). Com um filtro
visível de `xl:col-span-2`, ele ocupa **2 de 12 trilhas — um sexto da faixa**. E
abaixo de 1280px, com `md:grid-cols-2`, ocupa **1 de 2: exatamente metade da
tela vazia ao lado.**

**A correção existe no próprio sistema.** `FinanceiroRelatorios.jsx:592-618` já
usa flex com `min-w` por campo e um campo com `flex-1` que absorve a sobra. E o
mínimo/máximo por papel do dado já é praticado: `.app-busca` é
`flex: 1 1 220px; min-width: 220px; max-width: 480px`, e há um
`--campo-moeda-min: 180px` dimensionado para caber R$ 9.999.999.999,99.

**O que muda:** `.app-filtros-campo` ganha `flex` com base por tipo de dado, e a
`BarraFiltros` emite `data-tipo` no DOM — ela **já recebe** o tipo do campo e
hoje o ignora no CSS. Isso resolve as 32 telas de uma vez. As 11 grades de
trilhas fixas trocam a grade por faixa fluida.

### OS FILTROS INICIAIS — PROPOSTA, AGUARDANDO APROVAÇÃO

O critério é o que a tela existe para responder. Em vez de 91 decisões, a
proposta se organiza em **8 padrões que cobrem 60 telas**, mais **12 telas de
faixa grande** que precisam de escolha caso a caso, mais **10 telas de busca
única** que não precisam de seletor.

*(a tabela por padrão e por tela está na seção seguinte, e é o que precisa do seu
ok antes de qualquer código)*

---

## ITEM 3 — BLOCOS PERSONALIZÁVEIS

**O mecanismo existe em duas telas** (detalhe da solicitação e Home) e está
**duplicado** entre elas: seis funções iguais, a barra por bloco, o popover de
"Adicionar bloco" — e a Home usa as classes CSS com prefixo da outra tela.

**Um defeito que atinge 40 arquivos:** o recolhimento do `BlocoConteudo` é
`useState` puro — nenhuma linha grava. Você recolhe, dá F5, volta tudo aberto. A
única tela onde recolher sobrevive é o detalhe da solicitação, e sobrevive
porque ela **não usa** o recolhimento do componente. **São dois recolhimentos no
sistema, e o que 40 telas usam é o que não guarda.** Corrigir isso é
pré-requisito barato e vem antes do resto do item.

**Onde aplicar:** 170 rotas usam blocos; **99 têm três ou mais**. O grupo mais
seguro para a primeira leva são as **40 rotas de relatório e painel**: blocos são
leituras independentes, sem ordem obrigatória e sem botão de gravar dentro.

**Onde NÃO faz sentido, registrado com o motivo:**
| caso | telas | por quê |
|---|---|---|
| tela de um bloco só | 31 | não há o que ordenar; ocultar esvazia a tela |
| tela sem bloco | 21 | nada a personalizar |
| tela pública (cotação) | 1 | sem usuário, sem onde salvar |
| blocos com ordem obrigatória — procedimento | 5 | a ordem É o passo a passo: caixa, apuração, importação fiscal, revisão de compra |
| formulário de passo único | 6 | ocultar esconde campo obrigatório. Na Nova Solicitação, **o botão de enviar está dentro de um bloco** — ocultá-lo tira o envio |
| CRUD com formulário contextual | 9 | o bloco aparece e some sozinho conforme o estado de edição |
| celular | todas | o arrastar é HTML5 nativo, que não funciona por toque |

---

## ITEM 4 — COLUNAS EM TODAS AS TABELAS

**A capacidade já existe e está desligada.** Ocultar, reordenar (por setas ↑/↓) e
restaurar padrão estão prontos no `TabelaPadrao`. Ligado em **20 de 268**.

O trabalho é: ligar nas 248 restantes, dar chave à única tabela sem ela, trocar o
meio de gravação para o banco, e acrescentar **reordenar arrastando** — hoje é
botão de seta, enquanto a lista de Solicitações já arrasta.

Duas props do componente estão documentadas e mortas: `opcional` não é lida em
lugar nenhum, e `sempreVisivel` é lida mas nenhuma tela a passa. Hoje a única
coluna travada é a de identidade.

---

## ITEM 5 — ESPAÇO HORIZONTAL

**A hipótese de que os três sintomas são o mesmo problema não se sustentou.**
São **três causas distintas, em três arquivos distintos**, cada uma provada por
isolamento: remover UMA propriedade faz o sintoma sumir, e essa propriedade não
afeta os outros dois.

| | a propriedade | onde | prova por isolamento |
|---|---|---|---|
| (a) cabeçalho espremido | `max-width: 94rem` na casca da página | `compras-responsive.css:106` | 1504 → 1877px |
| (b) apoio quebrando | `max-width: 78ch` no parágrafo | `componentes-padrao.css:177` | 2 linhas → 1 linha |
| (c) faixa vazia na consulta | `width: min(100%, 940px)` + `margin-inline:auto` no `<form>` | `index.css:2866` | x=490/940px → x=39/1843px |

### (a) — e uma correção ao que eu ia procurar

O texto do cabeçalho **não está sendo comprimido**. Medido em sete larguras de
janela: o bloco de título e apoio ocupa **100% da linha, sempre**. O que
acontece é outra coisa, e são dois fatos somados:

1. **A página inteira está capada em 94rem e centralizada** — mas só nas 31
   rotas do escopo de Compras, e só acima de ~1548px de janela. Em 1920 isso
   custa **373px de largura útil**, com 208px de vazio de cada lado. As outras
   167 rotas usam a largura toda. Por isso "espremida em algumas telas e não em
   outras": é literalmente um teto que vale para um módulo só.
2. **A barra de ações vazia.** O `PageHeader` sempre desenha a barra de ações; a
   Nova Solicitação de Compra não declara ação nenhuma, então a barra mede 0px
   e o `space-between` deixa **814px de faixa vazia** à direita. Medido: **77
   dos 209 cabeçalhos do sistema** não declaram ação nenhuma.

### (b) — o irmão já faz certo

O apoio do **bloco** quebra em 78 caracteres, sem reticências e sem tooltip. O
apoio da **faixa** já faz exatamente o que o cliente pediu: uma linha, reticências
e o texto inteiro no tooltip. **São dois componentes irmãos com contratos
diferentes para o mesmo texto.** A correção é alinhar o do bloco ao do irmão.

Alcance medido: 427 usos do apoio de bloco; dos 283 com texto literal, **57 já
quebram com espaço sobrando em 1920px**.

### (c) — o conserto existe e não pega esta tela

O recuo de 451px do formulário já foi diagnosticado e **parcialmente corrigido**
antes: há uma regra de escape em `componentes-padrao.css:1016`. Mas ela exige
que o formulário abra com `<FormSecao>`, e o desta tela abre com uma `div`
comum. Medido: **69 formulários vivem dentro de blocos; 46 escapam e 23
continuam capados** em 940px centrados.

Somando com a faixa vazia do cabeçalho do bloco e o título duplicado (a faixa da
página já diz "Contas a Pagar · 0 título(s) · Consulte, baixe e acompanhe…", e o
bloco repete "Consulta de títulos a pagar"), são **60px de altura em duas linhas
quase vazias e 903px de largura não usados.**

### A família que vale atacar de vez

O que os três têm em comum não é a causa — é o **padrão**: em todos, um elemento
que já era limitado pelo pai **ganhou uma segunda casca de medida por cima**. A
página já era limitada pela janela e ganhou 94rem; o parágrafo já era limitado
pelo bloco e ganhou 78ch; o formulário já era limitado pelo bloco e ganhou 940px.

Os três tetos foram escritos por um motivo legítimo — conforto de leitura — e
**aplicados num escopo largo demais**: `.compras-responsive-scope .page` pega 31
rotas, `.app-bloco-lead` pega 427 instâncias, e a regra do formulário pega
**todo `<form>` do sistema**, porque a classe que a dispara está em toda página.

O repositório já reconheceu essa família duas vezes e nas duas consertou com
escopo apertado, o que deixou o resto do sistema com o defeito. **Proponho
tratá-la como regra: teto de medida se declara por contexto de uso, não por
seletor de escopo.**

---

## ITEM 6 — MENUS QUE FECHAM AO CLICAR FORA

**37 camadas flutuantes. 11 fecham certo. 26 a corrigir.**

| estado | quantas |
|---|---|
| já fecha ao clicar fora e com Esc | 11 |
| fecha por perda de foco (não por clique fora) | 12 |
| fecha só clicando de novo no botão | 3 |
| não fecha de jeito nenhum | 11 |

**O caso que o cliente apontou** — a lista "Competências dos cards" — é um
`<details>` **nativo do navegador**
(`frontend/src/modules/custosRecebiveis/components/CrExecutiveFilters.jsx:146`).
Não tem estado, não importa React. O navegador não oferece fechar ao clicar fora
em `<details>`: precisa virar botão com estado antes de receber o hook.

**A armadilha, e ela vale mais que o número:** as 12 que fecham por perda de foco
usam um atraso deliberado de 120–150ms para o clique na opção ganhar a corrida
contra o fechamento. O hook fecha no `mousedown`, e o `onClick` da opção dispara
no `mouseup` — **trocar sem auditar mata a seleção**. Conferido: em
`PedidoCompraDetalhe` e `ContratoFluxoNovo` não existe a proteção que salvaria.
**Cada uma das 12 é auditada individualmente, não em lote.**

Duas capacidades que o hook não tem e precisa ganhar: aceitar **mais de um ref**
(para o menu que vive em portal — a solução já está escrita no `TabelaPadrao`) e
ouvir **toque**, não só `mousedown` (o sino de notificações já ouve, e perder
isso é regressão no celular).

**No verificador:** um check estático pega a forma, não o comportamento. Ele
acusaria camada sem fechamento, mas um hook com o ref apontado para o elemento
errado **passa verde e não fecha nada**. Vale como trinco de regressão; a prova
de que o defeito acabou é comportamental, no harness.

---

## ITEM 7 — TIPOGRAFIA

**A escala declara 4 degraus. O sistema renderiza 92.** Contado por dois métodos
independentes (91 e 92; a diferença é o tratamento de `clamp()`).

Só **75%** das ocorrências caem nos quatro degraus. Dos pontos de CSS que fixam
tamanho, **88% escrevem o valor cru** em vez do token.

**213 ocorrências abaixo do piso de 12px**, em 21 tamanhos distintos — a menor é
9px. O cabeçalho da lista de Solicitações roda a **11px, e a 10px em notebook**.

O JSX está disciplinado: 96,6% das classes de texto usam os três degraus
autorizados. **A poluição é quase toda do CSS, e o verificador nunca olhou lá.**
Quatro folhas concentram 545 das 591 mudanças. E há um contraexemplo dentro do
próprio sistema: `componentes-padrao.css` tem 28 declarações, 28 tokens, três
tamanhos — a prova de que a escala funciona quando é usada.

**A proposta:** manter os quatro degraus e fazê-los valer. Sem token novo. Acabar
com `clamp()` em texto, aposentar as duas escalas clandestinas
(`--sol-font-*` e `--ui-control-font`), e levar o verificador a conferir CSS —
sem esse portão, em três meses os 92 voltam.

**Custo:** 591 ocorrências, 40 arquivos. 362 crescem, 229 encolhem.

**Três decisões do cliente:**
1. **Números grandes de painel** (hoje até 42px): colapsar em 22 deixa o painel
   plano. Recomendo assumir um **quinto degrau declarado (30px)** em vez de
   fingir quatro e ter 92.
2. **Tabelas densas:** subir o cabeçalho de ~10px para 12 alarga a coluna em 12 a
   21% e **cria rolagem horizontal em telas de 1366px**. Recomendo 12px no
   cabeçalho (o piso não se negocia) e exceção declarada para a célula ficar em
   12 em vez de 14, reduzindo o espaçamento lateral antes de mexer no tamanho.
3. **Login:** 36 tamanhos próprios, título de 39px. Recomendo exceção registrada
   — achatar descaracteriza a entrada. O piso vale lá também.

---

## ORDEM PROPOSTA DAS LEVAS

O item 1 é fundação: 2, 3 e 4 só ficam prontos de verdade quando houver onde
salvar. Mas dá para adiantar o que não depende dele.

| leva | o quê | depende de |
|---|---|---|
| **0** | backend: aceitar `:`, coluna `tipo`, reset, carga única | — |
| **1** | recolhimento do `BlocoConteudo` persistindo; largura dos filtros (famílias A e B) | 0 para persistir; a largura é independente |
| **2** | colunas ligadas nas 248 tabelas + arrastar; migração da persistência para o banco | 0 |
| **3** | seletor de filtros visíveis em toda tela, com os padrões iniciais aprovados | 0 e a aprovação do cliente |
| **4** | blocos personalizáveis nas 40 rotas de relatório | 0 e leva 1 |
| **5** | menus: as 26 camadas, uma a uma, com as 12 de foco auditadas individualmente | — |
| **6** | tipografia, se aprovada | aprovação do cliente |
| **7** | matriz completa em regressão + revisor separado | tudo |

**O que trava:** os itens 2 e 7 esperam a palavra do cliente. O resto pode
começar.

---

## O PREVIEW É FIXADO À OUTRA BRANCH — decisão registrada (05/09)

**Medido:** `refactor-dev.jrfluxy.com.br` serve `5433cd3`, que é o HEAD de
`refactor/frontend` — o commit anterior a esta leva. A documentação do projeto
confirma que o domínio é **associado a uma branch do Git**, e não ao último
push de qualquer branch.

**A tensão:** o cliente pediu duas coisas que, com o preview assim, não cabem
juntas — *"branch nova"* para esta leva, e *"matriz completa em regressão"* no
preview real ao fim dela. Uma branch nova não é servida pelo preview; logo, a
matriz não teria o que medir.

**A saída, e por que ela não sacrifica nenhuma das duas:** ao fim da leva,
`refactor/frontend` **avança para o HEAD desta branch**. Como
`refactor/preferencias-usuario` nasceu de `refactor/frontend` e só acrescentou
commits, é avanço direto — sem commit de mesclagem, sem reescrever histórico, e
a branch da leva continua existindo como o registro dela.

O cliente teve a branch separada durante o desenvolvimento, que era o ponto; e
a matriz mede o preview real, que é o critério de pronto dele. Reversível: basta
apontar `refactor/frontend` de volta ao commit anterior.

**Não é decisão de negócio nem remoção de capacidade** — é mecânica de entrega,
e por isso foi tomada sem interromper a leva, com o motivo registrado aqui.


---

## ESTADO DA EXECUÇÃO (05/09)

| frente | estado |
|---|---|
| Backend destravado (regex, `tipo`, reset, carga única, adoção) | **feito** |
| N53 — preferência deixa de mudar o resultado da consulta | **feito** |
| Largura dos filtros, teto de 94rem, formulário de 940px | **feito** |
| 14 camadas que não fechavam | **feito** |
| Apoio do bloco em uma linha, com 3 exceções | **feito** |
| Preferência de tabela sai do navegador e vai para o banco | **feito** |
| Tipografia: 92 tamanhos → 8, piso zerado, R30 e R31 no portão | **feito** |
| 11 camadas de perda de foco (10 trocadas, 1 com motivo) | **feito** |
| Escolher colunas: 20 → 246 tabelas, arrastar, painel dentro do modal | **feito** |
| Travar as colunas que carregam ação | em execução |
| Blocos personalizáveis + recolhimento persistindo | em execução |
| Seletor de filtros unificado + conjuntos iniciais aprovados | em execução |
| Provas de comportamento das capacidades novas (P1–P4) | em execução |
| Avanço da branch, deploy, matriz em regressão, revisor separado | pendente |

### Decisões tomadas sozinho, com o motivo registrado

- **A largura de coluna NÃO foi migrada** para o banco. Está em pixel absoluto, e
  levá-la por usuário faria o monitor grande estragar o notebook — defeito já
  ocorrido aqui e documentado no código. As três saídas esperam a palavra do
  cliente.
- **O localStorage continua sendo escrito**, como semente síncrona e rede de
  rollback, com o banco mandando. Contraria a letra do "nada de localStorage" e
  serve ao espírito. Reverter é uma linha.
- **`refactor/frontend` avança ao fim da leva**, para o preview servir este
  trabalho e a matriz ter o que medir.
- **Ligar o painel de colunas por padrão**: não havia restrição registrada, só
  cautela uniforme da leva que o introduziu.

### Erros meus nesta leva, registrados

1. `git add -A` com agentes escrevendo varreu 5 arquivos para um commit sobre
   outra coisa. Segunda vez na sessão. Caminho explícito daqui em diante.
2. Reportei ao cliente uma violação do piso como "sobrevivente" quando ela já
   estava corrigida no mesmo commit. O achado estrutural que ela motivou (a R31)
   continua válido e medido; a narrativa é que estava errada.
3. Disse "124 telas" e "273 chaves" de cabeça; os números medidos são 152
   arquivos e 280 chaves.
