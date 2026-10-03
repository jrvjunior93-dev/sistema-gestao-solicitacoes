# Mapa de impacto — regra de subtipo não chega à Nova Solicitação

Escrito **antes** de codar, como manda a regra 1 do projeto.
Origem: a pendência 2 do `LEIA-PRIMEIRO.md` — `qa/medicao/15-tela-aditivo.js` não passa.

Data: 18/08/2026

---

## 1. O que se investigou

A suíte 15 falha porque o bloco do termo aditivo não aparece na tela — e, depois que passa a
aparecer, porque o envio nunca chega ao ramo do aditivo. A hipótese registrada no
cabeçalho da própria suíte era a **chave da área**, por causa do setor com espaço no fim do nome
(`GERENCIA DE PROCESSOS `). **Essa hipótese está errada** — e no caminho apareceu um defeito de
produto que ela escondia.

### Como o bloco do aditivo é derivado

`NovaSolicitacao.jsx:1139`

```
usaAditivoContrato = usaFluxoContratoNovo && exibirCamposContrato && Boolean(form.contrato_id)
```

e `NovaSolicitacao.jsx:454`

```
exibirCamposContrato = obraSelecionadaEhObra && campoVisivel('contrato')
```

`campoVisivel` lê `camposNovaSolicitacao`, que sai do `useMemo` de `NovaSolicitacao.jsx:421-433`.
Ou seja: **o bloco do aditivo depende inteiramente da cascata de campos por subtipo**.

---

## 2. As causas

### Causa A — defeito de produto: o `useMemo` não recalcula quando o subtipo muda

`frontend/src/pages/NovaSolicitacao.jsx:433`

```js
const camposNovaSolicitacao = useMemo(() => (
  resolverCamposNovaSolicitacaoFrontend(comportamentoTipo, camposNovaSolicitacaoConfig,
    form.tipo_solicitacao_id, { ..., areaResponsavel: form.area_responsavel,
                                tipoSubId: form.tipo_sub_id })
), [comportamentoTipo, camposNovaSolicitacaoConfig, form.tipo_solicitacao_id,
    form.area_responsavel, moduloApropriacoesHabilitado]);
//  ^ falta form.tipo_sub_id
```

`form.tipo_sub_id` **é lido dentro do memo e não está na lista de dependências**. Nenhuma outra
dependência muda quando só o subtipo é trocado:

- `comportamentoTipo` depende de `tipoSelecionado` e dos módulos — não do subtipo
- `camposNovaSolicitacaoConfig` é carregado uma vez no estado (`:131`), sem refetch por subtipo
- `form.tipo_solicitacao_id`, `form.area_responsavel` e `moduloApropriacoesHabilitado` não mudam

**Efeito prático:** trocar o subtipo não re-resolve os campos. A regra `tipo:subtipo` — o marco 16
inteiro (“Campos por tipo e subtipo”, hoje marcado como *não auditado*) — **não tem efeito nenhum
na tela da Nova Solicitação**. O motor está certo, a tela de configuração grava certo, o backend
resolve certo (`SolicitacaoController.js:2440` passa `tipoSubId`); só a tela do usuário ignora.

Isto é **defeito de produto, não do teste**. A suíte 15 não estava quebrada: ela estava certa e
apontando para um bug real. Vale a mesma leitura da seção 4 do `LEIA-PRIMEIRO.md` — o teste pegou
o que a revisão de código não pegou.

Por que a suíte 12 passa e não pegou isto: ela prova a **tela de configuração** (que o seletor de
subtipo aparece e que grava sob `tipo:subtipo`) e confere a chave no banco. Ela nunca chega a
trocar o subtipo na Nova Solicitação, que é onde o memo congela. O comentário no cabeçalho da 12
promete mais do que as asserções entregam.

### Causa B — defeito do teste: a chave da área é o CÓDIGO, não o nome

A suíte 15 grava a regra à mão sob `regras['GERENCIA DE PROCESSOS']` (`15-tela-aditivo.js:63`).

No banco:

| campo | valor |
|---|---|
| `setores.id` | 2 |
| `setores.codigo` | `GEO` |
| `setores.nome` | `GERENCIA DE PROCESSOS ` (com espaço no fim) |

As duas telas usam **`setor.codigo`** como valor do `<option>`:

- `NovaSolicitacao.jsx:1630` — `<option value={s.codigo}>{s.nome}</option>`
- `NovaSolicitacaoCamposConfig.jsx:279` — idem

E a configuração real no banco confirma: a chave gravada é `{"regras":{"GEO":{"tipos":{...`.

Logo a resolução procura por `normalizarAreaNovaSolicitacao('GEO')` = `'GEO'`, e a regra escrita
pelo teste sob `'GERENCIA DE PROCESSOS'` **nunca é encontrada**.

