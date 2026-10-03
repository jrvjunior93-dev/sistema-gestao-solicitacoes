# Varredura de TODO/FIXME em `frontend/src`

Data do levantamento: 05/09/2026.
Escopo: `frontend/src/**/*.jsx` e `frontend/src/**/*.js` (388 arquivos). Nenhum arquivo do repositório foi alterado — este documento é o único artefato desta tarefa.

## Resumo executivo

**Não existe nenhum item de dívida técnica marcado com TODO ou FIXME no código do frontend.** As "75 ocorrências" que motivaram este levantamento são um falso positivo de medição: o comando usado (`grep "TODO\|FIXME"`) encontra a sequência de letras T-O-D-O em qualquer lugar do texto, e o português tem a palavra **"todo/toda/todos/todas"** (que significa "inteiro" ou "cada um") espalhada em centenas de comentários e no próprio código (nomes de filtro como `'TODOS'`, `'TODOS_VISIVEIS'`). Nenhuma dessas 75 ocorrências é a marcação inglesa `// TODO:` que times usam para sinalizar trabalho pendente.

Conferido caractere por caractere:

| Verificação | Resultado |
|---|---|
| `grep "TODO\|FIXME"` (medição original) | 75 ocorrências |
| Das 75, quantas são a palavra portuguesa "TODOS" (maiúscula, valor de filtro/enum) | 69 |
| Das 6 restantes, quantas são a palavra portuguesa "todo/toda" (adjetivo "cada/inteiro") dentro de um comentário | 6 |
| Ocorrências reais de `// TODO`, `/* TODO */`, `@todo` (marcador de pendência) | **0** |
| Ocorrências de `FIXME` (qualquer grafia, case-insensitive, em todo o `frontend/src`) | **0** |

Comandos usados para confirmar (reproduzíveis):
```
grep -rn "TODO\|FIXME" frontend/src --include=*.jsx --include=*.js | wc -l          # 75
grep -rnE "\bTODO\b" frontend/src --include=*.jsx --include=*.js | grep -v TODOS    # 6, todos "todo X" em prosa
grep -rniE "\bFIXME\b" frontend/src --include=*.jsx --include=*.js                  # vazio
grep -rniE "@todo" frontend/src --include=*.jsx --include=*.js                      # vazio
```

Os 6 casos que sobraram depois de filtrar "TODOS" foram lidos um a um, com o parágrafo ao redor, e nenhum é uma marcação de pendência — são frases como "TODO contrato exige..." (= "todo contrato", cada contrato exige), "`.input-moeda` em TODO campo de dinheiro" (= em todo campo, isto é, em cada campo), "TODO handler assíncrono" (= todo handler, cada handler), "TODO retorno de `confirmar()` é DESESTRUTURADO" (= todo retorno, cada retorno). São comentários técnicos legítimos e já resolvidos/descritivos, não bilhetes de dívida.

**Por categoria: 0 itens em cada uma das cinco categorias pedidas (JÁ RESOLVIDO, DÍVIDA REAL sem risco, DÍVIDA REAL com risco, ACHADO DE NEGÓCIO, RUÍDO).** Não há lista de risco nem achado de negócio a destacar nesta varredura, porque não há matéria-prima: o código não contém nenhum marcador real de TODO/FIXME.

Não há necessidade de criar/alimentar `docs/ACHADOS-DE-NEGOCIO.md` a partir desta varredura — o arquivo já existe no repositório (de trabalho anterior) e não foi tocado aqui.

## O que isso significa na prática

- O número "75" não deve circular como "75 pendências no código". É ruído de medição, não dívida técnica.
- Isso não prova que o frontend não tem dívida técnica ou risco — só prova que **essa forma específica de marcar dívida (comentário TODO/FIXME) não é usada neste projeto**. Muitos dos comentários longos lidos durante esta varredura (ex.: `BlocoContratoFluxoNovo.jsx:289`, `NovaSolicitacao.jsx:1655`, `SolicitacaoDetalhe/index.jsx:95`, `GerenciarCotacaoSolicitacao.jsx:77`) são, na verdade, registros de decisão e de risco já mitigado (ex.: alerta sobre desestruturação de `confirmar()` que poderia deixar "Cancelar" prosseguir com uma ação) — vale um levantamento à parte, com outro critério de busca (por exemplo "R21", "R6", "item 7", que são os códigos de regra usados nesses comentários), se o objetivo for mapear dívida/risco real do frontend.
- Se a intenção original era encontrar dívida técnica de fato, a busca precisa ser refeita com um critério que não colida com o português — por exemplo `grep -rnE "//\s*TODO\b|/\*\s*TODO\b|@todo\b"` (exige que TODO apareça logo depois do marcador de comentário) ou, mais simples, buscar em maiúsculas exatas seguidas de dois-pontos: `TODO:`/`FIXME:`. Rodando essa versão mais estrita o resultado também é zero.

## Detalhamento das 75 ocorrências originais (para auditoria)

### Grupo A — palavra "TODOS" (69 ocorrências)
Valor de enum/filtro (`'TODOS'`, `'TODOS_VISIVEIS'`) usado em selects de status, escopo de obras, modo de recebimento de solicitação, etc. Nenhuma relação com dívida técnica. Arquivos afetados (lista de arquivos, sem linha a linha por serem todos o mesmo padrão):

