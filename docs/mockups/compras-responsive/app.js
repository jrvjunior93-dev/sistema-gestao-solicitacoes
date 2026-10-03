if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

const requests = [
  { id: 'SC-00154', title: 'Materiais para fundação bloco B', obra: 'Escola Água Doce do Norte', requester: 'Marina Costa', items: 8, total: 'R$ 18.420,00', status: 'Em cotação', tone: 'blue', date: '21/07/2026' },
  { id: 'SC-00153', title: 'Reposição de EPIs da equipe', obra: 'Edifício Quaresmeira', requester: 'Carlos Nunes', items: 12, total: 'R$ 7.890,50', status: 'Aguardando compra', tone: 'amber', date: '20/07/2026' },
  { id: 'SC-00152', title: 'Tubulação hidráulica pavimento 4', obra: 'Residencial Acácia', requester: 'Júlia Mendes', items: 5, total: 'R$ 11.240,00', status: 'Pedido gerado', tone: 'green', date: '19/07/2026' },
  { id: 'SC-00151', title: 'Locação de compactador', obra: 'Centro Logístico Norte', requester: 'Mateus Rocha', items: 1, total: 'R$ 3.200,00', status: 'Em análise', tone: 'neutral', date: '18/07/2026' },
  { id: 'SC-00150', title: 'Revestimento área administrativa', obra: 'Edifício Quaresmeira', requester: 'Lívia Castro', items: 6, total: 'R$ 24.680,00', status: 'Respondida', tone: 'green', date: '17/07/2026' }
];

const orders = [
  { id: 'PC-00045', supplier: 'BR Shopper Ltda', obra: 'Edifício Quaresmeira', request: 'SC-00113', items: 1, total: 'R$ 28,84', minimum: '—', status: 'Fechado com fornecedor', tone: 'green' },
  { id: 'PC-00044', supplier: 'Jodeias Negrão', obra: 'Escola Água Doce do Norte', request: 'SC-00154', items: 2, total: 'R$ 1.228,80', minimum: 'R$ 1.000,00', status: 'Em negociação', tone: 'amber' },
  { id: 'PC-00043', supplier: 'Casa do Construtor', obra: 'Residencial Acácia', request: 'SC-00152', items: 5, total: 'R$ 11.240,00', minimum: '—', status: 'Enviado ao fornecedor', tone: 'blue' },
  { id: 'PC-00042', supplier: 'Aço Forte Distribuidora', obra: 'Centro Logístico Norte', request: 'SC-00149', items: 9, total: 'R$ 34.910,00', minimum: 'R$ 5.000,00', status: 'Fechado com fornecedor', tone: 'green' },
  { id: 'PC-00041', supplier: 'Elétrica Nacional', obra: 'Edifício Quaresmeira', request: 'SC-00147', items: 14, total: 'R$ 19.880,40', minimum: '—', status: 'Em análise interna', tone: 'neutral' },
  { id: 'PC-00040', supplier: 'Hidro Minas Comércio', obra: 'Residencial Acácia', request: 'SC-00146', items: 7, total: 'R$ 8.455,90', minimum: '—', status: 'Cancelado', tone: 'red' }
];

const quotes = [
  { id: '00089', supplier: 'BR Shopper Ltda', obra: 'Edifício Quaresmeira', request: 'SC-00154 · Ralo antiespuma 100 mm', status: 'Respondido', tone: 'green', sent: '18/07/2026', answer: '21/07/2026', deadline: '22/07/2026', minimum: 'R$ 1.000,00', payment: 'Cartão' },
  { id: '00088', supplier: 'Casa do Construtor', obra: 'Residencial Acácia', request: 'SC-00152 · Tubulação hidráulica', status: 'Visualizado', tone: 'amber', sent: '18/07/2026', answer: '—', deadline: '23/07/2026', minimum: '—', payment: '—' },
  { id: '00087', supplier: 'Aço Forte Distribuidora', obra: 'Centro Logístico Norte', request: 'SC-00149 · Aço CA-50', status: 'Finalizada', tone: 'neutral', sent: '14/07/2026', answer: '15/07/2026', deadline: '16/07/2026', minimum: 'R$ 5.000,00', payment: '28 dias' },
  { id: '00086', supplier: 'Elétrica Nacional', obra: 'Edifício Quaresmeira', request: 'SC-00147 · Quadros e disjuntores', status: 'Enviado', tone: 'blue', sent: '16/07/2026', answer: '—', deadline: '24/07/2026', minimum: '—', payment: '—' }
];

const suppliers = [
  { name: 'BR Shopper Ltda', doc: '11.974.223/0001-99', phone: '(11) 97422-3599', email: 'comercial@brshopper.com.br', city: 'São Paulo / SP', category: 'Hidráulica', status: 'Ativo' },
  { name: 'Casa do Construtor', doc: '28.430.116/0001-03', phone: '(31) 99817-4402', email: 'vendas@casadoconstrutor.com.br', city: 'Belo Horizonte / MG', category: 'Materiais gerais', status: 'Ativo' },
  { name: 'Aço Forte Distribuidora', doc: '04.880.223/0001-18', phone: '(27) 99212-1801', email: 'pedidos@acoforte.com.br', city: 'Serra / ES', category: 'Aço e ferragens', status: 'Ativo' },
  { name: 'Elétrica Nacional', doc: '37.100.229/0001-44', phone: '(21) 99190-7300', email: 'orcamentos@eletricanacional.com.br', city: 'Rio de Janeiro / RJ', category: 'Elétrica', status: 'Ativo' },
  { name: 'Hidro Minas Comércio', doc: '15.027.883/0001-80', phone: '(31) 98870-7112', email: 'contato@hidrominas.com.br', city: 'Contagem / MG', category: 'Hidráulica', status: 'Inativo' }
];

const reportDefinitions = [
  ['categorias-insumos', 'Categorias de insumos', 'Consumo e valor por categoria, obra e insumo.'],
  ['compras-diretas', 'Compras diretas', 'Compras realizadas fora do ciclo completo de cotação.'],
  ['compras-fornecedor', 'Compras por fornecedor', 'Volume, ticket médio e participação por fornecedor.'],
  ['demanda-pedidos', 'Demanda e pedidos', 'Conversão de solicitações em pedidos por obra e status.'],
  ['evolucao', 'Evolução mensal', 'Tendência mensal de pedidos, itens e valores contratados.'],
  ['pendencias-cotacoes', 'Pendências de cotações', 'Prazos vencidos, respostas pendentes e itens sem cobertura.'],
  ['precos-insumos', 'Preços de insumos', 'Histórico de preços, menor referência e variação por fornecedor.'],
  ['ciclo', 'Ciclo de compras', 'Tempo médio entre solicitação, cotação, fechamento e pedido.'],
  ['economia-cotacoes', 'Economia em cotações', 'Economia obtida, menor preço e justificativas de escolha.'],
  ['fornecedores', 'Desempenho de fornecedores', 'Resposta, prazo, cobertura e recorrência por fornecedor.'],
  ['auditoria', 'Auditoria administrativa', 'Eventos críticos e alterações realizadas no módulo.']
];

const navigation = [
  { title: 'OPERAÇÃO', items: [
    ['solicitacoes', '▤', 'Solicitações de Compra', '12'],
    ['nova-solicitacao', '＋', 'Nova Solicitação', ''],
    ['nova-compra-direta', '↯', 'Compra Direta', '']
  ]},
  { title: 'COTAÇÃO E PEDIDOS', items: [
    ['cotacoes', '◫', 'Cotações', '4'],
    ['cotacao-gestao', '⇄', 'Comparativo', ''],
    ['pedidos', '▧', 'Pedidos de Compra', '44'],
    ['delegacao', '♙', 'Delegação', '']
  ]},
  { title: 'CADASTROS', items: [
    ['fornecedores', '♙', 'Fornecedores', ''],
    ['insumos', '▦', 'Insumos', ''],
    ['categorias', '⌑', 'Categorias', ''],
    ['unidades', '◌', 'Unidades', ''],
    ['apropriacoes', '⌗', 'Apropriações', '']
  ]},
  { title: 'GESTÃO', items: [
    ['relatorios', '▥', 'Relatórios', ''],
    ['config-cotacoes', '⚙', 'Config. Cotações', ''],
    ['config-status', '≋', 'Status dos Pedidos', '']
  ]}
];

