// Atalhos padrão por setor. `destino_id` referencia o id do destino na
// fonte única de navegação do frontend; rótulo, ícone, rota e permissão
// vêm sempre de lá. `obrigatorio` = não removível pelo usuário (máx. 2
// por setor, validado no controller); os demais são sugestões iniciais
// que o usuário pode remover.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SetorAtalhoPadrao', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    setor: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    destino_id: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    obrigatorio: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    posicao: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'setor_atalhos_padrao',
    timestamps: true
  });
};
