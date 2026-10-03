# Mapa de impacto — Fase 5: fluxo e status

Data: 23/08/2026. Escrito **antes da primeira linha de código** (regra §6 do `PROTOCOLO-QA.md`).

Itens: **24** (aprovado abaixo do limite, volta para a Obra), **26** (termo aditivo com Aprovar,
Rejeitar e Cancelar), **30** (rejeitado, volta para o setor de quem criou) e **31** (revisão das
permissões dos botões — **auditoria primeiro, mudança só depois de aprovada**, como o cliente pediu).

---

## 1. O que foi verificado antes de propor

### 1.1 `GEO` é a Gerência de Processos

`setores` id 2: código `GEO`, nome `GERENCIA DE PROCESSOS`. A solicitação de contrato nasce nesse
setor — é o que a tela envia em `area_responsavel`. Então "ficar na Gerência de Processos", do item
24, é literalmente a solicitação continuar com `area_responsavel = 'GEO'` depois de aprovada.

### 1.2 Hoje a solicitação só troca de setor quando passa pelo Jurídico

`sincronizarSolicitacaoDoContrato` move `area_responsavel` em cinco situações, e **todas** dependem
de `setor_destino_pos_aprovacao`, que só é preenchido quando o contrato vai ao Jurídico:

| Situação | Destino hoje |
|---|---|
| Vai ao Jurídico | `JURIDICO` (e parqueia a origem) |
| **Rejeitado** | `setor_destino_pos_aprovacao` **ou a área atual** |
| Minuta pronta | `setor_destino_pos_aprovacao` ou a área atual |
| Assinado, em revisão | `JURIDICO` |
| **Fica ATIVO** | `setor_destino_pos_aprovacao` — **e só se ele existir** |

Consequência: **contrato abaixo do limite nunca troca de setor**. Ele não passa pelo Jurídico, o
parqueamento nunca acontece, e ao ficar `ATIVO` a condição da última linha é falsa. Ele fica na GEO.
É exatamente o item 24.

E a devolução (item 30) usa o mesmo parqueamento — que guarda a **área responsável de quando o
contrato foi ao Jurídico**, e não o setor de quem abriu.

### 1.3 A troca de setor já sabe se fazer visível

`espelharERegistrar` grava um `ENVIADA_SETOR` com o texto exato `De X para Y` (sem ponto final) e
`setor` = destino. É o que a regra de visibilidade casa com `LIKE`. O comentário no código conta o
defeito que originou esse cuidado: a primeira versão escrevia *"Encaminhada de GEO para JURIDICO."*
e **a solicitação sumia para o Jurídico**.

Isso resolve o "respeitando as regras de visibilidade" do item 24 sem código novo: trocar o destino
é suficiente, porque o registro e a visibilidade vêm junto.

### 1.4 O termo aditivo não tem tela nenhuma depois de pedido

| O que existe | O que não existe |
|---|---|
| `POST /contratos/:id/aditivos` (pedir) | **rota para LISTAR os aditivos de um contrato** |
| `POST /contratos/aditivos/:id/decisao` (aprovar/rejeitar) | **nenhum botão na tela** |
| Histórico de `ADITIVO_APROVADO` | histórico de rejeição e de cancelamento |
| `STATUS = { PENDENTE, APROVADO, REJEITADO }` | **`CANCELADO`** |

Ou seja: o aditivo é pedido e **fica sem quem o aprove pela interface**. O item 26 é maior do que a
frase sugere — não é só acrescentar um botão, é construir o lugar onde ele fica.

`contrato_aditivos.status` é `varchar(20)`: o status novo **não** precisa de migration.

---

## 2. As decisões

### 2.1 Itens 24 e 30 — um destino só: o setor de quem criou

O cliente respondeu ao item 30: *"volta para o setor de origem, e o setor de origem tem de ser o
setor de QUEM CRIOU — ao ser rejeitado precisa ser resolvida, e quem vai resolver é quem criou."*

O item 24 usa a mesma expressão do 30 (*"voltar para a obra"*), e foi o 30 que o cliente esclareceu.
Então os dois passam a usar **uma regra só: o setor do usuário que criou a solicitação**
(`solicitacoes.criado_por` → `users.setor_id` → `setores.codigo`).