const routeMeta = {
  solicitacoes: ['COMPRAS · OPERAÇÃO', 'Solicitações de Compra'],
  'nova-solicitacao': ['COMPRAS · SOLICITAÇÕES', 'Nova Solicitação'],
  'nova-compra-direta': ['COMPRAS · SOLICITAÇÕES', 'Nova Compra Direta'],
  'revisar-solicitacao': ['COMPRAS · SOLICITAÇÕES', 'Revisar Solicitação'],
  'revisar-compra-direta': ['COMPRAS · SOLICITAÇÕES', 'Revisar Compra Direta'],
  'solicitacao-finalizada': ['COMPRAS · SOLICITAÇÕES', 'Solicitação registrada'],
  'solicitacao-detalhe': ['COMPRAS · SOLICITAÇÕES', 'Detalhe da Solicitação'],
  cotacoes: ['COMPRAS · COTAÇÃO', 'Cotações'],
  'cotacao-gestao': ['COMPRAS · COTAÇÃO', 'Comparativo e fechamento'],
  'portal-fornecedor': ['PORTAL DO FORNECEDOR', 'Responder Cotação'],
  pedidos: ['COMPRAS · PEDIDOS', 'Pedidos de Compra'],
  'pedido-detalhe': ['COMPRAS · PEDIDOS', 'Pedido PC-00045'],
  delegacao: ['COMPRAS · GOVERNANÇA', 'Delegação de Compras'],
  fornecedores: ['COMPRAS · CADASTROS', 'Fornecedores'],
  insumos: ['COMPRAS · CADASTROS', 'Insumos'],
  categorias: ['COMPRAS · CADASTROS', 'Categorias'],
  unidades: ['COMPRAS · CADASTROS', 'Unidades'],
  apropriacoes: ['COMPRAS · CADASTROS', 'Apropriações'],
  relatorios: ['COMPRAS · GESTÃO', 'Relatórios de Compras'],
  'config-cotacoes': ['COMPRAS · CONFIGURAÇÕES', 'Configurações de Cotação'],
  'config-status': ['COMPRAS · CONFIGURAÇÕES', 'Status dos Pedidos']
};

const state = {
  route: 'solicitacoes',
  theme: localStorage.getItem('fluxyMockTheme') || 'light',
  density: localStorage.getItem('fluxyMockDensity') || 'comfortable',
  sidebarCollapsed: localStorage.getItem('fluxyMockSidebar') === 'collapsed',
  comparisonView: 'cards'
};

const appShell = document.getElementById('appShell');
const sideNav = document.getElementById('sideNav');
const pageHost = document.getElementById('pageHost');
const topbarTitle = document.getElementById('topbarTitle');
const topbarEyebrow = document.getElementById('topbarEyebrow');
const dialogBackdrop = document.getElementById('dialogBackdrop');
const dialogTitle = document.getElementById('dialogTitle');
const dialogEyebrow = document.getElementById('dialogEyebrow');
const dialogBody = document.getElementById('dialogBody');
const dialogFooter = document.getElementById('dialogFooter');
const toastRegion = document.getElementById('toastRegion');

function status(label, tone = 'neutral') {
  return `<span class="status status--${tone}">${label}</span>`;
}

function button(label, action, variant = '', extra = '') {
  return `<button class="button ${variant ? `button--${variant}` : ''}" type="button" ${action ? `data-action="${action}"` : ''} ${extra}>${label}</button>`;
}

function routeButton(label, route, variant = '') {
  return `<button class="button ${variant ? `button--${variant}` : ''}" type="button" data-route="${route}">${label}</button>`;
}

function pageHeading(eyebrow, title, subtitle, actions = '') {
  return `<header class="page-heading">
    <div class="page-heading__copy"><span class="eyebrow">${eyebrow}</span><h1>${title}</h1><p>${subtitle}</p></div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </header>`;
}

function panel(title, subtitle, body, actions = '', className = '') {
  return `<section class="panel ${className}">
    <header class="panel__header"><div><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ''}</div>${actions}</header>
    ${body}
  </section>`;
}

function filterPanel(fields, actions = `${button('Limpar', 'clear-filters')}${button('Buscar', 'search', 'primary')}`) {
  return `<section class="panel filter-panel">
    <header class="panel__header"><div><h2>Filtros</h2><p>Refine os dados sem perder o contexto da operação.</p></div><button class="button button--small filter-panel__toggle" type="button" data-action="toggle-filters">Exibir filtros</button></header>
    <div class="panel__body filter-panel__content"><div class="filter-grid">${fields}</div><div class="filter-actions">${actions}</div></div>
  </section>`;
}

function field(label, control) {
  return `<div class="filter-field"><label>${label}</label>${control}</div>`;
}

function summary(items) {
  return `<section class="summary-grid">${items.map((item) => `<div class="summary-item"><span>${item[0]}</span><strong>${item[1]}</strong>${item[2] ? `<small>${item[2]}</small>` : ''}</div>`).join('')}</section>`;
}

function mobileRecord(title, subtitle, badge, metrics, actions) {
  return `<article class="record-card">
    <div class="record-card__head"><div class="record-card__title"><strong>${title}</strong><span>${subtitle}</span></div>${badge}</div>
    <div class="record-card__grid">${metrics.map((metric) => `<div class="record-card__metric"><span>${metric[0]}</span><strong>${metric[1]}</strong></div>`).join('')}</div>
    <div class="record-card__actions">${actions}</div>
  </article>`;
}

function renderNavigation() {
  const activeRoute = state.route.startsWith('relatorio-') ? 'relatorios' : state.route;
  sideNav.innerHTML = navigation.map((group) => `<section class="nav-group">
    <h2 class="nav-group__title">${group.title}</h2>
    ${group.items.map(([route, icon, label, count]) => `<button class="nav-link ${activeRoute === route ? 'is-active' : ''}" type="button" data-route="${route}" title="${label}">
      <span class="nav-link__icon" aria-hidden="true">${icon}</span><span class="nav-link__label">${label}</span>${count ? `<span class="nav-link__count">${count}</span>` : ''}
    </button>`).join('')}
  </section>`).join('');
}

function requestTable() {
  return `<div class="table-viewport desktop-table" tabindex="0" aria-label="Tabela de solicitações">
    <table class="data-table"><thead><tr><th class="sticky-first">Solicitação</th><th>Obra</th><th>Solicitante</th><th>Itens</th><th>Estimativa</th><th>Status</th><th>Data</th><th></th></tr></thead>
    <tbody>${requests.map((item) => `<tr><td class="sticky-first"><span class="cell-main">${item.id}</span><br><span class="cell-muted">${item.title}</span></td><td>${item.obra}</td><td>${item.requester}</td><td>${item.items}</td><td class="cell-number">${item.total}</td><td>${status(item.status, item.tone)}</td><td>${item.date}</td><td class="cell-actions"><button class="button button--small" data-route="solicitacao-detalhe">Abrir</button></td></tr>`).join('')}</tbody></table>
  </div>
  <div class="mobile-records">${requests.map((item) => mobileRecord(item.id, item.title, status(item.status, item.tone), [['Obra', item.obra], ['Itens', item.items], ['Estimativa', item.total], ['Data', item.date]], routeButton('Abrir solicitação', 'solicitacao-detalhe'))).join('')}</div>`;
}

function renderRequests() {
  return `<div class="page">
    ${pageHeading('OPERAÇÃO DE COMPRAS', 'Solicitações de Compra', 'Acompanhe solicitações, responsáveis, cobertura de cotação e conversão em pedidos.', `${routeButton('Compra direta', 'nova-compra-direta')}${routeButton('+ Nova solicitação', 'nova-solicitacao', 'primary')}`)}
    ${filterPanel(
      field('Busca geral', '<input class="input" data-main-search placeholder="Código, obra, item ou solicitante">') +
      field('Status', '<select class="select"><option>Todos os status</option><option>Em cotação</option><option>Aguardando compra</option></select>') +
      field('Obra', '<select class="select"><option>Todas as obras</option><option>Edifício Quaresmeira</option><option>Residencial Acácia</option></select>') +
      field('Período', '<input class="input" type="date" value="2026-07-01">')
    )}
    ${summary([['Solicitações abertas', '12', '3 exigem ação hoje'], ['Em cotação', '5', '11 fornecedores aguardados'], ['Pedidos gerados', '44', 'R$ 241.019,03 no período'], ['Prazo médio', '4,2 dias', '−0,8 dia contra junho']])}
    ${panel('Solicitações recentes', 'Exibição em tabela no notebook e cards operacionais no smartphone.', requestTable(), '<span class="status status--neutral">5 de 12 registros</span>')}
  </div>`;
}

