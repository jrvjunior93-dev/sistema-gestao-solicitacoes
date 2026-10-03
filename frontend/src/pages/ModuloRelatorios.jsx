import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUiVisibility } from '../hooks/useUiVisibility';
import { BlocoConteudo, Pagina, PageHeader } from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {
  canAccessContratos,
  canExecuteRhDpImportacoes,
  canViewComprasCotacoes,
  canViewComprasPedidos,
  canViewComercialContratos,
  canViewComercialEmpreendimentos,
  canViewCrmDashboard,
  canViewFiscalDocuments,
  canViewFiscalLogs,
  canViewProvisionamentos,
  canViewProvisionamentosDashboard,
  canViewRhDpApuracao,
  canViewRhDpColaboradores,
  canViewRhDpObrigacoes,
  canViewSolicitacoesRelatorioOperacional,
  canViewSolicitacoesRelatorios,
  canViewSstDashboard,
  hasPermissao,
  isBusinessAdmin
} from '../utils/acessoProduto';

const PERMISSIONS = {
  businessAdmin: isBusinessAdmin,
  comprasCotacoes: canViewComprasCotacoes,
  comprasPedidos: canViewComprasPedidos,
  contratos: canAccessContratos,
  comercialContratos: canViewComercialContratos,
  comercialEmpreendimentos: canViewComercialEmpreendimentos,
  crmDashboard: canViewCrmDashboard,
  fiscalDocuments: canViewFiscalDocuments,
  fiscalLogs: canViewFiscalLogs,
  provisoesDashboard: canViewProvisionamentosDashboard,
  provisoesLista: canViewProvisionamentos,
  rhDpApuracao: canViewRhDpApuracao,
  rhDpColaboradores: canViewRhDpColaboradores,
  rhDpImportacoes: canExecuteRhDpImportacoes,
  rhDpObrigacoes: canViewRhDpObrigacoes,
  solicitacoesRelatorioOperacional: canViewSolicitacoesRelatorioOperacional,
  solicitacoesRelatorios: canViewSolicitacoesRelatorios,
  sstDashboard: canViewSstDashboard
};

