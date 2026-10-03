# Mapa de impacto — nova organização do cabeçalho da solicitação

Data: 23/08/2026. Escrito antes da primeira linha de código (regra §6).

Origem: esboço enviado pelo cliente do cabeçalho da tela de detalhes. Confirmei antes de ler que ele
**não sai do código atual** — `Objeto`, `Contratado` e `Responsável` não existem como ladrilho nem
aqui nem na `C:\Fluxy`. É proposta, não defeito de layout.

Decisões do cliente na leitura:

- **Objeto é só exibição.** Não vira campo editável no detalhe.
- **Vale para toda solicitação**, com os campos de contrato ocultos onde não houver contrato.

---

## 1. O que existe hoje

Dois blocos, um atrás do outro:

| Bloco | Colunas | Ladrilhos |
|---|---|---|
| `sol-detail-stats-grid` | 4 fixas | Obra · Setor · Valor · Criado em · Vencimento · (Demissão) · Início medição · Fim medição · Status |
| `+ sol-detail-contract-grid` | 2 fixas | Ref. do contrato · Contrato · Apropriação · Subtipo · Favorecido · Chave PIX |

Todos os ladrilhos têm a **mesma largura** dentro do seu bloco. É daí que vem o desconforto que o
esboço corrige: "Obra" e "Apropriação" — os dois textos mais longos — ficam espremidos na mesma
medida de "Setor" e "Status".

## 2. O que muda

### 2.1 Um bloco só, com largura por campo

Os dois grids viram **um**, de 4 colunas, e cada ladrilho declara quantas colunas ocupa. É o que o
esboço mostra: Objeto na linha inteira, Obra larga, Apropriação e Subtipo em meia linha.

A ordem passa a ser a do esboço — identidade e partes primeiro, depois datas, valores e status:

```
Contrato · Ref. do contrato          (2 + 2)
Objeto                               (4)
Contratado · Responsável · Setor · Criado em
Valor · Início medição · Fim medição · Status
Obra                                 (2)
Apropriação · Subtipo                (2 + 2)
Favorecido · Chave PIX               (2 + 2)
```

O `span` vai como propriedade do ladrilho (`InfoItem`), não como regra de CSS por posição: regra por
posição quebra sozinha quando um campo é ocultado — e ocultar é a norma aqui, não a exceção.

### 2.2 Os três campos novos

| Campo | De onde | Quando aparece |
|---|---|---|
| Objeto | `contratos.objeto` | solicitação dona de contrato do fluxo novo |
| Contratado | `contrato_credores` (PI-12: podem ser vários) | idem |
| Responsável | `contratos.responsavel_id` | idem |

Os três já existem no banco e **nenhum chegava à tela**. No CT-0005: objeto vazio, contratado
*49.101.160 Douglas de Oliveira Gomes*, responsável *Joao*.

Vários contratados saem separados por `·`, o mesmo formato já usado na Apropriação — dois formatos
para a mesma ideia de lista fariam a tela parecer inconsistente sem motivo.

**Ocultos, e não vazios**, quando não há contrato: um ladrilho "Contratado —" numa solicitação de
compra é ruído que a pessoa precisa aprender a ignorar. A regra que já governa `Ref. do contrato` e
`Favorecido` passa a governar os três.

### 2.3 O que a rota precisa devolver

`GET /contratos/:id/parcelas` — a mesma que já alimenta o cabeçalho — passa a incluir `objeto`,
`responsavel` e `contratados` no bloco `contrato`. Sem isso a tela não teria de onde ler.

### 2.4 O que NÃO muda

- **Vencimento** continua ladrilho, e foi para **a caixa que ficou vazia ao lado da Obra** no seu
  esboço — foi a leitura que fez as outras linhas caírem exatamente como desenhadas. No desenho ele
  aparece lá em cima, ao lado de "Alterar status"; não foi para lá porque a barra de ações já tem
  três controles e se reorganiza em tela estreita: o vencimento sumiria junto, e ele é dado, não
  botão. Se quiser mesmo no topo, é uma linha.
- **Ref. do contrato** continua editável no lugar onde já é (`sol-detail-contract-editor`).
- A descrição sob o título, a barra de ações e o resto da página.

## 3. O que pode quebrar

| Risco | Verificação |
|---|---|
| Solicitação sem contrato perder ladrilhos | Suíte abre uma de compra e confere Obra/Setor/Valor/Status |
| Campo novo aparecer onde não há contrato | Suíte exige ausência de Objeto/Contratado/Responsável ali |
| Vários contratados quebrarem a linha | Suíte confere o separador `·` |
| Grid desalinhar em tela estreita | Suíte mede em 1440 e em 768 |
| Cabeçalho perder campo que existia | Suíte confere a lista completa de rótulos, antes e depois |

## 4. Suíte

`qa/medicao/39-cabecalho-detalhe.js`

---

## 5. Resultado

`qa/medicao/39-cabecalho-detalhe.js` — **11 provas, passou.**

As linhas caem exatamente como no esboço:

```
Contrato | Ref. do contrato
Contratado | Responsavel | Setor | Criado em
Valor | Inicio da medicao | Fim da medicao | Status
Obra | Vencimento
Apropriacao | Subtipo
Favorecido | Chave PIX
```

| Prova | Resultado |
|---|---|
| Um bloco só | sim — eram dois |
| Contratado | *49.101.160 Douglas de Oliveira Gomes — 49101160000116*, conferido contra o banco |
| Responsável | *Joao*, conferido contra o banco |
| Objeto (vazio neste contrato) | ladrilho **oculto**, não vazio com travessão |
| Campos antigos | nenhum sumiu |
| Campo de digitação no cabeçalho | nenhum — segue só exibição |
| Solicitação **sem** contrato | Objeto, Contratado, Responsável, Favorecido e PIX ocultos; Obra/Setor/Valor/Status mantidos |
| 768px | grid 700px dentro de uma página de 768px |
| Console do navegador | sem erro |

A suíte é de **leitura**: não cria nem altera nada, então não há estado a devolver na limpeza.
