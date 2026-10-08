import { HiOutlinePencilSquare } from 'react-icons/hi2';

export default function AcaoEditarDadosSolicitacao({ solicitacao, campo, onEditar }) {
  const rotulo = `${campo === 'valor' ? 'Editar valor' : 'Editar vencimento'} de ${solicitacao.codigo || `#${solicitacao.id}`}`;
  return <button type="button" className="btn btn-outline btn-sm shrink-0" aria-label={rotulo} title={rotulo}
    onKeyDown={event => event.stopPropagation()}
    onClick={event => { event.stopPropagation(); onEditar({ solicitacao: { ...solicitacao }, campo }); }}>
    <HiOutlinePencilSquare aria-hidden="true" />
  </button>;
}
