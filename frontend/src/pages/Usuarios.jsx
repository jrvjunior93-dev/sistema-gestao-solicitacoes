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
    setUsuarios(data);
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
    <div>
      <h1>Usuários</h1>

      <button onClick={() => navigate('/usuarios/novo')}>
        Novo Usuário
      </button>

      <table border="1" cellPadding="8" cellSpacing="0" width="100%">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Email</th>
            <th>Cargo</th>
            <th>Setor</th>
            <th>Obras</th>
            <th>Ativo</th>
            <th>Ações</th>
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
                {u.vinculos.map(v => v.obra.nome).join(', ')}
              </td>
              <td>{u.ativo ? 'Sim' : 'Não'}</td>
              <td>
                <button onClick={() => navigate(`/usuarios/${u.id}/editar`)}>
                  Editar
                </button>{' '}
                <button onClick={() => toggleAtivo(u)}>
                  {u.ativo ? 'Desativar' : 'Ativar'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
