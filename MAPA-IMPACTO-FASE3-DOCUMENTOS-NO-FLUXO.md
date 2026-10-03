# Mapa de impacto — Fase 3 do módulo DP: documentos no fluxo

Data: 25/08/2026. Escrito **antes da primeira linha de código**.

Continuação de `MAPA-IMPACTO-FASE2-PEDIDO-E-DECISAO-DO-DP.md`, que entregou o pedido de pessoal
com efeito no cadastro e no vínculo.

---

## 1. O que já existe

### 1.1 A tabela e os tipos estão prontos e cadastrados

`rh_documentos_tipos` já traz, por vínculo, com a marca de obrigatório:

| Vínculo | Documentos |
|---|---|
| CLT | RG, CPF, CTPS, **ASO**, Contrato/ficha — **todos obrigatórios** |
| NÃO CLT | Documento pessoal, Contrato (obrigatórios), Documento fiscal |
| Todos | Comprovante bancário (obrigatório), Outros |

`rh_documentos` tem `colaborador_id`, `documento_tipo_id`, `validade`, `status`,
`documento_anterior_id` (substituição com histórico) e `ativo`. **Zero registros.**

### 1.2 O serviço de documento também existe

`rhService` já tem `criarDocumentoRh`, `atualizarDocumentoRh`, `substituirDocumentoRh`,
`obterLinkDocumentoRh`, `listarDocumentosRh` e — o mais relevante para esta fase —
`construirResumoDocumentalColaborador`, que já sabe dizer o que falta.

E `ensureDocumentoTipoCompativel` já recusa anexar documento de CLT em não-CLT.

> Ou seja: **a Fase 3 não constrói o documento. Ela liga o documento ao pedido.**

---

## 2. O buraco

| Falta | Consequência |
|---|---|
| O documento não se liga ao **pedido** | não dá para saber quais documentos vieram com a admissão do João |
| O pedido não sabe **o que ainda falta** | o DP aprova uma admissão sem ASO e descobre depois |
| A obra não tem **onde anexar** ao pedir | ela pede por um canal e manda o documento por outro |

### 2.1 A admissão é o caso que dói

Na Fase 2, `ADMISSAO` cria o colaborador **na aprovação**. Antes disso o colaborador não existe — e
`rh_documentos.colaborador_id` é obrigatório.

> **Não dá para anexar o RG de alguém que ainda não é ninguém.** É o nó desta fase, e é a razão de
> ela merecer mapa em vez de ir direto ao código.

---

## 3. As duas saídas, e qual eu recomendo

**A. Criar o colaborador ao ABRIR o pedido**, com status `EM_ADMISSAO`, e aprovar só muda para
`ATIVO`.

**B. Guardar os anexos no pedido** (`rh_solicitacao_anexos`) e, na aprovação, transferi-los para
`rh_documentos` do colaborador recém-criado.

| | A — colaborador provisório | B — anexo no pedido |
|---|---|---|
| Reaproveita `rh_documentos` desde o início | **sim** | não — só depois da aprovação |
| Cria "colaborador" que pode nunca existir | **sim, e é o problema** | não |
| Admissão rejeitada deixa lixo | **sim**: um `EM_ADMISSAO` órfão, que entra em contagem, em busca, em relatório | não: o pedido fica `REJEITADA` e pronto |
| CPF único trava reenvio | **sim** — o CPF já está tomado pelo próprio provisório | não |
| Trabalho | menor | maior |

**Recomendo B.** A razão decisiva não é elegância: é que **a admissão pode ser recusada**. Com A,
toda admissão rejeitada deixa uma pessoa meio-cadastrada no sistema, e a Fase 1 acabou de ensinar
o preço de dado que não deveria estar lá — 136 colaboradores sem obra já poluem o custo por obra.

E há um efeito colateral silencioso em A: `assertUniqueColaborador` recusa CPF repetido. Um pedido
rejeitado deixaria o CPF preso ao provisório, e **o reenvio do próprio pedido falharia** — sendo que
reenviar depois de corrigir é exatamente o que a Fase 2 garantiu que funciona.

---

## 4. O que a Fase 3 entrega

| # | Entrega |
|---|---|
| 3.1 | `rh_solicitacao_anexos` — o documento que acompanha o pedido |
| 3.2 | Anexar ao abrir e ao reenviar, com o tipo de documento declarado |
| 3.3 | **Conferência do que falta**, pelos tipos obrigatórios do vínculo |
| 3.4 | Na aprovação da admissão, os anexos viram `rh_documentos` do colaborador criado |
| 3.5 | Permissão `rh_dp.solicitacoes.anexar` |

### 4.1 A conferência é o valor da fase

`rh_documentos_tipos` já diz o que é obrigatório por vínculo. A fase usa isso para responder, **antes
de decidir**: *"esta admissão de CLT está sem ASO e sem CTPS"*.

O DP continua podendo aprovar assim mesmo — a conferência **avisa, não trava**. Travar obrigaria a
obra a ter tudo em mãos no minuto do pedido, e o mundo real não funciona assim: o ASO costuma sair
depois. Mas quem aprovar sem ASO faz isso **sabendo**, e o histórico registra.

> É a mesma escolha que o contrato fez com o alerta de saldo (item 21): a cor avisa, o botão não
> some.

---

## 5. O que pode quebrar

| Risco | Verificação |
|---|---|
| Anexo virar caminho lateral para documento alheio | suíte tenta anexar num pedido de outra obra e exige recusa |
| Documento de CLT em não-CLT | `ensureDocumentoTipoCompativel` já existe; suíte confirma que vale aqui também |
| Transferência na aprovação duplicar documento | suíte aprova e confere que cada anexo virou **um** documento |
| Aprovação falhar no meio e deixar anexo órfão | tudo na mesma transação da Fase 2 |
| Pedido rejeitado perder os anexos | suíte rejeita, reenvia e exige que os anexos continuem lá |
| Conferência travar quando deveria avisar | suíte aprova admissão sem ASO e exige que **passe**, com o aviso no histórico |
| Arquivo grande / tipo perigoso | o projeto já tem `uploadBinaryValidationService`; a fase **usa**, não reinventa |
| Regressão nas 50 suítes | bateria completa |

---

## 6. Ordem

| Passo | Entrega |
|---|---|
| 1 | Tabela `rh_solicitacao_anexos` + model |
| 2 | Anexar e listar no pedido, com validação de tipo e de vínculo |
| 3 | Conferência do que falta, por tipo obrigatório |
| 4 | Transferência para `rh_documentos` na aprovação da admissão |
| 5 | Permissão e visibilidade |

---

## 7. Pergunta aberta

**O que acontece com os documentos de uma admissão rejeitada e nunca reenviada?** Ficam no pedido
(que fica `REJEITADA`) para sempre, ou têm prazo? São dados pessoais — RG, CPF, CTPS de alguém que
não foi contratado.

Não bloqueia a fase: por ora **ficam**, que é o comportamento conservador e reversível. Mas é
decisão sua, e apagar depois é mais fácil do que recuperar.

**Nenhuma linha foi escrita.**
