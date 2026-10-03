# Mapa de impacto — etapa 5 (aprovação de contrato)

Levantamento feito **antes de codar**, conforme `PROTOCOLO-QA.md` seção 0.

## 1. O que a aprovação faz

Contrato em `AGUARDANDO_APROVACAO` → aprovado por quem tem `contratos.aprovacao.aprovar`:

1. Cada parcela em `PREVISAO` **vira um título financeiro** com status `ABERTO`
2. A parcela passa a `APROVADA`, guardando `titulo_financeiro_id`, e fica `travada`
3. O contrato passa a `ATIVO`, registrando `aprovado_por` e `aprovado_em`
4. Tudo em **uma transação**: ou todas as parcelas viram título, ou nenhuma

## 2. O que é afetado — e aqui está a inversão

Até agora o objetivo era **não** tocar no financeiro. A partir da aprovação é o contrário:
os títulos **passam a existir** e **devem** aparecer nas 27 rotas.

| Aspecto | Antes da aprovação | Depois |
|---|---|---|
| Existe título? | Não | Sim, `ABERTO` |
| Aparece no dashboard, contas a pagar, DRE? | Não | **Sim, e é o esperado** |
| Saldo aberto projetado | inalterado | **aumenta** pelo valor do contrato |

> O teste da etapa 3 provou que criar contrato não muda nada. O teste da etapa 5 precisa
> provar o **oposto**: que aprovar muda exatamente o esperado, nem mais nem menos.

## 3. Requisitos verificados no código

**Campos obrigatórios de `titulos_financeiros`** (NOT NULL sem default), que a parcela precisa
suprir: `parceiro_id`, `tipo`, `descricao`, `valor_original`, `valor_saldo`, `data_vencimento`.
A parcela já guarda `parceiro_id`, `valor` e `data_vencimento`; `tipo` será `PAGAR` e a
descrição derivada do código do contrato.

**Hook de código do título** (`models/index.js`): gera `TIT-XXXXXX` com `LOCK.UPDATE`. Como o
lock não protege uma transação contra ela mesma, os títulos devem ser criados **em série**
dentro da transação — comprovado na etapa 2.

## 4. Rota da etapa 5

| # | Passo | Verificação obrigatória |
|---|---|---|
| 5.1 | Serviço `aprovarContrato` | Transação atômica: falha no meio não deixa título órfão nem parcela inconsistente |
| 5.2 | Permissão estrita no serviço | **SUPERADMIN sem a permissão é barrado** |
| 5.3 | Transição das parcelas | `PREVISAO` → `APROVADA`, `travada = true`, `titulo_financeiro_id` preenchido |
| 5.4 | Contrato → `ATIVO` | `aprovado_por` e `aprovado_em` gravados |
| 5.5 | Prova de aparecimento | As 27 rotas mudam **exatamente** pelo valor do contrato |
| 5.6 | Idempotência | Aprovar duas vezes não duplica títulos |
| 5.7 | Contrato já aprovado/rejeitado | Recusa com erro claro |

## 5. Riscos identificados

| Risco | Mitigação |
|---|---|
| Aprovação parcial (alguns títulos criados) | Transação única; teste com falha forçada no meio |
| Aprovar duas vezes duplicando títulos | Checar `status_contrato` e `titulo_financeiro_id` antes |
| Título nascer sem obra/apropriação | Herdar do contrato; validar antes de criar |
| Permissão estrita não aplicada por engano | Teste explícito com SUPERADMIN sem permissão |

## 6. Pendência para a etapa 5

Confirmar se `isBusinessAdmin` reconhece `ADMINISTRADOR` e não `ADMIN`. São **14 usuários
ativos com perfil ADMIN**, e isso define quem tem acesso amplo hoje — relevante porque o
cliente vai migrar os ADMIN para USUARIO em produção.

---

## 7. DEFEITO ENCONTRADO no teste 5.5 (16/08)

`userHasStrictAreaPermission` chama `getAreasPermissoesForUser`, que tem um **early-return**:

```js
if (isBusinessAdmin(user)) return [];   // lista vazia = "acesso total" para o front
```

Para SUPERADMIN a lista volta **sempre vazia**. Como a verificação estrita interpreta lista
vazia como "nada concedido", o resultado é:

> **Um SUPERADMIN nunca consegue aprovar, mesmo com a permissão marcada.**

Testado: usuário SUPERADMIN com `contratos.aprovacao.aprovar` na sessão → `403`.

### Por que isso é grave

