const express = require('express');
const cors = require('cors');
const app = express();

const db = require('./models');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');

const allowedOrigins = new Set([
  'https://sistema-gestao-solicitacoes.vercel.app',
  'https://api.jrfluxy.com.br',
  'https://jrfluxy.com.br',
  'https://www.jrfluxy.com.br',
  'https://csc.jrfluxy.com.br'
]);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.has(origin)) return callback(null, true);
    if (/^https:\/\/sistema-gestao-solicitacoes-.*\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());

app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '..', 'uploads'))
);

app.use('/api', routes);

const staticDir = path.resolve(__dirname, '..', 'public');
const indexFile = path.join(staticDir, 'index.html');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

async function prepararBanco() {
  try {
    await db.sequelize.query(
      "UPDATE setores SET codigo = CONCAT('SETOR_', LPAD(id, 3, '0')) WHERE codigo IS NULL OR codigo = ''"
    );
  } catch (error) {
    // ignora se a tabela ainda nao existe
  }

  try {
    await db.sequelize.query(
      "ALTER TABLE historicos MODIFY usuario_responsavel_id INT NULL"
    );
  } catch (error) {
    // ignora se a tabela ainda nao existe
  }

  try {
    await db.sequelize.query(
      "UPDATE anexos SET tipo = UPPER(tipo) WHERE tipo IS NOT NULL"
    );
    await db.sequelize.query(
      "UPDATE anexos SET tipo = 'ANEXO' WHERE tipo IS NULL OR UPPER(tipo) NOT IN ('ANEXO','SOLICITACAO','CONTRATO','COMPROVANTE')"
    );
  } catch (error) {
    // ignora se a tabela ainda nao existe
  }

  try {
    await db.sequelize.query(
      "ALTER TABLE solicitacao_visibilidade_usuario DROP FOREIGN KEY solicitacao_visibilidade_usuario_ibfk_3"
    );
  } catch (error) {
    // ignora se a constraint nao existe
  }

  try {
    await db.sequelize.query(
      "ALTER TABLE solicitacao_visibilidade_usuario DROP FOREIGN KEY solicitacao_visibilidade_usuario_ibfk_2"
    );
  } catch (error) {
    // ignora se a constraint nao existe
  }

  // Tabela de configuracoes do sistema
  try {
    await db.sequelize.query(
      "CREATE TABLE IF NOT EXISTS configuracoes_sistema (id INT NOT NULL AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(255) NOT NULL, valor TEXT NULL, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    );
  } catch (error) {
    // ignora se nao conseguir criar
  }

  // Ajustar FK de subtipos para apontar para tipo_solicitacao
  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tipos_sub_contrato' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipos_macro_contrato' LIMIT 1"
    );
    if (rows.length > 0) {
      await db.sequelize.query(
        `ALTER TABLE tipos_sub_contrato DROP FOREIGN KEY ${rows[0].CONSTRAINT_NAME}`
      );
    }
  } catch (error) {
    // ignora se a constraint nao existe
  }

  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tipos_sub_contrato' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipo_solicitacao' LIMIT 1"
    );
    if (rows.length == 0) {
      await db.sequelize.query(
        "ALTER TABLE tipos_sub_contrato ADD CONSTRAINT tipos_sub_contrato_ibfk_1 FOREIGN KEY (tipo_macro_id) REFERENCES tipo_solicitacao(id) ON DELETE CASCADE ON UPDATE CASCADE"
      );
    }
  } catch (error) {
    // ignora se a constraint ja existe
  }


  // Ajustar FK de solicitacoes para apontar para tipo_solicitacao
  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipos_macro_contrato'"
    );
    for (const row of rows) {
      await db.sequelize.query(
        `ALTER TABLE solicitacoes DROP FOREIGN KEY ${row.CONSTRAINT_NAME}`
      );
    }
  } catch (error) {
    // ignora se a constraint nao existe
  }

  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'solicitacoes' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipo_solicitacao' LIMIT 1"
    );
    if (rows.length == 0) {
      await db.sequelize.query(
        "ALTER TABLE solicitacoes ADD CONSTRAINT solicitacoes_ibfk_tipo_macro FOREIGN KEY (tipo_macro_id) REFERENCES tipo_solicitacao(id) ON DELETE SET NULL ON UPDATE CASCADE"
      );
    }
  } catch (error) {
    // ignora se a constraint ja existe
  }

  // Ajustar FK de contratos para apontar para tipo_solicitacao
  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contratos' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipos_macro_contrato' LIMIT 1"
    );
    if (rows.length > 0) {
      await db.sequelize.query(
        `ALTER TABLE contratos DROP FOREIGN KEY ${rows[0].CONSTRAINT_NAME}`
      );
    }
  } catch (error) {
    // ignora se a constraint nao existe
  }

  try {
    await db.sequelize.query(
      "ALTER TABLE contratos MODIFY tipo_macro_id INT NULL"
    );
  } catch (error) {
    // ignora se a coluna ja eh NULL
  }

  try {
    const [rows] = await db.sequelize.query(
      "SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contratos' AND COLUMN_NAME = 'tipo_macro_id' AND REFERENCED_TABLE_NAME = 'tipo_solicitacao' LIMIT 1"
    );
    if (rows.length == 0) {
      await db.sequelize.query(
        "ALTER TABLE contratos ADD CONSTRAINT contratos_ibfk_tipo_macro FOREIGN KEY (tipo_macro_id) REFERENCES tipo_solicitacao(id) ON DELETE CASCADE ON UPDATE CASCADE"
      );
    }
  } catch (error) {
    // ignora se a constraint ja existe
  }

  // Renomear fornecedor para ref_contrato
  try {
    const [rows] = await db.sequelize.query(
      "SHOW COLUMNS FROM contratos LIKE 'fornecedor'"
    );
    if (rows.length > 0) {
      await db.sequelize.query(
        "ALTER TABLE contratos CHANGE fornecedor ref_contrato VARCHAR(255) NULL"
      );
    }
  } catch (error) {
    // ignora se a coluna ja foi renomeada
  }

  // Datas de medicao na solicitacao
  try {
    await db.sequelize.query(
      "ALTER TABLE solicitacoes ADD COLUMN data_inicio_medicao DATE NULL"
    );
  } catch (error) {
    // ignora se a coluna ja existe
  }

  try {
    await db.sequelize.query(
      "ALTER TABLE solicitacoes ADD COLUMN data_fim_medicao DATE NULL"
    );
  } catch (error) {
    // ignora se a coluna ja existe
  }
}

