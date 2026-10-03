# Inventário dos relatórios + o que merece virar painel

Data: 25/08/2026. Levantamento **read-only** — nenhuma linha alterada.

Serve para responder duas perguntas antes de desenhar qualquer BI:
**o que já existe?** e **quais poucos números realmente mandam?**

---

## 1. A descoberta que muda a prioridade

O áudio de 24/08 dizia: *"não encontrei quanto tem de custo numa obra, detalhado, item a item,
apropriado (...) talvez é porque o meu usuário não está permitido."*

**A suspeita dele estava certa.** O relatório existe, funciona, e foi conferido na tela:

`/financeiro/relatorios/resultado-obras` mostra, **por obra**: VGV, planilha geral, margem de custo
esperada, **executado (pago) contra empenhado**, recebido, falta a receber e **lucro/prejuízo**.

E há o irmão dele por centro de custo — `/financeiro/relatorios/centros-custo` — que é o recorte
"item a item".

### Quem tem acesso hoje: 5 de 30 usuários configurados

| Usuário | Setor |
|---|---|
| liz.jabor | GEO |
| savio.leal | **DIRETORIA** |
| financeiro | FINANCEIRO |
| breno.lopes | GEO |
| filipemachado612 | FINANCEIRO |

**E quem não tem, apesar do cargo:**

- `administracao@cscconstrutora.com` — setor **DIRETORIA**
- `natamaia@cscconstrutora.com` — **DIRETORIA DE OBRAS PÚBLICAS**
- todos os usuários de **OBRA**

> Isso parece **descuido de configuração**, não decisão — dois diretores sem acesso ao resultado das
> obras. Verificar antes de concluir. A permissão é `financeiro.relatorios.resultado_obras`.

**Consequência para o BI:** ele deixa de ser *"construir os relatórios que faltam"* e passa a ser
*"reunir num painel o que já existe"*. Trabalho muito menor.

---

## 2. O inventário — 30 relatórios, por pergunta que respondem

### 2.1 Financeiro — resultado e custo (os candidatos naturais a painel)

| Rota | Pergunta que responde | Painel? |
|---|---|---|
| `resultado-obras` | Cada obra está dando lucro ou prejuízo? | ⭐ **sim** |
| `centros-custo` | O mesmo, por centro de custo / item | ⭐ **sim** |
| `financeiro-obras` | Cada pagamento de cada obra, linha a linha (com os arquivos, item 22) | detalhe, não cartão |
| `dre` | Resultado gerencial do período | ⭐ **sim** |
| `dre/comparativo` | Como foi mês a mês | ⭐ **sim** (série temporal) |
| `dre/empresas` | Qual empresa do grupo puxa o resultado | sim, secundário |
| `dre/diagnostico` | O que está mal classificado na DRE | não — é ferramenta de saneamento |
| `grupo-consolidado` | O grupo inteiro numa linha | ⭐ **sim** |

### 2.2 Financeiro — caixa e dívida

| Rota | Pergunta | Painel? |
|---|---|---|
| `fluxo-caixa` | Quanto entra e sai, e quando | ⭐ **sim** |
| `fluxo-consolidado` | O mesmo, somando as empresas | sim, secundário |
| `endividamento` | Quanto devemos, **quanto está vencido**, o que vence em 30 dias | ⭐ **sim** — já devolve `saldo_vencido`, `saldo_30_dias`, `credito_rotativo_saldo` |
| `movimentacao-contas` | O que passou em cada conta bancária | detalhe |
| `conciliacao-contas` | O extrato bate com o sistema? | detalhe |
| `intercompany` | Quem deve a quem dentro do grupo | sim, secundário |
| `analitico` | Consulta livre de títulos | detalhe |

### 2.3 Compras — 11 relatórios

