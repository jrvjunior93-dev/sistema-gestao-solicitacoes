import { useCallback, useEffect, useRef, useState } from 'react';
import { useWorkspaceState, useWorkspaceWork } from '../navigation/WorkspaceContext';
import useWorkspaceRecordDraft from '../navigation/useWorkspaceRecordDraft';
import useQueryRevision from '../navigation/useQueryRevision';
import { HiOutlinePencilSquare, HiOutlineXCircle } from 'react-icons/hi2';
import OverlayModal from '../components/ui/OverlayModal';
import {
  Avisos,
  BarraFiltros,
  CelulaDupla,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import ParcelasEventoEditor, {
  normalizarFormularioEvento,
  validarParcelasEvento,
  valoresParcelasParaPayload
} from '../components/rh/ParcelasEventoEditor';
import { competenciaISOParaBR } from '../components/CompetenciaInputBR';
import {
  atualizarEventoRecorrenteRh,
  desativarEventoRecorrenteRh,
  listarEventosRecorrentesRh
} from '../services/rhDp';
import { formatCurrencyBRL, maskCpfCnpj, parseCurrencyInput } from '../utils/formatters';

const ROTULO_EVENTO = {
  VALE_ALIMENTACAO: 'Vale alimentação',
  VALE_TRANSPORTE: 'Vale transporte',
  PLANO_SAUDE: 'Plano de saúde',
  DESCONTO_ADIANTAMENTO: 'Desconto de adiantamento',
  PENSAO_ALIMENTICIA: 'Pensão alimentícia',
  OUTRO: 'Outro'
};

function resumoParcelas(evento) {
  if (!evento.parcelas_total) return 'Mensal, sem término';
  return `${evento.parcelas_aplicadas || 0}/${evento.parcelas_total} aplicada(s)`;
}

function eventoConcluido(evento) {
  return Boolean(evento.ativo && evento.parcelas_total
    && Number(evento.parcelas_aplicadas || 0) >= Number(evento.parcelas_total));
}

// normalizarFormularioEvento tambem conserva o DTO original; projetar apenas
// os inputs que podem ser alterados, sem colaborador/permissoes/historico.
function inputsEvento(evento) {
  const normalizado = normalizarFormularioEvento(evento);
  return Object.fromEntries(['modo_valor', 'valor', 'competencia_inicio', 'parcelas_total',
    'parcelas_valores', 'observacoes', 'beneficiario_nome', 'beneficiario_documento',
    'beneficiario_banco', 'beneficiario_agencia', 'beneficiario_conta',
    'beneficiario_tipo_conta', 'beneficiario_chave_pix'].map(key => [key, normalizado[key] ?? '']));
}

const revisaoEvento = evento => JSON.stringify([evento.id, evento.ativo, evento.codigo,
  evento.parcelas_aplicadas, evento.parcelas_aplicadas_valores, evento.updatedAt,
  evento.updated_at, inputsEvento(evento)]);

export default function RhDpEventosRecorrentes({ podeDecidir, somenteLeitura = false, obraId }) {
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useWorkspaceState('eventos:busca', '');
  const [status, setStatus] = useWorkspaceState('eventos:status', 'ATIVO');
  const [edicaoId, setEdicaoId] = useWorkspaceState('eventos:edicaoId', null);
  const draft = useWorkspaceRecordDraft('eventos:inputs');
  const query = useQueryRevision(obraId);
  const trava = useRef(false);
  const eventoAtual = eventos.find(item => String(item.id) === String(edicaoId));
  const edicao = podeDecidir && !somenteLeitura && !carregando && eventoAtual?.ativo
    && !eventoConcluido(eventoAtual) && draft.value ? { evento: eventoAtual, formulario: draft.value } : null;
  const setEdicao = update => {
    if (update === null) { setEdicaoId(null); draft.discard(); return; }
    const next = typeof update === 'function' ? update(edicao) : update;
    draft.setValue(next.formulario);
  };
  useWorkspaceWork(draft.dirty, salvando, 'eventos:work');

  const carregar = useCallback(async () => {
    const token = query.begin();
    setCarregando(true);
    try {
      const lista = await listarEventosRecorrentesRh({ q: busca || undefined, status, obra_id: obraId });
      if (!query.isCurrent(token)) return;
      setEventos(Array.isArray(lista) ? lista : []);
    } catch (error) {
      if (!query.isCurrent(token)) return;
      setEventos([]); draft.conceal();
      avisar.erro(error.message || 'Não foi possível carregar os eventos recorrentes.');
    } finally {
      if (query.isCurrent(token)) setCarregando(false);
    }
  }, [avisar, busca, status, obraId, query.begin, query.isCurrent, draft.conceal]);

  useEffect(() => {
    const atraso = setTimeout(carregar, 300);
    return () => clearTimeout(atraso);
  }, [carregar]);

  useEffect(() => {
    if (!eventoAtual || !podeDecidir || somenteLeitura) { draft.conceal(); return; }
    draft.hydrate(inputsEvento(eventoAtual), revisaoEvento(eventoAtual));
  }, [eventoAtual, podeDecidir, somenteLeitura, draft.hydrate, draft.conceal]);

  function abrirEdicao(evento) {
    if (!podeDecidir || somenteLeitura || carregando || salvando || !evento.ativo || eventoConcluido(evento)) return;
    limpar();
    draft.hydrate(inputsEvento(evento), revisaoEvento(evento), { discard: true });
    setEdicaoId(evento.id);
  }

  async function salvarEdicao(event) {
    event.preventDefault();
    if (trava.current || !edicao || draft.conflict) return;
    const erro = validarParcelasEvento(edicao.formulario);
    if (erro) {
      avisar.erro(erro);
      return;
    }
    const ehPensao = edicao.evento.codigo === 'PENSAO_ALIMENTICIA';
    if (ehPensao) {
      const documento = String(edicao.formulario.beneficiario_documento || '').replace(/\D/g, '');
      const temConta = edicao.formulario.beneficiario_banco
        && edicao.formulario.beneficiario_agencia
        && edicao.formulario.beneficiario_conta;
      if (!String(edicao.formulario.beneficiario_nome || '').trim() || documento.length !== 11) {
        avisar.erro('Informe o nome e o CPF do beneficiário da pensão.');
        return;
      }
      if (!String(edicao.formulario.beneficiario_chave_pix || '').trim() && !temConta) {
        avisar.erro('Informe a chave PIX ou os dados bancários do beneficiário da pensão.');
        return;
      }
    }
    trava.current = true;
    setSalvando(true);
    limpar();
    try {
      await atualizarEventoRecorrenteRh(edicao.evento.id, {
        modo_valor: Number(edicao.formulario.parcelas_total) > 0 ? 'TOTAL' : 'PARCELA',
        valor: parseCurrencyInput(edicao.formulario.valor),
        competencia_inicio: edicao.formulario.competencia_inicio,
        parcelas_total: edicao.formulario.parcelas_total
          ? Number(edicao.formulario.parcelas_total)
          : null,
        parcelas_valores: valoresParcelasParaPayload(edicao.formulario),
        observacoes: edicao.formulario.observacoes || null,
        ...(ehPensao ? {
          beneficiario_nome: edicao.formulario.beneficiario_nome,
          beneficiario_documento: String(edicao.formulario.beneficiario_documento || '').replace(/\D/g, ''),
          beneficiario_banco: edicao.formulario.beneficiario_banco || null,
          beneficiario_agencia: edicao.formulario.beneficiario_agencia || null,
          beneficiario_conta: edicao.formulario.beneficiario_conta || null,
          beneficiario_tipo_conta: edicao.formulario.beneficiario_tipo_conta || null,
          beneficiario_chave_pix: edicao.formulario.beneficiario_chave_pix || null
        } : {})
      });
      setEdicao(null);
      await carregar();
      avisar.sucesso('Evento recorrente atualizado. As apurações já realizadas foram preservadas.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível atualizar o evento recorrente.');
    } finally {
      trava.current = false;
      setSalvando(false);
    }
  }

  async function cancelar(evento) {
    if (trava.current || !podeDecidir || somenteLeitura || carregando || !evento.ativo || eventoConcluido(evento)) return;
    trava.current = true; setSalvando(true);
    try {
    const { ok, texto } = await confirmar({
      titulo: 'Cancelar evento recorrente',
      mensagem: 'O evento deixa de entrar nas próximas competências. Valores já aplicados permanecem no histórico.',
      rotuloConfirmar: 'Cancelar próximas parcelas',
      rotuloCancelar: 'Voltar',
      destrutiva: true,
      campo: { rotulo: 'Motivo do cancelamento', obrigatorio: true, multilinha: true }
    });
    if (!ok || !texto.trim()) return;
    limpar();
    try {
      await desativarEventoRecorrenteRh(evento.id, texto.trim());
      await carregar();
      avisar.sucesso('Evento cancelado para as próximas competências.');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível cancelar o evento recorrente.');
    }
    } finally { trava.current = false; setSalvando(false); }
  }

  return (
    <div className="space-y-3">
      <Avisos avisos={avisos} aoFechar={fechar} />

      {somenteLeitura ? (
        <p className="app-note">
          Consulta dos eventos aprovados dos colaboradores das suas obras. Solicitações novas ou
          alterações devem ser enviadas ao Departamento Pessoal pela aba Solicitações.
        </p>
      ) : null}

      <BarraFiltros
        busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Colaborador, evento, obra ou matrícula' }}
        filtros={[{
          id: 'status',
          rotulo: 'Situação',
          unico: true,
          opcoes: [
            { valor: 'ATIVO', rotulo: 'Ativos' },
            { valor: 'CANCELADO', rotulo: 'Cancelados' }
          ]
        }]}
        ativos={{ status: new Set(status ? [status] : []) }}
        aoAlternar={(_dimensao, valor) => setStatus((atual) => (atual === valor ? '' : valor))}
        aoLimpar={() => { setBusca(''); setStatus('ATIVO'); }}
      />

      <div className="card sol-surface-card">
        <TabelaPadrao
          chaveWorkspace="eventos:tabela"
          consultaWorkspace={`${obraId || ''}|${busca}|${status}`}
          colunas={[
            {
              id: 'colaborador',
              titulo: 'Colaborador',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (evento) => (
                <CelulaDupla
                  principal={evento.colaborador?.nome || '—'}
                  sub={evento.colaborador?.matricula || evento.colaborador?.obra?.nome || '—'}
                />
              )
            },
            {
              id: 'evento',
              titulo: 'Evento',
              tipo: 'texto',
              render: (evento) => (
                <CelulaDupla
                  principal={ROTULO_EVENTO[evento.codigo] || evento.codigo}
                  sub={`Início ${competenciaISOParaBR(evento.competencia_inicio)}`}
                />
              )
            },
            {
              id: 'valor',
              titulo: 'Valor atual',
              tipo: 'valor',
              render: (evento) => formatCurrencyBRL(evento.valor_parcela || evento.valor)
            },
            {
              id: 'parcelas',
              titulo: 'Parcelas',
              tipo: 'texto',
              render: resumoParcelas
            },
            {
              id: 'obra',
              titulo: 'Obra atual',
              tipo: 'texto',
              render: (evento) => evento.colaborador?.obra?.nome || '—'
            },
            {
              id: 'situacao',
              titulo: 'Situação',
              tipo: 'status',
              render: (evento) => (
                <span className={evento.ativo && !eventoConcluido(evento) ? 'rh-chip rh-chip--evento' : 'rh-chip'}>
                  {!evento.ativo ? 'Cancelado' : eventoConcluido(evento) ? 'Concluído' : 'Ativo'}
                </span>
              )
            }
          ]}
          itens={eventos}
          storageKey="tabela:rh-dp:eventos-recorrentes"
          rotuloRolagem="Eventos recorrentes"
          carregando={carregando}
          vazio="Nenhum evento recorrente encontrado."
          acoesLinha={(evento) => podeDecidir && !somenteLeitura && evento.ativo && !eventoConcluido(evento) ? (
            <div className="rh-acoes-icones">
              <button
                type="button"
                className="rh-acao-icone"
                disabled={carregando || salvando}
                title="Editar próximas parcelas"
                aria-label={`Editar evento de ${evento.colaborador?.nome || 'colaborador'}`}
                onClick={() => abrirEdicao(evento)}
              >
                <HiOutlinePencilSquare aria-hidden="true" />
              </button>
              <button
                type="button"
                className="rh-acao-icone"
                disabled={carregando || salvando}
                title="Cancelar próximas parcelas"
                aria-label={`Cancelar evento de ${evento.colaborador?.nome || 'colaborador'}`}
                onClick={() => cancelar(evento)}
              >
                <HiOutlineXCircle aria-hidden="true" />
              </button>
            </div>
          ) : null}
          larguraAcoes={96}
        />
      </div>

      {edicao ? (
        <OverlayModal
          rotulo="Editar evento recorrente"
          largura="900px"
          onFechar={() => { if (!salvando) setEdicao(null); }}
        >
          <form className="rh-modal-conteudo space-y-3" onSubmit={salvarEdicao}>
            <div className="app-page-header-row">
              <div>
                <h2 className="text-lg font-semibold">Editar próximas parcelas</h2>
                <p className="app-bloco-lead">
                  {edicao.evento.colaborador?.nome} · {ROTULO_EVENTO[edicao.evento.codigo] || edicao.evento.codigo}
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={() => setEdicao(null)}>
                Fechar
              </button>
            </div>

            {Number(edicao.evento.parcelas_aplicadas || 0) > 0 ? (
              <p className="app-note">
                {edicao.evento.parcelas_aplicadas} parcela(s) já aplicada(s) estão bloqueadas e não serão recalculadas.
              </p>
            ) : null}

            {draft.conflict && <div role="alert" className="app-note">O evento mudou. Seu preenchimento foi preservado; confira as parcelas atuais antes de salvar.
              <button type="button" className="btn btn-outline btn-sm" disabled={salvando} onClick={async () => {
                const { ok } = await confirmar({ titulo: 'Descartar preenchimento?', mensagem: 'Usar os valores atuais do evento, descartando esta edição local.' });
                if (ok) draft.discard();
              }}>Usar dados atuais</button>
            </div>}
            <fieldset disabled={salvando || draft.conflict} className="space-y-3">
            <ParcelasEventoEditor
              valor={edicao.formulario}
              onChange={(formulario) => setEdicao((atual) => ({ ...atual, formulario }))}
              parcelasBloqueadas={Number(edicao.evento.parcelas_aplicadas || 0)}
            />

            {edicao.evento.codigo === 'PENSAO_ALIMENTICIA' ? (
              <fieldset className="space-y-3">
                <legend className="form-label">Dados do beneficiário da pensão</legend>
                <div className="rh-colaboradores-filter-grid">
                  <label className="form-field">
                    <span className="form-label form-label--required">Beneficiário</span>
                    <input
                      className="form-control"
                      value={edicao.formulario.beneficiario_nome || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_nome: event.target.value }
                      }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label form-label--required">CPF do beneficiário</span>
                    <input
                      className="form-control"
                      inputMode="numeric"
                      value={maskCpfCnpj(edicao.formulario.beneficiario_documento || '')}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: {
                          ...atual.formulario,
                          beneficiario_documento: maskCpfCnpj(event.target.value)
                        }
                      }))}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Banco</span>
                    <input
                      className="form-control"
                      value={edicao.formulario.beneficiario_banco || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_banco: event.target.value }
                      }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Agência</span>
                    <input
                      className="form-control"
                      value={edicao.formulario.beneficiario_agencia || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_agencia: event.target.value }
                      }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Conta</span>
                    <input
                      className="form-control"
                      value={edicao.formulario.beneficiario_conta || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_conta: event.target.value }
                      }))}
                    />
                  </label>
                  <label className="form-field">
                    <span className="form-label">Tipo de conta</span>
                    <select
                      className="form-control"
                      value={edicao.formulario.beneficiario_tipo_conta || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_tipo_conta: event.target.value }
                      }))}
                    >
                      <option value="">Selecione</option>
                      <option value="CORRENTE">Corrente</option>
                      <option value="POUPANCA">Poupança</option>
                      <option value="SALARIO">Salário</option>
                      <option value="PAGAMENTO">Pagamento</option>
                    </select>
                  </label>
                  <label className="form-field">
                    <span className="form-label">Chave PIX</span>
                    <input
                      className="form-control"
                      value={edicao.formulario.beneficiario_chave_pix || ''}
                      onChange={(event) => setEdicao((atual) => ({
                        ...atual,
                        formulario: { ...atual.formulario, beneficiario_chave_pix: event.target.value }
                      }))}
                    />
                  </label>
                </div>
                <p className="app-note">Informe a chave PIX ou o conjunto banco, agência e conta.</p>
              </fieldset>
            ) : null}

            <label className="form-field">
              <span className="form-label">Observações</span>
              <textarea
                className="form-control"
                aria-label="Observações"
                rows="3"
                value={edicao.formulario.observacoes || ''}
                onChange={(event) => setEdicao((atual) => ({
                  ...atual,
                  formulario: { ...atual.formulario, observacoes: event.target.value }
                }))}
              />
            </label>

            </fieldset>

            <div className="app-page-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEdicao(null)} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando || draft.conflict}>
                {salvando ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </form>
        </OverlayModal>
      ) : null}

      {elementoConfirmacao}
    </div>
  );
}
