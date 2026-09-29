import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  HiOutlineArrowDownTray,
  HiOutlineCheckCircle,
  HiOutlineDocumentArrowUp,
  HiOutlineExclamationCircle
} from 'react-icons/hi2';
import {
  BarraFiltros,
  BlocoConteudo,
  CelulaDupla,
  TabelaPadrao,
  alternarValorFiltro
} from '../../../components/padrao';
import {
  consultaIndisponivel,
  listarPlanosResumo,
  mensagemLegivel
} from '../services/custosRecebiveis';
import CrPlanoWorkspace from './CrPlanoWorkspace';
import CrStatusPill from './CrStatusPill';
import { formatarDataHora, normalizarBusca, rotuloObra } from './CrFormatos';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(date);
}

function PreviewSummary({ preview }) {
  if (!preview) return null;
  const summary = preview.summary || {};
  const hasErrors = Number(summary.linhas_rejeitadas || 0) > 0;
  return (
    <div className="cr-preview" data-status={hasErrors ? 'error' : 'success'}>
      <div className="cr-preview-heading">
        {hasErrors
          ? <HiOutlineExclamationCircle className="h-5 w-5" />
          : <HiOutlineCheckCircle className="h-5 w-5" />}
        <div>
          <strong>{hasErrors ? 'A planilha precisa de correções' : 'Validação concluída'}</strong>
          <span>
            {hasErrors
              ? 'Corrija as linhas rejeitadas e valide o arquivo novamente.'
              : 'O arquivo pode ser importado como uma nova versão em rascunho.'}
          </span>
        </div>
      </div>
      <div className="cr-preview-metrics">
        <div><span>Lidas</span><strong>{summary.linhas_total || 0}</strong></div>
        <div><span>Válidas</span><strong>{summary.linhas_validas || 0}</strong></div>
        <div><span>Rejeitadas</span><strong>{summary.linhas_rejeitadas || 0}</strong></div>
        <div>
          <span>Divergência</span>
          <strong>
            {summary.divergencia_macro_pct == null
              ? '-'
              : `${Number(summary.divergencia_macro_pct).toFixed(2)}%`}
          </strong>
        </div>
      </div>
      {preview.errors?.length ? (
        <div className="cr-validation-errors">
          <div className="cr-validation-errors-heading">Erros encontrados</div>
          {preview.errors.slice(0, 50).map((error, index) => (
            <div key={`${error.linha}-${error.campo}-${index}`}>
              <strong>Linha {error.linha}</strong>
              <span>{error.campo ? `${error.campo}: ` : ''}{error.mensagem}</span>
            </div>
          ))}
          {preview.errors.length > 50 ? (
            <div><span>Mais {preview.errors.length - 50} erro(s) não exibido(s).</span></div>
          ) : null}
        </div>
      ) : null}
      {preview.warnings?.length ? (
        <div className="cr-validation-warnings">
          <strong>{preview.warnings.length} aviso(s)</strong>
          <span>Itens sem vínculo macro podem ser importados, mas bloqueiam a publicação.</span>
        </div>
      ) : null}
    </div>
  );
}

const SITUACAO_PLANILHA = {
  SEM_PLANILHA: 'Sem planilha',
  PUBLICADA: 'Publicada',
  RASCUNHO: 'Rascunho a publicar'
};

const FILTRO_SITUACAO = Object.entries(SITUACAO_PLANILHA).map(([valor, rotulo]) => ({ valor, rotulo }));

// Sem a consulta geral (servidor antigo), a situação vem do cadastro da obra.
const SITUACAO_POR_ORCAMENTO = {
  ORCAMENTO_PUBLICADO: 'PUBLICADA',
  RASCUNHO: 'RASCUNHO'
};

function situacaoDoPlano(item) {
  if (item.rascunhos?.length) return 'RASCUNHO';
  if (item.vigente) return 'PUBLICADA';
  return 'SEM_PLANILHA';
}

