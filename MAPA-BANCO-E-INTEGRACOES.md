# Mapa do banco e das integrações entre as áreas

> **Registro historico.** As contagens e integracoes deste levantamento pertencem ao
> momento em que ele foi produzido. Para runtime vigente, consulte
> `docs/arquitetura/ESTADO_RUNTIME_E_LEGADOS.md`, `MAPA-DO-SISTEMA.md` e os READMEs
> canonicos em `docs/modulos/`.

Levantado em 20/08/2026, a pedido do cliente, depois de um campo de tela ter sido ligado à **fonte
errada**.

Este documento não é um dicionário das 254 tabelas — isso ninguém lê e envelhece em uma semana. Ele
responde a **uma** pergunta, que é a que causou o problema:

> **De onde este campo tira os dados, e é a fonte certa?**

---

## 1. O tamanho do sistema

| | |
|---|---|
| Tabelas | **254** |
| Chaves estrangeiras | **451** |
| Modelos Sequelize | 251 (6 tabelas sem modelo, entre elas `obras` e `comprovantes`) |

Por área:

| Área | Tabelas |
|---|---|
| Financeiro (títulos, baixas, bancos, cartões, boletos, pagamentos, provisões) | 53 |
| SST | 45 |
| CRM | 19 |
| Compras | 19 |
| Solicitações | 18 |
| Contratos de obra + medição | 15 |
| Obras e cadastros base | 14 |
| Custo/Resultado (`cr_`) | 14 |
| RH / DP | 11 |
| Fiscal | 10 |
| eSocial | 8 |
| Comercial | 3 + tabelas de preço |
| Integração Sienge, governança, treinamento, config | ~15 |

**O que isso significa na prática:** quase toda tela de solicitação, contrato ou financeiro toca
três ou quatro áreas ao mesmo tempo. Um campo preenchido da fonte errada não fica errado só ali —
ele desce para o título, o rateio e a DRE.

---

## 2. As tabelas que alimentam campos de seleção

Não é opinião: são as mais **referenciadas por chave estrangeira**. Quanto mais outras tabelas
apontam para ela, mais ela é a fonte canônica de alguma coisa.

| Referências | Tabela | É a fonte de |
|---|---|---|
| 115 | `users` | usuário/responsável em todo o sistema |
| 25 | `empresas_grupo` | empresa do grupo |
| 24 | `obras` | obra / centro de custo |
| 23 | `parceiros` | credor, fornecedor, favorecido, comprador, corretor |
| 17 | `titulos_financeiros` | título financeiro |
| 15 | `solicitacoes` | solicitação |
| 12 | `apropriacoes` | apropriação (centro de custo analítico da obra) |
| 12 | `contas_bancarias` | conta bancária |
| **7** | **`categorias_financeiras`** | **plano de contas / categoria financeira** |
| 5 | `tipo_solicitacao` | tipo de solicitação |

### `categorias_financeiras` — o caso que motivou este documento

É o **cadastro financeiro**, administrado em Financeiro › Cadastros
(`GET/POST/PATCH /financeiro/categorias` → `CategoriaFinanceiraController`).

204 registros: **160 `PAGAR`** e 44 `RECEBER`.

Sete tabelas dependem dela — entre elas `titulos_financeiros.categoria_financeira_id`, que é o que
classifica o lançamento na **DRE**. Categoria errada aqui não dá erro: aparece meses depois, no
relatório.

**O que estava errado:** o campo de categoria na aprovação do contrato lia
`GET /configuracoes/contrato-obra-categorias` — uma **configuração** (a lista curada de três ids),
não o cadastro. E aquela rota exige permissão de *Configurações*, que quem aprova contrato não tem:
o 403 caía num `catch` mudo e o campo aparecia vazio.

**Como está agora:** `GET /contratos/fluxo-novo/categorias` lê `categorias_financeiras`, filtra
`tipo='PAGAR' AND ativo=1`, e o erro aparece na tela. Conferido: 200 com 160 itens.

---

## 3. Como um dado atravessa as áreas

O caminho que mais importa aqui, porque termina em dinheiro:

```
obras ──┐
        ├─> solicitacoes ──> contratos ──> contrato_parcelas ──> titulos_financeiros
parceiros┘        │                                                      │
                  │                                                      ├─> titulos_financeiros_rateios ──> apropriacoes
apropriacoes ─────┘                                                      └─> categorias_financeiras  (DRE)
```

Pontos onde uma área entrega dado para a outra:

| De | Para | Pelo quê |
|---|---|---|
| Solicitações | Contratos | `contratos.solicitacao_id` e `solicitacoes.contrato_id` (PI-16: o contrato **é** uma solicitação) |
| Contratos | Financeiro | `contrato_parcelas.titulo_financeiro_id` — o título nasce na aprovação |
| Contratos | Obras | `contrato_apropriacoes` → `apropriacoes` (rateio que divide cada parcela) |
| Financeiro | Contabilidade | `titulos_financeiros.categoria_financeira_id` → DRE |
| Cadastros | Contratos | `contratos.favorecido_id` e `contrato_credores.parceiro_id` → `parceiros` |
| Compras | Solicitações | `solicitacao_compras.solicitacao_principal_id` |
| Medição | Solicitações | `medicao_parcelas.solicitacao_id`, `anexos.medicao_id`, `historicos.medicao_id` |

**Consequência:** um campo de seleção numa tela de solicitação quase nunca é "só daquela tela".

---

## 4. Checklist: ligar um campo de seleção a uma fonte

Os quatro passos que teriam evitado o erro. **Antes de escrever a tela:**

### 1. Achar a tabela canônica, não uma lista parecida

```bash
# quem aponta para ela? quanto mais, mais canônica
SELECT REFERENCED_TABLE_NAME, COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA='fluxy_main_copia' AND REFERENCED_TABLE_NAME IS NOT NULL
GROUP BY 1 ORDER BY 2 DESC;
```

**Sinal de alerta:** se a fonte é `configuracoes_sistema`, é **configuração**, não cadastro.
Configuração diz *quais* de um cadastro valem numa regra; ela nunca é o cadastro.

### 2. Usar o endpoint que o dono do cadastro usa

Achar o controller do cadastro (`grep -n "'/financeiro/categorias'" backend/src/routes.js`) e
conferir se a listagem existente serve. Se a guarda dela não couber em quem usa a tela, criar rota
de **leitura** própria — não afrouxar a do dono.

### 3. Conferir a guarda contra quem usa a tela

Foi o erro repetido **quatro vezes** neste bloco. A pergunta certa não é "o que a rota faz", é
**"quem vai clicar nisto?"**. Guarda escolhida pelo que a rota faz barra o usuário da obra em todas
as vezes.

### 4. Nunca engolir o erro do carregamento

`.catch(() => setLista([]))` transforma 403 em campo vazio, sem explicação. Guardar a mensagem e
mostrá-la. Campo vazio sem motivo foi como **os quatro** defeitos chegaram ao cliente.

E a regra que fecha: **filtrar pelo que o negócio exige** — aqui, `tipo='PAGAR'`, porque contrato
gera conta a pagar e uma categoria de RECEBER classificaria o título do lado errado da DRE. O
backend revalida o mesmo filtro; tela e API não podem discordar sobre o que é aceitável.

---

## 5. Campos já mapeados (área de Contratos e Solicitações)

| Campo | Tabela | Endpoint | Filtro |
|---|---|---|---|
| Categoria financeira (aprovação) | `categorias_financeiras` | `GET /contratos/fluxo-novo/categorias` | `tipo='PAGAR'`, ativa |
| Apropriação / rateio | `apropriacoes` | `GET /apropriacoes?obra_id=` | da obra, ativa, analítica (não somadora) |
| Credor / favorecido | `parceiros` | `GET /parceiros?q=&fornecedor=1&ativo=1` | busca por nome ou CPF/CNPJ |
| Obra | `obras` | `GET /obras` | escopo de obra do usuário |
| Condição de pagamento | `financeiro_formas_pagamento` | `GET /contratos/fluxo-novo/opcoes` | ativas |
| Responsável | `users` | `GET /contratos/fluxo-novo/opcoes` | ativos |
| Tipo / subtipo de contrato | `tipo_solicitacao`, `tipos_sub_contrato` | config da Nova Solicitação | ativos, por setor |
| Limite do Jurídico | `configuracoes_sistema` (`CONTRATO_LIMITE_JURIDICO`) | `GET /contratos/fluxo-novo/limite-juridico` | — (é configuração mesmo) |

> A última linha é o contraste útil: **limite** é configuração; **categoria** é cadastro. Confundir
> os dois foi o defeito.

---

## 6. O que ainda não está mapeado

Este documento cobre Contratos, Solicitações, Medição e os cadastros que eles consomem. **Não
cobre** os campos de seleção de Compras, CRM, SST, Fiscal, RH, eSocial e Comercial — 100+ tabelas.

Antes de produção, vale repetir a seção 5 para cada área, com quem conhece o módulo. O checklist da
seção 4 vale para todas.