function itemEditor() {
  const rows = [
    ['01', 'Ralo antiespuma 100 mm', 'UN', '12', 'R$ 28,84', 'HID-03', '30/07/2026'],
    ['02', 'Tubo PVC soldável 50 mm', 'BR', '24', 'R$ 46,90', 'HID-03', '30/07/2026'],
    ['03', 'Joelho 90° soldável 50 mm', 'UN', '36', 'R$ 9,70', 'HID-03', '30/07/2026']
  ];
  return `<div class="item-editor-desktop table-viewport" tabindex="0"><table class="data-table data-table--wide"><thead><tr><th>#</th><th>Insumo / item</th><th>Un.</th><th>Quantidade</th><th>Preço estimado</th><th>Apropriação</th><th>Necessário para</th><th>Anexo</th><th></th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 1 ? `<input class="input" value="${cell}">` : index > 1 && index < 7 ? `<input class="input" value="${cell}">` : cell}</td>`).join('')}<td><button class="button button--small" data-action="notify">Anexar</button></td><td><button class="button button--small button--danger" data-action="notify">Remover</button></td></tr>`).join('')}</tbody></table></div>
  <div class="item-editor-mobile">${rows.map((row, index) => `<details class="item-card" ${index === 0 ? 'open' : ''}><summary>Item ${row[0]} · ${row[1]}</summary><div class="item-card__body">
    <div class="form-field"><label>Insumo / item</label><input class="input" value="${row[1]}"></div>
    <div class="form-grid"><div class="form-field col-6"><label>Quantidade</label><input class="input" value="${row[3]}"></div><div class="form-field col-6"><label>Unidade</label><input class="input" value="${row[2]}"></div><div class="form-field col-6"><label>Preço estimado</label><input class="input" value="${row[4]}"></div><div class="form-field col-6"><label>Necessário para</label><input class="input" type="date" value="2026-07-30"></div></div>
    <div class="form-field"><label>Apropriação</label><select class="select"><option>${row[5]} · Instalações hidráulicas</option></select></div>
    <div class="record-card__actions">${button('Anexar', 'notify')}${button('Editar rateio', 'open-rateio')}${button('Remover', 'notify', 'danger')}</div>
  </div></details>`).join('')}</div>`;
}

function renderNewRequest(direct = false) {
  const title = direct ? 'Nova Compra Direta' : 'Nova Solicitação de Compra';
  const subtitle = direct ? 'Registre uma aquisição excepcional mantendo obra, apropriação, justificativa e rastreabilidade.' : 'Organize os dados da demanda e os itens antes da revisão final.';
  return `<div class="page">
    ${pageHeading('SOLICITAÇÕES · NOVO REGISTRO', title, subtitle, routeButton('Voltar à lista', 'solicitacoes'))}
    <div class="steps"><span class="step is-active" data-step="1">Dados gerais</span><span class="step is-active" data-step="2">Itens</span><span class="step" data-step="3">Revisão</span><span class="step" data-step="4">Confirmação</span></div>
    ${panel('Dados da solicitação', 'Campos gerais permanecem compactos no notebook e verticais no smartphone.', `<div class="panel__body"><div class="form-grid">
      <div class="form-field col-8"><label>Título da solicitação</label><input class="input" value="Materiais hidráulicos para pavimento 4"></div>
      <div class="form-field col-4"><label>Prioridade</label><select class="select"><option>Normal</option><option>Urgente</option></select></div>
      <div class="form-field col-6"><label>Obra</label><select class="select"><option>Residencial Acácia · OB-014</option></select></div>
      <div class="form-field col-3"><label>Data necessária</label><input class="input" type="date" value="2026-07-30"></div>
      <div class="form-field col-3"><label>Centro responsável</label><select class="select"><option>Obra</option></select></div>
      ${direct ? '<div class="form-field col-12"><label>Justificativa da compra direta</label><textarea class="textarea">Fornecedor exclusivo para reposição compatível com o material já instalado.</textarea></div>' : '<div class="form-field col-12"><label>Observações</label><textarea class="textarea" placeholder="Contexto técnico, condições de entrega ou referências"></textarea></div>'}
    </div></div>`)}
    ${panel('Itens da solicitação', 'No smartphone, cada linha se transforma em um editor de item independente.', itemEditor(), button('+ Adicionar item', 'add-item', 'primary'))}
    <div class="action-dock">${routeButton('Salvar rascunho', 'solicitacoes')}${routeButton('Revisar solicitação', direct ? 'revisar-compra-direta' : 'revisar-solicitacao', 'primary')}</div>
  </div>`;
}

function reviewContent(direct) {
  return `<div class="split-layout">
    <div class="section-stack">
      ${panel('Resumo da demanda', '', `<div class="panel__body"><div class="detail-grid"><div class="detail-pair"><span>Obra</span><strong>Residencial Acácia · OB-014</strong></div><div class="detail-pair"><span>Solicitante</span><strong>Marina Costa</strong></div><div class="detail-pair"><span>Data necessária</span><strong>30/07/2026</strong></div><div class="detail-pair"><span>Modalidade</span><strong>${direct ? 'Compra direta' : 'Cotação concorrencial'}</strong></div></div></div>`)}
      ${panel('Itens conferidos', '3 itens · todos com apropriação e data necessária', `<div class="mobile-records" style="display:grid">${['Ralo antiespuma 100 mm', 'Tubo PVC soldável 50 mm', 'Joelho 90° soldável 50 mm'].map((name, i) => mobileRecord(`Item 0${i + 1}`, name, status('Completo', 'green'), [['Quantidade', [12,24,36][i]], ['Apropriação', 'HID-03'], ['Necessário', '30/07/2026'], ['Anexos', i === 0 ? '1 arquivo' : 'Nenhum']], button('Editar', 'notify', 'small'))).join('')}</div>`)}
    </div>
    ${panel('Validação final', 'O resumo permanece visível no notebook e entra no fluxo vertical no mobile.', `<div class="panel__body section-stack"><div class="detail-pair"><span>Valor estimado</span><strong>R$ 2.146,68</strong></div><div class="detail-pair"><span>Itens válidos</span><strong>3 de 3</strong></div><div class="detail-pair"><span>Rateio</span><strong>100% apropriado</strong></div>${direct ? `<div class="detail-pair"><span>Justificativa</span><strong>Informada</strong></div>` : ''}</div><div class="action-dock">${routeButton('Voltar e editar', direct ? 'nova-compra-direta' : 'nova-solicitacao')}${routeButton('Confirmar e enviar', 'solicitacao-finalizada', 'primary')}</div>`)}
  </div>`;
}

function renderReview(direct = false) {
  return `<div class="page">${pageHeading('SOLICITAÇÕES · REVISÃO', direct ? 'Revisar Compra Direta' : 'Revisar Solicitação', 'Confira dados, itens, anexos e apropriações antes de registrar.', routeButton('Cancelar', 'solicitacoes'))}${reviewContent(direct)}</div>`;
}

function renderConfirmation() {
  return `<div class="page">${pageHeading('SOLICITAÇÕES · CONCLUÍDO', 'Solicitação registrada', 'O registro foi criado e encaminhado diretamente ao setor responsável.')}
    <section class="panel"><div class="empty-state"><div><span class="status status--green">Registro concluído</span><h2>SC-00155 criada com sucesso</h2><p>Os itens, anexos, rateios e informações da obra foram preservados. A equipe de Compras já pode continuar o fluxo.</p><div class="page-actions" style="justify-content:center;margin-top:16px">${routeButton('Abrir solicitação', 'solicitacao-detalhe', 'primary')}${routeButton('Voltar à lista', 'solicitacoes')}</div></div></div></section>
  </div>`;
}

