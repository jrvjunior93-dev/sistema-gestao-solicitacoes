import { useCallback, useEffect, useRef, useState } from 'react';
import OverlayModal from '../../components/ui/OverlayModal';
import {
  EVENTO_VALORES_OCULTOS,
  abrirOlhoPainelGestor,
  fecharOlhoPainelGestor,
  obterOlhoPainelGestor
} from '../../services/painelGestor';

/*
  O OLHO DO PAINEL DO GESTOR (29/09/2026).

  Estado por usuário, no BANCO (GET /painel-gestor/olho). Fechado: o
  servidor devolve os valores financeiros = null; a tela mostra "••••••".
  - `versao` sobe a cada troca de estado: as abas e o saldo do topo são
    remontados com ela (key), o que DESCARTA os dados em memória e recarrega
    — o DOM não guarda valor de antes de fechar.
  - Revalida ao focar a aba do navegador (outro dispositivo pode ter
    fechado/aberto) e escuta o cabeçalho X-Painel-Valores-Ocultos das GETs:
    se o servidor disser "fechado" com a tela aberta, fecha na hora. O
    sentido inverso (servidor aberto, tela fechada) só vale pela
    revalidação — em dúvida, fica fechado.
  - Rota ausente (404, backend ainda não publicado) ou falha: olho
    indisponível — o botão some e o painel segue como antes.
*/
export function useOlhoPainel() {
  const [estado, setEstado] = useState({ pronto: false, disponivel: false, fechado: false, pinConfigurado: true });
  const [versao, setVersao] = useState(0);
  const [alternando, setAlternando] = useState(false);
  const fechadoRef = useRef(false);
  const disponivelRef = useRef(false);

  const aplicar = useCallback((fechado, extra = {}) => {
    const mudou = fechadoRef.current !== fechado;
    fechadoRef.current = fechado;
    setEstado((atual) => ({ ...atual, ...extra, pronto: true, fechado }));
    if (mudou) setVersao((v) => v + 1);
  }, []);

  const consultar = useCallback(async () => {
    try {
      const resposta = await obterOlhoPainelGestor();
      disponivelRef.current = true;
      aplicar(Boolean(resposta?.fechado), {
        disponivel: true,
        pinConfigurado: resposta?.pin_configurado !== false
      });
    } catch {
      if (!disponivelRef.current) {
        setEstado((atual) => ({ ...atual, pronto: true, disponivel: false }));
      }
    }
  }, [aplicar]);

  useEffect(() => { void consultar(); }, [consultar]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const aoFocar = () => {
      if (document.visibilityState === 'hidden' || !disponivelRef.current) return;
      void consultar();
    };
    const aoCabecalho = (evento) => {
      if (disponivelRef.current && evento.detail?.fechado === true && !fechadoRef.current) aplicar(true);
    };
    window.addEventListener('focus', aoFocar);
    document.addEventListener('visibilitychange', aoFocar);
    window.addEventListener(EVENTO_VALORES_OCULTOS, aoCabecalho);
    return () => {
      window.removeEventListener('focus', aoFocar);
      document.removeEventListener('visibilitychange', aoFocar);
      window.removeEventListener(EVENTO_VALORES_OCULTOS, aoCabecalho);
    };
  }, [aplicar, consultar]);

  const fechar = useCallback(async () => {
    if (alternando) return;
    setAlternando(true);
    try {
      await fecharOlhoPainelGestor();
      aplicar(true);
    } finally {
      setAlternando(false);
    }
  }, [alternando, aplicar]);

  const abrir = useCallback(async (pin) => {
    await abrirOlhoPainelGestor(pin);
    aplicar(false);
  }, [aplicar]);

  return { ...estado, versao, alternando, fechar, abrir };
}

function mensagemDoPin(erro) {
  if (erro?.status === 403) return 'Senha incorreta.';
  if (erro?.status === 429) {
    const minutos = Math.max(1, Math.ceil(Number(erro.tempoRestanteSegundos || 0) / 60));
    return erro.tempoRestanteSegundos
      ? `Muitas tentativas, aguarde ${minutos} min.`
      : 'Muitas tentativas, aguarde alguns minutos.';
  }
  if (erro?.status === 409) return 'Senha do painel ainda não configurada — peça ao administrador.';
  return erro?.message || 'Não foi possível exibir os valores.';
}

export function ModalPinPainel({ aberto, onFechar, onConfirmar }) {
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const campoRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    setPin('');
    setErro('');
  }, [aberto]);

  const fechar = () => { if (!enviando) onFechar(); };

  async function enviar(evento) {
    evento.preventDefault();
    const digitos = pin;
    if (!/^\d{4}$/.test(digitos) || enviando) return;
    setEnviando(true);
    setErro('');
    try {
      await onConfirmar(digitos);
      onFechar();
    } catch (falha) {
      setErro(mensagemDoPin(falha));
      setPin('');
      requestAnimationFrame(() => campoRef.current?.focus());
    } finally {
      setEnviando(false);
    }
  }

  return (
    <OverlayModal
      aberto={aberto}
      rotulo="Mostrar valores do painel"
      largura="var(--modal-max-w-sm, 420px)"
      onFechar={fechar}
      fecharComEscape={!enviando}
    >
      <form className="app-confirmacao pg-pin" onSubmit={enviar}>
        <h2 className="app-confirmacao-titulo">Mostrar valores</h2>
        <p className="app-confirmacao-texto">Digite a senha de 4 dígitos do painel.</p>
        <label className="app-confirmacao-campo">
          <span>Senha do painel</span>
          <input
            ref={campoRef}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(evento) => setPin(evento.target.value.replace(/\D/g, '').slice(0, 4))}
            aria-invalid={erro ? true : undefined}
            aria-describedby={erro ? 'pg-pin-erro' : undefined}
            disabled={enviando}
            autoFocus
          />
        </label>
        {erro ? <p id="pg-pin-erro" className="pg-pin__erro" role="alert">{erro}</p> : null}
        <div className="app-confirmacao-acoes">
          <button type="button" className="btn btn-outline" onClick={fechar} disabled={enviando}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={enviando || pin.length !== 4}>
            {enviando ? 'Verificando...' : 'Mostrar valores'}
          </button>
        </div>
      </form>
    </OverlayModal>
  );
}
