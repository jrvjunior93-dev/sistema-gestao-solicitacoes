# Decisões pendentes do cliente — Etapa A

Lista exigida pela Parte 7 do processo. Nada aqui foi feito por conta
própria; cada item aguarda o seu ok (Parte 5: remover ou reestruturar
exige aprovação).

## RESOLVIDO — migração de todas as tabelas (Opção A aprovada)

Você aprovou a Opção A: inventário concluído e **todas** as tabelas
migradas antes de qualquer outra coisa. Em execução por ondas de agentes
paralelos; o estado real de cada arquivo é recalculado por
`frontend/scripts/qa-preview/atualizarInventario.mjs` — a coluna "Situação"
do `docs/INVENTARIO-TABELAS.md` nunca é escrita à mão.

---

## 1. Tabelas que NÃO migram sem perder comportamento

O componente padrão (`TabelaPadrao`) não cobre estes casos. Migrar
significaria remover funcionalidade que hoje existe — por isso pararam
aqui em vez de virarem migração silenciosa com perda.

### 1.1 Confirmados durante a migração (motivo técnico verificado no código)

A migração cobriu **108 arquivos**. As tabelas abaixo pararam aqui porque
migrar significaria REMOVER funcionalidade que hoje existe. Agrupadas pelo
que falta no componente:

**Ordenação por clique no cabeçalho** (no padrão o `<th>` já é o botão de
alinhamento/redimensionamento — os dois não cabem no mesmo lugar):
`GestaoContratos` (principal), `ProvisionamentosFinanceiros`,
`SolicitacoesRelatorioOperacional` (só a de acertividade; as outras 10
migraram), `ComercialContratos`.

**Colunas escolhidas pelo usuário / reordenáveis**:
`FinanceiroTitulos` (principal — soma ainda checkbox de lote no cabeçalho e
três estados de vazio distintos), `FinanceiroRelatorioAnalitico`
(reordenação por arrastar), `ProvisionamentosFinanceiros`,
`GerenciarCotacaoSolicitacao` (colunas por fornecedor),
`RhDpImportacoes` (colunas vindas do arquivo importado).

**Checkbox "selecionar todos" no cabeçalho**: `ConversasEntrada`,
`ConversasSaida`.

**Linha que não é uma linha simples** (expansível, agrupadora ou com
colSpan estrutural): `SolicitacaoCompraDetalheView` (duas `<tr>` por item),
`CrRealizadoView` (linha de grupo com colSpan + dois vazios distintos),
`FinanceiroDre` (árvore com sub-tabela), `FinanceiroConciliacao` (tabelas
espelhadas com seleção cruzada).

**Edição inline pesada / entrada de dados, não listagem**:
`NovaSolicitacaoCompra`, `CrPlanejamentoView`, `FinanceiroChequesTerceiros`,
`RhDpJornada`.

**Outros**: `TabelaSolicitacoes` (tabela principal do sistema, com
redimensionamento próprio integrado à ListaAvancada),
`CotacaoFornecedorPublica` (tela pública sem login, layout próprio),
`AuditoriaOperacional` — este migrou, mas **perdeu a primeira coluna fixa
(sticky)**: numa tabela financeira larga é o que permite saber de qual
linha se está lendo o número.

**A decisão**: (a) manter estas como exceções registradas — a matriz marca
T2/T3 como N/A justificado; ou (b) eu estendo o `TabelaPadrao` para cobrir
o conjunto (ordenação, colunas do usuário, seleção no cabeçalho, linha
expansível/agrupadora, coluna fixa) e aí elas migram de uma vez. A (b) é
trabalho de COMPONENTE, não de tela: afeta todas as tabelas do sistema, e
eu faria como leva própria com a matriz cobrindo a regressão. Recomendo
(b) — são 20 telas, o mesmo conjunto de cinco capacidades se repete, e
deixar exceção permanente é o que faz a regra virar letra morta.

