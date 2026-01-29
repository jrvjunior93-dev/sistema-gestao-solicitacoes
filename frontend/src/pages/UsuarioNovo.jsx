import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = 'http://localhost:3001';

export default function UsuarioNovo() {

  const navigate = useNavigate();

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

  useEffect(() => {
    carregarDados();
  }, []);

  async function carregarDados() {
    const [cargos, setores, obras] = await Promise.all([
      fetch(`${API_URL}/cargos`).then(r => r.json()),
      fetch(`${API_URL}/setores`).then(r => r.json()),
      fetch(`${API_URL}/obras`).then(r => r.json())
    ]);

    setListaCargos(cargos);
    setListaSetores(setores);
    setListaObras(obras);
  }

  function toggleObra(id) {
    if (obras.includes(id)) {
      setObras(obras.filter(o => o !== id));
    } else {
      setObras([...obras, id]);
    }
  }

  async function salvar(e) {
    e.preventDefault();

    await fetch(`${API_URL}/usuarios`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        nome,
        email,
        senha,
        perfil,
        cargo_id: cargoId,
        setor_id: setorId,
        obras
      })
    });

    navigate('/usuarios');
  }

  return (
    <div className="max-w-3xl mx-auto">

      <h1 className="text-2xl font-semibold mb-6">
        Novo Usuário
      </h1>

      <form
        onSubmit={salvar}
        className="bg-white p-6 rounded-xl shadow space-y-4"
      >

        <div className="grid md:grid-cols-2 gap-4">

          <input
            className="input"
            placeholder="Nome"
            value={nome}
            onChange={e => setNome(e.target.value)}
            required
          />

          <input
            className="input"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            className="input"
            placeholder="Senha"
            value={senha}
            onChange={e => setSenha(e.target.value)}
            required
          />

          <select
            className="input"
            value={perfil}
            onChange={e => setPerfil(e.target.value)}
            required
          >
            <option value="">Perfil</option>
            <option value="ADMIN">ADMIN</option>
            <option value="USUARIO">USUARIO</option>
          </select>

          <select
            className="input"
            value={cargoId}
            onChange={e => setCargoId(e.target.value)}
          >
            <option value="">Cargo</option>
            {listaCargos.map(c => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>

          <select
            className="input"
            value={setorId}
            onChange={e => setSetorId(e.target.value)}
          >
            <option value="">Setor</option>
            {listaSetores.map(s => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>

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
                {o.nome}
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
