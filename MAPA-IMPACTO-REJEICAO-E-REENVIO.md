# Mapa de impacto — rejeição pelo Jurídico e reenvio para ajuste

Data: 20/08/2026. Escrito antes da primeira linha de código (regra §6).

Relatado: o Jurídico rejeitou um contrato em `EM_ANALISE_JURIDICA` e recebeu
`Contrato nao esta aguardando aprovacao (status atual: EM_ANALISE_JURIDICA)`.

Pedido: **voltar para quem criou, para ajustar e submeter de novo à aprovação do Jurídico.**

---

## 1. São três defeitos, não um

### 1.1 A guarda de status

`rejeitarContrato` só aceita `AGUARDANDO_APROVACAO`. O Jurídico nunca conseguiria rejeitar.

### 1.2 A permissão está errada para quem usa

A rejeição exige `contratos.aprovacao.aprovar` — permissão da **Gerência de Processos**. O Jurídico
tem `contratos.juridico.tramitar`. Mesmo sem a guarda de status, ele levaria 403.

> É a quarta vez neste bloco que a permissão foi escolhida pelo que a rota faz e não por quem
> precisa usá-la. Já está nas armadilhas do `LEIA-PRIMEIRO.md`, e aconteceu de novo.

### 1.3 O pior: **nada sai de `REJEITADO`**

Procurado no serviço: `REJEITADO` é escrito em um lugar e **lido em nenhum** como ponto de partida.
Não existe transição que saia dele.

Ou seja: hoje, **a rejeição da própria Gerência de Processos também não tem volta.** A solicitação
fica em `PENDENTE DE AJUSTE`, o responsável corrige — e não há botão que a devolva para aprovação. O
defeito que o cliente encontrou no Jurídico já existia no caminho principal, sem ter sido notado.

### 1.4 Achado durante o teste: a devolução não devolvia a solicitação

A suíte encontrou um quarto defeito, que não estava previsto aqui. `sincronizarSolicitacaoDoContrato`
não tem caso para `REJEITADO`: o status virava `PENDENTE DE AJUSTE`, mas `area_responsavel` ficava
onde estava.

Quando o Jurídico devolvia, a solicitação **continuava com o Jurídico**. O responsável, que é quem
tem de corrigir, nunca a via na fila dele — e o motivo da devolução ficava escrito numa tela que ele
não abria. Exatamente o que você pediu ("voltar para o usuário que criou") não acontecia nem depois
de rejeitar passar a funcionar.

Corrigido junto: em `REJEITADO`, a solicitação volta para `setor_destino_pos_aprovacao` (o setor de
origem, parqueado quando ela foi ao Jurídico). O parqueamento **não** é limpo — é ele que leva a
solicitação de volta ao Jurídico no reenvio, e ao responsável quando o contrato ficar `ATIVO`.
Devolução na própria aprovação não tem parqueamento, e a área simplesmente não muda.

## 2. O que muda

### 2.1 Rejeitar passa a valer nas duas etapas

| De | Quem pode | Permissão |
|---|---|---|
| `AGUARDANDO_APROVACAO` | Gerência de Processos | `contratos.aprovacao.aprovar` |
| `EM_ANALISE_JURIDICA` | Jurídico | `contratos.juridico.tramitar` |
| `EM_REVISAO_JURIDICA` | Jurídico | `contratos.juridico.tramitar` |

A permissão é escolhida **pela etapa de onde parte a rejeição**, não por uma lista fixa. Quem
aprova rejeita na aprovação; quem tramita no Jurídico rejeita no Jurídico.

`EM_REVISAO_JURIDICA` entra junto de propósito: é a conferência do contrato assinado, e é
exatamente ali que o Jurídico pode achar problema no documento.

### 2.2 O contrato guarda **onde** foi rejeitado

Coluna nova `contratos.rejeitado_na_etapa` (`APROVACAO` | `JURIDICO`, anulável).

