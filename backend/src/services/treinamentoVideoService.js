const { Op } = require('sequelize');
const { sequelize, TreinamentoVideoProgresso: Progresso, TreinamentoVideoSessao: Sessao, TreinamentoLeituraUsuario: Leitura, User } = require('../models');
const { obterConteudo } = require('./treinamentoService');
const { erro, versaoVideo, unirTrechos, normalizarPacote } = require('./treinamentoVideoDomain');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function identidade(user, atorId) {
  if (!Number.isSafeInteger(Number(user?.id)) || Number(user.id) <= 0) throw erro('Usuario invalido.', 401);
  return { usuario_id: Number(user.id), ator_id: Number(atorId) || 0 };
}
function conferirDono(p, dono, id) {
  if (!p || p.usuario_id !== dono.usuario_id || p.ator_id !== dono.ator_id || p.conteudo_id !== Number(id)) throw erro('Sessao de video nao encontrada.', 404);
}
async function iniciar(id, user, atorId, body, canManage) {
  const dono = identidade(user, atorId);
  if (!UUID.test(String(body?.sessao_id || ''))) throw erro('Identificador de sessao invalido.');
  const conteudo = await obterConteudo(id, { canManage });
  if (!(conteudo.video_s3_key || conteudo.video_url)) throw erro('Video nao encontrado.', 404);
  const versao = versaoVideo(conteudo);
  // Unique + rollback protegem dois inicios simultaneos do mesmo navegador/grupo.
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      return await sequelize.transaction(async transaction => {
        const existente = await Sessao.findByPk(body.sessao_id, { transaction, lock: transaction.LOCK.UPDATE });
        if (existente) {
          const p = await Progresso.findByPk(existente.progresso_id, { transaction });
          conferirDono(p, dono, id);
          return { sessao_id: existente.id, versao: p.versao };
        }
        const [p] = await Progresso.findOrCreate({ where: { ...dono, conteudo_id: Number(id), versao },
          defaults: { titulo: conteudo.titulo, trechos_json: '[]', saltos_json: '[]', ultima_visualizacao: new Date() }, transaction });
        await Progresso.findByPk(p.id, { transaction, lock: transaction.LOCK.UPDATE });
        const sessao = await Sessao.create({ id: body.sessao_id, progresso_id: p.id, ultimo_evento_em: new Date() }, { transaction });
        await Progresso.increment('sessoes', { by: 1, where: { id: p.id }, transaction });
        await p.update({ ultima_visualizacao: new Date() }, { transaction });
        return { sessao_id: sessao.id, versao };
      });
    } catch (e) {
      if (tentativa === 2 || !['SequelizeUniqueConstraintError', 'SequelizeTimeoutError'].includes(e.name)
        && e.original?.code !== 'ER_LOCK_DEADLOCK') throw e;
    }
  }
}
async function registrar(id, user, atorId, body, canManage) {
  const dono = identidade(user, atorId);
  if (!UUID.test(String(body?.sessao_id || ''))) throw erro('Identificador de sessao invalido.');
  const conteudo = await obterConteudo(id, { canManage });
  return sequelize.transaction(async transaction => {
    const s = await Sessao.findByPk(body.sessao_id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!s) throw erro('Sessao de video nao encontrada.', 404);
    const p = await Progresso.findByPk(s.progresso_id, { transaction, lock: transaction.LOCK.UPDATE });
    conferirDono(p, dono, id);
    if (p.versao !== versaoVideo(conteudo)) throw erro('O video foi substituido. Reabra o player.', 409);
    const agora = new Date();
    const pacote = normalizarPacote(body, p.duracao, Number(body.sequencia) === s.sequencia ? Infinity : (agora - new Date(s.createdAt)) / 1000 - Number(s.segundos));
    if (pacote.sequencia === s.sequencia && pacote.hash === s.ultimo_pacote_hash) return { recebido: true, repetido: true };
    if (pacote.sequencia !== s.sequencia + 1) throw erro('Sequencia de rastreio fora de ordem.', 409);
    const trechos = unirTrechos([...JSON.parse(p.trechos_json), ...pacote.trechos]);
    // Evita crescimento sem limite. Nao preencher lacunas para inventar cobertura.
    if (trechos.length > 5000) throw erro('Limite de trechos atingido para este video.', 409);
    await p.update({ duracao: pacote.duracao, segundos: Number(p.segundos) + pacote.segundos,
      trechos_json: JSON.stringify(trechos), saltos_json: JSON.stringify([...JSON.parse(p.saltos_json), ...pacote.saltos].slice(-100)),
      saltos: p.saltos + pacote.saltos.length, pulou_final: p.pulou_final || pacote.pulou_final, ultima_visualizacao: agora }, { transaction });
    await s.update({ sequencia: pacote.sequencia, segundos: Number(s.segundos) + pacote.segundos, ultimo_pacote_hash: pacote.hash, ultimo_evento_em: agora }, { transaction });
    return { recebido: true };
  });
}
async function relatorio(query = {}) {
  const where = {}, limit = 50;
  for (const campo of ['conteudo_id', 'usuario_id']) if (query[campo]) {
    const numero = Number(query[campo]);
    if (!Number.isSafeInteger(numero) || numero <= 0) throw erro('Filtro invalido.');
    where[campo] = numero;
  }
  if (query.busca) where[Op.or] = [ { titulo: { [Op.like]: `%${String(query.busca).slice(0, 180)}%` } },
    { '$usuario.nome$': { [Op.like]: `%${String(query.busca).slice(0, 180)}%` } } ];
  if (query.pulou_final === 'true') where.pulou_final = true;
  const pagina = Math.max(1, Math.min(100000, Math.trunc(Number(query.pagina) || 1)));
  const { rows, count } = await Progresso.findAndCountAll({ where, limit, offset: (pagina - 1) * limit,
    order: [['ultima_visualizacao', 'DESC'], ['id', 'DESC']], subQuery: false,
    include: [{ model: User, as: 'usuario', attributes: ['id', 'nome'] }, { model: User, as: 'ator', attributes: ['id', 'nome'], required: false }] });
  const items = [];
  // Apenas a pagina consultada; leitura manual e independente da versao do video.
  const leituras = rows.length ? await Leitura.findAll({ where: { [Op.or]: rows.map(p => ({ conteudo_id: p.conteudo_id, usuario_id: p.usuario_id })) }, attributes: ['conteudo_id', 'usuario_id', 'concluido', 'concluido_em'] }) : [];
  for (const model of rows) {
    const p = model.get({ plain: true }), trechos = JSON.parse(p.trechos_json);
    const cobertos = trechos.reduce((sum, [a, b]) => sum + b - a, 0);
    const leitura = leituras.find(l => l.conteudo_id === p.conteudo_id && l.usuario_id === p.usuario_id);
    items.push({ id: p.id, conteudo_id: p.conteudo_id, usuario_id: p.usuario_id, usuario: p.usuario, ator: p.ator_id ? p.ator : null,
      ator_id: p.ator_id, titulo: p.titulo, versao: p.versao, duracao: p.duracao, segundos: p.segundos, trechos,
      percentual: p.duracao ? Math.min(100, 100 * cobertos / p.duracao) : 0,
      saltos: p.saltos, ultimos_saltos: JSON.parse(p.saltos_json), pulou_final: p.pulou_final,
      sessoes: p.sessoes, primeira_visualizacao: p.createdAt, ultima_visualizacao: p.ultima_visualizacao,
      concluido_manual: Boolean(leitura?.concluido), concluido_em: leitura?.concluido_em || null });
  }
  return { items, total: count, pagina, limit };
}
module.exports = { iniciar, registrar, relatorio };
