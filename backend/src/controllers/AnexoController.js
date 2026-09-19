const {
  Anexo,
  Solicitacao,
  Historico,
  User,
  ContratoMedicao
} = require('../models');
const { criarNotificacao } = require('../services/notificacoes');
const { uploadToS3, getPresignedUrl } = require('../services/s3');
const {
  assertRegisteredFileAccess,
  canAccessSolicitacaoFile,
  getRegisteredFilePath,
  resolveRegisteredFileResource
} = require('../services/fileAccessService');
const { normalizeOriginalName } = require('../utils/fileName');
const {
  canDeleteSolicitacaoAnexo
} = require('../services/authorizationService');
const { registrarEventoSeguranca } = require('../services/securityLogService');
const { publishSolicitacaoRealtimeEvent } = require('../services/solicitacaoRealtimeService');
const { assertPodeInteragirSolicitacao } = require('../services/solicitacaoRetornoService');
const { validarTokenUploadCriacaoSolicitacao } = require('../services/solicitacaoCriacaoUploadTokenService');
const { userHasSetorCapability } = require('../services/setorCapabilityService');

function parseHistoricoMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;

  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

async function obterCaminhoArquivoHistorico(historico) {
  const metadata = parseHistoricoMetadata(historico?.metadata);
  const caminhoDireto = (
    metadata?.caminho ||
    metadata?.caminho_arquivo ||
    metadata?.arquivo_url ||
    metadata?.url ||
    metadata?.file_url ||
    metadata?.download_url ||
    metadata?.comprovante_pdf_url
  );

  if (caminhoDireto) {
    return caminhoDireto;
  }

  if (!metadata?.anexo_id) {
    return null;
  }

  const anexo = await Anexo.findByPk(metadata.anexo_id, {
    attributes: ['id', 'caminho_arquivo']
  });

  return anexo?.caminho_arquivo || null;
}

async function validarAcessoSolicitacao(req, solicitacao) {
  if (!solicitacao) {
    return {
      permitido: false,
      status: 404,
      error: 'Solicitação não encontrada'
    };
  }

  const acesso = await canAccessSolicitacaoFile(req, solicitacao.id);
  if (!acesso.allowed) {
    return {
      permitido: false,
      status: acesso.status || 403,
      error: acesso.error || 'Voce nao tem permissao para acessar anexos desta solicitacao.'
    };
  }

  return {
    permitido: true
  };
}

class AnexoController {