O espaço no fim do nome é irrelevante aqui: `normalizarAreaKey`/`normalizarAreaNovaSolicitacao`
fazem `.trim().toUpperCase()` **nos dois lados** (gravação e leitura). A armadilha registrada na
seção 2.2 do `LEIA-PRIMEIRO.md` existe, mas **não é esta**. A hipótese do cabeçalho da suíte 15
deve ser corrigida junto, senão manda o próximo leitor para o lugar errado.

### Causa C — defeito de produto: medição e aditivo não são mutuamente exclusivos

Encontrada ao rodar a suíte já com A e B corrigidas. É a mais grave das três.

`frontend/src/pages/NovaSolicitacao.jsx:1138-1139`

```js
const usaMedicaoFluxoNovo = exibirCamposContrato && Boolean(form.contrato_id) && contratoSelecionadoEhFluxoNovo;
const usaAditivoContrato  = usaFluxoContratoNovo && exibirCamposContrato && Boolean(form.contrato_id);
```

Com um tipo do fluxo novo (`usa_fluxo_contrato_novo`) apontando um contrato que também é do fluxo
novo, **as duas condições são verdadeiras ao mesmo tempo**. E no `handleSubmit` a guarda da medição
vem antes do ramo do aditivo:

| linha | o que faz |
|---|---|
| `:864` | `if (usaMedicaoFluxoNovo)` → sem parcela marcada, `alert` e `return` |
| `:924` | `if (usaAditivoContrato)` → chama `solicitarAditivoContrato` |

O envio nunca chega à linha 924: morre em 864 com *“Selecione ao menos uma parcela do contrato para
medir.”* **O termo aditivo não pode ser solicitado pela tela — em nenhuma circunstância.**

O backend está provado (suíte 14) e o bloco desenha certo; só o envio está morto. É a mesma família
dos defeitos da seção 4 do `LEIA-PRIMEIRO.md`: passa em revisão de código e só o teste de tela pega.

Efeito colateral do mesmo problema: `:1953` renderiza o bloco de medição sob `usaMedicaoFluxoNovo`,
então **os dois blocos aparecem juntos** na tela do aditivo.

#### C4 — a correção

Tornar as duas trilhas exclusivas, com o aditivo tendo precedência, e declarar o aditivo antes:

```js
const usaAditivoContrato  = usaFluxoContratoNovo && exibirCamposContrato && Boolean(form.contrato_id);
const usaMedicaoFluxoNovo = !usaAditivoContrato && exibirCamposContrato && Boolean(form.contrato_id) && contratoSelecionadoEhFluxoNovo;
```

Por que é seguro para a medição, que é a trilha em produção:

| cenário | `usaFluxoContratoNovo` | efeito |
|---|---|---|
| tipo **MEDIÇÃO** + contrato do fluxo novo | `false` | `usaAditivoContrato` = false → **medição inalterada** |
| tipo **MEDIÇÃO** + contrato legado | `false` | inalterado (já era false) |
| tipo do fluxo novo **sem** contrato apontado (abertura) | `true` | ambos false → inalterado |
| tipo do fluxo novo **com** contrato apontado (aditivo) | `true` | aditivo passa a vencer — **é a correção** |

A trilha da medição só muda no cenário que hoje está quebrado de qualquer forma.
---

## 3. O que verifiquei no código e no banco

| Verificação | Resultado |
|---|---|
| `setores` da GERÊNCIA DE PROCESSOS | `codigo='GEO'`, `nome='GERENCIA DE PROCESSOS '` |
| Chave real em `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` | `regras.GEO.tipos.*` — código, não nome |
| Valor do `<option>` de área nas duas telas | `setor.codigo` nas duas |
| Cascata do backend (`novaSolicitacaoCamposConfig.js:265`) | subtipo antes do tipo, área → global → legado — correta |
| Cascata do frontend (`novaSolicitacaoCampos.js:60`) | espelha o backend — correta |
| Backend recebe o subtipo | `SolicitacaoController.js:2440` passa `tipoSubId` — correto |
| Memo da tela de configuração (`NovaSolicitacaoCamposConfig.jsx:137`) | **tem** `subtipoSelecionadoId` nas deps — correto |
| Memo da Nova Solicitação (`NovaSolicitacao.jsx:433`) | **falta** `form.tipo_sub_id` — **defeito** |

---

## 4. Correções propostas

### C1 — produto: acrescentar `form.tipo_sub_id` às dependências do memo

Um item na lista de dependências de `NovaSolicitacao.jsx:433`. Não muda a assinatura de nada,
não muda a cascata, não muda o backend.

### C2 — teste: gravar a configuração pela própria tela, não por SQL

É o caminho que o `LEIA-PRIMEIRO.md` já indicava, e é o que elimina a **classe** do problema
(regra 4: sem remendo). Trocar `'GERENCIA DE PROCESSOS'` por `'GEO'` no SQL faria o teste passar,
mas deixaria a suíte presa a um detalhe interno de chave — que foi exatamente o que a quebrou.
Gravando pela tela de configuração, como faz a suíte 12, a chave passa a ser problema da tela.

### C3 — corrigir o cabeçalho da suíte 15

A hipótese escrita lá está errada e é ativamente enganosa. Trocar pelo diagnóstico real.

