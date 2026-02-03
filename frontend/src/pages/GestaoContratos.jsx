import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fileUrl } from '../services/api';
import { getObras } from '../services/obras';
import {
  atualizarContrato,
  criarContrato,
  getContratoAnexos,
  getContratosResumo,
  uploadContratoAnexos
} from '../services/contratos';

export default function GestaoContratos() {
  const { user } = useAuth();
  const [contratos, setContratos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [obras, setObras] = useState([]);
  const [form, setForm] = useState({
    obra_id: '',
    codigo: '',
    fornecedor: '',
    descricao: '',
    valor_total: ''
  });
  const [valorDisplay, setValorDisplay] = useState('');
  const [files, setFiles] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [ajustes, setAjustes] = useState({});
  const [modalAnexos, setModalAnexos] = useState(null);
  const [anexos, setAnexos] = useState([]);
  const [uploadAnexos, setUploadAnexos] = useState([]);

  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isAdminGEO =
    user?.perfil === 'ADMIN' && setorTokens.includes('GEO');
  const podeAcessar =
    user?.perfil === 'SUPERADMIN' || isAdminGEO;

  useEffect(() => {
    if (podeAcessar) {
      carregar();
      carregarCombos();
    } else {
      setLoading(false);
    }
  }, [podeAcessar]);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getContratosResumo();
      setContratos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar contratos');
    } finally {
      setLoading(false);
    }
  }

  async function carregarCombos() {
    try {
      const [obrasData] = await Promise.all([
        getObras()
      ]);
      setObras(Array.isArray(obrasData) ? obrasData : []);
    } catch (error) {
      console.error(error);
    }
  }

  function onChangeForm(e) {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  }

  function parseMoeda(valor) {
    if (!valor) return 0;
    const limpo = String(valor)
      .replace(/[^\d,.-]/g, '')
      .replace(/\./g, '')
      .replace(',', '.');
    const numero = Number(limpo);
    return Number.isNaN(numero) ? 0 : numero;
  }

  function formatMoeda(valor) {
    const numero = Number(valor || 0);
    return numero.toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  async function handleCriarContrato(e) {
    e.preventDefault();
    if (salvando) return;

    try {
      setSalvando(true);

      const payload = {
        obra_id: Number(form.obra_id),
        codigo: String(form.codigo || '').trim(),
        fornecedor: String(form.fornecedor || '').trim(),
        descricao: String(form.descricao || '').trim() || null,
        valor_total: valorDisplay ? parseMoeda(valorDisplay) : null,
        tipo_macro_id: null,
        tipo_sub_id: null
      };

      if (!payload.obra_id || !payload.codigo) {
        alert('Obra e codigo sao obrigatorios.');
        return;
      }

      const contrato = await criarContrato(payload);

      if (files.length > 0) {
        await uploadContratoAnexos(contrato.id, files);
      }

      setForm({
        obra_id: '',
        codigo: '',
        fornecedor: '',
        descricao: '',
        valor_total: ''
      });
      setValorDisplay('');
      setFiles([]);
      await carregar();
      alert('Contrato criado com sucesso.');
    } catch (error) {
      console.error(error);
      alert('Erro ao criar contrato.');
    } finally {
      setSalvando(false);
    }
  }

  function onChangeAjuste(id, campo, valor) {
    setAjustes(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [campo]: valor
      }
    }));
  }

  async function salvarAjustes(contrato) {
    const valores = ajustes[contrato.id];
    if (!valores) return;
    try {
      await atualizarContrato(contrato.id, {
        ajuste_solicitado: Number(valores.ajuste_solicitado ?? contrato.ajuste_solicitado ?? 0),
        ajuste_pago: Number(valores.ajuste_pago ?? contrato.ajuste_pago ?? 0)
      });
      await carregar();
      alert('Ajustes salvos.');
    } catch (error) {
      console.error(error);
      alert('Erro ao salvar ajustes.');
    }
  }

  async function abrirAnexos(contrato) {
    try {
      setModalAnexos(contrato);
      const data = await getContratoAnexos(contrato.id);
      setAnexos(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar anexos.');
    }
  }

  async function enviarAnexos() {
    if (!modalAnexos || uploadAnexos.length === 0) return;
    try {
      await uploadContratoAnexos(modalAnexos.id, uploadAnexos);
      const data = await getContratoAnexos(modalAnexos.id);
      setAnexos(Array.isArray(data) ? data : []);
      setUploadAnexos([]);
    } catch (error) {
      console.error(error);
      alert('Erro ao enviar anexos.');
    }
  }

  if (loading) return <p>Carregando contratos...</p>;

  if (!podeAcessar) {
    return (
      <p className="text-gray-600">
        Acesso restrito. Solicite ao administrador do sistema.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Gestão de Contratos</h1>

      <form
        onSubmit={handleCriarContrato}
        className="bg-white rounded-xl shadow p-4 space-y-4"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-sm text-gray-600">Obra</label>
            <select
              name="obra_id"
              value={form.obra_id}
              onChange={onChangeForm}
              className="w-full border rounded p-2"
            >
              <option value="">Selecione</option>
              {obras.map(obra => (
                <option key={obra.id} value={obra.id}>
                  {obra.codigo} - {obra.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm text-gray-600">Codigo</label>
            <input
              name="codigo"
              value={form.codigo}
              onChange={onChangeForm}
              className="w-full border rounded p-2"
              placeholder="Ex: CTR-001"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Fornecedor</label>
            <input
              name="fornecedor"
              value={form.fornecedor}
              onChange={onChangeForm}
              className="w-full border rounded p-2"
            />
          </div>

          <div>
            <label className="text-sm text-gray-600">Valor</label>
            <input
              name="valor_total"
              value={valorDisplay}
              onChange={e => setValorDisplay(e.target.value)}
              onBlur={() => {
                const numero = parseMoeda(valorDisplay);
                setValorDisplay(numero ? formatMoeda(numero) : '');
              }}
              className="w-full border rounded p-2"
            />
          </div>

        </div>

        <div>
          <label className="text-sm text-gray-600">Descricao</label>
          <textarea
            name="descricao"
            value={form.descricao}
            onChange={onChangeForm}
            className="w-full border rounded p-2"
            rows="3"
          />
        </div>

        <div>
          <label className="text-sm text-gray-600">Anexos do contrato</label>
          <input
            type="file"
            multiple
            onChange={e => setFiles(Array.from(e.target.files || []))}
            className="block mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={salvando}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          {salvando ? 'Salvando...' : 'Criar contrato'}
        </button>
      </form>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left p-3">Contrato</th>
              <th className="text-left p-3">Obra</th>
              <th className="text-left p-3">Fornecedor</th>
              <th className="text-left p-3">Descricao</th>
              <th className="text-right p-3">Solicitado</th>
              <th className="text-right p-3">Pago</th>
              <th className="text-right p-3">A pagar</th>
              <th className="text-right p-3">Ajuste Solicitado</th>
              <th className="text-right p-3">Ajuste Pago</th>
              <th className="text-right p-3">Qtd. SolicitaÃ§Ãµes</th>
              <th className="text-left p-3">Anexos</th>
              <th className="text-left p-3">Acoes</th>
            </tr>
          </thead>
          <tbody>
            {contratos.length === 0 && (
              <tr>
                <td colSpan="13" className="p-4 text-center text-gray-500">
                  Nenhum contrato encontrado.
                </td>
              </tr>
            )}
            {contratos.map(c => (
              <tr key={c.id} className="border-t">
                <td className="p-3 font-medium">{c.codigo}</td>
                <td className="p-3">{c.obra?.nome || '-'}</td>
                <td className="p-3">{c.fornecedor || '-'}</td>
                <td className="p-3">{c.descricao || '-'}</td>
                <td className="p-3 text-right">
                  {Number(c.total_solicitado || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </td>
                <td className="p-3 text-right">
                  {Number(c.total_pago || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </td>
                <td className="p-3 text-right">
                  {Number(c.total_a_pagar || 0).toLocaleString('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                  })}
                </td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="w-28 border rounded p-1 text-right"
                    value={ajustes[c.id]?.ajuste_solicitado ?? c.ajuste_solicitado ?? 0}
                    onChange={e => onChangeAjuste(c.id, 'ajuste_solicitado', e.target.value)}
                  />
                </td>
                <td className="p-3 text-right">
                  <input
                    type="number"
                    step="0.01"
                    className="w-28 border rounded p-1 text-right"
                    value={ajustes[c.id]?.ajuste_pago ?? c.ajuste_pago ?? 0}
                    onChange={e => onChangeAjuste(c.id, 'ajuste_pago', e.target.value)}
                  />
                </td>
                <td className="p-3 text-right">{c.total_solicitacoes || 0}</td>
                <td className="p-3">
                  <button
                    className="text-blue-600"
                    onClick={() => abrirAnexos(c)}
                  >
                    Ver anexos
                  </button>
                </td>
                <td className="p-3">
                  <button
                    className="text-green-600"
                    onClick={() => salvarAjustes(c)}
                  >
                    Salvar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalAnexos && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow p-6 w-full max-w-lg space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-semibold">
                Anexos do contrato {modalAnexos.codigo}
              </h2>
              <button onClick={() => setModalAnexos(null)}>Fechar</button>
            </div>

            <div className="space-y-2 max-h-64 overflow-auto">
              {anexos.length === 0 && (
                <p className="text-sm text-gray-500">
                  Nenhum anexo encontrado.
                </p>
              )}
              {anexos.map(anexo => (
                <a
                  key={anexo.id}
                  href={fileUrl(anexo.caminho_arquivo)}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-blue-600 text-sm"
                >
                  {anexo.nome_original}
                </a>
              ))}
            </div>

            <div>
              <label className="text-sm text-gray-600">Enviar novos anexos</label>
              <input
                type="file"
                multiple
                onChange={e => setUploadAnexos(Array.from(e.target.files || []))}
                className="block mt-1"
              />
            </div>

            <button
              onClick={enviarAnexos}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              Enviar anexos
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
