'use strict';

require('dotenv').config({ path: '.env', quiet: true });

const sequelize = require('../src/database');
const { QueryTypes } = require('sequelize');

function readPositiveInteger(name, { required = true } = {}) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  if (!argument && !required) return null;
  const value = Number(argument?.slice(prefix.length));
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Informe ${prefix}<numero positivo>.`);
  }
  return value;
}

function readText(name, fallback) {
  const prefix = `--${name}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));
  return String(argument ? argument.slice(prefix.length) : fallback).trim();
}

async function loadDiagnosis(pedidoId, transaction = null) {
  const lockClause = transaction ? ' FOR UPDATE' : '';
  const pedidos = await sequelize.query(
    `SELECT id, solicitacao_compra_id, fechamento_id, fornecedor_compra_id,
            status, cancelado_por, cancelado_em, encerrado_em, motivo_cancelamento
       FROM pedido_compras
      WHERE id = :pedidoId${lockClause}`,
    { replacements: { pedidoId }, type: QueryTypes.SELECT, transaction }
  );
  const pedido = pedidos[0] || null;
  if (!pedido) throw new Error(`Pedido ${pedidoId} nao encontrado.`);
  if (String(pedido.status || '').trim().toUpperCase() !== 'CANCELADO') {
    throw new Error(`O pedido ${pedidoId} esta em ${pedido.status || '-'}; este reparo aceita apenas pedidos CANCELADOS.`);
  }

  const itens = await sequelize.query(
    `SELECT id, descricao, quantidade_pedido, quantidade_cancelada, removido,
            cancelado_em, motivo_cancelamento
       FROM pedido_compra_itens
      WHERE pedido_compra_id = :pedidoId
      ORDER BY id${lockClause}`,
    { replacements: { pedidoId }, type: QueryTypes.SELECT, transaction }
  );
  const alocacoes = await sequelize.query(
    `SELECT id, pedido_compra_item_id, item_tipo,
            solicitacao_compra_item_id, solicitacao_compra_item_manual_id,
            quantidade_alocada, status, cancelado_em, motivo_cancelamento
       FROM solicitacao_compra_alocacoes
      WHERE pedido_compra_id = :pedidoId
      ORDER BY id${lockClause}`,
    { replacements: { pedidoId }, type: QueryTypes.SELECT, transaction }
  );

  return { pedido, itens, alocacoes };
}

