# Plano de implantação — lote de 23/08/2026

Lista enviada pelo cliente, organizada. **Nada foi implementado a partir dela**: este documento é o
que ele precisa confirmar antes de qualquer linha de código.

A numeração segue **a ordem em que ele escreveu**, para a confirmação poder ser feita por número.
Os agrupamentos vêm depois, na seção 3.

Legenda: ✅ já pronto · 🟡 parcial · ⚠️ preciso confirmar antes de codar

---

## 1. O que entendi de cada item

### Abertura do contrato (Nova Solicitação)

**1. Remover o subtipo "Abertura de contrato"** ⚠️
O subtipo sai da lista. Hoje ele (`tipo_sub_id = 25`) é **o que decide** que a solicitação abre um
contrato do fluxo novo. Removendo, preciso saber o que passa a decidir isso: o tipo "CONTRATO"
sozinho? Outro subtipo? Sem essa resposta o fluxo novo fica sem gatilho.

**2. Valor antes da apropriação**
Na Nova Solicitação, o campo **Valor** sobe para antes do bloco de apropriação/rateio. Ordem de
campos, sem mudança de regra.

**3. Favorecido com checkbox "mesmo do credor" + campo separado**
Um checkbox marcado por padrão diz que o favorecido é o próprio credor/contratado. Desmarcando,
abre o campo de favorecido próprio. Hoje favorecido e contratado são dois campos independentes, e
quem abre precisa repetir a informação.

**4. "Contratos e favorecidos": manter apenas os favorecidos e adicionar todos os adicionados** ⚠️
Não consegui identificar a que tela/bloco isto se refere, e ele parece brigar com o item 5 (que tira
o favorecido do contrato) e com o 11 (que traz o Contratado para a tela). Leitura provisória: no
bloco de contratados/favorecidos da abertura, manter só a lista de **favorecidos**, exibindo todos os
que forem adicionados. **Preciso da tela exata.**

**6. Parcelas manuais, com botão "+"**
Acaba a geração automática de N parcelas. A pessoa adiciona parcela a parcela pelo "+", e o sistema
**vai dividindo o valor** entre as que existem, respeitando as **travas** (parcela travada não é
recalculada). É a mesma lógica de divisão que o rateio de apropriação já usa: centavos inteiros com
o resto na última.

**7. Negociação detalhada abaixo de R$ 50 mil, e remover o anexo** ⚠️
Entendi: a negociação passa a ser exigida **também abaixo** do limite e volta a ser **texto**,
deixando de ser anexo. Isso **reverte a decisão de 20/08**, quando ela virou anexo `.docx`/`.pdf`
justamente porque "os detalhes virão em um arquivo docx". Confirmar que é reversão mesmo.

### Medição

**5. Tirar o favorecido do contrato e pedir na medição**
O favorecido deixa de ser definido na abertura do contrato e passa a ser informado **na hora de
gerar a medição** — faz sentido: quem recebe pode mudar de uma medição para outra.

**8. Não permitir medição em contrato não aprovado**
O contrato só deve aparecer para medir depois de `ATIVO`. Hoje o backend já recusa, mas a **tela
ainda oferece** o contrato na lista — a pessoa monta a medição e leva o erro no fim.

**9. Dados de pagamento obrigatórios na medição**
Favorecido, chave PIX, forma de pagamento e **contato do favorecido** (campo livre), mais um
**checkbox de confirmação** de que os dados de pagamento estão corretos. Sem os campos e sem o
aceite, a medição não é enviada.

**20. Verificar vínculo do arquivo no título da medição** ⚠️
Entendi como **verificação**, não mudança: conferir se o anexo enviado na medição fica ligado ao
título financeiro dela. Vou apurar e relatar o que achar — se houver defeito, ele vira item próprio.

**25. Botão no modal de medição para aprovar e enviar ao financeiro**
Dentro do modal da medição, um botão que aprova e encaminha automaticamente para o Financeiro, sem
passar por outra tela.

### Tela de detalhe da solicitação

**10. Remover o Status do card de detalhes**
O ladrilho "Status" sai do cabeçalho — o badge no topo já diz a mesma coisa.

**11. Adicionar Contratado e Nome Fantasia** 🟡
Contratado **já entrou hoje**. Falta o **Nome Fantasia**, que exige campo novo no cadastro do
parceiro (ver item 12).

**13. Número do contrato e objetivo no início do detalhe** 🟡⚠️
O Contrato já é o primeiro ladrilho desde hoje. Entendi "objetivo" como **Objeto** — confirmar. Se
for, o Objeto sobe para a primeira linha, ao lado do número.

