import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getAreasObra, salvarAreasObra } from '../services/configuracoesSistema';

export default function AreasObra() {
  const [setores, setSetores] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function load() {
      const [listaSetores, cfg] = await Promise.all([
        getSetores(),
        getAreasObra()
      ]);
      const areas = Array.isArray(cfg?.areas) ? cfg.areas : [];
      setSelecionadas(new Set(areas.map(a => String(a).toUpperCase())));
      setSetores(Array.isArray(listaSetores) ? listaSetores : []);
    }
    load();
  }, []);

  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) => {
      const nomeA = String(a?.nome || '').toUpperCase();
      const nomeB = String(b?.nome || '').toUpperCase();
      return nomeA.localeCompare(nomeB);
    });
  }, [setores]);

  function alternar(codigo) {
    const key = String(codigo || '').toUpperCase();
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selecionarTodas() {
    setSelecionadas(new Set(setores.map(s => String(s.codigo || '').toUpperCase())));
  }

  function limparSelecao() {
    setSelecionadas(new Set());
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarAreasObra({ areas: Array.from(selecionadas) });
      alert('Configuracao salva com sucesso');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar configuracao');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Areas visiveis para OBRA</h1>
        <p className="text-sm text-gray-600 mt-1">
          Marque quais areas os usuarios do setor OBRA podem selecionar
          na tela de Nova Solicitacao.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <div className="flex gap-2 flex-wrap">
          <button type="button" className="btn btn-outline" onClick={selecionarTodas}>
            Selecionar todas
          </button>
          <button type="button" className="btn btn-outline" onClick={limparSelecao}>
            Limpar selecao
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {setoresOrdenados.map(setor => {
            const codigo = String(setor.codigo || '').toUpperCase();
            const marcado = selecionadas.has(codigo);
            return (
              <label key={setor.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(codigo)}
                />
                <span>
                  {setor.nome} ({codigo})
                </span>
              </label>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={salvando}
          >
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}
