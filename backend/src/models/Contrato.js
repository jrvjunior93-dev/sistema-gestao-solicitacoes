module.exports = (sequelize, DataTypes) => {
  const Contrato = sequelize.define(
    'Contrato',
    {
      id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      obra_id: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      codigo: {
        type: DataTypes.STRING,
        allowNull: false
      },
      ref_contrato: {
        type: DataTypes.STRING,
        allowNull: true
      },
      descricao: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      valor_total: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true
      },
      ajuste_solicitado: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0
      },
      ajuste_pago: {
        type: DataTypes.DECIMAL(12, 2),
        allowNull: true,
        defaultValue: 0
      },
      tipo_macro_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      tipo_sub_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'contratos',
      timestamps: true
    }
  );

  return Contrato;
};
