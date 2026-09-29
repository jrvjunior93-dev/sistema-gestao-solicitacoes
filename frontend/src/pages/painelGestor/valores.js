import { formatCurrency } from '../FinanceiroResultadoObras';

/*
  VALORES DO PAINEL COM O OLHO FECHADO (29/09/2026).

  Com o olho fechado o servidor devolve todo valor financeiro = null. A tela
  NUNCA formata null como "R$ 0,00": onde haveria dinheiro (ou percentual
  derivado de dinheiro) sai o marcador abaixo. Mesmo que um número chegue
  por engano, `dinheiro(valor, true)` não o formata — nada vai para o HTML,
  title, aria-label ou largura de barra.
*/
export const VALOR_OCULTO = '••••••';

export function dinheiro(valor, oculto) {
  if (oculto) return VALOR_OCULTO;
  return formatCurrency(valor);
}

export function dinheiroOuTraco(valor, oculto) {
  if (oculto) return VALOR_OCULTO;
  return valor == null ? '—' : formatCurrency(valor);
}

export function percentual(valor, oculto, casas = 1) {
  if (oculto) return VALOR_OCULTO;
  if (valor == null || !Number.isFinite(Number(valor))) return '—';
  // pt-BR: vírgula decimal ("15,0%"), como o resto do sistema.
  return `${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

export function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}
