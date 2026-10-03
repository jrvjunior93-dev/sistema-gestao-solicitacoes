import DateInputBR from '../../../components/DateInputBR';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineUserGroup
} from 'react-icons/hi2';
import {
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  alternarValorFiltro,
  useConfirmacao
} from '../../../components/padrao';
import {
  cadastrarResponsavelCustosRecebiveis,
  consultaIndisponivel,
  encerrarResponsabilidadeCustosRecebiveis,
  listarResponsaveisCustosRecebiveis,
  listarResponsaveisGeral,
  mensagemLegivel
} from '../services/custosRecebiveis';
import { normalizarBusca, rotuloObra } from './CrFormatos';

const today = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);

function formatDate(value) {
  if (!value) return 'sem data final';
  const [year, month, day] = String(value).slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function ResponsaveisDaObra({ obra, onChanged, onClose }) {
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [data, setData] = useState({ items: [], usuarios_elegiveis: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [endingId, setEndingId] = useState(null);
  const [endDraft, setEndDraft] = useState({ id: null, motivo: '' });
  const [feedback, setFeedback] = useState(null);
  const [form, setForm] = useState({
    user_id: '',
    papel: 'RESPONSAVEL',
    competencia_inicial: currentMonth(),
    vigencia_inicio: today()
  });

  async function load() {
    if (!obra?.id) {
      setData({ items: [], usuarios_elegiveis: [] });
      return;
    }
    try {
      setLoading(true);
      const response = await listarResponsaveisCustosRecebiveis(obra.id);
      setData(response || { items: [], usuarios_elegiveis: [] });
    } catch (error) {
      setFeedback({ tone: 'error', message: mensagemLegivel(error, 'Não foi possível concluir a operação.') });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setFeedback(null);
    load();
  }, [obra?.id]);

  // "Gerenciar": o painel abre abaixo da lista — rola até ele e foca o título.
  useEffect(() => {
    if (!obra?.id) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const painel = document.getElementById('cr-vinculos-obra');
      if (!painel) return;
      painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const titulo = painel.querySelector('.app-bloco-titulo');
      if (titulo) {
        titulo.setAttribute('tabindex', '-1');
        titulo.focus({ preventScroll: true });
      }
    });
    return () => window.cancelAnimationFrame(frame);
    // `obra` (e não só o id): um novo "Gerenciar" na mesma obra rola de novo.
  }, [obra]); // eslint-disable-line react-hooks/exhaustive-deps

  const active = useMemo(
    () => (data.items || []).filter((item) => item.ativo),
    [data.items]
  );
  const history = useMemo(
    () => (data.items || []).filter((item) => !item.ativo),
    [data.items]
  );

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.user_id || saving) return;
    const obraId = obra.id;
    const payload = { ...form, user_id: Number(form.user_id) };
    if (payload.papel === 'RESPONSAVEL' && active.some((item) => item.papel === 'RESPONSAVEL')) {
      const { ok } = await confirmar({
        titulo: 'Trocar responsável',
        mensagem: 'O novo responsável encerra o vínculo do responsável atual desta obra.',
        rotuloConfirmar: 'Trocar responsável'
      });
      if (!ok) return;
    }

    try {
      setSaving(true);
      setFeedback(null);
      const result = await cadastrarResponsavelCustosRecebiveis(obraId, payload);
      setFeedback({
        tone: 'success',
        message: result.idempotente
          ? 'Esse vínculo já estava ativo.'
          : 'Responsabilidade cadastrada com trilha de auditoria.'
      });
      setForm((current) => ({ ...current, user_id: '' }));
      await load();
      await onChanged?.();
    } catch (error) {
      setFeedback({ tone: 'error', message: mensagemLegivel(error, 'Não foi possível concluir a operação.') });
    } finally {
      setSaving(false);
    }
  }

  async function handleEnd(item) {
    if (endDraft.motivo.trim().length < 10) {
      setFeedback({ tone: 'error', message: 'A justificativa deve possuir pelo menos 10 caracteres.' });
      return;
    }
    try {
      setEndingId(item.id);
      setFeedback(null);
      await encerrarResponsabilidadeCustosRecebiveis(item.id, {
        vigencia_fim: today(),
        motivo: endDraft.motivo.trim()
      });
      setFeedback({ tone: 'success', message: 'Responsabilidade encerrada e preservada no histórico.' });
      setEndDraft({ id: null, motivo: '' });
      await load();
      await onChanged?.();
    } catch (error) {
      setFeedback({ tone: 'error', message: mensagemLegivel(error, 'Não foi possível concluir a operação.') });
    } finally {
      setEndingId(null);
    }
  }

  return (
    <BlocoConteudo
      id="cr-vinculos-obra"
      className="cr-governance"
      titulo={`Vínculos · ${rotuloObra(obra)}`}
      acoes={(
        <button type="button" className="btn btn-outline btn-sm" onClick={onClose}>
          Fechar
        </button>
      )}
    >

      {feedback ? (
        <div className="cr-feedback" data-tone={feedback.tone}>{feedback.message}</div>
      ) : null}

      <div className="cr-governance-layout">
        <form className="cr-governance-form" onSubmit={handleSubmit}>
          <div className="cr-governance-form__title">
            <HiOutlineUserGroup className="h-5 w-5" />
            <div>
              <strong>Novo vínculo</strong>
            </div>
          </div>
          <label className="cr-field">
            <span>Usuário</span>
            <select
              required
              value={form.user_id}
              onChange={(event) => setForm((current) => ({ ...current, user_id: event.target.value }))}
            >
              <option value="">Selecione</option>
              {(data.usuarios_elegiveis || []).map((user) => (
                <option key={user.id} value={user.id}>
                  {user.nome}{user.email ? ` · ${user.email}` : ''}
                </option>
              ))}
            </select>
          </label>
          <div className="cr-form-pair">
            <label className="cr-field">
              <span>Papel</span>
              <select
                value={form.papel}
                onChange={(event) => setForm((current) => ({ ...current, papel: event.target.value }))}
              >
                <option value="RESPONSAVEL">Responsável</option>
                <option value="SUBSTITUTO">Substituto</option>
              </select>
            </label>
            <label className="cr-field">
              <span>Competência inicial</span>
              <input
                type="month"
                min={currentMonth()}
                required
                value={form.competencia_inicial}
                onChange={(event) => setForm((current) => ({
                  ...current,
                  competencia_inicial: event.target.value
                }))}
              />
            </label>
          </div>
          <label className="cr-field">
            <span>Início da vigência</span>
            <DateInputBR
              max={today()}
              required
              value={form.vigencia_inicio}
              onChange={(event) => setForm((current) => ({
                ...current,
                vigencia_inicio: event.target.value
              }))}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.user_id}>
            {saving ? 'Salvando...' : 'Cadastrar vínculo'}
          </button>
        </form>

        <div className="cr-governance-register">
          <div className="cr-governance-register__heading">
            <strong>Vínculos ativos</strong>
            <span>{active.length} registro(s)</span>
          </div>
          {loading ? <div className="cr-inline-state">Carregando...</div> : null}
          {!loading && active.length === 0 ? (
            <div className="cr-governance-warning">
              <HiOutlineExclamationTriangle className="h-5 w-5" />
              <div>
                <strong>Nenhum responsável configurado</strong>
                <span>A obra ainda não produzirá obrigações mensais.</span>
              </div>
            </div>
          ) : null}
          {active.map((item) => (
            <article className="cr-responsibility-row" key={item.id}>
              <HiOutlineCheckCircle className="h-5 w-5" />
              <div>
                <strong>{item.usuario?.nome || `Usuário #${item.user_id}`}</strong>
                <span>
                  {item.papel === 'RESPONSAVEL' ? 'Responsável' : 'Substituto'}
                  {' · '}desde {formatDate(item.vigencia_inicio)}
                </span>
                <small>Obrigações a partir de {item.competencia_inicial}</small>
              </div>
              <button
                type="button"
                className="btn btn-outline"
                disabled={endingId === item.id}
                onClick={() => setEndDraft((current) => ({
                  id: current.id === item.id ? null : item.id,
                  motivo: current.id === item.id ? '' : current.motivo
                }))}
              >
                {endDraft.id === item.id ? 'Cancelar' : 'Encerrar'}
              </button>
              {endDraft.id === item.id ? (
                <div className="cr-responsibility-end">
                  <label className="cr-field">
                    <span>Justificativa do encerramento</span>
                    <textarea
                      rows="2"
                      autoFocus
                      value={endDraft.motivo}
                      onChange={(event) => setEndDraft({
                        id: item.id,
                        motivo: event.target.value
                      })}
                      placeholder="Explique a troca, afastamento ou término da responsabilidade."
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={endingId === item.id || endDraft.motivo.trim().length < 10}
                    onClick={() => handleEnd(item)}
                  >
                    {endingId === item.id ? 'Encerrando...' : 'Confirmar encerramento'}
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {history.length ? (
        <details className="cr-governance-history">
          <summary>Histórico de responsabilidades ({history.length})</summary>
          <div>
            {history.map((item) => (
              <div key={item.id}>
                <strong>{item.usuario?.nome || `Usuário #${item.user_id}`}</strong>
                <span>
                  {item.papel === 'RESPONSAVEL' ? 'Responsável' : 'Substituto'}
                  {' · '}{formatDate(item.vigencia_inicio)} até {formatDate(item.vigencia_fim)}
                </span>
              </div>
            ))}
          </div>
        </details>
      ) : null}
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}

function nomes(lista) {
  return lista.length ? lista.map((item) => item.usuario?.nome || `Usuário #${item.usuario?.id || '?'}`).join(', ') : '';
}

const FILTRO_SITUACAO = [
  { valor: 'SEM_RESPONSAVEL', rotulo: 'Sem responsável' },
  { valor: 'COM_RESPONSAVEL', rotulo: 'Com responsável' }
];

/*
  Responsáveis e substitutos (Fase 4): lista geral de todas as obras do
  escopo, sem escolher obra antes. "Gerenciar" abre o cadastro/encerramento
  da obra logo abaixo. Se o servidor ainda não tiver a lista geral, as obras
  continuam listadas e o cadastro por obra segue funcionando.
*/
export default function CrConfiguracoesView({ obras = [], onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [ativos, setAtivos] = useState({});
  const [aberta, setAberta] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErro('');
      setData(await listarResponsaveisGeral());
    } catch (error) {
      setData(null);
      setErro(consultaIndisponivel(error)
        ? 'Lista geral de responsáveis indisponível no servidor no momento. Use "Gerenciar" para ver os vínculos de cada obra.'
        : mensagemLegivel(error, 'Não foi possível carregar os responsáveis.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const linhas = useMemo(() => {
    const fonte = Array.isArray(data?.items)
      ? data.items.map((item) => ({ ...item, conhecido: true }))
      : (obras || []).map((obra) => ({ obra, responsaveis: [], conhecido: false }));
    const termo = normalizarBusca(busca);
    const situacoes = ativos.situacao || new Set();
    return fonte
      .map((item) => {
        const ativosDaObra = (item.responsaveis || []).filter((vinculo) => vinculo.ativo);
        return {
          ...item,
          titulares: ativosDaObra.filter((vinculo) => vinculo.papel === 'RESPONSAVEL'),
          substitutos: ativosDaObra.filter((vinculo) => vinculo.papel === 'SUBSTITUTO')
        };
      })
      .filter((item) => {
        const texto = normalizarBusca(`${item.obra?.codigo} ${item.obra?.nome} ${nomes(item.titulares)} ${nomes(item.substitutos)}`);
        if (termo && !texto.includes(termo)) return false;
        if (!situacoes.size || !item.conhecido) return true;
        return situacoes.has(item.titulares.length ? 'COM_RESPONSAVEL' : 'SEM_RESPONSAVEL');
      });
  }, [data, obras, busca, ativos]);

  const semResponsavel = linhas.filter((item) => item.conhecido && !item.titulares.length).length;

  async function handleChanged() {
    await load();
    await onChanged?.();
  }

  return (
    <>
      <BlocoConteudo
        titulo="Responsáveis e substitutos"
        contagem={data ? `${linhas.length} obra(s) · ${semResponsavel} sem responsável` : `${linhas.length} obra(s)`}
      >
        <BarraFiltros
          busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Obra ou nome do responsável' }}
          filtros={data ? [{ id: 'situacao', rotulo: 'Situação', opcoes: FILTRO_SITUACAO }] : []}
          ativos={ativos}
          aoAlternar={(dimensao, valor, opcoes) => setAtivos(
            (current) => alternarValorFiltro(current, dimensao, valor, opcoes)
          )}
          aoLimpar={() => { setBusca(''); setAtivos({}); }}
        />
        {erro ? <p className="cr-faixa-aviso" role="status">{erro}</p> : null}
        <TabelaPadrao
          colunas={[
            {
              id: 'obra',
              titulo: 'Obra',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => rotuloObra(item.obra)
            },
            {
              id: 'responsavel',
              titulo: 'Responsável',
              tipo: 'texto',
              render: (item) => {
                if (!item.conhecido) return '—';
                return item.titulares.length
                  ? nomes(item.titulares)
                  : <span className="cr-warning-text">Sem responsável</span>;
              }
            },
            {
              id: 'substitutos',
              titulo: 'Substitutos',
              tipo: 'texto',
              render: (item) => (item.conhecido ? (nomes(item.substitutos) || '—') : '—')
            },
            {
              id: 'historico',
              titulo: 'Vínculos',
              tipo: 'texto',
              render: (item) => (item.conhecido ? (
                <CelulaDupla
                  principal={`${item.titulares.length + item.substitutos.length} ativo(s)`}
                  sub={`${(item.responsaveis || []).length} no histórico`}
                />
              ) : '—')
            }
          ]}
          itens={linhas}
          getId={(item) => item.obra?.id}
          storageKey="tabela:custos-recebiveis-responsaveis"
          rotuloRolagem="Responsáveis e substitutos"
          carregando={loading}
          vazio={erro && !(obras || []).length ? 'Não foi possível carregar a lista.' : 'Nenhuma obra encontrada.'}
          acoesLinha={(item) => (
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => setAberta({ ...item.obra })}
            >
              Gerenciar
            </button>
          )}
          larguraAcoes={130}
        />
      </BlocoConteudo>
      {aberta?.id ? (
        <ResponsaveisDaObra
          key={aberta.id}
          obra={aberta}
          onChanged={handleChanged}
          onClose={() => setAberta(null)}
        />
      ) : null}
    </>
  );
}
