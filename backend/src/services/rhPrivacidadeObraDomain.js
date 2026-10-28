'use strict';

const financeiro = /salari|salár|diaria|diária|contratual|bruto|liquido|líquido|custo|encargo|remunera|provento|montante|inss|irrf|fgts|hora_extra|valor|saldo|^total(?:_|$)|^totais$|^base(?:_|$)/i;
const inputs = new Set(['acrescimos', 'descontos', 'valor_vale', 'valor_ticket', 'total_colaboradores', 'total_paginas', 'total_registros', 'conta_salario', 'salario_restrito_obra', 'salario_oculto']);
const historicos = new Set(['historico', 'historicos', 'historico_salario', 'auditoria', 'auditorias']);
const arquivos = new Set(['arquivo_url', 'url', 'download_url', 'link', 'anexos', 'documentos', 'arquivos']);
const de = v => v?.get ? v.get({ plain: true }) : v;
function colaboradorId(v) {
  return Number(v?.colaborador_id || v?.rh_colaborador_id || v?.colaborador?.id
    || ((Object.hasOwn(v || {}, 'salario_base') || Object.hasOwn(v || {}, 'salario_restrito_obra')) ? v.id : 0)
    || String(v?.numero_documento || '').match(/RHDP-.*?-COL-(\d+)(?:-|$)/)?.[1]);
}

// Projecao de resposta somente: nenhum objeto persistido e modificado. Os IDs
// restritos sao lidos do servidor; flags no navegador nao concedem visibilidade.
function projetarPrivacidadeRh(payload, restritos, { colaboradorContexto = null, documentosObra = false } = {}) {
  function visitar(original, herdado = false, chave = '') {
    let value = de(original);
    if (chave.endsWith('_json') && typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return { data: null, oculto: herdado }; }
    }
    if (herdado && chave.endsWith('_json') && (value == null || typeof value !== 'object')) return { data: null, oculto: true };
    if (value instanceof Date || value == null || typeof value !== 'object') return { data: value, oculto: herdado };
    if (Array.isArray(value)) {
      const itens = value.map(v => visitar(v, herdado, chave));
      return { data: itens.map(i => i.data), oculto: itens.some(i => i.oculto) };
    }
    const id = colaboradorId(value);
    const proprio = id ? restritos.has(id) : herdado;
    const itens = Object.entries(value).map(([k, v]) => [k, visitar(v, proprio, k)]);
    const contemOculto = proprio || itens.some(([, r]) => r.oculto);
    const data = {};
    for (const [k, r] of itens) {
      if (k === 'dados_json' && value.tipo === 'JORNADA' && value.subtipo !== 'PAGAMENTO_POR_SOLICITACAO' && contemOculto) {
        data[k] = { salario_oculto: true }; continue;
      }
      if ((k === 'cadastro_versao' || /hash/i.test(k)) && (proprio || contemOculto)) continue;
      if (!documentosObra && ['documentos', 'arquivo_url'].includes(k)) { data[k] = Array.isArray(r.data) ? [] : null; continue; }
      if (k === 'valor' && chave === 'reembolso') { data[k] = r.data; continue; }
      if (k === 'total' && (Object.hasOwn(value, 'pagina') || Object.hasOwn(value, 'page'))) { data[k] = r.data; continue; }
      if (contemOculto && historicos.has(k)) { data[k] = []; continue; }
      if (proprio && !documentosObra && arquivos.has(k)) { data[k] = Array.isArray(r.data) ? [] : null; continue; }
      if ((proprio || (contemOculto && !id)) && financeiro.test(k) && !inputs.has(k)) { data[k] = null; continue; }
      // Listas financeiras auxiliares nao carregam sempre colaborador_id.
      if (contemOculto && ['avisos', 'pagamentos_financeiros'].includes(k)) {
        data[k] = visitar(value[k], true, k).data; continue;
      }
      data[k] = proprio && k === 'descricao' ? 'Informacao restrita ao DP' : r.data;
    }
    if (proprio || contemOculto) data.salario_oculto = true;
    return { data, oculto: contemOculto };
  }
  return visitar(payload, restritos.has(Number(colaboradorContexto))).data;
}

module.exports = { projetarPrivacidadeRh };
