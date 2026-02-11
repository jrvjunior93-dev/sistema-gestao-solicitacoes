import StatusBadge from '../../components/StatusBadge';

function formatarData(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

export default function Header({ solicitacao, onAlterarStatus, mostrarAlterarStatus = true }) {

  return (
    <div className="bg-white p-6 rounded-xl shadow">

      <div className="flex justify-between items-center">

        <div>
          <h1 className="text-xl font-semibold">
            {solicitacao.codigo}
          </h1>

          <p className="text-sm text-gray-500">
            Tipo: {solicitacao.tipo?.nome || '-'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={solicitacao.status_global} />
          {mostrarAlterarStatus && (
            <button
              onClick={onAlterarStatus}
              className="btn btn-outline"
            >
              Alterar status
            </button>
          )}
        </div>

      </div>

      <p className="mt-4">
        {solicitacao.descricao}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-4 text-sm">

        <div>
          <span className="text-gray-500">Obra</span>
          <p>{solicitacao.obra?.nome}</p>
        </div>

        <div>
          <span className="text-gray-500">Setor</span>
          <p>{solicitacao.area_responsavel}</p>
        </div>

        <div>
          <span className="text-gray-500">Criado em</span>
          <p>
            {new Date(solicitacao.createdAt).toLocaleString()}
          </p>
        </div>

        <div>
          <span className="text-gray-500">Data de vencimento</span>
          <p>{formatarData(solicitacao.data_vencimento)}</p>
        </div>

        <div>
          <span className="text-gray-500">Inicio da medicao</span>
          <p>{formatarData(solicitacao.data_inicio_medicao)}</p>
        </div>

        <div>
          <span className="text-gray-500">Fim da medicao</span>
          <p>{formatarData(solicitacao.data_fim_medicao)}</p>
        </div>

        <div>
          <span className="text-gray-500">Status</span>
          <p>{solicitacao.status_global}</p>
        </div>

      </div>

    </div>
  );
}
