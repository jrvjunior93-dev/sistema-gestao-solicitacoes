// =====================================================================
// PREFERÊNCIAS E FILTROS SALVOS DAS LISTAS (componente ListaAvancada)
// ---------------------------------------------------------------------
// Persistência NO BANCO, por usuário, por lista (chave `lista`, ex.:
// 'solicitacoes', 'tabela:financeiro-titulos:geral') e por TIPO
// ('colunas', 'larguras', 'filtros', 'blocos', 'visual', 'geral'): o
// usuário não perde colunas, larguras, modo de visualização, arranjo de
// blocos nem os filtros nomeados ao trocar de máquina/navegador.
//
// SEGURANÇA — a regra que não pode ser quebrada aqui:
// nenhuma rota deste controller aceita id de usuário no caminho, na
// query ou no corpo. O dono do registro é SEMPRE `req.user.id`, lido por
// `usuarioAutenticadoId()`. Toda consulta e toda escrita carregam
// `usuario_id` no `where` — a rota de carga única (GET /me/preferencias)
// é a de maior risco: um `where` esquecido ali devolveria as
// preferências de todo mundo num payload só.
//
// NÃO HÁ CACHE DE SERVIDOR nestas rotas, de propósito. O padrão da casa
// (Map + TTL) existe para dado compartilhado; preferência é por usuário,
// então a taxa de acerto seria zero e o cache ainda serviria dado velho
// logo depois de um reset.
// =====================================================================
const { UsuarioListaPreferencia, UsuarioListaFiltro, sequelize } = require('../models');
const {
  ADOCAO_MAX_ITENS,
  LIMITE_BYTES_POR_TIPO,
  TIPOS_PREFERENCIA,
  TIPO_PADRAO,
  normalizarLista,
  normalizarTipo,
  validarEntradaPreferencia,
  validarLoteAdocao
} = require('../validators/listaPreferenciasValidators');

const NOME_MAX = 120;
const FILTRO_JSON_MAX_BYTES = 32 * 1024;
const FILTROS_SALVOS_MAX = 30;

