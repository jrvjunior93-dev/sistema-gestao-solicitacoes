import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { API_URL, authHeaders } from '../services/api';
import { getUsuario, criarUsuario, atualizarUsuario } from '../services/usuarios';

export default function UsuarioNovo() {
  const navigate = useNavigate();
  const { id } = useParams();
  const editando = Boolean(id);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [perfil, setPerfil] = useState('');
  const [cargoId, setCargoId] = useState('');
  const [setorId, setSetorId] = useState('');
  const [obras, setObras] = useState([]);

  const [listaCargos, setListaCargos] = useState([]);
  const [listaSetores, setListaSetores] = useState([]);
  const [listaObras, setListaObras] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    carregarDados();
  }, [id]);

  async function carregarDados() {
    try {
      setLoading(true);
      const [cargos, setores, obrasLista] = await Promise.all([
        fetch(`${API_URL}/cargos`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_URL}/setores`, { headers: authHeaders() }).then(r => r.json()),
        fetch(`${API_URL}/obras`, { headers: authHeaders() }).then(r => r.json())
      ]);

      setListaCargos(Array.isArray(cargos) ? cargos : []);
      setListaSetores(Array.isArray(setores) ? setores : []);
      setListaObras(Array.isArray(obrasLista) ? obrasLista : []);

      if (editando) {
        const usuario = await getUsuario(id);
        setNome(usuario.nome || '');
        setEmail(usuario.email || '');
        setPerfil(usuario.perfil || '');
        setCargoId(usuario.cargo_id ? String(usuario.cargo_id) : '');
        setSetorId(usuario.setor_id ? String(usuario.setor_id) : '');
        const vinculos = Array.isArray(usuario.vinculos) ? usuario.vinculos : [];
        setObras(vinculos.map(v => v.obra_id).filter(Boolean));
      }
    } catch (error) {
      console.error(error);
      alert('Erro ao carregar dados do usuario');
    } finally {
      setLoading(false);
    }
  }

  function toggleObra(idObra) {
    if (obras.includes(idObra)) {
      setObras(obras.filter(o => o !== idObra));
    } else {
      setObras([...obras, idObra]);
    }
  }

  async function salvar(e) {
    e.preventDefault();

    const payload = {
      nome,
      email,
      senha,
      perfil,
      cargo_id: cargoId || null,
      setor_id: setorId || null,
      obras
    };

    if (editando && !senha.trim()) {
      delete payload.senha;
    }

    if (editando) {
      await atualizarUsuario(id, payload);
    } else {
      await criarUsuario(payload);
    }

    navigate('/usuarios');
  }

  if (loading) {
    return <p>Carregando usuario...</p>;
  }

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">
        {editando ? 'Editar Usuario' : 'Novo Usuario'}
      </h1>

      <form
        onSubmit={salvar}
        className="bg-white p-6 rounded-xl shadow space-y-4"
      >
        <div className="grid md:grid-cols-2 gap-4">
          <label className="grid gap-1 text-sm">
            Nome
            <input
              className="input"
              placeholder="Nome"
              value={nome}
              onChange={e => setNome(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Email
            <input
              className="input"
              placeholder="Email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="grid gap-1 text-sm">
            Senha
            <input
              type="password"
              className="input"
              placeholder={editando ? 'Deixe em branco para manter a senha' : 'Senha'}
              value={senha}
              onChange={e => setSenha(e.target.value)}
              required={!editando}
            />
          </label>

          <label className="grid gap-1 text-sm">
            Perfil
            <select
              className="input"
              value={perfil}
              onChange={e => setPerfil(e.target.value)}
              required
            >
              <option value="">Selecione</option>
              <option value="ADMIN">ADMIN</option>
              <option value="SUPERADMIN">SUPERADMIN</option>
              <option value="USUARIO">USUARIO</option>
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            Cargo
            <select
              className="input"
              value={cargoId}
              onChange={e => setCargoId(e.target.value)}
            >
              <option value="">Selecione</option>
              {listaCargos.map(c => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-sm">
            Setor
            <select
              className="input"
              value={setorId}
              onChange={e => setSetorId(e.target.value)}
            >
              <option value="">Selecione</option>
              {listaSetores.map(s => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div>
          <p className="font-medium mb-2">Obras vinculadas</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {listaObras.map(o => (
              <label key={o.id} className="flex gap-2 items-center">
                <input
                  type="checkbox"
                  checked={obras.includes(o.id)}
                  onChange={() => toggleObra(o.id)}
                />
                {o.codigo ? `${o.codigo} - ${o.nome}` : o.nome}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => navigate(-1)}
          >
            Cancelar
          </button>

          <button
            className="btn-primary"
            type="submit"
          >
            Salvar
          </button>
        </div>
      </form>
    </div>
  );
}
