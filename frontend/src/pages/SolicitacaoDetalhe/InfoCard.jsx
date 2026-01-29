export default function InfoCard({ solicitacao }) {
  return (
    <div className="bg-white p-4 rounded-xl shadow space-y-2">

      <h2 className="font-semibold mb-2">
        Dados da Solicitação
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">

        <div>
          <span className="text-gray-500">Obra</span>
          <p>{solicitacao.obra?.nome}</p>
        </div>

        <div>
          <span className="text-gray-500">Setor</span>
          <p>{solicitacao.area_responsavel}</p>
        </div>

        <div>
          <span className="text-gray-500">Tipo</span>
          <p>{solicitacao.tipo?.nome || '-'}</p>
        </div>

        <div>
          <span className="text-gray-500">Valor</span>
          <p>
            {solicitacao.valor
              ? Number(solicitacao.valor).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })
              : '-'}
          </p>
        </div>

      </div>

      <div>
        <span className="text-gray-500">Descrição</span>
        <p className="mt-1">{solicitacao.descricao}</p>
      </div>

    </div>
  );
}
