import { useEffect, useState } from 'react';
import {
  getCargos,
  criarCargo,
  ativarCargo,
  desativarCargo
} from '../services/cargos';

export default function Cargos() {
  const [cargos, setCargos] = useState([]);
  const [nome, setNome] = useState('');
  const [codigo, setCodigo] = useState('');

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const data = await getCargos();
    setCargos(Array.isArray(data) ? data : []);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    await criarCargo({
      nome,
      codigo
    });

    setNome('');
    setCodigo('');
    carregar();
  }

  return (
    <div>
      <h1>Cargos</h1>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Nome do cargo"
          value={nome}
          onChange={e => setNome(e.target.value)}
          required
        />

        <input
          placeholder="Código (ex: FINANCEIRO)"
          value={codigo}
          onChange={e => setCodigo(e.target.value.toUpperCase())}
          required
        />

        <button type="submit">Adicionar</button>
      </form>

      <table border="1" cellPadding="8" cellSpacing="0">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Código</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>

        <tbody>
          {cargos.map(c => (
            <tr key={c.id}>
              <td>{c.nome}</td>
              <td>{c.codigo}</td>
              <td>{c.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                {c.ativo ? (
                  <button onClick={() => desativarCargo(c.id)}>
                    Desativar
                  </button>
                ) : (
                  <button onClick={() => ativarCargo(c.id)}>
                    Ativar
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
