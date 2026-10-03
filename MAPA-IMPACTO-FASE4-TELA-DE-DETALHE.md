# Mapa de impacto — Fase 4: tela de detalhe da solicitação

Data: 23/08/2026. Escrito **antes da primeira linha de código** (regra §6 do `PROTOCOLO-QA.md`).

Itens do plano: **10** (tirar o Status do cabeçalho), **13** (Objeto ao lado do número do contrato),
**14** (resolvido pelo 18), **16** (tirar a Apropriação do cabeçalho), **17** (tirar a apropriação de
dentro do card Financeiro), **18** (justificativa vai para o histórico) e **19** (comentário acima do
histórico, com os anexos dentro dele).

---

## 1. O tema da fase: a mesma informação aparece três vezes

Três dos sete itens são **remoção**. Não é faxina de estética — é o cliente dizendo que a tela repete
o que ela mesma já disse:

| Informação | Onde aparece hoje |
|---|---|
| Status | badge no topo **e** ladrilho "Status" no cabeçalho |
| Apropriação | ladrilho no cabeçalho **e** card "Apropriações do contrato" **e** bloco dentro do card Financeiro, embaixo das parcelas |

O ladrilho de Status foi verificado: `Header.jsx` desenha `<InfoItem label="Status" ...>` com
`solicitacao.status_global`, e a mesma variável já alimenta o `<StatusBadge>` a poucos centímetros
dali, na barra de ações. É o mesmo dado, duas vezes, na mesma dobra da tela.

---

## 2. O que foi verificado no código antes de propor

| Item | Onde mora hoje |
|---|---|
| 10 — ladrilho Status | `Header.jsx` — `<InfoItem label="Status">` |
| 13 — Contrato e Objeto | `Header.jsx` — hoje `Contrato`+`Título` na linha 1, `Objeto` sozinho na linha 2 |
| 16 — ladrilho Apropriação | `Header.jsx` — bloco `mostrarApropriacaoInfo` |
| 17 — apropriação no Financeiro | `PrevisoesContrato.jsx` :131-146, dentro de `FinanceiroCard` :1645, abaixo da tabela de parcelas |
| 18 — justificativa | gravada em `contratos.justificativa` (`contratoFluxoNovoService` :694) e **não exibida em lugar nenhum** |
| 19 — comentário e anexos | `Comentarios.jsx` e `Anexos.jsx`, ambos na coluna **direita**; `Timeline.jsx` (Histórico) na **esquerda** |

### 2.1 O item 14 já está resolvido — pelo 18

O plano registrava o 14 como *"trazer Objeto e justificativa para a tela"*. O Objeto entrou em 23/08.
E a resposta do cliente ao item 18 foi **"em vez de"**: a justificativa vai **só** para o histórico,
não vira campo de tela. Então do 14 não sobra trabalho — sobra a decisão de **não** fazer o que ele
pedia originalmente.

### 2.2 A justificativa é gravada e nunca lida

`contratos.justificativa` recebe o texto na abertura e nenhuma tela o mostra. Hoje ele é um campo
que só existe para o banco. O item 18 é o que o torna útil: vira um evento na linha do tempo, onde
quem revisa o contrato já está olhando.

---

## 3. As decisões e o porquê de cada uma

### 3.1 Item 13 — Contrato e Objeto na primeira linha

Hoje: `Contrato` (2 colunas) + `Título` (2), e o `Objeto` sozinho ocupando as 4 da linha seguinte.

Passa a ser: `Contrato` (1) + `Objeto` (3), com o `Título` descendo para a linha seguinte.

O Objeto ganha 3 colunas porque é texto corrido — é a descrição do que se está contratando, não um
código. E quando o contrato **não tem** objeto, o `Contrato` volta a ocupar 2 colunas e o `Título`
sobe: sem isso, um contrato sem objeto deixaria três quartos da primeira linha vazios.

### 3.2 Item 19 — comentar e anexar viram um ato só

O card "Novo comentário" sai da coluna direita e sobe para a **esquerda, acima do Histórico** — que
é onde o resultado dele aparece. Hoje a pessoa escreve de um lado da tela e lê do outro.

E o `Anexos.jsx` deixa de ser um card próprio: o seletor de arquivos, a lista de pendentes e o envio
entram **dentro** do card de comentário, com **um** botão.

Três decisões dentro dessa:

1. **Um dos dois basta.** Só texto, só arquivos, ou os dois — o botão aceita as três. Hoje anexar
   sem comentar é possível, e tirar isso quebraria quem só quer juntar uma nota fiscal;
2. **O comentário vai primeiro, os arquivos depois.** Se o upload falhar, o comentário já está
   gravado e a pessoa reanexa; na ordem inversa, um comentário que falha deixaria arquivos órfãos
   sem contexto;
3. **Não se inventa vínculo entre comentário e anexo.** Os dois vão para a mesma solicitação, como
   hoje. Amarrar o arquivo àquele comentário exigiria `anexos.historico_id`, que é mudança de
   esquema e não foi pedida — a medição já tem esse vínculo (`medicao_id`) porque *lá* foi pedido.

### 3.3 Item 18 — a justificativa como evento, não como campo

