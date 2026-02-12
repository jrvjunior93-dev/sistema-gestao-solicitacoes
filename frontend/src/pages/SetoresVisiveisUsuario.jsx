import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getUsuarios } from '../services/usuarios';
import {
  getSetoresVisiveisPorUsuario,
  salvarSetoresVisiveisPorUsuario
} from '../services/configuracoesSistema';

export default function SetoresVisiveisUsuario() {
  const [setores, setSetores] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [regras, setRegras] = useState({});
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    async function load() {
      const [listaSetores, listaUsuarios, cfg] = await Promise.all([
        getSetores(),
        getUsuarios(),
        getSetoresVisiveisPorUsuario()
      ]);

      const setoresAtivos = Array.isArray(listaSetores)
        ? listaSetores.filter(s => s?.ativo !== false)
        : [];
      const usuariosAtivos = Array.isArray(listaUsuarios)
        ? listaUsuarios.filter(u => u?.ativo !== false)
        : [];
      setSetores(setoresAtivos);
      setUsuarios(usuariosAtivos);

      const regrasCarregadas = cfg?.regras && typeof cfg.regras === 'object'
        ? cfg.regras
        : {};
      setRegras(regrasCarregadas);
      setUsuarioSelecionado(String(usuariosAtivos?.[0]?.id || ''));
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

  const usuariosOrdenados = useMemo(() => {
    return [...usuarios].sort((a, b) => {
      const nomeA = String(a?.nome || '').toUpperCase();
      const nomeB = String(b?.nome || '').toUpperCase();
      return nomeA.localeCompare(nomeB);
    });
  }, [usuarios]);

  const setoresSelecionados = useMemo(() => {
    const lista = regras[String(usuarioSelecionado || '')] || [];
    return new Set(lista.map(item => String(item || '').toUpperCase()));
  }, [regras, usuarioSelecionado]);

  function alternarSetor(codigo) {
    const usuarioId = String(usuarioSelecionado || '');
    if (!usuarioId) return;
    const setor = String(codigo || '').toUpperCase();

    setRegras(prev => {
      const atuais = new Set((prev[usuarioId] || []).map(item => String(item || '').toUpperCase()));
      if (atuais.has(setor)) {
        atuais.delete(setor);
      } else {
        atuais.add(setor);
      }
      return {
        ...prev,
        [usuarioId]: Array.from(atuais)
      };
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarSetoresVisiveisPorUsuario({ regras });
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
        <h1 className="text-2xl font-semibold">Setores visiveis por usuario</h1>
        <p className="text-sm text-gray-600 mt-1">
          Defina quais setores cada usuario pode visualizar quando a solicitacao estiver atribuida/interagida por ele.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <label className="grid gap-1 text-sm md:max-w-md">
          Usuario
          <select
            className="input"
            value={usuarioSelecionado}
            onChange={e => setUsuarioSelecionado(e.target.value)}
          >
            <option value="">Selecione</option>
            {usuariosOrdenados.map(usuario => (
              <option key={usuario.id} value={String(usuario.id)}>
                {usuario.nome} ({String(usuario?.setor?.nome || '-').toUpperCase()})
              </option>
            ))}
          </select>
        </label>

        {usuarioSelecionado && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {setoresOrdenados.map(setor => {
              const codigo = String(setor.codigo || '').toUpperCase();
              const marcado = setoresSelecionados.has(codigo);
              return (
                <label key={setor.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={marcado}
                    onChange={() => alternarSetor(codigo)}
                  />
                  <span>
                    {setor.nome} ({codigo})
                  </span>
                </label>
              );
            })}
          </div>
        )}

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
