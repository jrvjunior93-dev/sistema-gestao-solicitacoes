export { default as Pagina } from './Pagina';
export { default as PageHeader } from './PageHeader';
export { default as MenuMais } from './MenuMais';
export { default as BlocoConteudo } from './BlocoConteudo';
export { default as BlocosPersonalizaveis } from './BlocosPersonalizaveis';
export { default as StatGrid, StatTile } from './StatGrid';
export { default as CamposComVazios } from './CamposComVazios';
export { default as TabelaPadrao, CelulaDupla } from './TabelaPadrao';
export { FormSecao, CampoForm } from './FormSecao';
export { default as BarraFiltros, alternarValorFiltro } from './BarraFiltros';
export { default as Paginacao } from './Paginacao';
export { default as Avisos, useAvisos } from './Avisos';
export { useConfirmacao } from './Confirmacao';
/*
  O painel "quais filtros aparecem" e o hook que o alimenta (05/09, N53).

  Exportado AQUI, e não só pelo caminho do arquivo, porque foi o que a
  medição mandou: as 47 telas ligadas nesta leva já importam `BarraFiltros`
  deste barril — 47 de 47 — e o hook mora ao lado da prop `visibilidade`
  que ele preenche. As três telas ligadas antes importam direto de
  `./PainelFiltrosVisiveis`; esta linha é ADITIVA e não mexe nelas.
*/
export { default as PainelFiltrosVisiveis, useFiltrosVisiveis } from './PainelFiltrosVisiveis';