O cliente informou que **vai manter alguns perfis como SUPERADMIN** em produção. Se os
aprovadores estiverem nesse grupo, a aprovação fica impossível para todos — o contrato nunca
sai de `AGUARDANDO_APROVACAO`.

O comportamento pretendido é o oposto: SUPERADMIN **não tem passe livre**, mas **pode aprovar
se a permissão estiver marcada**.

### Correção necessária (não aplicada)

A verificação estrita precisa montar a lista de permissões **sem** o atalho de perfil —
lendo `padroes`, `sessionPermissions`, o mapa de permissões e os bloqueios, exatamente como
`getAreasPermissoesForUser` faz **depois** do early-return.

Opções: extrair essa montagem para função reutilizável, ou dar um parâmetro
`{ ignorarBypass: true }` a `getAreasPermissoesForUser`. A primeira é mais limpa e não muda
a assinatura usada por outros chamadores.

### Verificação obrigatória depois da correção

| Caso | Esperado |
|---|---|
| SUPERADMIN **sem** a permissão | barrado |
| SUPERADMIN **com** a permissão | **aprova** |
| ADMIN sem / com | barrado / aprova |
| USUARIO sem / com | barrado / aprova |
| Bloqueio explícito do usuário | prevalece sobre a concessão |

---

## 8. REPROVADO na auditoria (17/08) — causa raiz única

As 7 alegações (A1–A7) foram confirmadas. A reprovação veio do que **não foi alegado**.

### Causa raiz

`aprovarContrato` chama `TituloFinanceiro.create` **diretamente**, contornando o serviço de
título do sistema. Consequência: o título nasce sem o que o próprio sistema exige.

| Falha | Evidência |
|---|---|
| **Contorna validações obrigatórias** | `POST /api/financeiro/titulos` recusa com 400 título sem `categoria_financeira_id`, `competencia_data` e `forma_pagamento_id`. A aprovação grava os três NULL em 6/6, mais `empresa_id`, `apropriacao_id` e `data_emissao` |
| **Valor não chega à DRE** | `relatorio-dre`: 12 linhas antes, 12 depois — `competencia_data` nula. A seção 2 deste documento afirmava o contrário |
| **Eleva o painel de pendências do próprio sistema** | `TITULOS_SEM_EMPRESA` (CRÍTICA) 0→6, `SEM_COMPETENCIA` 0→6, `SEM_CATEGORIA` 0→6; `pendencias_altas` 15→27; alerta executivo sobe de MÉDIA para ALTA |
| **Zero trilha de auditoria** | Título pela API gera `FINANCIAL_TITLE_CREATED` (1.301 na base). Pela aprovação: **0 eventos**. Numa ação que existe justamente por envolver mais de R$ 50.000 |

### Correção — sem remendo

**Usar o serviço de título do sistema em vez de `TituloFinanceiro.create`.** Isso elimina a
classe do problema: validações, campos obrigatórios, DRE e auditoria passam a vir de graça, e
qualquer regra futura do serviço vale automaticamente para a aprovação.

Exige mapear antes: quais campos o serviço exige, de onde vêm no contrato (`categoria_financeira_id`,
`empresa_id`, `apropriacao_id`, `competencia_data`) e se algum precisa ser decidido pelo cliente.

### Falhas MÉDIAS

Motivo de rejeição aceita `123`, `true`, `{}`, array; sem mínimo nem máximo; acima de 65.535
bytes vira erro cru sem `statusCode`. Contrato sem parcelas: aprovar dá 409, rejeitar aceita.
Erro de FK vaza nome de schema e constraint.

### Pendência do projeto — FECHADA

`isBusinessAdmin` reconhece **ADMINISTRADOR, não ADMIN**. Na base: **3 SUPERADMIN ativos,
0 ADMINISTRADOR, 16 ADMIN, 52 USUARIO**.

Ou seja, apenas **3 pessoas** têm bypass hoje — não 17, como eu afirmei em comentário de
código. E a migração ADMIN → USUARIO planejada **não altera** o acesso à aprovação.

---

## 9. Mapa dos campos do serviço de título (17/08)

Levantado antes de codar a correção. A função a usar é
**`criarTituloManual(req, payload, { transaction, origemTitulo })`** —
`tituloFinanceiroService.js:2705`. Ela aceita transação externa, o que preserva a
atomicidade já testada em 5.1.

### O que o serviço resolve sozinho