### 1.2 Fora do escopo por natureza (não são decisão, só registro)

- `RevisarSolicitacaoCompra.jsx`: a `<table>` está dentro de uma **string
  HTML** do documento gerado para pré-visualização/PDF (`srcDoc` do
  iframe) — não é tabela React.
- `SolicitacoesRelatorioOperacional`: o heatmap é CSS grid, não tabela.
- Os dois componentes de infraestrutura (`ResizableTable`, `ListaAvancada`)
  contêm `<table>` por definição — é o que eles implementam.

## 2. Adaptações de interface feitas na migração (reorganização, não remoção)

Preciso do seu aval sobre estas — nenhuma perdeu informação, mas mudaram
onde o controle aparece:

1. **"Selecionar todos" saiu do cabeçalho da tabela** em Pagamentos,
   Boletos e Solicitações de Compra. Motivo: no padrão, o `<th>` é o botão
   de alinhamento/redimensionamento (R14/R15) — checkbox ali brigaria com a
   affordance. Passou para logo acima da tabela, com rótulo visível e os
   mesmos handlers.
2. **Destaque de linha** que era cor de fundo (`bg-blue-50` de linha
   selecionada, âmbar de linha bloqueada, `opacity-50` de registro inativo)
   virou o mecanismo do componente: tarja lateral (`urgencia()`) ou realce
   na coluna de identificação. A informação de estado continua visível e
   também segue na coluna Status.
3. **Listas móveis duplicadas removidas** em ~15 telas (Compras,
   Financeiro, Custos & Recebíveis): existia um segundo markup `md:hidden`
   de cards repetindo os mesmos dados. O padrão gera os cards a partir das
   MESMAS colunas — um markup só (regra de COMPONENTES-PADRAO). Nenhum
   campo sumiu; onde um dado só existia no card (a classificação da obra em
   Custos & Recebíveis), ele virou coluna e passou a aparecer também no
   desktop.

4. **Larguras de coluna salvas por usuário se perderam** em duas telas
   (relatório operacional fiscal e de provisões): as `storageKey` seguiam um
   padrão antigo e foram renomeadas. As tabelas voltam à largura padrão do
   tipo e o usuário reajusta se quiser. É a única perda de estado da
   migração.

5. **Tom de fundo das linhas somadoras** saiu no `CrPlanoWorkspace` — a
   distinção continua pelo recuo da hierarquia, mas era um sinal a mais.

Se qualquer uma dessas três te desagradar, eu reverto — são reversíveis e
localizadas.

## 3. Código morto com tabela (5 arquivos) — aguarda ok para REMOVER

`pages/Cargos.jsx`, `pages/TiposMacroContrato.jsx`,
`solicitacao-compra/pages/SolicitacaoCompraDetalhe.jsx` (substituída pela
View), `components/ObraSearchModal.jsx`, `components/SolicitacaoTable.jsx` —
sem rota nem uso. Recomendo remover em vez de migrar; remover exige seu ok
explícito (Parte 5). Enquanto não decidir, ficam como estão e fora da
migração.

## 4. Pivô ObraTipoApropriacao

Único caso já registrado em `excecoes_tabela_crua`: colunas dinâmicas com
painel por célula. T2/T3 estão como N/A justificado na matriz. **Decida**:
manter a exceção ou redesenhar o pivô numa leva futura.

## 5. "Abrir solicitação" no detalhe do título financeiro

É link para registro relacionado na barra de ações. Com o check C6
corrigido (botão de ação nunca é navegação; só link para OUTRA rota
reprova), este caso é o único que ainda cai na regra. Está como N/A
registrado na matriz apontando para este item. **Decida**: fica como está
(e eu documento a exceção na R11), ou registros relacionados passam a
aparecer de outra forma.

## 6. Parceiros com painel acima da lista (não modal)

Decisão registrada em R9 (cadastro de uso frequente). O item R1 da DoD
está como N/A registrado para essa tela. **Confirme** que segue valendo.
