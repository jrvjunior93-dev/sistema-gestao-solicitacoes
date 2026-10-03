# DEFINIÇÃO DE PRONTO (DoD) — por tela, verificável, sem interpretação

Criada em 02/09 por decisão do cliente, depois que "pronto" reportado em
mock local chegou com defeito no preview publicado.

**"PRONTO" significa UMA coisa só:** verificado NO PREVIEW PUBLICADO
(https://refactor-dev.jrfluxy.com.br), com dados REAIS, em TODAS as telas do
escopo, contra os itens abaixo, com evidência por tela (captura + resultado
PASSOU/FALHOU por item). Qualquer outra coisa é "em andamento".

- "Implementado no componente" NÃO é pronto — é capacidade, não cobertura.
  Só verificação NA TELA muda o estado de um item.
- Quem verifica é o harness `frontend/scripts/qa-preview/` (Playwright contra
  o preview real, logado com o usuário de QA), que gera a
  `docs/MATRIZ-COBERTURA.md` automaticamente. Matriz não se edita à mão.
- Quando o cliente aponta um defeito que a DoD não cobre, o item entra AQUI
  ANTES da correção, e a matriz roda de novo em todas as telas.

## Como cada item é verificado

Cada item recebe **PASSOU / FALHOU / SEM DADO / N/A** por tela. N/A só
quando o item não se aplica ao tipo da tela (ex.: C3 em listagem, X1 em tela
sem tabela) — e o motivo do N/A é registrado pelo harness. **SEM DADO** é
quando a tela TEM a capacidade e a base do preview não devolveu registro
para exercitá-la: não é aprovação, e não vira aprovação por equivalência com
outra tela. FALHOU vem com o seletor do elemento e a medida que reprovou.

---

## O QUE A VERIFICAÇÃO AUTOMÁTICA NÃO ALCANÇA (03/09)

**Esta é a seção mais importante deste documento, e ela existe porque um
defeito destrutivo passou por tudo.**

Todo check que construímos — os 34 itens desta DoD, o validador estático, o
harness contra o preview — mede **FORMA**:

- o elemento **existe** no DOM (C1, B1, A1);
- a medida **está** num degrau da escala (R10, M1);
- o alinhamento do `th` **é igual** ao do `td` (T1);
- o contraste **atinge** 4,5:1 (M3);
- a palavra **não** quebra ao meio (T6).

Todas essas perguntas têm resposta observável: aponta-se para o elemento e
mede-se. Um programa consegue fazer isso, e é por isso que conseguimos
automatizá-las.

**O defeito de 03/09 não era de forma. Era de SEMÂNTICA.**

O código estava assim:

```js
const ok = await confirmar({ titulo: 'Estornar título?' });
if (!ok) return;
estornar();
```

Ele **compila**. Passa no `eslint`. Passa no `npm run build`. Passa nos 34
itens da DoD. Passa no validador estático. Passa no harness contra o preview
publicado. A tela **renderiza corretamente**: a caixa de confirmação aparece
no lugar certo, com o texto certo, o botão "Cancelar" com o contorno certo e
o alvo de clique certo.

E faz **o oposto do que promete**: `confirmar()` devolve `{ ok, texto }`, e
objeto é sempre truthy — então `!ok` é sempre falso, o `return` nunca
acontece, e clicar em **"Cancelar" ESTORNA O TÍTULO**.

Nenhum check pega isso, e não é por descuido de quem os escreveu. Para pegar,
o verificador precisaria saber **o que a ação promete ao usuário** e
comparar com **o que ela faz**. Isso não é medição: é leitura.

### A regra que fica

> **Verificação automática cobre FORMA. SEMÂNTICA exige LEITURA.**
>
> Nenhuma quantidade de check verde prova que a tela faz o que diz. O
> revisor separado não é redundância nem cerimônia: é o único instrumento
> que temos para a classe de defeito em que o código está formalmente
> correto e semanticamente invertido.

**Por isso o revisor separado existe, e por isso ele lê o código e as
capturas — não os relatórios.** Um revisor que lê "34/34 PASSOU" e aprova
não está revisando: está repetindo o que o harness já disse.

### Os três defeitos graves desta reforma, e como cada um foi achado

| Defeito | Consequência | Achado por |
|---|---|---|
| `confirmar()` lido como booleano | "Cancelar" estornava título financeiro | **Leitura** |
| Contraste "4,92:1 com folga" que na tela era 4,50 | Texto no limite do ilegível, e um commit meu afirmando o contrário | **Leitura** (o token era sobrescrito em runtime) |
| Faixa fixa quebrada em nove telas de detalhe | Ação principal sumia ao rolar | **Leitura** (`overflow: hidden` num ancestral) |

**Nenhum dos três foi achado por check.** Todos os três viraram check
DEPOIS — R21, R24 e R18 — e é assim que tem de ser: a leitura acha, e o
check impede a volta. O caminho nunca é o inverso.

### Uma terceira categoria, pior que as duas: CONSENTIMENTO

Forma e significado não esgotam o problema. Existe uma classe acima das
duas, e ela apareceu nesta reforma:

| Classe | O que quebra | Exemplo | Quem pega |
|---|---|---|---|
| **Forma** | o elemento não está certo | palavra quebrada ao meio | check |
| **Significado** | o código faz o oposto do que promete | "Cancelar" estorna o título | leitura |
| **Consentimento** | a pessoa autoriza uma coisa e outra acontece | pergunta sobre 3, apaga 47 | leitura |

Na classe de **consentimento** o cancelamento FUNCIONA. Clicar em
"Cancelar" cancela. A confirmação aparece, com o texto certo, no lugar
certo — e cita um número que **não vem da coleção que a ação percorre**. A
pessoa lê, entende, autoriza. E o estrago é outro.

É a pior das três porque **não deixa rastro de erro**: a trilha de auditoria
registra um consentimento válido para uma ação que ninguém autorizou. Nem o
usuário sabe que foi enganado.

Há um check para a forma detectável dela (família D da
`varreduraCancelamento.mjs`, bloqueante: o número citado tem de vir da
coleção que a ação percorre). Mas ele é análise de **nome**, e três casos
reais escapam dele por construção: mesmo nome com conteúdo diferente,
mensagem sem número, e critério de filtro divergente. Esses três são
**leitura obrigatória do revisor**:

> Em toda confirmação de ação destrutiva, ler os dois lados juntos: **o que
> a mensagem promete é exatamente o que a ação faz?** Não basta a coleção
> ter o mesmo nome — tem de ser o mesmo conjunto, no mesmo momento, com o
> mesmo critério.

E a regra de escrita que vem junto: **toda confirmação destrutiva declara a
irreversibilidade no próprio texto** ("Descartar 3 rascunhos? Esta ação não
pode ser desfeita."). "Descartar" sozinho deixa a pessoa supor que dá para
recuperar. Se um lote for interrompido no meio, o que já foi feito fica
feito — não se tenta desfazer, e o texto avisa disso antes.

### Premissa afirmada não é premissa verificada (03/09)

Regra permanente de processo, e ela nasceu de um caso concreto: o cliente
afirmou que existiam 43 pontos com o cancelamento quebrado, e depois que a
confirmação e a ação da `ObraTipoApropriacao` operavam sobre listas
diferentes — "perguntava sobre 3 e apagava 47".

**Os dois foram ao código antes de virar trabalho, e os dois não se
confirmaram.** As 43 não existem: a varredura em todo o `src/` dá zero, e a
quebra dos 726 diálogos congelados explica por quê (643 são `alert`, que não
tem cancelamento). E a `ObraTipoApropriacao` confirma e age sobre um vínculo
só, com o mesmo `obra_id` e o mesmo `tipo_solicitacao_id` nos dois lados.

> **Quando alguém afirmar um defeito — o cliente, um agente, um relatório —
> confira no código ANTES de agir. Premissa errada aceita produz trabalho
> que parece certo e não é**: um diff plausível sobre código que já estava
> correto, com mensagem de commit convincente e nenhum defeito resolvido.
> Pior que não fazer nada, porque consome a revisão e cria a impressão de
> que o problema foi tratado.

Desmentir com evidência é parte do trabalho, não atrito. E o inverso também
vale: **ir ao código quase sempre rende**, mesmo quando a premissa não se
confirma. Destas duas verificações saíram a cobertura de `prompt()` (19
chamadas que a varredura nem olhava), a correção do falso positivo em
`if (!motivo?.trim())`, o check bloqueante de família D e a terceira classe
de defeito acima.

### TODA REGRA NASCE COM PROVA NOS DOIS SENTIDOS (03/09)

Prática obrigatória, e ela é a resposta à pergunta que mais custou nesta
reforma: **verde significa "o código está certo" ou "o check não olha"?**
De fora, as duas leituras são idênticas.

> **Regra sem prova de que REPROVA é regra não verificada.** Toda regra nova
> nasce com dois testes: um caso que ela tem de reprovar, e um caso limpo
> que ela não pode acusar. Regra antiga sem essa prova entra na fila para
> ganhá-la.

O instrumento é `frontend/scripts/provas/regrasMordem.mjs`, dentro do
`test:responsive`: ele planta uma violação mínima de cada regra estática
numa tela temporária do manifesto e exige que o validador a reprove. Se uma
regra deixar de morder — reescrita, seletor mudado, variável fora de escopo
— a prova reprova ANTES de a regra ser usada como garantia.

**O que a primeira execução encontrou, e é o argumento inteiro:** das 8
regras estáticas, **2 não mordiam**.

| Regra | O que ela prometia | O que ela cobria de verdade |
|---|---|---|
| **R21** | "`confirmar()` lido como booleano reprova" | só a forma `const ok = await confirmar(...)`. A negação direta, `if (!await confirmar(...)) return;`, passava batido — e quebra igual. |
| **R18** | "`overflow: hidden` em ancestral de sticky reprova" | só ARQUIVOS CSS. `style={{ overflow: 'hidden' }}` no JSX era invisível — e é assim que o defeito aparece na prática: a raiz da `ComunicacaoInterna` tinha exatamente isso, ancestral de tudo. |

As duas estavam verdes. As duas cobriam metade do que prometiam. E as duas
só apareceram **quando o check foi testado no sentido de reprovar** — não
por defeito em tela nenhuma.

Repare no que isso significa para a R18: ela nasceu justamente para pegar o
defeito das nove telas de detalhe com a faixa fixa quebrada. Depois disso,
o mesmo defeito reapareceu na `ComunicacaoInterna` — e foi achado por
LEITURA, com a regra criada para pegá-lo passando verde ao lado.

**Lacuna declarada**: os 27 itens da DoD medidos no navegador (C*, T*, F*,
B*, M*, X*, A1) **ainda não têm prova de mordida**. Eles rodam contra o
preview publicado e precisam de uma tela-fixture com violações plantadas
para serem provados do mesmo jeito. Até lá, nenhum deles pode ser tratado
como verificado só por aparecer verde. Está registrado como lacuna, não
como cobertura.

### O NÚMERO QUE RESUME O PROCESSO (03/09)

Auditoria completa dos instrumentos, no sentido de REPROVAR:

| Superfície | Auditados | Não mordiam | Quais |
|---|---|---|---|
| Regras estáticas (`validarLayout.mjs`) | 8 | **2** | R18, R21 |
| Itens da DoD no navegador (`checks.mjs`) | 27 | **5** | X3, T4, C2, B1, T7 |
| **Total** | **35** | **7** | |

**Nenhum dos sete foi encontrado por defeito em tela. Todos apareceram ao
conferir o instrumento.** É a justificativa permanente de
`provas/regrasMordem.mjs` e `provas/itensDaDoDMordem.mjs` estarem no gate:
sem eles, um check que para de olhar continua verde para sempre, e a
primeira notícia vem de um usuário.

Dois deles não mediam **nada**, não "mediam pouco":

- **X3** abria com `document.scrollingElement.scrollWidth > innerWidth`, e o
  sistema declara `overflow-x: clip` em `html/body/#root` de propósito. Com
  `clip` esse valor nunca passa da janela: condição morta, e a busca do
  culpado ficava atrás dela.
- **T4** media a folga pelo `scrollWidth` de um filho **inline**, que é
  sempre zero, e usava como sinal de quebra uma condição verdadeira em toda
  tabela com coluna de identidade. Errava nos dois sentidos: acusava a
  fixture limpa e absolvia a fixture com defeito.

**Os 7 do runner, auditados em 04/09** (`provas/itensDoRunnerMordem.mjs`,
com fixture que monta os COMPONENTES REAIS): **6 passaram de primeira**
(C1, F3, R1, X2, M2, R3), **1 precisou de correção** — a **T3** — e **0
não-prováveis**.

**SALDO FINAL DA SÉRIE: 42 instrumentos auditados, 8 não mordiam, 0
declarados não-prováveis. Nenhum dos oito foi encontrado por defeito em
tela — todos apareceram ao conferir o instrumento.**

| Superfície | Auditados | Não mordiam |
|---|---|---|
| Regras estáticas (`validarLayout.mjs`) | 8 | 2 — R18, R21 |
| Itens da DoD no navegador (`checks.mjs`) | 27 | 5 — X3, T4, C2, B1, T7 |
| Itens do runner (`verificar.mjs`) | 7 | 1 — T3 |
| **Total** | **42** | **8** |

### A distinção que a série deixa como regra

> **Prova de que PASSA e prova de que REPROVA são coisas diferentes, e só a
> segunda garante alguma coisa.**

Todo check aqui já "passava" — em dezenas de telas, em dezenas de corridas.
Oito deles não olhavam nada. Verde é compatível com "o código está certo" e
com "o instrumento está cego", e a única pergunta que separa as duas é:
**mostre-me este check reprovando.**

**Limites declarados desta auditoria** (não são exceção nem cobertura — são
o que a prova NÃO alcança):

- **X2 não mede compactação** da faixa no mobile; quem mede é a C1. Faixa
  que não compacta em 390px passa verde.
- **R1 só se aplica a ação principal rotulada "Novo/Nova"** — "Cadastrar
  usuário" cai em N/A e escapa da regra inteira.
- **C1 dá PASSOU em página sem rolagem** ("sem estado grudado a medir").
- Três defeitos de F3 e C1 usam markup cru, porque o markup real é gerado
  pelos componentes: provam o **check**, não o componente.

### Check que procura pelo RÓTULO cobre vocabulário, não comportamento

A R1 é o exemplo, e a lição é geral. Ela só se aplica quando a ação
principal se chama **"Novo"** ou **"Nova"** — qualquer outro rótulo cai em
N/A e escapa da regra inteira. "Cadastrar usuário", "Adicionar parceiro",
"Incluir título": todos passam sem serem medidos, e a matriz mostra um `—`
que parece decisão registrada.

> **Quando um check depende do rótulo do elemento para achar o alvo, ele
> cobre o VOCABULÁRIO que conhece, não o COMPORTAMENTO que a regra
> descreve. Vocabulário novo escapa em silêncio** — e escapa como N/A, que
> é a aparência de "não se aplica", não a de "não foi medido".

É a forma mais educada de ficar cego: o check não erra, ele simplesmente
não é chamado. Por isso todo check que localiza o alvo por texto declara,
no próprio código, qual vocabulário ele reconhece — e essa lista é lida
como o que ela é: o limite da cobertura, não a definição da regra.

### A T3, e a lição que ela fecha

A T3 tinha CINCO ramos. Três mordiam. Dois estavam **mortos** — e um deles
era o coração da regra:

1. **O invariante de posse não media nada.** Ele varria o `localStorage`
   por `/larguras|colunas/i`, e a chave real de larguras é
   `tabela:<tela>:<lista>:v3` — **não contém nenhuma das duas palavras**.
   Nunca casava. Pior: a única chave que o regex casava é
   `tabela:<x>:colunas`, que guarda visibilidade e ordem — bastaria alguém
   mexer no painel de colunas para a T3 acusar um arrasto que nunca houve.
   **Errado nos dois sentidos**: verde onde devia morder, vermelho onde não
   há defeito.
2. **"A tabela não pode estourar sem rolagem" era matematicamente
   impossível** — se a tabela é mais larga que o contêiner, o `scrollWidth`
   do contêiner já é pelo menos a largura da tabela. Mesmo formato da X3.

**E esta T3 foi escrita por mim, nesta mesma série, um dia antes** — ao
descobrir que a versão anterior exigia o oposto da regra acordada. Escrevi
um check novo e o usei imediatamente como garantia, sem prová-lo. É
exatamente o que esta seção da DoD passou a proibir, cometido por quem
acabara de escrever a proibição.

**A lição não é "checks antigos apodrecem". É que check recém-escrito é tão
suspeito quanto check antigo** — mais, até, porque ninguém desconfia do que
acabou de fazer. Prova nos dois sentidos não é auditoria de legado: é parte
de escrever a regra.

### O corolário incômodo

Quando um check vira verde, a pergunta certa não é "acabou?". É **"o que
este check NÃO estava olhando?"**. Nesta reforma, sete pontos cegos do
verificador foram achados assim — inclusive um caso em que **um check verde
provava que o outro estava certo**: a T3 passava porque a tabela não
redistribuía largura nenhuma, que era exatamente o defeito que a T4
apontava.

## CABEÇALHO

- **C1** Faixa fixa presente; ao rolar, gruda ENCOSTADA na topbar (top da
  faixa = base da topbar, sem folga), compacta sem sumir, e NENHUM conteúdo
  da lista fica visível entre a base da topbar e o topo da faixa (vão
  transparente é reprovação).
- **C2** Título em 22px; apoio (contagem + descrição) em UMA linha, sem
  quebra, na própria faixa; contagem junto do apoio.
- **C3** Seta de voltar à esquerda do cabeçalho — SÓ em tela de
  detalhe/registro (em listagem, N/A; seta presente em listagem também é
  defeito de R11).
- **C4** Em tela de detalhe: nome/identificação do registro com destaque
  (peso e escala de título). Número sem nome é defeito.
- **C5** Ações principais à direita: UM primário sólido, secundários em
  contorno, destrutiva apartada.
- **C6** Nenhum link de navegação disfarçado de ação (barra de
  ações sem navigate/Link de "ir para" — R11).
  **Escopo declarado**: a C6 pressupõe o shell (menu, breadcrumb, Ctrl+K).
  Em tela que renderiza FORA do `Layout` ela **se inverte** — o link de
  navegação é a única saída e é obrigatório. Ver a seção "TELAS FORA DO
  SHELL" abaixo e a R11 em `docs/REGRAS-LAYOUT.md`. Não é exceção de tela:
  é escopo da regra, e vale para qualquer tela futura fora do shell.

## TABELAS

- **T1** Título e conteúdo da coluna com o MESMO alinhamento (th × td).
- **T2** Menu de alinhamento no cabeçalho, com affordance VISÍVEL (cursor +
  ícone no hover + tooltip). Capacidade sem sinal não existe (R15).
- **T3** Redimensionamento arrastando muda SÓ a coluna arrastada e PERSISTE
  ao recarregar a página.
- **T4** Colunas proporcionais ao conteúdo — sem coluna sobrando enquanto
  outra espreme (a sobra vai para a coluna de conteúdo).
- **T5** Coluna de identificação exibida em MAIÚSCULAS; sublinha em caixa
  normal.
- **T6** O MAIOR nome real da base não corta feio (reticências no meio de
  palavra sem tooltip = FALHOU; truncar com title completo é aceitável para
  texto, nunca para valor).
- **T7** O MAIOR valor monetário real da base não vaza nem trunca — NUNCA.
  Largura da coluna de valor dimensionada pelo pior caso real.
- **T8** Os títulos da MESMA tabela assentam na MESMA linha de base (05/09,
  achado do cliente na tela de Obras: "AÇÕES" ficava acima das vizinhas).
  Título fora do embrulho padrão — ou dentro de caixa de linha diferente —
  desalinha a fileira inteira, e o olho lê isso como descuido antes de ler
  qualquer dado. Mede-se a linha de base do TEXTO, não a caixa do `th`, que
  é igual por construção; tolerância de 1px.

  A causa que originou o item vale como aviso: a coluna ordenável desenha o
  título num `<button>` e a estática num `<span>`. Com altura mínima (o
  alvo de clique da ordenação), o navegador centraliza o conteúdo do botão
  e encosta o do span no topo — duas tags, duas caixas, 9,5px de desvio na
  mesma fileira. Mesma tag ou mesma caixa: uma das duas.

## FILTROS E BUSCA

- **F1** UMA única caixa de busca no contexto, ocupando a largura da faixa
  (duas buscas no mesmo contexto = FALHOU — R16).
- **F2** Filtros marcáveis (checkbox, múltipla seleção); nenhum select de
  filtro (select de formulário e seletor de contexto seguem legítimos — R12).
- **F3** Etiquetas de filtro ativo visíveis e removíveis.
- **F4** Espaçamento entre a linha de filtros e a tabela vem da escala
  (16px), igual em toda tela — nem colado, nem sobrando.

## BLOCOS

- **B1** Fundo cinza-azulado (canvas) com blocos brancos flutuando.
- **B2** UM bloco principal com barra de cor; secundários neutros.
- **B3** Cada informação aparece UMA vez só na tela (mesma contagem/apoio na
  faixa E no bloco = FALHOU). **O mesmo dado com PAPÉIS diferentes não é
  duplicação** — ver o refinamento abaixo.
- **B4** Campo vazio some, com contador "ver N campos vazios".
- **B5** Nenhum texto solto fora de bloco (todo texto tem superfície).

## MEDIDAS E CORES

- **M1** Alvo mínimo 32×32px desktop / 44×44px toque em todo botão e ícone
  clicável.
- **M2** Nenhuma medida fora da escala (4/8/12/16/24/32/48; tipo
  12/14/18/22) — exceção só com registro no manifesto.
- **M3** Contraste AA (4.5:1 corpo, 3:1 texto grande) em todo texto.
- **M4** Comparações: previsto AZUL × realizado VERMELHO, mesma cor da série
  no KPI, no gráfico e na tabela.

## FORMULÁRIOS

- **R1** Cadastro raro abre em MODAL, não inline na tela.
- **R2** Campos da mesma linha alinhados (mesma altura/baseline), largura
  por tipo de dado.
- **R3** (novo, 02/09 — decisão do cliente) **Nenhum `alert()`,
  `confirm()` ou `prompt()` do navegador.** Aviso de erro/sucesso usa `Avisos`/`useAvisos`
  (faixa dentro da página, tom semântico do sistema); confirmação usa
  `useConfirmacao` (modal do sistema, com o rótulo dizendo o que vai
  acontecer e a ação destrutiva em vermelho suave e apartada).
  Motivo: a caixa do navegador ignora tema, tipografia e tokens, bloqueia a
  página, não pode ser medida pelo harness e some sem deixar rastro no DOM.
  Confirmação que precisa de texto (justificativa de estorno, motivo de
  cancelamento) usa `campo` no `useConfirmacao` — não `window.prompt`.
  Verificação: **R19** no validador estático, valendo para o sistema
  inteiro, com o passivo herdado congelado em trinco (`scripts/trinco-dialogos.json`)
  que só pode diminuir; e no harness, um spy de `dialog` na página real que
  reprova a tela em que qualquer caixa do navegador dispara.

## ESTRUTURA E ACESSIBILIDADE

- **R18** Nenhum ancestral de faixa fixa, coluna fixa ou contêiner de
  rolagem de tabela usa `overflow: hidden` (que mata o `position: sticky`
  em silêncio). Corte com `overflow: clip`.
- **A1** Toda linha acionável tem caminho por TECLADO: `tabIndex` com
  Enter/Espaço, ou um link/botão focável dentro da linha que faça a mesma
  ação. N/A só em tela sem linha acionável.

## PREFERÊNCIAS DO USUÁRIO (06/09)

Quatro itens novos, e eles existem por um motivo que vale mais que a lista:
a leva de preferências construiu **quatro capacidades novas** e a matriz dos
35 itens anteriores prova apenas que **o que existia antes não quebrou**.
Nenhuma célula dela olha para o que foi construído agora. Fechar a leva sem
estes quatro é fechar com "eu acho que funciona".

**Todos medem EFEITO, nunca presença.** É a lição do T2, que passou verde em
189 telas medindo a existência de um ícone enquanto o menu que ele abria
estava recortado e ninguém no sistema conseguia alinhar coluna nenhuma — foi
o cliente que achou, na tela, o que 189 células verdes diziam estar certo.
Aqui: nenhum item pergunta se o painel existe, se o botão está lá, se a
classe foi aplicada. Cada um exercita a capacidade e mede o que acontece
depois.

- **P1** **Escolher colunas funciona e a escolha viaja.** Abrir o painel
  "Colunas"; esconder uma coluna que **não seja a de identidade** (a caixa
  habilitada é o critério — a de identidade é travada pelo componente);
  conferir que a coluna sumiu do **cabeçalho E das células** (`th` fora e
  contagem de `td` da linha caindo exatamente um — cabeçalho e corpo
  desalinhados é pior que a coluna visível); recarregar; conferir que
  continua escondida. E o passo que separa esta leva de um localStorage a
  mais: conferir que a preferência **foi para o BANCO** — a chamada
  `PUT /listas/:lista/preferencias/colunas` sai ao esconder, **ou** a leitura
  seguinte vem de `GET /me/preferencias` trazendo a coluna oculta. Sem
  nenhuma das duas, **FALHOU**, mesmo com a coluna escondida e persistida:
  no DOM, banco e navegador são indistinguíveis, e era o navegador que fazia
  a mesma pessoa ver listas diferentes conforme a máquina.
  Ao final, **restaurar o padrão** ("Restaurar padrão" do painel, que emite
  o DELETE). O ambiente é compartilhado e a preferência agora é por usuário
  no servidor: coluna deixada escondida não morre com o navegador
  descartável do harness — espera a próxima corrida e estraga a medição
  dela. Restauração que não restaura **reprova o item**, porque é defeito da
  capacidade, não detalhe de limpeza.
  Tabela com menos de 3 colunas de conteúdo → N/A (abaixo do limiar do
  painel). Tabela com **3 ou mais** colunas de conteúdo e **sem** painel →
  **FALHOU**: com 3 declaradas e só a de identidade travada o componente
  deveria oferecê-lo, e recusa deliberada se declara no manifesto
  (`naoAplica.P1`), não se deduz do silêncio.

- **P2** **Esconder filtro limpa o valor e refaz a consulta** — é o achado
  crítico **N53**. Nas telas que têm o seletor "Filtros visíveis": aplicar um
  filtro, medir o resultado, esconder aquele filtro pelo seletor, e conferir
  que **o resultado MUDOU** (porque o valor foi limpo e a consulta refeita) e
  que o campo **não ficou no DOM recortando escondido** com o valor dentro.
  O defeito não tem sintoma visual: a tela fica idêntica à tela certa. A
  pessoa lê "12 registros", não vê filtro nenhum em campo, conclui que são
  todos — e leva o número para uma decisão.
  "O resultado mudou" é medido por três leituras somadas, e qualquer uma que
  mude basta: linhas à vista, total declarado (faixa ou paginação) e texto
  da primeira linha. Contar só as linhas reprovaria toda listagem paginada
  no servidor, onde um filtro corta de 4000 para 300 sem mexer nas 25 da
  página — defeito do verificador vestido de defeito da tela.
  Nas telas **sem** o seletor, o item é **N/A declarado**, não falha: hoje
  três telas o oferecem (Consulta de títulos, Solicitações e
  Provisionamentos, em cinco endereços) e 88 telas com filtro ainda não o
  receberam. Reprová-las seria a matriz acusando a tela de uma etapa que o
  plano ainda não executou.

- **P3** **Recolher bloco sobrevive à recarga.** Recolher um bloco
  recolhível, recarregar, conferir que continua recolhido. Só nas telas onde
  o recolhimento foi ligado à preferência.
  **O portão é comportamental, e essa é a parte que importa.** Saber se uma
  tela ligou a persistência não se lê no DOM — o bloco é idêntico com e sem
  `chavePreferencia`. Então cruzam-se duas leituras, e cada cruzamento tem
  veredito próprio: recolher **gravou** (saiu `PUT .../preferencias/blocos`)
  → a recarga TEM de trazer o bloco recolhido, e não trazer é **FALHOU**;
  não gravou e o arquivo da tela **não** declara `chavePreferencia` → **N/A**
  com o motivo escrito; não gravou e o arquivo **declara** → **FALHOU**, a
  tela diz que ligou e o recolhimento não guarda nada. É o terceiro caso que
  impede o item de virar decoração: sem ele, a ausência de gravação — que é
  o defeito, e atinge 40 arquivos — sairia como cinza.

- **P4** **Camada flutuante fecha ao clicar fora, com Esc, e a seleção
  acontece.** Abrir um menu ou lista suspensa; clicar em `document.body`
  bem longe dela (a 200px da caixa, num ponto que não seja acionável —
  clicar às cegas violaria "somente navegação e leitura"); conferir que
  **saiu do DOM ou ficou invisível**. Reabrir, apertar **Esc**, mesma
  conferência. E a terceira, **que é a que ninguém lembra**: reabrir e
  clicar numa **OPÇÃO**, conferindo que a seleção **ACONTECEU** (a marcação
  mudou de estado).
  A terceira não é zelo: o levantamento mediu 12 camadas que fecham por
  perda de foco com um atraso deliberado de 120–150ms, e o atraso existe
  para o clique na opção ganhar a corrida contra o fechamento. O hook novo
  fecha no `mousedown` e o `onClick` da opção dispara no `mouseup` — trocar
  sem auditar **mata a seleção**. Ou seja: o jeito mais barato de fazer as
  duas primeiras partes ficarem verdes é quebrar a terceira, e um item sem
  ela ficaria verde exatamente na tela que piorou.
  Só **opção de marcação** é clicada (caixa/rádio), nunca item de ação:
  item de menu costuma ser "Excluir", "Duplicar", "Enviar", e clicar num
  deles para provar que a camada seleciona criaria ou apagaria registro de
  verdade no ambiente compartilhado. Camada que fecha nas duas primeiras e
  não tem opção segura para a terceira é **SEM DADO**, não aprovação.

**Alcance medido em 06/09, sobre as 189 telas do manifesto** (estimativa
estática — quem decide célula a célula é a corrida):

| item | mede | N/A, com o motivo | por que |
|---|---|---|---|
| P1 | **124** telas renderizam `TabelaPadrao` | 65 sem tabela | tela de formulário, hub e painel sem lista |
| P2 | **3** telas têm o seletor (`financeiro-titulos`, `solicitacoes`, `provisoes`) | 186 sem seletor | 88 telas com filtro ainda não o receberam (item 2 do plano) |
| P3 | **8** telas declaram `chavePreferencia` em bloco | 27 com bloco recolhível **sem** chave + 154 sem bloco | a persistência foi ligada em 8 das 40 rotas com bloco recolhível |
| P4 | **135** telas têm alguma camada flutuante | 54 sem camada | formulário e detalhe sem menu, sem painel e sem filtro marcável |

As células **SEM DADO** não entram nesta conta porque dependem da base do
preview no dia (tabela sem linha, nenhum filtro que corte a lista, camada
sem opção segura de exercitar) — e é justamente por isso que a matriz as
imprime ao lado das que falharam, e não no rodapé.

**Regras de medição que valem para os quatro** (e não se negociam):
somente navegação e leitura — nenhum registro criado, alterado ou apagado;
preferência de exibição pode ser mexida **desde que restaurada** no fim, em
`finally`; capacidade que existe mas a base do preview não deu registro para
exercitar é **SEM DADO** (não é aprovação e não vira aprovação por
equivalência com outra tela); capacidade que a tela não tem por natureza é
**N/A com motivo registrado**.

## TELAS FORA DO SHELL — DoD própria (03/09)

Quatro telas renderizam **sem o `Layout`**: sem topbar, sem menu lateral,
sem breadcrumb — Login, Recuperar Senha, Definir Senha e a Cotação Pública
do fornecedor (a única que alguém **de fora da empresa** usa, por link com
token).

Medi-las com a régua das telas internas produz FALHOU que não significa
nada: metade dos itens pressupõe um shell que ali não existe. Então esta
seção declara o que vale, o que NÃO vale, e o que se INVERTE.

**Não se aplica (N/A registrado no manifesto, com este motivo):**
- **C1/C2** — não há faixa fixa presa à topbar, porque não há topbar. O
  título continua existindo e continua no degrau de 22px; o que sai é a
  exigência de faixa grudada.
- **C3** — não há tela de detalhe nem hierarquia de retorno.
- **X2** — idem C1: sem topbar, não há o que grudar.
- **F1–F4** — não há listagem com recorte.

**Inverte-se, e esta é a diferença que importa:**
- **C6 e R11** dizem que navegação não é ação e que "Voltar" redundante sai
  da tela, porque o breadcrumb e o menu resolvem. **Aqui não resolvem: não
  existem.** O link "Esqueci minha senha" no Login e o "Voltar ao login" no
  Recuperar Senha são a ÚNICA navegação disponível — são obrigatórios, não
  redundantes. Remover é deixar a pessoa presa.
  **Registrado como ESCOPO da R11, não como exceção destas quatro telas**
  (decisão do cliente, 03/09): qualquer tela futura que renderize fora do
  `Layout` já nasce sob esta leitura, sem precisar pedir exceção. Exceção é
  permissão que alguém tem de lembrar de pedir, e o que não é pedido escapa
  — foi assim que a R11 comeu a seta de voltar em 02/09.

**Vale integralmente, e sem desconto:**
- **M1–M4** (medidas, cores por token, contraste AA, alvo de clique) —
  contraste importa MAIS aqui: a tela de login costuma ser vista em
  monitor ruim, luz forte, celular na obra.
- **R1–R3** (formulário; nenhuma caixa do navegador). A Cotação Pública tem
  **14** delas hoje, e é a tela de um terceiro: `alert()` do Chrome numa
  página que representa a empresa para o fornecedor é o pior lugar do
  sistema para isso.
- **B1–B5**, **X1**, **X3**, **R18**, **A1**, **T1–T8** onde houver tabela
  (a Cotação Pública tem uma).

**Uma exigência a mais, que só existe aqui:** estas telas são a primeira
coisa que o usuário vê e, na Cotação, a única. Erro de rede, token
inválido, sessão expirada e link vencido precisam de mensagem que diga **o
que fazer**, não só o que falhou — não há menu para onde escapar.

## MOBILE (390px)

- **X1** Tabela vira cards legíveis (mesmas colunas, um markup).
- **X2** Faixa fixa funciona (gruda, compacta, não some, sem vão).
- **X3** Nada estoura a largura da viewport (sem scroll horizontal da
  página; tabela rola dentro do próprio contêiner).

## Evidência exigida por entrega

1. `docs/MATRIZ-COBERTURA.md` completa (todas as telas entregues, não só as
   novas — regressão é obrigatória), com data da verificação e cada FALHOU
   justificado.
2. Capturas do preview real por tela em 1920 / 1366 / 390.
3. Relatório de falhas com item da DoD + seletor do elemento.
4. Lista de decisões pendentes do cliente.

Narrativa de "gate passou" sem matriz, captura de mock e "implementado no
componente" NÃO são evidência.

## Por que o preview real — casos registrados (02/09)

Quatro defeitos desta rodada eram **código "correto" que não produzia o
elemento (ou o sinal) no DOM** — a classe de defeito que NENHUMA validação
em mock/código pega, e que o harness contra o preview real existe para
pegar:

1. **Seta de voltar removida por regra.** A R11 (sem escopo declarado) foi
   aplicada ao pé da letra e o código ficou "conforme a regra" — mas o DOM
   da tela de detalhe perdeu a affordance primária de retorno. Nenhum teste
   de código reprova a AUSÊNCIA de um elemento que a regra mandou remover;
   só a DoD (C3) medida na tela real reprova.
2. **Menu de alinhamento invisível.** A capacidade existia, publicada e
   funcional — e clicar no cabeçalho não tinha NENHUM sinal (cursor, ícone,
   tooltip). "Implementado e testado" era verdade; "existe para o usuário"
   era falso. Virou a R15: capacidade sem sinal não existe. Só um check que
   passa o mouse no DOM real (T2) enxerga isso.
3. **Seletor morto de topbar.** O `Pagina` media `.topbar-shell` — um
   seletor que NÃO EXISTE no DOM real (a topbar é `.fx-topbar`) — e caía
   num fallback que criava o vão transparente. No mock, com o shell
   simplificado, a medida nunca era exercitada de verdade; o código lia
   como certo e o defeito só existia no ambiente real. O mesmo vale para a
   faixa que nascia compactada (sentinela com margem fixa): só rolagem numa
   janela real, com a topbar real, revela.
4. **Nove telas de detalhe com a faixa fixa quebrada desde o início.** Ao
   varrer o sistema atrás de `overflow: hidden` sequestrando sticky (R18),
   apareceram NOVE telas de detalhe cuja faixa do topo nunca grudou — não
   foi regressão de uma leva, estava assim desde que a tela existe. O
   componente `PageHeader` estava certo, o CSS da faixa estava certo, o
   `position: sticky` estava lá: um ancestral da tela (`.rhdp-page`,
   `.ao-financial` e afins) criava scrollport com `overflow: hidden` e a
   faixa passava a grudar nele — ou seja, em lugar nenhum visível. Zero
   erro no console, zero falha de build, zero reprovação no validador.
   Nenhum check pegou porque o único check existente era estático, e
   estaticamente TUDO estava conforme: o defeito só existe na composição
   dos três arquivos, dentro de uma janela que rola.

Moral operacional: **mock valida lógica; só o preview publicado valida
EXISTÊNCIA e SINAL** — elemento presente, affordance visível, medida feita
sobre o DOM que o usuário vê. Por isso a matriz só aceita verificação no
preview.

Consequência do 4º caso, que vale para o processo daqui pra frente: **toda
regra nova nasce com PROVA NO HARNESS, não só com check estático.** Check
estático mede um arquivo; o defeito mora na composição de vários, no
navegador, depois da rolagem. A R18 só virou regra de verdade quando ganhou
a prova de runtime — rolar a tela real e medir se o elemento fixo continua
no lugar. Regra que só tem check estático é regra que ainda não sabe se
funciona.

---

## DUAS LISTAS DE TELAS, E A QUE VALE PARA "PRONTO" É A DO PREVIEW (04/09)

Este repositório tem **duas** listas de telas, que respondem a perguntas
diferentes e nunca foram comparadas:

| Lista | Pergunta que responde |
|---|---|
| `frontend/scripts/telas-reformadas.json` | o que o **validador estático** mede (R1–R27) |
| `frontend/scripts/qa-preview/telas.mjs` | o que o **harness abre no PREVIEW publicado** |

**A que vale para "PRONTO" é a segunda.** A primeira mede forma no código;
a definição de pronto exige verificação no preview com dado real.

### O que aconteceu ao fechar a leva do Financeiro

Manifesto estático: **68 telas**. Lista do harness: **36**. As 29 telas do
Financeiro migradas nas quatro fatias — menos a `FinanceiroTituloDetalhe`,
que já era antiga — **nunca foram acrescentadas à lista do preview**: 29
telas no manifesto sem uma única medição no navegador.

### O check nasceu errado, e o erro era do lado que dá conforto

A primeira versão reportou **32**, somando três do RH/DP:
`RhDpApuracao`, `RhDpJornada` e `RhDpPessoalSolicitacoes`. As três **já
eram medidas**: não têm rota própria, vivem nas abas da `RhDpPessoal`, e o
harness as abria pelas `variantes` dela. Cobertura real, invisível para uma
comparação arquivo a arquivo.

Só descobri porque fui escrever as entradas e li o comentário que dizia
isso. **Se eu tivesse confiado no número do meu instrumento novo, teria
acrescentado três telas em duplicidade e chamado isso de correção.**

A saída não foi o check adivinhar: foi a entrada **declarar** o que mede
por dentro, no campo `tambemCobre` do `telas.mjs`. Cobertura inferida seria
o mesmo defeito que o check existe para pegar, só que do lado do falso
negativo — e **check que erra para menos é pior que nenhum, porque dá
conforto**.

E o harness **rodou normalmente**: percorreu as 36 que conhecia, imprimiu a
matriz e reportou "6 células FALHOU, 35 SEM DADO". Um resultado de aparência
completa sobre um terço do que faltava medir.

### A lição, que é a mesma de sempre neste projeto

**O instrumento relata o que conhece, e o silêncio sobre o que ele não
conhece se lê como cobertura.** Já apareceu três vezes:

1. o `--extra` que não chegava à R25 — o caminho que eu mandava usar era
   exatamente o que não media cor;
2. o `tokensExistem.mjs` que existia e não estava em nenhum `npm run`;
3. agora, a lista do preview que ficou para trás a cada leva.

Nos três casos o comando terminava com sucesso. **Saída verde não é
cobertura; é ausência de reprovação naquilo que foi olhado.**

### O check

Bloqueante, sem trinco, no `validarLayout.mjs`: entrar no manifesto estático
e não entrar na lista do harness **reprova**, nomeando as telas. E o inverso
também — tela no preview e fora do manifesto estático escaparia das regras
mecânicas.

Não tem trinco de propósito. Trinco congela passivo herdado; aqui o passivo
é *promessa de verificação que não existe*, e essa não se congela.

### Consequência para o processo das levas

Uma tela entra nas **duas** listas na mesma leva em que é migrada. A entrada
no manifesto estático sem a entrada na lista do preview é meia migração — e
é a metade que não conta para "PRONTO".

## ANTES DE QUALQUER NÚMERO: "DE QUANTOS JEITOS ISSO É FEITO AQUI?" (04/09)

Regra permanente, aplicável a toda varredura, check ou levantamento deste
projeto — e ela é maior que "o detector estava cego".

Num sistema com anos de código, **a mesma coisa é feita de várias formas**,
porque foi escrita por gente diferente em épocas diferentes. Qualquer
varredura que assume UMA forma mede uma fração e devolve um número com cara
de completo. O número parece pronto; a medição não está.

Então a primeira pergunta nunca é "quantos casos existem?". É:

> **De quantos jeitos isso é feito aqui?**

A segunda só vale depois que a primeira tem resposta escrita.

### O caso que gerou a regra: quatro números errados no mesmo dia

A varredura de alcance ("existe caminho até esta tela?") nasceu errada
quatro vezes seguidas, sempre pelo mesmo motivo:

| Número | O que o detector conhecia | O que ele não via |
|---|---|---|
| 38 sem porta | `to="/rota"` (JSX) | tudo o resto |
| 15 sem porta | + `to: '/rota'` (objeto) | os fluxos |
| 13 sem porta | + `navigate('/rota')` | o ternário |
| 14 sem porta | + `navigate(cond ? '/rota' : …)` | o catálogo |
|  2 sem porta | + `route: '/rota'` em catálogo de painel | — |

Em cada rodada eu ia "abrir portas" que já existiam. Na primeira, teria
DUPLICADO 23 entradas na fonte única de navegação: o arquivo onde duplicata
custa mais caro.

### A cegueira reaparece no classificador, não só no detector

Corrigido o detector, classifiquei como "porta" apenas o que estava no
`navigationConfig`. Errado pelo mesmo motivo: **neste sistema hub é
página**. `Configuracoes.jsx`, `ModuloRelatorios.jsx` e
`FinanceiroRelatorios.jsx` são hubs de verdade, com lista de destinos. Pela
regra nova, ~20 telas de configuração apareceriam como "sem porta" quando a
porta é o hub de Configurações, que está no menu.

Ou seja: consertar a ferramenta não basta se a mesma suposição estiver na
régua que lê o resultado dela. A pergunta vale para os dois.

### Terceira aparição: o recorte que esconde caminho

Tirei as rotas `/:id` do grafo porque detalhe de registro não precisa de
porta no hub — chega pela listagem. Mas tirar do grafo tirou também as
portas que essas telas ABREM: `/financeiro/titulos` só tem link dentro de
um card da tela de obra; `/relatorios/administrativos` só tem link na tela
de pedido de compra. As duas apareceram como "só pela URL" por causa de um
recorte meu, não por causa do sistema.

**Não precisar de porta e não ser porta são coisas diferentes.**

### O que a varredura mede hoje

Grafo, não lista. Raiz = rotas do `navigationConfig` (que é também o índice
do Ctrl+K). Aresta = a página da rota A, ou um componente que ela importa,
cita a rota B em qualquer das 6 formas conhecidas. O resultado é distância:

| nível | significado | veredito |
|---|---|---|
| 1 | destino do menu | porta |
| 2 | dentro de um hub que está no menu | porta |
| 3+ | só se alcança de dentro de outra tela | decidir caso a caso |
| sem | nenhum caminho a partir do menu | porta ausente |

Seleção por estado dentro de um painel conta como alcance legítimo: quem
chega ao relatório pela lista lateral chegou, mesmo sem existir um
`to="/rota"` escrito em lugar nenhum.

## SALDO DA RODADA 1: O TRABALHO DA RODADA FOI DESCOBRIR QUE ELE NÃO EXISTIA (04/09)

A rodada 1 abriu com **38 telas sem porta** e fechou com **1 porta aberta e
1 rota removida**. Nenhum dos números intermediários virou código. Fica
registrada porque o caso vale mais que o resultado.

### Como o escopo evaporou

| Escopo | O que o detector sabia | O que teria virado código |
|---|---|---|
| 38 telas | `to="/rota"` | duplicar 23 entradas na fonte única de navegação |
| 15 telas | + `to: '/rota'` | abrir portas para os fluxos |
| 13 telas | + `navigate('/rota')` | — |
| 14 telas | + ternário | — |
|  4 telas | + catálogo de painel, hub-é-página, detalhe-é-caminho | — |
|  2 telas | + query string na forma de objeto | abrir no hub do Financeiro uma porta que **já era o primeiro item do menu do módulo** |
|  1 tela | — | o trabalho real |

A última linha é a mais instrutiva. `/financeiro/titulos` entrou na lista de
"enterradas" porque a forma `to: '/rota'` exigia que a string terminasse na
rota. "Contas a Pagar" é `to: '/financeiro/titulos?tipo=pagar'`. Eu ia abrir
porta no hub para uma tela que é o primeiro e o segundo item do menu do
Financeiro.

### O que de fato foi feito

1. **`/usuarios-permissoes-rh-dp`** — porta aberta no hub de Configurações,
   no grupo "Status e Vínculos", junto das outras duas telas de permissão por
   usuário. Era ferramenta administrativa que só achava quem sabia a URL.
2. **`/relatorios/administrativos`** — removida. Servia o mesmo componente
   que `/compras/relatorios/auditoria`, com os mesmos guardas, sem ler a
   rota e com os mesmos parâmetros por query string. Ficou a que tem porta;
   o botão de auditoria do pedido passou a apontar para ela.
3. **`/configuracoes-contrato-alertas`** — **porta aberta, não removida**.
   Serve o mesmo componente que `/configuracoes-formas-pagamento-solicitacao`,
   mas a tela lê o `pathname` e muda título, descrição e qual bloco recebe a
   barra de cor. O critério que resolveu:

   > Se a tela **anuncia coisa diferente** conforme o caminho, são dois
   > destinos de verdade, e o que falta é a porta do segundo — não a
   > remoção dele.

   A entrada foi nomeada pelo ASSUNTO que abre ("Alertas e Limites do
   Contrato"), não pelo arquivo que carrega: quem clica precisa saber o que
   vai encontrar antes de chegar. Eu ia removê-la como duplicata, o que
   teria apagado um assunto inteiro do sistema.

**Alcance final da rodada: 117 nível 1, 59 nível 2, 0 enterradas, 0 só pela
URL.** Nenhuma tela do sistema depende de alguém saber o endereço de cor.

### A lição, que é a regra do detector aplicada ao planejamento

Um escopo grande construído sobre uma medição não conferida é trabalho
inventado. E ele tem uma propriedade perversa: **parece produtivo**. Trinta e
oito portas para abrir enche uma rodada inteira, e nenhuma das trinta e sete
teria melhorado nada — várias teriam piorado, duplicando o que já existe no
lugar onde duplicata custa mais caro.

Rodada que descobre que não tem trabalho não é rodada perdida. É a única
forma de não fazer o trabalho errado.

## QUEM DECIDE O QUÊ, E O QUE NÃO PARA ESPERANDO (04/09)

Regra de ritmo, definida pelo responsável depois da rodada 1. Ela não afrouxa
nada da verificação — muda só quem responde perguntas que eu respondo melhor.

### Decido sozinho, registro o motivo e sigo

Tudo que é **reversível e não muda comportamento que o usuário percebe**:

- abrir porta no hub, escolher onde um destino mora, nomear uma entrada;
- remover rota duplicada **comprovadamente idêntica** (mesmo componente,
  mesma permissão, mesmo parâmetro, e a tela não lê a rota);
- escolher entre dois arranjos de layout equivalentes;
- corrigir check e falso positivo.

A decisão vai para o docs com o motivo, no mesmo movimento. Registro no docs
não é formalidade: é o que separa "decidi" de "fiz sem pensar".

### Paro e pergunto

Quatro casos, e só eles:

1. **remover capacidade ou elemento visível** — alguém pode estar usando;
2. **mudar comportamento que o usuário percebe** — a tela passa a fazer
   outra coisa;
3. **decidir regra de negócio** — não é minha, nunca foi;
4. **duas decisões anteriores do responsável se contradizem** — quem
   resolve o conflito é quem criou as duas.

### E não espero parado

Pergunta que depende do responsável **não trava o resto**. Acumulo, sigo no
que não depende dela, e trago as perguntas **em lote no fim da rodada** —
não uma a uma, interrompendo.

### O que a regra NÃO toca

Matriz limpa antes de fechar rodada. Revisor separado. Conferir antes de
afirmar. **Nada aqui é sobre ganhar tempo trocando verificação por
velocidade** — é sobre não ficar parado esperando resposta para coisa que eu
decido melhor.


## B3 — O MESMO DADO COM PAPÉIS DIFERENTES NÃO É DUPLICAÇÃO (04/09)

Refinamento da B3, decidido pelo responsável. Estava como "segunda aparição
com função diferente é exceção registrada", o que jogava a decisão para o
mecanismo de exceção — e exceção é dívida declarada, não é o lugar de um
arranjo que está certo.

### A distinção

O que a B3 proíbe é **a mesma informação ocupando dois lugares para dizer a
mesma coisa** — a contagem na faixa e a mesma contagem no bloco. O leitor
para, compara os dois números e procura a diferença que não existe.

O que ela **não** proíbe é o mesmo dado servindo a **papéis diferentes**:

| Papel | O que é | Exemplo |
|---|---|---|
| **Referência** | acompanha a pessoa enquanto ela age | o preço na linha, enquanto se digita |
| **Decisão** | consolida para a escolha que vem depois | o total no painel, que fecha a cotação |

Tirar um dos dois não simplifica: **quebra um dos dois trabalhos.** Sem o
valor na linha, quem digita perde a referência do que está mudando; sem o
total no painel, quem decide precisa somar de cabeça.

### O caso que serve de exemplo

`GerenciarCotacaoSolicitacao` (módulo de Compras, rodada 5). A
`TabelaPadrao` traz o preço editável por linha, e o painel de resumo traz os
totais. É o mesmo número em dois lugares, e os dois são necessários.

Registro de honestidade: **essa dúvida não foi levantada por mim** — veio do
responsável, e a tela é de uma rodada que ainda não chegou. A conferência
que fiz foi só estrutural: a tabela com input por linha e o painel de resumo
existem no código, nas linhas que a regra cita.

### O teste, para não voltar como dúvida a cada leva

> **Se eu apagar a segunda aparição, algum trabalho fica pior?**
>
> - Se a resposta é "não, só fica mais limpo" → é duplicação, e sai.
> - Se a resposta é "sim, alguém perde a referência ou a consolidação" →
>   são dois papéis, e ficam os dois.

A pergunta é sobre o trabalho da pessoa, não sobre o número na tela.

## QUANDO C2 E B3 APONTAM PARA LADOS OPOSTOS (05/09)

Decisão do responsável, tomada sobre um caso concreto — a
`ConfiguracoesVisibilidadeUi`, cuja faixa não trazia contagem porque três
cartões de resumo já mostravam os números.

As duas regras estavam certas, e brigavam:

- **C2** exige a contagem na faixa fixa.
- **B3** proíbe a mesma informação duas vezes na tela.

### O critério

> **A faixa fica com o TOTAL. Os blocos ficam com os RECORTES.**

O motivo é o mesmo que dá o desempate em qualquer tela: **a faixa acompanha
a pessoa ao rolar**, e é onde o número precisa estar na hora de decidir. O
bloco fica para trás; a faixa não.

### O teste, para não voltar a cada tela

Total repetido é B3. Total ausente da faixa é C2. **A distinção é o que cada
número RESPONDE, não onde ele está:**

| Onde | Responde | Exemplo |
|---|---|---|
| faixa | *quanto existe no total* | "128 componentes" |
| bloco | *quanto existe NESTE recorte* | "12 ocultos", "3 só para admin" |

Dois números iguais em lugares diferentes é duplicação. Dois números
**diferentes**, cada um respondendo a sua pergunta, é informação — e cai na
distinção já registrada na B3: o mesmo dado com papéis diferentes não é
duplicação.

### O que isso implica na prática

Cartão de resumo que mostra o mesmo total da faixa **muda de conteúdo**, não
some: passa a mostrar o recorte que só ele sabe. Se um cartão não tem recorte
próprio para mostrar, aí sim ele era duplicata e sai.
