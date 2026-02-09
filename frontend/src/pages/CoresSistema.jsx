import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { getSetores } from '../services/setores';
import { getStatusSetor } from '../services/statusSetor';

const STATUS_PADRAO = [
  'PENDENTE',
  'EM_ANALISE',
  'AGUARDANDO_AJUSTE',
  'APROVADA',
  'REJEITADA',
  'CONCLUIDA'
];

export default function CoresSistema() {
  const { tema, atualizarTema } = useTheme();
  const [draft, setDraft] = useState(null);
  const [setores, setSetores] = useState([]);
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [statusSetor, setStatusSetor] = useState([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarSetores();
  }, []);

  useEffect(() => {
    if (tema) {
      setDraft(JSON.parse(JSON.stringify(tema)));
    }
  }, [tema]);

  useEffect(() => {
    carregarStatus();
  }, [setorSelecionado]);

  useEffect(() => {
    if (setores.length === 0) return;
    if (!draft) return;

    const savedKey = localStorage.getItem('cores_setor_selecionado');
    const normalizedSaved = savedKey ? String(savedKey).toUpperCase() : '';
    const setoresKeys = setores.map(s => String(s.codigo || s.nome || '').toUpperCase());

    if (setorSelecionado && setoresKeys.includes(String(setorSelecionado).toUpperCase())) {
      return;
    }

    if (normalizedSaved && setoresKeys.includes(normalizedSaved)) {
      const original = setores.find(s =>
        String(s.codigo || s.nome || '').toUpperCase() === normalizedSaved
      );
      setSetorSelecionado(String(original?.codigo || original?.nome || ''));
      return;
    }

    const setoresComCor = Object.keys(draft?.status?.setores || {});
    const encontrado = setores.find(s =>
      setoresComCor.includes(String(s.codigo || s.nome || '').toUpperCase())
    );
    if (encontrado) {
      setSetorSelecionado(String(encontrado.codigo || encontrado.nome || ''));
      return;
    }

    setSetorSelecionado(String(setores[0]?.codigo || setores[0]?.nome || ''));
  }, [setores, draft, setorSelecionado]);

  async function carregarSetores() {
    try {
      const data = await getSetores();
      const lista = Array.isArray(data) ? data : [];
      setSetores(lista);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarStatus() {
    try {
      if (!setorSelecionado) return;
      const data = await getStatusSetor({ setor: setorSelecionado });
      const lista = (Array.isArray(data) ? data : [])
        .map(s => s.nome)
        .filter(Boolean);
      setStatusSetor(lista);
    } catch (error) {
      console.error(error);
      setStatusSetor([]);
    }
  }

  const statusParaSetor = useMemo(() => {
    return Array.from(new Set(statusSetor.map(s => String(s).toUpperCase())));
  }, [statusSetor]);

  function atualizarCorAcao(chave, cor) {
    setDraft(prev => ({
      ...prev,
      actions: {
        ...(prev?.actions || {}),
        [chave]: cor
      }
    }));
  }

  function atualizarCorStatusGlobal(status, cor) {
    setDraft(prev => ({
      ...prev,
      status: {
        ...(prev?.status || {}),
        global: {
          ...(prev?.status?.global || {}),
          [status]: cor
        }
      }
    }));
  }

  function atualizarCorStatusSetor(status, cor) {
    const setorKey = String(setorSelecionado || '').toUpperCase();
    setDraft(prev => ({
      ...prev,
      status: {
        ...(prev?.status || {}),
        setores: {
          ...(prev?.status?.setores || {}),
          [setorKey]: {
            ...(prev?.status?.setores?.[setorKey] || {}),
            [status]: cor
          }
        }
      }
    }));
  }

  function selecionarSetor(valor) {
    setSetorSelecionado(valor);
    localStorage.setItem('cores_setor_selecionado', String(valor || '').toUpperCase());
  }

  async function salvar() {
    if (!draft) return;
    try {
      setSalvando(true);
      await atualizarTema(draft);
      alert('Cores atualizadas.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar cores.');
    } finally {
      setSalvando(false);
    }
  }

  if (!draft) return <p>Carregando cores...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Cores do Sistema</h1>

      <section className="bg-white p-6 rounded-xl shadow space-y-4">
        <h2 className="font-semibold">Paleta geral</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { chave: 'bg', label: 'Fundo' },
            { chave: 'surface', label: 'Superficie' },
            { chave: 'border', label: 'Borda' },
            { chave: 'text', label: 'Texto' },
            { chave: 'muted', label: 'Texto secundario' },
            { chave: 'primary', label: 'Primary' },
            { chave: 'primary600', label: 'Primary (hover)' },
            { chave: 'secondary', label: 'Secondary' },
            { chave: 'warning', label: 'Warning' },
            { chave: 'danger', label: 'Danger' },
            { chave: 'success', label: 'Success' }
          ].map(item => (
            <label key={item.chave} className="flex items-center gap-3 text-sm">
              <span className="w-36">{item.label}</span>
              <input
                type="color"
                value={draft.palette?.[item.chave] || '#ffffff'}
                onChange={e =>
                  setDraft(prev => ({
                    ...prev,
                    palette: {
                      ...(prev?.palette || {}),
                      [item.chave]: e.target.value
                    }
                  }))
                }
              />
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow space-y-4">
        <h2 className="font-semibold">Cores dos botoes de acao</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {[
            { chave: 'ver', label: 'Ver' },
            { chave: 'assumir', label: 'Assumir' },
            { chave: 'atribuir', label: 'Atribuir' },
            { chave: 'enviar', label: 'Enviar' },
            { chave: 'ocultar', label: 'Ocultar' }
          ].map(item => (
            <label key={item.chave} className="flex items-center gap-3 text-sm">
              <span className="w-24">{item.label}</span>
              <input
                type="color"
                value={draft.actions?.[item.chave] || '#2563eb'}
                onChange={e => atualizarCorAcao(item.chave, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow space-y-4">
        <h2 className="font-semibold">Cores de status (geral)</h2>
        <div className="grid gap-3 md:grid-cols-3">
          {STATUS_PADRAO.map(status => (
            <label key={status} className="flex items-center gap-3 text-sm">
              <span className="w-36">{status}</span>
              <input
                type="color"
                value={draft.status?.global?.[status] || '#9ca3af'}
                onChange={e => atualizarCorStatusGlobal(status, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow space-y-4">
        <h2 className="font-semibold">Cores de status por setor</h2>
        <div className="flex flex-wrap items-center gap-4">
          <label className="text-sm">
            Setor
            <select
              className="ml-2 border rounded p-2"
              value={setorSelecionado}
              onChange={e => selecionarSetor(e.target.value)}
            >
              {setores.map(s => (
                <option key={s.id} value={s.codigo || s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {statusParaSetor.length === 0 && (
            <p className="text-sm text-gray-500">
              Nenhum status cadastrado para este setor.
            </p>
          )}
          {statusParaSetor.map(status => (
            <label key={status} className="flex items-center gap-3 text-sm">
              <span className="w-36">{status}</span>
              <input
                type="color"
                value={
                  draft.status?.setores?.[String(setorSelecionado || '').toUpperCase()]?.[status] ||
                  draft.status?.global?.[status] ||
                  '#9ca3af'
                }
                onChange={e => atualizarCorStatusSetor(status, e.target.value)}
              />
            </label>
          ))}
        </div>
      </section>

      <button
        onClick={salvar}
        disabled={salvando}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {salvando ? 'Salvando...' : 'Salvar cores'}
      </button>
    </div>
  );
}
