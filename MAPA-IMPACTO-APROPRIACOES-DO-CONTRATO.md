# Mapa de impacto — apropriações do contrato na tela da solicitação

Escrito antes da primeira linha de código, conforme a regra de trabalho §6 do LEIA-PRIMEIRO.

Data: 20/08/2026. Decisão do cliente: **a tela lê as apropriações do CONTRATO** (nada de cópia
espelhada na solicitação).

---

## 1. O defeito

Na SOL-5112 (contrato CT-0002, id 2326) o ladrilho **APROPRIACAO** do cabeçalho mostra `-` e o card
**Editar apropriações da solicitação** abre vazio, embora o contrato tenha duas apropriações rateadas
em 50%/50%.

Não é falha de carregamento: são tabelas diferentes.

| Onde está | Conteúdo |
|---|---|
| `contrato_apropriacoes` (contrato 2326) | 881 `00.002.001` 50% · 884 `00.003.002` 50% |
| `solicitacao_apropriacoes` (solicitação 5596) | vazio |
| `solicitacoes.apropriacao_id` | `NULL` |

O formulário de Abertura de Contrato grava o rateio no **contrato** — que é o lugar certo: é de
`contrato_apropriacoes` que sai o rateio dos títulos na aprovação (`montarRateios`, em
`contratoFluxoNovoService`, divide cada parcela em centavos com a sobra na última).

## 2. Por que as duas tabelas existem, e por que não são duplicata

`solicitacao_apropriacoes` **não** é uma cópia de `contrato_apropriacoes`. Lendo
`SolicitacaoController.atualizarApropriacoes`, o rateio da solicitação só aceita apropriações que já
pertençam ao contrato (`mapaContrato`) — ele é uma **subdivisão por solicitação** dentro da lista do
contrato. Faz sentido para uma solicitação de **medição** do fluxo antigo: "esta medição consome estas
apropriações do contrato, nestas proporções".

Para a solicitação de **Abertura de Contrato** (PI-16) essa distinção some: a solicitação *é* o
contrato, então o rateio dela é o rateio dele. Mostrar um card que grava numa terceira lista que
ninguém consome é o que cria a armadilha.

## 3. Risco de deixar como está

O card "Editar apropriações da solicitação" continua aberto nesta tela. Quem salvar ali grava em
`solicitacao_apropriacoes` uma lista que **nada consome** para este contrato — os títulos saem de
`contrato_apropriacoes`. Duas verdades sobre o mesmo contrato, divergindo em silêncio.

## 4. O que muda

### 4.1 Backend — `PATCH /contratos/:id/apropriacoes` (novo)

Editar o rateio do contrato de dentro da solicitação. Reaproveita a aritmética e as validações já
auditadas; não inventa regra nova.

- **Permissão:** `contratos.geral.editar` (Breno, do GEO, já tem).
- **Escopo:** `requireContratoAccess` — a mesma guarda por obra das demais rotas de contrato.
- **Só no fluxo novo** e só na solicitação dona do contrato.
- **Bloqueios:** recusa quando já existe título financeiro do contrato, e quando o contrato está
  `ATIVO` ou `ENCERRADO`. Motivo: depois que os títulos nascem, o rateio deles já foi gravado em
  `titulos_financeiros_rateios` — mudar a origem sem mudar o destino cria divergência silenciosa.
  Mesma trava que a solicitação já aplica (`Nao e possivel alterar apropriacoes depois que a
  solicitacao possui titulo financeiro`).
- **Validação:** apropriações da obra do contrato, ativas, analíticas (não somadoras), sem repetição,
  soma dos percentuais = 100% (tolerância 0,0001, igual à da tela).
- **Motivo obrigatório**, gravado como `Historico` da solicitação do contrato + evento de segurança
  `CONTRACT_APPROPRIATIONS_UPDATED`. Sem motivo não há como reconstruir a decisão depois.

### 4.2 Frontend

- `Header.jsx` — o ladrilho **APROPRIACAO** passa a listar as apropriações do contrato (código e
  percentual) quando a solicitação é a dona de um contrato do fluxo novo. Fora disso, nada muda.
- `index.jsx` — na solicitação de contrato, o card "Apropriações da solicitação" dá lugar a um card
  de **rateio do contrato**, que mostra a lista atual e abre a edição.
- Componente novo `ApropriacoesDoContrato.jsx` — lista + modal de edição reusando
  `RateioApropriacoesContrato` (as duas colunas % e R$ já existem) dentro de `OverlayModal`.

## 5. O que NÃO muda

- `solicitacao_apropriacoes` continua existindo e funcionando para medição do fluxo antigo — nenhuma
  linha é apagada, nenhum endpoint removido.
- `contrato_apropriacoes` continua sendo a única origem do rateio dos títulos.
- A tela Gestão de Contratos (coluna "Itens de Apropriação") e a importação por planilha seguem iguais.
- Nada é espelhado, copiado ou sincronizado entre as duas tabelas.