function renderRequestDetail() {
  return `<div class="page">
    ${pageHeading('SOLICITAÇÕES · SC-00154', 'Materiais para fundação bloco B', 'Detalhe operacional com itens, histórico e ações condicionadas às permissões.', `${routeButton('Voltar', 'solicitacoes')}${routeButton('Gerenciar cotação', 'cotacao-gestao', 'primary')}`)}
    ${summary([['Status', 'Em cotação'], ['Obra', 'Escola Água Doce'], ['Itens', '8'], ['Estimativa', 'R$ 18.420,00']])}
    <div class="split-layout">
      ${panel('Itens solicitados', 'Datas, apropriações e anexos da demanda.', `<div class="table-viewport desktop-table"><table class="data-table data-table--compact"><thead><tr><th>Item</th><th>Qtd.</th><th>Apropriação</th><th>Necessário</th><th>Anexos</th></tr></thead><tbody><tr><td class="cell-main">Aço CA-50 10 mm</td><td>480 KG</td><td>EST-02</td><td>29/07/2026</td><td>1</td></tr><tr><td class="cell-main">Arame recozido BWG 18</td><td>35 KG</td><td>EST-02</td><td>29/07/2026</td><td>0</td></tr><tr><td class="cell-main">Espaçador circular 25 mm</td><td>600 UN</td><td>EST-02</td><td>30/07/2026</td><td>2</td></tr></tbody></table></div><div class="mobile-records">${mobileRecord('Aço CA-50 10 mm', '480 KG · EST-02', status('29/07/2026','blue'), [['Anexos','1'],['Status','Em cotação']], button('Detalhes','open-item'))}${mobileRecord('Arame recozido BWG 18','35 KG · EST-02',status('29/07/2026','blue'),[['Anexos','0'],['Status','Em cotação']],button('Detalhes','open-item'))}</div>`)}
      ${panel('Histórico', 'Rastreabilidade das principais transições.', `<div class="panel__body timeline"><div class="timeline__item"><span class="timeline__dot">3</span><div class="timeline__copy"><strong>Cotação enviada</strong><span>4 fornecedores receberam itens selecionados · hoje, 08:42</span></div></div><div class="timeline__item"><span class="timeline__dot">2</span><div class="timeline__copy"><strong>Solicitação assumida</strong><span>José Ricardo · ontem, 16:08</span></div></div><div class="timeline__item"><span class="timeline__dot">1</span><div class="timeline__copy"><strong>Solicitação criada</strong><span>Marina Costa · 20/07/2026, 14:31</span></div></div></div>`)}
    </div>
  </div>`;
}

