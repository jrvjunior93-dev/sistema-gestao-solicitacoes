import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  Avisos,
  useAvisos
} from '../components/padrao';
import { TEMA_PADRAO, useTheme } from '../contexts/ThemeContext';
import { getSetores } from '../services/setores';
import { getStatusSetor } from '../services/statusSetor';

const STATUS_PADRAO = [
  'PENDENTE',
  'EM_ANALISE',
  'AGUARDANDO_AJUSTE',
  'TITULO_CADASTRADO',
  'PARCIALMENTE PAGO',
  'APROVADA',
  'PAGA',
  'REJEITADA',
  'CONCLUIDA'
];

const PALETA_GERAL = [
  ['palette.bg', 'Fundo do sistema'],
  ['palette.surface', 'Superficie principal'],
  ['palette.border', 'Bordas gerais'],
  ['palette.text', 'Texto principal'],
  ['palette.muted', 'Texto secundario'],
  ['palette.primary', 'Cor primaria'],
  ['palette.primary600', 'Cor primaria hover'],
  ['palette.secondary', 'Cor secundaria'],
  ['palette.warning', 'Alerta'],
  ['palette.danger', 'Critico'],
  ['palette.success', 'Sucesso']
];

const BOTOES = [
  ['buttons.primaryBg', 'Botao principal'],
  ['buttons.primaryHover', 'Botao principal hover'],
  ['buttons.primaryText', 'Texto do botao principal'],
  ['buttons.secondaryBg', 'Botao secundario'],
  ['buttons.secondaryHover', 'Botao secundario hover'],
  ['buttons.secondaryText', 'Texto do botao secundario'],
  ['buttons.secondaryBorder', 'Borda do botao secundario'],
  ['buttons.outlineBg', 'Botao contornado'],
  ['buttons.outlineHover', 'Botao contornado hover'],
  ['buttons.outlineText', 'Texto do botao contornado'],
  ['buttons.outlineBorder', 'Borda do botao contornado'],
  ['buttons.ghostText', 'Texto do botao discreto'],
  ['buttons.ghostHoverBg', 'Fundo hover do botao discreto'],
  ['buttons.successBg', 'Botao de sucesso'],
  ['buttons.dangerBg', 'Botao destrutivo'],
  ['buttons.warningBg', 'Botao de alerta']
];

const CARDS = [
  ['cards.bg', 'Fundo de card'],
  ['cards.softBg', 'Fundo suave'],
  ['cards.border', 'Borda de card'],
  ['cards.text', 'Texto de card'],
  ['cards.muted', 'Texto auxiliar de card'],
  ['cards.summaryBg', 'Fundo de indicador'],
  ['cards.summaryBorder', 'Borda de indicador'],
  ['cards.summaryLabel', 'Rotulo de indicador'],
  ['cards.summaryValue', 'Numero de indicador'],
  ['cards.summarySubvalue', 'Texto auxiliar de indicador']
];

const TEXTOS = [
  ['text.heading', 'Titulos'],
  ['text.body', 'Texto de corpo'],
  ['text.muted', 'Texto secundario'],
  ['text.subtle', 'Texto discreto'],
  ['text.link', 'Links'],
  ['text.inverse', 'Texto sobre fundo forte']
];

const NUMEROS = [
  ['numbers.default', 'Numero padrao'],
  ['numbers.positive', 'Numero positivo'],
  ['numbers.negative', 'Numero negativo'],
  ['numbers.warning', 'Numero de alerta'],
  ['numbers.info', 'Numero informativo'],
  ['numbers.muted', 'Numero secundario']
];

const MODULOS = [
  ['moduleAccents.solicitacoes', 'Solicitacoes'],
  ['moduleAccents.compras', 'Compras'],
  ['moduleAccents.financeiro', 'Financeiro'],
  ['moduleAccents.rhdp', 'RH/DP'],
  ['moduleAccents.sst', 'SST'],
  ['moduleAccents.fiscal', 'Fiscal'],
  ['moduleAccents.comercial', 'Comercial'],
  ['moduleAccents.contratos', 'Contratos'],
  ['moduleAccents.crm', 'CRM']
];

