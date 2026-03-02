import { useEffect, useState } from 'react';
import { HiAdjustmentsHorizontal, HiChevronDown, HiChevronUp } from 'react-icons/hi2';

export default function Filtros({
  filtros,
  setFiltros,
  obrasOptions = [],
  responsaveisOptions = [],
  setores = [],
  tiposSolicitacao = [],
  statusOptions = [],
  mostrarFiltroResponsavel = false,
  mostrarSomaValor = false,
  somaValorFiltrado = 0
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );

  useEffect(() => {
    function onResize() {
      const isMobile = window.innerWidth < 768;
      setIsMobileViewport(isMobile);
      if (!isMobile) setMobileOpen(false);
    }

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;
    setFiltros(prev => ({
      ...prev,
      [name]: value
    }));
  }

  function handleMultiChange(e) {
    const { name, selectedOptions } = e.target;
    const values = Array.from(selectedOptions || [])
      .map(option => option.value)
      .filter(Boolean);

    setFiltros(prev => ({
      ...prev,
      [name]: values.join(',')
    }));
  }

  function limparFiltros() {
    setFiltros({
      obra_ids: '',
      area: '',
      tipo_solicitacao_id: '',
      status: '',
      valor_min: '',
      valor_max: '',
      data_registro: '',
      data_vencimento: '',
      responsavel: ''
    });
  }

  const quantidadeFiltrosAtivos = [
    filtros.obra_ids,
    filtros.area,
    filtros.tipo_solicitacao_id,
    filtros.status,
    filtros.valor_min,
    filtros.valor_max,
    filtros.data_registro,
    filtros.data_vencimento,
    mostrarFiltroResponsavel ? filtros.responsavel : ''
  ].filter(v => String(v || '').trim() !== '').length;

  const obraValues = String(filtros.obra_ids || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  const responsavelValues = String(filtros.responsavel || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);

  return (
    <div className="solicitacoes-filtros bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-xl shadow mb-4 md:mb-6 ring-1 ring-gray-200 dark:ring-slate-700">
      <div className="md:hidden mb-3">
        <button
          type="button"
          onClick={() => setMobileOpen(prev => !prev)}
          className="w-full min-h-[44px] inline-flex items-center justify-between gap-2 rounded-xl border border-gray-200 dark:border-slate-700 px-3 py-2 bg-white dark:bg-slate-800 text-sm font-medium"
          aria-expanded={mobileOpen}
          aria-controls="painel-filtros-solicitacoes"
        >
          <span className="inline-flex items-center gap-2">
            <HiAdjustmentsHorizontal className="w-4 h-4" />
            Filtros
            {quantidadeFiltrosAtivos > 0 && (
              <span className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200">
                {quantidadeFiltrosAtivos}
              </span>
            )}
          </span>
          {mobileOpen ? <HiChevronUp className="w-4 h-4" /> : <HiChevronDown className="w-4 h-4" />}
        </button>
      </div>

      <div
        id="painel-filtros-solicitacoes"
        className={`${isMobileViewport && !mobileOpen ? 'hidden' : 'block'}`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6 gap-3 md:gap-4">
          <div>
            <label className="text-sm text-gray-600 block mb-1">Obras</label>
            <select
              name="obra_ids"
              className="input h-28"
              multiple
              value={obraValues}
              onChange={handleMultiChange}
            >
              {obrasOptions.map(obra => (
                <option key={obra.value} value={obra.value}>
                  {obra.label}
                </option>
              ))}
            </select>
          </div>

          <select
            name="area"
            className="input"
            value={filtros.area || ''}
            onChange={handleChange}
          >
            <option value="">Setor</option>
            {setores.map(s => (
              <option key={s.id || s.codigo || s.nome} value={s.codigo || s.nome}>
                {s.nome || s.codigo}
              </option>
            ))}
          </select>

          <select
            name="tipo_solicitacao_id"
            className="input"
            value={filtros.tipo_solicitacao_id || ''}
            onChange={handleChange}
          >
            <option value="">Tipo de Solicitação</option>
            {tiposSolicitacao.map(t => (
              <option key={t.id} value={t.id}>{t.nome}</option>
            ))}
          </select>

          <select
            name="status"
            onChange={handleChange}
            className="input"
            value={filtros.status || ''}
          >
            <option value="">Status</option>
            {statusOptions.map(item => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <input
            name="valor_min"
            placeholder="Valor mínimo"
            className="input"
            value={filtros.valor_min || ''}
            onChange={handleChange}
            type="number"
            step="0.01"
            min="0"
          />

          <input
            name="valor_max"
            placeholder="Valor máximo"
            className="input"
            value={filtros.valor_max || ''}
            onChange={handleChange}
            type="number"
            step="0.01"
            min="0"
          />

          <div>
            <label className="text-sm text-gray-600 block mb-1">Data de registro</label>
            <input
              name="data_registro"
              className="input"
              value={filtros.data_registro || ''}
              onChange={handleChange}
              type="date"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600 block mb-1">Data de vencimento</label>
            <input
              name="data_vencimento"
              className="input"
              value={filtros.data_vencimento || ''}
              onChange={handleChange}
              type="date"
            />
          </div>

          {mostrarFiltroResponsavel && (
            <div>
              <label className="text-sm text-gray-600 block mb-1">Responsáveis</label>
              <select
                name="responsavel"
                className="input h-28"
                multiple
                value={responsavelValues}
                onChange={handleMultiChange}
              >
                {responsaveisOptions.map(responsavel => (
                  <option key={responsavel.value} value={responsavel.value}>
                    {responsavel.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-end md:col-span-2 xl:col-span-2">
            <button className="btn btn-outline" type="button" onClick={limparFiltros}>
              Limpar
            </button>
          </div>

          {mostrarSomaValor && (
            <div className="md:col-span-2 xl:col-span-2">
              <label className="text-sm text-gray-600 dark:text-slate-300">Soma do valor filtrado</label>
              <input
                className="input mt-1"
                value={Number(somaValorFiltrado || 0).toLocaleString('pt-BR', {
                  style: 'currency',
                  currency: 'BRL'
                })}
                readOnly
              />
            </div>
          )}
        </div>

        <div className="md:hidden sticky bottom-0 mt-3 -mx-3 px-3 py-2 bg-white/95 dark:bg-slate-900/95 border-t border-gray-200 dark:border-slate-700 backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <button
            className="btn btn-primary w-full"
            type="button"
            onClick={() => setMobileOpen(false)}
          >
            Filtrar
          </button>
        </div>
      </div>
    </div>
  );
}
