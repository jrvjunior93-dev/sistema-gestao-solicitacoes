const {
  decryptSensitiveValueSafe,
  encryptSensitiveValue
} = require('../services/sensitiveFieldCrypto');

module.exports = (sequelize, DataTypes) => {
  return sequelize.define('User', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },

    nome: {
      type: DataTypes.STRING,
      allowNull: false
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: false
    },

    senha: {
      type: DataTypes.STRING,
      allowNull: false
    },

    perfil: {
      type: DataTypes.STRING,
      allowNull: false
    },

    cargo_id: {
      type: DataTypes.INTEGER,
      allowNull: true
    },
    setor_id: {
      type: DataTypes.INTEGER,
      allowNull: false
    },

    ativo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    ultimo_acesso_em: {
      type: DataTypes.DATE,
      allowNull: true
    },

    pode_criar_solicitacao_compra: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },

    pode_enviar_qualquer_setor: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },

    force_password_reset: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },

    password_reset_token_hash: {
      type: DataTypes.STRING,
      allowNull: true
    },

    password_reset_expires_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    password_changed_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    password_setup_sent_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    mfa_totp_enabled: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false
    },

    mfa_totp_secret: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        return decryptSensitiveValueSafe(this.getDataValue('mfa_totp_secret'));
      },
      set(value) {
        this.setDataValue('mfa_totp_secret', encryptSensitiveValue(value));
      }
    },

    mfa_totp_temp_secret: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        return decryptSensitiveValueSafe(this.getDataValue('mfa_totp_temp_secret'));
      },
      set(value) {
        this.setDataValue('mfa_totp_temp_secret', encryptSensitiveValue(value));
      }
    },

    mfa_totp_last_verified_at: {
      type: DataTypes.DATE,
      allowNull: true
    },

    token_version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0
    }
  }, {
    tableName: 'users',
    timestamps: true
  });
};