| Rota | Pergunta |
|---|---|
| `evolucao` | Como as compras evoluíram no tempo — ⭐ candidato |
| `economia-cotacoes` | Quanto a cotação economizou — ⭐ candidato (número que vende o processo) |
| `ciclo` | Quanto tempo leva do pedido à entrega — ⭐ candidato |
| `pendencias-cotacoes` | O que está parado esperando cotação — ⭐ candidato (alerta) |
| `demanda-pedidos` | O que as obras estão pedindo |
| `compras-fornecedor` · `fornecedores` | Concentração por fornecedor |
| `precos-insumos` | Preço do mesmo insumo entre fornecedores |
| `categorias-insumos` | Em que se gasta |
| `compras-diretas` | O que saiu fora do processo de cotação |
| `auditoria-itens-pedido` | Conferência item a item |

### 2.4 Operacionais por módulo

| Rota | Pergunta |
|---|---|
| `solicitacoes/relatorios/operacional` | Quantas solicitações, em que status, por setor — ⭐ candidato |
| `contratos/relatorios/operacional` | Situação da carteira de contratos — ⭐ candidato |
| `comercial/relatorios/operacional` | Funil comercial |
| `rh/relatorios/operacional` | Quadro de pessoal |

---

## 3. O que um painel deve ser — e o que ele não deve ser

**Um BI bom não é os 30 relatórios numa tela.** É a resposta de poucas perguntas, e um caminho
rápido para o detalhe quando a resposta assusta.

As perguntas que os áudios efetivamente fazem:

1. **Cada obra está dando lucro ou prejuízo?** → `resultado-obras`
2. **Quanto já gastei de quanto previ, por etapa?** → `centros-custo`
3. **Quanto devo, e quanto está vencido?** → `endividamento`
4. **Como está o caixa?** → `fluxo-caixa`
5. **Quanto custa minha mão de obra, por obra?** → **ainda não existe** (é o módulo RH/DP)

A quinta é a única sem resposta hoje — e é justamente a que o áudio chama de mais importante que o
estoque.

### Proposta de estrutura

**Faixa de cima — 4 números, o estado do negócio:**
resultado consolidado do período · saldo devedor com o quanto está vencido · posição de caixa ·
obras no vermelho (contagem)

**Meio — 2 gráficos:**
DRE mês a mês (série temporal, de `dre/comparativo`) · resultado por obra (barras, de
`resultado-obras`), com o vermelho saltando

**Baixo — o que exige ação:**
obras com prejuízo · títulos vencidos · cotações pendentes · contratos aguardando decisão

**Cada cartão leva ao relatório que o originou.** O painel responde; o relatório explica.

---

## 4. A decisão técnica que falta

**O projeto não tem biblioteca de gráficos.** Verifiquei: nem recharts, nem chart.js, apexcharts,
echarts, nivo, victory ou d3. O `Dashboard.jsx` atual não tem um `<svg>` sequer — **tudo é tabela**.

| Caminho | A favor | Contra |
|---|---|---|
| **Instalar `recharts`** | padrão em React, declarativo, responsivo, resultado profissional rápido | primeira dependência de UI nova; precisa baixar pacote, e o ambiente é declaradamente offline |
| **SVG puro** | zero dependência | muito mais trabalho, e limita o que é viável |

O cliente sinalizou *"provavelmente vamos baixar a biblioteca"*. Quando confirmar, `recharts` é a
escolha — e ela precisa entrar em `MIGRACAO-PARA-PRODUCAO.md`, porque dependência nova é coisa que
o deploy tem de saber.

---

## 5. O que eu recomendo, nesta ordem

1. **Conceder a permissão** `financeiro.relatorios.resultado_obras` a quem precisa — resolve **hoje**
   a preocupação mais urgente dos áudios, **sem código**. Confirmar antes: quem é o "Pedro" e por que
   dois diretores estão de fora;
2. **Confirmar a biblioteca** e instalá-la;
3. **Protótipo visual do painel primeiro**, para o cliente ver se é o "profissional e moderno" que
   ele tem em mente — antes de escrever código de produção;
4. Só então o painel de verdade, com mapa de impacto, como todo o resto.

> **Cuidado com `PERMISSOES_AREAS_USUARIOS`:** é versionada. A concessão do passo 1 tem de ser feita
> **editando a configuração atual**; inserir uma linha nova com um usuário só apaga a configuração
> de todos os outros. Já aconteceu neste projeto.