**14. Trazer para a tela o Objeto e a justificativa** 🟡
Objeto **já entrou hoje** (oculto quando vazio). Falta a **Justificativa** — que hoje é gravada e
não aparece em lugar nenhum.

**15. Ref. do Contrato → Título** ✅ **Feito hoje.**

**16. Remover apropriações do card de detalhes, mantendo o card de baixo**
Sai o ladrilho "Apropriação" do cabeçalho. O card "Apropriações do contrato" continua onde está.

**17. Remover apropriação do card de financeiro**
Sai também o bloco de apropriações de dentro do card Financeiro, embaixo das parcelas. Hoje a mesma
informação aparece em **três** lugares.

**18. Justificativa vai para o histórico** ⚠️
A justificativa da contratação passa a ser registrada no histórico. **Além** de aparecer na tela
(item 14) ou **em vez** de?

**19. Comentário acima do histórico, com os anexos dentro dele**
O card "Novo comentário" sobe para cima do "Histórico", e os botões de anexar arquivo passam para
dentro do card de comentário — comentar e anexar viram um ato só.

### Cadastro do credor / favorecido

**12. Nome fantasia obrigatório no cadastro do credor**
Campo novo em `parceiros` (hoje não existe) e obrigatório no cadastro.

**27. Validação de PF e PJ para pedir dados adicionais**
O cadastro passa a distinguir pessoa física de jurídica (`parceiros.tipo_pessoa` já existe) e a
exigir documentos diferentes conforme o caso.

**28. Campo de representante legal**
Campo novo. Precisa definir se é texto simples (nome) ou um bloco (nome, CPF, cargo).

**29. Documentos obrigatórios acima de R$ 50 mil, um anexo para cada** ⚠️
Cartão CNPJ · Ato constitutivo · Documentos do representante legal · Qualificação do representante
legal. **Um campo de anexo por documento**, não uma pilha só.

A "qualificação" (estado civil e o que mais for necessário) ficou explicitamente para pesquisar — vou
levantar o que a praxe de contratos pede e trazer a lista para você aprovar antes de virar campo.

### Fluxo e status

**24. Depois de aprovar, voltar para a Obra (abaixo da variável)**
Contrato abaixo de R$ 50 mil: aprovado, a solicitação volta para o setor da **Obra**, em vez de ficar
na Gerência de Processos.

**26. Termo aditivo: botão de aprovar, status, fluxo e histórico**
Confirmado no código: a rota de decisão existe e **não há botão nenhum na tela**. O aditivo é pedido
e fica sem quem o aprove pela interface.

**30. Depois de rejeitar, voltar para a obra** ⚠️
Hoje a devolução manda a solicitação para o setor que **pediu** o contrato (que costuma ser a Obra,
mas nem sempre — pode ser a GEO). "Voltar para a obra" é: sempre a Obra, ou o setor de origem como
está hoje?

### Financeiro, relatórios e arquivos

**21. Alerta de cor no saldo do contrato + página de configuração**
Faixas de percentual com cores no saldo (verde/amarelo/vermelho), e uma tela para configurar os
percentuais e as cores — igual ao que já existe para cores do sistema.

**22. Relatório com os custos e o nome do arquivo** ⚠️
Qual relatório? E "nome do arquivo no sistema" é o nome do anexo, como ele foi salvo?

**23. Pasta de arquivos da Obra** ⚠️
Um repositório de arquivos por obra. Precisa de escopo: quem sobe, quem vê, que tipos de arquivo,
e se é só visualização ou também organização em subpastas.

---

## 2. O que já está pronto deste lote

| Item | Estado |
|---|---|
| 15 — Ref. do Contrato → Título | ✅ feito hoje |
| 11 — Contratado na tela | 🟡 Contratado feito; falta Nome Fantasia |
| 13 — Número do contrato no início | 🟡 feito; falta o Objeto subir |
| 14 — Objeto na tela | 🟡 feito; falta a Justificativa |

---

## 3. Ordem proposta

A ordem não é a da lista: alguns itens **dependem** de outros, e fazer fora de ordem obriga a
refazer.

### Fase 1 — Cadastro do credor (base de tudo)
**12, 27, 28, 29 (campos), 11 (nome fantasia)**

É a base porque os itens 3, 9 e 29 leem dele. Traz migration em `parceiros` (nome fantasia,
representante legal) e a tabela de documentos por tipo de pessoa.

### Fase 2 — Abertura do contrato
**1, 2, 3, 4, 6, 7, 29 (anexos na tela)**

