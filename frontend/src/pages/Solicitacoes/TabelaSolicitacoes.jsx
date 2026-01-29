import LinhaSolicitacao from './LinhaSolicitacao';

export default function TabelaSolicitacoes({ solicitacoes, onAtualizar }) {
  return (
    <div className="overflow-x-auto bg-white rounded-xl shadow">

      <table className="min-w-full text-sm">

        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">Código</th>
            <th className="p-3 text-left">Obra</th>
            <th className="p-3 text-left">Descrição</th>
            <th className="p-3 text-left">Setor</th>
            <th className="p-3 text-left">Responsável</th>
            <th className="p-3 text-left">Status</th>
            <th className="p-3 text-left">Ações</th>
          </tr>
        </thead>

        <tbody>
          {solicitacoes.map(s => (
            <LinhaSolicitacao
              key={s.id}
              solicitacao={s}
              onAtualizar={onAtualizar}
            />
          ))}
        </tbody>

      </table>

    </div>
  );
}
