# O caso do "⋯" que sobrou — a lista de Solicitações (07/09)

> **Está com você.** Você disse: *"Se em alguma tela houver itens demais para
> caberem visíveis, me traga o caso em vez de decidir sozinho."* Este é o
> caso. Ele é **um** — as outras nove telas foram feitas.

Tudo abaixo é **medido**, com o CSS real do sistema, num Chromium com as
mesmas folhas e na mesma ordem de cascata do app.

---

## O que já foi feito (não depende de você)

O menu "⋯" saiu de **nove telas**. Em todas, o que estava dentro dele virou
botão visível na própria faixa:

| Tela | O que saiu do menu | Para onde foi |
|---|---|---|
| Governança do Sistema | Exportar CSV, XLSX, PDF | secundárias (5 botões na faixa) |
| Cadastro de Pessoas | Baixar modelo, Exportar, Importar | secundárias (4) |
| Usuários | Baixar modelo CSV, Importar | secundárias (3) |
| Usuários | Resetar senhas de todos (perigosa) | **destrutiva**, apartada |
| RH/DP · Importações | Modelo Jornada / Evento variável / Desconto | secundárias (4) |
| RH/DP · Colaboradores | Baixar modelo, Importar massa | secundárias (3) |
| Detalhe da solicitação | Personalizar layout | secundária, com `aria-pressed` |
| CRM · Leads | Exportar CSV | secundária (2) |
| CRM · Detalhe do lead | Redistribuir lead | secundária (5 no total) |
| Gestão da Cotação | Cancelar cotação (perigosa) | **destrutiva**, ao lado de "Recusar" |

**A folga da faixa que você previu, medida.** As nove telas foram remontadas
com todos os itens visíveis e medidas a 1920, 1366 e 390:

- **1920 e 1366** — todas em **uma linha só**, nenhum rótulo cortado. A mais
  carregada é a Governança, com cinco botões.
- **390** — a barra quebra em 2 ou 3 linhas (`flex-wrap: wrap`, que ela já
  tinha), **nenhum rótulo cortado**, **nenhuma rolagem lateral da página**.

Duas coisas mudaram no componente por causa disso, e as duas são para não
perder o que o menu fazia:

