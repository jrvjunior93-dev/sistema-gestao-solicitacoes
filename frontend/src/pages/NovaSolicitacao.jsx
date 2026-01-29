import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getObras } from '../services/obras';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import { getSetores } from '../services/setores';
import { createSolicitacao } from '../services/solicitacoes';
import { uploadArquivos } from '../services/uploads';

export default function NovaSolicitacao() {
  const navigate = useNavigate();

  const [obras, setObras] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [setores, setSetores] = useState([]);
  const [arquivos, setArquivos] = useState([]);

  const [form, setForm] = useState({
    obra_id: '',
    tipo_solicitacao_id: '',
    area_responsavel: '',
    descricao: '',
    valor: ''
  });

  useEffect(() => {
    async function load() {
      setObras(await getObras());
      setTipos(await getTiposSolicitacao());
      setSetores(await getSetores());
    }
    load();
  }, []);

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const solicitacao = await createSolicitacao(form);

    if (arquivos.length > 0) {
      await uploadArquivos({
        files: arquivos,
        solicitacao_id: solicitacao.id,
        tipo: 'SOLICITACAO'
      });
    }

    navigate(`/solicitacoes/${solicitacao.id}`);
  }

  return (
    <div className="max-w-3xl mx-auto">

      <h1 className="text-2xl font-semibold mb-6">
        Nova Solicitação
      </h1>

      <form
        onSubmit={handleSubmit}
        className="bg-white p-6 rounded-xl shadow space-y-4"
      >

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          <div>
            <label>Obra</label>
            <select
              name="obra_id"
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Selecione</option>
              {obras.map(o => (
                <option key={o.id} value={o.id}>{o.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Tipo</label>
            <select
              name="tipo_solicitacao_id"
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Selecione</option>
              {tipos.map(t => (
                <option key={t.id} value={t.id}>{t.nome}</option>
              ))}
            </select>
          </div>

          <div>
            <label>Área Responsável</label>
            <select
              name="area_responsavel"
              onChange={handleChange}
              className="input"
              required
            >
              <option value="">Selecione</option>
              {setores.map(s => (
                <option key={s.id} value={s.codigo}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

        </div>

        <div>
          <label>Valor</label>
          <input
            name="valor"
            type="number"
            onChange={handleChange}
            className="input"
          />
        </div>

        <div>
          <label>Descrição</label>
          <textarea
            name="descricao"
            onChange={handleChange}
            className="input min-h-[120px]"
            required
          />
        </div>

        <div>
          <label>Anexos</label>
          <input
            type="file"
            multiple
            onChange={e => setArquivos([...e.target.files])}
          />
        </div>

        <div className="flex justify-end">
          <button
            className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700"
          >
            Criar Solicitação
          </button>
        </div>

      </form>
    </div>
  );
}
