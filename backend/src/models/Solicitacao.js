module.exports = (sequelize, DataTypes) => {
  const Solicitacao = sequelize.define(
    'Solicitacao',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      codigo: {
        type: DataTypes.STRING,
        allowNull: true
      },
      codigo_contrato: {
        type: DataTypes.STRING,
        allowNull: true
      },
      numero_pedido: {
        type: DataTypes.STRING,
        allowNull: true
      },
      numero_sienge: {
        type: DataTypes.STRING,
        allowNull: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      parceiro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      apropriacao_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      tipo_solicitacao_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
          model: 'tipo_solicitacao',
          key: 'id'
        }
      },
      tipo_macro_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'tipo_solicitacao',
          key: 'id'
        }
      },
      tipo_sub_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'tipos_sub_contrato',
          key: 'id'
        }
      },
      contrato_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
          model: 'contratos',
          key: 'id'
        }
      },

      descricao: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      justificativa: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      favorecido_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      forma_pagamento_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      favorecido_chave_pix: {
        type: DataTypes.STRING(255),
        allowNull: true
      },
      dados_pagamento: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      despesa_eventual_declaracoes: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      valor: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true
      },
      status_global: {
        type: DataTypes.STRING,
        allowNull: false
      },
      area_responsavel: {
        type: DataTypes.STRING,
        allowNull: false
      },
      criado_por: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      data_vencimento: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      data_demissao: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      data_inicio_medicao: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      data_fim_medicao: {
        type: DataTypes.DATEONLY,
        allowNull: true
      },
      fluxo_aprovacao_diretoria: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      diretoria_fluxo_codigo: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      setor_destino_pos_aprovacao: {
        type: DataTypes.STRING(120),
        allowNull: true
      },
      aprovada_diretoria_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      aprovada_diretoria_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      prioridade_diretoria_ativa: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      prioridade_diretoria_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      prioridade_diretoria_lote_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      valor_pago_acumulado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      financeiro_pendencia_prazo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      financeiro_pendencia_tipo: {
        type: DataTypes.STRING(80),
        allowNull: true
      },
      financeiro_pendencia_observacao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      financeiro_pendencia_marcado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      financeiro_pendencia_marcado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      financeiro_pendencia_regularizado_por: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      financeiro_pendencia_regularizado_em: {
        type: DataTypes.DATE,
        allowNull: true
      },
      cancelada: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    },
    {
      tableName: 'solicitacoes',
      hooks: {
        async afterUpdate(solicitacao, options) {
          if (!solicitacao.changed('area_responsavel')) return;
          const normalizar = (valor) => String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .trim()
            .replace(/[\s-]+/g, '_')
            .toUpperCase();
          if (normalizar(solicitacao.area_responsavel) !== 'FINANCEIRO') return;
          if (normalizar(solicitacao.previous('area_responsavel')) === 'FINANCEIRO') return;

          // Require tardio evita ciclo durante o carregamento do indice de models. Qualquer fluxo
          // que devolva a solicitacao ao Financeiro libera os titulos na mesma transacao.
          const { desbloquearTitulosVinculados } = require('../services/tituloBloqueioRetornoObraService');
          await desbloquearTitulosVinculados({
            solicitacaoId: solicitacao.id,
            transaction: options.transaction || null
          });
        }
      },
      timestamps: true
    }
  );

  return Solicitacao;
};
