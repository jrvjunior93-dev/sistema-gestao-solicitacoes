import { HiOutlineBuildingOffice2 } from 'react-icons/hi2';
import { dinheiro } from './valores';

export function formatarDataHora(value) {
  if (!value) return 'Sem atualização';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
  }).format(new Date(value));
}

export function situacaoDaConta(saldo) {
  if (!saldo) return 'Pendente';
  if (saldo.automatico) return 'Automático';
  return saldo.corrigido ? 'Corrigido' : 'Informado';
}

/* Card de conta do painel. Com o olho fechado o `saldo` continua chegando
   (situação, quem informou, quando) e só `saldo.valor` vem null: a situação
   continua visível, o valor vira "••••••". */
export default function ContaSaldoCard({ item, oculto }) {
  const saldo = item.saldo;
  return (
    <article className="pg-account-card" data-pendente={saldo ? 'false' : 'true'}>
      <div className="pg-account-card__heading">
        <HiOutlineBuildingOffice2 aria-hidden="true" />
        <div><strong>{item.nome}</strong><span>{item.empresa?.nome || 'Sem empresa vinculada'}</span></div>
        <em>{situacaoDaConta(saldo)}</em>
      </div>
      <p>{saldo ? dinheiro(saldo.valor, oculto) : 'Não informado'}</p>
      <footer>
        <span>{item.tipo_operacional === 'CAIXA_INTERNO' ? 'Caixa interno' : item.banco || 'Conta bancária'}</span>
        <span>{saldo?.automatico
          ? `Saldo do sistema · ${formatarDataHora(saldo.atualizado_em)}`
          : saldo
            ? `${saldo.atualizado_por?.nome || saldo.informado_por?.nome || 'Usuário não identificado'} · ${formatarDataHora(saldo.atualizado_em)}`
            : 'Aguardando informação do dia'}</span>
      </footer>
    </article>
  );
}
