import { useEffect, useState } from 'react';
import Filtros from './Filtros';
import TabelaSolicitacoes from './TabelaSolicitacoes';
import { API_URL, authHeaders } from '../../services/api';
import { getSetores } from '../../services/setores';
import { getTiposSolicitacao } from '../../services/tiposSolicitacao';
import { getMinhasObras } from '../../services/obras';
import { getSetorPermissoes } from '../../services/setorPermissoes';
import { getStatusSetor } from '../../services/statusSetor';
import { useAuth } from '../../contexts/AuthContext';
import {
  arquivarSolicitacoesEmMassa,
  enviarSolicitacoesParaSetorEmMassa
} from '../../services/solicitacoes';

export default function Solicitacoes({ arquivadas = false }) {
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setoresMap, setSetoresMap] = useState({});
  const [setoresLista, setSetoresLista] = useState([]);
  const [tiposSolicitacao, setTiposSolicitacao] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [permissaoUsuario, setPermissaoUsuario] = useState(null);
  const [selecionadasIds, setSelecionadasIds] = useState([]);
  const [modalEnvioMassa, setModalEnvioMassa] = useState(false);
  const [setorEnvioMassa, setSetorEnvioMassa] = useState('');
  const [processandoMassa, setProcessandoMassa] = useState(false);
  const { user } = useAuth();

  const [filtros, setFiltros] = useState({
    obra_descricao: '',
    obra_ids: '',
    area: '',
    tipo_solicitacao_id: '',
    status: '',
    valor_min: '',
    valor_max: '',
    data_registro: '',
    data_vencimento: ''
  });

  useEffect(() => {
    carregar();
  }, [filtros, arquivadas]);

  useEffect(() => {
    carregarSetores();
    carregarTiposSolicitacao();
    carregarStatusOptions();
    carregarPermissoes();
  }, []);

  async function carregarTiposSolicitacao() {
    try {
      const data = await getTiposSolicitacao();
      setTiposSolicitacao(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarSetores() {
    try {
      const data = await getSetores();
      const map = {};
      (Array.isArray(data) ? data : []).forEach(s => {
        map[s.codigo] = s.nome;
      });
      setSetoresLista(Array.isArray(data) ? data : []);
      setSetoresMap(map);
    } catch (error) {
      console.error(error);
    }
  }

  function normalizarStatus(status) {
    return String(status || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  async function carregarStatusOptions() {
    try {
      const data = await getStatusSetor();
      const lista = Array.isArray(data) ? data : [];
      const map = new Map();
      lista.forEach(item => {
        if (!item?.ativo) return;
        const nome = String(item.nome || '').trim();
        if (!nome) return;
        const key = normalizarStatus(nome);
        if (!map.has(key)) {
          map.set(key, nome);
        }
      });
      setStatusOptions(Array.from(map.entries()).map(([value, label]) => ({ value, label })));
    } catch (error) {
      console.error(error);
      setStatusOptions([]);
    }
  }

  async function carregarPermissoes() {
    try {
      if (user?.perfil !== 'USUARIO') {
        setPermissaoUsuario(null);
        return;
      }
      const setorToken = user?.setor?.codigo || user?.setor?.nome || user?.area || user?.setor_id;
      if (!setorToken) return;
      const data = await getSetorPermissoes({ setor: setorToken });
      const item = Array.isArray(data) && data.length > 0 ? data[0] : null;
      setPermissaoUsuario(item);
    } catch (error) {
      console.error(error);
      setPermissaoUsuario(null);
    }
  }

  async function carregar() {
    try {
      setLoading(true);

      const paramsObj = {};
      Object.entries(filtros).forEach(([chave, valor]) => {
        if (valor !== undefined && valor !== null && String(valor).trim() !== '') {
          paramsObj[chave] = String(valor).trim();
        }
      });
      if (arquivadas) {
        paramsObj.arquivadas = '1';
      }

      const params = new URLSearchParams(paramsObj).toString();

      const res = await fetch(`${API_URL}/solicitacoes?${params}`, {
        headers: authHeaders()
      });

      if (!res.ok) {
        throw new Error('Erro ao buscar solicitações');
      }

      const data = await res.json();
      setSolicitacoes(Array.isArray(data) ? data : []);
      setSelecionadasIds([]);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }

  async function buscarObraDescricao() {
    const descricao = (filtros.obra_descricao || '').trim();
    if (!descricao) {
      setFiltros(prev => ({ ...prev, obra_ids: '' }));
      return;
    }
    const data = await getMinhasObras({ descricao });
    const lista = Array.isArray(data) ? data : [];
    if (lista.length === 0) {
      setFiltros(prev => ({ ...prev, obra_ids: '0' }));
      return;
    }
    const ids = lista.map(o => o.id).join(',');
    setFiltros(prev => ({ ...prev, obra_ids: ids }));
  }

  const perfilUpper = String(user?.perfil || '').toUpperCase();
  const mostrarSomaValor = perfilUpper.startsWith('ADMIN');
  const somaValorFiltrado = solicitacoes.reduce((total, item) => {
    const valor = Number(item?.valor || 0);
    return total + (Number.isNaN(valor) ? 0 : valor);
  }, 0);

  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isSetorObra = setorTokens.includes('OBRA');

  function toggleSelecionada(id) {
    const idNum = Number(id);
    setSelecionadasIds(prev =>
      prev.includes(idNum)
        ? prev.filter(item => item !== idNum)
        : [...prev, idNum]
    );
  }

  function toggleSelecionarTodas() {
    const idsPagina = solicitacoes.map(item => Number(item.id));
    const todasSelecionadas = idsPagina.length > 0 && idsPagina.every(id => selecionadasIds.includes(id));
    setSelecionadasIds(todasSelecionadas ? [] : idsPagina);
  }

  async function arquivarEmMassa() {
    if (selecionadasIds.length === 0) {
      alert('Selecione ao menos uma solicitação.');
      return;
    }
    if (!confirm(`Arquivar ${selecionadasIds.length} solicitação(ões) somente para sua visualização?`)) {
      return;
    }

    try {
      setProcessandoMassa(true);
      const resultado = await arquivarSolicitacoesEmMassa(selecionadasIds);
      await carregar();
      if (resultado?.erros?.length > 0) {
        alert(`Arquivadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}.`);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao arquivar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  async function confirmarEnvioMassa() {
    if (isSetorObra) {
      alert('Setor OBRA não pode enviar solicitações para outro setor.');
      return;
    }
    if (selecionadasIds.length === 0) {
      alert('Selecione ao menos uma solicitação.');
      return;
    }
    if (!setorEnvioMassa) {
      alert('Selecione um setor de destino.');
      return;
    }

    try {
      setProcessandoMassa(true);
      const resultado = await enviarSolicitacoesParaSetorEmMassa({
        solicitacao_ids: selecionadasIds,
        setor_destino: setorEnvioMassa
      });
      setModalEnvioMassa(false);
      setSetorEnvioMassa('');
      await carregar();
      if (resultado?.erros?.length > 0) {
        alert(`Enviadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}.`);
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
          {arquivadas ? 'Solicitações Arquivadas' : 'Solicitações'}
        </h1>
      </div>

      <Filtros
        filtros={filtros}
        setFiltros={setFiltros}
        onBuscarObraDescricao={buscarObraDescricao}
        setores={setoresLista}
        tiposSolicitacao={tiposSolicitacao}
        statusOptions={statusOptions}
        mostrarSomaValor={mostrarSomaValor}
        somaValorFiltrado={somaValorFiltrado}
      />

      {!arquivadas && (
        <div className="bg-white p-4 rounded-xl shadow mb-4 flex flex-col md:flex-row md:items-center gap-3">
          <div className="text-sm text-gray-600">
            Selecionadas: <strong>{selecionadasIds.length}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={arquivarEmMassa}
              disabled={processandoMassa || selecionadasIds.length === 0}
            >
              Arquivar em massa
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setModalEnvioMassa(true)}
              disabled={processandoMassa || selecionadasIds.length === 0 || isSetorObra}
            >
              Enviar em massa
            </button>
          </div>
          {isSetorObra && (
            <span className="text-xs text-red-600">
              Setor OBRA não pode enviar solicitações para outro setor.
            </span>
          )}
        </div>
      )}

      {loading && <p className="mt-6">Carregando...</p>}

      {!loading && solicitacoes.length === 0 && (
        <p className="mt-6">
          {arquivadas ? 'Nenhuma solicitação arquivada.' : 'Nenhuma solicitação encontrada.'}
        </p>
      )}

      {!loading && solicitacoes.length > 0 && (
        <TabelaSolicitacoes
          solicitacoes={solicitacoes}
          onAtualizar={carregar}
          setoresMap={setoresMap}
          permissaoUsuario={permissaoUsuario}
          mostrarArquivadas={arquivadas}
          selecionadasIds={selecionadasIds}
          onToggleSelecionada={toggleSelecionada}
          onToggleSelecionarTodas={toggleSelecionarTodas}
        />
      )}

      {modalEnvioMassa && !arquivadas && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Enviar solicitações em massa</h2>
            <p className="text-sm text-gray-600 mb-3">
              Selecionadas: {selecionadasIds.length}
            </p>
            <select
              className="w-full border p-2 rounded mb-4"
              value={setorEnvioMassa}
              onChange={e => setSetorEnvioMassa(e.target.value)}
            >
              <option value="">Selecione um setor</option>
              {setoresLista.map(s => (
                <option key={s.id} value={s.nome}>
                  {s.nome}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="border px-4 py-2 rounded"
                onClick={() => {
                  setModalEnvioMassa(false);
                  setSetorEnvioMassa('');
                }}
                disabled={processandoMassa}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="bg-orange-600 text-white px-4 py-2 rounded disabled:opacity-60"
                onClick={confirmarEnvioMassa}
                disabled={processandoMassa}
              >
                {processandoMassa ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
