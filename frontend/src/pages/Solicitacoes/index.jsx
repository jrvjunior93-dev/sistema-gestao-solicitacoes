import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HiDocumentArrowDown,
  HiViewColumns,
  HiOutlineEye,
  HiOutlineUserPlus,
  HiOutlineFolderOpen,
  HiOutlineArrowRightOnRectangle,
  HiOutlineTrash,
  HiOutlineXMark
} from 'react-icons/hi2';
import Filtros from './Filtros';
import TabelaSolicitacoes from './TabelaSolicitacoes';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';
import { API_URL, authHeaders } from '../../services/api';
import { getSetores } from '../../services/setores';
import { getTiposSolicitacao } from '../../services/tiposSolicitacao';
import { getSetorPermissoes } from '../../services/setorPermissoes';
import { getStatusSetor } from '../../services/statusSetor';
import { useAuth } from '../../contexts/AuthContext';
import { parseDateSmart } from '../../utils/dateLocal';
import {
  arquivarSolicitacoesEmMassa,
  deleteSolicitacao,
  enviarSolicitacoesParaSetorEmMassa
} from '../../services/solicitacoes';

export default function Solicitacoes({ arquivadas = false }) {
  const DEFAULT_VISIBLE_COLUMNS = [
    'data',
    'codigo',
    'numero_sienge',
    'obra',
    'contrato',
    'ref_contrato',
    'descricao',
    'tipo',
    'valor',
    'setor',
    'responsavel',
    'status',
    'vencimento'
  ];
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [setoresMap, setSetoresMap] = useState({});
  const [setoresLista, setSetoresLista] = useState([]);
  const [tiposSolicitacao, setTiposSolicitacao] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [obrasOptions, setObrasOptions] = useState([]);
  const [responsaveisOptions, setResponsaveisOptions] = useState([]);
  const [permissaoUsuario, setPermissaoUsuario] = useState(null);
  const [selecionadasIds, setSelecionadasIds] = useState([]);
  const [modalEnvioMassa, setModalEnvioMassa] = useState(false);
  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviarUnitario, setModalEnviarUnitario] = useState(false);
  const [modalAtribuirMassa, setModalAtribuirMassa] = useState(false);
  const [usuariosAtribuicao, setUsuariosAtribuicao] = useState([]);
  const [usuarioAtribuicaoMassa, setUsuarioAtribuicaoMassa] = useState('');
  const [setorEnvioMassa, setSetorEnvioMassa] = useState('');
  const [processandoMassa, setProcessandoMassa] = useState(false);
  const [mostrarSeletorColunas, setMostrarSeletorColunas] = useState(false);
  const [colunasVisiveis, setColunasVisiveis] = useState(DEFAULT_VISIBLE_COLUMNS);
  const [colunasStoragePronto, setColunasStoragePronto] = useState(false);
  const [seletorColunasLeft, setSeletorColunasLeft] = useState(0);
  const [seletorColunasTop, setSeletorColunasTop] = useState(0);
  const [filtrosStoragePronto, setFiltrosStoragePronto] = useState(false);
  const seletorColunasRef = useRef(null);
  const botaoColunasRef = useRef(null);
  const { user } = useAuth();

  const [filtros, setFiltros] = useState({
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

  const filtrosStorageKey = useMemo(() => {
    const identificador = user?.id || user?.email || user?.nome || user?.perfil || 'anon';
    const escopo = arquivadas ? 'arquivadas' : 'ativas';
    return `solicitacoes:filtros:${escopo}:${identificador}`;
  }, [user?.id, user?.email, user?.nome, user?.perfil, arquivadas]);

  useEffect(() => {
    carregar();
  }, [filtros, arquivadas]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(filtrosStorageKey);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (parsed && typeof parsed === 'object') {
          setFiltros(prev => ({ ...prev, ...parsed }));
        }
      }
    } catch (error) {
      console.error('Erro ao carregar filtros salvos', error);
    } finally {
      setFiltrosStoragePronto(true);
    }
  }, [filtrosStorageKey]);

  useEffect(() => {
    if (!filtrosStoragePronto) return;
    try {
      localStorage.setItem(filtrosStorageKey, JSON.stringify(filtros));
    } catch (error) {
      console.error('Erro ao salvar filtros', error);
    }
  }, [filtros, filtrosStorageKey, filtrosStoragePronto]);

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

  function extrairOpcoesObras(lista) {
    const obrasMap = new Map();

    (Array.isArray(lista) ? lista : []).forEach(item => {
      const obraId = item?.obra?.id ?? item?.obra_id;
      const obraNome = item?.obra?.nome || null;
      if (obraId && obraNome) {
        const chave = String(obraId);
        if (!obrasMap.has(chave)) {
          obrasMap.set(chave, {
            value: chave,
            label: obraNome
          });
        }
      }
    });

    return Array.from(obrasMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  function extrairOpcoesResponsaveis(lista) {
    const responsaveisMap = new Map();

    (Array.isArray(lista) ? lista : []).forEach(item => {
      const responsavel = String(item?.responsavel || '').trim();
      if (responsavel && responsavel !== '-') {
        const chaveResp = responsavel.toUpperCase();
        if (!responsaveisMap.has(chaveResp)) {
          responsaveisMap.set(chaveResp, {
            value: responsavel,
            label: responsavel
          });
        }
      }
    });

    return Array.from(responsaveisMap.values()).sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }

  async function carregarOpcoesObras(paramsObj = {}) {
    const paramsObras = { ...paramsObj };
    delete paramsObras.obra_ids;

    const query = new URLSearchParams(paramsObras).toString();
    const res = await fetch(`${API_URL}/solicitacoes?${query}`, {
      headers: authHeaders()
    });

    if (!res.ok) {
      throw new Error('Erro ao carregar opcoes de obras');
    }

    const data = await res.json();
    return extrairOpcoesObras(Array.isArray(data) ? data : []);
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
      const lista = Array.isArray(data) ? data : [];
      setSolicitacoes(lista);
      setResponsaveisOptions(extrairOpcoesResponsaveis(lista));

      try {
        const obrasLista = await carregarOpcoesObras(paramsObj);
        setObrasOptions(obrasLista);
      } catch (errorOpcoesObras) {
        console.error(errorOpcoesObras);
        setObrasOptions(extrairOpcoesObras(lista));
      }

      setSelecionadasIds([]);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
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
  const isSetorFinanceiro = setorTokens.includes('FINANCEIRO');
  const isAdminGEO = perfilUpper.startsWith('ADMIN') && setorTokens.includes('GEO');
  const isSuperadmin = perfilUpper === 'SUPERADMIN';
  const colunasStorageKey = useMemo(() => {
    const identificador = user?.id || user?.email || user?.nome || user?.perfil || 'anon';
    return `solicitacoes:colunas:${identificador}`;
  }, [user?.id, user?.email, user?.nome, user?.perfil]);
  const opcoesColunas = useMemo(() => [
    { id: 'data', label: 'Data' },
    { id: 'codigo', label: 'Código' },
    { id: 'numero_sienge', label: 'Nº SIENGE' },
    { id: 'obra', label: 'Obra' },
    { id: 'contrato', label: 'Contrato' },
    ...(isSetorObra ? [{ id: 'ref_contrato', label: 'Ref. do Contrato' }] : []),
    { id: 'descricao', label: 'Descrição' },
    { id: 'tipo', label: 'Tipo de Solicitação' },
    { id: 'valor', label: 'Valor' },
    { id: 'setor', label: 'Setor' },
    { id: 'responsavel', label: 'Responsável' },
    { id: 'status', label: 'Status' },
    { id: 'vencimento', label: 'Vencimento' },
    ...(arquivadas ? [{ id: 'acoes', label: 'Ações' }] : [])
  ], [isSetorObra, arquivadas]);

  useEffect(() => {
    try {
      const salvo = localStorage.getItem(colunasStorageKey);
      if (salvo) {
        const parsed = JSON.parse(salvo);
        if (Array.isArray(parsed)) {
          setColunasVisiveis(parsed);
        }
      }
    } catch (error) {
      console.error('Erro ao carregar preferencia de colunas', error);
    } finally {
      setColunasStoragePronto(true);
    }
  }, [colunasStorageKey]);

  useEffect(() => {
    setColunasVisiveis(prev => {
      const validas = opcoesColunas.map(c => c.id);
      const filtradas = prev.filter(id => validas.includes(id));
      const obrigatorias = ['codigo', 'status', 'acoes'];
      for (const obrigatoria of obrigatorias) {
        if (!filtradas.includes(obrigatoria) && validas.includes(obrigatoria)) {
          filtradas.push(obrigatoria);
        }
      }
      return filtradas.length > 0 ? filtradas : validas;
    });
  }, [isSetorObra]);

  useEffect(() => {
    if (!colunasStoragePronto) return;
    try {
      localStorage.setItem(colunasStorageKey, JSON.stringify(colunasVisiveis));
    } catch (error) {
      console.error('Erro ao salvar preferencia de colunas', error);
    }
  }, [colunasVisiveis, colunasStorageKey, colunasStoragePronto]);

  useEffect(() => {
    function fecharAoClicarFora(event) {
      if (!mostrarSeletorColunas) return;
      const alvo = event.target;
      if (seletorColunasRef.current?.contains(alvo)) return;
      if (botaoColunasRef.current?.contains(alvo)) return;
      setMostrarSeletorColunas(false);
    }

    document.addEventListener('mousedown', fecharAoClicarFora);
    return () => document.removeEventListener('mousedown', fecharAoClicarFora);
  }, [mostrarSeletorColunas]);

  useEffect(() => {
    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      setMostrarSeletorColunas(false);
      setModalEnvioMassa(false);
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

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
        alert(`Arquivamento em massa concluído. Arquivadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}.`);
      } else {
        alert('Solicitações arquivadas em massa com sucesso.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao arquivar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  function formatarDataExportacao(valor) {
    if (!valor) return '';
    const data = parseDateSmart(valor);
    if (!data || Number.isNaN(data.getTime())) return String(valor);
    return data.toLocaleDateString('pt-BR');
  }

  function formatarValorExportacao(valor) {
    const n = Number(valor);
    if (Number.isNaN(n)) return '';
    return n.toFixed(2).replace('.', ',');
  }

  function exportarSelecionadasExcel() {
    if (selecionadasIds.length === 0) {
      alert('Selecione ao menos uma solicitação.');
      return;
    }

    const selecionadas = solicitacoes.filter(item => selecionadasIds.includes(Number(item.id)));
    if (selecionadas.length === 0) {
      alert('Nenhuma solicitação selecionada para exportar.');
      return;
    }

    const linhas = [
      [
        'Código',
        'Nº SIENGE',
        'Obra',
        'Contrato',
        'Ref. do Contrato',
        'Descrição',
        'Tipo de Solicitação',
        'Valor',
        'Setor',
        'Responsável',
        'Status',
        'Data Registro',
        'Data Vencimento'
      ],
      ...selecionadas.map(item => [
        item.codigo || '',
        item.numero_pedido || '',
        item.obra?.nome || '',
        item.contrato?.codigo || item.codigo_contrato || '',
        item.contrato?.ref_contrato || item.ref_contrato || '',
        item.descricao || '',
        item.tipo?.nome || '',
        formatarValorExportacao(item.valor),
        item.area_responsavel || '',
        item.responsavel || '',
        item.status_global || '',
        formatarDataExportacao(item.createdAt),
        formatarDataExportacao(item.data_vencimento)
      ])
    ];

    const csv = linhas
      .map(colunas => colunas
        .map(valor => `"${String(valor ?? '').replace(/"/g, '""')}"`)
        .join(';'))
      .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dataRef = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `solicitacoes-selecionadas-${dataRef}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  function toggleColuna(id) {
    const obrigatorias = new Set(['codigo', 'status', 'acoes']);
    if (obrigatorias.has(id)) return;
    setColunasVisiveis(prev => (
      prev.includes(id)
        ? prev.filter(col => col !== id)
        : [...prev, id]
    ));
  }

  function alternarSeletorColunas() {
    if (!mostrarSeletorColunas && botaoColunasRef.current) {
      const btnRect = botaoColunasRef.current.getBoundingClientRect();
      const containerRect = botaoColunasRef.current
        ?.closest('.acoes-massa-solicitacoes')
        ?.getBoundingClientRect();
      const left = Math.max(0, Math.round(btnRect.left - (containerRect?.left || 0)));
      const top = Math.max(0, Math.round(btnRect.bottom - (containerRect?.top || 0) + 8));
      setSeletorColunasLeft(left);
      setSeletorColunasTop(top);
    }
    setMostrarSeletorColunas(prev => !prev);
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
        alert(`Envio em massa concluído. Enviadas: ${resultado.sucesso}. Falhas: ${resultado.erros.length}.`);
      } else {
        alert('Solicitações enviadas em massa com sucesso.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar solicitações em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  const selecionadaUnica = useMemo(() => {
    if (selecionadasIds.length !== 1) return null;
    const idSelecionado = Number(selecionadasIds[0]);
    return solicitacoes.find(item => Number(item.id) === idSelecionado) || null;
  }, [selecionadasIds, solicitacoes]);

  const podeAssumirUnica = useMemo(() => {
    if (!selecionadaUnica) return false;
    if (isSetorObra) return false;
    const modo = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
    if (modo !== 'TODOS_VISIVEIS') return false;
    const isUsuario = user?.perfil === 'USUARIO';
    return isUsuario ? (!!permissaoUsuario?.usuario_pode_assumir || isSetorFinanceiro) : true;
  }, [selecionadaUnica, isSetorObra, permissaoUsuario, user?.perfil, isSetorFinanceiro]);

  const podeAtribuirUnica = useMemo(() => {
    if (!selecionadaUnica) return false;
    if (isSetorObra) return false;
    const modo = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
    if (modo !== 'TODOS_VISIVEIS') return false;
    const isUsuario = user?.perfil === 'USUARIO';
    return isUsuario ? (!!permissaoUsuario?.usuario_pode_atribuir || isSetorFinanceiro) : true;
  }, [selecionadaUnica, isSetorObra, permissaoUsuario, user?.perfil, isSetorFinanceiro]);
  const podeAtribuirMassa = useMemo(() => {
    if (selecionadasIds.length <= 1) return false;
    if (isSetorObra) return false;
    const modo = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
    if (modo !== 'TODOS_VISIVEIS') return false;
    const isUsuario = user?.perfil === 'USUARIO';
    return isUsuario ? (!!permissaoUsuario?.usuario_pode_atribuir || isSetorFinanceiro) : true;
  }, [selecionadasIds.length, isSetorObra, permissaoUsuario, user?.perfil, isSetorFinanceiro]);

  const podeExcluirUnica = !!selecionadaUnica && (isSuperadmin || isAdminGEO);

  const isSetorObraSolicitacaoUnica = useMemo(() => {
    if (!selecionadaUnica) return false;
    const setorNomeSolicitacao =
      (setoresMap?.[selecionadaUnica.area_responsavel] || selecionadaUnica.area_responsavel || '');
    return String(setorNomeSolicitacao).trim().toUpperCase() === 'OBRA';
  }, [selecionadaUnica, setoresMap]);

  async function assumirSelecionada() {
    if (!selecionadaUnica) return;
    try {
      const res = await fetch(`${API_URL}/solicitacoes/${selecionadaUnica.id}/assumir`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!res.ok) {
        let mensagem = 'Erro ao assumir solicitação';
        try {
          const data = await res.json();
          mensagem = data?.error || mensagem;
        } catch (_) {}
        alert(mensagem);
        return;
      }

      alert('Solicitação assumida com sucesso.');
      await carregar();
    } catch (error) {
      console.error(error);
      alert('Erro ao assumir solicitação');
    }
  }

  async function excluirSelecionada() {
    if (!selecionadaUnica) return;
    if (!confirm('Excluir esta solicitação? Esta ação não pode ser desfeita.')) return;
    try {
      await deleteSolicitacao(selecionadaUnica.id);
      await carregar();
    } catch (error) {
      console.error(error);
      alert('Erro ao excluir solicitação');
    }
  }

  async function carregarUsuariosAtribuicao() {
    try {
      const res = await fetch(`${API_URL}/usuarios/opcoes-atribuicao`, {
        headers: authHeaders()
      });
      if (!res.ok) {
        setUsuariosAtribuicao([]);
        return;
      }

      const data = await res.json();
      const lista = Array.isArray(data) ? data : [];
      const setorUsuario = user?.setor_id ? String(user.setor_id) : '';
      const filtrados = setorUsuario
        ? lista.filter(u => String(u.setor_id) === setorUsuario)
        : lista;
      setUsuariosAtribuicao(filtrados);
    } catch (error) {
      console.error(error);
      setUsuariosAtribuicao([]);
    }
  }

  async function abrirModalAtribuirMassa() {
    setUsuarioAtribuicaoMassa('');
    await carregarUsuariosAtribuicao();
    setModalAtribuirMassa(true);
  }

  async function confirmarAtribuirMassa() {
    if (!usuarioAtribuicaoMassa) {
      alert('Selecione um usuário.');
      return;
    }
    if (selecionadasIds.length <= 1) {
      alert('Selecione mais de uma solicitação.');
      return;
    }

    try {
      setProcessandoMassa(true);
      let sucesso = 0;
      const erros = [];

      for (const solicitacaoId of selecionadasIds) {
        try {
          const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/atribuir`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              usuario_responsavel_id: usuarioAtribuicaoMassa
            })
          });

          if (!res.ok) {
            let mensagem = 'Erro ao atribuir';
            try {
              const data = await res.json();
              mensagem = data?.error || mensagem;
            } catch (_) {}
            erros.push(`SOL-${solicitacaoId}: ${mensagem}`);
            continue;
          }

          sucesso += 1;
        } catch (error) {
          erros.push(`SOL-${solicitacaoId}: falha de conexão`);
        }
      }

      setModalAtribuirMassa(false);
      await carregar();

      if (erros.length > 0) {
        alert(`Atribuição em massa concluída. Sucesso: ${sucesso}. Falhas: ${erros.length}.`);
      } else {
        alert('Atribuição em massa realizada com sucesso.');
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao atribuir em massa.');
    } finally {
      setProcessandoMassa(false);
    }
  }

  return (
    <div className="solicitacoes-page px-0 py-1 md:py-2">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 mb-4 md:mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">
          {arquivadas ? 'Solicitações Arquivadas' : 'Solicitações'}
        </h1>
      </div>

      <Filtros
        filtros={filtros}
        setFiltros={setFiltros}
        obrasOptions={obrasOptions}
        responsaveisOptions={responsaveisOptions}
        setores={setoresLista}
        tiposSolicitacao={tiposSolicitacao}
        statusOptions={statusOptions}
        mostrarFiltroResponsavel={isSetorFinanceiro}
        mostrarSomaValor={mostrarSomaValor}
        somaValorFiltrado={somaValorFiltrado}
      />

      {!arquivadas && (
        <div className="acoes-massa-solicitacoes solicitacoes-toolbar sol-surface-card relative p-3 md:p-4 rounded-xl mb-4 flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="text-sm text-gray-600 dark:text-slate-300">
            Selecionadas: <strong>{selecionadasIds.length}</strong>
          </div>
          <div className="flex flex-wrap gap-2 xl:ml-auto">
            <button
              type="button"
              className="btn btn-outline inline-flex items-center gap-2"
              onClick={exportarSelecionadasExcel}
              disabled={processandoMassa || selecionadasIds.length === 0}
              title="Exportar selecionadas para Excel (.csv)"
              aria-label="Exportar selecionadas para Excel"
            >
              <HiDocumentArrowDown className="w-4 h-4" />
              <span className="hidden sm:inline">Exportar</span>
            </button>
            <button
              ref={botaoColunasRef}
              type="button"
              className="btn btn-outline inline-flex items-center gap-2"
              onClick={alternarSeletorColunas}
              title="Selecionar colunas"
              aria-label="Selecionar colunas"
            >
              <HiViewColumns className="w-4 h-4" />
              <span className="hidden sm:inline">Colunas</span>
            </button>
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
            <span className="text-xs text-blue-700 dark:text-blue-300">
              Setor OBRA não pode enviar solicitações para outro setor.
            </span>
          )}

          {mostrarSeletorColunas && (
            <div
              ref={seletorColunasRef}
              className="absolute z-20 w-[320px] max-w-[calc(100vw-2rem)] bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-lg p-3"
              style={{ left: `${seletorColunasLeft}px`, top: `${seletorColunasTop}px` }}
            >
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium">Colunas visíveis</p>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => setColunasVisiveis(opcoesColunas.map(c => c.id))}
                >
                  Mostrar todas
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {opcoesColunas.map(col => {
                  const obrigatoria = ['codigo', 'status', 'acoes'].includes(col.id);
                  const marcada = colunasVisiveis.includes(col.id);
                  return (
                    <label key={col.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={marcada}
                        disabled={obrigatoria}
                        onChange={() => toggleColuna(col.id)}
                      />
                      <span className={obrigatoria ? 'text-gray-500' : ''}>{col.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {loading && <p className="mt-6 text-sm md:text-base text-[var(--c-muted)]">Carregando...</p>}

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
          visibleColumns={colunasVisiveis}
          selecionadasIds={selecionadasIds}
          onToggleSelecionada={toggleSelecionada}
          onToggleSelecionarTodas={toggleSelecionarTodas}
        />
      )}

      {!arquivadas && selecionadasIds.length > 0 && (
        <div className="solicitacoes-massa-modal fixed left-1/2 -translate-x-1/2 bottom-4 z-40 bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 shadow-xl rounded-2xl px-3 py-2 flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700 dark:text-slate-200 px-2">
            {selecionadasIds.length} selecionada(s)
          </span>

          {selecionadaUnica && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={() => window.location.assign(`/solicitacoes/${selecionadaUnica.id}`)}
              title="Ver solicitação"
            >
              <HiOutlineEye className="w-4 h-4" />
              <span className="hidden sm:inline">Ver</span>
            </button>
          )}

          {selecionadaUnica && podeAssumirUnica && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={assumirSelecionada}
              disabled={processandoMassa}
              title="Assumir solicitação"
            >
              <HiOutlineUserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Assumir</span>
            </button>
          )}

          {selecionadaUnica && podeAtribuirUnica && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={() => setModalAtribuir(true)}
              disabled={processandoMassa}
              title="Atribuir responsável"
            >
              <HiOutlineUserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Atribuir</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
            onClick={exportarSelecionadasExcel}
            disabled={processandoMassa}
            title="Exportar selecionadas"
          >
            <HiDocumentArrowDown className="w-4 h-4" />
            <span className="hidden sm:inline">Exportar</span>
          </button>

          <button
            type="button"
            className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
            onClick={arquivarEmMassa}
            disabled={processandoMassa}
            title="Arquivar selecionadas"
          >
            <HiOutlineFolderOpen className="w-4 h-4" />
            <span className="hidden sm:inline">Arquivar</span>
          </button>

          {selecionadaUnica && !isSetorObra && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={() => setModalEnviarUnitario(true)}
              disabled={processandoMassa}
              title="Enviar para outro setor"
            >
              <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar</span>
            </button>
          )}

          {selecionadasIds.length > 1 && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={() => setModalEnvioMassa(true)}
              disabled={processandoMassa || isSetorObra}
              title="Enviar selecionadas para outro setor"
            >
              <HiOutlineArrowRightOnRectangle className="w-4 h-4" />
              <span className="hidden sm:inline">Enviar em massa</span>
            </button>
          )}

          {podeAtribuirMassa && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={abrirModalAtribuirMassa}
              disabled={processandoMassa}
              title="Atribuir responsável em massa"
            >
              <HiOutlineUserPlus className="w-4 h-4" />
              <span className="hidden sm:inline">Atribuir em massa</span>
            </button>
          )}

          {selecionadaUnica && podeExcluirUnica && (
            <button
              type="button"
              className="btn btn-outline !min-h-0 h-9 px-3 inline-flex items-center gap-2"
              onClick={excluirSelecionada}
              disabled={processandoMassa}
              title="Excluir solicitação"
            >
              <HiOutlineTrash className="w-4 h-4" />
              <span className="hidden sm:inline">Excluir</span>
            </button>
          )}

          <button
            type="button"
            className="btn btn-outline !min-h-0 h-9 px-2.5 inline-flex items-center gap-1"
            onClick={() => setSelecionadasIds([])}
            disabled={processandoMassa}
            title="Limpar seleção"
          >
            <HiOutlineXMark className="w-4 h-4" />
          </button>
        </div>
      )}

      {!arquivadas && modalAtribuir && selecionadaUnica && (
        <ModalAtribuirResponsavel
          solicitacaoId={selecionadaUnica.id}
          obraId={selecionadaUnica.obra_id}
          isSetorObraSolicitacao={isSetorObraSolicitacaoUnica}
          isUsuarioSetorObra={isSetorObra}
          onClose={() => setModalAtribuir(false)}
          onSucesso={carregar}
        />
      )}

      {!arquivadas && modalEnviarUnitario && selecionadaUnica && (
        <ModalEnviarSetor
          solicitacaoId={selecionadaUnica.id}
          onClose={() => setModalEnviarUnitario(false)}
          onSucesso={carregar}
        />
      )}

      {modalAtribuirMassa && !arquivadas && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-3">
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-xl w-full max-w-md ring-1 ring-gray-200 dark:ring-slate-700">
            <h2 className="text-lg font-semibold mb-3">Atribuir em massa</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-3">
              Selecionadas: {selecionadasIds.length}
            </p>
            <select
              className="input mb-4"
              value={usuarioAtribuicaoMassa}
              onChange={e => setUsuarioAtribuicaoMassa(e.target.value)}
            >
              <option value="">Selecione um usuário</option>
              {usuariosAtribuicao.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => setModalAtribuirMassa(false)}
                disabled={processandoMassa}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn bg-blue-700 text-white disabled:opacity-60"
                onClick={confirmarAtribuirMassa}
                disabled={processandoMassa}
              >
                {processandoMassa ? 'Atribuindo...' : 'Atribuir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalEnvioMassa && !arquivadas && (
        <div className="fixed inset-0 bg-black/40 flex justify-center items-center z-50 px-3">
          <div className="bg-white dark:bg-slate-900 p-4 md:p-6 rounded-xl w-full max-w-md ring-1 ring-gray-200 dark:ring-slate-700" role="dialog" aria-modal="true" aria-label="Enviar solicita??es em massa">
            <h2 className="text-lg font-semibold mb-4">Enviar solicitações em massa</h2>
            <p className="text-sm text-gray-600 dark:text-slate-300 mb-3">
              Selecionadas: {selecionadasIds.length}
            </p>
            <select
              className="input mb-4"
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
                className="btn btn-outline"
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
                className="btn bg-blue-600 text-white disabled:opacity-60"
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
