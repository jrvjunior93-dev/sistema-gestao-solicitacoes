// Arranjo dos blocos de uma TELA por setor (camada do administrador).
// `tela` discrimina o catálogo ('detalhe-solicitacao' | 'home') e
// `config` é JSON `[{ bloco, visivel, posicao }]` sobre um catálogo
// FIXO de blocos que a tela já possui — esta tabela apenas
// ordena/oculta; permissões e condições de tipo continuam decidindo se
// o bloco pode aparecer. O usuário sobrepõe com o próprio arranjo
// (usuario_lista_preferencias, listas 'detalhe-solicitacao' e 'home').
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('SetorDetalheLayout', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    tela: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: 'detalhe-solicitacao'
    },
    setor: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    config: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'setor_detalhe_layout',
    timestamps: true
  });
};
