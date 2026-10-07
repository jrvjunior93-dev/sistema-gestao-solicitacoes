import { useCallback, useEffect, useState } from 'react';
import { listarMeusCartoesRecarga } from '../../services/recargasCartao';
import RecargaCartaoFields from './RecargaCartaoFields';

function numero(valor) {
  const texto = String(valor ?? '').trim();
  return Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto);
}

// Cada linha possui valor proprio; o total da solicitacao e somente a soma.
export default function RecargasCartoesFields({ ativo, obraId, value, onChange, onContextChange, onSolicitacaoAnteriorEnviada }) {
  const [cartoes, setCartoes] = useState([]);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [contextos, setContextos] = useState({});
  useEffect(() => {
    let cancelado = false;
    setCartoes([]); setContextos({}); setErro('');
    if (!ativo || !obraId) return;
    setCarregando(true);
    listarMeusCartoesRecarga(obraId)
      .then((dados) => { if (!cancelado) setCartoes(dados.cartoes || []); })
      .catch((error) => { if (!cancelado) setErro(error.message); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [ativo, obraId]);
  const receberContexto = useCallback((id, contexto) => {
    setContextos((atual) => ({ ...atual, [id]: contexto }));
  }, []);
  useEffect(() => {
    const pendente = value.some((linha) => !contextos[linha.cartao_recarga_id]);
    const bloqueado = value.find((linha) => contextos[linha.cartao_recarga_id]?.bloqueado);
    const valoresInvalidos = value.some((linha) => !Number.isFinite(numero(linha.valor)) || numero(linha.valor) <= 0);
    onContextChange({ bloqueado: pendente || Boolean(bloqueado) || valoresInvalidos, motivo_bloqueio: pendente ? 'Aguarde a conferência dos cartões.' : bloqueado ? contextos[bloqueado.cartao_recarga_id]?.motivo_bloqueio : valoresInvalidos ? 'Informe um valor maior que zero para cada cartão.' : null });
  }, [value, contextos, onContextChange]);
  if (!ativo) return null;
  return <section className="form-campo--linha space-y-3 text-[var(--c-text)]" aria-label="Cartões da solicitação">
    <p className="form-hint">Selecione os cartões e informe o valor de cada recarga. A prestação de contas será separada por cartão.</p>
    {carregando && <p role="status">Carregando cartões...</p>}
    {erro && <p className="form-error" role="alert">{erro}</p>}
    {!carregando && !erro && !cartoes.length && <p className="form-hint">Nenhum cartão ativo vinculado a esta obra/centro. Configure os vínculos em Cartões de recarga.</p>}
    <div className="divide-y divide-[var(--c-border)]">
      {cartoes.map((cartao) => {
        const linha = value.find((item) => Number(item.cartao_recarga_id) === Number(cartao.id));
        return <div key={cartao.id} className="flex flex-wrap items-center gap-3 py-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <input type="checkbox" checked={Boolean(linha)} onChange={(event) => onChange(event.target.checked ? [...value, { cartao_recarga_id: cartao.id, valor: '' }] : value.filter((item) => Number(item.cartao_recarga_id) !== Number(cartao.id)))} />
            <span>{cartao.nome} · final {cartao.ultimos_quatro}</span>
          </label>
          {linha && <label className="flex items-center gap-2 text-sm">Valor (R$)
            <input className="input input-sm input-moeda" inputMode="decimal" aria-label={`Valor da recarga ${cartao.nome}`} value={linha.valor} onChange={(event) => onChange(value.map((item) => Number(item.cartao_recarga_id) === Number(cartao.id) ? { ...item, valor: event.target.value } : item))} required />
          </label>}
        </div>;
      })}
    </div>
    {value.map((linha) => <ContextoCartao key={`${obraId}:${linha.cartao_recarga_id}`} obraId={obraId} id={linha.cartao_recarga_id} receber={receberContexto} onSolicitacaoAnteriorEnviada={onSolicitacaoAnteriorEnviada} />)}
  </section>;
}

function ContextoCartao({ obraId, id, receber, onSolicitacaoAnteriorEnviada }) {
  const atualizar = useCallback((contexto) => receber(id, contexto), [id, receber]);
  return <RecargaCartaoFields ativo obraId={obraId} fixarCartao value={id} onContextChange={atualizar} onSolicitacaoAnteriorEnviada={onSolicitacaoAnteriorEnviada} />;
}
