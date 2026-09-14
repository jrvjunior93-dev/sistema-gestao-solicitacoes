# Comercial — contratos responsivos e vencimento sincronizado

## Objetivo

Corrigir a divergência em que a edição do vencimento de um título aparecia no Financeiro,
mas o contrato continuava calculando o valor vencido e a sugestão de inadimplência com a
data antiga da parcela. Reorganizar também a tela de Contratos de Venda antes de avaliar um
recorte isolado para produção.

## Causa e regra aplicada

- `calcularIndicadoresFinanceirosContrato` priorizava `parcela.data_vencimento`.
- A edição comum do título altera `titulos_financeiros.data_vencimento`, mas não atualizava
  `contratos_comerciais_parcelas.data_vencimento`.
- O título agora é a fonte operacional de vencimento, status e saldo.
- Depois de editar o título, a data espelhada da parcela é sincronizada em transação.
- Todos os títulos do contrato são recalculados e o status comercial é atualizado entre
  `ATIVO`, `INADIMPLENTE` e `QUITADO`.
- `RASCUNHO`, `DISTRATADO` e `CANCELADO` são preservados.
- Mudança automática de status gera evento no histórico do contrato.

## Organização da tela

- formulário de cadastro recolhível com preferência persistente;
- grade inicial estável para empreendimento, comprador e múltiplas unidades;
- resumo financeiro agrupado, sem quatro cards repetitivos;
- dados de corretagem compactados numa única faixa;
- ações e documentos empilham no celular e voltam a toolbar em telas maiores;
- vencimento exibido na parcela acompanha o título financeiro.

## Arquivos alterados

- `backend/src/services/comercialService.js`
- `backend/src/services/tituloFinanceiroService.js`
- `backend/scripts/validarComercialTituloVencimento.js`
- `backend/package.json`
- `frontend/src/pages/ComercialContratos.jsx`
- `docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`

## Validações executadas

- `node --check` nos dois serviços e no teste novo: aprovado;
- carregamento conjunto dos serviços: aprovado, sem dependência circular;
- `npm run test:comercial-titulo-vencimento`: aprovado;
- `npm run test:comercial-importacao-sienge`: aprovado;
- `npm run test:filtro-valor-titulos`: aprovado;
- `npm run build` do frontend: aprovado;
- verificador mecânico: nenhum novo erro em `ComercialContratos.jsx`; permanecem seis
  falhas preexistentes e alheias a este escopo na base `origin/refactor/frontend`.

## Avaliação do commit isolado para produção

É possível produzir um único commit comercial, mas não é seguro fazer cherry-pick direto do
commit `727093e8` nem dos commits visuais posteriores. `main` não possui os componentes padrão
usados pela tela atual, e as rodadas de responsividade alteram vários módulos ao mesmo tempo.

Próximo passo após homologação em dev: abrir uma worktree a partir de `origin/main`, portar
somente as dependências comerciais necessárias, adaptar o frontend ao shell da produção,
executar migration e backfill em cópia controlada e criar um commit consolidado de release.

## Banco e operação

Esta correção de vencimento não exige migration. A funcionalidade multiunidade que se deseja
promover depois exige migration e simulação do backfill; nenhuma escrita em produção foi
executada nesta tarefa.
