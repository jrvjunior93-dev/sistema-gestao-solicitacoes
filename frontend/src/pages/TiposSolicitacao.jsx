import { useEffect, useState } from 'react';

const API_URL = 'http://localhost:3001';

export default function TiposSolicitacao() {
  const [tipos, setTipos] = useState([]);
  const [nome, setNome] = useState('');

  async function carregar() {
    const res = await fetch(`${API_URL}/tipos-solicitacao`);
    const data = await res.json();
    setTipos(data);
  }

  useEffect(() => {
    carregar();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();

    await fetch(`${API_URL}/tipos-solicitacao`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome })
    });

    setNome('');
    carregar();
  }

  async function toggle(tipo) {
    await fetch(
      `${API_URL}/tipos-solicitacao/${tipo.id}/${tipo.ativo ? 'desativar' : 'ativar'}`,
      { method: 'PATCH' }
    );
    carregar();
  }

  return (
    <div>
      <h1>Tipos de Solicitação</h1>

      <form onSubmit={handleSubmit}>
        <input
          placeholder="Nome do tipo"
          value={nome}
          onChange={e => setNome(e.target.value)}
          required
        />
        <button type="submit">Adicionar</button>
      </form>

      <table border="1" cellPadding="8" cellSpacing="0">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {tipos.map(t => (
            <tr key={t.id}>
              <td>{t.nome}</td>
              <td>{t.ativo ? 'Ativo' : 'Inativo'}</td>
              <td>
                <button onClick={() => toggle(t)}>
                  {t.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
