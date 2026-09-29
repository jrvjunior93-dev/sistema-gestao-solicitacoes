import { useContext } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi2';
import { AuthContext } from '../../../contexts/AuthContext';
import { monthLabel } from '../utils/prazos';
import '../styles/cr-travada-faixa.css';

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
export default function CrObrasTravadasAviso() {
  const { user } = useContext(AuthContext) || {};
  const obras = Array.isArray(user?.custos_recebiveis_pendencia?.obras_travadas)
    ? user.custos_recebiveis_pendencia.obras_travadas
    : [];
  if (!obras.length) return null;
  return (
    <div className="cr-travada-faixa" role="alert">
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
            <Link className="btn btn-primary" to={`/custos-recebiveis?aba=planejamento&obra=${item.obra_id}`}>
              Regularizar
            </Link>
          </div>
        );
      })}
    </div>
  );
}