const STATUS_BADGES = [
  ['statusBadges.pending.bg', 'Pendente - fundo'],
  ['statusBadges.pending.text', 'Pendente - texto'],
  ['statusBadges.pending.border', 'Pendente - borda'],
  ['statusBadges.approved.bg', 'Aprovado - fundo'],
  ['statusBadges.approved.text', 'Aprovado - texto'],
  ['statusBadges.approved.border', 'Aprovado - borda'],
  ['statusBadges.rejected.bg', 'Rejeitado - fundo'],
  ['statusBadges.rejected.text', 'Rejeitado - texto'],
  ['statusBadges.rejected.border', 'Rejeitado - borda'],
  ['statusBadges.paid.bg', 'Pago - fundo'],
  ['statusBadges.paid.text', 'Pago - texto'],
  ['statusBadges.paid.border', 'Pago - borda'],
  ['statusBadges.overdue.bg', 'Vencido - fundo'],
  ['statusBadges.overdue.text', 'Vencido - texto'],
  ['statusBadges.overdue.border', 'Vencido - borda'],
  ['statusBadges.analysis.bg', 'Analise - fundo'],
  ['statusBadges.analysis.text', 'Analise - texto'],
  ['statusBadges.analysis.border', 'Analise - borda'],
  ['statusBadges.archived.bg', 'Arquivado - fundo'],
  ['statusBadges.archived.text', 'Arquivado - texto'],
  ['statusBadges.archived.border', 'Arquivado - borda'],
  ['statusBadges.intercompany.bg', 'Entre Empresas - fundo'],
  ['statusBadges.intercompany.text', 'Entre Empresas - texto'],
  ['statusBadges.intercompany.border', 'Entre Empresas - borda'],
  ['statusBadges.dreYes.bg', 'DRE sim - fundo'],
  ['statusBadges.dreYes.text', 'DRE sim - texto'],
  ['statusBadges.dreYes.border', 'DRE sim - borda'],
  ['statusBadges.dreNo.bg', 'DRE nao - fundo'],
  ['statusBadges.dreNo.text', 'DRE nao - texto'],
  ['statusBadges.dreNo.border', 'DRE nao - borda']
];

