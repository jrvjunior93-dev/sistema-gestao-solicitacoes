// Mapeamento configurável setor+estado → ação em destaque no detalhe da
// solicitação. `status_global` NULL é curinga; o match mais específico
// (setor+status) vence o genérico (setor+NULL). Sem linha correspondente,
// o detalhe mantém as ações genéricas atuais. A `acao` referencia apenas
// handlers que JÁ existem no detalhe (catálogo no frontend) — esta tabela
// reordena o que a tela já faz, nunca cria regra nova.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('AcaoPrincipalSetor', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    setor: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    status_global: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    acao: {
      type: DataTypes.STRING(80),
      allowNull: false
    },
    rotulo: {
      type: DataTypes.STRING(120),
      allowNull: true
    },
    ativo: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true
    }
  }, {
    tableName: 'acoes_principais_setor',
    timestamps: true
  });
};
