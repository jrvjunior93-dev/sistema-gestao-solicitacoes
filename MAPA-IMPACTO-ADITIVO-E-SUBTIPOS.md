# Mapa de impacto — subtipo único de abertura e termo aditivo pelo botão da medição

Escrito **antes** de codar, como manda a regra 1 do projeto.
Pedido do cliente: 19/08/2026.

---

## 1. O que o cliente pediu

1. **Subtipos do CONTRATO**: hoje são três — `ABERTURA DE CONTRATO` (25), `SOLICITACAO DE
   CONTRATO` (26) e `ADITIVO DE CONTRATO` (27). A **abertura passa a fazer o papel da
   solicitação** também, e o subtipo 26 deixa de existir.
2. **Motivo**: `ABERTURA DE CONTRATO` só existia para separar o fluxo antigo do novo. Na
   migração para a `main`, o **tipo de solicitação** `ABERTURA DE CONTRATO` (id 2, o do fluxo
   antigo) será **desativado**. A abertura passa a existir apenas no fluxo novo, representada
   pelo **subtipo** `ABERTURA DE CONTRATO`.
3. **O subtipo de abertura decide o fluxo pelo valor**: acima ou abaixo da variável de volume
   (hoje R$ 50.000), como já foi planejado e executado.
4. **Termo aditivo vira um botão na tela de medição**, valendo para contratos do fluxo **antigo
   e novo**. O botão abre um **modal** com os campos obrigatórios; a partir da solicitação segue
   o fluxo já definido para o aditivo, seja o contrato novo ou legado.
5. O teto de **25% do valor original** vale também para o contrato legado.

### Decisões confirmadas com o cliente (19/08)

| Pergunta | Resposta |
|---|---|
| Onde fica o botão (não existe página dedicada de medição) | **Na Nova Solicitação com tipo MEDIÇÃO**, depois de escolher o contrato |
| O subtipo `ADITIVO DE CONTRATO` (27) continua? | **Não** — desativado junto com o 26 |
| Aditivo aprovado entra no saldo do contrato legado? | **Sim**, somando `valor_aditivos` ao saldo legado |
| Teto de 25% no legado | **Sim**, sobre o valor original do contrato |

---

## 2. As regras novas do cliente (vão para `POLITICA-INTERNA-CSC.md` antes do código)

- **PI-14 — Abertura única.** Só existe um subtipo de criação de contrato: `ABERTURA DE
  CONTRATO`. Ele cobre o que antes se dividia entre abertura e solicitação. O tipo de
  solicitação `ABERTURA DE CONTRATO` (id 2), que representa o fluxo antigo, será desativado na
  migração — a partir daí abertura é sempre fluxo novo.
- **PI-15 — Aditivo é ação sobre o contrato, não tipo de solicitação.** O termo aditivo é pedido
  por um botão na tela de medição, que abre um modal, e vale para contrato do fluxo antigo e do
  novo. Não existe mais subtipo de aditivo. O teto de 25% sobre o valor original e a aprovação
  continuam valendo igual nos dois fluxos.

---

## 3. O que verifiquei no código e no banco

