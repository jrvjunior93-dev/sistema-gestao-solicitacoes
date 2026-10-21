import { workspaceAccessIdentity } from '../../navigation/workspaceModel.js';

const camposAvancados = ['codigo', 'descricao', 'numero_sienge', 'obra_ids', 'area',
  'tipo_solicitacao_id', 'status', 'valor_min', 'valor_max', 'data_registro', 'data_inicio', 'data_fim',
  'data_vencimento', 'data_vencimento_inicio', 'data_vencimento_fim', 'responsavel'];
const camposUrl = ['q', 'obra_ids', 'area', 'status', 'codigo', 'ids', 'visao',
  'data_registro', 'data_inicio', 'data_fim', 'data_vencimento_inicio', 'data_vencimento_fim'];
const camposOrdem = ['createdAt', 'data', 'codigo', 'descricao', 'valor', 'status', 'vencimento', 'setor', 'numero_sienge'];
const texto = value => typeof value === 'string' ? value.slice(0, 2000) : '';
const chave = (user, arquivadas) => user?.id
  ? `solicitacoes:consulta-sessao:${user.id}:${arquivadas ? 'arquivadas' : 'ativas'}` : null;

// Nunca guardar DTO, permissao calculada, credencial ou parametros arbitrarios da API.
export function normalizarPeriodoRegistro(filtros = {}) {
  const inicio = filtros.data_inicio || '';
  const fim = filtros.data_fim || '';
  const legado = !inicio && !fim ? filtros.data_registro || '' : '';
  // Uma data exata salva continua consultando o mesmo dia; o periodo novo
  // prevalece e nao envia o legado, que teria precedencia no backend.
  return { ...filtros, data_registro: '', data_inicio: inicio || legado, data_fim: fim || legado };
}

function projetar({ filtros = {}, consulta = {} } = {}) {
  const normalizados = normalizarPeriodoRegistro(filtros);
  const avancados = Object.fromEntries(camposAvancados.map(c => [c, texto(normalizados[c])]));
  const rapidos = Object.fromEntries(['obra', 'tipo', 'status'].map(c => [c,
    Array.isArray(consulta.filtros?.[c]) ? consulta.filtros[c].slice(0, 300).map(v => texto(String(v))) : []]));
  return { filtros: avancados, consulta: { busca: texto(consulta.busca), filtros: rapidos,
    visao: { id: texto(consulta.visao?.id) }, ordenacao: {
      campo: camposOrdem.includes(consulta.ordenacao?.campo) ? consulta.ordenacao.campo : 'createdAt',
      direcao: consulta.ordenacao?.direcao === 'asc' ? 'asc' : 'desc'
    } } };
}

export function lerConsultaSessao(user, arquivadas, search, storage) {
  const key = chave(user, arquivadas);
  const params = new URLSearchParams(search);
  // Atalhos de Hub/busca global explicitamente filtrados prevalecem sobre a sessao.
  if (!key || camposUrl.some(c => params.has(c))) return null;
  try {
    const salvo = JSON.parse((storage || globalThis.sessionStorage).getItem(key) || 'null');
    if (salvo?.escopo !== workspaceAccessIdentity(user)) return null;
    return projetar(salvo);
  } catch { return null; }
}

export function salvarConsultaSessao(user, arquivadas, dados, storage) {
  const key = chave(user, arquivadas);
  if (!key) return;
  try { (storage || globalThis.sessionStorage).setItem(key, JSON.stringify({ escopo: workspaceAccessIdentity(user), ...projetar(dados) })); }
  catch { /* Storage indisponivel nao bloqueia a lista nem a navegacao. */ }
}
