import { useEffect, useState } from 'react';
import {
  getTiposSolicitacao,
  criarTipoSolicitacao,
  atualizarTipoSolicitacao,
  ativarTipoSolicitacao,
  desativarTipoSolicitacao,
  excluirTipoSolicitacao
} from '../services/tiposSolicitacao';
import {
  FINALIDADES_DATA_SOLICITACAO,
  getDefaultTipoSolicitacaoBehavior,
  getTipoSolicitacaoBehavior,
  obterRotuloDataSolicitacao
} from '../utils/tipoSolicitacao';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import OverlayModal from '../components/ui/OverlayModal';
import StatusBadge from '../components/StatusBadge';

const BEHAVIOR_FIELDS = [
  { key: 'mostrar_valor', label: 'Mostrar valor' },
  { key: 'exige_valor', label: 'Exigir valor' },
  { key: 'mostrar_descricao', label: 'Mostrar descrição' },
  { key: 'exige_descricao', label: 'Exigir descrição' },
  { key: 'mostrar_apropriacao_principal', label: 'Mostrar apropriação principal' },
  { key: 'exige_apropriacao_principal', label: 'Exigir apropriação principal' },
  { key: 'mostrar_contrato', label: 'Mostrar contrato' },
  { key: 'exige_contrato', label: 'Exigir contrato' },
  { key: 'mostrar_subtipo', label: 'Mostrar subtipo' },
  { key: 'exige_subtipo', label: 'Exigir subtipo' },
  { key: 'mostrar_periodo_medicao', label: 'Mostrar período de medição' },
  { key: 'exige_periodo_medicao', label: 'Exigir período de medição' },
  { key: 'mostrar_ref_contrato_abertura', label: 'Mostrar ref. contrato abertura' },
  { key: 'exige_ref_contrato_abertura', label: 'Exigir ref. contrato abertura' },
  { key: 'mostrar_itens_apropriacao', label: 'Mostrar itens de apropriação' },
  { key: 'exige_itens_apropriacao', label: 'Exigir itens de apropriação' },
  { key: 'usa_fluxo_contrato_novo', label: 'Usar fluxo novo de contratos' },
  { key: 'usa_fluxo_despesa_eventual', label: 'Usar fluxo de Despesa Eventual' },
  { key: 'exige_apropriacoes_contrato', label: 'Exigir apropriações do contrato' }
];

function formatarRegrasTipo(tipo) {
  return BEHAVIOR_FIELDS
    .filter(field => getTipoSolicitacaoBehavior(tipo)?.[field.key])
    .map(field => field.label);
}