> **Suposição declarada.** Se o cliente quis dizer literalmente o setor `OBRA` (id 7) no item 24 —
> mesmo quando quem abriu o contrato é da GEO —, é a troca de uma linha. Está escrito assim porque
> foi a única das duas frases idênticas que ele esclareceu, e esclareceu para "quem criou".

Quando não dá para descobrir o setor do criador (usuário apagado, ou `criado_por` nulo nos registros
antigos), **o comportamento de hoje continua valendo**: cai em `setor_destino_pos_aprovacao` e
depois na área atual. Um contrato não pode ficar sem fila porque um usuário foi desativado.

### 2.2 Item 26 — o aditivo ganha os três botões

Segue **o fluxo já programado do contrato**, como o cliente pediu:

| Botão | Quem pode | O que faz |
|---|---|---|
| Aprovar | `contratos.aprovacao.aprovar` (estrita) | o que `decidirAditivo` já faz: confere o teto, soma o valor, gera as parcelas |
| Rejeitar | a mesma | exige motivo, e agora **escreve no histórico** |
| Cancelar | `contratos.solicitacao.cancelar` (estrita) | encerra o pedido sem decisão de mérito — status `CANCELADO` |

**Rejeitar e Cancelar não são a mesma coisa**, e é por isso que são dois botões: rejeitar é a
Gerência dizendo *"não aprovo este aumento"*, e exige motivo; cancelar é o pedido sendo retirado —
foi pedido errado, ou deixou de ser necessário. A permissão é diferente porque a decisão é de outra
pessoa, exatamente como no contrato.

Rejeitado e cancelado **não mexem no contrato**: o valor volta a caber no teto por consequência, não
por ajuste. Isso já vale hoje para a rejeição e passa a valer para o cancelamento.

E entram as duas coisas que faltavam para o botão ter onde ficar:

- `GET /contratos/:id/aditivos` — a lista, com status, valor, tipo e motivo;
- um card na tela de detalhe do contrato, com os botões só nos **pendentes**.

### 2.3 Item 31 — auditoria antes de mudar

O cliente pediu explicitamente a lista de quem vê cada botão hoje, **com proposta, antes de
qualquer mudança**. Está na seção 5 deste documento. **Nenhuma linha de permissão é alterada nesta
fase.**

---

## 3. O que pode quebrar

| Risco | Verificação |
|---|---|
| Contrato acima do limite deixar de voltar ao lugar certo | Suíte roda o fluxo com Jurídico e exige a volta ao setor do criador |
| Solicitação sumir para o setor de destino | O `ENVIADA_SETOR` no formato exato; suíte confere o texto e o `setor` |
| Criador sem setor travar a aprovação | Suíte apaga o setor do criador e exige que o fluxo siga pelo caminho antigo |
| Aditivo aprovado deixar de gerar parcela | Suíte 37 continua passando |
| Cancelar virar sinônimo de rejeitar | Suíte exige status distintos, permissões distintas e histórico distinto |
| Cancelar um aditivo já decidido | Suíte tenta e exige 409 |
| Rejeitar sem motivo | Já é 400; suíte mantém |
| Aditivo cancelado continuar consumindo o teto | Suíte cancela e confere que o disponível voltou |

---

## 4. O que **não** muda

- o parqueamento em `setor_destino_pos_aprovacao` — continua sendo o que leva a solicitação ao
  Jurídico e de volta; o que muda é **para onde** ela volta;
- o teto de 25% e a geração de parcelas do aditivo aprovado;
- as permissões dos botões do contrato — item 31, e só depois de aprovado;
- o fluxo do contrato legado.

---

## 5. Item 31 — quem vê cada botão hoje

Levantado em `contratoFluxoNovoService.permissoesDoUsuarioNoContrato` (:1622).

### 5.1 A tabela