| Verificação | Resultado |
|---|---|
| Subtipos do tipo 33 | 25 `ABERTURA DE CONTRATO`, 26 `SOLICITACAO DE CONTRATO`, 27 `ADITIVO DE CONTRATO`, todos ativos |
| Uso histórico dos subtipos 25/26/27 | **zero** em `contratos` e **zero** em `solicitacoes` — desativar não perde histórico |
| Tipo 2 `ABERTURA DE CONTRATO` (legado) | ativo, **172 solicitações** — é o que será desativado na migração |
| Tipo 4 `MEDIÇÃO` | ativo, **665 solicitações**, `mostrar_contrato` e `exige_periodo_medicao` |
| Tipo 33 `CONTRATO` | `usa_fluxo_contrato_novo: true`, `exige_subtipo: true` |
| Contratos | 335 legados (`fluxo_novo=0`), todos com `valor_total`, **nenhum** com parcelas na tabela nova |
| `status_contrato` nos legados | **NULL** em todos os 335 — a máquina de estados é só do fluxo novo |
| `valor_aditivos` nos legados | **0** em todos os 335 |
| Roteamento ao Jurídico | `contratoFluxoNovoService.js:476` — por `valor_total >= limite`, na **aprovação**, **independente de subtipo** |
| `contratoAditivoService.js` | **não tem nenhuma guarda de `fluxo_novo`** — lê `valor_total`, soma aprovados, grava `valor_aditivos` |
| Rotas do aditivo | `routes.js:2089-2091`, sob o prefixo `/contratos/fluxo-novo/...`, **sem guarda de fluxo** |
| Quem lê `valor_aditivos` | só `contratoFluxoNovoService:778` e `medicaoContratoService:148` — **ambos do fluxo novo** |
| Saldo do contrato legado | `ContratoController.js:600` — `total_solicitado = valor_total + ajuste_solicitado`; **não lê `valor_aditivos`** |
| `ajuste_solicitado` no legado | mecanismo próprio, editado à mão, usado em **10 dos 335** |
| Guarda de contrato encerrado no aditivo | **não existe** — hoje dá para pedir aditivo de contrato encerrado |

### O que já está pronto e não precisa de código

O item 3 do pedido (**o subtipo de abertura decide o fluxo pelo valor**) **já funciona**. O
roteamento ao Jurídico é decidido na aprovação por `valor_total >= CONTRATO_LIMITE_JURIDICO`,
sem olhar subtipo. Como depois desta mudança `ABERTURA DE CONTRATO` passa a ser o **único**
subtipo de criação, todo contrato do fluxo novo já cai nesse roteamento automaticamente.
Não há nada a construir aqui — só a provar.

O teto de 25% no legado também já funciona: `calcularTetoAditivo` lê `contrato.valor_total`,
que é o valor **original**, e desconta os aditivos já aprovados. Nada de `fluxo_novo` no caminho.

---

## 4. As mudanças, por camada

### 4.1 Cadastro (dados, não código)

Desativar os subtipos **26** e **27** (`ativo = 0`). Sobra o **25**, `ABERTURA DE CONTRATO`.
Desativar e não excluir: é reversível, preserva o registro e é o padrão já usado na tabela
(o subtipo 22 está inativo). Vai para `MIGRACAO-PARA-PRODUCAO.md` como passo de migração.

### 4.2 Backend

| # | Mudança | Onde | Por quê |
|---|---|---|---|
| B1 | Rotas do aditivo neutras de fluxo: `/contratos/:id/aditivos` e `/contratos/:id/aditivos/teto` | `routes.js` | O prefixo `fluxo-novo` passa a ser mentira: o aditivo vale para os dois fluxos. As rotas antigas permanecem, para não quebrar nada em voo |
| B2 | Guarda: aditivo recusado em contrato **encerrado ou inativo** | `contratoAditivoService.js` | Hoje não existe. Vale para os dois fluxos: `status_contrato = ENCERRADO` (novo) ou `ativo = false` (ambos) |
| B3 | Saldo legado passa a somar `valor_aditivos` | `ContratoController.js` — `getContratoMetrics` **e** a listagem (ver A3) | Sem isto o aditivo aprovado no legado é um número que ninguém lê. **Nenhum contrato existente muda de valor: os 335 têm `valor_aditivos = 0`** |

**B3 é a única mudança que toca a trilha legada em produção.** Ela é aditiva e neutra hoje —
`+ 0` para todos os 335 contratos. Cada mecanismo fica no seu campo: `ajuste_solicitado` segue
sendo o ajuste manual, `valor_aditivos` passa a ser o aditivo aprovado. Sem duplo cômputo e sem
escrever num campo que uma pessoa também edita à mão.

### 4.3 Frontend

