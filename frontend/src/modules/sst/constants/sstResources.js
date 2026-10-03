/*
  MODO SIMPLIFICADO DESLIGADO POR DECISÃO DO CLIENTE (05/09).

  Ele nasceu LIGADO por padrão (`!== 'false'`), e o efeito era que 12 telas
  do SST existiam, tinham rota e guarda de permissão, e redirecionavam para
  /sst/pgr — enquanto o menu ainda as oferecia. Menu que mostra porta que
  não abre é pior que ausência: a pessoa clica, não acontece nada, e não
  sabe se é permissão, erro ou defeito.

  Numa primeira rodada o cliente mandou tirá-las do menu enquanto o modo
  estivesse ligado, e a visibilidade passou a sair DESTA MESMA constante,
  para as duas coisas nunca mais divergirem. Agora ele decidiu o fundo:
  **as 12 telas voltam**. Com o padrão invertido, o menu volta a oferecê-las
  e o redirecionamento some — pela mesma constante, sem tocar em mais nada.

  Quem quiser o modo simplificado de volta liga explicitamente, com
  `VITE_SST_SIMPLIFIED_MODE=true`. Inverter o padrão em vez de apagar a
  capacidade: o modo continua existindo, só não é mais o comportamento de
  quem não escolheu nada.
*/
export const SST_SIMPLIFIED_MODE = import.meta.env.VITE_SST_SIMPLIFIED_MODE === 'true';

export const SST_SIMPLIFIED_RESOURCES = new Set([
  'pgr',
  'pcmso',
  'aso',
  'exames',
  'epi',
  'treinamentos',
  'documentos',
  'ltcat',
  'avaliacoes_quantitativas'
]);

export const isSstResourceVisible = (resource) => (
  !SST_SIMPLIFIED_MODE || SST_SIMPLIFIED_RESOURCES.has(String(resource || '').toLowerCase())
);

