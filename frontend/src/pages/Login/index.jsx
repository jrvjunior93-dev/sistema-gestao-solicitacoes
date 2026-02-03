import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { API_URL } from '../../services/api';

export default function Login() {

  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e) {
    e.preventDefault();

    try {
      setLoading(true);

      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, senha })
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Erro ao autenticar');
        return;
      }

      // ✅ SALVA PELO CONTEXT
      login(data);

      const perfil = String(data?.user?.perfil || '').trim().toUpperCase();
      const isAdmin = perfil === 'SUPERADMIN' || perfil.startsWith('ADMIN');
      navigate(isAdmin ? '/' : '/solicitacoes');

    } catch (err) {
      console.error(err);
      alert('Erro ao conectar com servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow w-full max-w-md space-y-4"
      >

        <h1 className="text-2xl font-semibold text-center">
          Sistema de Solicitações
        </h1>

        <input
          type="email"
          placeholder="Email"
          className="w-full border p-2 rounded"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Senha"
          className="w-full border p-2 rounded"
          value={senha}
          onChange={e => setSenha(e.target.value)}
        />

        <button
          disabled={loading}
          className="w-full bg-blue-600 text-white py-2 rounded"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

      </form>

    </div>
  );
}