prepararBanco()
  .then(() => {
    if (db.User?.rawAttributes?.email) {
      db.User.rawAttributes.email.unique = false;
      db.User.refreshAttributes();
    }
    if (db.Cargo?.rawAttributes?.codigo) {
      db.Cargo.rawAttributes.codigo.unique = false;
      db.Cargo.refreshAttributes();
    }
    if (db.Setor?.rawAttributes?.codigo) {
      db.Setor.rawAttributes.codigo.unique = false;
      db.Setor.refreshAttributes();
    }
    if (db.Obra?.rawAttributes?.codigo) {
      db.Obra.rawAttributes.codigo.unique = false;
      db.Obra.refreshAttributes();
    }
    if (db.Contrato?.rawAttributes?.codigo) {
      db.Contrato.rawAttributes.codigo.unique = false;
      db.Contrato.refreshAttributes();
    }
    if (db.TipoMacroContrato?.rawAttributes?.nome) {
      db.TipoMacroContrato.rawAttributes.nome.unique = false;
      db.TipoMacroContrato.refreshAttributes();
    }
    if (db.SetorPermissao?.rawAttributes?.setor) {
      db.SetorPermissao.rawAttributes.setor.unique = false;
      db.SetorPermissao.refreshAttributes();
    }
    return db.sequelize.sync({ alter: true });
  })
  .then(() => console.log('Banco de dados sincronizado'))
  .catch(err => console.error('Erro ao sincronizar banco', err));

app.get('/health', (req, res) => res.json({ ok: true }));

if (fs.existsSync(indexFile)) {
  app.get('*', (req, res) => res.sendFile(indexFile));
}

module.exports = app;