O item 6 (parcelas manuais) é o de maior risco do lote: mexe na geração de parcelas, que é a origem
dos títulos financeiros. Vai com suíte própria e mapa de impacto antes.

### Fase 3 — Medição
**5, 8, 9, 20, 25**

Depende da fase 1 (dados do favorecido) e da 2 (o favorecido sai do contrato).

### Fase 4 — Tela de detalhe
**10, 13, 14, 16, 17, 18, 19**

Independente das outras. Pode entrar em paralelo — é a fase mais barata e a de efeito mais visível.

### Fase 5 — Fluxo e status
**24, 26, 30**

Mexe na máquina de estados. Depende de a fase 2 estar estável.

### Fase 6 — Financeiro, relatórios e arquivos
**21, 22, 23**

As três são funcionalidades novas e independentes; ficam por último por não bloquearem nada.

---

## 4. O que preciso que você confirme antes de começar

| # | Pergunta |
|---|---|
| 1 | Removendo o subtipo "Abertura de contrato", **o que passa a disparar o fluxo novo de contrato?** |
| 4 | **Qual tela** é "Contratos e favorecidos"? O item parece brigar com o 5 e o 11. |
| 7 | A negociação detalhada **volta a ser texto** (revertendo o anexo de 20/08) e passa a valer abaixo de 50 mil? |
| 13 | "Objetivo" é o **Objeto** do contrato? |
| 18 | A justificativa vai para o histórico **além** de aparecer na tela, ou **em vez** de? |
| 22 | **Qual relatório**, e "nome do arquivo" é o nome do anexo? |
| 23 | Pasta de arquivos da obra: **quem sobe, quem vê**, e serve para quais arquivos? |
| 30 | Rejeitado volta **sempre para a Obra**, ou para o setor de origem (como está hoje)? |

## 5. Duas observações que valem antes de aprovar

**O item 7 desfaz trabalho de 20/08.** A negociação detalhada virou anexo com validação de arquivo
malicioso (macro, objeto embutido, extensão), a pedido seu naquele dia. Voltar para texto joga fora
essa proteção — o que é legítimo se a decisão mudou, mas quero que seja uma decisão, e não um efeito
colateral.

**Os itens 16, 17 e 14 se cruzam.** Hoje a apropriação aparece em três lugares (cabeçalho, card
próprio, card do Financeiro) e a ideia é deixar **um**. Vou tratar os três como um item só, para não
tirar de um lugar e esquecer no outro.

---

# 6. Respostas do cliente — rodada 2

As oito perguntas foram respondidas e três itens mudaram de forma. **Esta seção manda** onde
divergir do que está acima.

## 6.1 Respostas

**1 — o gatilho passa a ser o TIPO.** Removido o subtipo, é o próprio tipo **CONTRATO** que dispara,
"porque através desse tipo só terá a abertura mesmo".

> Bom: o gatilho **já é do tipo**, não do subtipo — `comportamentoTipo.usa_fluxo_contrato_novo`. O
> trabalho é menor do que eu supus: parar de exigir e de enviar o subtipo para o tipo CONTRATO.
>
> **Consequência a registrar:** a configuração de "campos por subtipo" (PI-13, suítes 11 e 12) deixa
> de valer para CONTRATO — passa a valer a do **tipo**. Quem configurar campos daqui em diante mexe
> no tipo, não no subtipo. As solicitações antigas com o subtipo gravado continuam legíveis.

**3 e 4 — o pedido mudou.** Não é checkbox na abertura. É **remover a tabela "Contratados e
favorecido"** que hoje vive dentro do card *Contrato — parcelas de previsão*
(`BlocoContratoFluxoNovo.jsx`, linha 274), porque:

- o **contratado já vem pelo campo Credor**;
- o **favorecido passa a ser informado na medição**, junto da chave PIX, com **checkbox para usar o
  credor como favorecido** e **checkbox de confirmação de que a chave PIX está correta**.

Isso funde os itens 3, 4, 5 e parte do 9 num só. Some um bloco inteiro da tela de abertura.

**7 — sem reversão.** A negociação detalhada **continua sendo anexo** e passa a valer para **todas**
as solicitações de CONTRATO, não só acima de R$ 50 mil. A validação contra arquivo malicioso fica de
pé; muda só o alcance da exigência. A ressalva que eu tinha levantado não se aplica.

**8 — o contrato não aprovado nem é listado** no campo de contratos da medição. Não basta recusar no
envio: ele não aparece.