## 6. O que pode quebrar (e a verificação de cada um)

| Risco | Verificação |
|---|---|
| Editar o rateio depois dos títulos | Suíte tenta editar com contrato ATIVO e exige 400 |
| Rateio que não fecha 100% | Suíte envia 50/40 e exige 400 |
| Apropriação de outra obra | Suíte envia apropriação de obra diferente e exige 400 |
| Sem permissão `contratos.geral.editar` | Suíte tenta com usuário sem a permissão e exige 403 |
| Quebrar a edição de apropriações da solicitação comum | Suítes existentes de solicitação seguem passando |
| Ladrilho quebrar em solicitação sem contrato | Suítes 01 e 09 (telas legadas) seguem passando |

## 7. Suíte

`qa/medicao/23-apropriacoes-do-contrato.js` — cobre os quatro 400/403 acima, a edição feliz (com
motivo no histórico) e a leitura na tela (ladrilho do cabeçalho e card).

---

## 8. Resultado (20/08)

Implementado como planejado, sem desvio.

**Backend**
- `contratoFluxoNovoService.atualizarApropriacoesDoContrato` — permissão `contratos.geral.editar`,
  motivo obrigatório, validações (100%, obra, ativa, analítica, sem repetição), trava por estado e
  por título já criado, histórico com antes/depois e evento `CONTRACT_APPROPRIATIONS_UPDATED`.
- `ContratoFluxoNovoController.atualizarApropriacoes` e a rota
  `PATCH /contratos/:id/apropriacoes`, atrás de `requireContratoAccess`.

**Frontend**
- `Header.jsx` — o ladrilho APROPRIACAO lê as apropriações do contrato quando a solicitação é a
  dona dele. Na SOL-5112 passou de `-` para `00.002.001 (50%) · 00.003.002 (50%)`.
- `ApropriacoesDoContrato.jsx` (novo) — card com o rateio em % e em R$, e a edição num modal que
  reusa `RateioApropriacoesContrato` (as colunas sincronizadas e o autocomplete já estavam ali).
- `index.jsx` — o card "Apropriações da solicitação" não é mais oferecido quando a solicitação é
  um contrato do fluxo novo.

**Duas correções durante a implementação**
- `titulos_financeiros` **não tem** coluna `contrato_id`. A trava contava título pelo contrato e
  teria contado sempre zero. O vínculo real é `contrato_parcelas.titulo_financeiro_id`.
- Não existe apropriação somadora **ativa** na obra 23: a guarda de inativa disparava antes e
  mascarava a prova. A suíte liga a somadora só nesse passo e devolve o estado no `finally`.

**Suíte `qa/medicao/23-apropriacoes-do-contrato.js` — 19 provas, todas passando**, entre elas:
recusa por falta de permissão, por falta de motivo, por soma ≠ 100%, por obra errada, por somadora
e por repetição; a confirmação de que **nenhuma recusa alterou o banco**; o histórico com o antes e
o depois; o 409 depois de o contrato ficar ATIVO; e a prova de que os títulos foram rateados pelas
apropriações do contrato (`6575 6576 6577`).

**Regressão:** suítes 01, 17, 18, 20, 21 e 22 seguem passando, com limpeza fechando em zero.

---

## 9. Só o nome e o percentual (20/08, ajuste do cliente)

Pedido: as apropriações passam a aparecer pelo **nome**, sem o código.

A mesma expressão `codigo — descricao` estava em três lugares (ladrilho do cabeçalho, tabela do card
e bloco das previsões). Virou `frontend/src/utils/apropriacao.js`, com `nomeApropriacao` e
`percentualApropriacao` — três cópias divergiriam na primeira correção.

- `nomeApropriacao` usa a descrição; **cai no código** quando a apropriação não tem descrição.
  Existe apropriação assim no cadastro, e mostrar o código é melhor do que mostrar vazio.
- `percentualApropriacao` corta os zeros à direita: `50%` em vez de `50,0000%`.

Na SOL-5112 os três lugares passaram a ler
`ALUGUEL DE EQUIPAMENTOS E MÁQUINAS (50%) · A- EQUIPAMENTOS, FERRAMENTAS E PROTEÇÃO COLETIVA (50%)`.

**Duas telas ficaram como estavam, de propósito:** a coluna "Itens de Apropriação" da Gestão de
Contratos (é lista de conferência, e ali o código é o identificador) e o campo de busca com
autocomplete dentro do modal (é por código que se procura a apropriação). Se o cliente quiser
qualquer uma das duas também sem código, é um passo à parte.

Suíte 23 ganhou duas provas: o ladrilho começa com letra (não com o código, que na obra 23 é `1`/`2`)
e a tabela do card não tem mais o padrão `codigo — nome`. Suítes 01, 09, 21, 22 e 23 passando.
