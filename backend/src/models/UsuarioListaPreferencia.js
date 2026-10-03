// Preferências de exibição das listas (ListaAvancada), por usuário,
// por lista e POR TIPO: colunas visíveis, larguras, filtros de tela,
// arranjo de blocos, modo de visualização. JSON serializado em
// `preferencias`, uma linha por (usuario_id, lista, tipo).
//
// Por que separado por tipo, e não um JSON só: o reset precisa apagar um
// tipo sem levar os outros junto, e com JSON único duas abas abertas se
// sobrescrevem — arrastar uma coluna reescreveria blocos e filtros.
//
// `lista` cabe 160 caracteres porque as chaves de tabela do frontend são
// hierárquicas (`tabela:auditoria-operacional:produtividade-financeira`).
// Os valores aceitos em `tipo` são validados em
// src/validators/listaPreferenciasValidators.js.
module.exports = (sequelize, DataTypes) => {
  return sequelize.define('UsuarioListaPreferencia', {
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
    tipo: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: 'geral'
    },
    preferencias: {
      type: DataTypes.TEXT,
      allowNull: false
    }
  }, {
    tableName: 'usuario_lista_preferencias',
    timestamps: true
  });
};
