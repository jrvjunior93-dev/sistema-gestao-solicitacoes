// =====================================================================
// AÇÃO PRINCIPAL POR SETOR + ESTADO (detalhe da solicitação)
// ---------------------------------------------------------------------
// CRUD do mapeamento configurável setor+status_global → ação em destaque.
// A leitura é liberada para qualquer usuário autenticado (é metadado de
// interface, necessário para o detalhe destacar o botão certo); escrita
// gateada pela área de configurações 'status_vinculos' nas rotas.
// O catálogo de ações válidas referencia SOMENTE handlers que já existem
// no detalhe — este mapeamento reordena o que a tela já faz.
// =====================================================================
const { AcaoPrincipalSetor } = require('../models');

const ACOES_VALIDAS = new Set([
  'alterar_status',
  'enviar_setor',
  'gerar_titulo',
  'informar_pagamento',
  'registrar_medicao',
  'aprovar_diretoria',
  'assumir',
  'atribuir_responsavel'
]);

function normalizarPayload(body = {}) {
  const setor = String(body.setor || '').trim().toUpperCase().slice(0, 120);
  const statusGlobal = String(body.status_global || '').trim().slice(0, 120);
  const acao = String(body.acao || '').trim().toLowerCase().slice(0, 80);
  const rotulo = String(body.rotulo || '').trim().slice(0, 120);
  const ativo = body.ativo === undefined ? true : Boolean(body.ativo);

  if (!setor) return { erro: 'Informe o setor' };
  if (!ACOES_VALIDAS.has(acao)) {
    return { erro: `Acao invalida. Validas: ${Array.from(ACOES_VALIDAS).join(', ')}` };
  }

  return {
    valores: {
      setor,
      status_global: statusGlobal || null, // null = curinga (qualquer estado)
      acao,
      rotulo: rotulo || null,
      ativo
    }
  };
}

module.exports = {
  ACOES_VALIDAS,

  async index(req, res) {
    try {
      const itens = await AcaoPrincipalSetor.findAll({
        order: [['setor', 'ASC'], ['status_global', 'ASC']]
      });
      return res.json(itens);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar acoes principais' });
    }
  },

  async store(req, res) {
    try {
      const { erro, valores } = normalizarPayload(req.body);
      if (erro) return res.status(400).json({ error: erro });

      const duplicada = await AcaoPrincipalSetor.findOne({
        where: { setor: valores.setor, status_global: valores.status_global }
      });
      if (duplicada) {
        return res.status(409).json({ error: 'Ja existe mapeamento para este setor e estado' });
      }

      const criado = await AcaoPrincipalSetor.create(valores);
      return res.status(201).json(criado);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar acao principal' });
    }
  },

  async update(req, res) {
    try {
      const id = Number(req.params.id);
      const registro = Number.isInteger(id) && id > 0
        ? await AcaoPrincipalSetor.findByPk(id)
        : null;
      if (!registro) return res.status(404).json({ error: 'Mapeamento nao encontrado' });

      const { erro, valores } = normalizarPayload({ ...registro.toJSON(), ...req.body });
      if (erro) return res.status(400).json({ error: erro });

      await registro.update(valores);
      return res.json(registro);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao atualizar acao principal' });
    }
  },

  async destroy(req, res) {
    try {
      const id = Number(req.params.id);
      const removidos = Number.isInteger(id) && id > 0
        ? await AcaoPrincipalSetor.destroy({ where: { id } })
        : 0;
      if (!removidos) return res.status(404).json({ error: 'Mapeamento nao encontrado' });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir acao principal' });
    }
  }
};