- `modules/custosRecebiveis/components/CrRealizadoView.jsx`
- `modules/solicitacao-compra/pages/PedidoCompraDetalhe.jsx`
- `modules/solicitacao-compra/pages/NovaSolicitacaoCompra.jsx`
- `services/contratos.js`
- `pages/ConfiguracoesNotificacoesSistema.jsx`
- `pages/FinanceiroTituloNovo.jsx`
- `pages/PermissoesSetor.jsx`
- `pages/FinanceiroDre.jsx`
- `pages/FinanceiroBoletos.jsx`
- `pages/FinanceiroRelatorios.jsx`
- `pages/SolicitacaoDetalhe/Pagamentos.jsx`
- `pages/SolicitacaoDetalhe/AcoesContrato.jsx`
- `pages/FinanceiroBaixas.jsx`
- `pages/ContratosRelatorioOperacional.jsx`
- `pages/FinanceiroRelatorioAnalitico.jsx`
- `pages/NovaSolicitacao.jsx`
- `pages/Solicitacoes/index.jsx`
- `pages/Solicitacoes/LinhaSolicitacao.jsx`
- `pages/FinanceiroConciliacao.jsx`
- `pages/FinanceiroTituloEditar.jsx`
- `pages/FinanceiroCaixas.jsx`
- `pages/TiposSolicitacaoPorSetor.jsx`
- `pages/TiposSolicitacao.jsx`
- `pages/ComportamentoRecebimentoSetor.jsx`
- `pages/UsuariosAcessoPrioridadeDiretoria.jsx`
- `pages/FinanceiroEndividamento.jsx`
- `pages/FinanceiroFluxoConsolidado.jsx`
- `pages/ContratoFluxoNovo.jsx`
- `pages/Obras.jsx`

### Grupo B — palavra "todo/TODO" (adjetivo "cada/inteiro", 6 ocorrências)

| Arquivo:linha | Texto | Confirmado como |
|---|---|---|
| `modules/solicitacao-compra/pages/GerenciarCotacaoSolicitacao.jsx:77` | "R21 — TODO retorno de `confirmar()` é DESESTRUTURADO" | Comentário de decisão de projeto já implementada (explica por que todo `const { ok } = await confirmar(...)` é desestruturado, para não tratar o objeto sempre truthy como confirmação). Não é pendência. |
| `components/contratos/BlocoContratoFluxoNovo.jsx:289` | "TODO contrato exige a negociacao detalhada, e nao so acima do limite (item 7, 23/08)" | Comentário sobre regra de negócio já aplicada duas linhas abaixo (`const exigeDetalhes = true;`). Não é pendência. |
| `pages/FinanceiroTituloNovo.jsx:1536` | "`.input-moeda` em TODO campo de dinheiro (R6...)" | Nota de padrão visual já aplicado (documenta convenção usada na tela). Não é pendência. |
| `pages/SolicitacaoDetalhe/FinanceiroCard.jsx:2281` | "R6 — TODO campo de dinheiro desta tela..." | Mesma nota de padrão visual, já aplicada. Não é pendência. |
| `pages/SolicitacaoDetalhe/index.jsx:95` | "que valem em TODO handler assíncrono deste arquivo" | Introdução de uma lista de regras de segurança já implementadas no arquivo (ex.: uso de `confirmar()` corretamente desestruturado). Não é pendência. |
| `pages/NovaSolicitacao.jsx:1655` | "A negociacao detalhada agora e documento e vale para TODO contrato (item 7, 23/08)" | Comentário sobre validação já implementada duas linhas abaixo (`if (!d.negociacao_arquivo) { avisar.alerta(...) }`). Não é pendência. |

Todas as seis linhas do Grupo B foram lidas com o código ao redor (não só a linha isolada) para confirmar que descrevem comportamento já implementado, e não trabalho pendente.

## Categorias pedidas (todas vazias — motivo acima)

### 1. JÁ RESOLVIDO
Nenhum item. (Os 6 comentários do Grupo B, embora não sejam marcadores de TODO, de fato descrevem decisões já resolvidas — ver tabela acima — mas não entram nesta lista porque a tarefa pede a classificação apenas de marcadores reais de TODO/FIXME, que não existem.)

### 2. DÍVIDA REAL, sem risco
Nenhum item.

### 3. DÍVIDA REAL, com risco
Nenhum item.

### 4. ACHADO DE NEGÓCIO
Nenhum item.

### 5. RUÍDO
Nenhum item.

## Recomendação

1. Corrigir a métrica de origem: "75 TODOs no frontend" é falso e não deve ser repetido em relatórios ou dashboards de dívida técnica.
2. Se o time quiser saber se há dívida técnica real "documentada em comentário", a busca precisa evitar a palavra portuguesa "todo". Duas opções testadas e com resultado zero:
   - `grep -rnE "//\s*TODO\b|/\*\s*TODO\b" frontend/src --include=*.jsx --include=*.js`
   - `grep -rn "TODO:" frontend/src --include=*.jsx --include=*.js`
3. Os comentários longos de "nota de reforma" encontrados durante esta varredura (identificados por códigos como `R6`, `R21`, `R19/R3`, `item 7`) parecem ser o padrão real deste projeto para registrar decisão e risco mitigado — não dívida pendente. Se houver interesse, uma nova varredura dedicada a esses códigos (não pedida nesta tarefa) poderia revelar dívida real ou achados de negócio com mais chance de sucesso do que a busca por TODO/FIXME.