  async upload(req, res) {
    try {

      const { solicitacao_id, tipo } = req.body;
      const usuario = await User.findByPk(req.user.id);

      if (!solicitacao_id) {
        return res.status(400).json({ error: 'solicitacao_id é obrigatório' });
      }

      if (!tipo) {
        return res.status(400).json({ error: 'tipo é obrigatório' });
      }

      const tiposPermitidos = [
        'ANEXO',
        'SOLICITACAO',
        'CONTRATO',
        'COMPROVANTE',
        'BOLETO',
        'PRESTACAO_RECARGA'
      ];

      const tipoNormalizado = String(tipo).toUpperCase();

      if (!tiposPermitidos.includes(tipoNormalizado)) {
        return res.status(400).json({ error: 'tipo inválido' });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Nenhum arquivo enviado' });
      }

      const solicitacao = await Solicitacao.findByPk(solicitacao_id, {
        attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global']
      });
      const acessoSolicitacao = await validarAcessoSolicitacao(req, solicitacao);

      if (!acessoSolicitacao.permitido) {
        return res.status(acessoSolicitacao.status).json({ error: acessoSolicitacao.error });
      }

      if (!solicitacao) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      // O upload selecionado na Nova Solicitacao ainda pertence ao ato de criacao. Sem esta
      // autorizacao curta, o criador perde o direito entre o POST da solicitacao (que ja nasce no
      // setor destino) e o POST do arquivo. Interacoes posteriores continuam submetidas a regra
      // normal de setor/retorno.
      const uploadInicialAutorizado = validarTokenUploadCriacaoSolicitacao({
        token: req.body?.criacao_upload_token,
        solicitacaoId: solicitacao.id,
        usuarioId: req.user.id,
        tipo: tipoNormalizado
      });

      // Recuperacao de anexo ausente: OBRA pode completar exclusivamente os arquivos de uma
      // medicao ainda pendente e pertencente a esta solicitacao. O acesso base acima continua
      // exigindo que o usuario tenha escopo sobre a solicitacao/obra. Nenhuma outra interacao
      // (editar parcela, aprovar, mudar status) passa por esta excecao.
      const medicaoId = Number(req.body?.medicao_id) || null;
      let medicao = null;
      if (medicaoId) {
        medicao = await ContratoMedicao.findOne({
          where: { id: medicaoId, solicitacao_id },
          attributes: ['id', 'aprovada_em']
        });
        if (!medicao) {
          return res.status(400).json({ error: 'A medicao informada nao pertence a esta solicitacao.' });
        }
      }

      const uploadRecuperacaoMedicaoObra = Boolean(
        medicao
        && !medicao.aprovada_em
        && tipoNormalizado === 'SOLICITACAO'
        && await userHasSetorCapability(usuario, 'eh_setor_obra')
      );

      if (!uploadInicialAutorizado && !uploadRecuperacaoMedicaoObra) {
        try {
          await assertPodeInteragirSolicitacao(req, solicitacao);
        } catch (errorAcesso) {
          return res.status(Number(errorAcesso.statusCode) || 403).json({
            error: errorAcesso.message,
            code: errorAcesso.code || undefined
          });
        }
      }

      const codigo = solicitacao.codigo;

      // VINCULO DO ANEXO COM A MEDICAO (item 20 do lote de 23/08).
      //
      // `anexos.medicao_id` existia na tabela e no model desde 19/08 e NADA o preenchia: dos 30
      // anexos da obra 23, zero tinham medicao. O modal "Medicao N" filtra por esse campo — entao
      // ele nunca mostrava anexo nenhum, por construcao, e a separacao dos documentos de cada
      // medicao (o motivo de o card existir) nao acontecia.
      //
      // A medicao e conferida contra a SOLICITACAO: sem isso, um id de outra solicitacao penduraria
      // o documento no lugar errado — e quem olhasse a medicao veria papel que nao e dela.
      const registros = [];

      for (const file of req.files) {
        const nomeOriginal = normalizeOriginalName(file.originalname);
        const url = await uploadToS3(
          file,
          `anexos/${codigo}/${tipoNormalizado.toLowerCase()}`
        );

        const anexo = await Anexo.create({
          solicitacao_id,
          tipo: tipoNormalizado,
          nome_original: nomeOriginal,
          caminho_arquivo: url,
          uploaded_by: usuario.id,
          area_origem: usuario.setor_id,
          medicao_id: medicaoId
        });

        registros.push(anexo);

        // ??? HIST??RICO COM METADATA
        await Historico.create({
          solicitacao_id,
          medicao_id: medicaoId,
          usuario_responsavel_id: usuario.id,
          setor: usuario.setor_id,
          acao: 'ANEXO_ADICIONADO',
          descricao: nomeOriginal,
          metadata: JSON.stringify({
            anexo_id: anexo.id,
            caminho: url,
            medicao_id: medicaoId
          })
        });
      }


      await criarNotificacao({
        solicitacao_id,
        tipo: 'ANEXO_ADICIONADO',
        mensagem: `${usuario?.nome || 'Usuario'} anexou ${registros.length} arquivo(s) na solicitacao ${codigo}`,
        created_by: usuario.id,
        metadata: { total: registros.length }
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'ATTACHMENT_ADDED',
        solicitacao,
        actor: {
          id: usuario.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          total_arquivos: registros.length
        }
      });

      return res.status(201).json(registros);

    } catch (error) {
      console.error('Erro upload anexo:', error);
      return res.status(500).json({ error: 'Erro ao salvar anexos' });
    }
  }

  async listarPorSolicitacao(req, res) {
    try {

      const { id } = req.params;
      const { tipo } = req.query;

      const solicitacao = await Solicitacao.findByPk(id, {
        attributes: ['id', 'obra_id']
      });
      const acessoSolicitacao = await validarAcessoSolicitacao(req, solicitacao);

      if (!acessoSolicitacao.permitido) {
        return res.status(acessoSolicitacao.status).json({ error: acessoSolicitacao.error });
      }

      const where = { solicitacao_id: id, deleted_at: null };

      if (tipo) where.tipo = tipo;

      const anexos = await Anexo.findAll({
        where,
        order: [['createdAt', 'DESC']]
      });

      return res.json(anexos);

    } catch (error) {
      console.error('Erro listar anexos:', error);
      return res.status(500).json({ error: 'Erro ao listar anexos' });
    }
  }

  async presign(req, res) {
    try {
      const { url, key, historico_id: historicoId } = req.query;
      const alvo = url || key;

      if (!alvo && !historicoId) {
        return res.status(400).json({ error: 'url obrigatoria' });
      }

      if (historicoId) {
        const historico = await Historico.findByPk(historicoId, {
          attributes: ['id', 'solicitacao_id', 'acao', 'metadata']
        });

        if (!historico) {
          return res.status(404).json({ error: 'Historico nao encontrado' });
        }

        const acessoHistorico = await canAccessSolicitacaoFile(req, historico.solicitacao_id);
        if (!acessoHistorico.allowed) {
          return res.status(acessoHistorico.status || 403).json({
            error: acessoHistorico.error || 'Acesso negado ao arquivo do historico'
          });
        }

        const caminhoHistorico = await obterCaminhoArquivoHistorico(historico);
        if (!caminhoHistorico) {
          return res.status(404).json({ error: 'Arquivo do historico nao encontrado' });
        }

        const signedUrl = await getPresignedUrl(caminhoHistorico, 300, { strict: true });
        return res.json({ url: signedUrl });
      }

      const arquivoRegistrado = await resolveRegisteredFileResource(alvo);
      if (!arquivoRegistrado) {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user?.id || null,
          tipoEvento: 'FILE_ACCESS_DENIED',
          recursoTipo: 'FILE',
          recursoId: String(alvo).slice(0, 120),
          status: 'DENIED',
          descricao: 'Tentativa de assinar arquivo nao registrado'
        });
        return res.status(404).json({ error: 'Arquivo nao encontrado' });
      }