| # | Mudança | Onde |
|---|---|---|
| F1 | Novo `ModalAditivoContrato.jsx` — teto exibido, valor, nova vigência, justificativa, responsável, envio próprio | `components/contratos/` |
| F2 | Botão **"Solicitar termo aditivo"** na Nova Solicitação quando o tipo é de **medição** e há contrato escolhido — legado ou do fluxo novo | `NovaSolicitacao.jsx` |
| F3 | Remover o caminho do aditivo de dentro do formulário (`usaAditivoContrato`, `BlocoAditivoContrato`, o ramo do submit) | `NovaSolicitacao.jsx` |
| F4 | Serviço aponta para as rotas neutras | `services/contratos.js` |
| F5 | Tela de configuração de campos passa a filtrar subtipo inativo (ver A2) | `NovaSolicitacaoCamposConfig.jsx` |

**Sobre F3:** com o subtipo 27 desativado, o caminho antigo fica inalcançável pelo uso normal.
Mantê-lo seria deixar duas portas para a mesma regra — exatamente o que o cliente decidiu não
querer. O bloco sai junto com o subtipo.

**Como o botão sabe que está na medição:** pelo comportamento do tipo
(`mostrar_periodo_medicao` / `exige_periodo_medicao`) mais um contrato escolhido. **Não** pelo
nome do tipo, e **não** por `fluxo_novo` — o botão precisa aparecer para o contrato legado.

**O modal é independente da solicitação em curso.** Pedir o aditivo não envia nem valida a
medição que está sendo preenchida: são dois atos separados, e misturá-los faria o usuário perder
o formulário. O modal fecha e o formulário da medição continua como estava.

### 4.4 QA

| # | Suíte | O que prova |
|---|---|---|
| Q1 | `15-tela-aditivo.js` **reescrita** | o botão e o modal na medição, num contrato do **fluxo novo** |
| Q2 | `16-aditivo-contrato-legado.js` **nova** | o mesmo caminho num contrato **legado**: teto de 25% sobre o original, gravação, aprovação e o saldo legado refletindo |
| Q3 | `17-abertura-unica.js` **nova** | só existe o subtipo de abertura; contrato abaixo do limite vai a ATIVO e acima vai ao Jurídico, pelo subtipo único |
| Q4 | regressões | 09 (medição), 11, 12, 14, `integracao-d38/01` e `03` |

---

## 5. Riscos e o que pode quebrar

| Risco | Alcance | Mitigação |
|---|---|---|
| **B3 muda o saldo de contratos legados** | 335 contratos em produção | É `+ valor_aditivos`, hoje `0` em todos. Suíte confere o saldo antes e depois |
| Desativar subtipo 26/27 quebrar histórico | nenhum | Zero uso em `contratos` e `solicitacoes` |
| Remover o bloco de aditivo do formulário (F3) | nenhum uso real | Zero solicitações com subtipo 27; o caminho nasceu nesta fase e nunca chegou a produção |
| Tipo 33 exige subtipo com uma opção só | atrito de tela | Fica registrado como ajuste de layout; não muda regra |
| Botão aparecer em tipo que não é medição | tela | Gate por comportamento do tipo + contrato escolhido, provado por suíte |
| Aditivo em contrato encerrado | hoje **é possível** | B2 fecha, nos dois fluxos |
| Rotas duplicadas (B1) | superfície | As antigas ficam como compatibilidade e são apontadas no mapa; o frontend usa só as novas |

### O que **não** muda

- A trilha de medição legada (665 solicitações) — nenhum cálculo dela é tocado
- O tipo 2 `ABERTURA DE CONTRATO` continua ativo **aqui**; desativá-lo é passo da migração
- A máquina de estados do Jurídico, o encerramento e as parcelas
- O teto de 25%, a acumulação e a devolução na rejeição — já provados na suíte 14

---

## 7. O que apareceu durante a execução (não estava no plano)

### A1 — Colisão de nome entre o subtipo e o tipo legado

