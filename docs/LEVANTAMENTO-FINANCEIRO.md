# LEVANTAMENTO — módulo FINANCEIRO

> **Medido em 03/09** contra o código atual, não contra o levantamento
> anterior. Números conferidos por script, não por leitura de memória.
> Levantamento antes de qualquer código, como em todas as levas.

## 1. O tamanho real

| | |
|---|---|
| Telas servidas por rota `/financeiro/*`, `/comprovantes/*` e `/custos-recebiveis` | **32** |
| Linhas de código somadas | **29.091** |
| Já migradas e no manifesto | **2** (`FinanceiroTituloDetalhe`, `UsuariosAcessoFinanceiro`) |
| Faltam | **30** |

É o maior módulo do sistema. Para comparação: o RH/DP tinha **9** telas e
levou **cinco** rodadas de revisão até o revisor aprovar.

## 2. O que JÁ está pronto — e é muito

Esta é a diferença mais importante em relação ao RH/DP, e ela muda o
tamanho do trabalho:

- **23 das 32 telas já usam `TabelaPadrao`.** Vieram da leva de migração de
  tabelas, que passou pelo sistema inteiro. As sete capacidades T1–T7 já
  estão lá.
- **Só 1 tela tem `<table>` cru**: `FinanceiroDre.jsx`. Uma, não trinta.
- **Cores cruas em hexadecimal: 47 no módulo inteiro**, quase todas
  concentradas. O levantamento anterior falava em "42 cores fixas na
  `FinanceiroBancos` e 49 na `FinanceiroBoletos`" — **estava errado**: eram
  classes `slate`, não hexadecimais. `FinanceiroBoletos` tem **1** hex e 49
  `slate`; `FinanceiroBancos` tem **0** hex e 42 `slate`. A correção muda o
  tipo de trabalho: trocar classe por token é mecânico e verificável; caçar
  hexadecimal espalhado, não.

**O que falta é o cabeçalho e a moldura**: apenas **2 das 32** usam
`<Pagina>`. As outras 30 escrevem a própria estrutura de página. É aí que
está o grosso da leva.

## 3. Passivo medido

| Item | Quantidade | Onde dói mais |
|---|---|---|
| Caixas do navegador (`alert`/`confirm`/`prompt`) | **22** | `ComprovantesPendentes` (8), `FinanceiroConciliacao` (4), `FinanceiroTitulos` (3), `FinanceiroPagamentos` (3) |
| Classes `slate` cruas | **306** | `FinanceiroBoletos` (49), `FinanceiroBancos` (42), `FinanceiroTituloDetalhe` (35), `FinanceiroTitulos` (26) |
| Cores em hexadecimal | **47** | espalhadas |
| Destinos de navegação à mão | **29** | `FinanceiroTitulos` (7), `FinanceiroTituloDetalhe` (4), `FinanceiroConciliacao` (3) |
| Telas sem `<Pagina>` | **30** | todas menos as 2 já migradas |

## 4. ACHADO QUE NÃO É DO FINANCEIRO — e é o mais grave deste levantamento

**`FinanceiroTituloDetalhe.jsx` está no manifesto, com matriz fechada, e tem
35 classes `slate` cruas.** Entre elas `text-slate-500`, que é `#64748b` —
**a mesma cor que reprovou AA na `DefinirSenha`** (4,34:1 sobre fundo claro,
contra o mínimo de 4,5:1).

Como isso passou: **o `validarLayout.mjs` não checa `slate`.** A M2 e a M3
existem na DoD, o harness mede contraste no preview real — mas o check
estático nunca olhou a classe. Durante as levas eu conferia `slate` por
`grep` manual, agente por agente; o que não é conferido por check não é
conferido.

Varri as 39 telas do manifesto: **2 têm cor crua** —
`FinanceiroTituloDetalhe` (35) e `ObraGestao` (1). Está contido, mas está lá.

**É a mesma família de "existia e ninguém sabia"**, e é a terceira vez que
ela aparece: o processo dependia de um passo humano que ninguém tinha
declarado como obrigatório.

**Proposta**: acrescentar `slate` (e as outras paletas cruas do Tailwind) ao
`validarLayout.mjs`, com trinco, ANTES de abrir a leva. E corrigir as duas
telas do manifesto, que são entrega antiga com defeito.

## 5. Telas compartilhadas que o Financeiro usa

Contadas de propósito, para não repetirmos o ponto cego de 03/09. **As oito
já foram migradas** na leva das compartilhadas, então nenhuma entra como
trabalho — mas ficam declaradas:

- `ComunicacaoInterna` — alcançável de dentro do Financeiro pelo menu.
- `Configuracoes` e as telas de configuração que ela indexa.
- `Login`, `RecuperarSenha`, `DefinirSenha` — todo usuário do Financeiro
  passa por elas.
- **O Financeiro NÃO usa a `ModuloRelatorios`**: tem hub próprio
  (`FinanceiroRelatorios`, 1.498 linhas). É a única exceção entre os módulos
  com relatórios, e continua verdadeira.

## 6. As três maiores, e o que fazer com elas

1. **`FinanceiroTitulos` (3.555 linhas)** — serve **três** rotas de menu
   (contas a receber, contas a pagar e uma terceira). Um arquivo, três
   entradas iguais.
2. **`FinanceiroConciliacao` (3.342 linhas)** — a maior tela do sistema.
   **Decidido (D1, 03/09): a leva NÃO unifica o fluxo**, aplica o padrão
   como está. A unificação e o alerta de conflito estão em
   `docs/PROPOSTA-UNIFICACAO-CONCILIACAO.md`, para decisão própria.
3. **`FinanceiroTituloNovo` (2.626) + `FinanceiroTituloEditar` (1.622)** —
   4.248 linhas em dois arquivos que são quase certamente o mesmo
   formulário. **Ainda não confirmei**: confirmo antes de propor qualquer
   unificação, e mesmo confirmado ela seria proposta separada, pela D1.

## 7. O que precisa de decisão sua

**D1 — Fatiar a leva.** 30 telas não cabem numa leva só. Proponho **quatro**,
cada uma com matriz e revisor próprios:

| | Recorte | Telas | Linhas aprox. |
|---|---|---|---|
| (a) | Núcleo de títulos | 5 | 11.100 |
| (b) | Operação (conciliação, pagamentos, baixas, boletos, DDA, cheques, caixas) | 9 | 8.300 |
| (c) | Relatórios e visões | 12 | 6.100 |
| (d) | Cadastros e comprovantes | 4 | 2.300 |

Aprova esse corte, ou prefere outro?

**D2 — `FinanceiroTitulos` em três rotas.** Vira uma tela com recorte
declarado (como Pessoal virou porta única), ou continuam três entradas?

**D3 — Novo × Editar título.** Se eu confirmar que são o mesmo formulário,
registro como proposta separada ou você quer decidir na hora?

**D4 — O check de `slate` antes da leva.** Proponho fechar essa porta antes
de abrir o módulo, porque 306 ocorrências entram na leva e sem check elas
saem por conferência manual — que é exatamente o que falhou.

## 8. Como as decisões anteriores se aplicam aqui

Já decididas, não precisam voltar:

- **D2 do Financeiro (03/09)**: telas de detalhe seguem ação → contexto →
  histórico.
- **D3**: todas as ações visíveis, com os três pesos.
- **D4**: em conflito entre densidade e conforto de leitura, vence a leitura.
- **R21**: nenhuma mudança de contrato de componente no meio da leva.
- **R23**: filtro aplica ao marcar; consulta cara (>3 requisições OU >2s)
  confirma com botão explícito.
