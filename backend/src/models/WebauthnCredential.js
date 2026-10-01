module.exports = (sequelize, DataTypes) => sequelize.define('WebauthnCredential', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  usuario_id: { type: DataTypes.INTEGER, allowNull: false },
  credential_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
  public_key: { type: DataTypes.TEXT('long'), allowNull: false },
  counter: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, defaultValue: 0 },
  transports: { type: DataTypes.JSON, allowNull: true },
  device_type: { type: DataTypes.STRING(40), allowNull: true },
  backed_up: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  nome_dispositivo: { type: DataTypes.STRING(120), allowNull: true },
  ativo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  ultimo_uso_em: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'webauthn_credentials', timestamps: true });
