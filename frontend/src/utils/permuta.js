import {canAccessFinanceiro,isSuperadmin} from './acessoProduto';
export function podePermuta(user,acao='usar') {
  const permissoes = user?.permutas_permissoes ?? user?.areas_permissoes ?? [];
  return canAccessFinanceiro(user) && (isSuperadmin(user) || (Array.isArray(permissoes) && permissoes.includes(`financeiro.permutas.${acao}`)));
}
export function ehPermuta(forma) {return /\bPERMUTA\b/i.test([forma?.tipo,forma?.codigo,forma?.nome].join(' '));}
export function aceitaComposicaoPermuta(forma){return /\b(?:PIX|TRANSFERENCIA|BOLETO|DINHEIRO)\b/.test([forma?.tipo,forma?.codigo,forma?.nome].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());}
