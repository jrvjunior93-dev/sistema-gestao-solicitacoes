import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import { HiPaperClip } from 'react-icons/hi2';
import PendingAttachmentsList from '../../components/attachments/PendingAttachmentsList';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../../utils/pendingAttachments';
import { Avisos, BlocoConteudo, useAvisos } from '../../components/padrao';

/**
 * CONVERSA — comentar e anexar viram UM ato so (item 19, 23/08; card unico
 * renomeado na reforma visual: dizer algo e mandar o comprovante e a mesma
 * acao). Por tras, os MESMOS endpoints de comentario e upload de antes —
 * nenhuma regra muda.
 *
 * Tres decisoes que o botao carrega:
 *
 * 1. UM DOS DOIS BASTA. So texto, so arquivos, ou os dois. Anexar sem comentar ja era possivel, e
 *    tirar isso quebraria quem so quer juntar uma nota fiscal;
 * 2. O COMENTARIO VAI PRIMEIRO. Se o upload falhar, o comentario ja esta gravado e a pessoa
 *    reanexa; na ordem inversa, um comentario que falhasse deixaria arquivos orfaos sem contexto;
 * 3. NAO SE INVENTA VINCULO entre o comentario e o anexo. Os dois vao para a mesma solicitacao,
 *    como ja iam. Amarrar o arquivo AQUELE comentario exigiria `anexos.historico_id` — mudanca de
 *    esquema que ninguem pediu. A medicao tem esse vinculo (`medicao_id`) porque LA foi pedido.
 *
 * ## O que a rodada de 05/09 mudou (reorganizacao pura — nenhum campo, botao ou endpoint saiu)
 *
 * - **Regra de organizacao do cliente**: conversa e historico ficam POR ULTIMO. Ficavam tambem
 *   RECOLHIDOS por padrao; nao ficam mais (decisao do cliente, 07/09) — o bloco NASCE ABERTO.
 *   `recolhivel` continua: quem quiser fechar fecha, e a escolha e gravada como sempre foi
 *   (`recolhidos` da preferencia `detalhe-solicitacao`, no banco, valendo em qualquer aparelho).
 * - **R19**: os tres `alert()` (limite de tamanho, sucesso do envio, erro do envio) viraram
 *   `Avisos`/`useAvisos`, dentro da propria pagina e com tom semantico.
 * - **R25**: `bg-blue-50`, `bg-blue-100`, `bg-blue-900`, `bg-blue-950`, `bg-gray-900`,
 *   `text-red-600/800` e `text-blue-600` eram paleta crua — sem par no tema escuro e sem o piso de
 *   contraste do ThemeContext. Trocados por tokens (`--ui-surface*`, `--sem-info*`, `--c-danger`).
 * - **R18**: a lista de usuarios para mencionar rola com `overflow-y: auto` (nunca `hidden`, que
 *   criaria scrollport e mataria qualquer sticky da pagina em silencio).
 *
 * O `id` e o `data-testid` ficam no BLOCO, nao no corpo. O motivo era o bloco nascer recolhido —
 * ancora/seletor que so existe depois de a pessoa abrir seria uma porta que funciona metade do
 * tempo. Ele nasce aberto agora, mas continua PODENDO ser recolhido, entao o motivo continua de pe
 * e os dois ficam onde estao.
 */
