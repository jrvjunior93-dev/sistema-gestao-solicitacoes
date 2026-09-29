/*
  Avisos de prazo do ciclo mensal. O servidor calcula (`obra.prazos`, ver
  backend/src/modules/custosRecebiveis/services/prazoService.js); aqui só se
  traduz o resultado em texto e tom. Prazo "perto" = 3 dias ou menos, o mesmo
  limiar D-3 dos alertas de obrigação.
*/
const PRAZO_PROXIMO_DIAS = 3;

const dayMonth = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'America/Sao_Paulo'
});

export function monthLabel(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || '—';
  const [year, month] = String(value).split('-').map(Number);
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

// "set/2026": competência em coluna estreita de tabela.
export function monthShort(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ''))) return value || '—';
  const [year, month] = String(value).split('-').map(Number);
  const name = new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
    .replace('.', '');
  return `${name}/${year}`;
}

function shortDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : dayMonth.format(date);
}

function days(value) {
  const count = Number(value) || 0;
  return count === 1 ? '1 dia' : `${count} dias`;
}

function extraPending(item) {
  const extra = Number(item?.pendentes || 0) - 1;
  return extra > 0 ? ` · +${extra} ${extra === 1 ? 'mês pendente' : 'meses pendentes'}` : '';
}

function openText(item, noun) {
  const until = shortDate(item.prazo_em);
  if (Number(item.dias) <= 0) return `${noun} vence hoje${until ? ` (${until})` : ''}`;
  return `faltam ${days(item.dias)}${until ? ` · até ${until}` : ''}`;
}

export function avisoPlanejamento(prazos) {
  const item = prazos?.planejamento;
  if (!item) return null;
  const month = monthLabel(item.competencia);
  if (item.situacao === 'SEM_ESTRUTURA') {
    return { tone: 'neutral', rotulo: 'Planejamento', texto: 'Planilha da obra não publicada' };
  }
  if (item.situacao === 'VENCIDO') {
    return {
      tone: 'negative',
      rotulo: `Planejamento ${month}`,
      texto: `vencido há ${days(item.dias)}${prazos.travada ? ' · obra travada' : ''}${extraPending(item)}`
    };
  }
  if (item.situacao === 'ABERTO') {
    return {
      tone: Number(item.dias) <= PRAZO_PROXIMO_DIAS ? 'warning' : 'info',
      rotulo: `Planejamento ${month}`,
      texto: `${openText(item, 'prazo')}${extraPending(item)}`
    };
  }
  return {
    tone: 'positive',
    rotulo: `Planejamento ${month}`,
    texto: Number(item.dias) <= 0 ? 'janela abre hoje' : `janela abre em ${days(item.dias)}`
  };
}

export function avisoMedicao(prazos) {
  const item = prazos?.medicao;
  if (!item) return null;
  const month = monthLabel(item.competencia);
  const dilatacao = item.dilatacao_pendente
    ? ' · dilatação aguardando decisão'
    : (item.dilatado ? ' · prazo dilatado' : '');
  if (item.situacao === 'VENCIDO') {
    return {
      tone: 'negative',
      rotulo: `Medição aprovada ${month}`,
      texto: `vencida há ${days(item.dias)}${prazos.travada ? ' · obra travada' : ''}${extraPending(item)}${dilatacao}`
    };
  }
  if (item.situacao === 'ABERTO') {
    return {
      tone: Number(item.dias) <= PRAZO_PROXIMO_DIAS ? 'warning' : 'info',
      rotulo: `Medição aprovada ${month}`,
      texto: `${openText(item, 'prazo')}${extraPending(item)}${dilatacao}`
    };
  }
  return { tone: 'positive', rotulo: 'Medição aprovada', texto: 'em dia' };
}

// Situação da obra no card: o pior estado entre os dois prazos.
export function situacaoObra(prazos) {
  if (!prazos) return { status: 'NEUTRO', label: 'Sem prazos' };
  if (prazos.travada) return { status: 'TRAVADA', label: 'Travada' };
  const items = [prazos.planejamento, prazos.medicao].filter(Boolean);
  if (items.some((item) => item.situacao === 'VENCIDO')) {
    return { status: 'VENCIDA', label: 'Prazo vencido' };
  }
  if (items.some((item) => item.situacao === 'ABERTO' && Number(item.dias) <= PRAZO_PROXIMO_DIAS)) {
    return { status: 'PRAZO_PROXIMO', label: 'Prazo próximo' };
  }
  if (prazos.planejamento?.situacao === 'SEM_ESTRUTURA') {
    return { status: 'NAO_INICIADA', label: 'Sem planilha' };
  }
  // Só o planejamento dá o rótulo "aberto": a medição do mês corrente está
  // sempre em curso numa obra pública e isso não é pendência a destacar.
  if (prazos.planejamento?.situacao === 'ABERTO') {
    return { status: 'ABERTO', label: 'Planejamento aberto' };
  }
  return { status: 'CUMPRIDA', label: 'Em dia' };
}