export default function TiposSolicitacao() {
  const [tipos, setTipos] = useState([]);
  const [nome, setNome] = useState('');
  const [codigoInterno, setCodigoInterno] = useState('');
  const [comportamento, setComportamento] = useState(getDefaultTipoSolicitacaoBehavior());
  const [disponivelParaObras, setDisponivelParaObras] = useState(true);
  const [editId, setEditId] = useState(null);
  const [editNome, setEditNome] = useState('');
  const [editCodigoInterno, setEditCodigoInterno] = useState('');
  const [editComportamento, setEditComportamento] = useState(getDefaultTipoSolicitacaoBehavior());
  const [editDisponivelParaObras, setEditDisponivelParaObras] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formAberto, setFormAberto] = useState(false);
  // R3: aviso e confirmação do sistema no lugar das caixas do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function carregar() {
    const tiposData = await getTiposSolicitacao();
    setTipos(Array.isArray(tiposData) ? tiposData : []);
  }

  useEffect(() => {
    carregar();
  }, []);

  function abrirNovoTipo() {
    cancelarEdicao();
    setFormAberto(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const nomeNormalizado = String(nome || '').trim();
    if (!nomeNormalizado) {
      avisar.alerta('Informe o nome do tipo.');
      return;
    }

    await criarTipoSolicitacao({
      nome: nomeNormalizado,
      codigo_interno: codigoInterno,
      comportamento,
      disponivel_para_obras: disponivelParaObras
    });

    setNome('');
    setCodigoInterno('');
    setComportamento(getDefaultTipoSolicitacaoBehavior());
    setDisponivelParaObras(true);
    setFormAberto(false);
    carregar();
  }

  async function toggle(tipo) {
    try {
      if (tipo.ativo) {
        await desativarTipoSolicitacao(tipo.id);
      } else {
        await ativarTipoSolicitacao(tipo.id);
      }
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao alterar status do tipo');
    }
  }

  async function excluir(tipo) {
    // confirmar() devolve { ok, texto } — objeto é sempre truthy, então o
    // retorno TEM de ser desestruturado (R21), senão "Cancelar" excluiria.
    const { ok } = await confirmar({
      titulo: 'Excluir tipo',
      mensagem: `Deseja excluir o tipo "${tipo.nome}"?`,
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await excluirTipoSolicitacao(tipo.id);
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao excluir tipo');
    }
  }

  function iniciarEdicao(item) {
    setFormAberto(false);
    setEditId(item.id);
    setEditNome(item.nome);
    setEditCodigoInterno(item.codigo_interno || '');
    setEditComportamento(getTipoSolicitacaoBehavior(item));
    setEditDisponivelParaObras(item.disponivel_para_obras === true || Number(item.disponivel_para_obras) === 1);
  }

  function cancelarEdicao() {
    setEditId(null);
    setEditNome('');
    setEditCodigoInterno('');
    setEditComportamento(getDefaultTipoSolicitacaoBehavior());
    setEditDisponivelParaObras(true);
  }

  async function salvarEdicao(id) {
    try {
      setSaving(true);
      await atualizarTipoSolicitacao(id, {
        nome: editNome,
        codigo_interno: editCodigoInterno,
        comportamento: editComportamento,
        disponivel_para_obras: editDisponivelParaObras
      });
      cancelarEdicao();
      carregar();
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar edição');
    } finally {
      setSaving(false);
    }
  }

  // R16: UM dono para a faixa de avisos. Com o modal aberto ela vive dentro
  // dele (a validação do "Novo tipo" avisa com o modal aberto e ficaria
  // atrás do fundo escuro); fechado, logo abaixo do PageHeader.
  const faixaAvisos = <Avisos avisos={avisos} aoFechar={fechar} />;
  const modalAberto = formAberto || editId !== null;

  const tiposFiltrados = tipos;

  const colunas = [
    {
      id: 'nome',
      titulo: 'Nome',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (t) => t.nome
    },
    {
      id: 'codigo_interno',
      titulo: 'Código interno',
      // Codigo interno é longo (ex: SOLICITACAO_DE_COMPRA) — não cabe nos
      // 130px do tipo 'codigo'; 'texto' dá a medida de leitura.
      tipo: 'texto',
      render: (t) => t.codigo_interno || '-'
    },
    {
      id: 'regras',
      titulo: 'Regras',
      tipo: 'texto',
      flex: 3,
      render: (t) => (
        <div className="flex flex-wrap gap-1">
          <span className={`fx-badge ${t.disponivel_para_obras ? 'fx-badge--success' : 'fx-badge--neutral'}`}>
            {t.disponivel_para_obras ? 'Disponível para Obras' : 'Somente por Centro de Custo'}
          </span>
          <span className="fx-badge fx-badge--neutral">
            {obterRotuloDataSolicitacao(getTipoSolicitacaoBehavior(t))}
          </span>
          {formatarRegrasTipo(t).length > 0 ? formatarRegrasTipo(t).map(label => (
            <span key={label} className="fx-badge fx-badge--neutral">
              {label}
            </span>
          )) : <span className="text-xs text-[var(--c-muted)]">Padrão</span>}
        </div>
      )
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (t) => <StatusBadge status={t.ativo ? 'Ativo' : 'Inativo'} />
    }
  ];

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Tipos (Macro)"
        contagem={`${tiposFiltrados.length} tipo(s)`}
        descricao="Cadastro dos tipos macro utilizados nas solicitações."
        acaoPrincipal={{ rotulo: 'Novo tipo', onClick: abrirNovoTipo }}
      />

      {!modalAberto && faixaAvisos}

      {/* R9 (docs/REGRAS-LAYOUT.md): cadastro raro abre em MODAL pela ação
          principal do cabeçalho; a lista é o bloco primário PERMANENTE.
          O ritmo vertical vem do Pagina. */}
      {formAberto && (
        <OverlayModal rotulo="Novo tipo" largura="var(--modal-max-w-xl, 1120px)" onFechar={() => setFormAberto(false)}>
          <div data-modal="cabecalho" className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
            <h3 className="text-lg font-semibold text-[var(--c-text)]">Novo tipo</h3>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setFormAberto(false)}>
              Fechar
            </button>
          </div>
          <div className="overflow-y-auto px-4 py-3">
            {faixaAvisos}
            <form className="space-y-4" onSubmit={handleSubmit}>
              <FormSecao legenda="Identificação" colunas={2}>
                <CampoForm label="Nome do tipo" obrigatorio>
                  <input
                    className="input w-full"
                    placeholder="Ex: Adm. Local"
                    value={nome}
                    onChange={e => setNome(e.target.value)}
                    required
                  />
                </CampoForm>
                <CampoForm
                  label="Código interno"
                  hint="Opcional; usado por integracoes e regras internas."
                >
                  <input
                    className="input w-full"
                    placeholder="Ex: SOLICITACAO_DE_COMPRA"
                    value={codigoInterno}
                    onChange={e => setCodigoInterno(e.target.value.toUpperCase())}
                  />
                </CampoForm>
              </FormSecao>

              <label className="flex items-start gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={disponivelParaObras}
                  onChange={e => setDisponivelParaObras(e.target.checked)}
                />
                <span>
                  <strong className="block text-[var(--c-text)]">Disponível para todas as Obras</strong>
                  <span className="text-xs text-[var(--c-muted)]">Centros de Custo são configurados separadamente na página “Tipos por Obra/Centro de Custo”.</span>
                </span>
              </label>

              <BlocoConteudo
                titulo="Comportamento do tipo"
                variante="secundario"
                recolhivel
                recolhidoPadrao
              >
                <CampoForm
                  label="Finalidade da data"
                  hint="Define o nome exibido na abertura da solicitação; a gravação e as regras permanecem as mesmas."
                >
                  <select
                    className="select w-full"
                    value={comportamento.finalidade_data_vencimento}
                    onChange={e => setComportamento(prev => ({
                      ...prev,
                      finalidade_data_vencimento: e.target.value
                    }))}
                  >
                    <option value={FINALIDADES_DATA_SOLICITACAO.RESPOSTA}>Data de Resposta</option>
                    <option value={FINALIDADES_DATA_SOLICITACAO.PAGAMENTO}>Data de Pagamento</option>
                  </select>
                </CampoForm>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {BEHAVIOR_FIELDS.map(field => (
                    <label key={field.key} className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        checked={Boolean(comportamento[field.key])}
                        onChange={e => setComportamento(prev => ({ ...prev, [field.key]: e.target.checked }))}
                      />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
                {comportamento.usa_fluxo_despesa_eventual ? (
                  <p className="app-note mt-3">
                    O fluxo de Despesa Eventual usa esses campos como padrão. A visibilidade e a obrigatoriedade podem ser ajustadas em “Campos da Nova Solicitação”. Para este fluxo, use a finalidade “Data de Pagamento”.
                  </p>
                ) : null}
              </BlocoConteudo>

              <p className="app-note">
                O tipo é criado no cadastro geral. O recebimento por setor continua configurado separadamente e não controla mais o catálogo da Nova Solicitação.
              </p>

              <div className="app-actionbar">
                <button type="submit" className="btn btn-primary">
                  Adicionar
                </button>
                <button type="button" className="btn btn-outline" onClick={() => setFormAberto(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </OverlayModal>
      )}

      {editId !== null && (
        <OverlayModal
          rotulo="Editar tipo de solicitação"
          largura="var(--modal-max-w-xl, 1120px)"
          onFechar={cancelarEdicao}
        >
          <div data-modal="cabecalho" className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Editar tipo de solicitação</h3>
              <p className="mt-1 text-xs text-[var(--c-muted)]">Ajuste a identificação, a disponibilidade e os campos exibidos na abertura.</p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={cancelarEdicao} disabled={saving}>
              Fechar
            </button>
          </div>

          <div className="space-y-4 px-4 py-3">
            {faixaAvisos}
            <FormSecao legenda="Identificação" colunas={2}>
              <CampoForm label="Nome do tipo" obrigatorio>
                <input
                  className="input w-full"
                  value={editNome}
                  onChange={e => setEditNome(e.target.value)}
                  required
                />
              </CampoForm>
              <CampoForm label="Código interno" hint="Usado por integrações e regras internas.">
                <input
                  className="input w-full"
                  value={editCodigoInterno}
                  onChange={e => setEditCodigoInterno(e.target.value.toUpperCase())}
                />
              </CampoForm>
            </FormSecao>

            <label className="flex items-start gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={editDisponivelParaObras}
                onChange={e => setEditDisponivelParaObras(e.target.checked)}
              />
              <span>
                <strong className="block text-[var(--c-text)]">Disponível para todas as Obras</strong>
                <span className="text-xs text-[var(--c-muted)]">Centros de Custo são configurados separadamente na página “Tipos por Obra/Centro de Custo”.</span>
              </span>
            </label>

            <BlocoConteudo titulo="Comportamento do tipo" variante="secundario">
              <CampoForm
                label="Finalidade da data"
                hint="Define se a abertura mostra Data de Resposta ou Data de Pagamento."
              >
                <select
                  className="select w-full"
                  value={editComportamento.finalidade_data_vencimento}
                  onChange={e => setEditComportamento(prev => ({
                    ...prev,
                    finalidade_data_vencimento: e.target.value
                  }))}
                >
                  <option value={FINALIDADES_DATA_SOLICITACAO.RESPOSTA}>Data de Resposta</option>
                  <option value={FINALIDADES_DATA_SOLICITACAO.PAGAMENTO}>Data de Pagamento</option>
                </select>
              </CampoForm>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {BEHAVIOR_FIELDS.map(field => (
                  <label key={field.key} className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(editComportamento[field.key])}
                      onChange={e => setEditComportamento(prev => ({ ...prev, [field.key]: e.target.checked }))}
                    />
                    <span>{field.label}</span>
                  </label>
                ))}
              </div>
              {editComportamento.usa_fluxo_despesa_eventual ? (
                <p className="app-note mt-3">
                  O fluxo de Despesa Eventual usa esses campos como padrão. A visibilidade e a obrigatoriedade podem ser ajustadas em “Campos da Nova Solicitação”. Para este fluxo, use a finalidade “Data de Pagamento”.
                </p>
              ) : null}
            </BlocoConteudo>

            <p className="app-note">
              Subtipos são cadastrados separadamente em “Cadastros &gt; Subtipos de Contrato” e vinculados a este tipo macro.
            </p>
          </div>

          <div data-modal="rodape" className="flex flex-wrap justify-end gap-2 border-t border-[var(--c-border)] px-4 py-3">
            <button type="button" className="btn btn-outline" onClick={cancelarEdicao} disabled={saving}>
              Cancelar
            </button>
            <button type="button" className="btn btn-primary" onClick={() => salvarEdicao(editId)} disabled={saving || !editNome.trim()}>
              {saving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </OverlayModal>
      )}

      <BlocoConteudo
        titulo="Cadastro geral de tipos"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={colunas}
          itens={tiposFiltrados}
          storageKey="tabela:tipos-solicitacao:v2"
          larguraAcoes={260}
          aoClicarLinha={iniciarEdicao}
          vazio={{
            title: 'Nenhum tipo cadastrado',
            message: 'Use "Novo tipo" para criar o primeiro registro.'
          }}
          acoesLinha={(t) => (
            <>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => iniciarEdicao(t)}>
                Editar
              </button>
              {t.ativo ? (
                <button type="button" className="btn btn-outline btn-sm btn-perigo-suave" onClick={() => toggle(t)}>
                  Desativar
                </button>
              ) : (
                <button type="button" className="btn btn-outline btn-sm" onClick={() => toggle(t)}>
                  Ativar
                </button>
              )}
              <span className="app-actionbar-apartada">
                <button
                  type="button"
                  className="btn btn-outline btn-sm btn-perigo-suave"
                  onClick={() => excluir(t)}
                  title="Excluir definitivamente este tipo"
                >
                  Excluir
                </button>
              </span>
            </>
          )}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
