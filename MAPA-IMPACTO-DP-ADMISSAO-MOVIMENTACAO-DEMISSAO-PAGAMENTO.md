# Mapa de impacto — escopo do Departamento Pessoal (itens 8 a 11)

Escrito em 27/08/2026, **antes da primeira linha de código**, conforme a regra do projeto.
Cobre os itens **8. Admissão**, **9. Movimentações**, **10. Demissão** e **11. Pagamento de Mão de
Obra** do escopo entregue pelo cliente.

---

## Regra que este escopo NÃO pode quebrar

A dinâmica da tela já está definida e **permanece**:

- **uma página só** — `RH/DP > Pessoal`, com as quatro abas: Solicitações, Colaboradores, Jornada,
  Apuração. Nada disso vira página nova nem entrada nova de menu;
- **ícones na coluna de ações** de cada colaborador — é por ali que nascem Movimentações e Demissão;
- **Admissão fica acima da tabela**, porque o colaborador ainda não existe para ter linha;
- **tudo em modal**, nunca card no fim da tabela;
- colaborador com solicitação em aberto sobe para o topo com destaque.

Os subtipos novos entram **dentro dessa estrutura**, não ao lado dela.

---

## 1. O achado que muda o tamanho do trabalho: onde esses quatro itens vivem hoje

Os quatro itens do escopo **já existem como tipo de solicitação no módulo principal**, com histórico:

| Tipo (`tipo_solicitacao`) | id | Solicitações |
|---|---|---|
| `PAGAMENTO DE MAO DE OBRA` | 10 | **613** |
| `DEMISSÃO` | 18 | **129** |
| `ADMISSÃO` | 9 | **110** |
| `ATESTADO` | 19 | **67** |
| | | **919 no total** |

O item 9 diz *"alteração do tipo de solicitação anteriormente denominado **Atestado**"*. Esse
`ATESTADO` é o **id 19 do módulo principal**, com 67 registros — não existe nada chamado Atestado
dentro do módulo DP.

No módulo DP existem hoje **4 solicitações**, todas `TROCA_OBRA`. O DP está vazio; o histórico está
no módulo principal.

> **Isto é uma decisão, não um detalhe.** Ver "Decisão 1".

## 2. O conflito central: o checklist deve TRAVAR

Os quatro itens repetem a mesma frase:

> "O sistema só permite concluir a solicitação se todos os documentos marcados no checklist
> estiverem efetivamente anexados."

E a Admissão acrescenta: *"deve impedir o envio da solicitação sem os documentos obrigatórios"*.

**Isso contraria uma decisão já tomada e documentada neste módulo.** Hoje `conferirDocumentacao`
diz, no próprio código:

> "AVISA, NAO TRAVA. O DP continua podendo aprovar sem o ASO — o exame costuma sair depois do
> pedido, e travar obrigaria a obra a ter tudo em maos no minuto zero, que nao e como a operacao
> funciona."

Lendo o escopo com cuidado, os dois não são incompatíveis — são **duas camadas diferentes**:

| Camada | O que é | Quando cobra |
|---|---|---|
| **Documentação Obrigatória** | lista fixa por tipo (RG, CPF, comprovante de residência, ASO apto) | **no envio** — impede abrir sem ela |
| **Checklist marcado** | o que o solicitante *declarou* que vai anexar | **na conclusão** — o que prometeu, entrega |

O checklist não obriga tudo. Ele obriga **o que foi marcado**. Marcar "Título de Eleitor" cria a
promessa; não marcar deixa o item fora da cobrança.

Isso preserva o motivo da decisão original — o ASO que sai depois — **desde que o ASO não seja
marcado no checklist na abertura**. Precisa de confirmação sua: ver "Decisão 2".

## 3. O achado do cadastro: `cargos` não é cargo

O escopo pede **"Cargo (lista do banco de dados)"**. A tabela `cargos` existe, com 12 linhas:

```
GEO | FINANCEIRO | COMPRAS | RH | AUXILIAR ADMIN | MARKETING
ADVOGADO | ENGENHEIRO | VENDEDOR | DP | A DEFINIR | DIRETOR
```

Isso é **setor administrativo**, não cargo de obra. O cargo real dos 137 colaboradores está em
`rh_colaboradores.cargo`, que é **texto livre** (`varchar(120)`), com **21 valores distintos** e
inconsistência de grafia:

| Cargo | Qtd |
|---|---|
| `AUXILIAR DE OBRAS` | 35 |
| `OFICIAL` | 19 |
| `Oficial Pleno` | 16 |
| `AJUDANTE PRATICO` | 15 |
| `PEDREIRO` | 14 |

