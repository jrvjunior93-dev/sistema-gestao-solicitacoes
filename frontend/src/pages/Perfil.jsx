import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { alterarSenhaAtual } from '../services/usuarios';

export default function Perfil() {
  const { user } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  async function salvar() {
    setMensagem('');
    setErro('');

    if (!senhaAtual || !senhaNova) {
      setErro('Preencha a senha atual e a nova senha.');
      return;
    }

    if (senhaNova !== confirmacao) {
      setErro('A confirmacao da nova senha nao confere.');
      return;
    }

    try {
      setLoading(true);
      await alterarSenhaAtual({
        senha_atual: senhaAtual,
        senha_nova: senhaNova
      });

      setSenhaAtual('');
      setSenhaNova('');
      setConfirmacao('');
      setMensagem('Senha atualizada com sucesso.');
    } catch (e) {
      setErro(e?.message || 'Erro ao alterar senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Meu perfil</h1>
        <p className="text-sm text-gray-500">
          Confira seus dados e atualize sua senha quando necessario.
        </p>
      </div>

      <div className="bg-white p-6 rounded-xl shadow space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Nome
            </label>
            <input
              type="text"
              className="input"
              value={user?.nome || ''}
              readOnly
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Perfil
            </label>
            <input
              type="text"
              className="input"
              value={user?.perfil || ''}
              readOnly
            />
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            Email cadastrado
          </label>
          <input
            type="email"
            className="input"
            value={user?.email || ''}
            readOnly
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">
            Setor
          </label>
          <input
            type="text"
            className="input"
            value={user?.setor?.nome || user?.setor?.codigo || user?.setor_id || ''}
            readOnly
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Senha atual
            </label>
            <input
              type="password"
              className="input"
              value={senhaAtual}
              onChange={e => setSenhaAtual(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Nova senha
            </label>
            <input
              type="password"
              className="input"
              value={senhaNova}
              onChange={e => setSenhaNova(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Confirmar nova senha
            </label>
            <input
              type="password"
              className="input"
              value={confirmacao}
              onChange={e => setConfirmacao(e.target.value)}
            />
          </div>
        </div>

        {erro && (
          <p className="text-sm text-red-600">
            {erro}
          </p>
        )}

        {mensagem && (
          <p className="text-sm text-green-600">
            {mensagem}
          </p>
        )}

        <button
          onClick={salvar}
          disabled={loading}
          className="btn btn-primary disabled:opacity-50"
        >
          {loading ? 'Salvando...' : 'Alterar senha'}
        </button>
      </div>
    </div>
  );
}