| Campo | Como |
|---|---|
| `empresa_id` | `resolverEmpresaTitulo({ empresaIdInformada, obra })` — **deriva da obra**. Não precisa decidir nada |
| `codigo` do título | Hook do modelo, com lock |
| `valor_saldo`, `valor_baixado` | Derivados do valor |
| Validações de parceiro, obra, apropriação, categoria | Automáticas, com erro 400 apropriado |
| Evento `FINANCIAL_TITLE_CREATED` | `registrarSeguranca` (padrão true) — resolve a falta de auditoria |

### O que precisa vir do contrato

| Campo | Origem | Situação |
|---|---|---|
| `obra_id` | `contrato.obra_id` | ✅ existe |
| `parceiro_id` | `parcela.parceiro_id` | ✅ existe |
| `valor` | `parcela.valor` | ✅ existe |
| `descricao` | derivada do código do contrato | ✅ |
| `data_vencimento` | `parcela.data_vencimento` | ✅ existe |
| `forma_pagamento_id` | `parcela.forma_pagamento_id` | ✅ existe (pode ser nulo hoje) |
| `apropriacao_id` | **não existe na parcela nem no contrato** | 🔴 falta |
| `categoria_financeira_id` | **não existe** | 🔴 falta — opcional no serviço, mas sua ausência é o que gera a pendência `TITULOS_SEM_CATEGORIA` |
| `competencia_data` | **não existe** | 🔴 **falta e é OBRIGATÓRIA** |

### O bloqueio real

`resolverCompetenciaTitulo` (linha 1622) **lança 400** se `competencia_data` não vier:

> "Competencia DRE e obrigatoria para todos os titulos financeiros. Informe a competencia
> economica real do lancamento."

Ou seja: **sem definir a competência, a aprovação não consegue criar título nenhum** pela via
correta. Não há default no sistema — é decisão de negócio, e o próprio texto do erro diz que
precisa ser a competência econômica real.

### Decisões necessárias (D32–D34)

| # | Pergunta |
|---|---|
| **D32** | Qual a **competência DRE** de cada parcela? O mês do vencimento, o mês da aprovação do contrato, ou um campo que o solicitante informa por parcela? |
| **D33** | Qual a **categoria financeira** do título? Vem do contrato (campo novo), do tipo de solicitação, ou o solicitante escolhe? Há 8+ categorias de PAGAR cadastradas, como "Mão de Obra Contratada", "Locação de Equipamentos", "Serviços Terceirizados" |
| **D34** | Qual a **apropriação**? O contrato já tem `itens_apropriacao` e existe `contrato_apropriacoes` — reaproveitar, ou definir por parcela? |

> Sem D32 a correção não avança: é a competência que trava a criação do título e o que fez o
> valor não chegar à DRE.

---

## 10. Decisões D32–D34 (17/08) — desbloqueiam a correção

### D32 — Competência DRE: **mês da aprovação**

Não o mês do vencimento. Razão do cliente: **é na aprovação que a obrigação se materializa** —
antes disso o contrato é previsão, e o vencimento é evento futuro de pagamento, não de
competência econômica.

Implementação: todas as parcelas do contrato recebem a **mesma** competência, a da data de
aprovação. Um contrato aprovado em outubro com parcelas até março tem as seis na competência
de outubro.

**Confirmado pelo cliente em 17/08**, com a razão explícita: concentrar todas as parcelas na
mesma competência **é intencional, para a análise econômica da DRE**. O custo do contrato
aparece por inteiro no mês em que a obrigação foi assumida, e não diluído pelo cronograma de
pagamento — que é informação de caixa, não de competência.

### D33 — Categoria financeira: lista curada por tela

Hoje a categoria é definida internamente. Passa a haver uma **lista de categorias permitidas
para contratos**, montada a partir do cadastro de categorias financeiras, com tela para marcar
e desmarcar quais aparecem.

Mesmo padrão já decidido para as formas de pagamento (D10) e já implementado na Apropriação
Padrão por Obra: **seleção sobre cadastro existente, não cadastro novo**.

### D34 — Apropriação: da tabela de apropriações da obra

Vem das apropriações cadastradas na página **Cadastro de Apropriações** (`gestao-apropriacoes`),
por obra. Não é campo livre nem por parcela.

> Já existe base para isso: a tela **Apropriação Padrão por Obra** (`obra-tipo-apropriacao`,
> entregue e aprovada) mapeia obra + tipo → apropriação. Verificar na implementação se o
> mesmo vínculo serve para o contrato ou se o contrato precisa de apropriação própria.

### Efeito na correção