const ACOES_SOLICITACOES = [
  ['actions.ver', 'Ver'],
  ['actions.assumir', 'Assumir'],
  ['actions.atribuir', 'Atribuir'],
  ['actions.enviar', 'Enviar'],
  ['actions.ocultar', 'Ocultar']
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

function setByPath(obj, path, value) {
  const keys = path.split('.');
  const output = clone(obj || {});
  let cursor = output;
  keys.forEach((key, index) => {
    if (index === keys.length - 1) {
      cursor[key] = value;
      return;
    }
    cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? cursor[key] : {};
    cursor = cursor[key];
  });
  return output;
}

/*
  R25 — o que é DADO e o que é ESTILO nesta tela (04/09).

  Esta tela EDITA as cores do sistema: o hexadecimal que aparece no campo,
  no seletor `<input type="color">` e no quadrado de amostra é o VALOR do
  registro, não a cor da tela. Esse continua sendo hexadecimal, porque é
  isso que o usuário está editando.

  O que saiu foram os hexadecimais que a TELA escrevia por conta própria
  como valor padrão (`'#ffffff'`, `'#9ca3af'`). Valor padrão de cor também
  é dado — e o dono do dado é o `TEMA_PADRAO`, a mesma fonte que o resto do
  sistema usa. Escrever o número aqui criava uma segunda fonte de verdade
  que ninguém atualizaria junto.
*/
function corValida(value, fallback = TEMA_PADRAO.palette.surface) {
  const normalized = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(normalized) ? normalized : fallback;
}

function montarPreviewVars(draft) {
  const status = draft?.statusBadges || {};
  return {
    '--btn-primary-bg': corValida(draft?.buttons?.primaryBg, TEMA_PADRAO.buttons.primaryBg),
    '--btn-primary-hover': corValida(draft?.buttons?.primaryHover, TEMA_PADRAO.buttons.primaryHover),
    '--btn-primary-text': corValida(draft?.buttons?.primaryText, TEMA_PADRAO.buttons.primaryText),
    '--btn-secondary-bg': corValida(draft?.buttons?.secondaryBg, TEMA_PADRAO.buttons.secondaryBg),
    '--btn-secondary-text': corValida(draft?.buttons?.secondaryText, TEMA_PADRAO.buttons.secondaryText),
    '--btn-outline-bg': corValida(draft?.buttons?.outlineBg, TEMA_PADRAO.buttons.outlineBg),
    '--btn-outline-text': corValida(draft?.buttons?.outlineText, TEMA_PADRAO.buttons.outlineText),
    '--btn-success-bg': corValida(draft?.buttons?.successBg, TEMA_PADRAO.buttons.successBg),
    '--btn-success-text': corValida(draft?.buttons?.successText, TEMA_PADRAO.buttons.successText),
    '--btn-danger-bg': corValida(draft?.buttons?.dangerBg, TEMA_PADRAO.buttons.dangerBg),
    '--btn-danger-text': corValida(draft?.buttons?.dangerText, TEMA_PADRAO.buttons.dangerText),
    '--card-bg': corValida(draft?.cards?.bg, TEMA_PADRAO.cards.bg),
    '--card-soft-bg': corValida(draft?.cards?.softBg, TEMA_PADRAO.cards.softBg),
    '--card-border': corValida(draft?.cards?.border, TEMA_PADRAO.cards.border),
    '--app-summary-bg': corValida(draft?.cards?.summaryBg, TEMA_PADRAO.cards.summaryBg),
    '--app-summary-border': corValida(draft?.cards?.summaryBorder, TEMA_PADRAO.cards.summaryBorder),
    '--app-summary-label': corValida(draft?.cards?.summaryLabel, TEMA_PADRAO.cards.summaryLabel),
    '--app-summary-value': corValida(draft?.cards?.summaryValue, TEMA_PADRAO.cards.summaryValue),
    '--app-summary-subvalue': corValida(draft?.cards?.summarySubvalue, TEMA_PADRAO.cards.summarySubvalue),
    '--status-pending-bg': corValida(status.pending?.bg, TEMA_PADRAO.statusBadges.pending.bg),
    '--status-pending-text': corValida(status.pending?.text, TEMA_PADRAO.statusBadges.pending.text),
    '--status-pending-border': corValida(status.pending?.border, TEMA_PADRAO.statusBadges.pending.border),
    '--status-approved-bg': corValida(status.approved?.bg, TEMA_PADRAO.statusBadges.approved.bg),
    '--status-approved-text': corValida(status.approved?.text, TEMA_PADRAO.statusBadges.approved.text),
    '--status-approved-border': corValida(status.approved?.border, TEMA_PADRAO.statusBadges.approved.border),
    '--status-rejected-bg': corValida(status.rejected?.bg, TEMA_PADRAO.statusBadges.rejected.bg),
    '--status-rejected-text': corValida(status.rejected?.text, TEMA_PADRAO.statusBadges.rejected.text),
    '--status-rejected-border': corValida(status.rejected?.border, TEMA_PADRAO.statusBadges.rejected.border),
    '--status-paid-bg': corValida(status.paid?.bg, TEMA_PADRAO.statusBadges.paid.bg),
    '--status-paid-text': corValida(status.paid?.text, TEMA_PADRAO.statusBadges.paid.text),
    '--status-paid-border': corValida(status.paid?.border, TEMA_PADRAO.statusBadges.paid.border),
    '--status-overdue-bg': corValida(status.overdue?.bg, TEMA_PADRAO.statusBadges.overdue.bg),
    '--status-overdue-text': corValida(status.overdue?.text, TEMA_PADRAO.statusBadges.overdue.text),
    '--status-overdue-border': corValida(status.overdue?.border, TEMA_PADRAO.statusBadges.overdue.border),
    '--status-intercompany-bg': corValida(status.intercompany?.bg, TEMA_PADRAO.statusBadges.intercompany.bg),
    '--status-intercompany-text': corValida(status.intercompany?.text, TEMA_PADRAO.statusBadges.intercompany.text),
    '--status-intercompany-border': corValida(status.intercompany?.border, TEMA_PADRAO.statusBadges.intercompany.border)
  };
}

function ColorField({ label, path, value, fallback, onChange }) {
  const safeValue = corValida(value, fallback);
  const fieldLabel = path ? `${label} (${path})` : label;
  return (
    <label className="block rounded-xl border border-[var(--c-border)] bg-[var(--c-bg)] px-3 py-3 text-sm">
      <span className="block min-w-0">
        <span className="block text-sm font-semibold text-[var(--c-text)]">{label}</span>
        {path && (
          <span className="mt-1 block break-all font-mono text-xs text-[var(--c-muted)]">
            {path}
          </span>
        )}
      </span>
      <span className="mt-3 flex items-center gap-3">
        <span
          className="h-8 w-8 shrink-0 rounded-lg border border-[var(--c-border)] shadow-sm"
          style={{ background: safeValue }}
          aria-hidden="true"
        />
        <input
          className="min-w-0 flex-1 rounded-md border border-[var(--c-border)] bg-[var(--c-surface)] px-2 py-2 text-xs font-mono text-[var(--c-text)]"
          value={String(value || '')}
          onChange={(event) => onChange(event.target.value)}
          maxLength={7}
          aria-label={fieldLabel}
          title={fieldLabel}
        />
        {/*
          X3 (medido no preview, 390px): o seletor de cor ia até 435px numa
          janela de 390 e o transbordo era RECORTADO por `overflow-x: clip` —
          o campo sumia SEM deixar rolagem, e ninguém chegava nele.

          A causa NÃO é a grade da seção (em 390px ela já é de uma coluna só,
          e nenhum ancestral estourava — por isso o harness não nomeou
          ancestral nenhum na cadeia). A causa é de ESPECIFICIDADE: o
          `index.css` declara

            .layout-shell input:where(:not([type="checkbox"])…) { width: 100% }

          com especificidade (0,1,1), que VENCE o `.w-12` do Tailwind (0,1,0)
          — as utilitárias entram no topo do arquivo, em `@tailwind
          utilities`, e tudo que vem depois com peso igual ou maior ganha.
          Com `width: 100%` o campo passava a valer a linha inteira e, como
          ele tinha `shrink-0`, não podia encolher: os 48px do seletor eram
          empurrados para fora do bloco.

          A prova de que é isto: as telas irmãs que usam o MESMO `w-12 h-8`
          (`ConfiguracoesStatusPedidoCompra`, `ConfiguracoesContratoAlertasEFormas`)
          passam no X3 — o seletor delas não tem `shrink-0` e encolhe.

          Conserto sem medida à mão (R10) e sem `overflow-x: auto`: a medida
          sai do input e vai para um invólucro `w-12` — degrau da escala, e
          `span` não é alcançado pela regra do sistema. O `width: 100%`
          herdado passa a resolver DENTRO dele: 48px, e não a linha inteira.
          A linha volta a caber (32 + 12 + campo + 12 + 48) e o campo de
          texto, com `flex-1 min-w-0`, absorve a sobra.
        */}
        <span className="block w-12 shrink-0">
          <input
            type="color"
            value={safeValue}
            onChange={(event) => onChange(event.target.value)}
            className="h-8 w-full cursor-pointer rounded-lg border border-[var(--c-border)] bg-transparent p-1"
            aria-label={`Selecionar cor de ${fieldLabel}`}
            title={`Selecionar cor de ${fieldLabel}`}
          />
        </span>
      </span>
    </label>
  );
}

// B5/R10: cada seção é um BlocoConteudo — o título de bloco (18px) e o
// texto de apoio vêm do componente, e não de um h2 com medida escrita à mão
// (era `text-base`, 16px, fora da escala).
function ColorSection({ title, description, fields, draft, onChange, columns = 'lg:grid-cols-2' }) {
  return (
    <BlocoConteudo titulo={title} descricao={description}>
      <div className={`grid gap-3 md:grid-cols-2 ${columns}`}>
        {fields.map(([path, label]) => (
          <ColorField
            key={path}
            label={label}
            path={path}
            value={getByPath(draft, path)}
            // Sem valor no tema padrão, o piso é o do `corValida` — nenhum
            // hexadecimal escrito na tela.
            fallback={getByPath(TEMA_PADRAO, path)}
            onChange={(value) => onChange(path, value)}
          />
        ))}
      </div>
    </BlocoConteudo>
  );
}

export default function CoresSistema() {
  const { tema, atualizarTema } = useTheme();
  const [draft, setDraft] = useState(null);
  const [setores, setSetores] = useState([]);
  const [setorSelecionado, setSetorSelecionado] = useState('');
  const [statusSetor, setStatusSetor] = useState([]);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: as duas chamadas de alert() desta tela viram faixa do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    carregarSetores();
  }, []);

  useEffect(() => {
    if (tema) {
      setDraft(clone(tema));
    }
  }, [tema]);

  useEffect(() => {
    carregarStatus();
  }, [setorSelecionado]);

  useEffect(() => {
    if (setores.length === 0 || !draft) return;

    const savedKey = localStorage.getItem('cores_setor_selecionado');
    const normalizedSaved = savedKey ? String(savedKey).toUpperCase() : '';
    const setoresKeys = setores.map(s => String(s.codigo || s.nome || '').toUpperCase());

    if (setorSelecionado && setoresKeys.includes(String(setorSelecionado).toUpperCase())) return;

    if (normalizedSaved && setoresKeys.includes(normalizedSaved)) {
      const original = setores.find(s =>
        String(s.codigo || s.nome || '').toUpperCase() === normalizedSaved
      );
      setSetorSelecionado(String(original?.codigo || original?.nome || ''));
      return;
    }

    const setoresComCor = Object.keys(draft?.status?.setores || {});
    const encontrado = setores.find(s =>
      setoresComCor.includes(String(s.codigo || s.nome || '').toUpperCase())
    );
    setSetorSelecionado(String(encontrado?.codigo || encontrado?.nome || setores[0]?.codigo || setores[0]?.nome || ''));
  }, [setores, draft, setorSelecionado]);

  async function carregarSetores() {
    try {
      const data = await getSetores();
      setSetores(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
    }
  }

  async function carregarStatus() {
    try {
      if (!setorSelecionado) return;
      const data = await getStatusSetor({ setor: setorSelecionado });
      setStatusSetor((Array.isArray(data) ? data : []).map(s => s.nome).filter(Boolean));
    } catch (error) {
      console.error(error);
      setStatusSetor([]);
    }
  }

  const statusParaSetor = useMemo(() => {
    return Array.from(new Set(statusSetor.map(s => String(s).toUpperCase())));
  }, [statusSetor]);

  function atualizarCampo(path, value) {
    setDraft(prev => setByPath(prev, path, value));
  }

  function atualizarCorStatusGlobal(status, cor) {
    atualizarCampo(`status.global.${status}`, cor);
  }

  function atualizarCorStatusSetor(status, cor) {
    const setorKey = String(setorSelecionado || '').toUpperCase();
    atualizarCampo(`status.setores.${setorKey}.${status}`, cor);
  }

  function selecionarSetor(valor) {
    setSetorSelecionado(valor);
    localStorage.setItem('cores_setor_selecionado', String(valor || '').toUpperCase());
  }

  async function salvar() {
    if (!draft) return;
    try {
      setSalvando(true);
      await atualizarTema(draft);
      avisar.sucesso('Cores atualizadas.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar cores.');
    } finally {
      setSalvando(false);
    }
  }

  // C5/B3: UMA ação de salvar, no cabeçalho. Havia dois botões
  // `btn btn-primary` idênticos ("Salvar cores") na mesma tela — um no topo
  // e outro no fim da página. O do fim existia porque a página é longa; com
  // a faixa fixa (R13) o botão do cabeçalho acompanha a rolagem e continua
  // a um clique de distância, então o segundo virou duplicata.
  const acoesDoCabecalho = {
    acaoPrincipal: {
      rotulo: salvando ? 'Salvando...' : 'Salvar cores',
      onClick: salvar,
      desabilitada: salvando
    },
    secundarias: [{
      rotulo: 'Restaurar padrão',
      onClick: () => setDraft(clone(TEMA_PADRAO))
    }]
  };

  // B5: o carregamento acontece DENTRO da estrutura padrão — antes a tela
  // devolvia `<p>Carregando cores...</p>` cru, sem página, sem cabeçalho e
  // sem superfície.
  if (!draft) {
    return (
      <Pagina className="max-w-7xl">
        <PageHeader
          titulo="Cores do Sistema"
          descricao="Configure a identidade visual usada por botoes, cards, status, textos, números e acentos dos módulos."
        />
        <BlocoConteudo titulo="Carregando cores">
          <p className="app-note">Buscando o tema atual do sistema...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina className="max-w-7xl">
      {/* C1/C2/R5/R13: título, apoio e ações na faixa fixa do topo — o
          cabeçalho montado à mão (h1 + p.page-subtitle + dois botões soltos)
          não grudava na rolagem nem tinha superfície própria. */}
      <PageHeader
        titulo="Cores do Sistema"
        descricao="Configure a identidade visual usada por botoes, cards, status, textos, números e acentos dos módulos."
        {...acoesDoCabecalho}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B2: este é o bloco principal — é ele que responde a pergunta da
          tela ("como fica o sistema com estas cores?"). O `style` carrega as
          variáveis do rascunho, então a prévia mostra o valor em edição. */}
      <BlocoConteudo
        titulo="Prévia operacional"
        descricao="Use esta área para validar contraste antes de salvar."
        variante="primario"
        // A barra de cor vai DENTRO do mesmo `style`: o BlocoConteudo monta
        // `--bloco-cor` a partir da prop `cor` e depois espalha `...props`,
        // então um `style` próprio substituiria o dele e a barra sumiria.
        style={{ ...montarPreviewVars(draft), '--bloco-cor': 'var(--c-primary)' }}
      >
        <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-4">
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-primary">Principal</button>
              <button type="button" className="btn btn-secondary">Secundario</button>
              <button type="button" className="btn btn-outline">Contornado</button>
              <button type="button" className="btn btn-success">Sucesso</button>
              <button type="button" className="btn btn-danger">Crítico</button>
            </div>
            <div className="app-summary-grid app-summary-grid--compact mt-4">
              <div className="app-summary-card">
                <div className="app-summary-label">Saldo</div>
                <div className="app-summary-value">R$ 128.450,00</div>
                <div className="app-summary-subvalue">Número padrão</div>
              </div>
              <div className="app-summary-card">
                <div className="app-summary-label">Executado</div>
                <div className="app-summary-value" style={{ color: draft.numbers?.positive }}>82%</div>
                <div className="app-summary-subvalue">Número positivo</div>
              </div>
              <div className="app-summary-card">
                <div className="app-summary-label">Risco</div>
                <div className="app-summary-value" style={{ color: draft.numbers?.negative }}>12</div>
                <div className="app-summary-subvalue">Número crítico</div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap content-start gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--card-soft-bg)] p-4">
            <span className="badge-status badge-status--pending"><span className="badge-status__dot" />Pendente</span>
            <span className="badge-status badge-status--approved"><span className="badge-status__dot" />Aprovado</span>
            <span className="badge-status badge-status--rejected"><span className="badge-status__dot" />Rejeitado</span>
            <span className="badge-status badge-status--paid"><span className="badge-status__dot" />Pago</span>
            <span className="badge-status badge-status--overdue"><span className="badge-status__dot" />Vencido</span>
            <span className="badge-status badge-status--intercompany"><span className="badge-status__dot" />Entre Empresas</span>
          </div>
        </div>
      </BlocoConteudo>

      <ColorSection title="Paleta geral" description="Base visual usada em telas, fundos, bordas e estados principais." fields={PALETA_GERAL} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Botoes" description="Controla botoes principais, secundarios, contornados, discretos e estados operacionais." fields={BOTOES} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Cards e indicadores" description="Define superficies, cards de dashboards e cards de numeros dos relatorios." fields={CARDS} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Textos" description="Ajusta titulos, texto comum, links e textos auxiliares." fields={TEXTOS} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Números e métricas" description="Cores usadas em valores, percentuais, KPIs e indicadores financeiros." fields={NUMEROS} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Acentos por módulo" description="Cores institucionais para distinguir modulos sem alterar regras de negocio." fields={MODULOS} draft={draft} onChange={atualizarCampo} />
      <ColorSection title="Badges e status visuais" description="Cores dos marcadores usados em financeiro, DRE, pagamentos, auditoria e demais listas." fields={STATUS_BADGES} draft={draft} onChange={atualizarCampo} columns="lg:grid-cols-3" />
      <ColorSection title="Ações de solicitações" description="Mantem compatibilidade com as cores especificas dos botoes de acao das solicitacoes." fields={ACOES_SOLICITACOES} draft={draft} onChange={atualizarCampo} />

      <BlocoConteudo
        titulo="Status geral das solicitações"
        descricao="Cores usadas quando um status não possui configuração especifica por setor."
      >
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {STATUS_PADRAO.map(status => (
            <ColorField
              key={status}
              label={status}
              path={`status.global.${status}`}
              value={draft.status?.global?.[status]}
              // Status sem cor no tema padrão cai no tom neutro do próprio
              // tema padrão (era o hexadecimal '#9ca3af' escrito na tela).
              fallback={TEMA_PADRAO.status.global[status] || TEMA_PADRAO.palette.muted}
              onChange={(value) => atualizarCorStatusGlobal(status, value)}
            />
          ))}
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Status por setor"
        descricao="Ajuste fino para status específicos de cada área operacional."
      >
        {/* R12: seletor de CONTEXTO (de qual setor são os status editados
            abaixo), não filtro de lista — continua sendo select. */}
        <label className="block max-w-md text-sm font-medium text-[var(--c-text)]">
          Setor
          <select
            className="input mt-1"
            value={setorSelecionado}
            onChange={e => selecionarSetor(e.target.value)}
          >
            {setores.map(s => (
              <option key={s.id} value={s.codigo || s.nome}>
                {s.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {statusParaSetor.length === 0 && (
            <p className="text-sm text-[var(--c-muted)]">
              Nenhum status cadastrado para este setor.
            </p>
          )}
          {statusParaSetor.map(status => (
            <ColorField
              key={status}
              label={status}
              path={`status.setores.${String(setorSelecionado || '').toUpperCase()}.${status}`}
              value={
                draft.status?.setores?.[String(setorSelecionado || '').toUpperCase()]?.[status] ||
                draft.status?.global?.[status]
              }
              // Mesmo critério do status geral: o piso neutro vem do tema
              // padrão, não de um hexadecimal escrito aqui.
              fallback={draft.status?.global?.[status] || TEMA_PADRAO.palette.muted}
              onChange={(value) => atualizarCorStatusSetor(status, value)}
            />
          ))}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
