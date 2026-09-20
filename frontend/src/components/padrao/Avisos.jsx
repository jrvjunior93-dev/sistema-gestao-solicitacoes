import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Alert from '../ui/Alert';

/**
 * AVISO DO SISTEMA (item **R3** da DoD, 02/09) — substitui a caixa
 * `window.alert` do navegador.
 *
 * Motivo (decisão do cliente, 02/09): a caixa cinza do navegador não é do
 * sistema. Ela ignora tema, tipografia, tokens e o idioma visual inteiro;
 * bloqueia a página; não pode ser lida pelo harness; e some sem deixar
 * rastro. O RH/DP tinha 51 chamadas dessas — o sistema inteiro, 857.
 *
 * A faixa fica DENTRO da página, no topo do conteúdo, com o tom semântico
 * do sistema. Em toda a tela fica visível apenas o RESULTADO MAIS RECENTE:
 * uma nova ação limpa também avisos publicados por outro card, evitando uma
 * pilha sem relação clara com o que a pessoa acabou de executar. Sucesso e
 * informação somem sozinhos; erro e alerta permanecem até fechamento ou
 * até a próxima ação.
 *
 * ## O que NÃO passa por aqui — a fronteira (02/09)
 *
 * `useAvisos` é para EVENTO: algo aconteceu agora (salvou, falhou, importou).
 * Aviso substituível e fechável; sucesso/informação somem por tempo.
 *
 * CONDIÇÃO DERIVADA DO CONTEÚDO não é evento e NÃO usa este componente:
 * "esta obra já tem jornada informada em 09/2026", "dias mais faltas passam
 * de 30 em Fulano". Elas descrevem o estado do que está na tela; viradas em
 * aviso dispensável, sumiriam com um clique e voltariam a cada recarga — e
 * o usuário poderia enviar o formulário com a faixa fechada, sem ver a
 * condição que a impedia. Essas continuam como faixa fixa no fluxo, ao lado
 * do que elas descrevem.
 *
 * A pergunta que separa: **fecha e o problema continua?** Se sim, é
 * condição, não aviso.
 *
 * Uso:
 *   const { avisos, avisar, fechar } = useAvisos();
 *   ...
 *   catch (e) { avisar.erro(e?.message || 'Erro ao salvar'); }
 *   ...
 *   <Avisos avisos={avisos} aoFechar={fechar} />
 */
const TEMPO_SUCESSO = 6000;
const TEMPO_INFORMACAO = 8000;
const TITULOS_PADRAO = {
  error: 'Ação não concluída',
  success: 'Ação concluída',
  warning: 'Atenção necessária',
  info: 'Informação da última ação'
};
const OUVINTES_AVISOS = new Set();

export function useAvisos() {
  const [avisos, setAvisos] = useState([]);
  const sequencia = useRef(0);
  const timers = useRef(new Map());
  const instancia = useRef(Symbol('avisos'));

  const limparTimers = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
  }, []);

  const fechar = useCallback((id) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setAvisos((atuais) => atuais.filter((aviso) => aviso.id !== id));
  }, []);

  const publicar = useCallback((tipo, mensagem, titulo, opcoes) => {
    const texto = String(mensagem ?? '').trim();
    if (!texto) return null;
    sequencia.current += 1;
    const id = sequencia.current;
    // Um evento novo encerra visualmente o anterior. Condições permanentes
    // não usam este hook; ficam junto do campo ou bloco que as explica.
    OUVINTES_AVISOS.forEach((ouvir) => ouvir(instancia.current));
    limparTimers();
    setAvisos([{
      id,
      tipo,
      mensagem: texto,
      titulo: String(titulo || '').trim() || TITULOS_PADRAO[tipo] || 'Atualização'
    }]);

    const persistentePorTipo = tipo === 'error' || tipo === 'warning';
    const persistente = opcoes?.persistente === true
      || (persistentePorTipo && opcoes?.efemero !== true);
    if (!persistente) {
      const duracaoInformada = Number(opcoes?.duracaoMs);
      const duracao = Number.isFinite(duracaoInformada) && duracaoInformada > 0
        ? duracaoInformada
        : tipo === 'info' ? TEMPO_INFORMACAO : TEMPO_SUCESSO;
      timers.current.set(id, setTimeout(() => fechar(id), duracao));
    }
    return id;
  }, [fechar, limparTimers]);

  const limpar = useCallback(() => {
    limparTimers();
    setAvisos([]);
  }, [limparTimers]);

  useEffect(() => {
    const ouvir = (origem) => {
      if (origem === instancia.current) return;
      limparTimers();
      setAvisos([]);
    };
    OUVINTES_AVISOS.add(ouvir);
    return () => {
      OUVINTES_AVISOS.delete(ouvir);
      limparTimers();
    };
  }, [limparTimers]);

  const avisar = useMemo(() => ({
    erro: (mensagem, titulo, opcoes) => publicar('error', mensagem, titulo, opcoes),
    sucesso: (mensagem, titulo, opcoes) => publicar('success', mensagem, titulo, opcoes),
    alerta: (mensagem, titulo, opcoes) => publicar('warning', mensagem, titulo, opcoes),
    informacao: (mensagem, titulo, opcoes) => publicar('info', mensagem, titulo, opcoes)
  }), [publicar]);

  return { avisos, avisar, fechar, limpar };
}

export default function Avisos({ avisos = [], aoFechar }) {
  if (!avisos.length) return null;
  return (
    <div className="app-avisos" role="status" aria-live="polite">
      {avisos.map((aviso) => (
        <Alert
          key={aviso.id}
          type={aviso.tipo}
          title={aviso.titulo}
          message={aviso.mensagem}
          onClose={aoFechar ? () => aoFechar(aviso.id) : undefined}
        />
      ))}
    </div>
  );
}