---

## 5. Risco e alcance

| Frente | Risco | Por quê |
|---|---|---|
| Nova Solicitação — tipos **sem** subtipo | nenhum | `chaveTipoSubtipo` devolve `null` sem subtipo; a cascata cai no tipo, como hoje |
| Nova Solicitação — tipos **com** subtipo | **corrige** | passa a obedecer a regra do subtipo, que é o comportamento especificado |
| Backend | nenhum | não é tocado; já resolvia certo |
| Tela de configuração de campos | nenhum | não é tocada |
| Solicitação de compra (`NovaSolicitacaoCompra.jsx`) | nenhum | verificado: não usa a cascata de campos por subtipo |
| Config compartilhada no banco | contido | a suíte 15 já salva e restaura no `finally`; C2 mantém |

**Mudança de comportamento — verificada e nula hoje:** depois de C1, as regras de subtipo já
gravadas passariam a valer, e a tela mudaria para quem tivesse configurado subtipos. Consultei o
banco: **não existe hoje nenhuma chave `tipo:subtipo`** em `NOVA_SOLICITACAO_CAMPOS_POR_TIPO` —
só chaves de tipo (`regras.GEO.tipos.1`, `.2`, ...). Logo C1 **não altera nenhuma tela existente**;
apenas destrava o recurso para quem for configurar daqui para a frente. Em produção, repetir esta
consulta antes do deploy: se lá houver chave de subtipo gravada, o efeito deixa de ser nulo.

---

## 6. Como se provou — executado em 18/08/2026

| Suíte | Prova | Resultado |
|---|---|---|
| `qa/medicao/15-tela-aditivo.js` | a tela do aditivo, ponta a ponta | ✅ **PASSOU** — 11 provas |
| `qa/medicao/09-tela-medicao.js` | tela da medição (a trilha que C4 tocou) | ✅ PASSOU |
| `qa/medicao/12-tela-campos-por-subtipo.js` | a tela grava sob `tipo:subtipo` | ✅ PASSOU |
| `qa/medicao/11-campos-por-subtipo.js` | precedência da regra de subtipo (motor) | ✅ PASSOU |
| `qa/medicao/14-termo-aditivo.js` | teto de 25% acumulado e devolução | ✅ PASSOU |
| `qa/integracao-d38/03-regressao-solicitacao-padrao.js` | fluxo padrão intacto | ✅ PASSOU |
| `qa/integracao-d38/01-fluxo-completo.js` | criação de contrato pela tela | ✅ PASSOU |

As 11 provas da suíte 15:

```
+ campo `contrato` configurado pela tela para o subtipo de aditivo
+ regra gravada sob a chave `tipo:subtipo` — "33:27"
+ subtipo de aditivo selecionavel
+ campo de contrato aparece para o subtipo de aditivo
+ bloco do aditivo aparece no lugar do bloco de criacao
+ bloco de medicao NAO aparece junto com o do aditivo
+ bloco mostra o teto de 25% e o disponivel
+ tela avisa quando o valor passa do limite
+ formulario valido para envio
+ aditivo gravado pela tela como PENDENTE — 2000.00|PENDENTE|2027-12-31|Ampliacao de escopo
+ o contrato NAO muda enquanto o aditivo esta pendente — 0.00
```

Nenhuma migration. Nenhuma variável de ambiente nova. Nenhuma permissão nova.
Config compartilhada restaurada idêntica ao original em todas as execuções.

---

## 7. O que a suíte ganhou de permanente

- **Grava a configuração pela tela**, não por SQL: a suíte deixou de depender do formato interno
  da chave, que foi o que a quebrou (causa B). Helper `configurarCamposPelaTela`.
- **Diagnóstico de validade do formulário** antes do envio. A validação nativa do navegador barra
  o submit **sem disparar diálogo**: a falha aparecia como “sem alerta e sem registro”, o pior tipo
  para depurar. Agora o teste pergunta ao `<form>` quem está inválido e reporta o rótulo — foi o
  que revelou a causa C em uma execução.
- **Asserção de exclusividade**: o bloco de medição não pode aparecer junto com o do aditivo.
  Guarda de regressão direta para C4.
- **Checkbox nunca é alternado às cegas** — só clica quando o estado diverge do desejado.
- **Rótulo exato** na linha do campo: `Contrato` convive com `Apropriacoes do contrato` e
  `Ref. contrato abertura` na mesma tabela, e um regex frouxo pegaria a linha errada.

---

## 8. Achado de layout, não corrigido aqui

Na trilha do aditivo o campo `descricao` é rotulado **“Título do contrato”**, com a ajuda
*“Vira a referência do contrato”* (`NovaSolicitacao.jsx:2081`). O rótulo é gated por
`usaFluxoContratoNovo`, que também é verdadeiro no aditivo — mas ali não se está abrindo contrato
nenhum. Cosmético, não bloqueia: fica anotado para a pendência de layout dos blocos de medição e
aditivo, que já estava na fila.