**9 — as formas de pagamento da medição são curadas.** Das formas cadastradas, o cliente escolhe
**quais aparecem** naquela tela. É o mesmo padrão da lista curada que já existe em
`configuracoes_sistema` — a configuração diz *quais* itens do cadastro valem, e nunca substitui o
cadastro (ver `MAPA-BANCO-E-INTEGRACOES.md` §4).

**13 — sim**, "objetivo" é o **Objeto**.

**18 — em vez de.** A justificativa vai **só para o histórico**; não aparece como campo na tela. Isso
**corrige o item 14**: dele sobra apenas o Objeto, que já está pronto.

**21 — o alerta é só a cor do texto do saldo do contrato.** Não é tela nova para exibir alerta. A
página de configuração de percentuais e cores continua fazendo parte do pedido original.

**22 — é o relatório Financeiro de Obras.** Cada linha é um pagamento; clicando na linha, dá para
ver os **arquivos vinculados àquele título** e/ou à **solicitação vinculada** a ele.

**23 — já existe**, dentro de *Gerência Obra → aba Arquivos*. Sai da lista de construção.

**24 — voltar para a Obra respeitando as regras de visibilidade**, para não haver vazamento.

**25 — com status LIBERADO.**

**26 — o aditivo ganha os mesmos três botões do contrato**: Aprovar, Rejeitar e Cancelar, seguindo o
fluxo já programado.

**30 — volta para o setor de origem, e o setor de origem tem de ser o setor de QUEM CRIOU** — "ao ser
rejeitado precisa ser resolvida, e quem vai resolver é quem criou".

> Isto é mudança de comportamento, não confirmação do atual. Hoje a devolução usa
> `setor_destino_pos_aprovacao`, que guarda a **área responsável** de quando a solicitação foi ao
> Jurídico — e nem sempre é o setor do criador. Passa a ser o setor do criador.

## 6.2 O que mudou de tamanho

| Item | Antes | Agora |
|---|---|---|
| 1 | achava que precisava de gatilho novo | só parar de exigir o subtipo — o gatilho já é do tipo |
| 3 + 4 | checkbox na abertura + tela não identificada | **remover** a tabela de contratados/favorecido do card de previsão |
| 7 | possível reversão do anexo | anexo mantido, exigência estendida a todo contrato |
| 14 | Objeto + Justificativa na tela | só Objeto — **já pronto** |
| 23 | funcionalidade nova | já existe: **sai do plano** |

## 6.3 Ainda preciso de você

| # | Pergunta |
|---|---|
| 25 | Aprovando a medição, o status vai para **LIBERADO** — e a regra automática de 21/08 (`NEC. DE MEDIÇÃO` → `APROVADA` na baixa → `PAGA` no fim) continua valendo depois disso? Hoje ela nunca produz `LIBERADO`, e as duas regras vão disputar o mesmo campo. |
| 9 | Onde fica a configuração das formas de pagamento visíveis: numa tela de configuração existente, ou numa nova? |
| 21 | A página de configuração de percentuais e cores continua no escopo, certo? Só o *alerta* é que não é tela. |
| 23 | Confirma que não há nada a fazer — ou o pedido era **ligar** os anexos das solicitações àquela aba? |

---

# 7. Rodada 3 — as últimas respostas, o item novo e duas verificações já feitas

## 7.1 Respostas

**25 — `LIBERADO` SUBSTITUI `APROVADA`.** O caminho é: a Obra solicita a medição → a Gerência de
Processos aprova **no botão** → a solicitação vai para **`LIBERADO`** → pago o título, a baixa o
deixa **`QUITADO`**, o que já acontece sozinho na tela de baixa.

> Isto **corrige a regra que fechei em 21/08**. Ela dizia `NEC. DE MEDIÇÃO` → `APROVADA` (na baixa) →
> `PAGA`. Passa a ser:
>
> | Momento | Status da solicitação |
> |---|---|
> | Medição pedida, esperando a Gerência | `NEC. DE MEDIÇÃO` |
> | Medição aprovada, título em aberto | **`LIBERADO`** |
> | Tudo quitado e nada por medir | `PAGA` |
>
> `APROVADA` **sai** do fluxo de contrato. E `LIBERADO` passa a nascer de uma **aprovação**, não da
> baixa — hoje ele é posto à mão (o histórico da SOL-5116 mostra Breno fazendo isso).

**9 — a tela de configuração não existe e vai ser criada**, dentro das configurações do
**superadmin**. As formas de pagamento continuam vindo do cadastro financeiro; a configuração só
escolhe **quais aparecem** na medição.

