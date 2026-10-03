# As três correções do cliente (06/09) — diagnóstico medido antes de codar

Pedido em três itens, todos "valem para todo o sistema". Aqui está o que
**medi** antes de mexer, para nenhum agente começar por suposição.

Observação de método: as capturas chegaram depois da primeira versão deste
documento. O que elas confirmaram e o que elas **corrigiram** está marcado
abaixo. Tudo o mais foi medido no código.

---

## Item 1 — Controles do bloco na mesma linha do título

**O que o cliente descreve:** na consulta, o arranjo virou quatro linhas —
título do bloco (com vazio à direita), "Carteira", campos, botões. Ele quer os
controles do bloco (Carteira, Mais filtros, Filtros visíveis, Limpar) **na
linha do título**, ocupando esse vazio; campos abaixo; "Consultar" à direita,
no fim.

**A regra que ele declarou, e que é maior que a tela:** espaço horizontal vago
ao lado do título deve ser usado pelos controles do bloco, em vez de empurrar
tudo para baixo.

**O que já sabemos por medição anterior (05/09):** o cabeçalho de bloco já
tinha sido medido com faixa vazia. Naquele levantamento, **77 dos 209
cabeçalhos do sistema não declaram ação nenhuma** — a barra de ações é
desenhada, mede 0px, e o `space-between` deixa o vazio à direita. É o mesmo
vazio que o cliente agora quer preenchido.

**O que a captura mostra, medido nela:** a tela gasta **quatro linhas** onde
caberiam duas. Linha 1: título + subtítulo, com a caixa "Salvar filtro neste
navegador" à direita e vazio entre os dois. Linha 2: só o par
"Carteira · A receber | A pagar". Linhas 3–4: os campos, sendo que
"N. documento" fica **sozinho numa linha inteira** enquanto a de cima tem
quatro campos. Linha 5: "Mais filtros", "Filtros visíveis (7/15)", "Limpar" à
esquerda e "Consultar" à direita.

Na captura do arranjo desejado, Carteira, Mais filtros, Filtros visíveis e
Limpar sobem todos para a linha do título, e os campos ficam logo abaixo. O
cliente escreveu que o "Consultar" **continua à direita, no fim** — na captura
do desejado ele aparece embaixo à esquerda, mas isso é do recorte que ele
montou à mão; vale o texto.

---

## Item 2 — Painel que abre para fora da janela

**O que o cliente descreve:** a caixa abre para fora da lateral esquerda e
fica cortada; metade do conteúdo fica inalcançável.

**Correção pela captura:** o painel aberto **não é o "Mais filtros"** — é o
**"Filtros visíveis (7/15)"**. É esse o botão com o anel de foco, e o texto
cortado que se lê na captura ("…preenchido: esconder limpa e refaz a
consulta", "…to início", "…to fim") é do painel de filtros visíveis. Isso
localiza o defeito: está no `PainelFiltrosVisiveis`, componente **novo desta
leva**. Conserto na origem vale para toda tela que o use, de uma vez.

**A regra:** todo painel, menu e lista suspensa se reposiciona para caber — se
não couber de um lado, abre para o outro; se não couber em lado nenhum, alinha
à borda e rola por dentro.

**O mecanismo já existe e está provado.** `usePosicaoFlutuante(ancoraRef,
menuRef, aberto, { ancorarADireita })`, em `TabelaPadrao.jsx`, foi escrito
nesta sessão exatamente para isso: mede o tamanho real do menu e o prende
dentro da janela. Ele já é usado pelo menu de alinhamento e pelo painel de
colunas — e nasceu de um defeito idêntico, que custou 4 células de matriz.

**Portanto o item 2 não é inventar: é generalizar o que já funciona.** Medido:
**35 pontos de chamada de `useFecharAoSair`** em 25 arquivos marcam onde estão
as camadas flutuantes do sistema. Cada uma precisa ser conferida contra o
`usePosicaoFlutuante`.

---

## Item 3 — Conteúdo passando por cima da barra do topo

**O que o cliente descreve:** ao rolar, botões e blocos passam POR CIMA da
barra do topo e do cabeçalho fixo.

**Confirmado na captura:** o par "Carteira · A receber | A pagar" e a fileira
inteira de campos aparecem desenhados **sobre** a barra do topo, cobrindo o
logo, o botão "Início" e a trilha de navegação.

**A causa, medida — e não é uma tela, são 131 lugares.**

A escala de camadas **já existe**, em `index.css`:

```
--z-sticky: 20     (barra do topo, faixa fixa)
--z-dropdown: 25
--z-sidebar: 30
--z-dropdown-portal: 90
--z-modal: 100
--z-toast: 120
```

E é contornada em **110 lugares, em 29 arquivos** — número da regra R32, que
tira comentários antes de contar. (A primeira versão deste documento dizia
131: era `grep` cru, que contava menção em comentário. O número certo é 110.)

Os piores, medidos:

| arquivo | ocorrências |
|---|---|
| `src/index.css` | **35** |
| `src/pages/FinanceiroConciliacao.jsx` | 9 |
| `src/modules/custosRecebiveis/styles/custos-recebiveis.css` | 8 |
| `src/pages/FinanceiroTitulos.jsx` | 8 |
| `src/modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx` | 7 |
| `src/styles/componentes-padrao.css` | 4 |

O `index.css` liderar não é detalhe: é o arquivo que **declara** a escala. Ele
tem 40 `z-index`, dos quais só 6 são as definições dos tokens — as outras 34
furam a própria fila que ele define. A primeira versão da regra R32 excluía
esse arquivo inteiro "por ser a fonte", e com isso dava passe livre justamente
ao maior infrator. Corrigido: nenhum arquivo fica de fora.

**Aqui está o defeito do cliente, em uma linha:** a barra fixa vale **20**, e
há **11 usos de `z-50`** e outros acima disso em conteúdo comum. Conteúdo em 50
passa por cima de barra em 20. Não é acaso de uma tela — é o que a escala
permite quando ninguém obriga a usá-la.

**O que o cliente pediu, e é o certo:** padronizar num único lugar, não tela a
tela, e acrescentar ao verificador. Sem a regra no portão, os 131 voltam.

**Cuidado que a correção exige:** `z-index` só compara dentro do mesmo
**contexto de empilhamento**. Um ancestral com `transform`, `filter`,
`opacity < 1`, `will-change` ou `contain` cria contexto novo, e ali o valor
maior do filho não vence a barra de fora. Trocar número por token sem conferir
isso conserta a metade fácil e deixa a difícil de pé.