A grafia é inconsistente — uns em caixa alta, outros em caixa mista. **Mas conferi: normalizando
acento, espaço e caixa, os 21 continuam 21 — nenhuma duplicata semântica.** `OFICIAL` e
`Oficial Pleno` são cargos diferentes de verdade, não a mesma coisa escrita de dois jeitos.

Isso simplifica o trabalho: a lista nasce com os 21, sem fusão automática. Dois pares merecem
decisão humana depois, na tela, e **não por script**:

- `ALMOXARIFE DE OBRAS` × `ALMOXARIFE DE OBRAS NIVEL I`
- `SECRETARIO (A)` × `SECRETARIA(O) NIVEL I`

O mapeamento dos 137 colaboradores para a lista vai **por script de dados, não por migration**
(Regra 5).

## 4. O catálogo de documentos precisa de um eixo novo

`rh_documentos_tipos` tem **10 tipos**, e a obrigatoriedade é decidida **só por `tipo_vinculo`**
(CLT / NÃO CLT). O escopo pede quatro checklists diferentes, um por tipo de solicitação:

| Checklist | Itens | Já existem |
|---|---|---|
| Admissão | 12 | 4 (RG, CPF, CTPS, ASO) |
| Movimentações | 4 | 1 (ASO) |
| Demissão | 5 | 0 |
| Pagamento de Mão de Obra | 6 | 1 (Outros) |
| **Total** | **27** | **5 reaproveitáveis** |

Faltam ~22 tipos. E, mais importante: **RG é obrigatório na admissão e irrelevante no pagamento**.
A tabela hoje não sabe dizer isso — falta o eixo "para qual tipo de solicitação", e falta a
distinção entre **obrigatório**, **condicional** ("quando aplicável") e **opcional**.

---

## 5. Gap por item

### Item 8 — Admissão

Existe como tipo `ADMISSAO`, mas a validação de hoje cobra **3 campos**: nome, CPF e obra. O escopo
pede **14**.

| Campo do escopo | Estado |
|---|---|
| Obra, Nome completo, CPF | **existe e é cobrado** |
| Telefone, E-mail, Cargo, Salário, Tipo de contratação, Data de admissão | coluna existe em `rh_colaboradores`, **não é cobrada no pedido** |
| **Nome dos pais** | **não existe** |
| **Endereço** | **não existe** |
| **Dados bancários + chave PIX** | **não existe** no colaborador |
| **Carga horária** | **não existe** |
| **Responsável pela contratação** | **não existe** |
| Cargo como lista | hoje é texto livre — ver item 3 |
| Tipo de contratação com 5 valores | hoje `varchar(20)` livre; escopo fixa CLT / Experiência / Prazo determinado / Aprendiz / Estagiário |

"Cria carteira de colaboradores por obra" **já funciona** — é o vínculo colaborador × obra × vigência
da Fase 1.

### Item 9 — Movimentações

**O tipo não existe.** É o maior bloco novo. E ele **absorve dois tipos que já existem** como
primeiro nível: `TROCA_OBRA` (4 registros) e `ALTERACAO_SALARIAL`.

| Subtipo | Estado |
|---|---|
| Atestado | **novo** |
| Férias | **novo** |
| Retorno de afastamento | **novo** |
| Alteração salarial | **existe como tipo próprio** — vira subtipo |
| Alteração de cargo/função | **novo** (com verificação de necessidade de ASO) |
| Transferência de obra | **existe como `TROCA_OBRA`** — vira subtipo |

Falta também o **cálculo automático de dias de afastamento** (data inicial, data final, quantidade).

> Os 4 registros `TROCA_OBRA` existentes precisam virar `MOVIMENTACAO` + subtipo `TRANSFERENCIA_OBRA`.
> São 4 linhas, em ambiente de teste — **script de dados**, nunca migration.

### Item 10 — Demissão

Existe, parcial. Hoje só valida aviso prévio.

| Campo do escopo | Estado |
|---|---|
| Obra, Colaborador, Data de desligamento | existe |
| Cargo e Data de admissão automáticos | dado existe, **não é exibido no pedido** |
| **Motivo do desligamento (6 opções)** | **não existe** |
| **Acordo entre as partes → justificativa + valor acordado obrigatórios** | **não existe** |
| **Último dia trabalhado** | **não existe** (hoje só há data de desligamento) |
| Aviso prévio trabalhado/indenizado | **existe e é validado** |
| **Solicitado pela empresa ou pelo colaborador** | **não existe** |
| **Alerta de férias vencidas / apontamentos pendentes** | **não existe** — e não há registro de férias hoje; **depende do subtipo Férias do item 9** |

