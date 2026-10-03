'use strict';

const assert = require('assert');
const { Op } = require('sequelize');
const { env, validateRequiredEnv } = require('../src/config/env');

validateRequiredEnv();

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
if (!LOCAL_HOSTS.has(String(env.dbHost || '').trim().toLowerCase()) || env.dbName !== 'fluxy_main_copia') {
  throw new Error('Teste bloqueado: use somente localhost / fluxy_main_copia.');
}

const db = require('../src/models');
const {
  Insumo,
  InsumoAlias,
  InsumoCodigoSequencia,
  SolicitacaoCompra,
  SolicitacaoCompraItemManual,
  SolicitacaoCompraLog,
  Unidade,
  User
} = db;
const {
  CatalogacaoInsumoError,
  catalogarItemManual
} = require('../src/services/insumoManualCatalogacaoService');
const {
  montarItensSolicitacaoImportados,
  normalizeImportedRows
} = require('../src/services/compraItensPlanilhaService');

async function capturarSequencia() {
  const row = await InsumoCodigoSequencia.findOne({ where: { chave: 'INSUMO_CODIGO_PADRAO' } });
  return row
    ? { existe: true, id: Number(row.id), ultimo_numero: Number(row.ultimo_numero) }
    : { existe: false, id: null, ultimo_numero: null };
}

