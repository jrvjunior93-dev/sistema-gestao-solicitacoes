import { useId, useRef, useState } from 'react';
import { useWorkspaceState, useWorkspaceWork, useWorkspaceForget } from '../../navigation/WorkspaceContext';
import { useAuth } from '../../contexts/AuthContext';
import OverlayModal from '../ui/OverlayModal';
import DateInputBR, { dataISOParaBR } from '../DateInputBR';
import { CampoForm } from '../padrao';
import { updateValorSolicitacao, updateDataVencimentoSolicitacao } from '../../services/solicitacoes';
import { hojeSolicitacaoSP, parseValorSolicitacaoBR, permissoesEdicaoSolicitacao,
  valorSolicitacaoParaEdicao, vencimentoSolicitacaoParaEdicao } from '../../utils/solicitacaoEdicao';

// Um campo por operacao: nao envia uma segunda PATCH com dados nao editados.
export default function ModalEditarDadosSolicitacao({ solicitacao, campo, onFechar, onSalvo }) {
  const { user } = useAuth();
  const formId = useId();
  const prefix = 'editar:' + solicitacao.id + ':' + campo;
  const [alvo] = useWorkspaceState(prefix + ':base', () => ({ id: solicitacao.id, codigo: solicitacao.codigo,
    valor: solicitacao.valor, data_vencimento: vencimentoSolicitacaoParaEdicao(solicitacao),
    data_vencimento_medicao: solicitacao.data_vencimento_medicao }));
  const [entrada, setEntrada] = useWorkspaceState(prefix + ':entrada', () => campo === 'valor'
    ? valorSolicitacaoParaEdicao(alvo.valor) : String(alvo.data_vencimento || '').slice(0, 10));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const trava = useRef(false);
  const concluido = useRef(false);
  const permissao = permissoesEdicaoSolicitacao(user)[campo] === true;
  const titulo = campo === 'valor' ? 'Editar valor' : 'Editar vencimento';
  const codigo = alvo.codigo || `#${alvo.id}`;
  const esquecer = useWorkspaceForget([prefix + ':base', prefix + ':entrada', prefix]);
  const inicial = campo === 'valor' ? valorSolicitacaoParaEdicao(alvo.valor) : String(alvo.data_vencimento || '').slice(0, 10);
  const conflito = campo === 'valor' ? String(solicitacao.valor ?? '') !== String(alvo.valor ?? '')
    : String(vencimentoSolicitacaoParaEdicao(solicitacao) || '').slice(0, 10) !== String(alvo.data_vencimento || '').slice(0, 10);
  useWorkspaceWork(entrada !== inicial, salvando, prefix);

  function fechar() { if (!trava.current) { esquecer(); onFechar(); } }
  async function salvar(event) {
    event.preventDefault();
    if (trava.current || concluido.current) return;
    if (conflito) { setErro('Este dado foi alterado desde o início da edição. Feche e confira o valor atual antes de editar novamente.'); return; }
    if (!permissao) { setErro('Você não possui permissão para esta alteração.'); return; }
    let novo;
    try {
      novo = campo === 'valor' ? parseValorSolicitacaoBR(entrada) : entrada || null;
      if (campo === 'vencimento' && novo && novo < hojeSolicitacaoSP()) {
        throw new Error('O vencimento não pode ser anterior à data atual.');
      }
    } catch (error) { setErro(error.message); return; }
    const anterior = campo === 'valor' ? (alvo.valor == null ? null : Number(alvo.valor))
      : String(alvo.data_vencimento || '').slice(0, 10) || null;
    if (novo === anterior) { fechar(); return; }
    trava.current = true; setSalvando(true); setErro('');
    try {
      if (campo === 'valor') await updateValorSolicitacao(alvo.id, novo);
      else await updateDataVencimentoSolicitacao(alvo.id, novo);
      concluido.current = true;
    } catch (error) {
      setErro(error.message || 'Não foi possível salvar.');
      trava.current = false; setSalvando(false); return;
    }
    // PATCH ja concluida: falha de recarga nao pode convidar a salvar de novo.
    try { await onSalvo?.({ id: alvo.id, campo, codigo }); }
    catch (error) { console.error('Alteracao salva; falha ao atualizar a tela:', error); }
    finally { trava.current = false; setSalvando(false); esquecer(); onFechar(); }
  }

  return <OverlayModal rotulo={`${titulo} · ${codigo}`} largura="480px" onFechar={fechar}>
    <div data-modal="cabecalho" className="flex items-center justify-between gap-3 border-b p-4">
      <h2 className="app-bloco-titulo">{titulo} · {codigo}</h2>
      <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={fechar}>Fechar</button>
    </div>
    <form id={formId} onSubmit={salvar} className="space-y-3 p-4">
      <p className="app-note">Atual: {campo === 'valor' ? (alvo.valor == null ? 'Não informado' : `R$ ${valorSolicitacaoParaEdicao(alvo.valor)}`)
        : dataISOParaBR(alvo.data_vencimento) || 'Não informado'}.</p>
      <CampoForm label={campo === 'valor' ? 'Valor da solicitação (R$)' : 'Vencimento da solicitação'}
        hint={campo === 'valor' ? 'Use vírgula para centavos: 2.000,00. Deixe vazio para retirar o valor.'
          : 'Informe hoje ou uma data futura. Deixe vazio para retirar o vencimento.'}>
        {campo === 'valor' ? <input className="input" inputMode="decimal" aria-label="Valor da solicitação (R$)" value={entrada}
          disabled={salvando || !permissao} onChange={e => { setEntrada(e.target.value); setErro(''); }} autoFocus />
          : <DateInputBR className="input" value={entrada} min={hojeSolicitacaoSP()}
            disabled={salvando || !permissao} onChange={e => { setEntrada(e.target.value); setErro(''); }} autoFocus />}
      </CampoForm>
      <p className="app-note">Altera somente a solicitação e registra histórico. Títulos já gerados, parcelas de contrato e valores dos itens de compra não serão alterados.</p>
      {campo === 'vencimento' && alvo.data_vencimento_medicao ? <p role="status" className="app-note">
        A lista usa o vencimento da medição ({dataISOParaBR(alvo.data_vencimento_medicao)}).
        Editar esta data não altera o vencimento das parcelas da medição.</p> : null}
      {erro ? <p role="alert" className="form-error">{erro}</p> : null}
      {conflito ? <p role="alert" className="form-error">Este dado foi alterado. Feche e confira o valor atual antes de editar novamente.</p> : null}
      {!permissao ? <p role="alert">Você não possui permissão para esta alteração.</p> : null}
    </form>
    <div data-modal="rodape" className="app-actionbar border-t p-4">
      <button type="submit" form={formId} className="btn btn-primary btn-sm" disabled={salvando || !permissao || conflito}>
        {salvando ? 'Salvando...' : 'Salvar alteração'}</button>
      <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={fechar}>Cancelar</button>
    </div>
  </OverlayModal>;
}
