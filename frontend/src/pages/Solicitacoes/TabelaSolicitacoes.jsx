import { useEffect, useMemo, useRef, useState } from 'react';
import LinhaSolicitacao from './LinhaSolicitacao';

export default function TabelaSolicitacoes({
  solicitacoes,
  onAtualizar,
  setoresMap,
  permissaoUsuario
}) {
  const tableWrapRef = useRef(null);

  const columns = useMemo(
    () => ([
      { id: 'codigo', label: 'Codigo', width: 100, min: 80, weight: 0.9 },
      { id: 'obra', label: 'Obra', width: 140, min: 100, weight: 1.1 },
      { id: 'contrato', label: 'Contrato', width: 120, min: 95, weight: 1 },
      { id: 'descricao', label: 'Descricao', width: 140, min: 100, weight: 1.1 },
      { id: 'tipo', label: 'Tipo de Solicitacao', width: 160, min: 120, weight: 1.2 },
      { id: 'valor', label: 'Valor', width: 110, min: 90, weight: 0.9 },
      { id: 'setor', label: 'Setor', width: 110, min: 90, weight: 0.9 },
      { id: 'responsavel', label: 'Responsavel', width: 130, min: 100, weight: 1.1 },
      { id: 'status', label: 'Status', width: 110, min: 90, weight: 0.9 },
      { id: 'acoes', label: 'Acoes', width: 170, min: 140, weight: 1.1 }
    ]),
    []
  );

  const [widths, setWidths] = useState(() => columns.map(col => col.width));

  useEffect(() => {
    function ajustarParaTela() {
      const containerWidth = tableWrapRef.current?.clientWidth;
      if (!containerWidth) return;
      const totalWeight = columns.reduce((acc, col) => acc + col.weight, 0);
      const nextWidths = columns.map(col => {
        const target = Math.floor((containerWidth * col.weight) / totalWeight);
        return Math.max(col.min, target);
      });
      setWidths(nextWidths);
    }

    ajustarParaTela();
    window.addEventListener('resize', ajustarParaTela);
    return () => window.removeEventListener('resize', ajustarParaTela);
  }, [columns]);

  return (
    <div ref={tableWrapRef} className="bg-white rounded-xl shadow">

      <table className="min-w-full text-sm table-fixed">
        <colgroup>
          {widths.map((width, index) => (
            <col key={columns[index].id} style={{ width: `${width}px` }} />
          ))}
        </colgroup>

        <thead className="bg-gray-100">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.id}
                className="p-2 text-left relative select-none whitespace-nowrap"
                style={{ width: `${widths[index]}px` }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {solicitacoes.map(s => (
            <LinhaSolicitacao
              key={s.id}
              solicitacao={s}
              onAtualizar={onAtualizar}
              setoresMap={setoresMap}
              permissaoUsuario={permissaoUsuario}
            />
          ))}
        </tbody>

      </table>

    </div>
  );
}