export default function Conversa({ solicitacaoId, onSucesso, podeInteragir = true, podeAnexar = podeInteragir, motivoBloqueio = '' }) {
  const [texto, setTexto] = useState('');
  const [arquivos, setArquivos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [usuarios, setUsuarios] = useState([]);
  const [usuariosSelecionados, setUsuariosSelecionados] = useState([]);
  const [mostrarLista, setMostrarLista] = useState(false);
  const [buscaUsuario, setBuscaUsuario] = useState('');
  const inputRef = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    if (!podeInteragir) return undefined;
    let ativo = true;

    async function carregarUsuarios() {
      try {
        const res = await fetch(`${API_URL}/usuarios-lista`, {
          headers: authHeaders()
        });

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (ativo) {
          setUsuarios(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error(error);
      }
    }

    carregarUsuarios();
    return () => {
      ativo = false;
    };
  }, [podeInteragir]);

  const usuariosDisponiveis = useMemo(() => {
    const termo = String(buscaUsuario || '').trim().toLowerCase();
    return usuarios.filter(usuario => {
      if (usuariosSelecionados.some(item => item.id === usuario.id)) {
        return false;
      }

      if (!termo) return true;

      const nome = String(usuario.nome || '').toLowerCase();
      const email = String(usuario.email || '').toLowerCase();
      return nome.includes(termo) || email.includes(termo);
    });
  }, [buscaUsuario, usuarios, usuariosSelecionados]);

  function adicionarMencao(usuario) {
    if (usuariosSelecionados.some(item => item.id === usuario.id)) {
      return;
    }

    setUsuariosSelecionados(prev => [...prev, usuario]);
    setBuscaUsuario('');
  }

  function removerMencao(usuarioId) {
    setUsuariosSelecionados(prev => prev.filter(usuario => usuario.id !== usuarioId));
  }

  function adicionarArquivos(files) {
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivos, files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setArquivos(proximoEstado);
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function removerArquivo(index) {
    setArquivos(prev => prev.filter((_, i) => i !== index));
  }

  async function enviarComentario() {
    const res = await fetch(`${API_URL}/solicitacoes/${solicitacaoId}/comentarios`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        descricao: texto,
        mencoes: usuariosSelecionados.map(usuario => usuario.id)
      })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'Erro ao enviar comentario');
    }
  }

  async function enviarArquivos() {
    const formData = new FormData();
    formData.append('solicitacao_id', solicitacaoId);
    formData.append('tipo', 'ANEXO');
    extrairFilesAnexosPendentes(arquivos).forEach(file => {
      formData.append('files', file);
    });

    const res = await fetch(`${API_URL}/anexos/upload`, {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });

    if (!res.ok) {
      const data = await res.json().catch(() => null);
      throw new Error(data?.error || 'Erro no upload');
    }
  }

  async function enviar() {
    if (!podeInteragir) return;
    const temTexto = Boolean(texto.trim());
    const temArquivo = arquivos.length > 0;
    if (!temTexto && !(temArquivo && podeAnexar)) return;

    try {
      setLoading(true);

      // O comentario primeiro: se o upload falhar, ele ja esta gravado e a pessoa so reanexa.
      if (temTexto) await enviarComentario();
      if (temArquivo && podeAnexar) await enviarArquivos();

      setTexto('');
      setArquivos([]);
      if (inputRef.current) inputRef.current.value = '';
      setUsuariosSelecionados([]);
      setBuscaUsuario('');
      setMostrarLista(false);
      onSucesso?.();
      avisar.sucesso(temTexto && temArquivo
        ? 'Comentario e arquivos enviados com sucesso.'
        : temTexto
          ? 'Comentario enviado com sucesso.'
          : 'Arquivos enviados com sucesso.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao enviar comentario');
    } finally {
      setLoading(false);
    }
  }

  if (!podeInteragir) {
    return (
      <BlocoConteudo
        titulo="Conversa"
        recolhivel
        data-testid="comentarios-somente-leitura"
      >
        <div>
          <p className="text-sm leading-6 text-[var(--c-muted)]">
            {motivoBloqueio || 'As interacoes ficam disponiveis quando a solicitacao estiver no seu setor.'}
          </p>
        </div>
      </BlocoConteudo>
    );
  }

  return (
    <BlocoConteudo
      titulo="Conversa"
      descricao={podeAnexar
        ? 'Comente ou anexe arquivos à solicitação.'
        : 'Comentários são livres para quem pode visualizar. Para anexar ou executar outras ações, solicite o retorno ao seu setor.'}
      recolhivel
      id="sol-detail-conversa"
      data-testid="card-comentario"
    >
      <div>
      <Avisos avisos={avisos} aoFechar={fechar} />

      <textarea
        value={texto}
        onChange={e => setTexto(e.target.value)}
        rows={5}
        className="input w-full mb-2 sol-detail-comment-textarea"
        placeholder={'Escreva um comentário e/ou anexe arquivos...\nEnter cria uma nova linha; o histórico mantém a formatacao.'}
      />

      {/* Barra compacta: anexar, mencionar e a contagem no mesmo nivel —
          os anexos, que eram um card proprio, fazem parte do mesmo ato. */}
      <div className="flex items-center gap-2 flex-wrap mb-2">
        {podeAnexar && <label className={`btn btn-outline btn-sm inline-flex items-center gap-2 cursor-pointer ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
          <HiPaperClip className="w-4 h-4" />
          <span>Anexar arquivos</span>
          <input
            type="file"
            multiple
            ref={inputRef}
            className="hidden"
            data-testid="comentario-anexos"
            disabled={loading}
            onChange={e => {
              adicionarArquivos(e.target.files);
              e.target.value = '';
            }}
          />
        </label>}

        <button
          type="button"
          onClick={() => setMostrarLista(prev => !prev)}
          className="btn btn-secondary btn-sm"
        >
          + Mencionar usuario
        </button>

        {arquivos.length > 0 && (
          <span className="text-xs text-[var(--c-muted)]">
            {arquivos.length} arquivo(s) para enviar
          </span>
        )}
      </div>

      {mostrarLista && (
        <div className="mb-3 rounded border border-[var(--c-border)] bg-[var(--ui-surface)] p-3">
          <input
            type="text"
            value={buscaUsuario}
            onChange={e => setBuscaUsuario(e.target.value)}
            className="input w-full mb-2"
            placeholder="Buscar usuário por nome ou email"
          />

          <div className="max-h-48 overflow-y-auto space-y-1">
            {usuariosDisponiveis.length === 0 && (
              <p className="text-sm text-[var(--c-muted)] px-2 py-2">
                Nenhum usuário disponível.
              </p>
            )}

            {usuariosDisponiveis.map(usuario => (
              <button
                key={usuario.id}
                type="button"
                onClick={() => adicionarMencao(usuario)}
                className="block w-full text-left px-3 py-2 rounded hover:bg-[var(--ui-surface-2)] text-sm"
              >
                <div className="font-medium">{usuario.nome}</div>
                <div className="text-xs text-[var(--c-muted)]">{usuario.email}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {usuariosSelecionados.length > 0 && (
        <div className="mb-3 p-3 rounded border border-[var(--sem-info-border)] bg-[var(--sem-info-bg)]">
          <p className="text-sm font-semibold mb-2">Mencionados</p>
          <div className="flex flex-wrap gap-2">
            {usuariosSelecionados.map(usuario => (
              <span
                key={usuario.id}
                className="inline-flex items-center gap-2 border border-[var(--sem-info-border)] bg-[var(--ui-surface)] px-3 py-1 rounded-full text-sm"
              >
                {usuario.nome}
                <button
                  type="button"
                  onClick={() => removerMencao(usuario.id)}
                  className="font-bold text-[var(--c-danger)]"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <PendingAttachmentsList
        items={arquivos}
        onRemove={(index) => removerArquivo(index)}
        className="space-y-1 mb-3"
        itemClassName="flex items-center justify-between gap-3 text-sm bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1"
        removeButtonClassName="text-[var(--c-primary)] font-semibold px-2"
      />

      <div className="flex justify-end">
        <button
          disabled={loading || (!texto.trim() && arquivos.length === 0)}
          onClick={enviar}
          className="btn btn-primary disabled:opacity-50"
          data-testid="enviar-comentario"
          type="button"
        >
          {loading ? 'Enviando...' : 'Enviar'}
        </button>
      </div>
      </div>
    </BlocoConteudo>
  );
}
