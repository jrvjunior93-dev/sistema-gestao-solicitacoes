import { useContext, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi2';
import { AuthContext } from '../../../contexts/AuthContext';
import { monthLabel } from '../utils/prazos';

const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo'
});

function pendenciaTexto(pendencia) {
  const dias = Number(pendencia.dias) === 1 ? '1 dia' : `${pendencia.dias} dias`;
  if (pendencia.tipo === 'PLANEJAMENTO') {
    return `planejamento de ${monthLabel(pendencia.competencia)} vencido há ${dias}`;
  }
  return `medição aprovada de ${monthLabel(pendencia.competencia)} vencida há ${dias}`
    + (pendencia.dilatacao_pendente ? ' (dilatação aguardando decisão)' : '');
}

/*
  Faixa fixa no topo de todas as telas (reforma de 29/09/2026, Fase 3): diz
  ao engenheiro qual obra está travada, por quê e onde regularizar. Em modo
  observação ("seria travada") avisa sem bloquear; com liberação temporária
  mostra até quando.
*/
const REFRESH_MS = 5 * 60 * 1000;

function regularizarHref(item) {
  // Pendência só de medição abre direto o registro da medição aprovada.
  const pendencias = item.pendencias || [];
  const medicao = pendencias.find((pendencia) => pendencia.tipo === 'MEDICAO_APROVADA');
  if (medicao && !pendencias.some((pendencia) => pendencia.tipo === 'PLANEJAMENTO')) {
    return `/custos-recebiveis?aba=planejamento&obra=${item.obra_id}&competencia=${medicao.competencia}&detalhe=1&painel=approved`;
  }
  return `/custos-recebiveis?aba=planejamento&obra=${item.obra_id}`;
}

export default function CrObrasTravadasAviso() {
  const { user, refreshSession } = useContext(AuthContext) || {};
  const obras = Array.isArray(user?.custos_recebiveis_pendencia?.obras_travadas)
    ? user.custos_recebiveis_pendencia.obras_travadas
    : [];
  const hasUser = Boolean(user?.id);

  // Trava nova (virada de prazo) ou liberação do administrador aparecem sem
  // precisar recarregar: a sessão é relida a cada 5 minutos e ao voltar à aba.
  useEffect(() => {
    if (!hasUser || typeof refreshSession !== 'function') return undefined;
    const refresh = () => { refreshSession().catch(() => null); };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [hasUser, refreshSession]);

  if (!obras.length) return null;
  return (
    <div className="cr-travada-faixa" role="status">
      {obras.map((item) => {
        const estado = item.bloqueando ? 'travada' : (item.liberada_ate ? 'liberada' : 'observacao');
        const obraNome = `${item.obra?.codigo ? `${item.obra.codigo} · ` : ''}${item.obra?.nome || `Obra ${item.obra_id}`}`;
        const motivo = (item.pendencias || []).map(pendenciaTexto).join(' e ');
        return (
          <div key={item.obra_id} className="cr-travada-faixa__item" data-estado={estado}>
            <HiOutlineLockClosed aria-hidden="true" />
            <span>
              <strong>
                {estado === 'travada' ? `Obra ${obraNome} travada` : null}
                {estado === 'liberada' ? `Obra ${obraNome} liberada até ${dateTime.format(new Date(item.liberada_ate))}` : null}
                {estado === 'observacao' ? `Obra ${obraNome} seria travada` : null}
              </strong>
              {`: ${motivo}.`}
              {estado === 'travada' ? ' Só é possível regularizar esta obra.' : null}
              {estado === 'observacao' ? ' Bloqueio ainda em observação.' : null}
            </span>
            <Link className="btn btn-primary" to={regularizarHref(item)}>
              Regularizar
            </Link>
          </div>
        );
      })}
    </div>
  );
}
