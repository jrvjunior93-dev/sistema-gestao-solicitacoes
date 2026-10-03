const NOTIFICACAO_CONFIG_CHAVE = 'NOTIFICACOES_SISTEMA_EVENTOS';

const NOTIFICACAO_EVENTOS = [
  {
    modulo: 'Solicitacoes',
    modulo_label: 'Solicitacoes',
    eventos: [
      ['SOLICITACAO_CRIADA', 'Solicitacao criada', 'Nova solicitacao enviada para o fluxo operacional.'],
      ['ENVIADA_SETOR', 'Enviada para outro setor', 'Solicitacao transferida entre setores.'],
      ['STATUS_ALTERADO', 'Status alterado', 'Mudanca de status dentro da solicitacao.'],
      ['RESPONSAVEL_ATRIBUIDO', 'Responsavel atribuido', 'Usuario definido como responsavel pela solicitacao.'],
      ['RESPONSAVEL_ASSUMIU', 'Responsavel assumiu', 'Usuario assumiu a solicitacao.'],
      ['APROVADA_DIRETORIA', 'Aprovada pela diretoria', 'Diretoria aprovou a solicitacao no fluxo de aprovacao.'],
      ['NUMERO_PEDIDO_ATUALIZADO', 'Numero do pedido atualizado', 'Numero do pedido foi ajustado na solicitacao.'],
      ['VALOR_ATUALIZADO', 'Valor atualizado', 'Valor da solicitacao foi alterado.'],
      ['DATA_VENCIMENTO_ATUALIZADA', 'Data de vencimento atualizada', 'Data de vencimento da solicitacao foi alterada.'],
      ['ANEXO_ADICIONADO', 'Anexo adicionado', 'Arquivo anexado na solicitacao.'],
      ['MENCAO_COMENTARIO', 'Mencao em comentario', 'Usuario foi mencionado em comentario.'],
      ['RETORNO_SOLICITADO', 'Retorno solicitado', 'Outro setor pediu a devolucao da solicitacao para continuar o trabalho.'],
      ['RETORNO_APROVADO', 'Retorno aprovado', 'O setor atual devolveu a solicitacao ao setor solicitante.'],
      ['RETORNO_DEVOLVIDO', 'Solicitacao devolvida', 'O setor solicitante devolveu a solicitacao ao setor que aprovou o retorno.'],
      ['RETORNO_REJEITADO', 'Retorno rejeitado', 'O setor atual rejeitou o pedido de devolucao da solicitacao.'],
      ['RETORNO_CANCELADO', 'Pedido de retorno cancelado', 'O solicitante cancelou o pedido de devolucao.']
    ]
  },
  {
    modulo: 'Compras',
    modulo_label: 'Compras',
    eventos: [
      ['SOLICITACAO_COMPRA_CRIADA', 'Solicitacao de compra criada', 'Solicitacao de compra gerada para cotacao.'],
      ['SOLICITACAO_COMPRA_APROVADA', 'Solicitacao de compra aprovada', 'Compra liberada para cotacao apos aprovacao.'],
      ['COTACAO_CRIADA', 'Cotacao criada', 'Cotacao enviada para fornecedores.'],
      ['COTACAO_RESPONDIDA', 'Cotacao respondida', 'Fornecedor registrou resposta.'],
      ['COTACAO_ENCERRADA', 'Cotacao encerrada', 'Cotacao finalizada com vencedores.'],
      ['PEDIDO_COMPRA_GERADO', 'Pedido de compra gerado', 'Pedido criado a partir de cotacao.'],
      ['PEDIDO_COMPRA_STATUS_ALTERADO', 'Status do pedido alterado', 'Mudanca no status do pedido de compra.'],
      ['PEDIDO_COMPRA_CANCELADO', 'Pedido de compra cancelado', 'Pedido ou item cancelado no fluxo de compras.'],
      ['PEDIDO_COMPRA_AGUARDANDO_GEO', 'Pedido legado aguardando revisão', 'Evento histórico de pedidos que aguardavam preparação financeira pelo GEO.'],
      ['PEDIDO_COMPRA_REABERTURA_SOLICITADA', 'Reabertura de pedido solicitada', 'Compras solicitou ao GEO a reabertura de um pedido com titulo vinculado.'],
      ['PEDIDO_COMPRA_REABERTURA_DECIDIDA', 'Reabertura de pedido decidida', 'GEO aprovou ou rejeitou uma solicitacao de reabertura do pedido.'],
      ['COMPRAS_ATRASO_DELEGACAO', 'Atraso em delegacao de compras', 'Solicitacao atribuida ao comprador ultrapassou prazo.']
    ]
  },
  {
    modulo: 'Financeiro',
    modulo_label: 'Financeiro',
    eventos: [
      ['TITULO_FINANCEIRO_CRIADO', 'Titulo financeiro criado', 'Titulo manual, por solicitacao, compras ou RH/DP.'],
      ['TITULO_FINANCEIRO_EDITADO', 'Titulo financeiro editado', 'Informacoes do titulo foram alteradas.'],
      ['TITULO_FINANCEIRO_BAIXADO', 'Titulo financeiro baixado', 'Baixa total ou parcial registrada.'],
      ['TITULO_FINANCEIRO_ESTORNADO', 'Titulo financeiro estornado', 'Baixa ou titulo estornado.'],
      ['PAGAMENTO_LOTE_CRIADO', 'Lote de pagamento criado', 'Novo lote para pagamento em massa.'],
      ['PAGAMENTO_LOTE_APROVADO', 'Lote de pagamento aprovado', 'Lote recebeu aprovacao interna.'],
      ['PAGAMENTO_LOTE_ENVIADO_BANCO', 'Lote enviado ao banco', 'Lote enviado para API bancaria.'],
      ['PAGAMENTO_LOTE_FALHA', 'Falha em lote bancario', 'Banco ou integracao recusou/processou com erro.'],
      ['CNAB_REMESSA_GERADA', 'Remessa CNAB gerada', 'Arquivo de remessa gerado para envio ao banco.'],
      ['CNAB_RETORNO_IMPORTADO', 'Retorno CNAB importado', 'Arquivo retorno importado e processado.'],
      ['OFX_IMPORTADO', 'OFX importado', 'Extrato bancario OFX importado.'],
      ['CONCILIACAO_REALIZADA', 'Conciliacao realizada', 'Movimento bancario conciliado com titulo ou lancamento.']
    ]
  },
  {
    modulo: 'Prioridades',
    modulo_label: 'Prioridades Diretoria',
    eventos: [
      ['PRIORIDADE_DIRETORIA_LOTE_CRIADO', 'Lote criado pela diretoria', 'Diretoria criou lote de prioridade.'],
      ['PRIORIDADE_DIRETORIA_LOTE_FINALIZADO', 'Lote finalizado pela diretoria', 'Diretoria finalizou lote para financeiro.'],
      ['PRIORIDADE_DIR_ADMIN_LOTE_CRIADO', 'DIR_ADMIN criou lote', 'DIR_ADMIN criou lote de prioridade para diretorias.'],
      ['PRIORIDADE_DIR_ADMIN_LOTE_APROVADO', 'DIR_ADMIN aprovou lote', 'Lote aprovado pela DIR_ADMIN.'],
      ['PRIORIDADE_DIRETORIA_AUTORIZADA', 'Solicitacao autorizada em prioridade', 'Solicitacao/titulo autorizado em lote de prioridade.']
    ]
  },
  {
    modulo: 'RH_DP',
    modulo_label: 'RH/DP',
    eventos: [
      ['RH_DP_IMPORTACAO_CONFIRMADA', 'Importacao confirmada', 'Importacao de jornada confirmada.'],
      ['RH_DP_APURACAO_GERADA', 'Apuracao gerada', 'Apuracao de competencia criada.'],
      ['RH_DP_FECHAMENTO_GERADO', 'Fechamento gerado', 'Fechamento criou titulos financeiros.'],
      ['RH_DP_FECHAMENTO_REABERTO', 'Fechamento estornado', 'Fechamento reaberto e financeiro notificado.'],
      ['RH_DP_TITULOS_GERADOS', 'Titulos RH/DP gerados', 'Titulos gerados a partir do fechamento.'],
      ['RH_TRANSFERENCIA_ATUALIZADA', 'Transferencia entre obras atualizada', 'Nova transferencia, comentario ou decisao que exige consulta dos responsaveis das obras.']
    ]
  },
  {
    modulo: 'CRM',
    modulo_label: 'CRM',
    eventos: [
      ['CRM_LEAD_CRIADO', 'Lead criado', 'Novo lead entrou no CRM.'],
      ['CRM_LEAD_REDISTRIBUIDO', 'Lead redistribuido', 'Lead foi redistribuido entre corretores.'],
      ['CRM_AUTOMACAO', 'Automacao do CRM', 'Automacao gerou aviso para gestor ou responsavel.'],
      ['CRM_SLA_ALERTA', 'Alerta de SLA', 'Lead atingiu regra de SLA.'],
      ['CRM_CANAL_FALHA', 'Falha em canal', 'Canal de entrada ou integracao apresentou erro.']
    ]
  },
  {
    modulo: 'Comercial',
    modulo_label: 'Comercial',
    eventos: [
      ['COMERCIAL_CONTRATO_CRIADO', 'Contrato criado', 'Contrato comercial criado.'],
      ['COMERCIAL_DOCUMENTO_ENVIADO', 'Documento enviado', 'Documento comercial enviado para assinatura.'],
      ['COMERCIAL_CONTRATO_ASSINADO', 'Contrato assinado', 'Contrato teve assinatura concluida.'],
      ['COMERCIAL_DISTRATO_REGISTRADO', 'Distrato registrado', 'Distrato ou cancelamento comercial registrado.']
    ]
  },
  {
    modulo: 'Governanca',
    modulo_label: 'Governanca e configuracoes',
    eventos: [
      ['GOVERNANCA_EVENTO_RISCO', 'Evento de risco', 'Governanca detectou acao sensivel.'],
      ['PERMISSAO_AREA_ALTERADA', 'Permissao de area alterada', 'Permissoes granulares foram alteradas.'],
      ['CONFIGURACAO_SISTEMA_ALTERADA', 'Configuracao alterada', 'Configuracao estrutural do sistema foi modificada.'],
      ['MODULO_SISTEMA_ALTERADO', 'Modulo habilitado/desabilitado', 'Composicao de modulos da instalacao foi alterada.']
    ]
  }
];

const NOTIFICACAO_EVENTOS_FLAT = NOTIFICACAO_EVENTOS.flatMap((grupo) =>
  grupo.eventos.map(([chave, nome, descricao]) => ({
    chave,
    nome,
    descricao,
    modulo: grupo.modulo,
    modulo_label: grupo.modulo_label,
    ativo_padrao: true
  }))
);

const NOTIFICACAO_EVENTOS_MAP = new Map(
  NOTIFICACAO_EVENTOS_FLAT.map((evento) => [evento.chave, evento])
);

module.exports = {
  NOTIFICACAO_CONFIG_CHAVE,
  NOTIFICACAO_EVENTOS,
  NOTIFICACAO_EVENTOS_FLAT,
  NOTIFICACAO_EVENTOS_MAP
};
