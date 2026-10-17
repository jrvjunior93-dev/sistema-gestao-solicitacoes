import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useWorkspaceState } from '../navigation/WorkspaceContext';
import { closeTopWorkspaceModal } from '../components/ui/ModalPortal';

const MARCA = '__fluxyAutorizacoes';
export const DONO_DETALHE = 'autorizacoes-titulo';
const raiz = { obra: null, detalhe: null };
// Apenas marcadores opacos no history.state; dossies ficam na memoria da
// sessao do workspace, nunca na URL, sessionStorage ou historico do navegador.
export function temEtapaAutorizacao(location) {
  return location.pathname.replace(/\/+$/, '') === '/financeiro/autorizacoes-pagamento'
    && Boolean(location.state?.[MARCA]?.key);
}

export default function useAutorizacaoHistorico(slot, bloqueado) {
  const location = useLocation(), navigate = useNavigate();
  const [cache, setCache] = useWorkspaceState(slot + ':historico', () => ({
    sessao: crypto.randomUUID(), etapas: {}
  }));
  const marca = location.state?.[MARCA];
  const etapa = marca?.sessao === cache.sessao ? cache.etapas[marca.key] : null;
  const atual = useRef(null);
  const navegando = useRef(false);
  const indiceConfirmado = useRef(window.history.state?.idx);
  // Durante um POP interceptado a URL ja mudou, mas o Router ainda nao.
  // Renders de um anexo/operacao nao podem adotar esse indice transitorio.
  useLayoutEffect(() => {
    indiceConfirmado.current = window.history.state?.idx;
    navegando.current = false;
  }, [location.key]);
  useLayoutEffect(() => {
    atual.current = { bloqueado, detalhe: etapa?.detalhe, idx: indiceConfirmado.current };
  });
  useLayoutEffect(() => {
    // POP nao e cancelavel. Repor a entrada existente (sem criar entradas)
    // enquanto uma operacao esta em voo ou um anexo sobrepoe o detalhe.
    let repondo = false;
    const proteger = event => {
      const a = atual.current, destino = event.state?.idx;
      if (repondo) {
        event.stopImmediatePropagation();
        if (destino === a?.idx) repondo = false;
        else if (Number.isInteger(destino)) window.history.go(a.idx - destino);
        return;
      }
      if (!a || !Number.isInteger(a.idx) || !Number.isInteger(destino) || a.idx === destino) return;
      const anexoFechado = !a.bloqueado && a.detalhe
        && closeTopWorkspaceModal({ exceptOwner: DONO_DETALHE });
      if (!a.bloqueado && !anexoFechado) return;
      event.stopImmediatePropagation();
      repondo = true;
      window.history.go(a.idx - destino);
    };
    window.addEventListener('popstate', proteger, true);
    return () => window.removeEventListener('popstate', proteger, true);
  }, []);

  function abrir(obra, detalhe = null) {
    if (bloqueado || navegando.current) return;
    navegando.current = true;
    const key = crypto.randomUUID();
    // A etapa pai precisa sobreviver mesmo apos centenas de aberturas de
    // titulos na mesma obra; nunca expulsar a lista para a qual vamos voltar.
    const entradas = Object.entries(cache.etapas).filter(([id]) => id !== marca?.key).slice(-126);
    if (etapa) entradas.push([marca.key, etapa]);
    setCache({ ...cache, etapas: { ...Object.fromEntries(entradas), [key]: { obra, detalhe } } });
    navigate(location.pathname + location.search + location.hash, {
      replace: Boolean(etapa && Boolean(etapa.detalhe) === Boolean(detalhe)),
      state: { ...location.state, [MARCA]: { sessao: cache.sessao, key } }
    });
  }
  function voltar() {
    if (bloqueado || navegando.current || !etapa) return;
    navegando.current = true;
    navigate(-1);
  }
  return { ...(etapa || raiz), abrirObra: obra => abrir(obra),
    abrirDetalhe: detalhe => abrir(etapa.obra, detalhe), voltar };
}