// Única fonte do dono do registro. Se um dia alguém acrescentar uma rota
// aqui, é por esta função que ela descobre de quem é o dado — não pelo
// caminho, não pelo corpo.
function usuarioAutenticadoId(req) {
  const id = Number(req?.user?.id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseJsonSeguro(texto, fallback = {}) {
  try {
    const parsed = JSON.parse(texto);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function serializarFiltroLimitado(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null;
  const texto = JSON.stringify(valor);
  if (Buffer.byteLength(texto, 'utf8') > FILTRO_JSON_MAX_BYTES) return null;
  return texto;
}

// Escrita de UMA preferência já validada. O caminho unitário e o caminho
// em lote passam os dois por aqui — não há segunda implementação de
// gravação para o lote contornar.
async function gravarPreferencia({ usuarioId, lista, tipo, texto, transaction = null }) {
  const [registro, criado] = await UsuarioListaPreferencia.findOrCreate({
    where: { usuario_id: usuarioId, lista, tipo },
    defaults: { usuario_id: usuarioId, lista, tipo, preferencias: texto },
    transaction
  });
  if (!criado) {
    await registro.update({ preferencias: texto }, { transaction });
  }
  return criado;
}

// `tipo` chega pelo caminho (/listas/:lista/preferencias/:tipo), pela
// query (?tipo=) ou pelo corpo — nessa ordem. Sem nenhum dos três a rota
// legada continua caindo em 'geral', que é onde as linhas antigas estão.
function resolverTipoDaRequisicao(req) {
  const bruto = req.params?.tipo ?? req.query?.tipo ?? req.body?.tipo;
  return normalizarTipo(bruto, TIPO_PADRAO);
}

function respostaTipoInvalido(res) {
  return res.status(400).json({
    error: `Tipo invalido. Valores aceitos: ${TIPOS_PREFERENCIA.join(', ')}.`,
    tipos: TIPOS_PREFERENCIA
  });
}

module.exports = {
  // GET /listas/:lista/preferencias        (tipo 'geral', ou ?tipo=)
  // GET /listas/:lista/preferencias/:tipo
  async getPreferencias(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      if (!lista) return res.status(400).json({ error: 'Lista invalida' });

      const tipo = resolverTipoDaRequisicao(req);
      if (!tipo) return respostaTipoInvalido(res);

      const registro = await UsuarioListaPreferencia.findOne({
        where: { usuario_id: usuarioId, lista, tipo }
      });
      return res.json({
        lista,
        tipo,
        preferencias: registro ? parseJsonSeguro(registro.preferencias) : {}
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar preferencias da lista' });
    }
  },

  // PUT /listas/:lista/preferencias        (tipo 'geral', ou ?tipo=/body.tipo)
  // PUT /listas/:lista/preferencias/:tipo
  async putPreferencias(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const tipo = resolverTipoDaRequisicao(req);
      if (!tipo) return respostaTipoInvalido(res);

      // Mesma validação do lote, na mesma função.
      const entrada = validarEntradaPreferencia({
        lista: req.params.lista,
        tipo,
        preferencias: req.body?.preferencias
      });
      if (entrada.erro) {
        // Estouro de teto ou JSON inválido: NADA é gravado e a
        // preferência anterior permanece intacta. O servidor nunca
        // trunca o JSON — JSON truncado é JSON inválido, e viraria
        // perda silenciosa na próxima leitura.
        return res.status(400).json({
          error: entrada.erro,
          limite_bytes: LIMITE_BYTES_POR_TIPO[tipo]
        });
      }

      await gravarPreferencia({
        usuarioId,
        lista: entrada.lista,
        tipo: entrada.tipo,
        texto: entrada.texto
      });
      return res.json({ ok: true, lista: entrada.lista, tipo: entrada.tipo, bytes: entrada.bytes });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar preferencias da lista' });
    }
  },

  // DELETE /listas/:lista/preferencias/:tipo — reset de UM tipo.
  // 204 mesmo quando não havia linha: reset é idempotente, e o front não
  // deveria precisar saber se já existia preferência gravada.
  async resetPreferenciaTipo(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      if (!lista) return res.status(400).json({ error: 'Lista invalida' });

      const tipo = normalizarTipo(req.params.tipo, null);
      if (!tipo) return respostaTipoInvalido(res);

      await UsuarioListaPreferencia.destroy({
        where: { usuario_id: usuarioId, lista, tipo }
      });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao resetar preferencia da lista' });
    }
  },

  // DELETE /listas/:lista/preferencias — reset da TELA (todos os tipos
  // daquela lista). Os filtros NOMEADOS não são tocados: são conteúdo do
  // usuário, não preferência de exibição.
  async resetPreferenciasLista(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      if (!lista) return res.status(400).json({ error: 'Lista invalida' });

      await UsuarioListaPreferencia.destroy({
        where: { usuario_id: usuarioId, lista }
      });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao resetar preferencias da lista' });
    }
  },

  // GET /me/preferencias — CARGA ÚNICA.
  // Uma consulta só, agrupada por lista -> tipo. Sem isso, uma tela de
  // relatório com 5 tabelas faria 5 chamadas de rede antes de desenhar.
  async getMinhasPreferencias(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const registros = await UsuarioListaPreferencia.findAll({
        // `usuario_id` aqui não é opcional: sem ele esta rota devolveria
        // as preferências de todos os usuários num payload só.
        where: { usuario_id: usuarioId },
        attributes: ['lista', 'tipo', 'preferencias'],
        order: [['lista', 'ASC'], ['tipo', 'ASC']]
      });

      const listas = {};
      registros.forEach((registro) => {
        const lista = String(registro.lista);
        const tipo = String(registro.tipo || TIPO_PADRAO);
        if (!listas[lista]) listas[lista] = {};
        listas[lista][tipo] = parseJsonSeguro(registro.preferencias);
      });

      return res.json({ listas, total: registros.length });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar preferencias do usuario' });
    }
  },

  // DELETE /me/preferencias — reset de TUDO do próprio usuário.
  async resetMinhasPreferencias(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      await UsuarioListaPreferencia.destroy({ where: { usuario_id: usuarioId } });
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao resetar preferencias do usuario' });
    }
  },

  // POST /me/preferencias/adotar — adoção em lote do que hoje está no
  // localStorage do usuário.
  //
  // Duas regras que este caminho não pode afrouxar:
  // 1. cada entrada passa pela MESMA validação do caminho unitário
  //    (`validarEntradaPreferencia`), e o lote inteiro é validado ANTES
  //    de qualquer escrita — uma entrada ruim reprova a chamada toda e
  //    nenhuma preferência anterior é tocada;
  // 2. o dono é sempre `req.user.id`. `usuario_id` vindo do corpo é
  //    ignorado; não existe caminho para gravar no nome de outra pessoa.
  async adotarPreferencias(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lote = validarLoteAdocao(req.body);
      if (lote.erro) {
        return res.status(400).json({
          error: lote.erro,
          rejeitadas: lote.rejeitadas || [],
          max_itens: ADOCAO_MAX_ITENS,
          tipos: TIPOS_PREFERENCIA
        });
      }

      const gravadas = [];
      await sequelize.transaction(async (transaction) => {
        for (const item of lote.itens) {
          await gravarPreferencia({
            usuarioId,
            lista: item.lista,
            tipo: item.tipo,
            texto: item.texto,
            transaction
          });
          gravadas.push({ lista: item.lista, tipo: item.tipo });
        }
      });

      return res.json({ ok: true, gravadas: gravadas.length, itens: gravadas });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao adotar preferencias' });
    }
  },

  async listarFiltros(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      if (!lista) return res.status(400).json({ error: 'Lista invalida' });

      const filtros = await UsuarioListaFiltro.findAll({
        where: { usuario_id: usuarioId, lista },
        order: [['nome', 'ASC']]
      });
      return res.json(filtros.map((item) => ({
        id: item.id,
        nome: item.nome,
        filtros: parseJsonSeguro(item.filtros)
      })));
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar filtros salvos' });
    }
  },

  async salvarFiltro(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      if (!lista) return res.status(400).json({ error: 'Lista invalida' });

      const nome = String(req.body?.nome || '').trim().slice(0, NOME_MAX);
      if (!nome) return res.status(400).json({ error: 'Informe um nome para o filtro' });

      const texto = serializarFiltroLimitado(req.body?.filtros);
      if (texto === null) {
        return res.status(400).json({ error: 'Filtros invalidos ou grandes demais' });
      }

      // mesmo nome = substitui (o usuário está atualizando o próprio filtro)
      const existente = await UsuarioListaFiltro.findOne({
        where: { usuario_id: usuarioId, lista, nome }
      });
      if (existente) {
        await existente.update({ filtros: texto });
        return res.json({ id: existente.id, nome, filtros: parseJsonSeguro(texto) });
      }

      const total = await UsuarioListaFiltro.count({ where: { usuario_id: usuarioId, lista } });
      if (total >= FILTROS_SALVOS_MAX) {
        return res.status(400).json({ error: `Limite de ${FILTROS_SALVOS_MAX} filtros salvos por lista` });
      }

      const criado = await UsuarioListaFiltro.create({
        usuario_id: usuarioId,
        lista,
        nome,
        filtros: texto
      });
      return res.status(201).json({ id: criado.id, nome, filtros: parseJsonSeguro(texto) });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao salvar filtro' });
    }
  },

  async excluirFiltro(req, res) {
    try {
      const usuarioId = usuarioAutenticadoId(req);
      if (!usuarioId) return res.status(401).json({ error: 'Sessao invalida' });

      const lista = normalizarLista(req.params.lista);
      const id = Number(req.params.id);
      if (!lista || !Number.isInteger(id) || id <= 0) {
        return res.status(400).json({ error: 'Parametros invalidos' });
      }

      const removidos = await UsuarioListaFiltro.destroy({
        where: { id, usuario_id: usuarioId, lista }
      });
      if (!removidos) {
        return res.status(404).json({ error: 'Filtro nao encontrado' });
      }
      return res.sendStatus(204);
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao excluir filtro' });
    }
  }
};
