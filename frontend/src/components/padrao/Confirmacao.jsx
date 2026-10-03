import { useCallback, useEffect, useRef, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';

/**
 * CONFIRMAÇÃO DO SISTEMA (item **R3** da DoD, 02/09) — substitui
 * a caixa `window.confirm` do navegador.
 *
 * O `confirm` do navegador não sabe o que está sendo confirmado: dá
 * "OK/Cancelar" para apagar um lote e para arquivar um rascunho com o mesmo
 * peso. Aqui a ação destrutiva vem em vermelho suave e APARTADA, com o
 * rótulo dizendo o que vai acontecer ("Estornar fechamento", não "OK") —
 * mesma linguagem de botão do `PageHeader`.
 *
 * Devolve `Promise<{ ok, texto }>` — SEMPRE um objeto, nunca um booleano.
 *
 * ATENÇÃO, e isto já causou defeito: objeto é sempre truthy. Escrever
 * `const ok = await confirmar({...}); if (!ok) return;` faz o "Cancelar"
 * SEGUIR COM A AÇÃO. Tem de desestruturar:
 *     const { ok } = await confirmar({ ... });
 *     if (!ok) return;
 * A primeira versão deste hook devolvia booleano; quando ganhou o `campo`
 * (que precisa devolver o texto junto), quatro telas já escritas ficaram
 * lendo o objeto como booleano — uma delas no estorno de fechamento, ação
 * destrutiva. O validador passou a reprovar essa forma (R21).
 *
 * ## `campo` — a confirmação que PEDE UM TEXTO (R16b, 02/09)
 *
 * Achado na leva do RH/DP: o estorno de fechamento confirmava e pedia a
 * justificativa com `window.prompt`. Como não é `alert` nem `confirm`, ela
 * escapava da R19 — mas é a MESMA caixa do navegador, pelos mesmos motivos
 * (ignora tema e tokens, não existe no DOM, o harness não mede). Sem lugar
 * aqui, a tela ficaria com metade do fluxo no sistema e metade no Chrome.
 *
 * Com `campo`, a confirmação vira um passo só e devolve o texto:
 *   const { ok, texto } = await confirmar({
 *     titulo: 'Estornar fechamento', destrutiva: true, rotuloConfirmar: 'Estornar',
 *     mensagem: '...',
 *     campo: { rotulo: 'Justificativa', obrigatorio: true, multilinha: true }
 *   });
 *   if (!ok) return;
 * O retorno é sempre um objeto; para o caso sem campo, `ok` é o que
 * interessa.
 *
 * Uso:
 *   const { confirmar, elementoConfirmacao } = useConfirmacao();
 *   async function excluir() {
 *     const { ok } = await confirmar({
 *       titulo: 'Excluir colaborador',
 *       mensagem: `Excluir ${nome}? Esta ação não pode ser desfeita.`,
 *       rotuloConfirmar: 'Excluir',
 *       destrutiva: true
 *     });
 *     if (!ok) return;
 *     ...
 *   }
 *   return (<>... {elementoConfirmacao}</>);
 */
export function useConfirmacao() {
  const [pedido, setPedido] = useState(null);
  const [texto, setTexto] = useState('');
  const resolver = useRef(null);

  const responder = useCallback((confirmou, valor = '') => {
    setPedido(null);
    setTexto('');
    if (resolver.current) {
      resolver.current({ ok: confirmou, texto: valor });
      resolver.current = null;
    }
  }, []);

  // Promessa pendente ao desmontar resolve como "não" — senão o `await`
  // do chamador fica preso para sempre se a tela sair no meio.
  useEffect(() => () => {
    if (resolver.current) {
      resolver.current({ ok: false, texto: '' });
      resolver.current = null;
    }
  }, []);

  const confirmar = useCallback((opcoes = {}) => new Promise((resolve) => {
    // Uma confirmação por vez: a anterior é respondida como "não".
    if (resolver.current) resolver.current({ ok: false, texto: '' });
    resolver.current = resolve;
    setTexto(opcoes.campo?.valorInicial || '');
    setPedido({
      titulo: opcoes.titulo || 'Confirmar',
      mensagem: opcoes.mensagem || '',
      rotuloConfirmar: opcoes.rotuloConfirmar || 'Confirmar',
      rotuloCancelar: opcoes.rotuloCancelar || 'Cancelar',
      destrutiva: Boolean(opcoes.destrutiva),
      campo: opcoes.campo || null
    });
  }), []);

  const faltaTexto = Boolean(pedido?.campo?.obrigatorio) && !texto.trim();

  const elementoConfirmacao = pedido ? (
    <OverlayModal
      rotulo={pedido.titulo}
      largura="var(--modal-max-w-sm, 480px)"
      onFechar={() => responder(false)}
    >
      <div className="app-confirmacao">
        <h2 className="app-confirmacao-titulo">{pedido.titulo}</h2>
        {pedido.mensagem ? <p className="app-confirmacao-texto">{pedido.mensagem}</p> : null}
        {pedido.campo ? (
          <label className="app-confirmacao-campo">
            <span>{pedido.campo.rotulo}</span>
            {pedido.campo.multilinha ? (
              <textarea
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                required={Boolean(pedido.campo.obrigatorio)}
                autoFocus
              />
            ) : (
              <input
                type="text"
                value={texto}
                onChange={(evento) => setTexto(evento.target.value)}
                required={Boolean(pedido.campo.obrigatorio)}
                autoFocus
              />
            )}
          </label>
        ) : null}
        <div className="app-confirmacao-acoes">
          <button type="button" className="btn btn-outline" onClick={() => responder(false)}>
            {pedido.rotuloCancelar}
          </button>
          <button
            type="button"
            className={pedido.destrutiva ? 'btn btn-outline btn-perigo-suave' : 'btn btn-primary'}
            onClick={() => responder(true, texto)}
            disabled={faltaTexto}
            title={faltaTexto ? `Informe ${String(pedido.campo?.rotulo || '').toLowerCase()} para continuar` : undefined}
            autoFocus={!pedido.campo}
          >
            {pedido.rotuloConfirmar}
          </button>
        </div>
      </div>
    </OverlayModal>
  ) : null;

  return { confirmar, elementoConfirmacao };
}

export default useConfirmacao;
