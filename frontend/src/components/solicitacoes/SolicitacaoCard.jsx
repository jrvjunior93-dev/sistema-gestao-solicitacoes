import { useNavigate } from 'react-router-dom';
import StatusBadge from '../StatusBadge';

export default function SolicitacaoCard({ solicitacao }) {

  const navigate = useNavigate();

  return (
    <div
      onClick={() => navigate(`/solicitacoes/${solicitacao.id}`)}
      className="bg-white p-4 rounded-xl shadow hover:shadow-md transition cursor-pointer"
    >

      {/* TOPO */}
      <div className="flex justify-between items-center mb-2">
        <strong>{solicitacao.codigo}</strong>
        <StatusBadge status={solicitacao.status_global} />
      </div>

      {/* OBRA */}
      <p className="text-sm text-gray-500">
        Obra: {solicitacao.obra?.nome || '-'}
      </p>

      {/* DESCRIÇÃO */}
      <p className="mt-2 text-gray-800">
        {solicitacao.descricao}
      </p>

      {/* RODAPÉ */}
      <div className="mt-3 flex justify-between text-sm text-gray-600">

        <span>
          Área: {solicitacao.area_responsavel}
        </span>

        <span>
          Resp: {solicitacao.responsavel_atual || 'Não atribuído'}
        </span>

      </div>

    </div>
  );
}
