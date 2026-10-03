'use strict';

const FUSO_NEGOCIO = 'America/Sao_Paulo';

function normalizarDataIso(valor) {
  const texto = String(valor || '').trim();
  const match = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const [, ano, mes, dia] = match;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  if (
    data.getUTCFullYear() !== Number(ano)
    || data.getUTCMonth() !== Number(mes) - 1
    || data.getUTCDate() !== Number(dia)
  ) return null;

  return `${ano}-${mes}-${dia}`;
}

function dataHojeNoFuso(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: FUSO_NEGOCIO,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(agora);
  const porTipo = Object.fromEntries(partes.map((parte) => [parte.type, parte.value]));
  return `${porTipo.year}-${porTipo.month}-${porTipo.day}`;
}

function formatarDataBr(valor) {
  const iso = normalizarDataIso(valor);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}

/**
 * O fluxo existente materializa parcelas ENTRE a vigencia atual e a nova data. Ele e, portanto,
 * um fluxo de PRORROGACAO. Aceitar uma data menor distribuiria vencimentos para tras e poderia
 * deixar o fim do contrato anterior a parcelas, medicoes ou titulos que ja existem.
 *
 * Reducao de prazo e uma operacao diferente: precisa escolher explicitamente se compromissos
 * posteriores serao antecipados, cancelados ou mantidos. Ate esse fluxo existir, ela e bloqueada.
 */
function validarNovaVigencia({ novaVigenciaFim, vigenciaAtualFim, hoje } = {}) {
  const nova = normalizarDataIso(novaVigenciaFim);
  const atual = normalizarDataIso(vigenciaAtualFim);
  const referenciaHoje = normalizarDataIso(hoje) || dataHojeNoFuso();

  if (!nova) {
    return {
      valida: false,
      codigo: 'DATA_INVALIDA',
      mensagem: 'Informe uma nova vigencia final valida.'
    };
  }

  if (nova < referenciaHoje) {
    return {
      valida: false,
      codigo: 'DATA_RETROATIVA',
      mensagem: `A nova vigencia nao pode terminar antes de hoje (${formatarDataBr(referenciaHoje)}).`
    };
  }

  if (atual && nova === atual) {
    return {
      valida: false,
      codigo: 'SEM_ALTERACAO',
      mensagem: 'A nova vigencia precisa alterar o prazo. Para acrescentar apenas valor, use Somente valor.'
    };
  }

  if (atual && nova < atual) {
    return {
      valida: false,
      codigo: 'REDUCAO_NAO_SUPORTADA',
      mensagem: `Este fluxo aceita apenas prorrogacao. A nova vigencia deve ser posterior a vigencia atual (${formatarDataBr(atual)}). A reducao de prazo exige tratamento especifico das parcelas, medicoes e titulos posteriores.`
    };
  }

  return {
    valida: true,
    codigo: 'PRORROGACAO_VALIDA',
    nova_vigencia_fim: nova,
    vigencia_atual_fim: atual,
    hoje: referenciaHoje
  };
}

module.exports = {
  FUSO_NEGOCIO,
  normalizarDataIso,
  dataHojeNoFuso,
  validarNovaVigencia
};
