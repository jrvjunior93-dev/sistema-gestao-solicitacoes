'use strict';

const { Op } = require('sequelize');
const { RhColaborador, RhSolicitacao, RhColaboradorVinculo, TituloFinanceiro } = require('../models');
const { getRhDpObraScopeIds } = require('../services/authorizationService');
const { projetarPrivacidadeRh } = require('../services/rhPrivacidadeObraDomain');

module.exports = async function rhPrivacidadeObra(req, res, next) {
  try {
    const escopo = await getRhDpObraScopeIds(req.user);
    if (!Array.isArray(escopo)) return next();
    // Uma consulta indexada, somente IDs/obra. Sem cache entre usuarios/requisicoes:
    // alterar o sigilo no DP vale na proxima leitura, inclusive pedido antigo.
    const rows = await RhColaborador.findAll({ where: { salario_restrito_obra: true }, attributes: ['id', 'obra_id'], raw: true });
    const restritos = new Set(rows.map(r => Number(r.id)));
    req.rhPrivacidadeObra = { restritos, escopo };
    const path = req.path || '';
    const documentosObra = /\/cadastro-obra(?:\/|$)/.test(path);
    // Apuracoes/folha legadas possuem impostos e agregados que tambem revelam
    // salario. Nao executar esses caminhos pela obra quando o recorte inclui
    // pessoa restrita; o fluxo independente de percentuais continua disponivel.
    const legadoFinanceiro = /^\/(?:jornada|apuracoes|fechamentos|folha|importacoes|relatorios)(?:\/|$)/.test(path);
    const local = Number(req.query?.obra_id || req.body?.obra_id) || null;
    if (legadoFinanceiro && restritos.size) {
      const locais = local ? escopo.filter(id => Number(id) === local) : escopo;
      let temRestrito = rows.some(r => locais.includes(Number(r.obra_id)));
      // Transferir nao libera salarios antigos nos agregados do local anterior.
      // Consultas LIMIT1, somente ID, apenas no caminho legado e sem pessoa atual.
      if (!temRestrito && locais.length) {
        temRestrito = Boolean(await RhColaboradorVinculo.findOne({
          where: { colaborador_id: { [Op.in]: [...restritos] }, obra_id: { [Op.in]: locais } }, attributes: ['id'], raw: true
        }));
      }
      if (!temRestrito && locais.length) {
        temRestrito = Boolean(await TituloFinanceiro.findOne({ where: {
          origem_titulo: 'RH_DP', obra_id: { [Op.in]: locais },
          [Op.or]: [...restritos].flatMap(id => [{ numero_documento: { [Op.like]: `RHDP-%-COL-${id}-%` } }, { numero_documento: { [Op.like]: `RHDP-%-COL-${id}` } }])
        }, attributes: ['id'], raw: true }));
      }
      if (temRestrito) return res.status(403).json({ error: 'Este calculo RH possui salario restrito e esta disponivel somente ao DP. Use a solicitacao de pagamento por percentuais.' });
    }
    if (restritos.size && !documentosObra && /(?:exportar|modelo|\.pdf|\.xlsx|\.zip)/i.test(path)) {
      return res.status(403).json({ error: 'Exportacao com dados salariais restritos disponivel somente ao DP.' });
    }
    let colaboradorContexto = Number(path.match(/\/colaboradores\/(\d+)(?:\/|$)/)?.[1]) || null;
    if (restritos.has(colaboradorContexto) && /\/historico-salario$/.test(path)) {
      return res.status(403).json({ error: 'Historico salarial restrito ao DP.' });
    }
    const solicitacao = path.match(/^\/(?:solicitacoes|pagamentos-solicitacao)\/(\d+)(?:\/|$)/);
    if (restritos.size && solicitacao) {
      const s = await RhSolicitacao.findByPk(solicitacao[1], { attributes: ['id', 'tipo', 'subtipo', 'colaborador_id', 'dados_json'] });
      const dados = typeof s?.dados_json === 'string' ? JSON.parse(s.dados_json) : s?.dados_json;
      const ids = [s?.colaborador_id, ...(dados?.linhas || []).map(l => l.colaborador_id)].map(Number);
      if (ids.some(id => restritos.has(id))) {
        colaboradorContexto = ids.find(id => restritos.has(id));
        if (s.tipo === 'JORNADA' && s.subtipo !== 'PAGAMENTO_POR_SOLICITACAO') return res.status(403).json({ error: 'Calculo salarial legado restrito ao DP.' });
        if (/\/(?:jornada|conferencia)(?:\/|$)/.test(path)) return res.status(403).json({ error: 'Conferencia salarial restrita ao DP.' });
        if (/\/anexos(?:\/|$)/.test(path)) return res.status(403).json({ error: 'Anexos internos deste pagamento sao restritos ao DP. Use os documentos enviados pela obra.' });
      }
    }
    res.setHeader('Cache-Control', 'no-store');
    const json = res.json.bind(res);
    res.json = data => json(res.statusCode >= 400 && restritos.has(Number(colaboradorContexto))
      ? { error: 'Nao foi possivel concluir a operacao. Confira os dados informados ou solicite a conferencia do DP.' }
      : projetarPrivacidadeRh(data, restritos, { colaboradorContexto, documentosObra }));
    return next();
  } catch {
    return res.status(503).json({ error: 'Nao foi possivel conferir a privacidade do RH. Tente novamente.' });
  }
};
