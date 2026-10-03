import { useEffect, useState } from 'react';
import { API_URL, authHeaders } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import OverlayModal from '../../components/ui/OverlayModal';
import { Avisos, useAvisos, FormSecao, CampoForm } from '../../components/padrao';
import DateInputBR from '../../components/DateInputBR';

/**
 * R9 — atribuir responsável INTERROMPE o trabalho principal (a lista de
 * solicitações continua sendo o que a pessoa veio fazer): modal.
 *
 * R27 — a casca é o `OverlayModal`: corpo rolante e rodapé fixo são do
 * componente, então "Salvar" não some quando a regra de setor/obra e o campo
 * de prazo aparecem juntos num painel curto.
 *
 * R19 — `alert()` virou faixa `Avisos` dentro do painel.
 *
 * Os selects aqui são ENTRADA DE DADO (escolher quem assume, informar prazo),
 * não filtro: a R12 mantém esse uso legítimo.
 */
export default function ModalAtribuirResponsavel({
  solicitacaoId,
  obraId,
  isSetorObraSolicitacao,
  isUsuarioSetorObra,
  exigirPrazoCompra = false,
  onClose,
  onSucesso
}) {
  const [usuarios, setUsuarios] = useState([]);
  const [usuarioSelecionado, setUsuarioSelecionado] = useState('');
  const [prazoCompra, setPrazoCompra] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { user } = useAuth();
  const isUsuario = user?.perfil === 'USUARIO';
  const setorUsuario = user?.setor_id ? String(user.setor_id) : '';

  useEffect(() => {
    carregarUsuarios();
  }, []);

  async function carregarUsuarios() {
    const res = await fetch(`${API_URL}/usuarios/opcoes-atribuicao`, {
      headers: authHeaders()
    });

    if (!res.ok) {
      setUsuarios([]);
      return;
    }

    const data = await res.json();
    const lista = Array.isArray(data) ? data : [];
    let filtrados = lista;

    if (setorUsuario) {
      filtrados = filtrados.filter(u => String(u.setor_id) === setorUsuario);
    }

    if ((isSetorObraSolicitacao || isUsuarioSetorObra) && obraId) {
      filtrados = filtrados.filter(u =>
        Array.isArray(u.vinculos) &&
        u.vinculos.some(v => String(v.obra_id) === String(obraId))
      );
    }

    setUsuarios(filtrados);
  }

  async function salvar() {
    if (!usuarioSelecionado) {
      avisar.erro('Selecione um usuário');
      return;
    }
    if (exigirPrazoCompra && !prazoCompra) {
      avisar.erro('Informe o prazo para realizar o pedido.');
      return;
    }

    setSalvando(true);
    try {
      const res = await fetch(
        `${API_URL}/solicitacoes/${solicitacaoId}/atribuir`,
        {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({
            usuario_responsavel_id: usuarioSelecionado,
            ...(exigirPrazoCompra ? { prazo_compra: prazoCompra } : {})
          })
        }
      );

      if (!res.ok) {
        let mensagem = 'Erro ao atribuir responsavel';
        try {
          const data = await res.json();
          mensagem = data?.error || mensagem;
        } catch (_) {}
        avisar.erro(mensagem);
        return;
      }

      /*
        R28 — a confirmação de gravação fica na tela. O `alert` de sucesso
        anterior era engolido pelo `onClose()` da linha seguinte. O
        `onSucesso()` (recarga) continua disparando no mesmo instante.
      */
      setSalvo(true);
      avisar.sucesso('Responsável atribuído com sucesso.', undefined, { persistente: true });
      onSucesso();
    } catch (erro) {
      console.error(erro);
      avisar.erro('Erro ao atribuir responsável');
    } finally {
      setSalvando(false);
    }
  }

  const regraSetor = isUsuario || isSetorObraSolicitacao || isUsuarioSetorObra;

  return (
    <OverlayModal
      rotulo="Atribuir responsável"
      largura="var(--modal-max-w-sm, 480px)"
      onFechar={onClose}
    >
      <div data-modal="cabecalho" className="border-b border-[var(--c-border)] p-4">
        <h2 className="text-lg font-semibold text-[var(--c-text)]">
          Atribuir responsável
        </h2>
        {regraSetor && (
          /*
            CONDIÇÃO DERIVADA DO CONTEÚDO, não evento: fica como texto fixo
            ao lado do campo que ela restringe (nunca em `useAvisos`, que é
            fechável e some — a regra continuaria valendo depois do clique).
          */
          <p className="text-sm text-[var(--c-muted)]">
            As atribuicoes devem ser para pessoas do mesmo setor.
            {(isSetorObraSolicitacao || isUsuarioSetorObra) && obraId && ' Para OBRA, somente usuarios vinculados a mesma obra.'}
          </p>
        )}
      </div>

      <div className="p-4">
        <Avisos avisos={avisos} aoFechar={fecharAviso} />

        <FormSecao colunas={1}>
          <CampoForm label="Responsável" obrigatorio linha>
            <select
              className="input"
              value={usuarioSelecionado}
              onChange={e => setUsuarioSelecionado(e.target.value)}
              disabled={salvo}
            >
              <option value="">Selecione um usuário</option>

              {usuarios.map(u => (
                <option key={u.id} value={u.id}>
                  {u.nome}
                </option>
              ))}
            </select>
          </CampoForm>

          {exigirPrazoCompra && (
            <CampoForm
              label="Prazo para realizar pedido"
              obrigatorio
              linha
              hint="Este prazo alimenta a Delegacao de Compras."
            >
              <DateInputBR
                className="input"
                value={prazoCompra}
                onChange={e => setPrazoCompra(e.target.value)}
                disabled={salvo}
              />
            </CampoForm>
          )}
        </FormSecao>
      </div>

      <div data-modal="rodape" className="app-actionbar border-t border-[var(--c-border)] p-4">
        <button
          onClick={onClose}
          className="btn btn-outline"
          type="button"
        >
          {salvo ? 'Fechar' : 'Cancelar'}
        </button>

        {!salvo && (
          <button
            onClick={salvar}
            className="btn btn-primary"
            type="button"
            disabled={salvando}
          >
            {salvando ? 'Salvando…' : 'Salvar'}
          </button>
        )}
      </div>
    </OverlayModal>
  );
}
