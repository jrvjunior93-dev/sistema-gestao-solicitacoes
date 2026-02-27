import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  criarConversa,
  getCaixaEntrada,
  getDestinatariosConversa
} from '../services/conversasInternas';

function formatarDataHora(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleString('pt-BR');
}

export default function ConversasEntrada() {
  const navigate = useNavigate();
  const [itens, setItens] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);
  const [destinatarios, setDestinatarios] = useState([]);
  const [assunto, setAssunto] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [destinatarioId, setDestinatarioId] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    try {
      setLoading(true);
      const data = await getCaixaEntrada();
      setItens(Array.isArray(data) ? data : []);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar caixa de entrada');
    } finally {
      setLoading(false);
    }
  }

  async function abrirNovaConversa() {
    try {
      const data = await getDestinatariosConversa();
      setDestinatarios(Array.isArray(data) ? data : []);
      setShowNova(true);
    } catch (error) {
      alert(error?.message || 'Erro ao carregar destinatarios');
    }
  }

  async function salvarNovaConversa(e) {
    e.preventDefault();
    if (!destinatarioId || !assunto.trim() || !mensagem.trim()) {
      alert('Preencha destinatario, assunto e mensagem.');
      return;
    }

    try {
      setSalvando(true);
      const result = await criarConversa({
        destinatario_id: Number(destinatarioId),
        assunto: assunto.trim(),
        mensagem: mensagem.trim()
      });
      setShowNova(false);
      setAssunto('');
      setMensagem('');
      setDestinatarioId('');
      await carregar();
      if (result?.id) {
        navigate(`/conversas/${result.id}`);
      }
    } catch (error) {
      alert(error?.message || 'Erro ao criar conversa');
    } finally {
      setSalvando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const totalAbertas = useMemo(
    () => itens.filter(item => item.status === 'ABERTA').length,
    [itens]
  );

  return (
    <div className="page">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="page-title">Caixa de Entrada</h1>
          <p className="page-subtitle">Conversas recebidas entre usuários (independente de obra).</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-[var(--c-muted)]">Abertas: {totalAbertas}</span>
          <button type="button" className="btn btn-outline" onClick={carregar}>Atualizar</button>
          <button type="button" className="btn btn-primary" onClick={abrirNovaConversa}>Nova conversa</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Assunto</th>
              <th>Remetente</th>
              <th>Status</th>
              <th>Última mensagem</th>
              <th>Atualizado em</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan="6" align="center">Carregando...</td>
              </tr>
            )}
            {!loading && itens.length === 0 && (
              <tr>
                <td colSpan="6" align="center">Nenhuma conversa recebida.</td>
              </tr>
            )}
            {!loading && itens.map(item => (
              <tr key={item.id}>
                <td>{item.assunto}</td>
                <td>{item.criador?.nome || '-'}</td>
                <td>{item.status}</td>
                <td>{item.ultima_mensagem?.mensagem || '-'}</td>
                <td>{formatarDataHora(item.updatedAt)}</td>
                <td>
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => navigate(`/conversas/${item.id}`)}
                  >
                    Abrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showNova && (
        <div className="fixed inset-0 bg-black/30 z-40 flex items-center justify-center p-4" onClick={() => !salvando && setShowNova(false)}>
          <div className="card w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-3">Nova conversa</h2>
            <form className="grid gap-3" onSubmit={salvarNovaConversa}>
              <label className="text-sm">
                <span className="block mb-1">Destinatário</span>
                <select
                  value={destinatarioId}
                  onChange={(e) => setDestinatarioId(e.target.value)}
                  className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                >
                  <option value="">Selecione...</option>
                  {destinatarios.map(dest => (
                    <option key={dest.id} value={dest.id}>
                      {dest.nome} ({dest.setor?.nome || 'Sem setor'})
                    </option>
                  ))}
                </select>
              </label>

              <label className="text-sm">
                <span className="block mb-1">Assunto</span>
                <input
                  className="w-full rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-[var(--c-text)]"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  maxLength={180}
                />
              </label>

              <label className="text-sm">
                <span className="block mb-1">Mensagem</span>
                <textarea
                  className="input min-h-[120px]"
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                />
              </label>

              <div className="flex justify-end gap-2 mt-1">
                <button type="button" className="btn btn-outline" onClick={() => setShowNova(false)} disabled={salvando}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>{salvando ? 'Enviando...' : 'Enviar'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