Com as três definidas, `criarTituloManual` pode ser chamado com todos os campos obrigatórios,
o que resolve de uma vez as quatro falhas ALTAS da auditoria: validações, DRE, painel de
pendências e trilha de auditoria.

### Trabalho que as decisões geram

| # | Item | Depende de |
|---|---|---|
| A | Tela de categorias permitidas para contrato | D33 |
| B | Campo de categoria no contrato (escolhida da lista curada) | A |
| C | Apropriação no contrato, vinda do cadastro da obra | D34 |
| D | `aprovarContrato` passa a usar `criarTituloManual` | A, B, C |
| E | Reauditoria do bloco | D |

---

## 11. Mapa dos itens B e C (17/08)

### C — Apropriação: **estrutura já existe, nada a criar**

`contrato_apropriacoes` (contrato → apropriação, com `percentual`) está em uso: **392 vínculos
em 321 dos 335 contratos**.

Distribuição real:

| Apropriações por contrato | Contratos |
|---|---|
| 1 | **299** (93%) |
| 2 a 5 | 18 |
| 7 a 15 | 4 |

Como o título tem **uma** `apropriacao_id`, mas o contrato pode ter rateio, a regra fica:

- **1 apropriação** → vai direto em `apropriacao_id`
- **2 ou mais** → vai como `rateios` no payload; o serviço tem `escalarRateiosParaTitulo`,
  que ajusta os percentuais ao valor de cada parcela

O serviço de título já suporta os dois caminhos. **Nenhuma tabela nova.**

### B — Categoria financeira: coluna nova no contrato

O contrato não tem `categoria_financeira_id`. Precisa da coluna, preenchida a partir da lista
curada no item A.

| Campo | Onde vai |
|---|---|
| `categoria_financeira_id` | coluna nova em `contratos`, nullable |

Nullable de propósito: os 335 contratos legados não têm categoria, e exigir preenchimento
quebraria o fluxo antigo. A obrigatoriedade vale só na criação do fluxo novo.

### Campos do título, resolvidos

| Campo | Origem final |
|---|---|
| `obra_id`, `parceiro_id`, `valor`, `descricao`, `data_vencimento` | contrato/parcela |
| `forma_pagamento_id` | parcela |
| `empresa_id` | derivada da obra pelo serviço |
| `competencia_data` | **mês da aprovação** (D32) |
| `categoria_financeira_id` | contrato (item B) |
| `apropriacao_id` **ou** `rateios` | `contrato_apropriacoes` (item C) |

Com isso, `criarTituloManual` pode ser chamado completo.

---

## 12. Reauditoria (17/08) — REPROVADO com 6 ALTAS

### O que a correção resolveu, confirmado

| Antes | Depois |
|---|---|
| campos NULL em 6/6 títulos | preenchidos em 6/6 |
| DRE: 12 linhas antes, 12 depois | **despesas +168.000, resultado −168.000** |
| pendências 543→561, altas 15→27 | **543→543, altas 15→15** |
| 0 eventos de auditoria | **+6, um por título** |

Não-regressão preservada: estados (64 casos), rejeição (244), concorrência, atomicidade de
dados, isolamento (635 requisições, 0 externas).

### As 6 falhas ALTAS

| # | Falha | Natureza |
|---|---|---|
| 1 | **Apropriação continua NULA no fluxo real** — nenhum ponto grava `contrato_apropriacoes`. O teste do implementador só passou porque o vínculo foi inserido **à mão** | erro de teste: validei com dado que eu mesmo plantei |
| 2 | **A lista curada não restringe nada** — categoria fora da lista cria e aprova. A chave só é lida pelo controller da própria tela | funcionalidade incompleta |
| 3 | **Regressão de permissão**: `assertFinanceAccess(req)` passou a barrar ADMIN e USUARIO com a permissão. Antes os 4 perfis aprovavam; agora **3 usuários** em toda a base conseguem | regressão introduzida pela correção |
| 4 | **Evento de auditoria sobrevive ao rollback** — falha depois dos títulos deixa 6 eventos de títulos **inexistentes** | saiu de "sem trilha" para "trilha que afirma o que não houve" |
| 5 | **Curadoria apaga a lista em silêncio** — `PATCH` com id inválido, string ou corpo vazio grava lista vazia com 200 | **mesma classe de falha que já reprovou a tela de apropriação neste projeto** |
| 6 | **Rateio igualitário impossível** — percentual arredondado a 2 casas antes de exigir soma 100: 33,333333×3 e 6,666667×15 dão 400. **10 dos 22 contratos com rateio existentes não somariam 100** | regra incompatível com os dados reais |

