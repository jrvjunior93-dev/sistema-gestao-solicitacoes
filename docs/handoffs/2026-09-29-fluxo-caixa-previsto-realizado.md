# Fluxo de caixa previsto x realizado — 2026-09-29

## Objetivo

Separar a leitura de projeção da leitura de baixas efetivas no relatório de fluxo de caixa,
mantendo um comparativo temporalmente coerente entre planejado e realizado.

## Regras implementadas

- O previsto considera títulos `PREVISAO`, `ABERTO` e `PARCIAL`.
- Para datas já alcançadas pela data de corte, o histórico planejado usa o valor original do
  título. Assim, a baixa e o status `QUITADO` não apagam aquilo que estava previsto.
- Para datas futuras, a projeção usa somente o saldo em aberto. Título já quitado não reaparece
  como compromisso futuro.
- O realizado considera exclusivamente movimentos financeiros `ATIVO`, pela
  `data_movimento`, limitado à menor data entre hoje e o fim do filtro.
- Datas futuras retornam realizado indisponível (`null`) e são exibidas como `—`, não como zero
  nem como repetição do último saldo acumulado.
- A variação passa a ser `saldo realizado - saldo previsto até a mesma data de corte`.
- O dia de negócio é calculado no fuso `America/Sao_Paulo`.
- Permutas e intercompany continuam seguindo os filtros já existentes.

## Interface

O gráfico mantém o padrão visual compacto e oferece três leituras no mesmo card:

1. **Comparativo**: saldo previsto e realizado apenas até a data de corte;
2. **Previsto**: entradas e saídas planejadas para todo o período;
3. **Realizado**: entradas e saídas efetivamente baixadas até a data de corte.

Cada leitura alterna entre acumulado e movimento do período. A data de corte recebe marca visual
quando existem dias futuros no intervalo. A tabela usa `—` nas colunas realizadas futuras.

## Arquivos alterados

- `backend/src/services/relatorioFinanceiroService.js`
- `backend/scripts/validarFluxoCaixaPrevistoRealizado.js`
- `frontend/src/pages/FinanceiroRelatorios.jsx`
- `frontend/src/index.css`
- `docs/workspace/OWNERSHIP_ATIVO.md`

## Validações executadas

- `cd backend && node scripts/validarFluxoCaixaPrevistoRealizado.js`
- `cd backend && npm run test:relatorio-financeiro-periodo`
- `cd frontend && npm run build`
- `git diff --check`

Todas concluídas com sucesso. O build apenas regenerou temporariamente o catálogo de navegação;
o arquivo gerado, sem mudança funcional desta tarefa, foi restaurado.

## Implantação e risco

- Não há migration, seed, backfill ou escrita automática no banco.
- O contrato do endpoint existente foi mantido e recebeu campos adicionais compatíveis.
- A permissão continua sendo `financeiro.relatorios.visualizar`.
- Não houve reinício, deploy, commit ou push nesta etapa.
- O histórico anterior à implantação usa o valor original e o vencimento atualmente registrados
  no título. Não foi criada uma trilha retroativa de versões de edições antigas, pois esses dados
  históricos não existem no banco atual.

## Próximo passo operacional

Após commit/push autorizado, atualizar o backend dev, reiniciar somente `backend-dev`, confirmar
`/health` e validar visualmente um intervalo que contenha passado, data atual e futuro.

## Complemento — filtros históricos

Após a primeira validação em dev, o seletor de período foi ampliado com `Últimos 7 dias`,
`Últimos 30 dias`, `Últimos 90 dias` e `Mês anterior`. As opções foram agrupadas em Histórico e
Projeção, e o gráfico passou a informar no próprio subtítulo o intervalo efetivamente aplicado às
três visões: Comparativo, Previsto e Realizado.

O backend e o validador aceitam os novos códigos `ULTIMOS_7_DIAS`, `ULTIMOS_30_DIAS`,
`ULTIMOS_90_DIAS` e `MES_ANTERIOR`. O teste usa 29/09/2026 como data fixa e confirma, entre
outros casos, que `Últimos 30 dias` resolve para 31/08/2026 a 29/09/2026.

Validações do complemento:

- `cd backend && npm run test:relatorio-financeiro-periodo`
- `cd backend && node scripts/validarFluxoCaixaPrevistoRealizado.js`
- `cd frontend && npm run build`

Não há migration, seed ou alteração de dados.