Sem ela o reenvio não teria para onde ir: rejeitado pela GEO volta para a GEO; rejeitado pelo
Jurídico volta para o Jurídico — que é o que o cliente pediu ("submeta novamente à aprovação do
Jurídico"). **Volta para quem devolveu**, não para o começo da fila.

Migration `202608200053_contrato_rejeitado_na_etapa.js`, na faixa `0050+` da convenção.

### 2.3 Reenviar para ajuste

`reenviarContratoParaAprovacao(contratoId, { usuario })`:

- só de `REJEITADO`;
- vai para `AGUARDANDO_APROVACAO` ou `EM_ANALISE_JURIDICA`, conforme `rejeitado_na_etapa`;
- limpa `motivo_rejeicao` e `rejeitado_na_etapa` — o motivo antigo não pode ficar pendurado num
  contrato que voltou a andar;
- **quem pode:** o autor do contrato, ou quem tem `contratos.geral.criar` / `contratos.geral.editar`.
  É a mesma regra do anexo da negociação, pela mesma razão: quem abriu é quem corrige;
- registra `CONTRATO_REENVIADO` no histórico, com o encaminhamento de setor.

### 2.4 Na tela

O card de ações ganha, no estado `REJEITADO`, o botão **Reenviar para aprovação** — com o texto
dizendo para onde vai. Hoje esse estado só mostra o motivo, sem saída.

## 3. O que fica pendente de decisão sua

**Se o valor do contrato mudar durante o ajuste, a aprovação da Gerência de Processos fica
desatualizada.**

Quando o Jurídico rejeita, a GEO já aprovou — inclusive a categoria financeira e o valor. Se o
responsável corrigir o valor e reenviar direto ao Jurídico, o contrato volta a andar com uma
aprovação que se referia a outro número.

Não vou decidir isso sozinho: é regra de negócio. Duas saídas possíveis, e a escolha é sua.

1. **Reenvio sempre volta para quem rejeitou** (o que está sendo implementado). Simples e previsível;
   assume que o ajuste pedido pelo Jurídico é documental, não financeiro.
2. **Valor alterado força passar pela GEO de novo.** Mais seguro para o dinheiro, exige guardar o
   valor aprovado para comparar.

Implemento a 1 agora e deixo a 2 anotada. Se você quiser a 2, é uma rodada curta.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| GEO rejeitar deixando de funcionar | Suíte 20 e 28 seguem passando |
| Jurídico rejeitar sem permissão | Suíte tenta com quem só aprova e exige 403 |
| Reenvio de contrato que não está rejeitado | Suíte tenta de `ATIVO` e exige 409 |
| Reenvio por quem não é o autor | Suíte tenta com terceiro e exige 403 |
| Motivo antigo ficar pendurado | Suíte confere `motivo_rejeicao` nulo após reenvio |
| Reenvio indo para a etapa errada | Suíte rejeita nas duas etapas e confere o destino de cada uma |

## 5. Suíte

`qa/medicao/31-rejeicao-e-reenvio.js`

---

## 6. Resultado

`qa/medicao/31-rejeicao-e-reenvio.js` — **19 provas, passou.**

Regressão: **08** (devolução e encerramento), **10** (trilha do Jurídico), **20** (fluxo pela tela),
**28** (histórico) e **30** (visibilidade do Jurídico) seguem passando.

O que ficou provado:

| Prova | Resultado |
|---|---|
| Gerência devolve de `AGUARDANDO_APROVACAO` | `REJEITADO`, etapa `APROVACAO` |
| Jurídico devolve de `EM_ANALISE_JURIDICA` | `REJEITADO`, etapa `JURIDICO` |
| Na aprovação, quem só tem a permissão do Jurídico | 403 |
| No Jurídico, quem só aprova contrato | 403 |
| Em `AGUARDANDO_ASSINATURA` | 409 — não é etapa de análise |
| Reenvio depois da devolução da Gerência | volta para `AGUARDANDO_APROVACAO` |
| Reenvio depois da devolução do Jurídico | volta para `EM_ANALISE_JURIDICA` |
| Reenvio de contrato que não está devolvido | 409 |
| Reenvio por quem não abriu nem gerencia contratos | 403 |
| Reenvio por quem gerencia contratos, sem ter aberto | permitido |
| Motivo antigo após o reenvio | `motivo_rejeicao` e `rejeitado_na_etapa` nulos |
| Parcelas | `REJEITADA` na devolução, `PREVISAO` no reenvio |
| Solicitação devolvida pelo Jurídico | volta para `GEO`, em `PENDENTE DE AJUSTE` |
| Histórico | `CONTRATO_REJEITADO` > `ENVIADA_SETOR` > `CONTRATO_REENVIADO` > `ENVIADA_SETOR` |

Os `ENVIADA_SETOR` no formato canônico mantêm a visibilidade dos dois lados: o Jurídico continua
enxergando a solicitação que devolveu, e o responsável passa a enxergá-la de novo.
