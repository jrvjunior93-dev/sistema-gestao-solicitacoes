# Codigo da solicitacao no relatorio PDF de titulos

## Alteracao

O PDF gerado pelo botao Gerar relatorio em Contas a Pagar agora inclui a coluna
Solicitacao imediatamente apos Titulo, exibindo o codigo real da origem. A
consulta `listarTitulos` ja inclui `solicitacao.codigo`; a falha era somente
na montagem das colunas. Sem codigo, o valor e `-`, sem fabricar numero pelo ID.
O renderer compartilhado tambem inclui a coluna em Contas a Receber.

## Arquivos

- `backend/src/services/tituloFinanceiroRelatorioPdfService.js`: coluna e valor,
  com ajuste de larguras para preservar A4 paisagem.
- `backend/scripts/validarRelatorioTitulosSolicitacao.js` e `backend/package.json`:
  teste isolado com PDFKit real, sem banco ou .env.
- `docs/modulos/financeiro/README.md` e `docs/workspace/OWNERSHIP_ATIVO.md`:
  contrato do relatorio e registro do escopo.

## Validacoes

- `npm run test:relatorio-titulos-solicitacao`: ordem das colunas, codigo diferente
  do ID, ausencia de vinculo/codigo, objeto Sequelize via toJSON, multiplas paginas,
  limites do A4, total preservado, lista vazia e Contas a Receber.
- PDF sintetico de 40 titulos em quatro paginas renderizado com Poppler e
  inspecionado visualmente; reabertura com pypdf confirma codigos, totais e
  cabecalhos. Evidencias locais em `outputs/qa-relatorio-titulos/`, fora do commit.

## Publicacao

Alteracao local na `refactor/frontend`, sem commit, push, deploy, migration ou
acesso a banco real. Nenhuma alteracao de frontend, endpoint, permissao, saldo,
status ou fluxo de baixa. Depois da publicacao autorizada, atualizar o backend
do ambiente desejado e homologar o botao Gerar relatorio com titulo vinculado e
titulo manual. Sem migration nova nesta tarefa.
