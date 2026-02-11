import { useEffect, useMemo, useRef, useState } from 'react';
import LinhaSolicitacao from './LinhaSolicitacao';
import { useAuth } from '../../contexts/AuthContext';

export default function TabelaSolicitacoes({
  solicitacoes,
  onAtualizar,
  setoresMap,
  permissaoUsuario
}) {
  const tableWrapRef = useRef(null);
  const { user } = useAuth();
  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = setorTokens.includes('OBRA');

  const columns = useMemo(() => {
    const base = [
      { id: 'data', label: 'Data', width: 110, min: 90, weight: 0.9 },
      { id: 'codigo', label: 'Codigo', width: 100, min: 80, weight: 0.9 },
      { id: 'obra', label: 'Obra', width: 140, min: 100, weight: 1.1 },
      { id: 'contrato', label: 'Contrato', width: 120, min: 95, weight: 1 },
      { id: 'descricao', label: 'Descricao', width: 110, min: 110, weight: 0, fixed: true },
      { id: 'tipo', label: 'Tipo de Solicitacao', width: 150, min: 110, weight: 1 },
      { id: 'valor', label: 'Valor', width: 110, min: 90, weight: 0.9 },
      { id: 'setor', label: 'Setor', width: 110, min: 90, weight: 0.9 },
      { id: 'responsavel', label: 'Responsavel', width: 130, min: 100, weight: 1.1 },
      { id: 'status', label: 'Status', width: 110, min: 90, weight: 0.9 },
      { id: 'acoes', label: 'Acoes', width: 190, min: 150, weight: 1.3 }
    ];
    if (isSetorObra) {
      base.splice(4, 0, { id: 'ref_contrato', label: 'Ref. do Contrato', width: 110, min: 110, weight: 0, fixed: true });
    }
    return base;
  }, [isSetorObra]);

  const [widths, setWidths] = useState(() => columns.map(col => col.width));

  useEffect(() => {
    setWidths(columns.map(col => col.width));
  }, [columns]);

  useEffect(() => {
    function ajustarParaTela() {
      const containerWidth = tableWrapRef.current?.clientWidth;
      if (!containerWidth) return;
      const fixedTotal = columns.reduce((acc, col) => acc + (col.fixed ? col.width : 0), 0);
      const flexible = columns.filter(col => !col.fixed);
      const totalWeight = flexible.reduce((acc, col) => acc + col.weight, 0);
      const available = Math.max(containerWidth - fixedTotal, 0);
      const nextWidths = columns.map(col => {
        if (col.fixed) return col.width;
        const target = totalWeight > 0
          ? Math.floor((available * col.weight) / totalWeight)
          : col.width;
        return Math.max(col.min, target);
      });
      setWidths(nextWidths);
    }

    ajustarParaTela();
    window.addEventListener('resize', ajustarParaTela);
    return () => window.removeEventListener('resize', ajustarParaTela);
  }, [columns]);

  return (
    <div
      ref={tableWrapRef}
      className="bg-white rounded-xl shadow overflow-x-auto ring-1 ring-gray-200"
    >

      <table className="min-w-full text-sm table-fixed">
        <colgroup>
          {widths.map((width, index) => (
            <col key={columns[index].id} style={{ width: `${width}px` }} />
          ))}
        </colgroup>

        <thead className="bg-gray-50">
          <tr>
            {columns.map((col, index) => (
              <th
                key={col.id}
                className="p-3 text-left relative select-none whitespace-nowrap text-xs uppercase tracking-wide text-gray-600 border-b border-gray-200 sticky top-0 z-10 bg-gray-50"
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
              mostrarRefContrato={isSetorObra}
            />
          ))}
        </tbody>

      </table>

    </div>
  );
}
