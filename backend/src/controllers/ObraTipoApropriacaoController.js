const { Op } = require('sequelize');
const {
  ObraTipoApropriacaoPadrao,
  Obra,
  TipoSolicitacao,
  Apropriacao,
  sequelize
} = require('../models');
const { getUserObraScopeIds } = require('../services/authorizationService');
const {
  apropriacaoPodeReceberLancamento,
  selecionarApropriacoesOperacionais
} = require('../services/apropriacaoSelecaoService');
const {
  TIPOS_APROPRIACAO_AUTOMATICA,
  listarPadroesNovaObra,
  resolverApropriacaoPadrao,
  tipoUsaApropriacaoAutomatica
} = require('../services/obraTipoApropriacaoPadraoService');

// Tipos que recebem apropriacao automatica na nova solicitacao.
// Identificados por codigo_interno para nao depender de id fixo entre ambientes.
const TIPOS_COM_APROPRIACAO_PADRAO = [
  ...TIPOS_APROPRIACAO_AUTOMATICA,
  'DESPESAS_DE_MARKETING'
];

/**
 * Aceita apenas inteiro positivo ou string composta so de digitos.
 * Number() puro converteria true em 1, [21] em 21 e '0x15' em 21, deixando
 * entrada invalida passar como id valido.
 */
function toInt(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const n = Number(value.trim());
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }

  return null;
}

function temChave(objeto, chave) {
  return Boolean(objeto) && Object.prototype.hasOwnProperty.call(objeto, chave);
}

