# Decisões do cliente — leva de preferências (06/09)

> **TODAS RESPONDIDAS EM 06/09.** As respostas dele estão no topo de cada
> item, com as palavras dele. O corpo de cada decisão continua abaixo, com a
> medição que a sustentou — é ela que explica por que a resposta é essa.

Lote acumulado durante a leva, em vez de parar a cada item, conforme
combinado. Cada uma está aqui por um destes motivos: **remove capacidade**,
**muda comportamento percebido**, **é regra de negócio**, ou **duas decisões
suas se contradizem**. Nenhuma foi decidida por mim.

Tudo abaixo está **medido**, não estimado. Onde há número, há a medida.

---

## D1 — O espelho em localStorage contraria a letra da sua regra

**RESPOSTA (06/09): MANTER o espelho.** Palavras dele:

> *"A regra que eu escrevi visava a preferência que não acompanha o usuário —
> não o cache local. O banco manda, o espelho só evita a tela nascer errada."*

**A interpretação que fica registrada:** a regra "nada de preferência em
localStorage" proíbe o localStorage como **fonte da verdade**, não como cache.
O teste para saber se uma escrita local é permitida passa a ser um só: *a
configuração acompanha o usuário para outra máquina?* Se sim, o espelho é
cache e pode existir. Se não, é o defeito que a leva veio matar.

**Motivo:** duas decisões suas se contradizem.

Você disse: *"Nada de preferência em localStorage a partir desta leva."*
A preferência **passou toda para o banco** — colunas, filtros, blocos, modo de
lista, alinhamento vivem em `usuario_lista_preferencias` e viajam com a
pessoa. Mas o localStorage **continua sendo escrito**, e isso é deliberado.
Ele deixou de ser a verdade e virou duas outras coisas:

1. **Semente síncrona.** A carga do servidor é assíncrona. Entre o primeiro
   desenho da tela e a resposta existe uma janela. Semeando do espelho local,
   a tabela **nasce certa** para quem já usou aquela máquina. Sem a semente, a
   alternativa honesta seria segurar o app inteiro atrás de uma requisição — e
   preferência não pode atrasar tela, muito menos derrubar.
2. **Rede de rollback.** Se este deploy for revertido, o build anterior
   encontra a configuração do usuário exatamente onde sempre esteve. Por isso
   o espelho precisa continuar **atualizado**, no formato e nas chaves
   antigas: espelho congelado devolveria o usuário a uma configuração velha.

Precedência hoje: **servidor > espelho local > padrão da tela**. O espelho
nunca ganha do banco.

**O que decidir:** manter o espelho (a leva cumpre o espírito da regra: a
preferência é do usuário e vale em qualquer aparelho) ou cumprir a letra e
apagar o espelho — ao custo de a tela nascer no padrão e corrigir-se sozinha
um instante depois, e de perder a rede de rollback.

**Minha recomendação:** manter. O que você combateu foi *"a mesma pessoa vê
listas diferentes conforme a máquina"*, e isso acabou.

---

## D2 — Largura de coluna: ainda não foi para o banco, e a escolha é sua

**RESPOSTA (06/09): opção (a) — PROPORÇÃO em vez de pixel.** Palavras dele:

> *"Ajuste fino de coluna vale menos que a tabela abrir certa em qualquer tela
> — e o caso de 1805px num contêiner de 1239px é o que eu quero evitar."*

**Motivo:** as três saídas mudam o que você vê.

A largura ficou de fora da migração, de propósito. Ela é guardada em **pixel
absoluto**. Hoje o dano é contido porque a chave é **por navegador**: quem
arrasta no monitor de 27" estraga no máximo o próprio 27". Levar pixel
absoluto ao banco **por usuário** faz o monitor de 1920 estragar o notebook de
1366 — e esse defeito **já aconteceu neste projeto**: tabela ajustada em 1920
e aberta em 1366 ficou com **1805px num contêiner de 1239px**, coluna NOME com
**813px** e quatro colunas (OBRA, VÍNCULO, STATUS, AÇÕES) **fora da borda do
cartão**, sem nunca remedir.

