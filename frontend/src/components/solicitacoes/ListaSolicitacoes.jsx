import SolicitacaoCard from './SolicitacaoCard';

export default function ListaSolicitacoes({ solicitacoes }) {
  return (
    <div className="flex flex-col gap-4">
      {solicitacoes.map(s => (
        <SolicitacaoCard key={s.id} solicitacao={s} />
      ))}
    </div>
  );
}
