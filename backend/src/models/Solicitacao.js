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
        allowNull: true,
        unique: true
      },
      codigo_contrato: {
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