O subtipo **`ABERTURA DE CONTRATO`** (25) tem **exatamente o mesmo nome** do **tipo de
solicitação 2**, o do fluxo antigo. Enquanto o subtipo de criação se chamava `SOLICITACAO DE
CONTRATO` o nome era único, e os testes selecionavam o subtipo varrendo todos os `<select>` da
página até achar a opção. Depois da PI-14 essa varredura passou a acertar o **seletor de TIPO**,
trocando o tipo de CONTRATO (33) para ABERTURA DE CONTRATO (2) — e o formulário inteiro mudava,
sem erro nenhum.

Corrigido nas suítes mirando `select[name="tipo_sub_id"]` diretamente. Fica registrado como
armadilha do ambiente: **seletor por varredura de opção não serve quando dois cadastros
diferentes compartilham o nome.**

Some sozinho quando o tipo 2 for desativado na migração, mas o teste não pode depender disso.

### A2 — A tela de configuração de campos não filtrava subtipo inativo

`GET /tipos-sub-contrato` devolve **todos** os subtipos, ativos e inativos. A Nova Solicitação
filtra (`ativo !== false`); a **tela de configuração de campos não filtrava**. Sem isso daria
para configurar campos de um subtipo que ninguém consegue escolher — configuração que nunca teria
efeito, e que o próximo leitor acharia que tem.

Corrigido em `NovaSolicitacaoCamposConfig.jsx`, com guarda na suíte 12.

### A3 — O saldo do contrato era calculado em DOIS lugares

O plano apontava só `getContratoMetrics` (`ContratoController.js:600`, do relatório operacional).
Na execução apareceu um **segundo** cálculo, na **listagem** (`:1577-1582`) — que é o saldo que a
Gestão de Contratos mostra. Os dois foram corrigidos: se só um tivesse sido, a listagem e o
relatório mostrariam saldos diferentes para o mesmo contrato.

### A4 — `qa/integracao-d38/02-correcoes-auditoria.js` já falhava antes

Ao migrar as suítes a 02 falhou com `Cannot read properties of null (reading 'focus')`.
Verificado por **experimento controlado** — `git stash` de todas as mudanças, subtipos 26/27
reativados no banco, backend reiniciado com o código original: **falha idêntica**. É defeito
anterior a este trabalho e não entra aqui; registrado como pendência herdada.

---

## 8. Como se provou — executado em 19/08/2026

| Suíte | Prova | Resultado |
|---|---|---|
| `medicao/15-tela-aditivo.js` **reescrita** | botão + modal na medição, contrato do fluxo novo | ✅ **PASSOU** — 14 provas |
| `medicao/16-aditivo-contrato-legado.js` **nova** | aditivo em contrato LEGADO, teto e saldo | ✅ **PASSOU** — 15 provas |
| `medicao/17-abertura-unica.js` **nova** | abertura única e o valor decidindo o fluxo | ✅ **PASSOU** — 12 provas |
| `medicao/03` a `medicao/14` | toda a fase de medição, contratos e jurídico | ✅ PASSOU |
| `integracao-d38/01` e `03` | criação pela tela e fluxo padrão intacto | ✅ PASSOU |

### As provas que interessam

**Contrato legado** (`CT/SE002-33`, escolhido por consulta justamente por ter ajuste manual):

```
+ saldo legado de partida = valor_total + ajuste manual — api=15000 esperado=15000
+ botao de aditivo APARECE tambem no contrato legado
+ MD-5: contrato legado segue SEM o bloco de medicao do fluxo novo
+ teto de 25% sobre o valor ORIGINAL — original=7000 teto=1750 disponivel=1750
+ acima do teto no legado: avisa e bloqueia
+ aditivo PENDENTE nao altera o saldo do contrato legado — api=15000
+ aprovar soma o aditivo em valor_aditivos — 700.00
+ a aprovacao NAO mexe no ajuste manual do legado — 8000.00 (antes 8000.00)
+ o saldo do contrato LEGADO reflete o aditivo aprovado — api=15700 (7000 + 8000 + 700)
limpeza: contrato CT/SE002-33 = 0.00|8000.00 (identico ao original)
```

O ajuste manual intacto em 8.000 é a prova de que **não há duplo cômputo**.

