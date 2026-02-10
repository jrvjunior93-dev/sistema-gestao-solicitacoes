import { useEffect, useMemo, useRef, useState } from 'react';
import { getMinhasObras } from '../services/obras';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import { getSetores } from '../services/setores';
import { createSolicitacao } from '../services/solicitacoes';
import { uploadArquivos } from '../services/uploads';
import { getTiposSubContrato } from '../services/tiposSubContrato';
import { getContratos } from '../services/contratos';
import ObraSearchModal from '../components/ObraSearchModal';
import { getAreasObra } from '../services/configuracoesSistema';
import { useAuth } from '../contexts/AuthContext';

export default function NovaSolicitacao() {
  const { user } = useAuth();
  const [obras, setObras] = useState([]);
  const [obraCodigo, setObraCodigo] = useState('');
  const [obraDescricao, setObraDescricao] = useState('');
  const [modalObras, setModalObras] = useState(false);
  const [listaModal, setListaModal] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [setores, setSetores] = useState([]);
  const [areasObra, setAreasObra] = useState([]);
  const [tiposSub, setTiposSub] = useState([]);
  const [contratos, setContratos] = useState([]);
  const [contratosRef, setContratosRef] = useState([]);
  const [refContratoBusca, setRefContratoBusca] = useState('');
  const [refResultados, setRefResultados] = useState([]);
  const [arquivos, setArquivos] = useState([]);
  const [valorTexto, setValorTexto] = useState('');
  const anexosRef = useRef(null);

  const [form, setForm] = useState({
    obra_id: '',
    tipo_solicitacao_id: '',
    tipo_sub_id: '',
    contrato_id: '',
    codigo_contrato: '',
    area_responsavel: '',
    descricao: '',
    itens_apropriacao: '',
    ref_contrato_abertura: '',
    valor: '',
    data_vencimento: '',
    data_inicio_medicao: '',
    data_fim_medicao: ''
  });

  useEffect(() => {
    async function load() {
      setObras(await getMinhasObras());
      setTipos(await getTiposSolicitacao());
      setSetores(await getSetores());
      try {
        const cfg = await getAreasObra();
        setAreasObra(Array.isArray(cfg?.areas) ? cfg.areas : []);
      } catch (error) {
        console.error(error);
        setAreasObra([]);
      }
    }
    load();
  }, []);

  useEffect(() => {
    if (!form.tipo_solicitacao_id) {
      setTiposSub([]);
      setForm(prev => ({ ...prev, tipo_sub_id: '' }));
      return;
    }

    async function loadSub() {
      const data = await getTiposSubContrato({
        tipo_macro_id: form.tipo_solicitacao_id
      });
      setTiposSub(Array.isArray(data) ? data : []);
    }

    loadSub();
  }, [form.tipo_solicitacao_id]);

  useEffect(() => {
    if (!form.obra_id) {
      setContratos([]);
      setForm(prev => ({ ...prev, contrato_id: '' }));
      setContratosRef([]);
      return;
    }

    async function loadContratos() {
      const data = await getContratos({ obra_id: form.obra_id });
      setContratos(Array.isArray(data) ? data : []);
      setContratosRef([]);
    }

    loadContratos();
  }, [form.obra_id]);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  const tipoSelecionado = tipos.find(t => String(t.id) === String(form.tipo_solicitacao_id));
  const nomeTipoSelecionado = String(tipoSelecionado?.nome || '').trim().toUpperCase();
  const nomeTipoNormalizado = useMemo(() => {
    return nomeTipoSelecionado
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }, [nomeTipoSelecionado]);
  const subtipoObrigatorio = nomeTipoSelecionado === 'ADM LOCAL DE OBRA';
  const medicaoObrigatoria = nomeTipoNormalizado === 'MEDICAO';
  const aberturaContratoObrigatoria = nomeTipoNormalizado === 'ABERTURA DE CONTRATO';
  const solicitacaoCompra = nomeTipoNormalizado === 'SOLICITACAO DE COMPRA';
  const exibirCamposContrato = medicaoObrigatoria || subtipoObrigatorio;

  useEffect(() => {
    if (!exibirCamposContrato) {
      setForm(prev => ({
        ...prev,
        tipo_sub_id: '',
        contrato_id: '',
        codigo_contrato: ''
      }));
      setRefContratoBusca('');
      setRefResultados([]);
      setContratosRef([]);
    }
    if (solicitacaoCompra) {
      setForm(prev => ({ ...prev, valor: '' }));
      setValorTexto('');
    }
  }, [exibirCamposContrato, solicitacaoCompra]);

  function formatarMoeda(valor) {
    if (Number.isNaN(valor)) return '';
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function atualizarValor(raw) {
    const numeros = raw.replace(/\D/g, '');
    const valor = numeros ? Number(numeros) / 100 : 0;
    setValorTexto(numeros ? formatarMoeda(valor) : '');
    setForm(prev => ({ ...prev, valor: valor || '' }));
  }

  async function buscarObrasPorCodigo() {
    const codigo = obraCodigo.trim().toUpperCase();
    if (!codigo) return;
    const data = await getMinhasObras({ codigo });
    const lista = Array.isArray(data) ? data : [];
    if (lista.length === 1) {
      const obra = lista[0];
      setForm(prev => ({ ...prev, obra_id: String(obra.id) }));
      setObraDescricao(obra.nome || '');
      setObras(lista);
      return;
    }
    alert('Obra nao encontrada');
  }

  async function buscarObrasPorDescricao() {
    const descricao = obraDescricao.trim();
    if (!descricao) return;
    const data = await getMinhasObras({ descricao });
    const lista = Array.isArray(data) ? data : [];
    if (lista.length === 0) {
      alert('Nenhuma obra encontrada');
      return;
    }
    setListaModal(lista);
    setModalObras(true);
  }

  async function buscarRefContrato() {
    const termo = refContratoBusca.trim();
    if (!termo) return;
    const data = await getContratos({ ref: termo });
    const lista = Array.isArray(data) ? data : [];
    if (lista.length === 0) {
      alert('Nenhuma referencia encontrada');
      setRefResultados([]);
      setContratosRef([]);
      return;
    }
    setRefResultados(lista);
    setContratosRef(lista);
    if (lista.length === 1) {
      selecionarContratoRef(lista[0]);
    }
  }

  function selecionarContratoRef(contrato) {
    setForm(prev => ({
      ...prev,
      contrato_id: String(contrato.id),
      codigo_contrato: contrato.codigo || ''
    }));
    setRefContratoBusca(contrato.ref_contrato || '');
    setRefResultados([]);
  }

  function limparRefContrato() {
    setRefContratoBusca('');
    setRefResultados([]);
    setContratosRef([]);
    setForm(prev => ({ ...prev, contrato_id: '', codigo_contrato: '' }));
  }

  function selecionarObra(obra) {
    setForm(prev => ({ ...prev, obra_id: String(obra.id) }));
    setObraCodigo(obra.codigo || '');
    setObraDescricao(obra.nome || '');
    setModalObras(false);
    setObras([obra]);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (!form.obra_id) {
      alert('Selecione uma obra');
      return;
    }

    if (subtipoObrigatorio && !form.tipo_sub_id) {
      alert('Para continuar, selecione o subtipo para Adm Local de Obra.');
      return;
    }
    if (medicaoObrigatoria && (!form.data_inicio_medicao || !form.data_fim_medicao)) {
      alert('Para Medicao, informe data inicial e data final.');
      return;
    }
    if (aberturaContratoObrigatoria && !form.itens_apropriacao) {
      alert('Para Abertura de Contrato, informe os itens de apropriacao.');
      return;
    }
    if (aberturaContratoObrigatoria && !form.ref_contrato_abertura) {
      alert('Para Abertura de Contrato, informe a ref do contrato.');
      return;
    }

    const payload = {
      ...form,
      contrato_id: form.contrato_id || null,
      tipo_sub_id: form.tipo_sub_id || null,
      tipo_macro_id: form.tipo_solicitacao_id || null,
      data_vencimento: form.data_vencimento || null,
      data_inicio_medicao: form.data_inicio_medicao || null,
      data_fim_medicao: form.data_fim_medicao || null,
      itens_apropriacao: form.itens_apropriacao || null,
      ref_contrato_abertura: form.ref_contrato_abertura || null
    };

    const solicitacao = await createSolicitacao(payload);

    if (arquivos.length > 0) {
      await uploadArquivos({
        files: arquivos,
        solicitacao_id: solicitacao.id,
        tipo: 'SOLICITACAO'
      });
    }

    alert('Solicitacao criada com sucesso');
    setForm({
      obra_id: '',
      tipo_solicitacao_id: '',
      tipo_sub_id: '',
      contrato_id: '',
      codigo_contrato: '',
      area_responsavel: '',
      descricao: '',
      itens_apropriacao: '',
      ref_contrato_abertura: '',
      valor: '',
      data_vencimento: '',
      data_inicio_medicao: '',
      data_fim_medicao: ''
    });
    setContratos([]);
    setTiposSub([]);
    setArquivos([]);
    setObraCodigo('');
    setObraDescricao('');
    setListaModal([]);
    setModalObras(false);
    setValorTexto('');
    setRefContratoBusca('');
    setRefResultados([]);
    setContratosRef([]);
    if (anexosRef.current) {
      anexosRef.current.value = '';
    }
  }

  const isSetorObra =
    user?.setor?.codigo === 'OBRA' ||
    user?.area === 'OBRA';
  const setoresFiltrados = useMemo(() => {
    if (!isSetorObra) return setores;
    if (!areasObra || areasObra.length === 0) return setores;
    const permitidas = new Set(areasObra.map(a => String(a).toUpperCase()));
    return setores.filter(s => permitidas.has(String(s.codigo || '').toUpperCase()));
  }, [setores, isSetorObra, areasObra]);
  const contratosDisponiveis = contratosRef.length > 0 ? contratosRef : contratos;

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Nova Solicitacao</h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="grid gap-1 text-sm">
            Codigo da obra
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Ex: OBRA123"
                value={obraCodigo}
                onChange={e => setObraCodigo(e.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={buscarObrasPorCodigo}>
                Buscar
              </button>
            </div>
          </label>

          <label className="grid gap-1 text-sm">
            Descricao da obra
            <div className="flex gap-2">
              <input
                className="input"
                placeholder="Buscar por descricao"
                value={obraDescricao}
                onChange={e => setObraDescricao(e.target.value)}
              />
              <button type="button" className="btn btn-outline" onClick={buscarObrasPorDescricao}>
                Buscar
              </button>
            </div>
          </label>

          <label className="grid gap-1 text-sm">
            Tipo de Solicitacao
            <select
              name="tipo_solicitacao_id"
              onChange={handleChange}
              className="input"
              required
              value={form.tipo_solicitacao_id}
            >
              <option value="">Selecione</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            Area Responsavel
            <select
              name="area_responsavel"
              onChange={handleChange}
              className="input"
              required
              value={form.area_responsavel}
            >
              <option value="">Selecione</option>
              {setoresFiltrados.map(s => (
                <option key={s.id} value={s.codigo}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>

          {exibirCamposContrato && (
            <label className="grid gap-1 text-sm md:col-span-2">
              Ref. do Contrato
              <div className="flex gap-2">
                <input
                  className="input"
                  placeholder="Buscar por referencia do contrato"
                  value={refContratoBusca}
                  onChange={e => setRefContratoBusca(e.target.value)}
                />
                <button type="button" className="btn btn-outline" onClick={buscarRefContrato}>
                  Buscar
                </button>
                <button type="button" className="btn btn-outline" onClick={limparRefContrato}>
                  Limpar
                </button>
              </div>
              {refResultados.length > 1 && (
                <div className="mt-2 border rounded p-2 max-h-40 overflow-auto">
                  {refResultados.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selecionarContratoRef(item)}
                      className="block w-full text-left text-sm p-2 hover:bg-gray-50 rounded"
                    >
                      {item.codigo} - {item.ref_contrato || '-'}
                    </button>
                  ))}
                </div>
              )}
            </label>
          )}
        </div>

        {exibirCamposContrato && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="grid gap-1 text-sm">
              Subtipo
              <select
                name="tipo_sub_id"
                onChange={handleChange}
                className="input"
                required={subtipoObrigatorio}
                disabled={!form.tipo_solicitacao_id}
                value={form.tipo_sub_id}
              >
                <option value="">Selecione</option>
                {tiposSub.map(t => (
                  <option key={t.id} value={t.id}>{t.nome}</option>
                ))}
              </select>
              {subtipoObrigatorio && (
                <span className="text-xs text-gray-500">
                  Obrigatorio para Adm Local de Obra.
                </span>
              )}
            </label>

            <label className="grid gap-1 text-sm">
              Contrato
              <select
                name="contrato_id"
                onChange={e => {
                  const contratoId = e.target.value;
                  const contrato = contratosDisponiveis.find(c => String(c.id) === String(contratoId));
                  setForm(prev => ({
                    ...prev,
                    contrato_id: contratoId,
                    codigo_contrato: contrato?.codigo || ''
                  }));
                }}
                className="input"
                disabled={!form.obra_id && contratosDisponiveis.length === 0}
                value={form.contrato_id}
              >
                <option value="">Nao vincular</option>
                {contratosDisponiveis.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.codigo} - {c.ref_contrato || '-'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {!solicitacaoCompra && (
          <label className="grid gap-1 text-sm">
            Valor
            <input
              type="text"
              className="input"
              value={valorTexto}
              onChange={e => atualizarValor(e.target.value)}
              placeholder="R$ 0,00"
            />
          </label>
        )}

        <label className="grid gap-1 text-sm">
          Data de vencimento
          <input
            name="data_vencimento"
            type="date"
            onChange={handleChange}
            className="input"
            value={form.data_vencimento}
          />
        </label>

        {medicaoObrigatoria && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="grid gap-1 text-sm">
              Data inicial (Medição)
              <input
                name="data_inicio_medicao"
                type="date"
                onChange={handleChange}
                className="input"
                value={form.data_inicio_medicao}
                required
              />
            </label>
            <label className="grid gap-1 text-sm">
              Data final (Medição)
              <input
                name="data_fim_medicao"
                type="date"
                onChange={handleChange}
                className="input"
                value={form.data_fim_medicao}
                required
              />
            </label>
          </div>
        )}

        {aberturaContratoObrigatoria && (
          <label className="grid gap-1 text-sm">
            Ref. do Contrato
            <input
              name="ref_contrato_abertura"
              onChange={handleChange}
              className="input"
              required
              value={form.ref_contrato_abertura}
              placeholder="Informe a ref do contrato"
            />
          </label>
        )}

        {aberturaContratoObrigatoria && (
          <label className="grid gap-1 text-sm">
            Itens de Apropriacao
            <textarea
              name="itens_apropriacao"
              onChange={handleChange}
              className="input min-h-[120px]"
              required
              value={form.itens_apropriacao}
              placeholder="Descreva os itens de apropriacao"
            />
          </label>
        )}

        <label className="grid gap-1 text-sm">
          Descricao
          <textarea
            name="descricao"
            onChange={handleChange}
            className="input min-h-[120px]"
            required
            value={form.descricao}
          />
        </label>

        <label className="grid gap-1 text-sm">
          Anexos
          <input
            type="file"
            multiple
            ref={anexosRef}
            onChange={e => setArquivos([...e.target.files])}
          />
        </label>

        <div className="flex justify-end">
          <button className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700">
            Criar Solicitacao
          </button>
        </div>
      </form>

      <ObraSearchModal
        aberto={modalObras}
        obras={listaModal}
        onClose={() => setModalObras(false)}
        onSelect={selecionarObra}
      />
    </div>
  );
}
