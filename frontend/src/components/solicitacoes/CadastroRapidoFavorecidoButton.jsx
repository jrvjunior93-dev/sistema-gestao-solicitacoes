import { useRef, useState } from 'react';
import { HiOutlinePlus, HiOutlineXMark } from 'react-icons/hi2';
import { criarFavorecidoNovaSolicitacao } from '../../services/parceiros';
import { maskPhone } from '../../utils/formatters';
import OverlayModal from '../ui/OverlayModal';

const estadoInicial = { nome: '', telefone: '', chave_pix: '' };

function novaChaveIdempotencia() {
  if (globalThis.crypto?.randomUUID) return `favorecido_${globalThis.crypto.randomUUID()}`;
  return `favorecido_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function mensagemErro(error) {
  const texto = String(error?.message || 'Nao foi possivel cadastrar o favorecido.');
  try {
    return JSON.parse(texto)?.error || texto;
  } catch {
    return texto;
  }
}

export default function CadastroRapidoFavorecidoButton({
  tipoSolicitacaoId,
  tipoSubId,
  areaResponsavel,
  obraId,
  onCadastrado,
  disabled = false
}) {
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState(estadoInicial);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const idempotenciaRef = useRef(null);

  function fechar() {
    if (salvando) return;
    setAberto(false);
    setErro('');
  }

  function alterar(campo, valor) {
    idempotenciaRef.current = null;
    setErro('');
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  async function salvar(event) {
    event.preventDefault();
    if (salvando) return;

    setSalvando(true);
    setErro('');
    idempotenciaRef.current ||= novaChaveIdempotencia();
    try {
      const resposta = await criarFavorecidoNovaSolicitacao({
        ...form,
        obra_id: obraId ? Number(obraId) : null,
        tipo_solicitacao_id: Number(tipoSolicitacaoId),
        tipo_sub_id: tipoSubId ? Number(tipoSubId) : null,
        area_responsavel: areaResponsavel
      }, { idempotencyKey: idempotenciaRef.current });
      const parceiro = resposta?.parceiro;
      if (!parceiro?.id) throw new Error('O cadastro foi salvo, mas nao retornou o favorecido.');
      onCadastrado?.(parceiro);
      setForm(estadoInicial);
      idempotenciaRef.current = null;
      setAberto(false);
    } catch (error) {
      setErro(mensagemErro(error));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-outline btn-sm w-fit"
        disabled={disabled || !tipoSolicitacaoId || !areaResponsavel}
        onClick={() => setAberto(true)}
      >
        <HiOutlinePlus aria-hidden="true" />
        Cadastrar favorecido
      </button>

      <OverlayModal aberto={aberto} largura="560px" rotulo="Cadastrar favorecido" onFechar={fechar}>
        <form onSubmit={salvar}>
          <div className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-[var(--c-text)]">Cadastrar favorecido</h2>
              <p className="mt-1 text-xs text-[var(--c-muted)]">
                O cadastro ficará disponível junto com os parceiros existentes.
              </p>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" aria-label="Fechar" onClick={fechar}>
              <HiOutlineXMark aria-hidden="true" />
            </button>
          </div>

          <div className="grid gap-4 px-5 py-4">
            {erro && <div className="app-alert app-alert--error">{erro}</div>}
            <label className="grid gap-1 text-sm">
              Nome *
              <input
                className="input input-sm"
                value={form.nome}
                maxLength={255}
                required
                autoFocus
                onChange={(event) => alterar('nome', event.target.value)}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Telefone *
                <input
                  className="input input-sm"
                  value={form.telefone}
                  inputMode="tel"
                  maxLength={19}
                  required
                  onChange={(event) => alterar('telefone', maskPhone(event.target.value))}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Chave PIX *
                <input
                  className="input input-sm"
                  value={form.chave_pix}
                  maxLength={255}
                  required
                  autoComplete="off"
                  onChange={(event) => alterar('chave_pix', event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-[var(--c-border)] px-5 py-4">
            <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={fechar}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary btn-sm" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar e selecionar'}
            </button>
          </div>
        </form>
      </OverlayModal>
    </>
  );
}