### Duas lições que valem além destas falhas

**Testar com dado plantado não prova o fluxo.** Inseri `contrato_apropriacoes` à mão e concluí
que a apropriação funcionava. O fluxo real nunca grava esse vínculo. O teste precisa percorrer
o caminho do usuário, não o caminho que o teste construiu.

**Repeti uma falha que já tinha sido reprovada.** A curadoria apaga a lista com entrada
inválida — exatamente o que aconteceu na tela de apropriação padrão, corrigido semanas atrás
neste mesmo projeto. Vale checar essa classe de erro em toda tela de configuração antes de
entregar: *entrada inválida nunca pode ser interpretada como "limpar tudo"*.

### Falhas MÉDIAS

Validação diferida (categoria/forma inválida passa na criação e só quebra na aprovação; coluna
sem FK); rateio erra 1 centavo por título com parcela quebrada; apropriação única ignora
percentual parcial; `numero_parcela`/`total_parcelas` nascem NULL; `data_emissao` no futuro;
`req` ausente vira `TypeError` sem `statusCode`; `req.user` divergente troca o autor registrado.

### Ordem de correção sugerida

1. **#3** (regressão de permissão) — é a que quebra funcionalidade existente
2. **#1** e **#6** — a apropriação não funciona de fato
3. **#4** — auditoria mentindo é pior que auditoria ausente
4. **#5** e **#2** — completam a curadoria

---

## 13. Terceira auditoria (17/08) — REPROVADO por 1 ALTA

**5 das 6 ALTAS confirmadas corrigidas** pelo método que as expôs, incluindo: curadoria
resistiu a 15 corpos inválidos; 0 eventos fantasmas em 5 falhas forçadas; rateio exato ao
centavo em 11 cenários (inclusive parcela prima R$ 97,13); os 10 contratos legados com rateio
fora de 100 intactos por MD5; `pularAcessoFinanceiro` inalcançável por HTTP.

### A ALTA restante — segundo portão não declarado

A correção da regressão de permissão (#3) removeu o portão do módulo financeiro, mas
`validarObraTitulo → assertObraScope` impõe **escopo de OBRA**: aprovador sem vínculo em
`usuarios_obras` com a obra do contrato recebe 403 — e **o mesmo usuário consegue rejeitar**.

Na base: **10 de 14 ADMIN e 15 de 47 USUARIO ativos não têm vínculo com obra nenhuma**; só 6
usuários têm vínculo com a obra 23. Minha validação com o usuário 66 passou **por acaso** —
ele tem vínculo com 22 obras.

Contradiz a matriz decidida na seção 7 (ADMIN/USUARIO **com** a permissão → aprovam).

### Decisões abertas

| # | Pergunta |
|---|---|
| **D36** | Quem aprova precisa de **vínculo com a obra** do contrato, ou a permissão estrita basta? Hoje: aprovar exige vínculo, rejeitar não — inconsistente de qualquer forma |
| **D37** | Categoria **removida da curadoria depois** de o contrato ser criado: a aprovação hoje **passa** (curadoria vale só na criação). Confirmar se é o desejado |

### MÉDIAS novas

`percentual` grava 4 casas mas valida 6 (33,333333→33,3333); apropriação duplicada → erro cru;
validação diferida (somadora ativa passa na criação e trava na aprovação); falha na gravação
do evento pós-commit deixa título sem trilha em silêncio; aprovação não revalida vínculo
apagado direto no banco.

---

## 14. D36 e D37 decididas e aplicadas (17/08)

**D36 — NÃO exige vínculo com a obra.** A permissão estrita basta. Aplicado:
`validarObraTitulo` ganhou `pularEscopoObra`, acionado apenas junto com
`pularAcessoFinanceiro` — ou seja, só no caminho interno da aprovação, inalcançável por HTTP
(A2 da 3ª auditoria). Validado com o usuário 3 (USUARIO, **zero** vínculos de obra): com a
permissão aprova; sem ela, 403. O caminho normal da API mantém o escopo de obra intacto.

**D37 — SIM, a aprovação passa** mesmo se a categoria tiver sido removida da curadoria depois
da criação. A curadoria vale no momento da criação; o contrato criado sob regra válida segue
aprovável. Comportamento atual confirmado, nenhuma mudança.

Pendentes para a 4ª auditoria: as 5 MÉDIAS da seção 13.
