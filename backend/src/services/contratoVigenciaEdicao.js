const { ValidationError } = require('../middlewares/validation');
const { normalizarDataIso } = require('./contratoAditivoVigencia');

function parseVigenciaContrato(valor, campo) {
  if (valor === undefined) return undefined;
  if (valor === null || valor === '') return null;
  const data = typeof valor === 'string' ? normalizarDataIso(valor) : null;
  if (!data) throw new ValidationError(`${campo} invalida. Informe uma data real no formato AAAA-MM-DD.`);
  return data;
}

// Um PATCH parcial deve ser validado contra o contrato lido dentro da transacao.
function prepararEdicaoVigencia(contrato, entrada) {
  const patch = {};
  for (const campo of ['vigencia_inicio', 'vigencia_fim']) {
    const valor = parseVigenciaContrato(entrada[campo], campo === 'vigencia_inicio' ? 'Inicio da vigencia' : 'Fim da vigencia');
    if (valor !== undefined && valor !== (contrato[campo] || null)) patch[campo] = valor;
  }
  if (!Object.keys(patch).length) return { patch, alteracao: null };
  const anterior = { vigencia_inicio: contrato.vigencia_inicio || null, vigencia_fim: contrato.vigencia_fim || null };
  const atual = { ...anterior, ...patch };
  if (atual.vigencia_inicio && atual.vigencia_fim && atual.vigencia_fim < atual.vigencia_inicio) {
    throw new ValidationError('O fim da vigencia deve ser igual ou posterior ao inicio.');
  }
  return { patch, alteracao: { anterior, atual } };
}

module.exports = { parseVigenciaContrato, prepararEdicaoVigencia };