module.exports = {
  /**
   * Lista as obras com o vinculo atual de cada tipo, para a tela de mapeamento.
   * Retorna tambem os tipos elegiveis, para o front montar as colunas.
   */
  async index(req, res) {
    try {
      const tipos = await TipoSolicitacao.findAll({
        where: { codigo_interno: { [Op.in]: TIPOS_COM_APROPRIACAO_PADRAO }, ativo: true },
        attributes: ['id', 'nome', 'codigo_interno'],
        order: [['nome', 'ASC']]
      });
      const ordemTipos = new Map(
        TIPOS_COM_APROPRIACAO_PADRAO.map((codigo, indice) => [codigo, indice])
      );
      tipos.sort((a, b) => (
        (ordemTipos.get(a.codigo_interno) ?? Number.MAX_SAFE_INTEGER)
        - (ordemTipos.get(b.codigo_interno) ?? Number.MAX_SAFE_INTEGER)
      ));

      const obras = await Obra.findAll({
        attributes: ['id', 'nome', 'codigo'],
        where: { ativo: true, tipo_centro_custo: 'OBRA' },
        order: [['nome', 'ASC']]
      });

      const vinculos = await ObraTipoApropriacaoPadrao.findAll({
        where: { ativo: true },
        include: [{ model: Apropriacao, as: 'apropriacao', attributes: ['id', 'codigo', 'descricao', 'ativo'] }]
      });

      // Indexa por obra para o front nao precisar cruzar listas.
      const porObra = {};
      vinculos.forEach((v) => {
        const chaveObra = String(v.obra_id);
        if (!porObra[chaveObra]) porObra[chaveObra] = {};
        porObra[chaveObra][String(v.tipo_solicitacao_id)] = {
          apropriacao_id: v.apropriacao_id,
          codigo: v.apropriacao?.codigo || null,
          descricao: v.apropriacao?.descricao || null,
          // A apropriacao pode ter sido inativada depois do vinculo. Sinalizamos em vez
          // de omitir, para o vinculo quebrado ficar visivel e poder ser corrigido.
          inativa: v.apropriacao ? !v.apropriacao.ativo : true
        };
      });

      return res.json({
        padroes_nova_obra: listarPadroesNovaObra(),
        tipos: tipos.map((t) => ({
          id: t.id,
          nome: t.nome,
          codigo_interno: t.codigo_interno,
          apropriacao_automatica_obra: tipoUsaApropriacaoAutomatica(t.codigo_interno)
        })),
        obras: obras.map((o) => ({
          id: o.id,
          nome: o.nome,
          codigo: o.codigo,
          vinculos: porObra[String(o.id)] || {}
        }))
      });
    } catch (error) {
      console.error('Erro ao listar apropriacoes padrao', error);
      return res.status(500).json({ error: 'Erro ao listar apropriacoes padrao' });
    }
  },

  /**
   * Apropriacoes de uma obra, para preencher o seletor da tela.
   * A arvore de uma obra pode passar de 4 mil itens, entao aceita busca e limita o retorno.
   */
  async apropriacoesDaObra(req, res) {
    try {
      const obraId = toInt(req.params.obraId);
      if (!obraId) return res.status(400).json({ error: 'Obra invalida' });

      const busca = String(req.query.busca || '').trim();
      const where = { obra_id: obraId, ativo: true };

      if (busca) {
        where[Op.or] = [
          { codigo: { [Op.like]: `%${busca}%` } },
          { descricao: { [Op.like]: `%${busca}%` } }
        ];
      }

      const apropriacoes = await Apropriacao.findAll({
        where,
        attributes: ['id', 'obra_id', 'codigo', 'descricao', 'somadora', 'macro_formulario', 'ordem_planilha'],
        order: [['ordem_planilha', 'ASC'], ['id', 'ASC']]
      });

      return res.json({ apropriacoes: selecionarApropriacoesOperacionais(apropriacoes).slice(0, 200) });
    } catch (error) {
      console.error('Erro ao listar apropriacoes da obra', error);
      return res.status(500).json({ error: 'Erro ao listar apropriacoes da obra' });
    }
  },

  /**
   * Resolve a apropriacao que sera aplicada na Nova Solicitacao. A leitura usa o mesmo
   * escopo de obras do usuario; permissao de configuracao nao e necessaria para criar.
   */
  async resolverParaSolicitacao(req, res) {
    try {
      const obraId = toInt(req.query?.obra_id);
      const tipoId = toInt(req.query?.tipo_solicitacao_id);
      if (!obraId || !tipoId) {
        return res.status(400).json({ error: 'Informe obra e tipo de solicitacao validos.' });
      }

      const obraScopeIds = await getUserObraScopeIds(req.user);
      if (Array.isArray(obraScopeIds) && !obraScopeIds.includes(obraId)) {
        return res.status(403).json({ error: 'Acesso negado para esta obra.' });
      }

      const resolvido = await resolverApropriacaoPadrao({
        obraId,
        tipoSolicitacaoId: tipoId,
        exigir: true
      });

      if (!resolvido.aplicavel) {
        return res.json({ aplicavel: false, apropriacao: null });
      }

      return res.json({
        aplicavel: true,
        tipo: {
          id: resolvido.tipo.id,
          nome: resolvido.tipo.nome,
          codigo_interno: resolvido.tipo.codigo_interno
        },
        apropriacao: {
          id: resolvido.apropriacao.id,
          codigo: resolvido.apropriacao.codigo,
          descricao: resolvido.apropriacao.descricao
        }
      });
    } catch (error) {
      console.error('Erro ao resolver apropriacao padrao da solicitacao', error);
      return res.status(error.statusCode || 500).json({
        error: error.message || 'Erro ao resolver apropriacao padrao da solicitacao',
        code: error.code || undefined
      });
    }
  },

  /**
   * Define (ou remove) a apropriacao padrao de uma obra + tipo.
   * apropriacao_id nulo remove o vinculo.
   */
  async salvar(req, res) {
    try {
      const obraId = toInt(req.body?.obra_id);
      const tipoId = toInt(req.body?.tipo_solicitacao_id);

      if (!obraId || !tipoId) {
        return res.status(400).json({ error: 'Obra e tipo de solicitacao sao obrigatorios' });
      }

      // Remocao so acontece com null explicito. Campo ausente ou valor invalido e erro:
      // tratar lixo como "remover" apagaria o vinculo sem o usuario perceber.
      if (!temChave(req.body, 'apropriacao_id')) {
        return res.status(400).json({
          error: 'Informe apropriacao_id. Use null para remover o vinculo.'
        });
      }

      const removerVinculo = req.body.apropriacao_id === null;
      const apropriacaoId = removerVinculo ? null : toInt(req.body.apropriacao_id);

      if (!removerVinculo && !apropriacaoId) {
        return res.status(400).json({ error: 'Apropriacao invalida' });
      }

      const existente = await ObraTipoApropriacaoPadrao.findOne({
        where: { obra_id: obraId, tipo_solicitacao_id: tipoId }
      });

      // Remocao vem antes de validar o tipo: se um tipo deixar de ser elegivel, o vinculo
      // ja gravado precisa continuar removivel — do contrario fica preso sem tela que o exiba.
      if (removerVinculo) {
        if (existente) await existente.destroy();
        return res.json({ ok: true, removido: true });
      }

      // O tipo precisa existir, estar ativo e ser um dos que recebem apropriacao automatica,
      // senao o vinculo fica gravado sem nenhuma tela que o exiba ou consuma.
      const tipo = await TipoSolicitacao.findByPk(tipoId, {
        attributes: ['id', 'codigo_interno', 'ativo']
      });

      if (!tipo) {
        return res.status(400).json({ error: 'Tipo de solicitacao nao encontrado' });
      }

      if (!TIPOS_COM_APROPRIACAO_PADRAO.includes(tipo.codigo_interno)) {
        return res.status(400).json({
          error: 'Tipo de solicitacao nao aceita apropriacao padrao'
        });
      }

      if (!tipo.ativo) {
        return res.status(400).json({ error: 'Tipo de solicitacao inativo' });
      }

      // A apropriacao precisa pertencer a obra e estar ativa: vincular apropriacao
      // desativada faria a Nova Solicitacao preencher um valor que nao pode ser usado.
      const apropriacao = await Apropriacao.findOne({
        where: { id: apropriacaoId, obra_id: obraId, ativo: true },
        attributes: ['id', 'codigo', 'descricao', 'somadora', 'macro_formulario', 'ativo']
      });

      if (!apropriacao || !apropriacaoPodeReceberLancamento(apropriacao)) {
        return res.status(400).json({
          error: 'Apropriacao nao encontrada, inativa, nao habilitada ou nao pertence a obra informada'
        });
      }

      if (tipoUsaApropriacaoAutomatica(tipo.codigo_interno)) {
        const tiposAutomaticos = await TipoSolicitacao.findAll({
          where: { codigo_interno: { [Op.in]: TIPOS_APROPRIACAO_AUTOMATICA } },
          attributes: ['id']
        });
        const idsAutomaticos = tiposAutomaticos.map((item) => Number(item.id));
        const vinculoDuplicado = await ObraTipoApropriacaoPadrao.findOne({
          where: {
            obra_id: obraId,
            apropriacao_id: apropriacaoId,
            ativo: true,
            tipo_solicitacao_id: {
              [Op.in]: idsAutomaticos,
              [Op.ne]: tipoId
            }
          }
        });
        if (vinculoDuplicado) {
          return res.status(409).json({
            error: 'As etapas com apropriacao automatica precisam usar apropriacoes distintas.'
          });
        }
      }

      // Serializa alteracoes da mesma obra. Alem de evitar colisao no upsert de
      // obra+tipo, o lock impede duas requisicoes simultaneas de atribuir a mesma
      // apropriacao aos dois tipos automaticos depois da validacao acima.
      await sequelize.transaction(async (transaction) => {
        await Obra.findByPk(obraId, {
          attributes: ['id'],
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (tipoUsaApropriacaoAutomatica(tipo.codigo_interno)) {
          const tiposAutomaticos = await TipoSolicitacao.findAll({
            where: { codigo_interno: { [Op.in]: TIPOS_APROPRIACAO_AUTOMATICA } },
            attributes: ['id'],
            transaction
          });
          const idsAutomaticos = tiposAutomaticos.map((item) => Number(item.id));
          const vinculoDuplicado = await ObraTipoApropriacaoPadrao.findOne({
            where: {
              obra_id: obraId,
              apropriacao_id: apropriacaoId,
              ativo: true,
              tipo_solicitacao_id: {
                [Op.in]: idsAutomaticos,
                [Op.ne]: tipoId
              }
            },
            transaction
          });
          if (vinculoDuplicado) {
            const erro = new Error(
              'As etapas com apropriacao automatica precisam usar apropriacoes distintas.'
            );
            erro.statusCode = 409;
            throw erro;
          }
        }

        const vinculoAtual = await ObraTipoApropriacaoPadrao.findOne({
          where: { obra_id: obraId, tipo_solicitacao_id: tipoId },
          transaction,
          lock: transaction.LOCK.UPDATE
        });

        if (vinculoAtual) {
          vinculoAtual.apropriacao_id = apropriacaoId;
          vinculoAtual.ativo = true;
          vinculoAtual.atualizado_por = req.user?.id || null;
          await vinculoAtual.save({ transaction });
          return;
        }

        await ObraTipoApropriacaoPadrao.create({
          obra_id: obraId,
          tipo_solicitacao_id: tipoId,
          apropriacao_id: apropriacaoId,
          criado_por: req.user?.id || null,
          atualizado_por: req.user?.id || null
        }, { transaction });
      });

      return res.json({
        ok: true,
        vinculo: {
          apropriacao_id: apropriacao.id,
          codigo: apropriacao.codigo,
          descricao: apropriacao.descricao
        }
      });
    } catch (error) {
      console.error('Erro ao salvar apropriacao padrao', error);
      return res.status(error.statusCode || 500).json({ error: error.message || 'Erro ao salvar apropriacao padrao' });
    }
  }
};
