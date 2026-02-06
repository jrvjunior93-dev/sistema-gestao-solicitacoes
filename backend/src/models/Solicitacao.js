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
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
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
        type: DataTypes.DATE,
        allowNull: true
      },
      data_inicio_medicao: {
        type: DataTypes.DATE,
        allowNull: true
      },
      data_fim_medicao: {
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
      timestamps: true
    }
  );

  return Solicitacao;
};
