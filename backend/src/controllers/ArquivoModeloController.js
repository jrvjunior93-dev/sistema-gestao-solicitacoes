const { Op } = require('sequelize');
const { ArquivoModelo, ConfiguracaoSistema, User, Setor } = require('../models');
const { uploadToS3, getPresignedUrl } = require('../services/s3');
const { normalizeOriginalName } = require('../utils/fileName');

const KEY_PAGINAS = 'ARQUIVOS_MODELOS_PAGINAS';
const KEY_UPLOADERS = 'ARQUIVOS_MODELOS_UPLOADERS';

const PAGINAS_PADRAO = [
  { codigo: 'GERENCIA_PROCESSOS', nome: 'Gerência de Processos', ativo: true },
  { codigo: 'SESMT', nome: 'SESMT', ativo: true },
  { codigo: 'DEPARTAMENTO_PESSOAL', nome: 'Departamento Pessoal', ativo: true },
  { codigo: 'FINANCEIRO', nome: 'Financeiro', ativo: true },
  { codigo: 'RH', nome: 'RH', ativo: true },
  { codigo: 'JURIDICO', nome: 'Jurídico', ativo: true },
  { codigo: 'COMPRAS', nome: 'Compras', ativo: true },
  { codigo: 'MARKETING', nome: 'Marketing', ativo: true }
];