async function run() {
  const token = `CODEX-CAT-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const titulo = `[TESTE LOCAL] ${token}`;
  const idsManuais = [];
  let solicitacaoId = null;
  let transacaoCriacao = null;
  let sequenciaAntes = null;
  let resultado = null;

  try {
    await db.sequelize.authenticate();
    sequenciaAntes = await capturarSequencia();

    const usuario = await User.findOne({ order: [['id', 'ASC']] });
    const unidade = await Unidade.findOne({ where: { ativo: true }, order: [['id', 'ASC']] })
      || await Unidade.findOne({ order: [['id', 'ASC']] });
    const insumosExistentes = await Insumo.findAll({
      where: { ativo: true },
      order: [['id', 'ASC']],
      limit: 2
    });

    assert(usuario, 'O banco local precisa ter ao menos um usuario.');
    assert(unidade, 'O banco local precisa ter ao menos uma unidade.');
    assert(insumosExistentes.length >= 2, 'O banco local precisa ter ao menos dois insumos ativos.');

    const solicitacao = await SolicitacaoCompra.create({
      origem: 'NORMAL',
      titulo,
      solicitante_id: usuario.id,
      status: 'ENVIADO',
      observacoes: 'Registro temporario do teste de catalogacao; deve ser removido automaticamente.'
    });
    solicitacaoId = Number(solicitacao.id);

    const itemVinculo = await SolicitacaoCompraItemManual.create({
      solicitacao_compra_id: solicitacaoId,
      nome_manual: `${token} ALIAS EXISTENTE`,
      unidade_sigla_manual: unidade.sigla || unidade.nome || 'UN',
      quantidade: 1
    });
    idsManuais.push(Number(itemVinculo.id));

    const resultadosConcorrentes = await Promise.all([
      catalogarItemManual({
        solicitacaoCompraId: solicitacaoId,
        itemManualId: itemVinculo.id,
        usuarioId: usuario.id,
        payload: {
          acao: 'VINCULAR_EXISTENTE',
          insumo_id: insumosExistentes[0].id,
          motivo: 'Teste local de vinculo concorrente A'
        }
      }),
      catalogarItemManual({
        solicitacaoCompraId: solicitacaoId,
        itemManualId: itemVinculo.id,
        usuarioId: usuario.id,
        payload: {
          acao: 'VINCULAR_EXISTENTE',
          insumo_id: insumosExistentes[0].id,
          motivo: 'Teste local de vinculo concorrente B'
        }
      })
    ]);
    assert.deepStrictEqual(
      resultadosConcorrentes.map((entry) => entry.ja_catalogado).sort(),
      [false, true]
    );

    await catalogarItemManual({
      solicitacaoCompraId: solicitacaoId,
      itemManualId: itemVinculo.id,
      usuarioId: usuario.id,
      payload: {
        acao: 'VINCULAR_EXISTENTE',
        insumo_id: insumosExistentes[1].id,
        motivo: 'Teste local de correcao auditavel',
        corrigir_vinculo: true
      }
    });

    const itemCorrigido = await SolicitacaoCompraItemManual.findByPk(itemVinculo.id);
    assert.strictEqual(Number(itemCorrigido.insumo_catalogado_id), Number(insumosExistentes[1].id));
    const logsVinculo = await SolicitacaoCompraLog.findAll({ where: { solicitacao_compra_id: solicitacaoId } });
    assert.deepStrictEqual(
      logsVinculo.map((entry) => entry.tipo_acao).sort(),
      ['ITEM_MANUAL_CATALOGACAO_CORRIGIDA', 'ITEM_MANUAL_CATALOGADO']
    );

    const itemDuplicado = await SolicitacaoCompraItemManual.create({
      solicitacao_compra_id: solicitacaoId,
      nome_manual: `${token} DUPLICADO`,
      unidade_sigla_manual: unidade.sigla || unidade.nome || 'UN',
      quantidade: 1
    });
    idsManuais.push(Number(itemDuplicado.id));

    let erroDuplicado = null;
    try {
      await catalogarItemManual({
        solicitacaoCompraId: solicitacaoId,
        itemManualId: itemDuplicado.id,
        usuarioId: usuario.id,
        payload: {
          acao: 'CRIAR_INSUMO',
          nome: insumosExistentes[0].nome,
          unidade_id: unidade.id,
          motivo: 'Teste local de bloqueio de duplicidade'
        }
      });
    } catch (error) {
      erroDuplicado = error;
    }
    assert(erroDuplicado instanceof CatalogacaoInsumoError);
    assert.strictEqual(erroDuplicado.code, 'INSUMO_DUPLICADO_SUGERIDO');

    transacaoCriacao = await db.sequelize.transaction();
    const aliasNovo = `${token} DESCRICAO ORIGINAL`;
    const itemNovo = await SolicitacaoCompraItemManual.create({
      solicitacao_compra_id: solicitacaoId,
      nome_manual: aliasNovo,
      unidade_sigla_manual: unidade.sigla || unidade.nome || 'UN',
      quantidade: 2
    }, { transaction: transacaoCriacao });

    const criado = await catalogarItemManual({
      solicitacaoCompraId: solicitacaoId,
      itemManualId: itemNovo.id,
      usuarioId: usuario.id,
      transaction: transacaoCriacao,
      payload: {
        acao: 'CRIAR_INSUMO',
        nome: `${token} NOME OFICIAL`,
        descricao: 'Insumo temporario criado pelo teste local',
        unidade_id: unidade.id,
        motivo: 'Teste local de criacao de insumo oficial'
      }
    });
    const insumoCriadoId = Number(criado.insumo.id);
    assert.match(String(criado.insumo.codigo), /^INS-\d{6}$/);

    const alias = await InsumoAlias.findOne({
      where: { origem_item_manual_id: itemNovo.id, insumo_id: insumoCriadoId, ativo: true },
      transaction: transacaoCriacao
    });
    assert(alias, 'A descricao original deve ser preservada como alias ativo.');

    const importacao = montarItensSolicitacaoImportados({
      rows: normalizeImportedRows([{ Descricao: aliasNovo, Quantidade: 1 }]),
      insumos: [criado.insumo.toJSON ? criado.insumo.toJSON() : criado.insumo],
      unidades: [unidade.toJSON ? unidade.toJSON() : unidade],
      apropriacoes: []
    });
    assert.deepStrictEqual(importacao.erros, []);
    assert.strictEqual(importacao.itens[0].manual, false);
    assert.strictEqual(Number(importacao.itens[0].insumo_id), insumoCriadoId);

    await transacaoCriacao.rollback();
    transacaoCriacao = null;
    assert.deepStrictEqual(await capturarSequencia(), sequenciaAntes);

    resultado = {
      ok: true,
      banco: env.dbName,
      host: env.dbHost,
      cenarios: [
        'vinculo existente',
        'envio simultaneo idempotente',
        'correcao auditavel',
        'bloqueio de duplicidade',
        'criacao com codigo automatico',
        'alias pesquisavel e reutilizado na importacao'
      ]
    };
  } finally {
    if (transacaoCriacao && !transacaoCriacao.finished) {
      await transacaoCriacao.rollback();
      transacaoCriacao = null;
    }
    if (solicitacaoId) {
      await SolicitacaoCompraLog.destroy({ where: { solicitacao_compra_id: solicitacaoId } });
    }
    if (idsManuais.length) {
      await InsumoAlias.destroy({ where: { origem_item_manual_id: { [Op.in]: idsManuais } } });
      await SolicitacaoCompraItemManual.destroy({ where: { id: { [Op.in]: idsManuais } } });
    }
    if (solicitacaoId) {
      await SolicitacaoCompra.destroy({ where: { id: solicitacaoId } });
    }

    const [solicitacoesRestantes, itensRestantes, aliasesRestantes, logsRestantes] = await Promise.all([
      solicitacaoId ? SolicitacaoCompra.count({ where: { id: solicitacaoId } }) : 0,
      idsManuais.length ? SolicitacaoCompraItemManual.count({ where: { id: { [Op.in]: idsManuais } } }) : 0,
      idsManuais.length ? InsumoAlias.count({ where: { origem_item_manual_id: { [Op.in]: idsManuais } } }) : 0,
      solicitacaoId ? SolicitacaoCompraLog.count({ where: { solicitacao_compra_id: solicitacaoId } }) : 0
    ]);
    assert.strictEqual(
      Number(solicitacoesRestantes) + Number(itensRestantes) + Number(aliasesRestantes) + Number(logsRestantes),
      0,
      'LIMPEZA FALHOU: registros temporarios de catalogacao permaneceram no banco.'
    );
    if (sequenciaAntes) {
      assert.deepStrictEqual(
        await capturarSequencia(),
        sequenciaAntes,
        'LIMPEZA FALHOU: a sequencia de insumos nao voltou exatamente ao estado anterior.'
      );
    }
    await db.sequelize.close();
  }

  console.log(JSON.stringify({
    ...resultado,
    limpeza: 'confirmada',
    sequencia_restaurada: true
  }, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
