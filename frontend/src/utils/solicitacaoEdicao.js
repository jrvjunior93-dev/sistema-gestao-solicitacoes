import { hasAnyExplicitPermissao } from './acessoProduto';
import { isGeoSetor } from './setor';

// Mesmo contrato dos endpoints /valor e /data-vencimento; permissoes separadas.
export function permissoesEdicaoSolicitacao(user) {
  const perfil = String(user?.perfil || '').trim().toUpperCase();
  const adminGeo = perfil.startsWith('ADMIN')
    && [user?.area, user?.setor?.codigo, user?.setor?.nome].some(isGeoSetor);
  const administrativo = perfil === 'SUPERADMIN' || adminGeo;
  return {
    valor: administrativo || hasAnyExplicitPermissao(user, ['solicitacoes.acoes.alterar_valor']),
    vencimento: administrativo || hasAnyExplicitPermissao(user, ['solicitacoes.acoes.alterar_data_vencimento'])
  };
}

export function valorSolicitacaoParaEdicao(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

export function parseValorSolicitacaoBR(texto) {
  const limpo = String(texto ?? '').trim().replace(/^R\$\s*/, '');
  if (!limpo) return null;
  // Ponto e milhar, virgula e decimal. Nunca transformar 2.000 em 2.
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(limpo)) {
    throw new Error('Informe um valor válido, por exemplo 2.000,00.');
  }
  const numero = Number(limpo.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0) throw new Error('Informe um valor válido, maior ou igual a zero.');
  return numero;
}

export function hojeSolicitacaoSP() {
  const partes = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const valores = Object.fromEntries(partes.map(p => [p.type, p.value]));
  return `${valores.year}-${valores.month}-${valores.day}`;
}

export function vencimentoSolicitacaoParaEdicao(solicitacao) {
  // Medicoes podem substituir a data exibida na lista por uma parcela pendente.
  // Editar a solicitacao nao deve gravar essa data derivada como se fosse dela.
  const valor = Object.prototype.hasOwnProperty.call(solicitacao, 'data_vencimento_solicitacao')
    ? solicitacao.data_vencimento_solicitacao : solicitacao.data_vencimento;
  return String(valor || '').slice(0, 10);
}
