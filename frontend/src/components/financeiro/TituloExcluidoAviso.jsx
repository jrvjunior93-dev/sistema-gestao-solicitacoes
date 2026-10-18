export default function TituloExcluidoAviso({ exclusao }) {
  if (!exclusao) return null;
  const data = exclusao.em ? new Date(exclusao.em) : null;
  const quando = data && Number.isFinite(data.getTime()) ? data.toLocaleString('pt-BR') : 'Data não registrada';
  return <div className="pa-exclusao" role="note" aria-label="Histórico de exclusão do título">
    <strong>Somente histórico — não disponível para aprovação ou pagamento.</strong>
    <span>Exclusão: {quando} · {exclusao.responsavel?.nome || 'Responsável não registrado'}</span>
    <p>Motivo: {exclusao.motivo || 'Motivo não registrado'}</p>
    <small>Valores e documentos enviados foram preservados como histórico; não representam saldo disponível.</small>
  </div>;
}
