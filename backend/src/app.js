const express = require('express');
const cors = require('cors');
const multer = require('multer');
const app = express();

const db = require('./models');
const routes = require('./routes');
const path = require('path');
const fs = require('fs');
const uploadMaxMb = Number(process.env.UPLOAD_MAX_FILE_SIZE_MB || 10);

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
    if (/^https:\/\/([a-z0-9-]+\.)*jrfluxy\.com\.br$/.test(origin)) {
      return callback(null, true);
    }
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
app.options('*', cors(corsOptions));
app.use(express.json());

app.use(
  '/uploads',
  express.static(path.resolve(__dirname, '..', 'uploads'))
);

app.use('/api', routes);

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: `Arquivo excede o limite de ${uploadMaxMb}MB.` });
    }
    return res.status(400).json({ error: 'Falha no upload do arquivo.' });
  }

  if (err && /Tipo de arquivo/i.test(String(err.message || ''))) {
    return res.status(400).json({ error: 'Tipo de arquivo nao permitido.' });
  }

  return next(err);
});

const staticDir = path.resolve(__dirname, '..', 'public');
const indexFile = path.join(staticDir, 'index.html');

if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

async function tableExists(tableName) {
  const [rows] = await db.sequelize.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${db.sequelize.escape(tableName)}`
  );

  return Number(rows?.[0]?.total || 0) > 0;
}

async function columnExists(tableName, columnName) {
  const [rows] = await db.sequelize.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ${db.sequelize.escape(tableName)}
        AND COLUMN_NAME = ${db.sequelize.escape(columnName)}`
  );

  return Number(rows?.[0]?.total || 0) > 0;
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

  // Itens de apropriacao no contrato
  try {
    await db.sequelize.query(
      "ALTER TABLE contratos ADD COLUMN itens_apropriacao TEXT NULL"
    );
  } catch (error) {
    // ignora se a coluna ja existe
  }

  // Modulo de compras - permissao por usuario
  try {
    const hasColumn = await columnExists('users', 'pode_criar_solicitacao_compra');
    if (!hasColumn) {
      await db.sequelize.query(
        "ALTER TABLE users ADD COLUMN pode_criar_solicitacao_compra BOOLEAN NOT NULL DEFAULT 0"
      );
    }

    await db.sequelize.query(
      "UPDATE users SET pode_criar_solicitacao_compra = 1 WHERE perfil IN ('SUPERADMIN', 'ADMIN')"
    );
  } catch (error) {
    // ignora se nao conseguir aplicar agora
  }

  // Modulo de compras - tabelas auxiliares
  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS unidades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        sigla VARCHAR(50) NOT NULL,
        ativo BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    );
  } catch (error) {
    // ignora se nao conseguir criar
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS categorias (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL UNIQUE,
        ativo BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )`
    );
  } catch (error) {
    // ignora se nao conseguir criar
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS insumos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        codigo VARCHAR(255) UNIQUE,
        descricao TEXT,
        unidade_id INT NOT NULL,
        categoria_id INT NULL,
        ativo BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_insumos_unidade FOREIGN KEY (unidade_id) REFERENCES unidades(id),
        CONSTRAINT fk_insumos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id)
      )`
    );
  } catch (error) {
    // ignora se a tabela/constraints ja existirem
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS apropriacoes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        obra_id INT NOT NULL,
        codigo VARCHAR(255) NOT NULL,
        descricao VARCHAR(255) NULL,
        ativo BOOLEAN DEFAULT TRUE,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_apropriacoes_obra FOREIGN KEY (obra_id) REFERENCES obras(id)
      )`
    );
  } catch (error) {
    // ignora se a tabela/constraints ja existirem
  }

  try {
    const hasSolicitacaoCompras = await tableExists('solicitacao_compras');
    if (hasSolicitacaoCompras) {
      const hasSolicitacaoPrincipal = await columnExists('solicitacao_compras', 'solicitacao_principal_id');
      if (!hasSolicitacaoPrincipal) {
        await db.sequelize.query(
          'ALTER TABLE solicitacao_compras ADD COLUMN solicitacao_principal_id INT NULL'
        );
      }
    }
  } catch (error) {
    // ignora se nao conseguir ajustar
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS solicitacao_compras (
        id INT AUTO_INCREMENT PRIMARY KEY,
        obra_id INT NOT NULL,
        solicitante_id INT NOT NULL,
        solicitacao_principal_id INT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'ABERTA',
        observacoes TEXT NULL,
        necessario_para DATE NULL,
        link_geral VARCHAR(500) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_solicitacao_compras_obra FOREIGN KEY (obra_id) REFERENCES obras(id),
        CONSTRAINT fk_solicitacao_compras_solicitante FOREIGN KEY (solicitante_id) REFERENCES users(id)
      )`
    );
  } catch (error) {
    // ignora se a tabela/constraints ja existirem
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS solicitacao_compra_itens (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitacao_compra_id INT NOT NULL,
        insumo_id INT NOT NULL,
        unidade_id INT NOT NULL,
        apropriacao_id INT NOT NULL,
        quantidade DECIMAL(12,2) NOT NULL,
        especificacao TEXT NOT NULL,
        necessario_para DATE NULL,
        link_produto VARCHAR(500) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_solicitacao_compra_itens_solicitacao FOREIGN KEY (solicitacao_compra_id) REFERENCES solicitacao_compras(id) ON DELETE CASCADE,
        CONSTRAINT fk_solicitacao_compra_itens_insumo FOREIGN KEY (insumo_id) REFERENCES insumos(id),
        CONSTRAINT fk_solicitacao_compra_itens_unidade FOREIGN KEY (unidade_id) REFERENCES unidades(id),
        CONSTRAINT fk_solicitacao_compra_itens_apropriacao FOREIGN KEY (apropriacao_id) REFERENCES apropriacoes(id)
      )`
    );
  } catch (error) {
    // ignora se a tabela/constraints ja existirem
  }

  try {
    await db.sequelize.query(
      `CREATE TABLE IF NOT EXISTS solicitacao_compra_itens_manuais (
        id INT AUTO_INCREMENT PRIMARY KEY,
        solicitacao_compra_id INT NOT NULL,
        apropriacao_id INT NOT NULL,
        nome_manual VARCHAR(255) NOT NULL,
        unidade_sigla_manual VARCHAR(50) NOT NULL,
        quantidade DECIMAL(12,2) NOT NULL,
        especificacao TEXT NOT NULL,
        necessario_para DATE NULL,
        link_produto VARCHAR(500) NULL,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT fk_solicitacao_compra_itens_manuais_solicitacao FOREIGN KEY (solicitacao_compra_id) REFERENCES solicitacao_compras(id) ON DELETE CASCADE,
        CONSTRAINT fk_solicitacao_compra_itens_manuais_apropriacao FOREIGN KEY (apropriacao_id) REFERENCES apropriacoes(id)
      )`
    );
  } catch (error) {
    // ignora se a tabela/constraints ja existirem
  }

  try {
    const hasUnidades = await tableExists('unidades');
    if (hasUnidades) {
      const [rows] = await db.sequelize.query('SELECT COUNT(*) AS total FROM unidades');
      if (Number(rows?.[0]?.total || 0) === 0) {
        await db.sequelize.query(
          `INSERT INTO unidades (nome, sigla) VALUES
            ('Metro', 'm'),
            ('Metro Quadrado', 'm2'),
            ('Metro Cubico', 'm3'),
            ('Quilograma', 'kg'),
            ('Tonelada', 't'),
            ('Litro', 'L'),
            ('Unidade', 'un'),
            ('Caixa', 'cx'),
            ('Pacote', 'pct'),
            ('Saco', 'sc')`
        );
      }
    }
  } catch (error) {
    // ignora se nao conseguir popular
  }

  try {
    const hasCategorias = await tableExists('categorias');
    if (hasCategorias) {
      const [rows] = await db.sequelize.query('SELECT COUNT(*) AS total FROM categorias');
      if (Number(rows?.[0]?.total || 0) === 0) {
        await db.sequelize.query(
          `INSERT INTO categorias (nome) VALUES
            ('Material de Construcao'),
            ('Ferramentas'),
            ('Equipamentos'),
            ('Eletrica'),
            ('Hidraulica'),
            ('Acabamento'),
            ('Outros')`
        );
      }
    }
  } catch (error) {
    // ignora se nao conseguir popular
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