| Botão | Regra hoje | Função | Quem vê |
|---|---|---|---|
| **Aprovar** | `contratos.aprovacao.aprovar` | **estrita** | só quem tem a granular |
| **Enviar minuta / conferido** | `contratos.juridico.tramitar` | **estrita** | só quem tem a granular |
| **Rejeitar** | permissão da etapa (`ETAPAS_QUE_REJEITAM`) | **estrita** | só quem tem a granular daquela etapa |
| **Cancelar** | `contratos.solicitacao.cancelar` | **estrita** | só quem tem a granular |
| **Editar medição** | `contratos.medicao.editar_valor` | **estrita** | só quem tem a granular |
| **Solicitar revisão (reenviar)** | `autor OU contratos.geral.criar OU contratos.geral.editar` | **NÃO estrita** | ⚠️ ver abaixo |
| **Confirmar assinatura** | `autor OU criar/editar OU contratos.juridico.tramitar` | **NÃO estrita** | ⚠️ ver abaixo |

### 5.2 Por que os dois últimos são largos — três portas, não uma

1. **`userHasAreaPermission` trata "nenhuma permissão configurada" como LIBERADO.** Usuário que não
   aparece em `PERMISSOES_AREAS_USUARIOS` passa em tudo que usa essa função. A versão **estrita**,
   usada nos outros cinco botões, não faz isso;
2. **`SUPERADMIN` tem passe livre** nela;
3. **`contratos.geral.criar` / `.editar` é permissão de ABRIR contrato, não de tramitar AQUELE
   contrato.** Quem pode abrir contratos vê o botão de reenviar o contrato **dos outros**.

A cláusula "ou quem gerencia contratos" foi escrita por mim, de propósito larga, para não travar o
fluxo quando o autor estivesse indisponível. É ela que produz o que o cliente relatou: *"o botão de
solicitar revisão aparece para mais de um usuário"*.

### 5.3 Proposta

| Botão | Passa a ser | Efeito |
|---|---|---|
| **Solicitar revisão** | `autor` **OU** `contratos.fluxo.reenviar` (**estrita**, permissão nova) | some para quem só tem "criar contratos"; continua para o autor |
| **Confirmar assinatura** | `autor` **OU** `contratos.fluxo.reenviar` (estrita) **OU** `contratos.juridico.tramitar` (estrita) | idem |

A permissão nova existe para **não trocar um problema por outro**: sem ela, autor de férias ou
desligado deixaria o contrato travado sem ninguém que pudesse reenviá-lo. Com ela, a empresa decide
**nominalmente** quem age no contrato dos outros — em vez de isso ser um efeito colateral de ter
permissão para abrir contratos.

**Custo:** enquanto ninguém receber `contratos.fluxo.reenviar`, só o autor reenvia. É preciso
conceder a permissão a quem hoje faz esse papel na prática — provavelmente a Gerência de Processos.

### 5.4 Implementado em 24/08

O cliente aprovou (*"pode implantar o item 31 se for o melhor caminho"*). Entregue exatamente como
proposto, em **três** pontos — e são três de propósito:

| Onde | O que era | O que é |
|---|---|---|
| `reenviarContratoParaAprovacao` :1511 | `userHasAreaPermission(['contratos.geral.criar','.editar'])` | `userHasStrictAreaPermission(['contratos.fluxo.reenviar'])` |
| `usuarioPodeTramitarEtapa` :1663 (etapa `assinado`) | idem | idem |
| `permissoesDoUsuarioNoContrato` :1647 (o que a TELA oferece) | idem | idem |

Os dois primeiros são a **recusa**; o terceiro é o que a tela **oferece**. Mudar só a tela esconderia
o botão e deixaria a rota aberta; mudar só a rota devolveria o defeito de 20/08 — a tela prometendo o
que a pessoa não pode fazer. A regra é lida do mesmo lugar nos três.

`contratos.fluxo.reenviar` foi registrada em `moduloPermissoes.js`, e o passo de concessão no deploy
está em `MIGRACAO-PARA-PRODUCAO.md`.

**O que a suíte 32 não cobria.** Nenhum dos três usuários dela tinha `contratos.geral.criar` — então
ela teria passado igual, sem provar nada. A Gerência passou a ter essa permissão **de propósito**, e
duas provas novas exigem que ela **não** veja os dois botões no contrato de outra pessoa, com o autor
como contraste.

