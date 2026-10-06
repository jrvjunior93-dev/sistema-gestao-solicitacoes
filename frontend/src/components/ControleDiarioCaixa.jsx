import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { HiOutlineLockClosed } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { getEstadoControleDiarioCaixa } from '../services/controleDiarioCaixa';
import { dataOperacionalHoje } from '../utils/dataOperacional';
import { canViewFinanceiroCaixas } from '../utils/acessoProduto';

export default function ControleDiarioCaixa({ children }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const superadmin = String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
  const [verificacao, setVerificacao] = useState({ estado: null, erro: null });
  const [dia, setDia] = useState(dataOperacionalHoje);
  const atualizarRef = useRef(() => {});
  const ajusteRelogio = useRef(0);

  useEffect(() => {
    let ativo = true;
    let executando = false;
    let repetir = false;
    let ultimoDia = dataOperacionalHoje();
    setDia(ultimoDia);
    setVerificacao({ estado: null, erro: null });
    if (!user?.id || superadmin) return undefined;

    async function atualizar() {
      if (executando) { repetir = true; return; }
      executando = true;
      try {
        const estado = await getEstadoControleDiarioCaixa();
        if (ativo) {
          const agoraServidor = Date.parse(estado.servidor_agora);
          if (Number.isFinite(agoraServidor)) ajusteRelogio.current = agoraServidor - Date.now();
          ultimoDia = estado.data_referencia;
          setDia(ultimoDia);
          setVerificacao({ estado, erro: null, usuarioId: user.id });
        }
      } catch (error) {
        if (ativo) setVerificacao({ estado: null, erro: error.message, usuarioId: user.id });
      } finally {
        executando = false;
        if (ativo && repetir) { repetir = false; void atualizar(); }
      }
    }
    function recebeuResposta(event) {
      if (event.detail?.codigo === 'CONTROLE_DIARIO_CONTAS_PENDENTE') {
        setVerificacao({ estado: { ...event.detail, mensagem: event.detail.error }, erro: null, usuarioId: user.id });
      }
      void atualizar();
    }
    function verificarVirada() {
      const hoje = dataOperacionalHoje(new Date(Date.now() + ajusteRelogio.current));
      if (hoje !== ultimoDia) {
        ultimoDia = hoje;
        setDia(hoje);
        setVerificacao({ estado: null, erro: null });
        void atualizar();
      }
    }
    function voltou() { verificarVirada(); void atualizar(); }
    atualizarRef.current = atualizar;
    void atualizar();
    const timer = window.setInterval(atualizar, 30_000);
    const virada = window.setInterval(verificarVirada, 1_000);
    window.addEventListener('focus', voltou);
    document.addEventListener('visibilitychange', voltou);
    window.addEventListener('fluxy:controle-diario-caixa', recebeuResposta);
    return () => {
      ativo = false;
      atualizarRef.current = () => {};
      window.clearInterval(timer);
      window.clearInterval(virada);
      window.removeEventListener('focus', voltou);
      document.removeEventListener('visibilitychange', voltou);
      window.removeEventListener('fluxy:controle-diario-caixa', recebeuResposta);
    };
  }, [user?.id, superadmin]);

  if (!user?.id || superadmin) return children;
  if (verificacao.usuarioId !== user.id) {
    return <p className="py-4 text-sm text-[var(--c-muted)]" role="status">Verificando o controle diário de caixa...</p>;
  }
  const { estado, erro } = verificacao;
  if (erro) {
    return <div className="app-bloco mt-4" role="alert">
      <p className="text-sm text-[var(--c-text)]">{erro}</p>
      <button type="button" className="btn btn-outline mt-3" onClick={() => atualizarRef.current()}>Verificar novamente</button>
    </div>;
  }
  // Não monta a rota antes de conhecer a situação, nem usa liberação de ontem.
  if (!estado || estado.data_referencia !== dia) {
    return <p className="py-4 text-sm text-[var(--c-muted)]" role="status">Verificando o controle diário de caixa...</p>;
  }
  if (!estado.bloqueado) return children;
  return <>
    <div className="mt-4 grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-lg border border-[var(--sem-warning)] bg-[var(--ui-surface)] p-3 text-sm text-[var(--c-text)] sm:grid-cols-[auto_minmax(0,1fr)_auto]" role="alert" data-testid="bloqueio-caixa-diario">
      <HiOutlineLockClosed className="mt-0.5 h-5 w-5 shrink-0 text-[var(--sem-warning)]" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <strong className="block">Acesso bloqueado — regularize o caixa</strong>
        <p className="mt-1">{estado.mensagem}</p>
        {estado.pendencias?.length ? <p className="mt-1 text-[var(--c-muted)]">Conta(s): {estado.pendencias.map((item) => item.nome || `Conta ${item.conta_bancaria_id}`).join(', ')}.</p> : null}
      </div>
      <button type="button" className="btn btn-outline col-start-2 justify-self-start sm:col-start-auto" onClick={() => atualizarRef.current()}>Verificar novamente</button>
    </div>
    {!canViewFinanceiroCaixas(user)
      ? <p className="mt-3 text-sm text-[var(--c-text)]">Solicite ao administrador a permissão para acessar Caixa e Contas e regularizar essa pendência.</p>
      : pathname === '/financeiro/caixas' ? children : <Navigate to="/financeiro/caixas" replace />}
  </>;
}
