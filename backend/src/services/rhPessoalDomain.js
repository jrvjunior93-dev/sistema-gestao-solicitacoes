'use strict';

const dataIso = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
const hojeLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

// Conta a união de intervalos: retorno à mesma obra e vínculos sobrepostos não
// duplicam dias. Admissão/demissão também limitam o período, sem mudar o divisor salarial.
function diasVinculados(vinculos, colaborador, periodo) {
  const dias = new Set();
  for (const v of vinculos) {
    if (Number(v.colaborador_id) !== Number(colaborador.id)) continue;
    const inicio = [periodo.inicio, dataIso(v.vigencia_inicio), dataIso(colaborador.data_admissao || colaborador.data_inicio)].filter(Boolean).sort().pop();
    const fim = [periodo.fim, dataIso(v.vigencia_fim), dataIso(colaborador.data_demissao)].filter(Boolean).sort()[0];
    if (!inicio || !fim || inicio > fim) continue;
    for (let n = Date.parse(`${inicio}T00:00:00Z`); n <= Date.parse(`${fim}T00:00:00Z`); n += 86400000) dias.add(n);
  }
  return dias.size;
}

function ehTransferencia(s) {
  const dados = typeof s?.dados_json === 'string' ? JSON.parse(s.dados_json) : s?.dados_json;
  if (dados?.primeira_lotacao === true) return false;
  return Boolean(s?.obra_id) && (s.tipo === 'TROCA_OBRA'
    || (s.tipo === 'MOVIMENTACAO' && s.subtipo === 'TRANSFERENCIA_OBRA'));
}

module.exports = { diasVinculados, ehTransferencia, hojeLocal, dataIso };