**Fronteira do limite** — provada no centavo, e com o limite **lido da configuração**, não cravado:

```
+ abaixo de R$ 50000.00 a aprovacao leva direto a ATIVO — 49999.99 -> ATIVO
+ e os titulos nascem na aprovacao — 2
+ no valor exato de R$ 50000.00 vai ao JURIDICO (fronteira e >=) — 50000.00 -> EM_ANALISE_JURIDICA
+ e NENHUM titulo nasce antes da assinatura — 0
```

**Separação dos dois atos** (PI-15):

```
+ pedir o aditivo NAO envia a medicao em curso — antes=0 depois=0
+ formulario da medicao continua preenchido depois do modal
+ bloco de medicao e bloco de aditivo nao se atrapalham
```

Nenhuma migration. Nenhuma variável de ambiente nova. Nenhuma permissão nova.

---

## 9. Migração para produção

| Passo | O quê |
|---|---|
| 1 | `UPDATE tipos_sub_contrato SET ativo=0 WHERE id IN (26,27);` — desativa SOLICITACAO e ADITIVO |
| 2 | Desativar o **tipo de solicitação 2** (`ABERTURA DE CONTRATO`, o do fluxo antigo) — **decisão do cliente, no corte** |
| 3 | Conferir que nenhuma regra `tipo:subtipo` de 26/27 ficou em `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` |

Sem migration de schema. Registrado em `MIGRACAO-PARA-PRODUCAO.md`.

---

## 10. Correção do modal — centralização e sobreposição do menu (19/08)

Reportado pelo cliente com print: o modal do aditivo aparece **descentralizado**, passando por baixo
do menu, e o **menu fica por cima dele**. Medido na tela antes de mexer, com probe de estilos
computados — não deduzido do CSS.

### O laudo

| Medida | Valor encontrado |
|---|---|
| `max-width` computado do painel | **`100%`** — e não os 42rem de `max-w-2xl` |
| Largura real do painel | **1408px** numa viewport de 1440 |
| Overlay | `fixed`, `z-index: 50`, cobrindo `0,0,1440,900` (correto) |
| `main.layout-main` | `position: relative; z-index: 1` |
| `.sidebar` | `z-index: 40`, `position: sticky` |
| `.layout-shell` | `isolation: isolate` |

### As causas

**C1 — o `z-50` do modal estava preso.** `main.layout-main` tem `position: relative` com
`z-index: 1`, o que **cria um contexto de empilhamento**. O modal vive dentro do `main`, então o
seu `z-index: 50` só disputa *dentro* do main — e o main inteiro vale **1** perante a sidebar, que
vale **40**. Não existe valor de `z-index` no modal que resolva isso: subir para 999 não muda nada,
porque o teto é o do ancestral. É o erro clássico de achar que `z-index` é global.

**C2 — o `max-w-2xl` estava sendo anulado.** `frontend/src/styles/responsive-system.css` tem

```css
.layout-main :where(main, form, section, .card, ...) { min-width: 0; max-width: 100%; }
```

`:where()` tem especificidade zero, mas o `.layout-main` que o antecede não: a regra empata em
especificidade com o utilitário `.max-w-2xl` do Tailwind e **vence pela ordem de importação**.
Como o painel usa a classe `.card`, ele era esticado para 100% da viewport. Centralizado, sim —
mas com 1408px de largura, sobrando por baixo da sidebar dos dois lados.

### A correção — o portal resolve as duas primeiras

**Renderizar o modal em portal para o `document.body`** (`createPortal`), como o projeto já faz em
`Solicitacoes/index.jsx`, `Solicitacoes/Filtros.jsx` e `FinanceiroTitulos.jsx`.

Fora do `main`, o modal:

- deixa de estar dentro do contexto de empilhamento do `main` e passa a disputar no nível do
  `body`, onde o `z-index: 50` fica acima do `.layout-shell` — **resolve C1**;
- deixa de casar com `.layout-main :where(.card)`, então a largura volta a ser a do componente —
  **resolve C2**.

