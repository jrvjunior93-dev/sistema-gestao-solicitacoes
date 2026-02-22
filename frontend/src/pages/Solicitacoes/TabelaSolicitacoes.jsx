import { useEffect, useMemo, useRef, useState } from 'react';
import LinhaSolicitacao from './LinhaSolicitacao';
import { useAuth } from '../../contexts/AuthContext';

const SORTABLE_COLUMNS = new Set(['data', 'vencimento', 'valor']);

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
      { id: 'codigo', label: 'Código', width: 100, min: 80, weight: 0.9 },
      { id: 'obra', label: 'Obra', width: 140, min: 100, weight: 1.1 },
      { id: 'contrato', label: 'Contrato', width: 120, min: 95, weight: 1 },
      { id: 'descricao', label: 'Descrição', width: 110, min: 110, weight: 0, fixed: true },
      { id: 'tipo', label: 'Tipo de Solicitação', width: 150, min: 110, weight: 1 },
      { id: 'valor', label: 'Valor', width: 110, min: 90, weight: 0.9 },
      { id: 'setor', label: 'Setor', width: 110, min: 90, weight: 0.9 },
      { id: 'responsavel', label: 'Responsável', width: 130, min: 100, weight: 1.1 },
      { id: 'status', label: 'Status', width: 110, min: 90, weight: 0.9 },
      { id: 'vencimento', label: 'Vencimento', width: 120, min: 100, weight: 0.9 },
      { id: 'acoes', label: 'Ações', width: 190, min: 150, weight: 1.3 }
    ];

    if (isSetorObra) {
      base.splice(4, 0, {
        id: 'ref_contrato',
        label: 'Ref. do Contrato',
        width: 110,
        min: 110,
        weight: 0,
        fixed: true
      });
    }

    return base;
  }, [isSetorObra]);

  const [widths, setWidths] = useState(() => columns.map(col => col.width));
  const [ordenacao, setOrdenacao] = useState({ campo: 'data', direcao: 'desc' });

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

  const solicitacoesOrdenadas = useMemo(() => {
    const { campo, direcao } = ordenacao || {};
    if (!SORTABLE_COLUMNS.has(campo)) return solicitacoes;

    const fator = direcao === 'asc' ? 1 : -1;
    const getter = (item) => {
      if (campo === 'data') {
        const raw = item?.createdAt || item?.data_criacao || item?.created_at || null;
        const ts = raw ? new Date(raw).getTime() : null;
        return Number.isNaN(ts) ? null : ts;
      }
      if (campo === 'vencimento') {
        const raw = item?.data_vencimento || null;
        const ts = raw ? new Date(raw).getTime() : null;
        return Number.isNaN(ts) ? null : ts;
      }
      if (campo === 'valor') {
        const n = Number(item?.valor);
        return Number.isNaN(n) ? null : n;
      }
      return null;
    };

    return [...solicitacoes].sort((a, b) => {
      const va = getter(a);
      const vb = getter(b);

      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va < vb) return -1 * fator;
      if (va > vb) return 1 * fator;
      return 0;
    });
  }, [solicitacoes, ordenacao]);

  function alternarOrdenacao(colId) {
    if (!SORTABLE_COLUMNS.has(colId)) return;

    setOrdenacao(prev => {
      if (prev?.campo !== colId) {
        return { campo: colId, direcao: 'asc' };
      }
      return {
        campo: colId,
        direcao: prev.direcao === 'asc' ? 'desc' : 'asc'
      };
    });
  }

  function indicadorOrdenacao(colId) {
    if (ordenacao?.campo !== colId) return '';
    return ordenacao.direcao === 'asc' ? ' ^' : ' v';
  }

  return (
    <div
      ref={tableWrapRef}
      className="bg-white dark:bg-slate-900 rounded-xl shadow overflow-x-auto overflow-y-auto ring-1 ring-gray-200 dark:ring-slate-700 max-h-[70vh]"
    >
      <table className="min-w-full text-sm table-fixed solicitacoes-table">
        <colgroup>
          {widths.map((width, index) => (
            <col key={columns[index].id} style={{ width: `${width}px` }} />
          ))}
        </colgroup>

        <thead className="bg-gray-50 dark:bg-slate-800">
          <tr>
            {columns.map((col, index) => {
              const sortable = SORTABLE_COLUMNS.has(col.id);
              return (
                <th
                  key={col.id}
                  className="p-3 text-left relative select-none whitespace-nowrap text-xs uppercase tracking-wide text-gray-600 dark:text-slate-200 border-b border-gray-200 dark:border-slate-700 sticky top-0 z-10 bg-gray-50 dark:bg-slate-800"
                  style={{ width: `${widths[index]}px` }}
                >
                  <button
                    type="button"
                    onClick={() => alternarOrdenacao(col.id)}
                    disabled={!sortable}
                    className={sortable ? 'hover:underline' : 'cursor-default'}
                    title={sortable ? 'Clique para ordenar' : undefined}
                  >
                    {col.label}{indicadorOrdenacao(col.id)}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {solicitacoesOrdenadas.map(s => (
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