export const SST_RESOURCES = {
  riscos: {
    title: 'Riscos ocupacionais',
    subtitle: 'Riscos por empresa, obra, setor e funcao.',
    area: 'riscos',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'nome', label: 'Risco', required: true },
      { key: 'categoria', label: 'Categoria' },
      { key: 'severidade', label: 'Severidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
      { key: 'probabilidade', label: 'Probabilidade', options: ['BAIXA', 'MEDIA', 'ALTA'] },
      { key: 'descricao', label: 'Descrição', type: 'textarea' },
      { key: 'ativo', label: 'Ativo', type: 'checkbox' }
    ],
    columns: ['nome', 'categoria', 'severidade', 'probabilidade', 'obra.nome']
  },
  agentes: {
    title: 'Agentes nocivos',
    subtitle: 'Agentes, tecnica de avaliacao e limite de tolerancia.',
    area: 'agentes',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'tipo_agente', label: 'Tipo de agente', required: true },
      { key: 'nome', label: 'Agente', required: true },
      { key: 'intensidade', label: 'Intensidade' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'tecnica_avaliacao', label: 'Técnica de avaliacao' },
      { key: 'limite_tolerancia', label: 'Limite de tolerância' },
      { key: 'ativo', label: 'Ativo', type: 'checkbox' }
    ],
    columns: ['nome', 'tipo_agente', 'intensidade', 'limite_tolerancia']
  },
  ambientes: {
    title: 'Ambientes de trabalho',
    subtitle: 'Ambientes, setores e locais operacionais para controle de exposição.',
    area: 'riscos',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'nome', label: 'Ambiente', required: true },
      { key: 'tipo_ambiente', label: 'Tipo de ambiente' },
      { key: 'local_amb', label: 'Local eSocial' },
      { key: 'esocial_tp_insc', label: 'Tipo inscrição eSocial' },
      { key: 'esocial_nr_insc', label: 'Inscrição eSocial' },
      { key: 'descricao', label: 'Descrição', type: 'textarea' },
      { key: 'ativo', label: 'Ativo', type: 'checkbox' }
    ],
    columns: ['nome', 'tipo_ambiente', 'local_amb', 'obra.nome']
  },
  exposicoes: {
    title: 'Exposição ocupacional',
    subtitle: 'Atividade, ambiente, agente nocivo, EPC/EPI e responsável técnico.',
    area: 'riscos',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores', required: true },
      { key: 'ambiente_id', label: 'Ambiente', type: 'selectRef', ref: 'ambientes' },
      { key: 'risco_id', label: 'Risco', type: 'selectRef', ref: 'riscos' },
      { key: 'agente_nocivo_id', label: 'Agente nocivo', type: 'selectRef', ref: 'agentes' },
      { key: 'data_inicio', label: 'Início', type: 'date', required: true },
      { key: 'data_fim', label: 'Fim', type: 'date' },
      { key: 'atividade_desempenhada', label: 'Atividade', type: 'textarea' },
      { key: 'codigo_agente_nocivo', label: 'Código agente' },
      { key: 'descricao_agente_nocivo', label: 'Descrição agente' },
      { key: 'intensidade', label: 'Intensidade' },
      { key: 'unidade_medida', label: 'Unidade' },
      { key: 'tecnica_medicao', label: 'Técnica medição' },
      { key: 'limite_tolerancia', label: 'Limite tolerância' },
      { key: 'utiliza_epc', label: 'Usa EPC', type: 'checkbox' },
      { key: 'epc_eficaz', label: 'EPC eficaz', type: 'checkbox' },
      { key: 'utiliza_epi', label: 'Usa EPI', type: 'checkbox' },
      { key: 'epi_eficaz', label: 'EPI eficaz', type: 'checkbox' },
      { key: 'epi_ca', label: 'CA do EPI' },
      { key: 'responsavel_tecnico_nome', label: 'Responsável técnico' },
      { key: 'responsavel_tecnico_cpf', label: 'CPF responsável' },
      { key: 'responsavel_tecnico_registro', label: 'Registro profissional' },
      { key: 'responsavel_tecnico_orgao', label: 'Órgão profissional' },
      { key: 'responsavel_tecnico_uf', label: 'UF' },
      { key: 'status', label: 'Status', options: ['ATIVA', 'ENCERRADA', 'EM_REVISAO'] },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['colaborador.nome', 'ambiente.nome', 'agenteNocivo.nome', 'data_inicio', 'status']
  },
  aso: {
    title: 'ASO',
    subtitle: 'Aptidao, restricoes, validade e medico responsavel.',
    area: 'aso',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores', required: true },
      { key: 'tipo_exame', label: 'Tipo de exame', options: ['ADMISSIONAL', 'PERIODICO', 'RETORNO', 'MUDANCA_FUNCAO', 'DEMISSIONAL'], required: true },
      { key: 'apto', label: 'Apto', type: 'checkbox' },
      { key: 'data_exame', label: 'Data do exame', type: 'date', required: true },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'medico', label: 'Medico' },
      { key: 'crm', label: 'CRM' },
      { key: 'uf_crm', label: 'UF CRM' },
      { key: 'restricoes', label: 'Restrições', type: 'textarea' }
    ],
    columns: ['colaborador.nome', 'tipo_exame', 'apto', 'data_exame', 'validade']
  },
  exames: {
    title: 'Exames ocupacionais',
    subtitle: 'Controle de exames por colaborador e validade.',
    area: 'exames',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores', required: true },
      { key: 'aso_id', label: 'ASO vinculado', type: 'selectRef', ref: 'asos' },
      { key: 'tipo_exame', label: 'Tipo', options: ['ADMISSIONAL', 'PERIODICO', 'RETORNO', 'MUDANCA_FUNCAO', 'DEMISSIONAL'], required: true },
      { key: 'nome_exame', label: 'Exame', required: true },
      { key: 'data_exame', label: 'Data', type: 'date' },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'resultado', label: 'Resultado' },
      { key: 'status', label: 'Status', options: ['PENDENTE', 'VALIDO', 'VENCIDO', 'DISPENSADO'] }
    ],
    columns: ['colaborador.nome', 'tipo_exame', 'nome_exame', 'validade', 'status']
  },
  epi: {
    title: 'Entregas de EPI',
    subtitle: 'Registro de entrega, CA, validade e comprovantes.',
    area: 'epi',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores', required: true },
      { key: 'epi_nome', label: 'EPI', required: true },
      { key: 'ca', label: 'CA' },
      { key: 'quantidade', label: 'Quantidade', type: 'number' },
      { key: 'entrega_em', label: 'Entrega', type: 'date', required: true },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'obrigatorio', label: 'Obrigatório', type: 'checkbox' },
      { key: 'funcao_alvo', label: 'Função alvo' },
      { key: 'status', label: 'Status', options: ['ENTREGUE', 'SUBSTITUIDO', 'DEVOLVIDO'] }
    ],
    columns: ['colaborador.nome', 'epi_nome', 'ca', 'entrega_em', 'validade']
  },
  treinamentos: {
    title: 'Treinamentos SST',
    subtitle: 'NRs, certificados, instrutor, carga horaria e validade.',
    area: 'treinamentos',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores', required: true },
      { key: 'codigo', label: 'Código/NR' },
      { key: 'nome', label: 'Treinamento', required: true },
      { key: 'data_inicio', label: 'Início', type: 'date' },
      { key: 'data_fim', label: 'Fim', type: 'date' },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'instrutor', label: 'Instrutor' },
      { key: 'carga_horaria', label: 'Carga horaria', type: 'number' },
      { key: 'obrigatorio', label: 'Obrigatório', type: 'checkbox' },
      { key: 'funcao_alvo', label: 'Função alvo' }
    ],
    columns: ['colaborador.nome', 'codigo', 'nome', 'validade', 'instrutor']
  },
  acidentes: {
    title: 'Acidentes e incidentes',
    subtitle: 'Registro operacional de ocorrencias, afastamento e CAT.',
    area: 'acidentes',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo', label: 'Tipo', options: ['ACIDENTE', 'INCIDENTE', 'QUASE_ACIDENTE'], required: true },
      { key: 'gravidade', label: 'Gravidade', options: ['LEVE', 'MODERADA', 'GRAVE', 'FATAL'], required: true },
      { key: 'local', label: 'Local' },
      { key: 'data_ocorrencia', label: 'Data', type: 'date', required: true },
      { key: 'agente_causador', label: 'Agente causador' },
      { key: 'situacao_geradora', label: 'Situação geradora' },
      { key: 'parte_corpo', label: 'Parte do corpo' },
      { key: 'cid', label: 'CID' },
      { key: 'afastamento', label: 'Afastamento', type: 'checkbox' },
      { key: 'dias_afastamento', label: 'Dias afastamento', type: 'number' },
      { key: 'cat_emitida', label: 'CAT emitida', type: 'checkbox' },
      { key: 'fotos_url', label: 'Fotos/Anexos URL' },
      { key: 'acoes_corretivas', label: 'Ações corretivas', type: 'textarea' },
      { key: 'descricao', label: 'Descrição', type: 'textarea', required: true }
    ],
    columns: ['data_ocorrencia', 'tipo', 'gravidade', 'colaborador.nome', 'cat_emitida']
  },
  regras: {
    title: 'Regras de conformidade',
    subtitle: 'Regras configuráveis para ASO, treinamentos, EPI e exposição.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Regra', required: true },
      { key: 'tipo_regra', label: 'Tipo', options: ['ASO_VALIDO', 'TREINAMENTO_OBRIGATORIO', 'EPI_OBRIGATORIO', 'EXPOSICAO_COMPATIVEL'], required: true },
      { key: 'funcao_alvo', label: 'Função alvo' },
      { key: 'treinamento_codigo', label: 'Código treinamento/NR' },
      { key: 'epi_nome', label: 'EPI obrigatório' },
      { key: 'severidade', label: 'Severidade', options: ['INFO', 'ALERTA', 'CRITICA'] },
      { key: 'ativo', label: 'Ativa', type: 'checkbox' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'tipo_regra', 'funcao_alvo', 'severidade', 'ativo']
  },
  politicas_bloqueio: {
    title: 'Politicas de bloqueio',
    subtitle: 'Regras de alerta, restricao e bloqueio critico por empresa, obra e funcao.',
    area: 'configuracoes',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Politica', required: true },
      { key: 'tipo_regra', label: 'Tipo de regra', options: ['ASO_VALIDO', 'TREINAMENTO_OBRIGATORIO', 'EPI_OBRIGATORIO', 'DOCUMENTO_VALIDO', 'EXPOSICAO_COMPATIVEL', 'CONFORMIDADE_GERAL'], required: true },
      { key: 'tipo_bloqueio', label: 'Tipo de bloqueio', options: ['ALERTA', 'RESTRICAO', 'BLOQUEIO_CRITICO'] },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
      { key: 'funcao_alvo', label: 'Função alvo' },
      { key: 'tipo_risco', label: 'Tipo de risco' },
      { key: 'ativo', label: 'Ativa', type: 'checkbox' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'tipo_regra', 'tipo_bloqueio', 'criticidade', 'ativo']
  },
  bloqueios: {
    title: 'Bloqueios operacionais',
    subtitle: 'Alertas, restricoes e bloqueios criticos gerados pelo motor SST.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_bloqueio', label: 'Tipo', options: ['ALERTA', 'RESTRICAO', 'BLOQUEIO_CRITICO'] },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
      { key: 'status', label: 'Status', options: ['ABERTO', 'RESOLVIDO', 'IGNORADO'] },
      { key: 'motivo', label: 'Motivo', type: 'textarea', required: true }
    ],
    columns: ['createdAt', 'tipo_bloqueio', 'criticidade', 'status', 'colaborador.nome', 'obra.nome', 'motivo']
  },
  notificacoes: {
    title: 'Notificacoes SST',
    subtitle: 'Central persistente de comunicacoes de pendencias, vencimentos e riscos.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_notificacao', label: 'Tipo', required: true },
      { key: 'prioridade', label: 'Prioridade', options: ['NORMAL', 'ALTA', 'URGENTE'] },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
      { key: 'status', label: 'Status', options: ['NAO_LIDA', 'LIDA', 'ARQUIVADA'] },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'mensagem', label: 'Mensagem', type: 'textarea', required: true }
    ],
    columns: ['createdAt', 'tipo_notificacao', 'prioridade', 'criticidade', 'status', 'titulo']
  },
  pendencias: {
    title: 'Pendencias operacionais',
    subtitle: 'Pendencias de ASO, treinamento, EPI, documentos, exposicao e conformidade.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_pendencia', label: 'Tipo', required: true },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] },
      { key: 'status', label: 'Status', options: ['ABERTA', 'EM_TRATAMENTO', 'RESOLVIDA', 'IGNORADA'] },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'prazo_limite', label: 'Prazo', type: 'date' },
      { key: 'descricao', label: 'Descrição', type: 'textarea' }
    ],
    columns: ['createdAt', 'tipo_pendencia', 'criticidade', 'status', 'colaborador.nome', 'obra.nome', 'titulo']
  },
  scores: {
    title: 'Scores de conformidade',
    subtitle: 'Score calculado por colaborador, obra, empresa ou setor.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'escopo_tipo', label: 'Escopo', options: ['COLABORADOR', 'OBRA', 'EMPRESA', 'SETOR'], required: true },
      { key: 'score', label: 'Score', type: 'number', required: true },
      { key: 'nivel', label: 'Nível', options: ['EXCELENTE', 'CONTROLADO', 'ATENCAO', 'CRITICO'] }
    ],
    columns: ['calculado_em', 'escopo_tipo', 'score', 'nivel', 'colaborador.nome', 'obra.nome']
  },
  criticidades: {
    title: 'Criticidades SST',
    subtitle: 'Tabela gerencial de pesos e niveis de criticidade operacional.',
    area: 'configuracoes',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Nome', required: true },
      { key: 'nivel', label: 'Nível', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'], required: true },
      { key: 'tipo_alvo', label: 'Alvo' },
      { key: 'peso', label: 'Peso', type: 'number' },
      { key: 'ativo', label: 'Ativa', type: 'checkbox' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'nivel', 'tipo_alvo', 'peso', 'ativo']
  },
  workflows: {
    title: 'Workflows SST',
    subtitle: 'Motor de orquestracao orientado a eventos operacionais.',
    area: 'configuracoes',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Workflow', required: true },
      { key: 'gatilho_evento', label: 'Evento gatilho', required: true },
      { key: 'escopo', label: 'Escopo', options: ['CORPORATIVO', 'EMPRESA', 'OBRA', 'COLABORADOR'] },
      { key: 'prioridade', label: 'Prioridade', options: ['BAIXA', 'NORMAL', 'ALTA', 'URGENTE'] },
      { key: 'ativo', label: 'Ativo', type: 'checkbox' },
      { key: 'descricao', label: 'Descrição', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'gatilho_evento', 'escopo', 'prioridade', 'ativo']
  },
  workflow_acoes: {
    title: 'Acoes de workflow',
    subtitle: 'Acoes permitidas para o motor de automacoes SST.',
    area: 'configuracoes',
    fields: [
      { key: 'workflow_id', label: 'Workflow ID', type: 'number', required: true },
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Ação', required: true },
      { key: 'tipo_acao', label: 'Tipo', options: ['REVISAR_CONFORMIDADE', 'AVALIAR_BLOQUEIOS', 'RECALCULAR_SCORE', 'GERAR_RECOMENDACOES', 'GERAR_NOTIFICACOES'], required: true },
      { key: 'ordem', label: 'Ordem', type: 'number' },
      { key: 'ativo', label: 'Ativa', type: 'checkbox' }
    ],
    columns: ['workflow_id', 'codigo', 'nome', 'tipo_acao', 'ordem', 'ativo']
  },
  workflow_execucoes: {
    title: 'Execucoes de workflow',
    subtitle: 'Historico de orquestracoes executadas pelo backend.',
    area: 'analytics',
    fields: [
      { key: 'status', label: 'Status', options: ['PENDENTE', 'EM_EXECUCAO', 'CONCLUIDO', 'ERRO'] },
      { key: 'resultado', label: 'Resultado' },
      { key: 'erro', label: 'Erro', type: 'textarea' }
    ],
    columns: ['createdAt', 'workflow.nome', 'status', 'resultado', 'colaborador.nome', 'obra.nome', 'erro']
  },
  workflow_eventos: {
    title: 'Eventos de workflow',
    subtitle: 'Rastreamento das acoes executadas por workflows SST.',
    area: 'analytics',
    fields: [
      { key: 'status', label: 'Status', options: ['REGISTRADO', 'CONCLUIDO', 'ERRO'] },
      { key: 'mensagem', label: 'Mensagem', type: 'textarea' }
    ],
    columns: ['createdAt', 'tipo_evento', 'status', 'workflow.nome', 'mensagem']
  },
  recomendacoes: {
    title: 'Recomendacoes operacionais',
    subtitle: 'Recomendacoes geradas por eventos, heatmap, scores e pendencias criticas.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_recomendacao', label: 'Tipo', required: true },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA', 'EMERGENCIAL'] },
      { key: 'status', label: 'Status', options: ['ABERTA', 'EM_ANALISE', 'APLICADA', 'IGNORADA'] },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'descricao', label: 'Descrição', type: 'textarea', required: true },
      { key: 'acao_sugerida', label: 'Ação sugerida', type: 'textarea' }
    ],
    columns: ['createdAt', 'tipo_recomendacao', 'criticidade', 'status', 'obra.nome', 'titulo']
  },
  documentos_ia: {
    title: 'Analises IA documental',
    subtitle: 'Contratos e resultados de leitura IA/OCR para documentos SST.',
    area: 'documentos',
    fields: [
      { key: 'documento_id', label: 'Documento ID', type: 'number' },
      { key: 'tipo_documento', label: 'Tipo', options: ['ASO', 'CERTIFICADO', 'TREINAMENTO', 'EPI', 'OUTRO'], required: true },
      { key: 'status', label: 'Status', options: ['EM_ANALISE', 'PROCESSADO', 'PENDENTE_TEXTO_DOCUMENTO', 'BLOQUEADO_CONFIGURACAO', 'BLOQUEADO_CREDENCIAL', 'APROVADO_HUMANO', 'REJEITADO_HUMANO', 'ERRO_PROVIDER'] },
      { key: 'confianca', label: 'Confianca', type: 'number' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['createdAt', 'tipo_documento', 'provider', 'status', 'confianca', 'documento.titulo', 'observacoes']
  },
  ia_document_logs: {
    title: 'Logs IA documental',
    subtitle: 'Auditoria de execucoes, bloqueios e respostas da IA documental SST.',
    area: 'documentos',
    fields: [],
    columns: ['createdAt', 'provider', 'status', 'etapa', 'documento.titulo', 'erro']
  },
  workflow_logs: {
    title: 'Logs de workflow',
    subtitle: 'Observabilidade das execucoes e acoes de workflow SST.',
    area: 'analytics',
    fields: [],
    columns: ['createdAt', 'acao', 'status', 'mensagem', 'erro']
  },
  automation_logs: {
    title: 'Logs de automacao',
    subtitle: 'Rastreamento das automacoes executadas pelo backend SST.',
    area: 'analytics',
    fields: [],
    columns: ['createdAt', 'automacao', 'status', 'mensagem', 'erro']
  },
  blocking_logs: {
    title: 'Logs de bloqueio',
    subtitle: 'Auditoria das avaliacoes de bloqueio operacional SST.',
    area: 'analytics',
    fields: [],
    columns: ['createdAt', 'tipo_bloqueio', 'criticidade', 'status', 'mensagem']
  },
  integration_logs: {
    title: 'Logs de integracao',
    subtitle: 'Rastreamento das integracoes controladas com RH/DP, Obras e futuras fontes.',
    area: 'analytics',
    fields: [],
    columns: ['createdAt', 'integracao', 'tipo_evento', 'status', 'mensagem', 'erro']
  },
  rollout_planos: {
    title: 'Planos de rollout',
    subtitle: 'Ativacao gradual por empresa, obra, setor, grupo piloto ou usuario.',
    area: 'configuracoes',
    fields: [
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Plano', required: true },
      { key: 'escopo_tipo', label: 'Escopo', options: ['PILOTO', 'EMPRESA', 'OBRA', 'SETOR', 'USUARIO'] },
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'grupo_piloto', label: 'Grupo piloto' },
      { key: 'status', label: 'Status', options: ['PLANEJADO', 'ATIVO', 'PAUSADO', 'ENCERRADO'] },
      { key: 'percentual_ativacao', label: 'Percentual ativacao', type: 'number' },
      { key: 'descricao', label: 'Descrição', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'escopo_tipo', 'status', 'percentual_ativacao', 'obra.nome']
  },
  telemetria: {
    title: 'Telemetria SST',
    subtitle: 'Metricas operacionais para producao controlada e estabilidade enterprise.',
    area: 'analytics',
    fields: [
      { key: 'tipo_metrica', label: 'Tipo de métrica', required: true },
      { key: 'escopo_tipo', label: 'Escopo', options: ['SISTEMA', 'EMPRESA', 'OBRA', 'COLABORADOR'] },
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'valor', label: 'Valor', type: 'number' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'status', label: 'Status', options: ['REGISTRADO', 'ATENCAO', 'ERRO'] },
      { key: 'duracao_ms', label: 'Duracao ms', type: 'number' }
    ],
    columns: ['createdAt', 'tipo_metrica', 'escopo_tipo', 'valor', 'unidade', 'status', 'duracao_ms']
  },
  alertas_operacionais: {
    title: 'Alertas operacionais SST',
    subtitle: 'Alertas de falhas, lentidao, scores criticos e riscos de operacao real.',
    area: 'analytics',
    fields: [
      { key: 'tipo_alerta', label: 'Tipo', required: true },
      { key: 'criticidade', label: 'Criticidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA', 'EMERGENCIAL'] },
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'status', label: 'Status', options: ['ABERTO', 'EM_TRATAMENTO', 'RESOLVIDO', 'IGNORADO'] },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'mensagem', label: 'Mensagem', type: 'textarea' }
    ],
    columns: ['createdAt', 'tipo_alerta', 'criticidade', 'status', 'titulo', 'obra.nome']
  },
  hardening_policies: {
    title: 'Politicas de hardening',
    subtitle: 'Timeout, retry, cooldown e circuit breaker conceitual por camada SST.',
    area: 'configuracoes',
    fields: [
      { key: 'codigo', label: 'Código', required: true },
      { key: 'nome', label: 'Politica', required: true },
      { key: 'tipo_alvo', label: 'Alvo', options: ['WORKFLOW', 'AUTOMACAO', 'INTEGRACAO', 'IA_DOCUMENTAL', 'NOTIFICACAO'], required: true },
      { key: 'timeout_ms', label: 'Timeout ms', type: 'number' },
      { key: 'max_retries', label: 'Max retries', type: 'number' },
      { key: 'cooldown_minutos', label: 'Cooldown minutos', type: 'number' },
      { key: 'circuit_breaker_enabled', label: 'Circuit breaker', type: 'checkbox' },
      { key: 'ativo', label: 'Ativa', type: 'checkbox' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['codigo', 'nome', 'tipo_alvo', 'timeout_ms', 'max_retries', 'ativo']
  },
  jobs: {
    title: 'Jobs SST',
    subtitle: 'Processamento assincrono de score, workflows, analytics, heatmap, notificacoes e IA documental.',
    area: 'configuracoes',
    fields: [
      { key: 'job_type', label: 'Tipo de job', required: true },
      { key: 'queue_name', label: 'Fila' },
      { key: 'status', label: 'Status', options: ['PENDENTE', 'PROCESSANDO', 'SUCESSO', 'ERRO', 'DEAD_LETTER', 'CANCELADO'] },
      { key: 'priority', label: 'Prioridade', type: 'number' },
      { key: 'max_attempts', label: 'Max tentativas', type: 'number' }
    ],
    columns: ['createdAt', 'job_type', 'queue_name', 'status', 'attempts', 'max_attempts', 'last_error']
  },
  queue_metrics: {
    title: 'Metricas de fila',
    subtitle: 'Historico de status das filas SST para readiness enterprise.',
    area: 'analytics',
    fields: [],
    columns: ['sampled_at', 'queue_name', 'metric_type', 'total_jobs', 'pending_jobs', 'failed_jobs']
  },
  performance_metrics: {
    title: 'Metricas de performance',
    subtitle: 'Duracao, status e contexto tecnico de operacoes enterprise SST.',
    area: 'analytics',
    fields: [],
    columns: ['sampled_at', 'metric_name', 'metric_group', 'duration_ms', 'status', 'contexto']
  },
  cache_entries: {
    title: 'Cache operacional SST',
    subtitle: 'Entradas de cache para dashboards, heatmaps, scores e centro operacional.',
    area: 'configuracoes',
    fields: [],
    columns: ['namespace', 'cache_key', 'expires_at', 'hit_count', 'last_hit_at']
  },
  quality_issues: {
    title: 'Qualidade operacional SST',
    subtitle: 'Inconsistencias de scores, jobs, workflows e pendencias detectadas pelo pipeline de qualidade.',
    area: 'configuracoes',
    fields: [
      { key: 'status', label: 'Status', options: ['ABERTA', 'EM_ANALISE', 'RESOLVIDA', 'IGNORADA'] },
      { key: 'severidade', label: 'Severidade', options: ['BAIXA', 'MEDIA', 'ALTA', 'CRITICA'] }
    ],
    columns: ['createdAt', 'issue_type', 'severidade', 'status', 'titulo', 'origem_tipo']
  },
  governance_logs: {
    title: 'Governanca SST',
    subtitle: 'Trilha corporativa de auditoria, rollout, automacoes, jobs e decisoes operacionais.',
    area: 'analytics',
    fields: [],
    columns: ['createdAt', 'acao', 'entidade_tipo', 'entidade_id', 'criticidade', 'usuario.nome']
  },
  documentos: {
    title: 'Documentos SST',
    subtitle: 'Central documental com validade e links privados.',
    area: 'documentos',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_documento', label: 'Tipo', options: ['ASO', 'CAT', 'PGR', 'PCMSO', 'CERTIFICADO', 'LAUDO', 'TREINAMENTO', 'OUTRO'], required: true },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'validade', label: 'Validade', type: 'date' },
      { key: 'status', label: 'Status', options: ['ENVIADO', 'CONFERIDO', 'REJEITADO', 'VENCIDO'] },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['tipo_documento', 'titulo', 'validade', 'status']
  },
  pgr: {
    title: 'PGR',
    subtitle: 'Programa de Gerenciamento de Riscos.',
    area: 'pgr',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'responsavel', label: 'Responsável', required: true },
      { key: 'vigencia_inicio', label: 'Início', type: 'date' },
      { key: 'vigencia_fim', label: 'Fim', type: 'date' },
      { key: 'status', label: 'Status', options: ['ATIVO', 'VENCIDO', 'SUBSTITUIDO'] }
    ],
    columns: ['responsavel', 'vigencia_inicio', 'vigencia_fim', 'status']
  },
  pcmso: {
    title: 'PCMSO',
    subtitle: 'Programa de Controle Medico de Saude Ocupacional.',
    area: 'pcmso',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'medico_responsavel', label: 'Medico responsável', required: true },
      { key: 'crm', label: 'CRM' },
      { key: 'vigencia_inicio', label: 'Início', type: 'date' },
      { key: 'vigencia_fim', label: 'Fim', type: 'date' },
      { key: 'status', label: 'Status', options: ['ATIVO', 'VENCIDO', 'SUBSTITUIDO'] }
    ],
    columns: ['medico_responsavel', 'crm', 'vigencia_inicio', 'vigencia_fim', 'status']
  },
  ltcat: {
    title: 'LTCAT',
    subtitle: 'Laudo Tecnico das Condicoes Ambientais do Trabalho.',
    area: 'ltcat',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'codigo', label: 'Código' },
      { key: 'titulo', label: 'Título', required: true },
      { key: 'data_emissao', label: 'Emissão', type: 'date' },
      { key: 'vigencia_inicio', label: 'Início', type: 'date' },
      { key: 'vigencia_fim', label: 'Fim', type: 'date' },
      { key: 'status', label: 'Status', options: ['RASCUNHO', 'ATIVO', 'VENCIDO', 'SUBSTITUIDO'] },
      { key: 'responsavel_tecnico', label: 'Responsável técnico' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['codigo', 'titulo', 'data_emissao', 'vigencia_fim', 'status', 'responsavel_tecnico']
  },
  avaliacoes_quantitativas: {
    title: 'Avaliacoes quantitativas',
    subtitle: 'Medicoes ambientais vinculadas ao LTCAT.',
    area: 'ltcat',
    fields: [
      { key: 'ltcat_id', label: 'LTCAT', type: 'selectRef', ref: 'ltcats', required: true },
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'ambiente', label: 'Ambiente', required: true },
      { key: 'agente', label: 'Agente', required: true },
      { key: 'tipo_agente', label: 'Tipo do agente' },
      { key: 'metodologia', label: 'Metodologia' },
      { key: 'unidade_medida', label: 'Unidade de medida' },
      { key: 'valor_medido', label: 'Valor medido', type: 'number' },
      { key: 'limite_tolerancia', label: 'Limite de tolerância', type: 'number' },
      { key: 'nivel_acao', label: 'Nível de ação', type: 'number' },
      { key: 'resultado', label: 'Resultado' },
      { key: 'data_avaliacao', label: 'Data da avaliacao', type: 'date' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['ltcat.titulo', 'ambiente', 'agente', 'valor_medido', 'unidade_medida', 'resultado', 'data_avaliacao']
  },
  esocial: {
    title: 'Eventos eSocial SST',
    subtitle: 'Preparacao futura dos eventos S-2210, S-2220 e S-2240.',
    area: 'esocial',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas', required: true },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_evento', label: 'Evento', options: ['S-2210', 'S-2220', 'S-2240'], required: true },
      { key: 'status', label: 'Status', options: ['PREPARADO', 'PENDENTE_DOCUMENTACAO', 'REJEITADO', 'PROCESSADO'] },
      { key: 'protocolo', label: 'Protocolo' },
      { key: 'recibo', label: 'Recibo' },
      { key: 'observacoes', label: 'Observações', type: 'textarea' }
    ],
    columns: ['tipo_evento', 'status', 'colaborador.nome', 'protocolo', 'recibo']
  },
  eventos: {
    title: 'Eventos operacionais SST',
    subtitle: 'Eventos gerados pelo backend para alertas, rastreabilidade, dashboards e automacoes futuras.',
    area: 'analytics',
    fields: [
      { key: 'empresa_id', label: 'Empresa', type: 'selectRef', ref: 'empresas' },
      { key: 'obra_id', label: 'Obra/Centro', type: 'selectRef', ref: 'obras' },
      { key: 'colaborador_id', label: 'Colaborador', type: 'selectRef', ref: 'colaboradores' },
      { key: 'tipo_evento', label: 'Tipo de evento', required: true },
      { key: 'severidade', label: 'Severidade', options: ['INFO', 'ALERTA', 'CRITICA'] },
      { key: 'status', label: 'Status', options: ['ABERTO', 'TRATADO', 'IGNORADO'] },
      { key: 'mensagem', label: 'Mensagem', type: 'textarea', required: true }
    ],
    columns: ['createdAt', 'tipo_evento', 'severidade', 'status', 'empresa.nome', 'obra.nome', 'colaborador.nome', 'mensagem']
  }
};