function renderQuotes() {
  const table = `<div class="table-viewport desktop-table"><table class="data-table data-table--wide"><thead><tr><th class="sticky-first">#</th><th>Fornecedor</th><th>Obra</th><th>Solicitação</th><th>Status</th><th>Enviado</th><th>Respondido</th><th>Prazo</th><th>Pedido mínimo</th><th>Pagamento</th><th></th></tr></thead><tbody>${quotes.map((q) => `<tr><td class="sticky-first cell-main">${q.id}</td><td>${q.supplier}</td><td>${q.obra}</td><td>${q.request}</td><td>${status(q.status,q.tone)}</td><td>${q.sent}</td><td>${q.answer}</td><td>${q.deadline}</td><td class="cell-number">${q.minimum}</td><td>${q.payment}</td><td class="cell-actions"><button class="button button--small" data-route="cotacao-gestao">Editar</button></td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${quotes.map((q) => mobileRecord(`Cotação ${q.id}`, q.supplier, status(q.status,q.tone), [['Obra',q.obra],['Solicitação',q.request.split(' · ')[0]],['Prazo',q.deadline],['Pedido mínimo',q.minimum]], routeButton('Gerenciar','cotacao-gestao'))).join('')}</div>`;
  return `<div class="page">${pageHeading('COTAÇÃO · ACOMPANHAMENTO','Cotações','Acompanhe convites, respostas, prazos e condições registradas pelos fornecedores.',routeButton('Abrir comparativo','cotacao-gestao','primary'))}
    ${filterPanel(field('Busca','<input class="input" data-main-search placeholder="Fornecedor ou solicitação">')+field('Status','<select class="select"><option>Todos</option><option>Respondido</option><option>Visualizado</option></select>')+field('Obra','<select class="select"><option>Todas as obras</option></select>'))}
    ${summary([['Total listado','4'],['Respondidas','2'],['Aguardando resposta','2'],['Prazo hoje','1']])}
    ${panel('Lista de cotações','A tabela permanece analítica no notebook; no smartphone, cada cotação ganha um resumo acionável.',table,'<span class="status status--neutral">4 registros</span>')}
  </div>`;
}

function comparisonCards() {
  return `<div class="comparison-cards">
    ${mobileRecord('Ralo antiespuma 100 mm','Saldo: 1 UN',status('Menor: BR Shopper','green'),[['BR Shopper','R$ 28,84'],['Casa do Construtor','R$ 31,20'],['Chegada','30/07/2026'],['Comprar','1 UN']],button('Selecionar vencedor','select-winner','primary'))}
    ${mobileRecord('Tubo PVC soldável 50 mm','Saldo: 24 BR',status('2 respostas','blue'),[['BR Shopper','R$ 46,90'],['Hidro Minas','R$ 44,75'],['Chegada','31/07/2026'],['Comprar','24 BR']],button('Selecionar vencedor','select-winner','primary'))}
  </div>`;
}

function renderQuoteManagement() {
  const comparisonTable = `<div class="comparison-table table-viewport"><table class="data-table data-table--wide"><thead><tr><th class="sticky-first">Item</th><th>Saldo</th><th>BR Shopper</th><th>Casa do Construtor</th><th>Hidro Minas</th><th>Vencedor</th><th>Comprar</th></tr></thead><tbody><tr><td class="sticky-first cell-main">Ralo antiespuma 100 mm</td><td>1 UN</td><td><strong>R$ 28,84</strong><br><span class="cell-muted">30/07 · Cartão</span></td><td>R$ 31,20<br><span class="cell-muted">01/08 · Boleto</span></td><td>—</td><td>${status('BR Shopper','green')}</td><td><input class="input" value="1" style="width:82px"></td></tr><tr><td class="sticky-first cell-main">Tubo PVC soldável 50 mm</td><td>24 BR</td><td>R$ 46,90<br><span class="cell-muted">31/07 · Cartão</span></td><td>—</td><td><strong>R$ 44,75</strong><br><span class="cell-muted">01/08 · 28 dias</span></td><td>${status('Hidro Minas','green')}</td><td><input class="input" value="24" style="width:82px"></td></tr></tbody></table></div>${comparisonCards()}`;
  return `<div class="page">
    ${pageHeading('COTAÇÃO · SC-00154','Comparativo e fechamento','Compare respostas, selecione quantidades e gere pedidos sem perder o saldo remanescente.',`${routeButton('Voltar às cotações','cotacoes')}${button('Enviar lembrete','notify')}`)}
    ${summary([['Fornecedores convidados','4'],['Respostas recebidas','3'],['Itens cobertos','8 de 8'],['Melhor cenário','R$ 17.860,00']])}
    ${panel('Fornecedores da rodada','Prazo de resposta: 22/07/2026 às 18h.',`<div class="panel__body supplier-grid"><article class="supplier-card is-best"><div class="supplier-card__head"><div><h3>BR Shopper Ltda</h3><p>8 itens respondidos · hoje, 08:14</p></div>${status('Respondido','green')}</div><div class="supplier-card__value">R$ 8.740,00</div><div class="record-card__actions">${button('Editar resposta','edit-response')}${routeButton('Portal','portal-fornecedor')}</div></article><article class="supplier-card"><div class="supplier-card__head"><div><h3>Casa do Construtor</h3><p>6 itens respondidos · ontem, 17:22</p></div>${status('Respondido','green')}</div><div class="supplier-card__value">R$ 9.120,00</div><div class="record-card__actions">${button('Editar resposta','edit-response')}</div></article><article class="supplier-card"><div class="supplier-card__head"><div><h3>Hidro Minas</h3><p>5 itens respondidos · ontem, 15:49</p></div>${status('Respondido','green')}</div><div class="supplier-card__value">R$ 8.980,00</div><div class="record-card__actions">${button('Editar resposta','edit-response')}</div></article><article class="supplier-card"><div class="supplier-card__head"><div><h3>Elétrica Nacional</h3><p>Ainda não visualizou o convite</p></div>${status('Aguardando','amber')}</div><div class="record-card__actions">${button('Reenviar','notify')}</div></article></div>`)}
    ${panel('Comparativo por item','No smartphone, o mapa vira uma sequência de itens com respostas empilhadas.',comparisonTable,`<div class="segmented"><button class="${state.comparisonView === 'cards' ? 'is-active' : ''}" data-action="comparison-cards">Cards</button><button class="${state.comparisonView === 'table' ? 'is-active' : ''}" data-action="comparison-table">Mapa</button></div>`,'comparison-panel')}
    <div class="action-dock">${button('Salvar seleção','notify')}${button('Gerar pedidos selecionados','generate-orders','primary')}</div>
  </div>`;
}

function renderPublicPortal() {
  return `<div class="page public-page">
    <header class="public-header"><div class="public-header__brand"><img src="../../../frontend/src/assets/fluxy_mark_cropped.png" alt=""><div><strong>FLUXY</strong><div class="cell-muted">Portal seguro do fornecedor</div></div></div>${status('Prazo: 22/07/2026','blue')}</header>
    ${pageHeading('COTAÇÃO Nº 00089','Responder Cotação','BR Shopper Ltda · Escola Água Doce do Norte · 8 itens solicitados',routeButton('Voltar ao mockup','cotacao-gestao'))}
    ${panel('Condições gerais','Preencha as condições válidas para todos os itens.',`<div class="panel__body"><div class="form-grid"><div class="form-field col-3"><label>Valor mínimo do pedido</label><input class="input" value="R$ 1.000,00"></div><div class="form-field col-3"><label>Desconto total</label><input class="input" value="R$ 0,00"></div><div class="form-field col-3"><label>Prazo de entrega</label><input class="input" value="5 dias úteis"></div><div class="form-field col-3"><label>Condição de pagamento</label><select class="select"><option>Cartão</option><option>Boleto 28 dias</option></select></div><div class="form-field col-12"><label>Observação geral</label><textarea class="textarea">Frete CIF incluso.</textarea></div></div></div>`)}
    ${panel('Itens da proposta','No smartphone, os itens são editados individualmente sem tabela horizontal.',itemEditor(),button('Aplicar data para todos','notify'))}
    <div class="action-dock">${button('Salvar rascunho','notify')}${button('Enviar proposta','submit-quote','primary')}</div>
  </div>`;
}

function orderTable() {
  return `<div class="table-viewport desktop-table"><table class="data-table"><thead><tr><th class="sticky-first">Pedido</th><th>Fornecedor</th><th>Obra</th><th>Solicitação</th><th>Itens</th><th>Valor total</th><th>Pedido mínimo</th><th>Status</th><th></th></tr></thead><tbody>${orders.map((o) => `<tr><td class="sticky-first cell-main">${o.id}</td><td>${o.supplier}</td><td>${o.obra}</td><td>${o.request}</td><td>${o.items}</td><td class="cell-number">${o.total}</td><td class="cell-number">${o.minimum}</td><td>${status(o.status,o.tone)}</td><td class="cell-actions"><button class="button button--small" data-route="pedido-detalhe">Abrir</button></td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${orders.map((o) => mobileRecord(o.id,o.supplier,status(o.status,o.tone),[['Obra',o.obra],['Solicitação',o.request],['Itens',o.items],['Valor total',o.total]],routeButton('Abrir pedido','pedido-detalhe'))).join('')}</div>`;
}

function renderOrders() {
  return `<div class="page">${pageHeading('PEDIDOS · ACOMPANHAMENTO','Pedidos de Compra','Consulta dos pedidos gerados a partir das cotações encerradas, sem cortes no notebook.')}
    ${filterPanel(field('Busca geral','<input class="input" data-main-search placeholder="Fornecedor, obra ou pedido">')+field('Status','<select class="select"><option>Todos os status</option><option>Fechado com fornecedor</option></select>')+field('Obra','<select class="select"><option>Todas as obras</option></select>'))}
    ${summary([['Pedidos listados','44'],['Valor total em pedidos','R$ 241.019,03'],['Em negociação','6'],['Fechados no mês','31']])}
    ${panel('Lista de pedidos','Ações e totais permanecem dentro do espaço útil mesmo com a sidebar aberta.',orderTable(),'<span class="status status--neutral">44 registros</span>')}
  </div>`;
}

function renderOrderDetail() {
  return `<div class="page">${pageHeading('PEDIDOS · PC-00045','BR Shopper Ltda','Pedido originado da cotação SC-00113, com status, itens, anexos e histórico.',`${routeButton('Voltar','pedidos')}${button('Alterar status','change-status','primary')}`)}
    ${summary([['Status','Fechado com fornecedor'],['Valor total','R$ 28,84'],['Itens ativos','1'],['Obra','Edifício Quaresmeira']])}
    <div class="split-layout"><div class="section-stack">
      ${panel('Itens do pedido','Valores e quantidades efetivamente selecionados.',`<div class="table-viewport desktop-table"><table class="data-table data-table--compact"><thead><tr><th>Item</th><th>Quantidade</th><th>Unitário</th><th>Total</th><th>Entrega</th></tr></thead><tbody><tr><td class="cell-main">Ralo antiespuma 100 mm</td><td>1 UN</td><td class="cell-number">R$ 28,84</td><td class="cell-number">R$ 28,84</td><td>30/07/2026</td></tr></tbody></table></div><div class="mobile-records">${mobileRecord('Ralo antiespuma 100 mm','1 UN',status('30/07/2026','blue'),[['Unitário','R$ 28,84'],['Total','R$ 28,84']],button('Ver especificação','open-item'))}</div>`)}
      ${panel('Anexos e comunicação','Arquivos do pedido e comprovantes enviados ao fornecedor.',`<div class="panel__body section-stack"><div class="record-card"><div class="record-card__head"><div class="record-card__title"><strong>pedido-PC-00045.pdf</strong><span>PDF · 284 KB · gerado hoje</span></div>${button('Visualizar','notify','small')}</div></div><div class="record-card"><div class="record-card__head"><div class="record-card__title"><strong>proposta-br-shopper.pdf</strong><span>PDF · 1,2 MB · resposta do fornecedor</span></div>${button('Visualizar','notify','small')}</div></div></div>`,button('+ Anexar','notify'))}
    </div>${panel('Linha do tempo','Acompanhamento operacional do pedido.',`<div class="panel__body timeline"><div class="timeline__item"><span class="timeline__dot">4</span><div class="timeline__copy"><strong>Fechado com fornecedor</strong><span>José Ricardo · hoje, 09:03</span></div></div><div class="timeline__item"><span class="timeline__dot">3</span><div class="timeline__copy"><strong>Pedido enviado</strong><span>E-mail e WhatsApp · hoje, 08:51</span></div></div><div class="timeline__item"><span class="timeline__dot">2</span><div class="timeline__copy"><strong>Pedido gerado</strong><span>Cotação encerrada · hoje, 08:42</span></div></div><div class="timeline__item"><span class="timeline__dot">1</span><div class="timeline__copy"><strong>Resposta selecionada</strong><span>Menor preço aprovado</span></div></div></div>`)}
    </div>
  </div>`;
}

function renderDelegation() {
  const people = [['Marina Costa','Compradora','Obras Norte','8 solicitações'],['Carlos Nunes','Analista de Compras','Obras Sul','5 solicitações'],['Júlia Mendes','Gestora','Todas as obras','12 solicitações']];
  return `<div class="page">${pageHeading('GOVERNANÇA · EQUIPE','Delegação de Compras','Distribua carteira, obras e responsabilidades sem alterar permissões estruturais.',button('+ Nova delegação','notify','primary'))}
    ${filterPanel(field('Usuário','<select class="select"><option>Todos os usuários</option></select>')+field('Obra','<select class="select"><option>Todas as obras</option></select>')+field('Situação','<select class="select"><option>Delegações ativas</option></select>'))}
    <section class="supplier-grid">${people.map((p) => `<article class="supplier-card"><div class="supplier-card__head"><div><h3>${p[0]}</h3><p>${p[1]}</p></div>${status('Ativa','green')}</div><div class="detail-pair"><span>Escopo</span><strong>${p[2]}</strong></div><div class="detail-pair"><span>Carga atual</span><strong>${p[3]}</strong></div><div class="record-card__actions">${button('Editar delegação','edit-delegation')}${button('Histórico','notify')}</div></article>`).join('')}</section>
  </div>`;
}

function renderSuppliers() {
  const table = `<div class="table-viewport desktop-table"><table class="data-table data-table--wide"><thead><tr><th class="sticky-first">Nome</th><th>CNPJ</th><th>WhatsApp</th><th>E-mail</th><th>Cidade / UF</th><th>Categoria</th><th>Status</th><th></th></tr></thead><tbody>${suppliers.map((s) => `<tr><td class="sticky-first cell-main">${s.name}</td><td>${s.doc}</td><td>${s.phone}</td><td>${s.email}</td><td>${s.city}</td><td>${s.category}</td><td>${status(s.status,s.status === 'Ativo' ? 'green' : 'neutral')}</td><td class="cell-actions">${button('Editar','edit-supplier','small')}</td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${suppliers.map((s) => mobileRecord(s.name,s.doc,status(s.status,s.status === 'Ativo' ? 'green' : 'neutral'),[['WhatsApp',s.phone],['Cidade',s.city],['Categoria',s.category],['E-mail',s.email]],button('Editar fornecedor','edit-supplier'))).join('')}</div>`;
  return `<div class="page">${pageHeading('CADASTROS · FORNECEDORES','Fornecedores','Base utilizada em convites, respostas e pedidos de compra.',button('+ Novo fornecedor','edit-supplier','primary'))}
    ${filterPanel(field('Busca','<input class="input" data-main-search placeholder="Nome, CNPJ ou e-mail">')+field('Estado','<select class="select"><option>Todos os estados</option></select>')+field('Categoria','<input class="input" placeholder="Filtrar por categoria">')+field('Situação','<select class="select"><option>Ativos e inativos</option></select>'))}
    ${panel('Fornecedores cadastrados','A tabela fica contida no notebook; o smartphone recebe cards com os mesmos dados.',table,'<span class="status status--neutral">29 fornecedores</span>')}
  </div>`;
}

const masterData = {
  insumos: { title: 'Insumos', subtitle: 'Itens padronizados para solicitações e cotações.', columns: ['Código','Descrição','Categoria','Unidade','Último preço','Situação'], rows: [['INS-0041','Aço CA-50 10 mm','Aço e ferragens','KG','R$ 6,84','Ativo'],['INS-0118','Ralo antiespuma 100 mm','Hidráulica','UN','R$ 28,84','Ativo'],['INS-0214','Tubo PVC soldável 50 mm','Hidráulica','BR','R$ 44,75','Ativo']] },
  categorias: { title: 'Categorias', subtitle: 'Classificação operacional dos insumos de compra.', columns: ['Código','Categoria','Descrição','Itens vinculados','Situação'], rows: [['CAT-01','Aço e ferragens','Estrutura e armação','86','Ativo'],['CAT-02','Hidráulica','Tubos, conexões e acessórios','143','Ativo'],['CAT-03','Elétrica','Cabos, quadros e dispositivos','117','Ativo']] },
  unidades: { title: 'Unidades', subtitle: 'Unidades de medida utilizadas nos itens.', columns: ['Código','Nome','Símbolo','Itens vinculados','Situação'], rows: [['UN','Unidade','UN','218','Ativo'],['KG','Quilograma','KG','92','Ativo'],['BR','Barra','BR','44','Ativo']] },
  apropriacoes: { title: 'Apropriações', subtitle: 'Códigos vinculados às obras para classificação dos custos.', columns: ['Código','Descrição','Obra','Somadora','Situação'], rows: [['HID-03','Instalações hidráulicas','Residencial Acácia','Não','Ativo'],['EST-02','Estrutura de concreto','Escola Água Doce','Não','Ativo'],['ADM-01','Administração local','Todas as obras','Sim','Ativo']] }
};

function renderMasterData(kind) {
  const data = masterData[kind];
  const table = `<div class="table-viewport desktop-table"><table class="data-table data-table--compact"><thead><tr>${data.columns.map((c,i) => `<th class="${i===0?'sticky-first':''}">${c}</th>`).join('')}<th></th></tr></thead><tbody>${data.rows.map((row) => `<tr>${row.map((cell,i) => `<td class="${i===0?'sticky-first cell-main':''}">${i === row.length-1 ? status(cell,'green') : cell}</td>`).join('')}<td class="cell-actions">${button('Editar','notify','small')}</td></tr>`).join('')}</tbody></table></div><div class="mobile-records">${data.rows.map((row) => mobileRecord(row[0],row[1],status(row[row.length-1],'green'),data.columns.slice(2,-1).map((c,i)=>[c,row[i+2]]),button('Editar','notify'))).join('')}</div>`;
  return `<div class="page">${pageHeading('CADASTROS · COMPRAS',data.title,data.subtitle,button(`+ Novo registro`,'notify','primary'))}
    ${filterPanel(field('Busca','<input class="input" data-main-search placeholder="Código ou descrição">')+field('Situação','<select class="select"><option>Ativos</option><option>Todos</option></select>'))}
    ${panel(`${data.title} cadastrados`,'Formulário e listagem se reorganizam pela largura disponível.',table,`<span class="status status--neutral">${data.rows.length} exemplos</span>`)}
  </div>`;
}

function renderReportsHub() {
  return `<div class="page">${pageHeading('GESTÃO · INDICADORES','Relatórios de Compras','Visões operacionais e gerenciais para acompanhar demanda, preço, prazo, cobertura e fornecedores.',button('Exportar índice','notify'))}
    ${summary([['Valor contratado','R$ 241 mil','Julho de 2026'],['Economia estimada','R$ 18,4 mil','7,1% sobre referências'],['Ciclo médio','4,2 dias','Solicitação até pedido'],['Cobertura','92%','Itens com 2+ respostas']])}
    ${panel('Visões disponíveis','Cada relatório herda filtros responsivos, indicadores compactos e tabelas com rolagem local.',`<div class="panel__body report-grid">${reportDefinitions.map(([id,title,desc]) => `<button class="report-link" type="button" data-route="relatorio-${id}"><div><strong>${title}</strong><p>${desc}</p></div><span>Abrir relatório →</span></button>`).join('')}</div>`)}
  </div>`;
}

function renderReportDetail(id) {
  const definition = reportDefinitions.find((item) => item[0] === id) || reportDefinitions[0];
  const [key,title,desc] = definition;
  const labels = key === 'ciclo' ? ['Solicitação → triagem','Triagem → cotação','Cotação → resposta','Resposta → pedido'] : ['Edifício Quaresmeira','Residencial Acácia','Escola Água Doce','Centro Logístico Norte'];
  return `<div class="page">${pageHeading('RELATÓRIOS · COMPRAS',title,desc,`${routeButton('Voltar ao índice','relatorios')}${button('Exportar XLSX','notify','primary')}`)}
    ${filterPanel(field('Período','<input class="input" type="month" value="2026-07">')+field('Obra','<select class="select"><option>Todas as obras</option></select>')+field('Status','<select class="select"><option>Todos os status</option></select>'))}
    ${summary([['Registros analisados','184'],['Valor consolidado','R$ 241.019'],['Variação mensal','+8,4%'],['Atualizado','Hoje, 09:18']])}
    <div class="split-layout">${panel('Distribuição principal','Leitura comparativa que passa para uma coluna em telas menores.',`<div class="panel__body bar-list">${labels.map((label,index) => `<div class="bar-row"><strong>${label}</strong><div class="bar-track"><i style="width:${[84,67,52,39][index]}%"></i></div><span>${['R$ 84,2 mil','R$ 62,8 mil','R$ 51,4 mil','R$ 42,6 mil'][index]}</span></div>`).join('')}</div>`)}${panel('Sinais de atenção','Exceções que exigem leitura gerencial.',`<div class="panel__body section-stack"><div class="record-card"><div class="record-card__head"><div class="record-card__title"><strong>3 registros fora do prazo</strong><span>Maior desvio: 2,4 dias</span></div>${status('Atenção','amber')}</div></div><div class="record-card"><div class="record-card__head"><div class="record-card__title"><strong>2 escolhas acima do menor preço</strong><span>Ambas possuem justificativa</span></div>${status('Regular','green')}</div></div></div>`)}</div>
    ${panel('Detalhamento analítico','As larguras podem ser ajustadas no desktop; no touch, a tabela usa somente rolagem local.',`<div class="table-viewport"><table class="data-table data-table--wide"><thead><tr><th class="sticky-first">Referência</th><th>Obra</th><th>Fornecedor</th><th>Categoria</th><th>Itens</th><th>Valor</th><th>Prazo</th><th>Status</th><th>Responsável</th></tr></thead><tbody>${orders.slice(0,5).map((o,i)=>`<tr><td class="sticky-first cell-main">${o.id}</td><td>${o.obra}</td><td>${o.supplier}</td><td>${['Hidráulica','Aço','Elétrica','Materiais gerais'][i%4]}</td><td>${o.items}</td><td class="cell-number">${o.total}</td><td>${3+i} dias</td><td>${status(o.status,o.tone)}</td><td>${['Marina','Carlos','Júlia'][i%3]}</td></tr>`).join('')}</tbody></table></div>`)}
  </div>`;
}

function renderConfigQuotes() {
  return `<div class="page">${pageHeading('CONFIGURAÇÕES · COTAÇÃO','Configurações de Cotação','Parâmetros gerais de concorrência, prazo e justificativas.',routeButton('Voltar às cotações','cotacoes'))}
    ${panel('Regras gerais','Alterações deste painel seriam protegidas por permissão administrativa.',`<div class="panel__body"><div class="form-grid"><div class="form-field col-4"><label>Mínimo de cotações</label><input class="input" type="number" value="3"></div><div class="form-field col-4"><label>Critério padrão</label><select class="select"><option>Menor preço</option><option>Melhor condição</option></select></div><div class="form-field col-4"><label>Prazo padrão</label><input class="input" value="3 dias úteis"></div><div class="form-field col-6"><label>Permitir aprovar sem mínimo</label><select class="select"><option>Sim, com justificativa</option></select></div><div class="form-field col-6"><label>Exigir justificativa fora do menor preço</label><select class="select"><option>Sim</option></select></div></div></div><div class="action-dock">${button('Cancelar','notify')}${button('Salvar configurações','save-config','primary')}</div>`)}
  </div>`;
}

function renderConfigStatus() {
  const rows = [['ABERTO','Aberto','Permite edição'],['EM_ANALISE','Em análise interna','Permite edição'],['ENVIADO_FORNECEDOR','Enviado ao fornecedor','Permite edição'],['FECHADO_FORNECEDOR','Fechado com fornecedor','Bloqueia edição']];
  return `<div class="page">${pageHeading('CONFIGURAÇÕES · PEDIDOS','Status dos Pedidos','Organize rótulos, ordem e bloqueio operacional dos pedidos de compra.',button('+ Novo status','notify','primary'))}
    ${panel('Fluxo configurado','No smartphone, cada linha passa a ser um bloco vertical editável.',`<div class="panel__body">${rows.map((r,i)=>`<div class="config-row"><div class="form-field"><label>Código</label><input class="input" value="${r[0]}"></div><div class="form-field"><label>Nome exibido</label><input class="input" value="${r[1]}"></div><div class="form-field"><label>Comportamento</label><select class="select"><option>${r[2]}</option></select></div><div>${button(i===rows.length-1?'Protegido':'Remover','notify',i===rows.length-1?'':'danger')}</div></div>`).join('')}</div><div class="action-dock">${button('Restaurar padrão','notify')}${button('Salvar ordem e status','save-config','primary')}</div>`)}
  </div>`;
}

function renderPage(route) {
  if (route.startsWith('relatorio-')) return renderReportDetail(route.replace('relatorio-',''));
  const renderers = {
    solicitacoes: renderRequests,
    'nova-solicitacao': () => renderNewRequest(false),
    'nova-compra-direta': () => renderNewRequest(true),
    'revisar-solicitacao': () => renderReview(false),
    'revisar-compra-direta': () => renderReview(true),
    'solicitacao-finalizada': renderConfirmation,
    'solicitacao-detalhe': renderRequestDetail,
    cotacoes: renderQuotes,
    'cotacao-gestao': renderQuoteManagement,
    'portal-fornecedor': renderPublicPortal,
    pedidos: renderOrders,
    'pedido-detalhe': renderOrderDetail,
    delegacao: renderDelegation,
    fornecedores: renderSuppliers,
    insumos: () => renderMasterData('insumos'),
    categorias: () => renderMasterData('categorias'),
    unidades: () => renderMasterData('unidades'),
    apropriacoes: () => renderMasterData('apropriacoes'),
    relatorios: renderReportsHub,
    'config-cotacoes': renderConfigQuotes,
    'config-status': renderConfigStatus
  };
  return (renderers[route] || renderRequests)();
}

function routeTitle(route) {
  if (route.startsWith('relatorio-')) {
    const report = reportDefinitions.find((item) => item[0] === route.replace('relatorio-',''));
    return ['COMPRAS · RELATÓRIOS', report?.[1] || 'Relatório'];
  }
  return routeMeta[route] || routeMeta.solicitacoes;
}

function render() {
  const route = (location.hash || '#solicitacoes').slice(1).split('?')[0];
  state.route = route || 'solicitacoes';
  const [eyebrow,title] = routeTitle(state.route);
  topbarEyebrow.textContent = eyebrow;
  topbarTitle.textContent = title;
  document.title = `Fluxy · ${title}`;
  document.body.classList.toggle('public-mode', state.route === 'portal-fornecedor');
  pageHost.innerHTML = renderPage(state.route);
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: 'instant' }));
  renderNavigation();
  appShell.classList.remove('sidebar-open');
  applyComparisonView();
}

function navigate(route) {
  if (location.hash === `#${route}`) render();
  else location.hash = route;
}

function toast(message) {
  const element = document.createElement('div');
  element.className = 'toast';
  element.textContent = message;
  toastRegion.appendChild(element);
  window.setTimeout(() => element.remove(), 3000);
}

function openDialog(type) {
  const definitions = {
    'edit-response': ['COTAÇÃO · RESPOSTA INTERNA','Editar resposta do fornecedor', `<div class="form-grid"><div class="form-field col-6"><label>Fornecedor</label><input class="input" value="BR Shopper Ltda" disabled></div><div class="form-field col-3"><label>Prazo de entrega</label><input class="input" value="5 dias úteis"></div><div class="form-field col-3"><label>Data para todos</label><input class="input" type="date" value="2026-07-30"></div><div class="form-field col-6"><label>Condição de pagamento</label><select class="select"><option>Cartão</option><option>Boleto 28 dias</option></select></div><div class="form-field col-6"><label>Valor mínimo</label><input class="input" value="R$ 1.000,00"></div><div class="form-field col-12"><label>Observação geral</label><textarea class="textarea">Frete incluso.</textarea></div></div>${itemEditor()}`],
    'edit-supplier': ['CADASTROS · FORNECEDOR','Editar fornecedor', `<div class="form-grid"><div class="form-field col-8"><label>Razão social / nome</label><input class="input" value="BR Shopper Ltda"></div><div class="form-field col-4"><label>CNPJ</label><input class="input" value="11.974.223/0001-99"></div><div class="form-field col-6"><label>WhatsApp</label><input class="input" value="(11) 97422-3599"></div><div class="form-field col-6"><label>E-mail</label><input class="input" value="comercial@brshopper.com.br"></div><div class="form-field col-8"><label>Cidade</label><input class="input" value="São Paulo"></div><div class="form-field col-4"><label>UF</label><select class="select"><option>SP</option></select></div></div>`],
    'change-status': ['PEDIDOS · PC-00045','Alterar status do pedido', `<div class="form-grid"><div class="form-field col-12"><label>Novo status</label><select class="select"><option>Fechado com fornecedor</option><option>Em negociação</option><option>Cancelado</option></select></div><div class="form-field col-12"><label>Observação</label><textarea class="textarea" placeholder="Contexto da alteração"></textarea></div></div>`],
    'open-rateio': ['SOLICITAÇÕES · RATEIO','Editar rateio do item', `<div class="section-stack"><div class="config-row"><div class="form-field"><label>Obra</label><select class="select"><option>Residencial Acácia</option></select></div><div class="form-field"><label>Apropriação</label><select class="select"><option>HID-03 · Instalações hidráulicas</option></select></div><div class="form-field"><label>Percentual</label><input class="input" value="100%"></div><div>${button('Remover','notify','danger')}</div></div><div class="summary-item"><span>Total distribuído</span><strong>100%</strong></div></div>`],
    'edit-delegation': ['GOVERNANÇA · DELEGAÇÃO','Editar delegação', `<div class="form-grid"><div class="form-field col-6"><label>Usuário</label><select class="select"><option>Marina Costa</option></select></div><div class="form-field col-6"><label>Escopo</label><select class="select"><option>Obras selecionadas</option></select></div><div class="form-field col-12"><label>Obras</label><select class="select" multiple size="4"><option selected>Edifício Quaresmeira</option><option selected>Residencial Acácia</option><option>Escola Água Doce</option></select></div></div>`],
    'add-item': ['SOLICITAÇÕES · ITENS','Adicionar item', `<div class="form-grid"><div class="form-field col-8"><label>Insumo</label><input class="input" placeholder="Digite para pesquisar"></div><div class="form-field col-4"><label>Quantidade</label><input class="input" value="1"></div><div class="form-field col-6"><label>Apropriação</label><select class="select"><option>HID-03 · Instalações hidráulicas</option></select></div><div class="form-field col-6"><label>Data necessária</label><input class="input" type="date" value="2026-07-30"></div><div class="form-field col-12"><label>Especificação</label><textarea class="textarea"></textarea></div></div>`],
    'open-item': ['COMPRAS · ITEM','Detalhes do item', `<div class="detail-grid"><div class="detail-pair"><span>Item</span><strong>Ralo antiespuma 100 mm</strong></div><div class="detail-pair"><span>Quantidade</span><strong>1 UN</strong></div><div class="detail-pair"><span>Apropriação</span><strong>HID-03</strong></div><div class="detail-pair"><span>Data necessária</span><strong>30/07/2026</strong></div></div>`],
    search: ['COMPRAS · PESQUISA','Buscar no módulo', `<div class="form-field"><label>Busca rápida</label><input class="input" id="globalSearchInput" placeholder="Pedido, solicitação, fornecedor ou item"></div><div class="report-grid" style="margin-top:14px"><button class="report-link" data-route="solicitacoes"><div><strong>SC-00154</strong><p>Materiais para fundação bloco B</p></div><span>Abrir →</span></button><button class="report-link" data-route="pedido-detalhe"><div><strong>PC-00045</strong><p>BR Shopper Ltda · R$ 28,84</p></div><span>Abrir →</span></button></div>`]
  };
  const [eyebrow,title,body] = definitions[type] || definitions['open-item'];
  dialogEyebrow.textContent = eyebrow;
  dialogTitle.textContent = title;
  dialogBody.innerHTML = body;
  dialogFooter.innerHTML = `${button('Cancelar','close-dialog')}${button('Salvar','save-dialog','primary')}`;
  dialogBackdrop.hidden = false;
  document.body.style.overflow = 'hidden';
  window.setTimeout(() => document.getElementById('globalSearchInput')?.focus(), 30);
}

function closeDialog() {
  dialogBackdrop.hidden = true;
  document.body.style.overflow = '';
}

function applyComparisonView() {
  const panel = document.querySelector('.comparison-panel');
  if (!panel) return;
  panel.classList.toggle('comparison-mode-cards', state.comparisonView === 'cards');
  panel.classList.toggle('comparison-mode-table', state.comparisonView === 'table');
}

document.addEventListener('click', (event) => {
  const routeTarget = event.target.closest('[data-route]');
  if (routeTarget) {
    navigate(routeTarget.dataset.route);
    if (!dialogBackdrop.hidden) closeDialog();
    return;
  }

  const actionTarget = event.target.closest('[data-action]');
  if (!actionTarget) return;
  const action = actionTarget.dataset.action;
  const simpleDialogs = ['edit-response','edit-supplier','change-status','open-rateio','edit-delegation','add-item','open-item'];
  if (simpleDialogs.includes(action)) return openDialog(action);
  if (action === 'open-sidebar') appShell.classList.add('sidebar-open');
  if (action === 'close-sidebar') appShell.classList.remove('sidebar-open');
  if (action === 'toggle-sidebar') {
    state.sidebarCollapsed = !state.sidebarCollapsed;
    appShell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
    appShell.classList.toggle('sidebar-manual-open', !state.sidebarCollapsed);
    localStorage.setItem('fluxyMockSidebar', state.sidebarCollapsed ? 'collapsed' : 'expanded');
  }
  if (action === 'toggle-theme') {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    document.body.classList.toggle('theme-dark', state.theme === 'dark');
    localStorage.setItem('fluxyMockTheme', state.theme);
  }
  if (action === 'toggle-density') {
    state.density = state.density === 'compact' ? 'comfortable' : 'compact';
    document.body.classList.toggle('density-compact', state.density === 'compact');
    localStorage.setItem('fluxyMockDensity', state.density);
    toast(state.density === 'compact' ? 'Densidade compacta ativada.' : 'Densidade confortável ativada.');
  }
  if (action === 'dismiss-banner') actionTarget.closest('.prototype-banner')?.classList.add('is-hidden');
  if (action === 'toggle-filters') {
    const panelElement = actionTarget.closest('.filter-panel');
    panelElement?.classList.toggle('filters-open');
    actionTarget.textContent = panelElement?.classList.contains('filters-open') ? 'Ocultar filtros' : 'Exibir filtros';
  }
  if (action === 'focus-search') openDialog('search');
  if (action === 'close-dialog') closeDialog();
  if (action === 'save-dialog') { closeDialog(); toast('Alterações salvas no mockup.'); }
  if (action === 'search') toast('Filtros aplicados aos dados fictícios.');
  if (action === 'clear-filters') {
    actionTarget.closest('.filter-panel')?.querySelectorAll('input').forEach((input) => { input.value = ''; });
    toast('Filtros limpos.');
  }
  if (action === 'notify') toast('Interação demonstrativa — nenhuma alteração foi enviada ao sistema.');
  if (action === 'save-config') toast('Configuração salva apenas no mockup.');
  if (action === 'select-winner') toast('Fornecedor selecionado para este item.');
  if (action === 'generate-orders') {
    if (window.confirm('Todo o saldo foi selecionado. Confirmar o encerramento e a geração dos pedidos?')) {
      toast('Pedidos gerados no cenário demonstrativo.');
      window.setTimeout(() => navigate('pedidos'), 500);
    }
  }
  if (action === 'submit-quote') {
    toast('Proposta enviada no cenário demonstrativo.');
    window.setTimeout(() => navigate('cotacao-gestao'), 500);
  }
  if (action === 'comparison-cards' || action === 'comparison-table') {
    state.comparisonView = action === 'comparison-cards' ? 'cards' : 'table';
    render();
  }
});

document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openDialog('search');
  }
  if (event.key === 'Escape') {
    if (!dialogBackdrop.hidden) closeDialog();
    appShell.classList.remove('sidebar-open');
  }
});

window.addEventListener('hashchange', render);

document.body.classList.toggle('theme-dark', state.theme === 'dark');
document.body.classList.toggle('density-compact', state.density === 'compact');
appShell.classList.toggle('sidebar-collapsed', state.sidebarCollapsed);
appShell.classList.toggle('sidebar-manual-open', !state.sidebarCollapsed);
render();