async function main() {
  const pedidoId = readPositiveInteger('pedido');
  const usuarioId = readPositiveInteger('usuario', { required: false });
  const motivo = readText(
    'motivo',
    'Regularizacao de cancelamento legado para liberar os itens da cotacao'
  );
  const confirm = process.argv.includes('--confirm');

  await sequelize.authenticate();
  const diagnosis = await loadDiagnosis(pedidoId);
  const itensPendentes = diagnosis.itens.filter((item) => !Boolean(item.removido));
  const alocacoesPendentes = diagnosis.alocacoes.filter(
    (item) => String(item.status || '').trim().toUpperCase() === 'ATIVA'
  );

  console.log('\nBANCO E ALVO');
  console.table([{
    host: process.env.DB_HOST,
    banco: process.env.DB_NAME,
    pedido: `PC-${String(pedidoId).padStart(5, '0')}`,
    solicitacao_compra_id: diagnosis.pedido.solicitacao_compra_id,
    fechamento_id: diagnosis.pedido.fechamento_id,
    usuario_id: usuarioId,
    modo: confirm ? 'APLICACAO' : 'SIMULACAO'
  }]);

  console.log('\nITENS DO PEDIDO');
  console.table(diagnosis.itens.map((item) => ({
    id: item.id,
    descricao: item.descricao,
    quantidade: item.quantidade_pedido,
    quantidade_cancelada: item.quantidade_cancelada,
    removido: Boolean(item.removido) ? 'SIM' : 'NAO',
    acao: Boolean(item.removido) ? 'MANTER' : 'MARCAR COMO CANCELADO'
  })));

  console.log('\nALOCACOES DO PEDIDO');
  console.table(diagnosis.alocacoes.map((item) => ({
    id: item.id,
    pedido_item_id: item.pedido_compra_item_id,
    quantidade: item.quantidade_alocada,
    status: item.status,
    acao: String(item.status || '').trim().toUpperCase() === 'ATIVA'
      ? 'CANCELAR E LIBERAR SALDO'
      : 'MANTER'
  })));

  if (!itensPendentes.length && !alocacoesPendentes.length) {
    console.log('\nPedido ja esta estruturalmente cancelado. Nenhuma alteracao necessaria.');
    return;
  }

  if (!confirm) {
    console.log('\nSIMULACAO: nenhuma alteracao foi realizada.');
    console.log(`Para aplicar: node scripts/regularizarPedidoCancelado.js --pedido=${pedidoId} --usuario=<ID> --confirm`);
    return;
  }
  if (!usuarioId) {
    throw new Error('Para aplicar, informe --usuario=<ID> para registrar a auditoria.');
  }

  await sequelize.transaction(async (transaction) => {
    const locked = await loadDiagnosis(pedidoId, transaction);
    const agora = new Date();
    const itensRegularizar = locked.itens.filter((item) => !Boolean(item.removido));
    const alocacoesRegularizar = locked.alocacoes.filter(
      (item) => String(item.status || '').trim().toUpperCase() === 'ATIVA'
    );

    await sequelize.query(
      `UPDATE pedido_compras
          SET cancelado_por = COALESCE(cancelado_por, :usuarioId),
              cancelado_em = COALESCE(cancelado_em, :agora),
              encerrado_em = COALESCE(encerrado_em, :agora),
              motivo_cancelamento = COALESCE(NULLIF(motivo_cancelamento, ''), :motivo),
              updatedAt = :agora
        WHERE id = :pedidoId
          AND status = 'CANCELADO'`,
      { replacements: { pedidoId, usuarioId, agora, motivo }, transaction }
    );

    for (const item of itensRegularizar) {
      await sequelize.query(
        `UPDATE pedido_compra_itens
            SET removido = 1,
                quantidade_cancelada = quantidade_pedido,
                cancelado_por = :usuarioId,
                cancelado_em = :agora,
                motivo_cancelamento = :motivo,
                updatedAt = :agora
          WHERE id = :itemId
            AND pedido_compra_id = :pedidoId
            AND removido = 0`,
        { replacements: { itemId: item.id, pedidoId, usuarioId, agora, motivo }, transaction }
      );
      await sequelize.query(
        `INSERT INTO pedido_compra_item_logs
          (pedido_compra_id, pedido_compra_item_id, usuario_id, acao, descricao,
           dados_anteriores, dados_novos, createdAt)
         VALUES
          (:pedidoId, :itemId, :usuarioId, 'PEDIDO_CANCELAMENTO_REGULARIZADO',
           :descricao, :dadosAnteriores, :dadosNovos, :agora)`,
        {
          replacements: {
            pedidoId,
            itemId: item.id,
            usuarioId,
            agora,
            descricao: `Item ${item.descricao} regularizado no cancelamento do pedido`,
            dadosAnteriores: JSON.stringify({ removido: false, quantidade_cancelada: item.quantidade_cancelada }),
            dadosNovos: JSON.stringify({ removido: true, quantidade_cancelada: item.quantidade_pedido, motivo })
          },
          transaction
        }
      );
    }

    if (alocacoesRegularizar.length) {
      await sequelize.query(
        `UPDATE solicitacao_compra_alocacoes
            SET status = 'CANCELADA',
                cancelado_por = :usuarioId,
                cancelado_em = :agora,
                motivo_cancelamento = :motivo,
                updatedAt = :agora
          WHERE pedido_compra_id = :pedidoId
            AND status = 'ATIVA'`,
        { replacements: { pedidoId, usuarioId, agora, motivo }, transaction }
      );
    }

    if (Number(locked.pedido.fechamento_id || 0) > 0) {
      const [totais] = await sequelize.query(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'ATIVA' THEN 1 ELSE 0 END) AS ativas
           FROM solicitacao_compra_alocacoes
          WHERE fechamento_id = :fechamentoId`,
        {
          replacements: { fechamentoId: locked.pedido.fechamento_id },
          type: QueryTypes.SELECT,
          transaction
        }
      );
      const total = Number(totais?.total || 0);
      const ativas = Number(totais?.ativas || 0);
      const statusFechamento = total > 0 && ativas === 0
        ? 'CANCELADO'
        : ativas < total
          ? 'PARCIALMENTE_CANCELADO'
          : 'CONCLUIDO';
      await sequelize.query(
        `UPDATE solicitacao_compra_fechamentos
            SET status = :statusFechamento,
                updatedAt = :agora
          WHERE id = :fechamentoId`,
        {
          replacements: {
            statusFechamento,
            agora,
            fechamentoId: locked.pedido.fechamento_id
          },
          transaction
        }
      );
    }

    await sequelize.query(
      `INSERT INTO solicitacao_compra_logs
        (solicitacao_compra_id, usuario_id, fornecedor_compra_id, tipo_acao,
         descricao, metadados, createdAt)
       VALUES
        (:solicitacaoId, :usuarioId, :fornecedorId, 'PEDIDO_CANCELAMENTO_REGULARIZADO',
         :descricao, :metadados, :agora)`,
      {
        replacements: {
          solicitacaoId: locked.pedido.solicitacao_compra_id,
          usuarioId,
          fornecedorId: locked.pedido.fornecedor_compra_id,
          agora,
          descricao: `PC-${String(pedidoId).padStart(5, '0')} teve o cancelamento legado regularizado`,
          metadados: JSON.stringify({
            pedido_compra_id: pedidoId,
            itens_regularizados: itensRegularizar.length,
            alocacoes_canceladas: alocacoesRegularizar.length,
            motivo,
            origem: 'SCRIPT_REGULARIZAR_PEDIDO_CANCELADO'
          })
        },
        transaction
      }
    );
  });

  const result = await loadDiagnosis(pedidoId);
  console.log('\nRESULTADO');
  console.table([{
    itens_ativos_restantes: result.itens.filter((item) => !Boolean(item.removido)).length,
    alocacoes_ativas_restantes: result.alocacoes.filter(
      (item) => String(item.status || '').trim().toUpperCase() === 'ATIVA'
    ).length
  }]);
  console.log('Regularizacao concluida com auditoria.');
}

main()
  .catch((error) => {
    console.error('Erro ao regularizar pedido cancelado:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close();
  });