function parseJsonSeguro(valor, fallback) {
  try {
    if (!valor) return fallback;
    const parsed = JSON.parse(valor);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function normalizarCodigo(nome = '') {
  return String(nome)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function normalizarPaginas(paginas) {
  if (!Array.isArray(paginas)) return [];
  const usados = new Set();
  return paginas
    .map(item => {
      const nome = String(item?.nome || '').trim();
      const codigoBase = String(item?.codigo || '').trim() || normalizarCodigo(nome);
      const codigo = normalizarCodigo(codigoBase);
      if (!nome || !codigo || usados.has(codigo)) return null;
      usados.add(codigo);
      return {
        codigo,
        nome,
        ativo: item?.ativo !== false
      };
    })
    .filter(Boolean);
}

async function getConfig(chave, fallback) {
  const registro = await ConfiguracaoSistema.findOne({ where: { chave } });
  return parseJsonSeguro(registro?.valor, fallback);
}

async function setConfig(chave, valorObj) {
  const valor = JSON.stringify(valorObj);
  const registro = await ConfiguracaoSistema.findOne({ where: { chave } });
  if (registro) {
    await registro.update({ valor });
    return;
  }
  await ConfiguracaoSistema.create({ chave, valor });
}

async function getPaginas() {
  const configuradas = await getConfig(KEY_PAGINAS, null);
  const normalizadas = normalizarPaginas(configuradas);
  if (normalizadas.length > 0) return normalizadas;
  return PAGINAS_PADRAO;
}

async function getUploaders() {
  const uploaders = await getConfig(KEY_UPLOADERS, {});
  if (!uploaders || typeof uploaders !== 'object' || Array.isArray(uploaders)) return {};
  return Object.fromEntries(
    Object.entries(uploaders).map(([codigo, ids]) => [
      normalizarCodigo(codigo),
      Array.isArray(ids) ? ids.map(Number).filter(Number.isFinite) : []
    ])
  );
}

function isSuperadmin(req) {
  return String(req.user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
}

function isAdmin(req) {
  return String(req.user?.perfil || '').trim().toUpperCase() === 'ADMIN';
}

function podeUploadPagina(req, paginaCodigo, uploadersByPagina) {
  if (isSuperadmin(req)) return true;
  if (!isAdmin(req)) return false;

  const lista = uploadersByPagina[String(paginaCodigo || '').toUpperCase()] || [];
  if (lista.length === 0) return true; // fallback para nao bloquear ADMIN existente
  return lista.includes(Number(req.user?.id));
}

module.exports = {
  async contexto(req, res) {
    try {
      const [paginas, uploadersByPagina] = await Promise.all([
        getPaginas(),
        getUploaders()
      ]);

      const uploadPermitidoPorPagina = {};
      paginas.forEach(pagina => {
        uploadPermitidoPorPagina[pagina.codigo] = podeUploadPagina(req, pagina.codigo, uploadersByPagina);
      });

      return res.json({
        paginas,
        uploadersByPagina,
        podeGerenciar: isSuperadmin(req),
        uploadPermitidoPorPagina
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar contexto de arquivos modelos' });
    }
  },

  async salvarPaginas(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const paginas = normalizarPaginas(req.body?.paginas);
      if (!paginas.length) {
        return res.status(400).json({ error: 'Informe ao menos uma pagina valida' });
      }
      await setConfig(KEY_PAGINAS, paginas);
      return res.json({ paginas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar paginas' });
    }
  },

  async criarPagina(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const nome = String(req.body?.nome || '').trim();
      if (!nome) return res.status(400).json({ error: 'Nome da pagina e obrigatorio' });

      const paginas = await getPaginas();
      const codigo = normalizarCodigo(nome);
      if (!codigo) return res.status(400).json({ error: 'Nome da pagina invalido' });
      if (paginas.some(p => p.codigo === codigo)) {
        return res.status(409).json({ error: 'Ja existe uma pagina com esse nome/codigo' });
      }

      const novasPaginas = [...paginas, { codigo, nome, ativo: true }];
      await setConfig(KEY_PAGINAS, novasPaginas);
      return res.status(201).json({ codigo, nome, ativo: true });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao criar pagina' });
    }
  },

  async ativarPagina(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const codigo = normalizarCodigo(req.params.codigo);
      const paginas = await getPaginas();
      const novasPaginas = paginas.map(p => (p.codigo === codigo ? { ...p, ativo: true } : p));
      await setConfig(KEY_PAGINAS, novasPaginas);
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao ativar pagina' });
    }
  },

  async desativarPagina(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const codigo = normalizarCodigo(req.params.codigo);
      const paginas = await getPaginas();
      const novasPaginas = paginas.map(p => (p.codigo === codigo ? { ...p, ativo: false } : p));
      await setConfig(KEY_PAGINAS, novasPaginas);
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao desativar pagina' });
    }
  },

  async salvarUploaders(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const paginas = await getPaginas();
      const codigos = new Set(paginas.map(p => p.codigo));
      const payload = req.body?.uploadersByPagina;
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return res.status(400).json({ error: 'Formato invalido de uploaders' });
      }

      const normalizado = {};
      Object.entries(payload).forEach(([codigo, ids]) => {
        const c = normalizarCodigo(codigo);
        if (!codigos.has(c)) return;
        normalizado[c] = Array.isArray(ids)
          ? ids.map(Number).filter(Number.isFinite)
          : [];
      });

      await setConfig(KEY_UPLOADERS, normalizado);
      return res.json({ uploadersByPagina: normalizado });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar permissao de upload' });
    }
  },

  async listarAdmins(req, res) {
    try {
      if (!isSuperadmin(req)) return res.status(403).json({ error: 'Acesso negado' });
      const admins = await User.findAll({
        where: {
          perfil: { [Op.in]: ['ADMIN', 'SUPERADMIN'] },
          ativo: true
        },
        include: [{ model: Setor, as: 'setor', attributes: ['id', 'nome', 'codigo'] }],
        attributes: ['id', 'nome', 'email', 'perfil', 'setor_id'],
        order: [['nome', 'ASC']]
      });
      return res.json(admins);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar admins' });
    }
  },

  async listarArquivos(req, res) {
    try {
      const paginaCodigo = normalizarCodigo(req.query?.pagina_codigo);
      if (!paginaCodigo) return res.status(400).json({ error: 'pagina_codigo e obrigatorio' });

      const arquivos = await ArquivoModelo.findAll({
        where: { pagina_codigo: paginaCodigo, ativo: true },
        include: [{ model: User, as: 'criadoPor', attributes: ['id', 'nome', 'email'] }],
        order: [['createdAt', 'DESC']]
      });

      return res.json(arquivos);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao listar arquivos modelos' });
    }
  },

  async upload(req, res) {
    try {
      const paginaCodigo = normalizarCodigo(req.body?.pagina_codigo);
      if (!paginaCodigo) return res.status(400).json({ error: 'pagina_codigo e obrigatorio' });
      if (!req.file) return res.status(400).json({ error: 'Arquivo e obrigatorio' });

      const [paginas, uploadersByPagina] = await Promise.all([getPaginas(), getUploaders()]);
      const pagina = paginas.find(p => p.codigo === paginaCodigo);
      if (!pagina || !pagina.ativo) {
        return res.status(400).json({ error: 'Pagina invalida ou desativada' });
      }

      if (!podeUploadPagina(req, paginaCodigo, uploadersByPagina)) {
        return res.status(403).json({ error: 'Sem permissao para upload nesta pagina' });
      }

      const nomeOriginal = normalizeOriginalName(req.file.originalname);
      const url = await uploadToS3(req.file, `modelos/${paginaCodigo}`);
      const registro = await ArquivoModelo.create({
        pagina_codigo: paginaCodigo,
        nome_original: nomeOriginal,
        arquivo_url: url,
        mimetype: req.file.mimetype,
        tamanho_bytes: req.file.size,
        criado_por_id: req.user.id
      });

      return res.status(201).json(registro);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao enviar arquivo modelo' });
    }
  },

  async obterLink(req, res) {
    try {
      const arquivo = await ArquivoModelo.findByPk(req.params.id);
      if (!arquivo || !arquivo.ativo) return res.status(404).json({ error: 'Arquivo nao encontrado' });
      const url = await getPresignedUrl(arquivo.arquivo_url, 300);
      return res.json({ url });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao gerar link de acesso' });
    }
  },

  async remover(req, res) {
    try {
      const arquivo = await ArquivoModelo.findByPk(req.params.id);
      if (!arquivo || !arquivo.ativo) return res.status(404).json({ error: 'Arquivo nao encontrado' });

      if (!isSuperadmin(req)) {
        const uploadersByPagina = await getUploaders();
        const permitido = podeUploadPagina(req, arquivo.pagina_codigo, uploadersByPagina);
        if (!permitido) {
          return res.status(403).json({ error: 'Sem permissao para excluir arquivo desta pagina' });
        }
      }

      await arquivo.update({ ativo: false });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir arquivo' });
    }
  }
};
