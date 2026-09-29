import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlineShieldCheck, HiOutlineXMark } from 'react-icons/hi2';
import { Avisos, CelulaDupla, TabelaPadrao, useConfirmacao } from '../../../components/padrao';
import {
  concederBypassCustosRecebiveis,
  listarBypassesCustosRecebiveis,
  mensagemLegivel,
  revogarBypassCustosRecebiveis
} from '../services/custosRecebiveis';
import { formatarDataHora, rotuloObra } from './CrFormatos';

function toLocalDateTimeInput(date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - (offset * 60000)).toISOString().slice(0, 16);
}

// Liberação temporária: no máximo 48 horas (decisão de 29/09/2026).
function maxBypassDate() {
  return toLocalDateTimeInput(new Date(Date.now() + (48 * 3600000)));
}

function minBypassDate() {
  return toLocalDateTimeInput(new Date(Date.now() + 60 * 60 * 1000));
}

const FORM_VAZIO = { eligible_key: '', motivo: '', expira_em: '' };

/*
  Liberações temporárias (bypass) da obra travada: conceder e revogar, com
  prazo e auditoria. Era a coluna lateral de Obrigações; agora é uma faixa
  própria de "Obrigações e prazos" e continua servindo a visão pessoal.
*/
export default function CrLiberacoesTemporarias() {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aviso, setAviso] = useState(null);
  const [form, setForm] = useState(FORM_VAZIO);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await listarBypassesCustosRecebiveis());
    } catch (error) {
      setData(null);
      setAviso({ id: 'bypass', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível carregar as liberações.') });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ativas = useMemo(() => (data?.items || []).filter((item) => item.ativo), [data]);

  async function handleGrant(event) {
    event.preventDefault();
    if (saving) return;
    const [userId, obraId] = form.eligible_key.split(':').map(Number);
    if (!userId || !obraId) {
      setAviso({ id: 'bypass', tipo: 'error', mensagem: 'Selecione o usuário e a obra.' });
      return;
    }
    try {
      setSaving(true);
      setAviso(null);
      await concederBypassCustosRecebiveis({
        user_id: userId,
        obra_id: obraId,
        motivo: form.motivo,
        expira_em: new Date(form.expira_em).toISOString()
      });
      setAviso({ id: 'bypass', tipo: 'success', mensagem: 'Liberação concedida. A pendência continua visível.' });
      setForm(FORM_VAZIO);
      setShowForm(false);
      await load();
    } catch (error) {
      setAviso({ id: 'bypass', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível conceder a liberação.') });
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(item) {
    if (saving) return;
    const alvo = item;
    const { ok } = await confirmar({
      titulo: 'Revogar liberação',
      mensagem: `Revogar a liberação de ${alvo.usuario?.nome || 'usuário'} em ${rotuloObra(alvo.obra, alvo.obra_id)}? A obra volta a ficar travada se a pendência continuar.`,
      rotuloConfirmar: 'Revogar',
      destrutiva: true
    });
    if (!ok) return;
    try {
      setSaving(true);
      setAviso(null);
      await revogarBypassCustosRecebiveis(alvo.id);
      setAviso({ id: 'bypass', tipo: 'success', mensagem: 'Liberação revogada.' });
      await load();
    } catch (error) {
      setAviso({ id: 'bypass', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível revogar a liberação.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="cr-liberacoes">
      <div className="cr-liberacoes__barra">
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setShowForm((current) => !current)}
        >
          {showForm ? <HiOutlineXMark className="h-4 w-4" /> : <HiOutlineShieldCheck className="h-4 w-4" />}
          {showForm ? 'Fechar' : 'Conceder liberação'}
        </button>
      </div>
      <Avisos avisos={aviso ? [aviso] : []} aoFechar={() => setAviso(null)} />

      {showForm ? (
        <form className="cr-bypass-form" onSubmit={handleGrant}>
          <label className="cr-field">
            <span>Usuário e obra</span>
            <select
              required
              value={form.eligible_key}
              onChange={(event) => setForm((current) => ({ ...current, eligible_key: event.target.value }))}
            >
              <option value="">Selecione</option>
              {(data?.usuarios_elegiveis || []).map((item) => (
                <option key={`${item.user_id}:${item.obra_id}`} value={`${item.user_id}:${item.obra_id}`}>
                  {item.usuario?.nome} · {rotuloObra(item.obra, item.obra_id)}
                </option>
              ))}
            </select>
          </label>
          <label className="cr-field">
            <span>Expira em (até 48 horas)</span>
            <input
              type="datetime-local"
              required
              min={minBypassDate()}
              max={maxBypassDate()}
              value={form.expira_em}
              onChange={(event) => setForm((current) => ({ ...current, expira_em: event.target.value }))}
            />
          </label>
          <label className="cr-field">
            <span>Justificativa</span>
            <textarea
              required
              minLength={10}
              value={form.motivo}
              onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
            />
          </label>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>
            {saving ? 'Salvando...' : 'Conceder'}
          </button>
        </form>
      ) : null}

      <TabelaPadrao
        colunas={[
          {
            id: 'usuario',
            titulo: 'Usuário',
            tipo: 'identidade',
            noCard: 'titulo',
            render: (item) => (
              <CelulaDupla
                principal={item.usuario?.nome || `Usuário ${item.user_id}`}
                sub={item.obra ? rotuloObra(item.obra) : 'Todas as obras'}
              />
            )
          },
          { id: 'motivo', titulo: 'Justificativa', tipo: 'texto', render: (item) => item.motivo || '—' },
          {
            id: 'concedido',
            titulo: 'Concedida por',
            tipo: 'texto',
            render: (item) => item.concedido_por_usuario?.nome || item.concedido_por || '—'
          },
          {
            id: 'expira',
            titulo: 'Expira',
            tipo: 'texto',
            render: (item) => (
              <CelulaDupla
                principal={formatarDataHora(item.expira_em)}
                sub={item.recorrente ? 'Liberações em meses seguidos' : ''}
              />
            )
          }
        ]}
        itens={ativas}
        getId={(item) => item.id}
        storageKey="tabela:custos-recebiveis-liberacoes"
        rotuloRolagem="Liberações temporárias ativas"
        carregando={loading}
        vazio="Nenhuma liberação ativa."
        acoesLinha={(item) => (
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving}
            onClick={() => handleRevoke(item)}
          >
            Revogar
          </button>
        )}
        larguraAcoes={120}
      />
      {elementoConfirmacao}
    </div>
  );
}
