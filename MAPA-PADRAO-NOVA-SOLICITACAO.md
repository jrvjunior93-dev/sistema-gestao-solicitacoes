# Mapa do padrão da Nova Solicitação — base da integração D38

Levantado ANTES de codar (regra do projeto), com âncoras de linha reais em
`frontend/src/pages/NovaSolicitacao.jsx` (2.260 linhas).

## O pipeline do tipo selecionado

1. **`comportamentoTipo`** (linha 408): `getTipoSolicitacaoBehavior(tipoSelecionado)` lê o
   JSON `comportamento` do tipo e `applyTipoSolicitacaoModuleAvailability` corta o que o
   módulo desligado não permite. **É AQUI que o tipo CONTRATO liga seus blocos.**
2. **Regras por config** (linha 425): `camposNovaSolicitacaoConfig.regras` (da tela
   `nova-solicitacao-campos`) sobrepõe exibição/obrigatoriedade por tipo — via
   `campoObrigatorio(...)`. Campos novos do wireframe devem registrar-se aí, não em `if`s.
3. **Derivação de modo** (linha 437): `solicitacaoCompra = !mostrar_apropriacao_principal &&
   !mostrar_valor` — o padrão já deriva "modos" de tela por combinação de flags, sem nome
   de tipo hardcoded. O fluxo novo de contrato segue o mesmo estilo (flag própria no
   comportamento, ex.: `usa_fluxo_contrato_novo`).
4. **Subtipos** (linhas 8/130/234): `getTiposSubContrato` carrega de `tipos_sub_contrato`;
   trocar o tipo zera `tipo_sub_id`. Com `mostrar_subtipo` ligado, o select aparece sozinho.
   Os 3 subtipos do CONTRATO entram por cadastro (D38-a), e o fluxo deriva do subtipo
   selecionado por **id vinculado**, nunca por nome.
5. **Automação de destino** (linhas 129/1301): redireciona tipo→tela mantendo obra, com
   guarda de execução única. Não será usada para o CONTRATO (a tela é a própria).

## Como o wireframe 1 entra (sem paralelo)

| Bloco do wireframe | Mecanismo |
|---|---|
| Aparecer só no tipo CONTRATO | flag nova no JSON `comportamento` (ex.: `mostrar_parcelas_contrato`) |
| Subtipo (3 opções) | `mostrar_subtipo`/`exige_subtipo` + cadastro em `tipos_sub_contrato` |
| Campos categoria/forma/parcelas | registrados em `nova-solicitacao-campos` (regras), componentes portados de `ContratoFluxoNovo.jsx` |
| Submit | quando tipo=CONTRATO, `POST /contratos/fluxo-novo` (auditado) em vez do submit padrão |

## Riscos mapeados

- A tela é monolítica: portar como **componentes isolados** (BlocoParcelasContrato etc.)
  montados condicionalmente, minimizando o diff no arquivo grande
- Regressão: baseline dos 4 tipos mais usados antes/depois (ADM 996, Compra 706,
  Medição 665, Mão de Obra 613) — o comparador de `qa/baseline` cobre
- Limpar duplicidades de `tipos_sub_contrato` (A3) antes do cadastro novo

## Portões da integração — VERIFICADOS (17/08)

1. **A flag sobrevive**: `getTipoSolicitacaoBehavior` faz `...defaults, ...legacy, ...parsed`
   com o JSON do banco POR ÚLTIMO — `usa_fluxo_contrato_novo: true` chega intacta ao
   `comportamentoTipo`. O gancho da integração é `comportamentoTipo.usa_fluxo_contrato_novo`.
2. **Subtipos já funcionam SEM código**: a tela chama
   `getTiposSubContrato({ tipo_macro_id: form.tipo_solicitacao_id })` (linha 239) — ao
   selecionar CONTRATO (id 33), os 3 subtipos do seed aparecem sozinhos, e ADM LOCAL DE
   OBRA mantém os dele. A semântica D38-b encaixou direto no padrão existente.

### O que resta implementar (próxima sessão)

Em `NovaSolicitacao.jsx`, condicionado a `comportamentoTipo.usa_fluxo_contrato_novo`:
- Bloco de parcelas (categoria curada, forma de pagamento, qtde, 1º vencimento, prévia
  editável com redistribuição, saldo) — portar de `ContratoFluxoNovo.jsx` como componente
  isolado (ex.: `frontend/src/components/contratos/BlocoContratoFluxoNovo.jsx`)
- Submit condicional: `POST /contratos/fluxo-novo` (auditado) no lugar do submit padrão
- Depois: baseline dos 4 tipos mais usados antes/depois + auditoria pelo caminho real
