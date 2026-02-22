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

export default function Solicitacoes() {

  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setoresMap, setSetoresMap] = useState({});
  const [tiposSolicitacao, setTiposSolicitacao] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [permissaoUsuario, setPermissaoUsuario] = useState(null);
  const { user } = useAuth();

  const [filtros, setFiltros] = useState({
    obra_descricao: '',
    obra_ids: '',
    tipo_solicitacao_id: '',
    status: '',
    codigo_contrato: '',
    valor_min: '',
    data_registro: '',
    data_vencimento: '',
    responsavel: ''
  });

  /* ===============================
     CARREGAR DADOS
  =============================== */

  useEffect(() => {
    carregar();
  }, [filtros]);

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

      const params = new URLSearchParams(paramsObj).toString();

      const res = await fetch(
        `${API_URL}/solicitacoes?${params}`,
        {
          headers: authHeaders()
        }
      );

      if (!res.ok) {
        throw new Error('Erro ao buscar solicitações');
      }

      const data = await res.json();
      setSolicitacoes(Array.isArray(data) ? data : []);

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

  /* ===============================
     RENDER
  =============================== */

  return (
    <div className="p-6">

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-semibold">
          Solicitações
        </h1>
      </div>

      <Filtros
        filtros={filtros}
        setFiltros={setFiltros}
        onBuscarObraDescricao={buscarObraDescricao}
        tiposSolicitacao={tiposSolicitacao}
        statusOptions={statusOptions}
        mostrarSomaValor={mostrarSomaValor}
        somaValorFiltrado={somaValorFiltrado}
      />

      {loading && (
        <p className="mt-6">Carregando...</p>
      )}

      {!loading && solicitacoes.length === 0 && (
        <p className="mt-6">Nenhuma solicitação encontrada.</p>
      )}

      {!loading && solicitacoes.length > 0 && (
        <TabelaSolicitacoes
          solicitacoes={solicitacoes}
          onAtualizar={carregar}
          setoresMap={setoresMap}
          permissaoUsuario={permissaoUsuario}
        />
      )}


    </div>
  );
}