const SST_NAV_ALL = [
  ['riscos', 'Riscos'],
  ['agentes', 'Agentes'],
  ['ambientes', 'Ambientes'],
  ['exposicoes', 'Exposições'],
  ['pgr', 'PGR'],
  ['pcmso', 'PCMSO'],
  ['ltcat', 'LTCAT'],
  ['avaliacoes_quantitativas', 'Avaliacoes quantitativas'],
  ['aso', 'ASO'],
  ['exames', 'Exames'],
  ['epi', 'EPI'],
  ['treinamentos', 'Treinamentos'],
  ['acidentes', 'Acidentes'],
  ['documentos', 'Documentos'],
  ['regras', 'Regras'],
  ['politicas_bloqueio', 'Politicas de bloqueio'],
  ['bloqueios', 'Bloqueios'],
  ['notificacoes', 'Notificacoes'],
  ['pendencias', 'Pendencias'],
  ['scores', 'Scores'],
  ['criticidades', 'Criticidades'],
  ['workflows', 'Workflows'],
  ['workflow_acoes', 'Acoes workflow'],
  ['workflow_execucoes', 'Execucoes workflow'],
  ['workflow_eventos', 'Eventos workflow'],
  ['recomendacoes', 'Recomendacoes'],
  ['documentos_ia', 'Analises IA'],
  ['ia_document_logs', 'Logs IA documental'],
  ['workflow_logs', 'Logs workflow'],
  ['automation_logs', 'Logs automacao'],
  ['integration_logs', 'Logs integracao'],
  ['blocking_logs', 'Logs bloqueio'],
  ['rollout_planos', 'Rollout'],
  ['telemetria', 'Telemetria'],
  ['alertas_operacionais', 'Alertas operacionais'],
  ['hardening_policies', 'Hardening'],
  ['jobs', 'Jobs'],
  ['queue_metrics', 'Filas'],
  ['performance_metrics', 'Performance'],
  ['cache_entries', 'Cache'],
  ['quality_issues', 'Qualidade'],
  ['governance_logs', 'Governanca'],
  ['esocial', 'eSocial'],
  ['eventos', 'Eventos']
];

export const SST_NAV = SST_SIMPLIFIED_MODE
  ? SST_NAV_ALL.filter(([resource]) => SST_SIMPLIFIED_RESOURCES.has(resource))
  : SST_NAV_ALL;