**21 — a página de configuração faz parte do escopo.** Os percentuais mudam com o tempo. O texto do
saldo do contrato troca de cor em **três níveis**: **Saudável · Normal · Crítico**.

**23 — virou verificação:** confirmar que os anexos das solicitações estão ligados à aba Arquivos da
obra. **Feito — resultado em 7.3.**

## 7.2 Item novo — 31. Permissão nos botões do fluxo de contrato

> "Hoje quando um contrato é rejeitado o botão de solicitar revisão aparece para mais de um usuário,
> e o mesmo acontece com outros botões. Isso pode gerar confusão quando um setor precisa tratar e
> outro usuário, de outro setor, tem essa permissão e executa sem querer."

Revisão do fluxo inteiro, botão a botão. Já sei onde olhar primeiro — os três pontos que abrem a
porta hoje:

1. **`userHasAreaPermission` trata "nenhuma permissão configurada" como LIBERADO.** Usuário fora da
   configuração passa em tudo que usa essa função.
2. **`SUPERADMIN` tem passe livre** nela (`isBusinessAdmin`), diferente da versão estrita.
3. **A cláusula "ou quem gerencia contratos"** que eu mesmo escrevi em `reenviar` e
   `confirmar_assinatura` é larga de propósito — e é exatamente ela que faz o botão aparecer para
   mais de uma pessoa.

Não é o mesmo trabalho de 20/08: lá a tela passou a **respeitar** a permissão; aqui a questão é se a
permissão está **larga demais**. Vou revisar e trazer a lista de quem vê cada botão hoje, com
proposta, antes de mudar.

## 7.3 Verificações já feitas

### 23 — os anexos das solicitações **estão** na aba Arquivos da obra ✅ (com uma ressalva)

`obraGestaoService` monta a aba de três fontes: `anexos` das solicitações da obra, `comprovantes` e
`contrato_anexos`. Na obra 23: **30 anexos de solicitação** e **6 de contrato**.

**Ressalva:** a consulta dos anexos tem `limit: 50`. Uma obra com mais de 50 anexos mostra só os 50
mais recentes, **sem dizer que há mais**. Não foi o que você perguntou, mas é o tipo de corte
silencioso que vira "sumiu meu arquivo". Anoto como item 32, se você quiser tratar.

### 20 — o arquivo da medição **não** está vinculado ❌

`anexos.medicao_id` existe na tabela e no model, e **nada o preenche**: `AnexoController.create`
grava `solicitacao_id`, `tipo`, `nome`, `caminho` e `uploaded_by` — nunca `medicao_id`. Confirmado no
dado: dos 30 anexos da obra 23, **zero** têm medição.

Quem recebe `medicao_id` hoje é só o **histórico**, na criação da medição.

**Consequência prática:** o modal "Medicao N" filtra anexos e comentários por `medicao_id` — então
ele **nunca vai mostrar anexo nenhum**, por construção. O card foi feito para separar os documentos
de cada medição num contrato com muitas, e essa separação não está acontecendo.

É defeito, não dúvida. Vira item de trabalho: o upload feito no contexto de uma medição precisa
gravar `medicao_id`.

## 7.4 Plano fechado — 32 itens

| Fase | Itens | Estado |
|---|---|---|
| 1 — Cadastro do credor | 12, 27, 28, 29, 11 (nome fantasia) | ✅ **entregue** — suíte 40 |
| 2 — Abertura do contrato | 1, 2, 3+4 (remover a tabela), 6, 7 | ✅ **entregue** — suíte 41 |
| 3 — Medição | 5, 8, 9 (+ tela de configuração), 20 (corrigir o vínculo), 25 | ✅ **entregue** — suíte 42 |
| 4 — Tela de detalhe | 10, 13, 14, 16, 17, 18, 19 | ✅ **entregue** — suítes 39 e 44 |
| 5 — Fluxo e status | 24, 26, 30, **31** | ✅ **entregue** — suítes 45, 46, e 31/32 para o item 31 |
| 6 — Financeiro e relatórios | 21 (+ tela de configuração), 22 | ✅ **entregue** — suítes 47 e 48 |
| Fora do plano | 15 ✅ · 23 ✅ verificado · 32 (limite de 50 anexos, se você quiser) | — |
| **33 — o valor pago volta para a parcela** (pedido em 23/08, depois do plano) | a baixa do Financeiro dá a palavra final sobre quanto a parcela valeu | ✅ **entregue** — suíte 43 |

Regressão das três primeiras fases: **bateria 03 a 42 rodada inteira em 23/08, todas passando.**
O que cada fase custou nas suítes está no rodapé do mapa de impacto dela.
