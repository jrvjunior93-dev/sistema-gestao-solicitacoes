const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

const ESCOPO = 'SOLICITACAO_CRIACAO_UPLOAD';
const AUDIENCIA = 'solicitacao-criacao-upload';
const TIPOS_PERMITIDOS = new Set([
  'BOLETO',
  'SOLICITACAO',
  'PLANILHA_ORCAMENTARIA',
  'DOCUMENTO_OBRA'
]);

function normalizarTipos(tipos = []) {
  return Array.from(new Set(
    (Array.isArray(tipos) ? tipos : [])
      .map((tipo) => String(tipo || '').trim().toUpperCase())
      .filter((tipo) => TIPOS_PERMITIDOS.has(tipo))
  ));
}

function gerarTokenUploadCriacaoSolicitacao({ solicitacaoId, usuarioId, tipos }) {
  const tiposNormalizados = normalizarTipos(tipos);
  if (!Number(solicitacaoId) || !Number(usuarioId) || tiposNormalizados.length === 0) {
    return null;
  }

  return jwt.sign(
    {
      escopo: ESCOPO,
      solicitacao_id: Number(solicitacaoId),
      usuario_id: Number(usuarioId),
      tipos: tiposNormalizados
    },
    env.jwtSecret,
    {
      audience: AUDIENCIA,
      expiresIn: '10m'
    }
  );
}

function validarTokenUploadCriacaoSolicitacao({ token, solicitacaoId, usuarioId, tipo }) {
  const tokenNormalizado = String(token || '').trim();
  const tipoNormalizado = String(tipo || '').trim().toUpperCase();
  if (!tokenNormalizado || !TIPOS_PERMITIDOS.has(tipoNormalizado)) return false;

  try {
    const payload = jwt.verify(tokenNormalizado, env.jwtSecret, { audience: AUDIENCIA });
    return payload?.escopo === ESCOPO
      && Number(payload?.solicitacao_id) === Number(solicitacaoId)
      && Number(payload?.usuario_id) === Number(usuarioId)
      && normalizarTipos(payload?.tipos).includes(tipoNormalizado);
  } catch {
    return false;
  }
}

module.exports = {
  gerarTokenUploadCriacaoSolicitacao,
  validarTokenUploadCriacaoSolicitacao
};