Entra logo depois de `SOLICITACAO_CRIADA`, na mesma transação da abertura, com ação própria
(`JUSTIFICATIVA_REGISTRADA`). Ação própria, e não texto embutido no evento de criação, porque o
histórico é filtrado e lido por ação em vários pontos do sistema — enterrar a justificativa dentro
de outra linha a tornaria invisível de novo, que é exatamente o problema que o item resolve.

`contratos.justificativa` **continua sendo gravada**. O histórico é onde ela é lida; a coluna é onde
ela é o dado. Trocar uma pela outra perderia a justificativa de todo contrato já aberto.

---

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Sumir um campo do cabeçalho junto com os dois que devem sair | A suíte 39 lista os rótulos e exige a lista exata — Status e Apropriação passam a ser exigidos **ausentes** |
| A primeira linha estourar num contrato sem objeto | Suíte abre um contrato sem objeto e confere que Contrato+Título voltam a dividir a linha |
| O card "Apropriações do contrato" sumir junto com o bloco do Financeiro | Item 16 diz explicitamente que ele fica; suíte exige o card presente e o bloco ausente |
| Anexar deixar de funcionar sem comentário | Suíte anexa **sem texto** e exige o arquivo gravado |
| Comentar deixar de funcionar sem anexo | Suíte comenta sem arquivo e exige o histórico |
| Upload falhar e levar o comentário junto | Ordem definida: comentário primeiro |
| A justificativa parar de ser gravada na coluna | Suíte confere `contratos.justificativa` **e** o histórico |
| Contrato sem justificativa gerar evento vazio | Suíte abre um sem justificativa e exige que nenhum evento seja escrito |
| Solicitação do fluxo padrão mudar de comportamento | O comentário e os anexos são de **toda** solicitação: suíte roda numa que não é contrato |

---

## 5. O que **não** muda

- o card "Apropriações do contrato" (item 16 manda mantê-lo);
- a coluna `contratos.justificativa`;
- o campo de justificativa no formulário de abertura — é onde ela é digitada;
- a rota de anexos e a de comentários: as duas continuam como estão, o que muda é quem as chama;
- o `StatusBadge` do topo, que passa a ser o único lugar onde o status aparece.

---

## 6. Suítes

- `qa/medicao/39-cabecalho-detalhe.js` — atualizada para os itens 10, 13 e 16;
- `qa/medicao/44-comentario-anexo-e-justificativa.js` — nova, **13 provas**, para os itens 17, 18 e 19.

---

## 7. O que a implementação revelou

### 7.1 Tirar o Status abriu um buraco no meio do cabeçalho

O ladrilho "Status" fechava a terceira linha do grid: `Valor · Início da medição · Fim da medição ·
Status`. Sem ele, "Obra" (que ocupa 2 colunas) não cabia no que sobrou e pulava para a linha
seguinte, deixando um vão — e desalinhando tudo que vem depois.

A saída foi aplicar aos campos do **período da medição** a regra que este mesmo arquivo já aplica a
Objeto, Contratado e Responsável desde 23/08: **ladrilho vazio não aparece**. Numa solicitação de
contrato esses dois campos sempre mostravam um travessão; agora só aparecem quando há período.

Isto não estava no pedido. Está aqui declarado porque é mudança de comportamento visível: sem ela, o
item 10 entregaria um cabeçalho pior do que o de antes.

### 7.2 `Anexos.jsx` ficou órfão e foi removido

Com o seletor de arquivos dentro do card de comentário, o componente não era mais importado por
ninguém. Ficou apagado — código morto que duplica um comportamento é uma armadilha para quem vier
depois, e o git guarda a história.

### 7.3 A suíte reprovou por uma armadilha da própria suíte

O primeiro anexo de teste era um `.txt`, e a rota respondeu *"Tipo de arquivo nao permitido"*. A
lista de `uploadComprovantes` aceita pdf, doc/docx, xls/xlsx, csv, ppt/pptx, png, jpg/jpeg e rar —
`.txt` não. A fixture passou a ser um PNG de verdade: reprovar por extensão proibida esconderia o
que a prova mede.

### 7.4 Uma prova de 20/08 inverteu

A suíte **23** exigia que o ladrilho "Apropriação" do cabeçalho mostrasse o rateio **do contrato**,
com o nome da apropriação — era a correção de 20/08 que deu origem àquela suíte, quando o ladrilho
mostrava "-" num contrato que tinha rateio.

O item 16 removeu esse ladrilho. A prova não foi apagada: **inverteu**, e agora exige a ausência
dele. O que ela mede continua sendo o mesmo — de onde a tela lê o rateio — e as provas do card,
logo abaixo, continuam cobrindo o conteúdo.

---

## 8. Regressão — 23/08

**Bateria 03 a 44: 42 suítes, todas passando.**

A reprovação da 23 foi a primeira apanhada pelo `qa/rodar-bateria.js` novo — e desta vez a saída
inteira ficou salva em `qa/relatorios/bateria/23-apropriacoes-do-contrato.log`, que foi como o
motivo apareceu em dois minutos em vez de virar mais uma falha sem explicação.