1. **`destrutiva` passou a aceitar lista.** O menu apartava o item `perigosa`
   com separador e cor de perigo. Na faixa, o equivalente é o grupo apartado —
   e a Gestão da Cotação tem **duas** destrutivas ("Recusar" e "Cancelar
   cotação"), que num slot único disputariam o mesmo lugar.
2. **A prop `mais` do `PageHeader` deixou de existir.** Não sobrou caminho
   para esconder ação atrás de um botão na faixa.

---

## O caso que fica com você: a célula de ações da lista de Solicitações

Este "⋯" não está numa faixa de página. Está **dentro da linha da tabela**, na
coluna de ações — que tem largura declarada (`larguraAcoes={320}`, com teto de
320 no componente).

**O que ele guarda hoje:** "Arquivar" (ou "Desarquivar") e, para superadmin e
admin GEO, **"Excluir"**.

**O que já está visível na linha:** "Ver", "Assumir", "Atribuir", "Enviar".

### A medição

Larguras naturais dos botões, com o CSS real:

| | Botões | Largura natural somada (com os vãos) | Útil na célula |
|---|---|---|---|
| **Hoje** (com o "⋯") | Ver, Assumir, Atribuir, Enviar, ⋯ | **351px** | 296px |
| **Sem o menu** | Ver, Assumir, Atribuir, Enviar, Arquivar, Excluir | **478px** | 296px |

E há um detalhe de CSS que decide o caso:

```css
.app-tabela td .app-actionbar { flex-wrap: nowrap; }
```

Na faixa da página a barra **quebra em linhas** — foi por isso que as nove
telas couberam. Na célula da tabela ela **não quebra**: essa regra existe
porque empilhar botões deixava a linha altíssima. Então o que não cabe não
desce para a linha de baixo — ele **é comprimido**.

Medido no estado "sem menu", com os seis botões na célula de 320px:

```
Ver=34   Assumir=46 CORTADO   Atribuir=44 CORTADO
Enviar=42 CORTADO   Arquivar=47 CORTADO   Excluir=43 CORTADO
```

**Cinco dos seis rótulos saem cortados.** É a mesma família de defeito do
"Fechado com" que o revisor separado pôs em primeiro lugar: a caixa fecha
normalmente no ponto do corte, não há reticência nem borda cortada — o botão
**parece inteiro e não é**.

Hoje, com o menu, os quatro botões também são comprimidos (48→41, 83→65…), mas
**nenhum é cortado**: os 351px cabem na compressão que os 296px permitem. Os
478px não cabem.

### E há uma segunda coisa, que não é de espaço

"Excluir" é destrutivo e irreversível. Hoje ele está atrás do menu, apartado
por separador e em cor de perigo. Torná-lo botão permanente **em toda linha**
de uma lista de centenas de solicitações, encostado em "Enviar", muda o risco
de clique errado — e isso é decisão sua, não minha.

### As saídas que eu consigo medir

**(a) Alargar a coluna de ações.** Para caber 478px sem corte a coluna precisa
de ~518px. O teto do componente (`Math.min(larguraAcoes, 320)`) teria de subir.
**Custo medido:** esses ~200px saem das colunas de dado da mesma tabela, na
largura onde ela já é mais apertada. A 1366 isso é 15% da tabela inteira.

**(b) Deixar a barra da célula quebrar em linhas** (tirar o `nowrap` só desta
tabela). Cabe, sem corte. **Custo:** a linha fica com duas fileiras de botões e
cresce em altura — é exatamente o que aquele `nowrap` foi escrito para evitar.
Numa lista de 50 linhas, a página quase dobra.

**(c) Encurtar os rótulos** ("Arquivar"→ ícone, "Excluir"→ ícone). Cabe.
**Custo:** ícone sem rótulo é adivinhação, e é justamente o botão que apaga o
registro. Vai contra a regra de que o botão diz o que acontece.

**(d) Manter o "⋯" só aqui**, como exceção medida e registrada. É o estado
atual, e por isso o menu não foi apagado do sistema.

**(e) Tirar "Excluir" da linha** e deixá-lo só no detalhe da solicitação, onde
há faixa com espaço. Aí sobra só "Arquivar" visível, e a soma cai para 404px —
ainda acima dos 296px úteis, então "Arquivar" também teria de encurtar ou a
coluna crescer um pouco. **Isto remove capacidade de uma tela**, então não seria
feito sem a sua palavra de qualquer jeito.

**A minha leitura, se você quiser uma:** (d) enquanto não houver decisão, e
(a) com um número menor se você quiser o menu fora daqui também — porque as
outras quatro trocam corte de texto, altura de linha ou clareza do botão por
espaço, e as três coisas são piores que a coluna de dado um pouco menor. Mas
(a) muda a largura de uma tabela que você usa todo dia, e é sua.

---

## O que o portão passou a cobrar (R36)

Para o menu não voltar por descuido, a regra entrou no validador estático com
trinco (`scripts/trinco-menu-mais.json`), no mesmo molde da R19 e da R35:

- arquivo **novo** com `<MenuMais>` → **FALHA**;
- arquivo do trinco que **aumenta** a contagem → **FALHA**;
- arquivo do trinco que **diminui** → passa, e o trinco aperta.

O trinco tem **uma** linha: `src/pages/Solicitacoes/LinhaSolicitacao.jsx`, com
o motivo medido escrito dentro do arquivo. No dia em que você decidir, essa
linha some e o número vai a zero.

A regra tem mordida nas duas direções (`scripts/provas/regrasMordem.mjs`): ela
reprova uma tela nova que monte o menu, e **não** reprova as nove telas que o
tiraram e ainda o citam em comentário para explicar de onde o botão veio.
