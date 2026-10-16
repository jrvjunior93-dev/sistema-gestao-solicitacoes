'use strict';

const { Op } = require('sequelize');
const { RhSolicitacao } = require('../models');
const { ORIGENS_DP } = require('./pagamentoFilaFiltrosDomain');

// Somente snapshots dos titulos autorizados pelo chamador. Nao consulta o
// cadastro atual nem altera classificacao, pagamento ou dados historicos.
function solicitacaoDoTitulo(titulo) {
  const match = String(titulo.numero_documento || '').match(/^RHDP-.*-SOL-(\d+)(?:-|$)/);
  return match && Number.isSafeInteger(Number(match[1])) ? Number(match[1]) : null;
}

function modoDoSnapshot(titulo, dados) {
  const ref = (Array.isArray(dados?.titulos) ? dados.titulos : []).find(r => Number(r.id) === Number(titulo.id));
  if (!ref) return null;
  if (ref.modo_recebimento != null && ref.modo_recebimento !== '') return ref.modo_recebimento;
  const linha = (Array.isArray(dados.linhas) ? dados.linhas : []).find(l => ref.tipo === 'SALARIO'
    ? ref.colaborador_id != null && l.colaborador_id != null && Number(l.colaborador_id) === Number(ref.colaborador_id)
    : ref.tipo === 'REEMBOLSO' && ref.responsavel_id != null && l.reembolso?.responsavel_id != null
      && Number(l.reembolso.responsavel_id) === Number(ref.responsavel_id)
      && Number(l.empresa_grupo_id) === Number(titulo.empresa_id));
  if (!linha || linha.pagamento_estado === 'EM_EDICAO') return null;
  return ref.tipo === 'SALARIO' ? linha.modo_recebimento : linha.reembolso?.modo_recebimento;
}

async function anexarRecebimentosDp(titulos) {
  const dp = titulos.filter(t => ORIGENS_DP.includes(t.origem_titulo));
  const ids = [...new Set(dp.map(solicitacaoDoTitulo).filter(Boolean))];
  const snapshots = new Map();
  // Numero de consultas proporcional a solicitacoes distintas, nao a titulos.
  // Um lote de 200 salarios da mesma solicitacao le o JSON uma unica vez.
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await RhSolicitacao.findAll({ where: { id: { [Op.in]: ids.slice(i, i + 100) } },
      attributes: ['id', 'dados_json'], raw: true });
    for (const row of rows) {
      let dados = row.dados_json;
      if (typeof dados === 'string') { try { dados = JSON.parse(dados); } catch { dados = null; } }
      snapshots.set(Number(row.id), dados);
    }
  }
  for (const titulo of titulos) {
    titulo.recebimento_dp = ORIGENS_DP.includes(titulo.origem_titulo)
      ? modoDoSnapshot(titulo, snapshots.get(solicitacaoDoTitulo(titulo)))
        ?? (['PIX_CHAVE', 'PIX_DADOS_BANCARIOS'].includes(titulo.paymentBeneficiary?.metodo_preferencial) ? 'PIX' : 'NAO_INFORMADO')
      : null;
  }
  return titulos;
}

module.exports = { anexarRecebimentosDp, modoDoSnapshot, solicitacaoDoTitulo };