As três formas de guardar largura por usuário, e o preço de cada uma:

| | como funciona | o que você perde |
|---|---|---|
| **(a) por faixa de largura de janela** | cada tamanho de tela guarda o seu ajuste | você ajusta **duas vezes** (uma no monitor, outra no notebook) |
| **(b) proporção em vez de pixel** | funciona em qualquer tela, sem estourar | perde o **ajuste fino**: a coluna acompanha a janela |
| **(c) pixel com teto pelo contêiner** | migração direta do que já existe | em tela menor a coluna **encolhe sem você pedir** |

O tipo `larguras` **já existe no backend**, esperando. O ponto de corte é um
arquivo só (`ResizableTable.jsx`). Enquanto não vier a decisão, fica como
está: por navegador, sem risco de estourar.

**Minha recomendação:** (b). É a única que não te obriga a ajustar duas vezes
nem a ver coluna fora do cartão.

---

## D3 — Conjunto inicial reduzido de filtros: só 3 telas têm, e o resto?

**RESPOSTA (06/09): deixar como está por ora.** Palavras dele:

> *"Quando eu terminar de testar, digo se quero estender e em quais telas."*

Nenhuma tela nova esconde filtro por padrão. O seletor continua em todas.

**Motivo:** muda comportamento percebido (filtro some sem a pessoa pedir).

Você aprovou o conjunto inicial reduzido para **3 telas em 5 endereços** (as
consultas de títulos). O **seletor** de filtros visíveis, esse sim, está indo
para todas as telas com filtro — mas **sem esconder nada por padrão**: todos
os filtros continuam aparecendo na primeira abertura, e o seletor só existe
para quem quiser mexer.

Não estendi o conjunto reduzido às demais porque **esconder filtro por padrão
é mudar o que a pessoa vê sem ela pedir** — e o critério de "os 4–5 mais
usados" precisa ser declarado tela a tela, o que é decisão sua, não minha.

**O que decidir:** se quer o conjunto inicial reduzido nas outras telas, e por
qual critério. Se quiser, eu levanto e trago a proposta por módulo, como fiz
com as de títulos.

---

## D4 — O verificador grava preferência no banco de desenvolvimento

**RESPOSTA (06/09): ACEITAR.** Palavras dele:

> *"Escrever na linha de preferência do próprio usuário de QA não é escrever no
> ambiente compartilhado no sentido que eu quis dizer — o que eu queria evitar
> era criar registro de negócio. Com a restauração obrigatória e a reprovação se
> falhar, está resolvido."*

**A interpretação que fica registrada:** "somente navegação e leitura" protege
**registro de negócio**. Preferência de interface do próprio usuário de QA,
restaurada no fim e com falha de restauração reprovando o item, está dentro da
regra.

**Motivo:** duas decisões suas se contradizem.

Você disse: *"Somente navegação e leitura: o harness não cria, altera nem
apaga registro no ambiente de desenvolvimento — ele é compartilhado."*
E também: *"matriz no preview real antes de declarar pronto."*

As quatro provas novas (colunas escolhíveis, filtro escondido limpa o valor,
recolhimento sobrevive à recarga, camada fecha e a seleção continua
funcionando) **só provam alguma coisa se gravarem** — é exatamente a
capacidade nova que a leva entrega.

**O que fiz, e por que julguei reversível:** a escrita fica **na linha de
preferência do próprio usuário de QA**, nunca em registro de negócio. Toda
prova **restaura o padrão no fim**, dentro de `finally`, e **falha de
restauração REPROVA o item** em vez de passar calada — "Restaurar padrão" que
não restaura é defeito da capacidade, não do teste. Onde escolher um valor
significaria criar ou apagar registro de verdade, a prova **não escolhe**.

