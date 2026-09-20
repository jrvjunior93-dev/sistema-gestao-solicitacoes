// =====================================================================
// CATÁLOGO FIXO DE BLOCOS DO DETALHE DA SOLICITAÇÃO
// ---------------------------------------------------------------------
// A personalização do usuário só ORDENA/OCULTA blocos deste catálogo —
// nenhum bloco novo nasce em configuração. As condições de permissão e de
// tipo continuam decidindo se um bloco PODE aparecer; a preferência decide
// apenas onde e se aparece quando pode.
//
// Resolução em dois níveis:
//   1. arranjo do USUÁRIO (usuario_lista_preferencias, 'detalhe-solicitacao')
//   2. ORDEM_PADRAO global abaixo.
//
// O detalhe deixou de herdar layout por SETOR: todos começam da mesma
// sequência operacional e, depois disso, cada pessoa pode personalizar a
// própria tela. Configurações antigas de setor continuam preservadas no
// banco, mas não interferem nesta tela.
// =====================================================================

import { resolverLayoutBlocos } from '../../utils/layoutBlocos';

// ⚠️ CATÁLOGO ESPELHADO NO BACKEND: BLOCOS_POR_TELA['detalhe-solicitacao']
// em backend/src/controllers/DetalheLayoutController.js valida a config do
// admin contra uma CÓPIA desta lista. Mudou aqui, mude lá — o
// frontend/scripts/validarNavegacao.mjs FALHA se os dois divergirem.
export const BLOCOS_DETALHE = [
  { id: 'itens_compra_direta', rotulo: 'Itens da compra', larguraPadrao: 'total' },
  { id: 'apropriacoes', rotulo: 'Apropriações da solicitação', larguraPadrao: 'total' },
  { id: 'rateio_contrato', rotulo: 'Rateio do contrato', larguraPadrao: 'total' },
  // ITEM 26: aditivo pendente é decisão que trava o contrato — antes das ações.
  { id: 'aditivos_contrato', rotulo: 'Aditivos do contrato', larguraPadrao: 'total', removivel: false },
  { id: 'aprovacao_diretoria', rotulo: 'Aprovação por diretoria', larguraPadrao: 'total', removivel: false },
  { id: 'acoes_contrato', rotulo: 'Ações do contrato', larguraPadrao: 'total', removivel: false },
  { id: 'financeiro', rotulo: 'Financeiro', larguraPadrao: 'total' },
  { id: 'conversa', rotulo: 'Conversa (comentários e anexos)', larguraPadrao: 'total' },
  { id: 'historico', rotulo: 'Histórico', larguraPadrao: 'total' },
  { id: 'auditoria', rotulo: 'Auditoria de prazo e documentos', larguraPadrao: 'total' }
];

// Ordem global da tela — o nível 2 da resolução.
export const ORDEM_PADRAO = BLOCOS_DETALHE.map((bloco) => bloco.id);

export function rotuloBloco(id) {
  return BLOCOS_DETALHE.find((bloco) => bloco.id === id)?.rotulo || id;
}

// Combina as camadas em um arranjo final — o motor genérico vive em
// utils/layoutBlocos.js (compartilhado com a Home); aqui só o extra do
// detalhe: `historico_ordem` e o padrão de largura total. Uma largura
// 'normal' passa a ser escolha individual e não efeito colateral da grade.
// Retorna { ordem, ocultos: Set, recolhidos: Set, larguras: {},
//           historicoOrdem: 'asc'|'desc' }.
export function resolverLayoutDetalhe({ prefsUsuario = null } = {}) {
  const base = resolverLayoutBlocos(ORDEM_PADRAO, { prefsUsuario });
  const larguras = Object.fromEntries(ORDEM_PADRAO.map((id) => [id, 'total']));
  for (const [id, largura] of Object.entries(base.larguras)) {
    if (largura === 'normal' || largura === 'total') larguras[id] = largura;
  }
  const ocultos = new Set(base.ocultos);
  for (const bloco of BLOCOS_DETALHE) {
    if (bloco.removivel === false) ocultos.delete(bloco.id);
  }
  return {
    ...base,
    ocultos,
    larguras,
    historicoOrdem: prefsUsuario?.historico_ordem === 'desc' ? 'desc' : 'asc'
  };
}