/*
  ESTE ARQUIVO SERVE NOVE MÓDULOS (App.jsx: solicitacoes, compras, fiscal,
  crm, comercial, provisionamento, rhdp, sst, contratos). Cada bloco de
  HUBS abaixo é a configuração de UM módulo, e a moldura (Pagina +
  PageHeader + BlocoConteudo) é a MESMA para os nove — mexer nela muda a
  cara dos relatórios do sistema inteiro.

  D7 (decisão do cliente): o título NÃO repete o módulo. Os nove títulos
  são "Relatórios"; quem situa o módulo é o breadcrumb (e, hoje, o rótulo
  `modulo`, que segue visível no apoio do cabeçalho até o cliente decidir).

  `permissao`, `permissaoKey`, `componentKey`, `status` e `to` são contrato
  com o backend e com o controle de visibilidade (useUiVisibility): NÃO
  mudam. Por isso `status` continua sem acento ('Disponivel') no dado e
  ganha acento só na EXIBIÇÃO (ROTULO_STATUS, abaixo).
*/
const HUBS = {
  solicitacoes: {
    modulo: 'Solicitações',
    titulo: 'Relatórios',
    descricao: 'Fluxo operacional, gargalos, SLA e produtividade por setor, usuário e centro de custo.',
    secoes: [
      {
        titulo: 'Operação',
        itens: [
          { titulo: 'Painel operacional', descricao: 'Volume, funil, gargalos e distribuição por status, setor e obra/centro.', to: '/solicitacoes/relatorios/operacional', status: 'Disponivel', permissao: 'solicitacoesRelatorioOperacional', permissaoKey: 'solicitacoes.relatorios.operacional', componentKey: 'relatorios.solicitacoes.operacional' },
          { titulo: 'Solicitações abertas', descricao: 'Base operacional para filtros por status, setor, tipo e responsável.', to: '/solicitacoes', status: 'Disponivel', permissao: 'solicitacoesRelatorios', permissaoKey: 'solicitacoes.relatorios.abertas', componentKey: 'relatorios.solicitacoes.abertas' },
          { titulo: 'Solicitações arquivadas', descricao: 'Histórico de solicitações encerradas ou fora da fila operacional.', to: '/solicitacoes-arquivadas', status: 'Disponivel', permissao: 'solicitacoesRelatorios', permissaoKey: 'solicitacoes.relatorios.arquivadas', componentKey: 'relatorios.solicitacoes.arquivadas' },
          { titulo: 'SLA por setor', descricao: 'Configuração real de prazos por setor para leitura do painel operacional.', to: '/solicitacoes-sla-setor', status: 'Disponivel', permissao: 'businessAdmin', permissaoKey: 'solicitacoes.relatorios.sla_setor', componentKey: 'relatorios.solicitacoes.sla_setor' }
        ]
      },
      {
        titulo: 'Gestão',
        itens: [
          { titulo: 'Funil de solicitações', descricao: 'Criadas, assumidas, enviadas, aprovadas, concluídas e arquivadas.', status: 'Planejado', permissao: 'solicitacoesRelatorios', permissaoKey: 'solicitacoes.relatorios.funil', componentKey: 'relatorios.solicitacoes.funil' },
          { titulo: 'Volume por obra/centro de custo', descricao: 'Demanda operacional por origem de custo.', status: 'Planejado', permissao: 'solicitacoesRelatorios', permissaoKey: 'solicitacoes.relatorios.volume_obra_centro', componentKey: 'relatorios.solicitacoes.volume_obra_centro' }
        ]
      }
    ]
  },
  compras: {
    modulo: 'Compras',
    titulo: 'Relatórios',
    descricao: 'Demanda, pedidos, cotações, fornecedores, economia e auditoria do ciclo de suprimentos.',
    secoes: [
      {
        titulo: 'Relatórios disponíveis',
        itens: [
          { titulo: 'Auditoria de compras', descricao: 'Acompanhamento administrativo de compras e evidências do processo.', to: '/compras/relatorios/auditoria', status: 'Disponivel', permissao: 'businessAdmin', componentKey: 'relatorios.compras.auditoria' },
          { titulo: 'Demanda e pedidos', descricao: 'Solicitações e pedidos por status, obra/centro e valor pedido.', to: '/compras/relatorios/demanda-pedidos', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.demanda_pedidos' },
          { titulo: 'Evolução mensal', descricao: 'Curva mensal de compras emitidas por valor, pedidos, obras e status.', to: '/compras/relatorios/evolucao', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.evolucao' },
          { titulo: 'Compras diretas', descricao: 'Usuários, credores, itens, obras e volume financeiro das compras diretas.', to: '/compras/relatorios/compras-diretas', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.compras_diretas' },
          { titulo: 'Compras por fornecedor', descricao: 'Valor efetivamente pedido por fornecedor, obra/centro, status e pedido emitido.', to: '/compras/relatorios/compras-fornecedor', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.compras_fornecedor' },
          { titulo: 'Categorias e insumos', descricao: 'Valor pedido por categoria, insumo e obra/centro com base nos itens dos pedidos.', to: '/compras/relatorios/categorias-insumos', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.categorias_insumos' },
          { titulo: 'Preços por insumo', descricao: 'Preço médio de compra por insumo e fornecedor a partir dos itens reais dos pedidos.', to: '/compras/relatorios/precos-insumos', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.precos_insumos' },
          { titulo: 'Cotações', descricao: 'Lista de cotações, status de resposta e encerramento.', to: '/cotacoes', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.cotacoes' },
          { titulo: 'Pedidos de compra', descricao: 'Pedidos emitidos, status e detalhamento por fornecedor.', to: '/pedidos-compra', status: 'Disponivel', permissao: 'comprasPedidos', componentKey: 'relatorios.compras.pedidos_compra' },
          { titulo: 'Economia em cotações', descricao: 'Comparativo entre menor preço disponível e vencedor selecionado.', to: '/compras/relatorios/economia-cotacoes', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.economia_cotacoes' },
          { titulo: 'Pendências de cotações', descricao: 'Cotações sem mínimo de respostas e fornecedores com prazo vencido sem retorno.', to: '/compras/relatorios/pendencias-cotacoes', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.pendencias_cotacoes' },
          { titulo: 'Fornecedores', descricao: 'Ranking por volume, resposta, prazo médio e recorrência nas cotações.', to: '/compras/relatorios/fornecedores', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.fornecedores' },
          { titulo: 'Ciclo de compras', descricao: 'Tempo médio entre solicitação, cotação, encerramento e pedido.', to: '/compras/relatorios/ciclo', status: 'Disponivel', permissao: 'comprasCotacoes', componentKey: 'relatorios.compras.ciclo' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: []
      }
    ]
  },
  fiscal: {
    modulo: 'Fiscal',
    titulo: 'Relatórios',
    descricao: 'Documentos, XMLs, divergências, eventos e regularidade fiscal por empresa e fornecedor.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Painel operacional fiscal', descricao: 'Documentos, vínculos confirmados, divergências abertas e arquivos fiscais por período.', to: '/fiscal/relatorios/operacional', status: 'Disponivel', permissao: 'fiscalDocuments', componentKey: 'relatorios.fiscal.operacional' },
          { titulo: 'Documentos fiscais', descricao: 'Caixa de DFe importados e documentos vinculados.', to: '/fiscal/documentos', status: 'Disponivel', permissao: 'fiscalDocuments', componentKey: 'relatorios.fiscal.documentos' },
          { titulo: 'Divergências fiscais', descricao: 'Pendências entre fiscal, compras e financeiro.', to: '/fiscal/divergencias', status: 'Disponivel', permissao: 'fiscalDocuments', componentKey: 'relatorios.fiscal.divergencias' },
          { titulo: 'Logs de sincronização', descricao: 'Auditoria de chamadas SEFAZ e importações manuais.', to: '/fiscal/logs', status: 'Disponivel', permissao: 'fiscalLogs', componentKey: 'relatorios.fiscal.logs' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Documentos sem vínculo', descricao: 'XMLs que ainda precisam de solicitação, pedido, título ou centro de custo.', status: 'Planejado' },
          { titulo: 'Regularidade por fornecedor', descricao: 'Ranking de divergências e recorrência fiscal.', status: 'Planejado' }
        ]
      }
    ]
  },
  crm: {
    modulo: 'CRM',
    titulo: 'Relatórios',
    descricao: 'Leads, conversão, atendimento, SLA, carteira e produtividade comercial.',
    secoes: [
      {
        titulo: 'Dashboards disponíveis',
        itens: [
          { titulo: 'Executivo CRM', descricao: 'Consolida conversão, carteira, SLA e distribuição para leitura da diretoria.', to: '/crm/relatorios/executivo', status: 'Disponivel', permissao: 'crmDashboard', componentKey: 'relatorios.crm.executivo' },
          { titulo: 'Dashboard CRM', descricao: 'Visão principal de leads e atividades.', to: '/crm/dashboard', status: 'Disponivel', permissao: 'crmDashboard', componentKey: 'relatorios.crm.dashboard' },
          { titulo: 'Gerencial', descricao: 'Indicadores gerenciais de carteira e conversão.', to: '/crm/dashboard-gerencial', status: 'Disponivel', permissao: 'crmDashboard', componentKey: 'relatorios.crm.gerencial' },
          { titulo: 'SLA', descricao: 'Tempo de atendimento, atraso e cumprimento de prazos.', to: '/crm/dashboard-sla', status: 'Disponivel', permissao: 'crmDashboard', componentKey: 'relatorios.crm.sla' },
          { titulo: 'Distribuição', descricao: 'Distribuição de leads e carga por responsável.', to: '/crm/dashboard-distribuicao', status: 'Disponivel', permissao: 'crmDashboard', componentKey: 'relatorios.crm.distribuicao' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Funil de conversão', descricao: 'Conversão por etapa, origem, canal e responsável.', status: 'Planejado' },
          { titulo: 'Produtividade comercial', descricao: 'Tarefas, contatos, contratos gerados e perdas.', status: 'Planejado' }
        ]
      }
    ]
  },
  comercial: {
    modulo: 'Comercial',
    titulo: 'Relatórios',
    descricao: 'Empreendimentos, unidades, contratos de venda, estoque, VGV e evolução comercial.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Painel comercial operacional', descricao: 'Contratos, VGV, unidades, estoque e documentos por empreendimento e obra.', to: '/comercial/relatorios/operacional', status: 'Disponivel', permissao: 'comercialContratos', componentKey: 'relatorios.comercial.operacional' },
          { titulo: 'Mapa de unidades', descricao: 'Estoque comercial e situação das unidades.', to: '/comercial/mapa-unidades', status: 'Disponivel', permissao: 'comercialEmpreendimentos', componentKey: 'relatorios.comercial.mapa_unidades' },
          { titulo: 'Contratos de venda', descricao: 'Carteira de contratos e situação comercial.', to: '/comercial/contratos', status: 'Disponivel', permissao: 'comercialContratos', componentKey: 'relatorios.comercial.contratos' },
          { titulo: 'Tabelas de preço', descricao: 'Preços por empreendimento e unidade.', to: '/comercial/tabelas-preco', status: 'Disponivel', permissao: 'comercialEmpreendimentos', componentKey: 'relatorios.comercial.tabelas_preco' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'VGV vendido x estoque', descricao: 'Resultado comercial por empreendimento e fase.', status: 'Planejado' },
          { titulo: 'Distratos e trocas', descricao: 'Eventos comerciais que afetam receita e carteira.', status: 'Planejado' }
        ]
      }
    ]
  },
  provisionamento: {
    modulo: 'Provisionamento',
    titulo: 'Relatórios',
    descricao: 'Previsões financeiras, compromissos futuros, categorias macro e impacto de caixa.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Painel operacional', descricao: 'Pressão futura, vencidos não tratados, prioridades e concentração por obra e categoria.', to: '/provisoes-financeiras/relatorios/operacional', status: 'Disponivel', permissao: 'provisoesDashboard', componentKey: 'relatorios.provisionamento.operacional' },
          { titulo: 'Dashboard de previsão', descricao: 'Resumo gerencial das provisões financeiras.', to: '/provisoes-financeiras/dashboard', status: 'Disponivel', permissao: 'provisoesDashboard', componentKey: 'relatorios.provisionamento.dashboard' },
          { titulo: 'Provisionamentos', descricao: 'Lista analítica de provisões e status.', to: '/provisoes-financeiras', status: 'Disponivel', permissao: 'provisoesLista', componentKey: 'relatorios.provisionamento.lista' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Integração com fluxo consolidado', descricao: 'Comparar provisão, título financeiro e baixa efetiva no fluxo de caixa.', status: 'Planejado' },
          { titulo: 'Empresa do grupo', descricao: 'Separar provisões por empresa quando a obra/centro estiver plenamente vinculada.', status: 'Planejado' }
        ]
      }
    ]
  },
  rhdp: {
    modulo: 'RH/DP',
    titulo: 'Relatórios',
    descricao: 'Colaboradores, documentos, importações, apurações, fechamentos e obrigações.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Painel operacional RH/DP', descricao: 'Headcount, documentos críticos, apurações, fechamentos e base cadastrada.', to: '/rh-dp/relatorios/operacional', status: 'Disponivel', permissao: 'rhDpColaboradores', componentKey: 'relatorios.rhdp.operacional' },
          { titulo: 'Apuração', descricao: 'Pré-folha, eventos e ajustes por competência.', to: '/rh-dp/apuracao', status: 'Disponivel', permissao: 'rhDpApuracao', componentKey: 'relatorios.rhdp.apuracao' },
          { titulo: 'Fechamentos', descricao: 'Competências fechadas e títulos gerados ao financeiro.', to: '/rh-dp/fechamentos', status: 'Disponivel', permissao: 'rhDpObrigacoes', componentKey: 'relatorios.rhdp.fechamentos' },
          { titulo: 'Importações', descricao: 'Histórico de importações e lotes processados.', to: '/rh-dp/importacoes', status: 'Disponivel', permissao: 'rhDpImportacoes', componentKey: 'relatorios.rhdp.importacoes' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Obrigações por vencimento', descricao: 'Agenda gerencial de pagamentos e obrigações de DP.', status: 'Planejado' },
          { titulo: 'Custo de mão de obra', descricao: 'Custo por empresa, obra, centro de custo e tipo de vínculo.', status: 'Planejado' }
        ]
      }
    ]
  },
  sst: {
    modulo: 'SST',
    titulo: 'Relatórios',
    descricao: 'Conformidade, vencimentos, riscos, ASO, EPIs, treinamentos, acidentes e base futura para eSocial.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Dashboard SST', descricao: 'Score de conformidade, riscos críticos, inaptos e vencimentos próximos.', to: '/sst', status: 'Disponivel', permissao: 'sstDashboard', permissaoKey: 'sst.dashboard.visualizar', componentKey: 'relatorios.sst.dashboard' },
          { titulo: 'Operacional SST', descricao: 'Conformidade, eventos abertos, auditoria, riscos críticos e prontidão técnica eSocial.', to: '/sst/relatorios/operacional', status: 'Disponivel', permissao: 'sstDashboard', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.operacional' },
          { titulo: 'Riscos ocupacionais', descricao: 'Base operacional de riscos por empresa, obra, setor e função.', to: '/sst/riscos', status: 'Disponivel', permissaoKey: 'sst.riscos.visualizar', componentKey: 'relatorios.sst.riscos' },
          { titulo: 'ASO e exames', descricao: 'Aptidão, exames vencidos/vencendo e restrições por colaborador.', to: '/sst/aso', status: 'Disponivel', permissaoKey: 'sst.aso.visualizar', componentKey: 'relatorios.sst.aso' },
          { titulo: 'EPI e treinamentos', descricao: 'Entregas, certificados, NRs e vencimentos críticos.', to: '/sst/epi', status: 'Disponivel', permissaoKey: 'sst.epi.visualizar', componentKey: 'relatorios.sst.epi' },
          { titulo: 'Acidentes e incidentes', descricao: 'Ocorrências, gravidade, CAT, afastamento e obra impactada.', to: '/sst/acidentes', status: 'Disponivel', permissaoKey: 'sst.acidentes.visualizar', componentKey: 'relatorios.sst.acidentes' },
          { titulo: 'Eventos operacionais', descricao: 'Alertas gerados pelo backend para rastreabilidade, automações futuras e auditoria SST.', to: '/sst/eventos', status: 'Disponivel', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.eventos' },
          { titulo: 'Executivo SST', descricao: 'Compliance geral, bloqueios, pendências, obras críticas e prontidão preditiva.', to: '/sst/relatorios/executivo', status: 'Disponivel', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.executivo' },
          { titulo: 'Centro operacional SST', descricao: 'Visão corporativa multiempresa com score, sinais, automações e recomendações.', to: '/sst/relatorios/centro-operacional', status: 'Disponivel', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.centro_operacional' },
          { titulo: 'Observabilidade SST', descricao: 'Logs, feature flags, checklist de homologação e saúde operacional do módulo.', to: '/sst/observabilidade', status: 'Disponivel', permissaoKey: 'sst.observabilidade.visualizar', componentKey: 'relatorios.sst.observabilidade' },
          { titulo: 'Produção controlada SST', descricao: 'Rollout assistido, telemetria, hardening, alertas e readiness operacional.', to: '/sst/producao', status: 'Disponivel', permissaoKey: 'sst.producao.visualizar', componentKey: 'relatorios.sst.producao_controlada' },
          { titulo: 'Observabilidade avançada SST', descricao: 'Filas, jobs, cache, quality checks, governança e readiness enterprise.', to: '/sst/observabilidade-avancada', status: 'Disponivel', permissaoKey: 'sst.enterprise.visualizar', componentKey: 'relatorios.sst.observabilidade_avancada' },
          { titulo: 'Recomendações SST', descricao: 'Recomendações operacionais geradas por heatmap, score e pendências críticas.', to: '/sst/recomendacoes', status: 'Disponivel', permissaoKey: 'sst.recomendacoes.visualizar', componentKey: 'relatorios.sst.recomendacoes' },
          { titulo: 'Mapa de risco e heatmap', descricao: 'Mapa executivo por obra, pendências, bloqueios, acidentes e riscos.', to: '/sst/relatorios/heatmap', status: 'Disponivel', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.mapa_risco' },
          { titulo: 'Timeline do colaborador', descricao: 'Histórico unificado de ASO, EPI, treinamentos, acidentes, bloqueios e pendências.', to: '/sst/timeline', status: 'Disponivel', permissaoKey: 'sst.analytics.visualizar', componentKey: 'relatorios.sst.timeline' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Prontidão eSocial SST', descricao: 'Pendências para S-2210, S-2220 e S-2240 antes da transmissão oficial.', status: 'Planejado', componentKey: 'relatorios.sst.esocial_prontidao' }
        ]
      }
    ]
  },
  contratos: {
    modulo: 'Contratos',
    titulo: 'Relatórios',
    descricao: 'Contratos vinculados a solicitações, prazos, vencimentos, valores e documentos.',
    secoes: [
      {
        titulo: 'Disponíveis',
        itens: [
          { titulo: 'Painel operacional de contratos', descricao: 'Contratos por status, empresa, obra/centro, valores, saldos e pendências cadastrais.', to: '/contratos/relatorios/operacional', status: 'Disponivel', permissao: 'contratos', componentKey: 'relatorios.contratos.operacional' },
          { titulo: 'Gestão de contratos', descricao: 'Base operacional de contratos, anexos e vínculos.', to: '/gestao-contratos', status: 'Disponivel', permissao: 'contratos', componentKey: 'relatorios.contratos.gestao' }
        ]
      },
      {
        titulo: 'Próximas visões',
        itens: [
          { titulo: 'Contratos a vencer', descricao: 'Prazos, renovações, reajustes e alertas por responsável após cadastro estruturado de vencimento.', status: 'Planejado' },
          { titulo: 'Saldo contratual detalhado', descricao: 'Abertura dos compromissos por contrato, solicitação vinculada e comprovantes.', status: 'Planejado' }
        ]
      }
    ]
  }
};

/*
  O DADO `status` é contrato (não muda); o RÓTULO é o que a pessoa lê.
  Só 'Disponivel' precisa de acento — 'Planejado' já está correto e cai no
  fallback.
*/
const ROTULO_STATUS = {
  Disponivel: 'Disponível'
};

/*
  CARTÃO DE DESTINO — é um BlocoConteudo secundário (superfície rebaixada
  dentro do bloco da seção): título de bloco, apoio no `descricao` e a
  etiqueta de status no lugar das ações. Nenhuma paleta crua do Tailwind:
  a pílula é a StatusBadge do sistema (fundo suave por token semântico +
  ícone, porque cor sozinha não comunica para daltônicos).

  Quem tem `to` abre; quem não tem é visão planejada e continua legível,
  só não é clicável. A affordance do clicável (R15) mora no Link: cursor,
  sombra no hover e contorno de foco visível — que é também o caminho por
  TECLADO (A1): o cartão inteiro é um link focável.
*/
function CartaoRelatorio({ item }) {
  const disponivel = Boolean(item.to);
  const bloco = (
    <BlocoConteudo
      titulo={item.titulo}
      descricao={item.descricao}
      variante="secundario"
      className="h-full"
      acoes={(
        <StatusBadge
          status={ROTULO_STATUS[item.status] || item.status}
          kind={disponivel ? 'success' : 'neutral'}
        />
      )}
    />
  );

  if (!disponivel) return bloco;

  return (
    <Link
      to={item.to}
      title={`Abrir ${item.titulo}`}
      className="block h-full rounded-[var(--raio-3)] transition hover:shadow-[shadow:var(--ui-shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary)]"
    >
      {bloco}
    </Link>
  );
}

export default function ModuloRelatorios({ modulo }) {
  const { user } = useAuth();
  const { isVisible } = useUiVisibility();
  const hub = HUBS[modulo] || HUBS.solicitacoes;
  const podeVerItem = (item) => {
    if (item.componentKey && !isVisible(item.componentKey)) {
      return false;
    }

    if (item.permissao) {
      const check = PERMISSIONS[item.permissao];
      if (typeof check === 'function' && !check(user)) {
        return false;
      }
    }

    if (item.permissaoKey) {
      return hasPermissao(user, item.permissaoKey);
    }

    return true;
  };

  // Quantas visões ESTE usuário pode abrir. Conta os itens visíveis de
  // todas as seções, não o total do arquivo: quem não tem o acesso não
  // deve ler um número que não corresponde ao que a tela mostra.
  const visoesDisponiveis = hub.secoes.reduce(
    (soma, secao) => soma + secao.itens.filter(podeVerItem).length,
    0
  );

  return (
    <Pagina>
      {/*
        D7: o título é só "Relatórios" nos nove módulos — o breadcrumb já
        diz de qual módulo se trata.

        O rótulo do módulo que existia como eyebrow ACIMA do título não foi
        removido (remover elemento visível depende do cliente): ele passou
        para o apoio da faixa, em `contagem`, onde continua visível na
        rolagem e sem gastar uma segunda linha (C2). Proposta registrada no
        relato: sair de vez, por ser exatamente o que o breadcrumb mostra.
      */}
      {/*
        `contagem` recebia o NOME DO MÓDULO — e a C2 reprovou, com razão:
        contagem é quanta coisa a tela tem, e o usuário lê ali para saber o
        tamanho do que veio. Texto no lugar do número esvazia o sinal. Agora
        conta as visões que ESTE usuário pode abrir (não o total do
        arquivo): duas pessoas com acessos diferentes veem números
        diferentes, e é assim que tem de ser. O nome do módulo foi para a
        descrição, onde continua visível.
      */}
      <PageHeader
        titulo={hub.titulo}
        contagem={`${visoesDisponiveis} visão${visoesDisponiveis === 1 ? '' : 'ões'} disponível${visoesDisponiveis === 1 ? '' : 'eis'}`}
        descricao={`${hub.modulo} · ${hub.descricao}`}
      />

      {hub.secoes.map((secao, indice) => {
        const visiveis = secao.itens.filter(podeVerItem);
        return (
          <BlocoConteudo
            key={secao.titulo}
            titulo={secao.titulo}
            /* B2: um primário por tela — o primeiro grupo é o que responde
               "o que dá para abrir agora"; os demais recuam em neutro. */
            variante={indice === 0 ? 'primario' : 'neutro'}
            cor={indice === 0 ? 'var(--c-primary)' : undefined}
            contagem={`${visiveis.length} ${visiveis.length === 1 ? 'visão' : 'visões'}`}
          >
            {visiveis.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visiveis.map((item) => (
                  <CartaoRelatorio key={item.titulo} item={item} />
                ))}
              </div>
            ) : (
              /*
                Grupo sem nada visível acontece de verdade: "Próximas
                visões" de Compras nasce vazia, e qualquer grupo pode zerar
                para um perfil sem permissão. Bloco vazio sem explicação é
                pior que bloco com uma linha dizendo o motivo.
              */
              <p className="text-sm text-[var(--c-muted)]">
                Nenhuma visão disponível para o seu acesso neste grupo.
              </p>
            )}
          </BlocoConteudo>
        );
      })}
    </Pagina>
  );
}