**O que decidir:** se essa leitura ("preferência do usuário de QA não é
registro compartilhado") vale, ou se você prefere que a capacidade nova seja
verificada só à mão, por você, no caderno de teste.

---

## D5 — Três listas que não fecham ao clicar fora, e converter muda o que você vê

**RESPOSTA (06/09): opção (b) — SÓ o Esc nas três.** Palavras dele:

> *"Fechar ao clicar fora quebraria o vínculo de credor, que é o caminho único;
> o Esc dá saída sem esse risco."*

**Motivo:** muda comportamento percebido.

A auditoria das camadas flutuantes fechou 35 pontos: todos fecham ao clicar
fora, ao tocar fora e no Esc. **Zero** ainda fecham só por perda de foco.

Sobraram **três de fronteira**, e elas são diferentes: são listas de resultado
**em fluxo** — sem `position`, sem `z-index`. Elas **empurram** o formulário
para baixo em vez de cobrir o conteúdo. Por isso não se comportam como camada:

1. **Lista de favorecidos da medição** — `BlocoMedicaoContrato.jsx`
2. **Dois seletores de subitem** (previsto e aprovado) — `CrPlanejamentoView.jsx`
3. **Lista de credores do contrato** — `GestaoContratos.jsx` (aparece duas
   vezes: no novo e na edição)

Hoje elas não fecham ao clicar fora nem no Esc. Converter tem preço medido:
nas três, **clicar em outro campo do mesmo formulário passaria a sumir com a
lista** — e no caso dos credores, a lista é o **único caminho** para vincular
um credor ao contrato. Fechá-la por engano no meio do preenchimento é pior que
deixá-la aberta.

**O que decidir:** deixar as três como estão (elas não cobrem nada, então não
"prendem" a tela), ou acrescentar **só o Esc** — mudança menor, mas ainda
visível. Não converti nenhuma das duas formas sem sua palavra.

---

## D6 — Nenhuma regra estática pega a armadilha que mata a seleção

**RESPOSTA (06/09): registrado; manter a conferência humana.** Palavras dele:

> *"Entendi o que o verde vale ali. Mantenha a conferência humana como está e,
> se algum dia houver como provar isso automaticamente, me traga."*

**Motivo:** não é decisão sua, é aviso — mas você precisa saber, porque muda o
quanto o portão verde vale.

A prova de mordida mediu isto: removendo o `ref` de cima do painel e o
`preventDefault` da opção, **a seleção morre** (o clique fecha a camada no
`mousedown` e nunca chega ao `onClick`) e **o portão inteiro passa verde** —
validador de layout, varredura de alcance e testes responsivos, todos em 0.

O que segura hoje é a **contenção**: o `ref` cobrir o painel. Isso foi
conferido **uma a uma** nas 10 camadas dessa família, e em todas o painel está
dentro do `ref` e a opção tem `preventDefault`. Mas é conferência humana, não
regra — se alguém quebrar amanhã, nada avisa.

Registro como lacuna declarada em vez de deixar o verde parecer mais forte do
que é.

## Onde estas decisões moram no código

Quando qualquer uma vier, o ponto de corte já está marcado com comentário
datado, para não virar caça ao tesouro:

- **D1** — `frontend/src/contexts/PreferenciasContext.jsx`, nota "POR QUE O
  localStorage CONTINUA SENDO ESCRITO"
- **D2** — `frontend/src/components/ResizableTable.jsx`, nota "A LARGURA
  CONTINUA NO localStorage — E ISSO É DELIBERADO"
- **D3** — `docs/PROPOSTA-FILTROS-INICIAIS.md`
- **D4** — `frontend/scripts/qa-preview/preferencias.mjs`, cabeçalho
- **D5** — os três arquivos citados acima
- **D6** — nada a cortar: é lacuna do verificador, registrada no commit `a2861cc`
