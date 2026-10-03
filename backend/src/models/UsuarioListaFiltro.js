// Filtros nomeados criados pelo usuário nas listas (ListaAvancada).
// Conteúdo do usuário — vive no banco para sobreviver a troca de
// dispositivo/navegador. JSON serializado em `filtros`.
//
// `lista` acompanha `usuario_lista_preferencias` em 160 caracteres: as
// duas tabelas usam a MESMA chave de lista, normalizada pelo mesmo
// validador, e um limite menor aqui rejeitaria chave que lá é aceita.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UsuarioListaFiltro', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    lista: {
      type: DataTypes.STRING(160),
      allowNull: false
    },
    nome: {
      type: DataTypes.STRING(120),
      allowNull: false
    },
    filtros: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'usuario_lista_filtros',
    timestamps: true
  });
};
