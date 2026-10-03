# Consulta completa de apropriações nos campos de seleção

## Objetivo

Adicionar um ícone de lupa profissional ao final dos campos de apropriação. A
lupa abre um modal com todas as opções disponíveis para a obra e para o nível de
apropriação já configurado, com pesquisa e rolagem vertical e horizontal.

## Implementação

- `frontend/src/components/ui/ApropriacaoAutocomplete.jsx`
  - lupa incorporada ao campo compartilhado;
  - modal reutilizável com código, descrição, tipo e ação de seleção;
  - pesquisa por código, descrição ou tipo;
  - tabela com cabeçalho fixo, largura mínima e contêiner com `overflow: auto`;
  - seleção no modal mantém o mesmo `onChange` do autocomplete;
  - modal e lista suspensa não permanecem abertos quando o campo é desabilitado;
  - propriedades `mostrarConsultaCompleta` e `tituloConsulta` para usos especiais.
- Seletores antigos convertidos para o componente compartilhado:
  - `frontend/src/pages/ContratoFluxoNovo.jsx`;
  - `frontend/src/pages/FinanceiroTituloNovo.jsx`;
  - `frontend/src/pages/FinanceiroTituloEditar.jsx`;
  - `frontend/src/pages/GestaoContratos.jsx`;
  - `frontend/src/modules/solicitacao-compra/pages/GestaoApropriacoes.jsx`.
- Usos genéricos do componente, que não selecionam apropriação, foram marcados
  com `mostrarConsultaCompleta={false}`:
  - obra no formulário compartilhado de compras;
  - contrato na nova solicitação;
  - categoria financeira nas ações do contrato;
  - wrapper `ObraAutocomplete`.

Os formulários que já usavam `ApropriacaoAutocomplete` receberam a lupa sem
alteração individual: nova solicitação, detalhe da solicitação, solicitação de
compra, detalhe da compra, rateio de contrato e prestação de contas de cartão.

## Segurança e regras preservadas

- Nenhum endpoint, permissão ou regra de gravação foi alterado.
- O modal usa exatamente a lista já carregada pelo campo. Portanto, mantém o
  acesso às obras e o nível Etapa/Serviço/Subserviço/Personalizado aplicados pelo
  backend.
- Campos de obra, contrato e categoria financeira que reutilizam o autocomplete
  não exibem indevidamente a consulta de apropriações.
- O modal não fecha ao clicar em área vazia; fecha por `Esc` ou pelo ícone próprio.

## Validações executadas

- `npm run build`: aprovado.
- `npm run test:apropriacao-compra`: aprovado.
- provas de fechamento por `Esc`, propagação do portal e dimensões dos modais:
  aprovadas.
- `git diff --check`: aprovado.
- `validarLayout.mjs`: o novo componente não introduziu violação. A verificação
  geral continua acusando 14 pendências preexistentes em outros trechos da árvore.

## Atenção para o futuro commit isolado

A árvore contém alterações anteriores não relacionadas. Em especial,
`NovaSolicitacaoCompra.jsx` já estava modificado por outro fluxo; deve ser incluído
somente o pequeno hunk de `mostrarConsultaCompleta={false}`. O mesmo cuidado vale
para `docs/workspace/OWNERSHIP_ATIVO.md`, que reúne registros anteriores.

Ainda não houve commit, push, deploy, migration ou acesso à EC2/RDS nesta etapa.