Preferido a remendo (subir `z-index`, `!important` na largura, ou tirar a classe `.card`) porque
elimina a **classe** do problema: qualquer modal desta página herda o mesmo teto de empilhamento e
o mesmo esticão de largura.

Junto disso, a largura passa a sair dos **tokens de modal do próprio projeto**
(`--modal-max-w-lg`, 860px) em vez de utilitário do Tailwind, e o `z-index` do token `--z-modal`.
Assim a medida não depende mais de quem é importado por último. E o painel ganha
`max-height` com rolagem interna no corpo, para não estourar em tela baixa.

### C3 — centralizado na viewport ainda lê como “à esquerda”

Depois do portal o painel ficou com 860px em `left: 290` numa viewport de 1440 — **centrado na
viewport ao centavo**: `(1440 − 860) / 2 = 290`. O cliente apontou que **ainda parecia deslocado**,
e está certo: o menu ocupa os primeiros **286px**, que não são área útil. Centrar sobre a viewport
inteira joga o painel para a metade esquerda do que a pessoa enxerga como a tela.

Passou a centralizar sobre a **área de conteúdo**, sem abrir mão do overlay cobrindo tudo (o menu
continua escurecido e sem clique). O recuo entra como `padding-left` no overlay, e o `flex` faz a
centralização dentro do que sobra.

O recuo é **medido**, não fixado: lê `.layout-main` na abertura e no `resize`. O menu recolhe, e no
celular vira gaveta começando em zero — medida fixa acertaria um estado e erraria os outros. Com
recuo zero o modal volta a centralizar na viewport inteira, sozinho.

Conferido na tela depois da mudança:

```
viewport 1440 | conteudo [286, 1440] | painel [433, 1293] largura 860
centro do painel 863 · centro do conteudo 863 · desvio 0
```

### Achado adjacente, NÃO corrigido

O **modal de cadastro de credor**, na mesma página (`NovaSolicitacao.jsx`), usa exatamente o mesmo
padrão (`card ... max-w-2xl` dentro do `main`) e portanto tem **os dois mesmos defeitos**. É
anterior a este trabalho. Não foi tocado por estar fora do que o cliente pediu — registrado como
pendência para decisão.

---

## 11. Campo "Responsável" do aditivo — decisão adiada (19/08)

O cliente perguntou para que serve o campo **Responsável** no modal do aditivo e propôs remover.
Rastreado de ponta a ponta antes de responder.

**De onde veio:** do escopo do próprio cliente. `MAPA-CAMPOS-CONTRATOS.md` registra
*"Aditivo: valor, prazo, justificativa, responsável"* como **novos**, extraído dos `.docx`. São os
mesmos quatro campos que o contrato ganhou; a intenção era registrar **quem responde pelo
acréscimo**, que pode não ser quem abriu o contrato.

**O que ele faz hoje:** nada. É campo **só de escrita** — gravado em
`contrato_aditivos.responsavel_id` e **lido em lugar nenhum**: sem associação com `Usuario`, sem
`include`, nenhuma consulta o seleciona, nenhuma tela ou relatório o exibe, e `decidirAditivo` não
o usa. Dos quatro campos do grupo é o único sem efeito — valor alimenta o teto, prazo vira
`vigencia_fim` na aprovação, justificativa é obrigatória e é o rastro de auditoria.

**A ressalva que mudou a conversa:** **não existe nenhuma tela de aditivo.** A rota de decisão
(`/contratos/aditivos/:id/decisao`) não tem interface — hoje a aprovação só roda por serviço.
Status, motivo da rejeição e justificativa também não são visíveis em lugar nenhum. O responsável
parece órfão em parte porque a tela que o mostraria ainda não foi feita. O `responsavel_id` do
próprio contrato está na mesma situação.

**Decisão do cliente (19/08): manter como está, por ora.** Reavaliar quando a tela de
aprovação/listagem do aditivo existir — aí dá para decidir com o quadro completo, em vez de
remover um campo do escopo por causa de uma tela que falta.

Nenhuma linha de código foi alterada por conta desta pergunta.