E o backend HTTP estava com o código antigo quando a prova nova rodou pela primeira vez: ela reprovou
por isso, não pela regra. É a armadilha já registrada na Fase 2 — as suítes rodam em processos novos,
o servidor de longa duração não.

---

## 6. Suítes

- `qa/medicao/45-volta-para-o-setor-de-quem-criou.js` — itens 24 e 30;
- `qa/medicao/46-aditivo-aprovar-rejeitar-cancelar.js` — item 26.

---

## 7. O que a implementação revelou

### 7.1 O contrato reenviado nunca mais voltava para a fila de aprovação

**O defeito mais sério desta fase, e foi a regressão que o pegou** — a suíte 31.

Até o item 30, a devolução deixava a solicitação **onde ela já estava**: a fila de quem aprova. O
reenvio a encontrava no lugar certo sem ninguém fazer nada. Mandando-a para o setor do autor, esse
lugar se perde: o contrato reenviado voltava para `AGUARDANDO_APROVACAO` com a solicitação parada no
setor do autor, e a **Gerência de Processos nunca mais a via na fila**.

O item 30, isolado, teria criado um contrato que não pode ser aprovado.

A correção usa o mecanismo que já existe: a devolução **parqueia** a fila de aprovação em
`setor_destino_pos_aprovacao` antes de mandar a solicitação ao autor, e o reenvio a restaura. O
parqueamento não é sobrescrito quando já existe — no caminho do Jurídico ele foi preenchido na ida, e
é ele que traz a solicitação de volta.

`AGUARDANDO_APROVACAO` também é o status de **nascimento** do contrato. A regra não dispara lá
porque na criação o parqueamento ainda não existe.

### 7.2 Quatro suítes afirmavam um lugar, não uma regra

As suítes **18, 20, 28 e 42** conferiam onde a solicitação parava escrevendo `'GEO'` — que era
verdade porque o autor e a fila de aprovação coincidiam. Com os itens 24 e 30 deixaram de coincidir.

Elas passaram a ler a referência do banco (`qa/lib/setorDoCriador.js`) em vez de repetir o código do
setor. A diferença não é cosmética: `'GEO'` afirmava **um lugar**, e a leitura afirma a **regra**.

E a **28** teve de mudar de outro jeito: ela lia a **última** linha do histórico para achar a
rejeição, e a devolução passou a gravar um `ENVIADA_SETOR` depois dela. Agora procura pela **ação**.
Ganhou também uma prova nova, de que a devolução move a solicitação com o `ENVIADA_SETOR` do lado.

---

## 8. Regressão

**44 suítes, todas passando**, rodadas com `node qa/rodar-bateria.js` e o backend reiniciado antes.

Cinco reprovaram na primeira passada — uma delas (a 31) por um defeito de verdade, descrito em §7.1;
as outras quatro por afirmarem um lugar em vez da regra (§7.2).

---

## 9. A etapa que ficou para trás — corrigida em 24/08

Os itens 24 e 30 mudaram o destino de **aprovado** e **rejeitado** para o setor de quem criou. A
etapa **"minuta pronta"** continuou usando o parqueamento, e mandava a solicitação para a fila de
**aprovação** — onde ninguém tinha o que fazer com ela, porque quem colhe a assinatura é o autor.

A própria tela já dizia *"volta ao setor de origem para colher a assinatura"*. O código é que mandava
para outro lugar.

**Encontrado rodando a matriz de teste pela tela** (passo B.8), não pela suíte: o efeito não era um
bloqueio — a regra de visibilidade mantinha o autor enxergando —, era a solicitação aparecer como
responsabilidade de um setor que não ia agir. Uma suíte que só confere permissão e status não vê isso.

Decisão do cliente (24/08): *"precisa voltar para quem criou a solicitação do contrato, que é quem
vai colher a assinatura"*. As três etapas passam a usar a mesma regra.

A suíte 45 ganhou a prova: reenvia, o Jurídico manda a minuta, e o destino tem de ser o setor do
autor.
