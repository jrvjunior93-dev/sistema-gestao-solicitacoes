import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUsuarios, ativarUsuario, desativarUsuario } from '../services/usuarios';

export default function Usuarios() {
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);

  useEffect(() => {
    carregar();
  }, []);

  async function carregar() {
    const data = await getUsuarios();
    setUsuarios(Array.isArray(data) ? data : []);
  }

  async function toggleAtivo(usuario) {
    if (usuario.ativo) {
      await desativarUsuario(usuario.id);
    } else {
      await ativarUsuario(usuario.id);
    }
    carregar();
  }

  return (
    <div className="page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Usuarios</h1>
          <p className="page-subtitle">Cadastro e gestao de usuarios.</p>
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/usuarios/novo')}>
          Novo usuario
        </button>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Email</th>
              <th>Cargo</th>
              <th>Setor</th>
              <th>Obras</th>
              <th>Ativo</th>
              <th>Acoes</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map(u => (
              <tr key={u.id}>
                <td>{u.nome}</td>
                <td>{u.email}</td>
                <td>{u.cargoInfo?.nome || '-'}</td>
                <td>{u.setor?.nome || '-'}</td>
                <td>
                  {(u.vinculos || [])
                    .map(v => v.obra ? (v.obra.codigo ? `${v.obra.codigo} - ${v.obra.nome}` : v.obra.nome) : null)
                    .filter(Boolean)
                    .join(', ')}
                </td>
                <td>{u.ativo ? 'Sim' : 'Nao'}</td>
                <td>
                  <button className="btn btn-outline" onClick={() => navigate(`/usuarios/${u.id}`)}>
                    Editar
                  </button>{' '}
                  <button className="btn btn-secondary" onClick={() => toggleAtivo(u)}>
                    {u.ativo ? 'Desativar' : 'Ativar'}
                  </button>
                </td>
              </tr>
            ))}
            {usuarios.length === 0 && (
              <tr>
                <td colSpan="7" align="center">Nenhum usuario cadastrado</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
