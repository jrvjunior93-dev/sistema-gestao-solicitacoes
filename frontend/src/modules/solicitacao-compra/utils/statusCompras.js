/*
 * SEMÂNTICA DE STATUS DO MÓDULO DE COMPRAS — um mapa só, explícito.
 *
 * ## Por que este arquivo existe (defeito de 05/09)
 *
 * As quatro listagens do módulo pintavam o MESMO valor de cores diferentes,
 * cada uma com o seu mapa à mão:
 *   - `SolicitacoesCompra` não conhecia CANCELADO/RECUSADO e os jogava no
 *     `return` final — índigo, a MESMA cor de um status que ela não conhece.
 *     Quem opera a fila não distinguia "morreu" de "não sei".
 *   - `ListaCotacoes` pintava CANCELADO de cinza (a cor de FINALIZADA).
 *   - `PedidosCompra` classificava por `bloqueia_edicao` e, quando o status
 *     configurado NÃO bloqueia edição, caía no `return 'success'`: pedido
 *     CANCELADO saía VERDE.
 * Três telas irmãs, três respostas para a mesma pergunta. Mapa duplicado à
 * mão é como a divergência nasce; então ele passa a morar num lugar só.
 *
 * ## As famílias (as do StatusBadge, sem inventar nenhuma)
 *   danger  = morreu por decisão (cancelado, recusado)
 *   warning = parado esperando alguém (aguardando diretoria, parcial)
 *   success = passou (liberado, respondido, fechado com fornecedor)
 *   info    = em andamento / na fila (pendente, enviado, aberto)
 *   neutral = terminou o ciclo (finalizada, encerrado)
 *
 * CANCELADO/RECUSADO ficam em `danger`, e não em `neutral` junto de
 * ENCERRADO: a etiqueta precisa separar "acabou porque terminou" de "acabou
 * porque foi cortado". O cabeçalho do StatusBadge lista "cancelamento" em
 * `danger` justamente por isso.
 *
 * ## Os DOIS nomes do mesmo estado (achado, com conserto de raiz pendente)
 *
 * O sistema grava CANCELADO **e** CANCELADA, RECUSADO **e** RECUSADA para o
 * mesmo estado — cinco arquivos do módulo já se defendiam aceitando as duas
 * formas; a `SolicitacoesCompra` não, e era por isso que a etiqueta dela
 * caía no default. Aqui as duas formas colapsam numa chave canônica, o que
 * conserta a TELA. O conserto de RAIZ é padronizar o valor no banco (uma
 * grafia só) — enquanto houver duas, todo consumidor novo nasce com a mesma
 * armadilha.
 */

// Duas grafias, um estado. Chave canônica à esquerda do `:` é a grafia
// gravada; à direita, a que o mapa de famílias conhece.
const SINONIMOS_STATUS = {
  CANCELADA: 'CANCELADO',
  RECUSADA: 'RECUSADO',
  REJEITADA: 'RECUSADO',
  REJEITADO: 'RECUSADO',
  ENCERRADA: 'ENCERRADO',
  FINALIZADO: 'FINALIZADA'
};

// Família semântica por status — EXPLÍCITO. Status que não está aqui não
// recebe cor de "estado conhecido": quem chama devolve `null` ao StatusBadge
// e o classificador do sistema decide, em vez de fingir que sabe.
const FAMILIA_STATUS = {
  // --- solicitação de compra ---
  PENDENTE: 'info',
  ENVIADO: 'info',
  ABERTA: 'info',
  INTEGRADO_SIENGE: 'info',
  AGUARDANDO_DIRETORIA: 'warning',
  FECHAMENTO_PARCIAL: 'warning',
  LIBERADO_PARA_COMPRA: 'success',
  FINALIZADA: 'neutral',
  ENCERRADO: 'neutral',
  CANCELADO: 'danger',
  RECUSADO: 'danger',
  // --- cotação com fornecedor ---
  VISUALIZADO: 'warning',
  RESPONDIDO: 'success',
  // --- pedido de compra ---
  ABERTO: 'info',
  EM_ANALISE: 'warning',
  ENVIADO_FORNECEDOR: 'info',
  NEGOCIACAO: 'warning',
  FECHADO_FORNECEDOR: 'success'
};

// Rótulo humano dos status de SOLICITAÇÃO que a tela oferece para filtrar.
// A lista existe porque o filtro antigo oferecia 5 opções para uma tela que
// reconhece 11 estados — e AGUARDANDO_DIRETORIA, o que mais se quer isolar,
// era justamente um dos que faltavam.
export const STATUS_SOLICITACAO_COMPRA = [
  { valor: 'PENDENTE', rotulo: 'Pendente' },
  { valor: 'ENVIADO', rotulo: 'Enviado' },
  { valor: 'ABERTA', rotulo: 'Aberta' },
  { valor: 'AGUARDANDO_DIRETORIA', rotulo: 'Aguardando diretoria' },
  { valor: 'INTEGRADO_SIENGE', rotulo: 'Integrado Sienge' },
  { valor: 'LIBERADO_PARA_COMPRA', rotulo: 'Liberado para compra' },
  { valor: 'FECHAMENTO_PARCIAL', rotulo: 'Fechamento parcial' },
  { valor: 'FINALIZADA', rotulo: 'Finalizada' },
  { valor: 'ENCERRADO', rotulo: 'Encerrado' },
  { valor: 'CANCELADO', rotulo: 'Cancelado' },
  { valor: 'RECUSADO', rotulo: 'Recusado' }
];

/** Normaliza para MAIÚSCULA sem acento, com `_` no lugar de espaço/hífen. */
export function normalizarStatusCompra(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

/** Chave canônica: colapsa as duas grafias do mesmo estado numa só. */
export function chaveStatusCompra(valor) {
  const normalizado = normalizarStatusCompra(valor);
  return SINONIMOS_STATUS[normalizado] || normalizado;
}

/**
 * Família semântica do status, ou `null` quando a tela NÃO conhece o estado.
 * `null` é informação: quem chama repassa `kind={familia || undefined}` e o
 * StatusBadge cai no classificador do sistema — nunca numa cor fixa que faz
 * "desconhecido" parecer um estado com significado.
 */
export function familiaStatusCompra(valor) {
  return FAMILIA_STATUS[chaveStatusCompra(valor)] || null;
}

/** Rótulo de exibição: MAIÚSCULA com espaço, a forma que as telas já usavam. */
export function rotuloStatusCompra(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return '-';
  return texto.replace(/_/g, ' ').toUpperCase();
}
