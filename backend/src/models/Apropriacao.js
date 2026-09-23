module.exports = (sequelize, DataTypes) => {
  const Apropriacao = sequelize.define(
    'Apropriacao',
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
      descricao: {
        type: DataTypes.STRING,
        allowNull: true
      },
      valor_orcado: {
        type: DataTypes.DECIMAL(14, 2),
        allowNull: false,
        defaultValue: 0
      },
      somadora: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      macro_formulario: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      ordem_planilha: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      apropriacao_pai_id: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      ativo: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
      }
    },
    {
      tableName: 'apropriacoes',
      timestamps: true
    }
  );

  return Apropriacao;
};
