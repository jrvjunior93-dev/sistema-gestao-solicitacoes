-- Tabela de Unidades
CREATE TABLE IF NOT EXISTS unidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  sigla VARCHAR(50) NOT NULL,
  ativo BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de Categorias
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  ativo BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de Insumos
CREATE TABLE IF NOT EXISTS insumos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nome VARCHAR(255) NOT NULL,
  codigo VARCHAR(255) UNIQUE,
  descricao TEXT,
  unidade_id INT NOT NULL,
  categoria_id INT,
  ativo BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- Tabela de Apropriacoes
CREATE TABLE IF NOT EXISTS apropriacoes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  obra_id INT NOT NULL,
  codigo VARCHAR(255) NOT NULL,
  descricao VARCHAR(255),
  ativo BOOLEAN DEFAULT TRUE,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (obra_id) REFERENCES obras(id)
);

-- Tabela de Solicitacoes de Compra
CREATE TABLE IF NOT EXISTS solicitacao_compras (
  id INT AUTO_INCREMENT PRIMARY KEY,
  obra_id INT NOT NULL,
  solicitante_id INT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'ABERTA',
  observacoes TEXT,
  necessario_para DATE,
  link_geral VARCHAR(500),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (obra_id) REFERENCES obras(id),
  FOREIGN KEY (solicitante_id) REFERENCES users(id)
);

-- Tabela de Itens da Solicitacao de Compra
CREATE TABLE IF NOT EXISTS solicitacao_compra_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  solicitacao_compra_id INT NOT NULL,
  insumo_id INT NOT NULL,
  unidade_id INT NOT NULL,
  apropriacao_id INT NOT NULL,
  quantidade DECIMAL(12,2) NOT NULL,
  especificacao TEXT NOT NULL,
  necessario_para DATE,
  link_produto VARCHAR(500),
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (solicitacao_compra_id) REFERENCES solicitacao_compras(id) ON DELETE CASCADE,
  FOREIGN KEY (insumo_id) REFERENCES insumos(id),
  FOREIGN KEY (unidade_id) REFERENCES unidades(id),
  FOREIGN KEY (apropriacao_id) REFERENCES apropriacoes(id)
);

INSERT IGNORE INTO unidades (nome, sigla) VALUES
('Metro', 'm'),
('Metro Quadrado', 'm2'),
('Metro Cubico', 'm3'),
('Quilograma', 'kg'),
('Tonelada', 't'),
('Litro', 'L'),
('Unidade', 'un'),
('Caixa', 'cx'),
('Pacote', 'pct'),
('Saco', 'sc');

INSERT IGNORE INTO categorias (nome) VALUES
('Material de Construcao'),
('Ferramentas'),
('Equipamentos'),
('Eletrica'),
('Hidraulica'),
('Acabamento'),
('Outros');
