import { useCallback, useEffect, useState } from 'react';
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

export default function RhDpEventosRecorrentes({ podeDecidir }) {
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [eventos, setEventos] = useState([]);
  const [carregando, setCarregando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [busca, setBusca] = useState('');
  const [status, setStatus] = useState('ATIVO');
  const [edicao, setEdicao] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const lista = await listarEventosRecorrentesRh({ q: busca || undefined, status });
      setEventos(Array.isArray(lista) ? lista : []);
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível carregar os eventos recorrentes.');
    } finally {
      setCarregando(false);
    }
  }, [avisar, busca, status]);

  useEffect(() => {
    const atraso = setTimeout(carregar, 300);
    return () => clearTimeout(atraso);
  }, [carregar]);

  function abrirEdicao(evento) {
    limpar();
    setEdicao({
      evento,
      formulario: normalizarFormularioEvento(evento)
    });
  }

  async function salvarEdicao(event) {
    event.preventDefault();
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
      setSalvando(false);
    }
  }

  async function cancelar(evento) {
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
  }

  return (
    <div className="space-y-3">
      <Avisos avisos={avisos} aoFechar={fechar} />

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
          acoesLinha={(evento) => podeDecidir && evento.ativo && !eventoConcluido(evento) ? (
            <div className="rh-acoes-icones">
              <button
                type="button"
                className="rh-acao-icone"
                title="Editar próximas parcelas"
                aria-label={`Editar evento de ${evento.colaborador?.nome || 'colaborador'}`}
                onClick={() => abrirEdicao(evento)}
              >
                <HiOutlinePencilSquare aria-hidden="true" />
              </button>
              <button
                type="button"
                className="rh-acao-icone"
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
          onFechar={() => setEdicao(null)}
        >
          <form className="rh-modal-conteudo space-y-3" onSubmit={salvarEdicao}>
            <div className="app-page-header-row">
              <div>
                <h2 className="text-lg font-semibold">Editar próximas parcelas</h2>
                <p className="app-bloco-lead">
                  {edicao.evento.colaborador?.nome} · {ROTULO_EVENTO[edicao.evento.codigo] || edicao.evento.codigo}
                </p>
              </div>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => setEdicao(null)}>
                Fechar
              </button>
            </div>

            {Number(edicao.evento.parcelas_aplicadas || 0) > 0 ? (
              <p className="app-note">
                {edicao.evento.parcelas_aplicadas} parcela(s) já aplicada(s) estão bloqueadas e não serão recalculadas.
              </p>
            ) : null}

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
                rows="3"
                value={edicao.formulario.observacoes || ''}
                onChange={(event) => setEdicao((atual) => ({
                  ...atual,
                  formulario: { ...atual.formulario, observacoes: event.target.value }
                }))}
              />
            </label>

            <div className="app-page-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEdicao(null)} disabled={salvando}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={salvando}>
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