/*
  Novo arquivo da obra aberta: validar e importar como rascunho, e o
  histórico de versões. Mesmo fluxo de antes, agora abaixo da planilha.
*/
function ImportacaoDaObra({
  obra,
  data,
  canImport,
  validating,
  importing,
  feedback,
  onDownloadModel,
  onValidate,
  onImport,
  onOpenPlan
}) {
  const fileRef = useRef(null);
  const [file, setFile] = useState(null);
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState(null);
  const hasPreviousPlan = (data?.planos || []).length > 0;
  const canConfirmImport = Boolean(
    preview
    && Number(preview.summary?.linhas_rejeitadas || 0) === 0
    && file
    && (!hasPreviousPlan || reason.trim())
  );

  const importsByPlan = useMemo(
    () => new Map((data?.importacoes || []).map((item) => [Number(item.plano_id), item])),
    [data?.importacoes]
  );

  useEffect(() => {
    setFile(null);
    setReason('');
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  }, [obra?.id]);

  async function handleValidate() {
    if (!file) return;
    const result = await onValidate(file);
    setPreview(result || null);
  }

  async function handleImport() {
    if (!canConfirmImport || importing) return;
    const result = await onImport(file, reason);
    if (result) {
      setPreview(null);
      setFile(null);
      setReason('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="cr-import-layout" id="cr-importar-arquivo">
      <section className="cr-section">
        <div className="cr-section-heading">
          <div>
            <h2>Nova importação</h2>
            <p className="cr-warning-text">
              Mantenha os códigos dos itens ao gerar nova versão: item com código novo recomeça
              do zero a medição já aprovada.
            </p>
          </div>
          {canImport ? (
            <button type="button" className="btn btn-outline" onClick={onDownloadModel}>
              <HiOutlineArrowDownTray className="h-4 w-4" />
              Baixar modelo
            </button>
          ) : null}
        </div>

        {!canImport ? (
          <div className="cr-feedback" data-tone="warning">
            Acesso somente leitura: sem permissão para importar planilhas.
          </div>
        ) : (
          <div className="cr-import-form">
            <label className="cr-field cr-file-field">
              <span>Arquivo .xlsx</span>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(event) => {
                  setFile(event.target.files?.[0] || null);
                  setPreview(null);
                }}
              />
              <small>{file ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Limite de 10 MB'}</small>
            </label>
            <label className="cr-field">
              <span>
                Motivo da versão
                {hasPreviousPlan ? ' *' : ''}
              </span>
              <textarea
                rows="3"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder={hasPreviousPlan
                  ? 'Por que uma nova versão está sendo criada'
                  : 'Opcional na primeira importação'}
              />
            </label>
            <div className="cr-import-actions">
              <button
                type="button"
                className="btn btn-outline"
                disabled={!file || validating || importing}
                onClick={handleValidate}
              >
                {validating ? 'Validando...' : 'Validar arquivo'}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canConfirmImport || validating || importing}
                onClick={handleImport}
              >
                <HiOutlineDocumentArrowUp className="h-4 w-4" />
                {importing ? 'Importando...' : 'Importar como rascunho'}
              </button>
            </div>
          </div>
        )}

        {feedback ? (
          <div className="cr-feedback mt-4" data-tone={feedback.tone || 'info'}>
            {feedback.message}
          </div>
        ) : null}
        <PreviewSummary preview={preview} />
      </section>

      <section className="cr-section">
        <div className="cr-section-heading">
          <div>
            <h2>Histórico de versões</h2>
          </div>
        </div>
        <TabelaPadrao
          colunas={[
            {
              id: 'versao',
              titulo: 'Versão',
              // R17: a versão importada NOMEIA a linha do histórico.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (plan) => <strong>v{plan.versao}</strong>
            },
            {
              id: 'arquivo',
              titulo: 'Arquivo',
              tipo: 'texto',
              render: (plan) => importsByPlan.get(Number(plan.id))?.arquivo_nome || '-'
            },
            {
              id: 'usuario',
              titulo: 'Importado por',
              tipo: 'texto',
              render: (plan) => importsByPlan.get(Number(plan.id))?.usuario?.nome || '-'
            },
            {
              id: 'data',
              titulo: 'Data',
              tipo: 'data',
              render: (plan) => formatDate(importsByPlan.get(Number(plan.id))?.createdAt || plan.createdAt)
            },
            {
              id: 'linhas',
              titulo: 'Linhas',
              tipo: 'numero',
              render: (plan) => {
                const importInfo = importsByPlan.get(Number(plan.id));
                return importInfo ? `${importInfo.linhas_validas}/${importInfo.linhas_total}` : '-';
              }
            },
            {
              id: 'situacao',
              titulo: 'Situação',
              tipo: 'badge',
              render: (plan) => <CrStatusPill status={plan.situacao} />
            }
          ]}
          itens={data?.planos || []}
          getId={(plan) => plan.id}
          storageKey="tabela:custos-recebiveis-importacoes:historico"
          rotuloRolagem="Histórico de versões"
          vazio="Nenhuma versão importada para esta obra."
          acoesLinha={(plan) => (
            <button type="button" className="btn btn-outline" onClick={() => onOpenPlan(plan.id)}>
              Abrir
            </button>
          )}
          larguraAcoes={140}
        />
      </section>
    </div>
  );
}

/*
  Importações (Fase 4): a lista de todas as obras com a situação da planilha
  abre sem escolher obra. "Abrir" traz, logo abaixo, a planilha da obra
  (versões e "Publicar versão", que antes só existiam na tela de Obras) e a
  importação de um novo arquivo.
*/
export default function CrImportacoesView({
  obras = [],
  obra,
  versao = 0,
  data,
  planLoading,
  planError,
  canImport,
  canPublish,
  validating,
  importing,
  publishing,
  feedback,
  onSelectObra,
  onSelectPlan,
  onReloadPlan,
  onDownloadModel,
  onValidate,
  onImport,
  onPublish
}) {
  const [planos, setPlanos] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [ativos, setAtivos] = useState({});

  const load = useCallback(async () => {
    try {
      setCarregando(true);
      setErro('');
      const response = await listarPlanosResumo();
      setPlanos(Array.isArray(response?.items) ? response.items : []);
    } catch (error) {
      setPlanos(null);
      // Sem a consulta geral a lista continua pelas obras do escopo.
      if (!consultaIndisponivel(error)) {
        setErro(mensagemLegivel(error, 'Não foi possível carregar as planilhas das obras.'));
      }
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load, versao]);

  const linhas = useMemo(() => {
    const fonte = Array.isArray(planos)
      ? planos.map((item) => ({ ...item, situacao: situacaoDoPlano(item), resumo: true }))
      : obras.map((item) => ({
        obra: item,
        vigente: null,
        rascunhos: [],
        situacao: SITUACAO_POR_ORCAMENTO[String(item.situacao_orcamento || '').toUpperCase()] || 'SEM_PLANILHA',
        resumo: false
      }));
    const termo = normalizarBusca(busca);
    const situacoes = ativos.situacao || new Set();
    return fonte.filter((item) => (
      (!termo || normalizarBusca(`${item.obra?.codigo} ${item.obra?.nome}`).includes(termo))
      && (!situacoes.size || situacoes.has(item.situacao))
    ));
  }, [planos, obras, busca, ativos]);

  const pendentes = linhas.filter((item) => item.situacao === 'RASCUNHO').length;

  function abrir(obraId) {
    onSelectObra(obraId);
    requestAnimationFrame(() => {
      document.getElementById('cr-workspace-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function irParaImportacao() {
    document.getElementById('cr-importar-arquivo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <BlocoConteudo
        titulo="Importações"
        contagem={`${linhas.length} obra(s) · ${pendentes} com rascunho`}
      >
        <BarraFiltros
          busca={{ valor: busca, aoMudar: setBusca, placeholder: 'Nome ou código da obra' }}
          filtros={[{ id: 'situacao', rotulo: 'Situação', opcoes: FILTRO_SITUACAO }]}
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
              id: 'situacao',
              titulo: 'Situação',
              tipo: 'status',
              render: (item) => (
                <span
                  className="cr-status-pill"
                  data-status={item.situacao === 'SEM_PLANILHA' ? 'NEUTRO' : item.situacao}
                >
                  {SITUACAO_PLANILHA[item.situacao]}
                </span>
              )
            },
            {
              id: 'vigente',
              titulo: 'Versão vigente',
              tipo: 'texto',
              render: (item) => (item.vigente ? (
                <CelulaDupla
                  principal={`v${item.vigente.versao} · ${item.vigente.total_itens} item(ns)`}
                  sub={`publicada ${formatarDataHora(item.vigente.publicado_em)}`}
                />
              ) : '—')
            },
            {
              id: 'rascunhos',
              titulo: 'Rascunhos',
              tipo: 'texto',
              render: (item) => (item.rascunhos?.length
                ? item.rascunhos.map((rascunho) => `v${rascunho.versao}`).join(', ')
                : '—')
            },
            {
              id: 'importacao',
              titulo: 'Última importação',
              tipo: 'texto',
              render: (item) => (item.resumo ? formatarDataHora(item.ultima_importacao_em) : '—')
            }
          ]}
          itens={linhas}
          getId={(item) => item.obra?.id}
          storageKey="tabela:custos-recebiveis-importacoes:obras"
          rotuloRolagem="Planilhas das obras"
          carregando={carregando}
          vazio={erro ? 'Não foi possível carregar a lista.' : 'Nenhuma obra encontrada.'}
          acoesLinha={(item) => (Number(item.obra?.id) === Number(obra?.id) ? (
            <button type="button" className="btn btn-outline" onClick={() => onSelectObra(null)}>
              Fechar
            </button>
          ) : (
            <button type="button" className="btn btn-outline" onClick={() => abrir(item.obra?.id)}>
              Abrir
            </button>
          ))}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {obra?.id ? (
        <div id="cr-workspace-anchor" className="cr-arquivos-obra">
          <CrPlanoWorkspace
            data={data}
            loading={planLoading}
            error={planError}
            canImport={canImport}
            canPublish={canPublish}
            publishing={publishing}
            onReload={onReloadPlan}
            onSelectPlan={onSelectPlan}
            onOpenImport={irParaImportacao}
            onDownloadModel={onDownloadModel}
            onPublish={onPublish}
            onClose={() => onSelectObra(null)}
          />
          <ImportacaoDaObra
            obra={obra}
            data={data}
            canImport={canImport}
            validating={validating}
            importing={importing}
            feedback={feedback}
            onDownloadModel={onDownloadModel}
            onValidate={onValidate}
            onImport={onImport}
            onOpenPlan={(planId) => {
              onSelectPlan(planId);
              document.getElementById('cr-workspace-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          />
        </div>
      ) : null}
    </>
  );
}