      const acesso = await assertRegisteredFileAccess(req, arquivoRegistrado);
      if (!acesso.allowed) {
        return res.status(acesso.status || 403).json({ error: acesso.error || 'Acesso negado ao arquivo' });
      }

      const caminhoRegistrado = getRegisteredFilePath(arquivoRegistrado) || alvo;
      const signedUrl = await getPresignedUrl(caminhoRegistrado, 300, { strict: true });
      return res.json({ url: signedUrl });
    } catch (error) {
      if (error?.code === 'FILE_PRESIGN_INVALID_TARGET') {
        await registrarEventoSeguranca({
          req,
          usuarioId: req.user?.id || null,
          tipoEvento: 'FILE_PRESIGN_INVALID_TARGET',
          recursoTipo: 'FILE',
          recursoId: String(req.query?.url || req.query?.key || req.query?.historico_id || '').slice(0, 120),
          status: 'DENIED',
          descricao: error.message
        });
        return res.status(error.statusCode || 400).json({
          error: error.message || 'Arquivo invalido para assinatura'
        });
      }

      console.error('Erro ao gerar URL assinada:', error);
      return res.status(500).json({ error: 'Erro ao gerar URL assinada' });
    }
  }

  async remover(req, res) {
    try {
      const { historicoId } = req.params;
      const usuario = await User.findByPk(req.user.id);

      if (!(await canDeleteSolicitacaoAnexo(req.user))) {
        return res.status(403).json({ error: 'Usuario sem permissao para remover anexo.' });
      }

      const historico = await Historico.findByPk(historicoId);
      if (!historico) {
        return res.status(404).json({ error: 'Historico nao encontrado.' });
      }

      const solicitacao = await Solicitacao.findByPk(historico.solicitacao_id, {
        attributes: ['id', 'codigo', 'obra_id', 'criado_por', 'tipo_solicitacao_id', 'area_responsavel', 'status_global']
      });
      const acessoSolicitacao = await validarAcessoSolicitacao(req, solicitacao);

      if (!acessoSolicitacao.permitido) {
        return res.status(acessoSolicitacao.status).json({ error: acessoSolicitacao.error });
      }

      try {
        await assertPodeInteragirSolicitacao(req, solicitacao);
      } catch (errorAcesso) {
        return res.status(Number(errorAcesso.statusCode) || 403).json({
          error: errorAcesso.message,
          code: errorAcesso.code || undefined
        });
      }

      if (historico.acao !== 'ANEXO_ADICIONADO') {
        return res.status(400).json({ error: 'Somente anexos do historico podem ser removidos.' });
      }

      let metadata = {};
      try {
        metadata = historico.metadata ? JSON.parse(historico.metadata) : {};
      } catch {
        metadata = {};
      }

      const anexoId = metadata?.anexo_id;
      const caminho = metadata?.caminho;

      let anexo = null;
      if (anexoId) {
        anexo = await Anexo.findByPk(anexoId);
      }

      if (!anexo && caminho) {
        anexo = await Anexo.findOne({
          where: {
            solicitacao_id: historico.solicitacao_id,
            caminho_arquivo: caminho
          }
        });
      }

      if (anexo) {
        await anexo.update({ deleted_at: new Date() });
      }

      await Historico.create({
        solicitacao_id: historico.solicitacao_id,
        usuario_responsavel_id: usuario.id,
        setor: usuario.setor_id,
        acao: 'ANEXO_REMOVIDO',
        descricao: anexo?.nome_original || historico.descricao || 'Anexo removido',
        metadata: JSON.stringify({ anexo_id: anexo?.id || anexoId || null, caminho: caminho || null })
      });

      await publishSolicitacaoRealtimeEvent({
        action: 'ATTACHMENT_REMOVED',
        solicitacaoId: historico.solicitacao_id,
        actor: {
          id: usuario.id,
          nome: usuario?.nome || req.user?.nome || null
        },
        metadata: {
          anexo_id: anexoId || null,
          caminho: caminho || null
        }
      });

      return res.json({ ok: true });
    } catch (error) {
      console.error('Erro remover anexo:', error);
      return res.status(500).json({ error: 'Erro ao remover anexo.' });
    }
  }

}

module.exports = new AnexoController();