### Item 11 — Pagamento de Mão de Obra

A base existe (aba Jornada + Apuração). Faltam campos e o fechamento.

| Campo do escopo | Estado |
|---|---|
| Colaboradores ativos da obra, Dias trabalhados, Faltas, Horas extras, Observações | **existe** |
| Descontos diversos, Bonificações | existe como **`acrescimos` / `descontos` genéricos** — o escopo pede separados |
| **Adicional noturno** | **não existe** |
| **Adicional de insalubridade** | **não existe** |
| **Adicional de periculosidade** | **não existe** |
| **Competência (mês/ano)** | existe na apuração, **não no formulário** |
| **Período trabalhado** | **não existe** |
| **Data prevista para pagamento** | **não existe** |
| Salário base, proporcional, desconto por faltas, valor de HE, líquido | **existe** no cálculo da apuração |
| **Valor dos adicionais** | **não existe** |
| **Planilha-resumo para conferência** | **não existe** |

---

## 6. Decisões que dependem de você

### Decisão 1 — o que acontece com os 919 registros do módulo principal

| Opção | Efeito |
|---|---|
| **A. DP passa a ser a porta e os tipos antigos são desativados** | fluxo novo limpo; os 919 continuam legíveis no histórico, mas **não migram** para o DP |
| **B. Migrar o histórico para o DP** | relatório único; exige mapear 919 registros de estrutura livre para campos tipados — **caro e arriscado** |
| **C. Conviver: os dois abertos** | evita decisão agora, mas cria **duas portas para o mesmo pedido**, que é o problema que este módulo veio resolver |

**Recomendo A.** O escopo diz que essas solicitações "serão tratadas no módulo Departamento
Pessoal" — o histórico antigo é consulta, não fluxo vivo. Desativar tipo não apaga registro.

### Decisão 2 — a força do checklist

Confirmar a leitura de duas camadas da seção 2: **obrigatória trava no envio**, **checklist marcado
trava na conclusão**. Se a intenção for travar tudo sempre, o ASO deixa de poder sair depois do
pedido, e isso muda a operação da obra — precisa ser dito com todas as letras.

### Decisão 3 — a lista de cargos

| Opção | Efeito |
|---|---|
| **A. Tabela nova `rh_cargos`** | separa cargo de obra do setor administrativo; script mapeia os 21 valores atuais |
| **B. Reaproveitar `cargos`** | mistura `PEDREIRO` com `FINANCEIRO` e `DIRETOR` na mesma lista |

**Recomendo A.**

---

## 7. Fases propostas

Cada fase entrega algo utilizável e tem suíte própria, como as Fases 1 a 6.

| Fase | Entrega | Depende de |
|---|---|---|
| **7** | Catálogo: `rh_cargos`, os ~22 tipos de documento, e o eixo "documento × tipo de solicitação × obrigatoriedade" | Decisões 2 e 3 |
| **8** | Cadastro do colaborador completo: pais, endereço, dados bancários + PIX, carga horária, responsável | Fase 7 |
| **9** | Admissão com os 14 campos e o checklist que trava | Fases 7 e 8 |
| **10** | Movimentações com os 6 subtipos, absorvendo `TROCA_OBRA` e `ALTERACAO_SALARIAL`, com cálculo de dias | Fase 7 |
| **11** | Demissão completa: motivo, último dia, quem pediu, alerta de férias vencidas | Fase 10 (o alerta precisa do subtipo Férias) |
| **12** | Pagamento: adicionais separados, competência, período, data prevista, planilha-resumo | Fase 7 |

A ordem não é negociável em dois pontos: **a Fase 7 vem primeiro** porque as outras quatro cobram
checklist, e **a Fase 11 vem depois da 10** porque o alerta de férias vencidas não tem de onde ler
férias antes do subtipo existir.

## 8. O que não muda

- Nenhuma página nova, nenhuma entrada nova de menu — tudo dentro de `RH/DP > Pessoal`.
- Os ícones da coluna de ações continuam sendo a porta de entrada por colaborador.
- Admissão continua acima da tabela.
- Todo formulário continua em modal.
- Toda migration mexe **só em estrutura**; os 4 `TROCA_OBRA` e os 21 cargos em texto livre vão em
  **script de dados** com `--conferir`, fora da cadeia de migrations (Regra 5).
- Migrations novas na faixa **`0050+`** (Regra 3).
