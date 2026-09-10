'use strict';

/**
 * Registro central de permissões de área por módulo.
 *
 * Regras:
 * - SUPERADMIN e ADMINISTRADOR têm bypass total — nunca são afetados.
 * - Se um usuário NÃO tiver entradas neste sistema → acesso completo ao que seu perfil já permite (backwards compat).
 * - Se um usuário TIVER entradas → somente as permissões listadas são concedidas.
 *
 * Chave de permissão: "modulo.area.acao" em minúsculo.
 * Exemplo: "financeiro.titulos.criar"
 */

const MODULO_PERMISSION_GROUPS = [
  {
    modulo: 'PAINEL',
    label: 'Painel',
    descricao: 'Controle de acesso ao dashboard inicial e indicadores do painel.',
    areas: [
      {
        key: 'painel.dashboard',
        label: 'Dashboard',
        permissoes: [
          { key: 'painel.dashboard.visualizar', label: 'Visualizar Dashboard', descricao: 'Permite acessar o dashboard inicial do painel.' }
        ]
      }
    ]
  },
  {
    modulo: 'CONFIGURACOES',
    label: 'Configuracoes',
    descricao: 'Console administrativo, cadastros, liberacoes, bloqueios e parametros do sistema.',
    areas: [
      {
        key: 'configuracoes.geral',
        label: 'Console de Configuracoes',
        permissoes: [
          { key: 'configuracoes.geral.visualizar', label: 'Visualizar configuracoes', descricao: 'Permite acessar a pagina central de configuracoes.' },
          { key: 'configuracoes.geral.gerenciar', label: 'Gerenciar configuracoes gerais', descricao: 'Permite operar configuracoes administrativas gerais.' }
        ]
      },
      {
        key: 'configuracoes.cadastros',
        label: 'Cadastros administrativos',
        permissoes: [
          { key: 'configuracoes.cadastros.gerenciar', label: 'Gerenciar cadastros', descricao: 'Permite criar, editar, ativar e bloquear cadastros estruturais.' }
        ]
      },
      {
        key: 'configuracoes.usuarios',
        label: 'Usuarios',
        permissoes: [
          { key: 'configuracoes.usuarios.gerenciar', label: 'Gerenciar usuarios', descricao: 'Permite cadastrar, alterar e bloquear usuarios.' }
        ]
      },
      {
        key: 'configuracoes.status_vinculos',
        label: 'Status, vinculos e acessos',
        permissoes: [
          { key: 'configuracoes.status_vinculos.gerenciar', label: 'Gerenciar status e vinculos', descricao: 'Permite alterar status por setor, permissoes de setor, acessos por obra e bloqueios operacionais.' }
        ]
      },
      {
        key: 'configuracoes.solicitacoes',
        label: 'Parametros de solicitacoes',
        permissoes: [
          { key: 'configuracoes.solicitacoes.gerenciar', label: 'Gerenciar regras de solicitacoes', descricao: 'Permite configurar campos, automacoes e regras da nova solicitacao.' }
        ]
      },
      {
        key: 'configuracoes.aparencia',
        label: 'Aparencia e suporte',
        permissoes: [
          { key: 'configuracoes.aparencia.gerenciar', label: 'Gerenciar aparencia e suporte', descricao: 'Permite alterar cores, visibilidade da UI, suporte e notificacoes do sistema.' }
        ]
      },
      {
        key: 'configuracoes.permissoes',
        label: 'Permissoes granulares',
        permissoes: [
          { key: 'configuracoes.permissoes.gerenciar', label: 'Gerenciar permissoes granulares', descricao: 'Permite alterar permissoes por usuario, setor e perfil.' }
        ]
      },
      {
        key: 'configuracoes.modulos',
        label: 'Modulos e instalacao',
        permissoes: [
          { key: 'configuracoes.modulos.gerenciar', label: 'Gerenciar modulos', descricao: 'Permite habilitar e bloquear modulos do produto.' }
        ]
      }
    ]
  },
  {
    modulo: 'SOLICITACOES',
    label: 'Solicitações',
    descricao: 'Controle de criação, visualização e aprovação de solicitações operacionais.',
    areas: [
      {
        key: 'solicitacoes.lista',
        label: 'Lista de Solicitações',
        permissoes: [
          { key: 'solicitacoes.lista.visualizar_minhas', label: 'Ver suas próprias solicitações', descricao: 'Exibe solicitações criadas pelo próprio usuário e, para o setor OBRA, também as obras vinculadas ao usuário.' },
          { key: 'solicitacoes.lista.visualizar_setor', label: 'Ver solicitações do setor', descricao: 'Exibe solicitações de todos os usuários do setor.' },
          { key: 'solicitacoes.lista.visualizar_todas', label: 'Ver todas as solicitações', descricao: 'Acesso irrestrito à lista completa.' }
        ]
      },
      {
        key: 'solicitacoes.acoes',
        label: 'Ações em Solicitações',
        permissoes: [
          { key: 'solicitacoes.acoes.criar', label: 'Criar solicitação', descricao: 'Permite abrir novas solicitações.' },
          { key: 'solicitacoes.acoes.aprovar', label: 'Aprovar / rejeitar', descricao: 'Permite aprovar ou rejeitar solicitações pendentes.' },
          { key: 'solicitacoes.acoes.ver_aba_financeiro', label: 'Ver aba Financeiro', descricao: 'Exibe a aba de títulos financeiros dentro de uma solicitação.' },
          { key: 'solicitacoes.acoes.alterar_status_qualquer_setor', label: 'Alterar status em qualquer setor', descricao: 'Permite alterar o status de solicitações em outros setores usando os status do setor do próprio usuário.' },
          { key: 'solicitacoes.acoes.alterar_valor', label: 'Alterar valor da solicitação', descricao: 'Permite editar o valor financeiro da solicitação sem exigir perfil administrativo do GEO.' },
          { key: 'solicitacoes.acoes.alterar_data_vencimento', label: 'Alterar data de vencimento', descricao: 'Permite editar a data de vencimento da solicitação sem exigir perfil administrativo do GEO.' },
          { key: 'solicitacoes.apropriacoes.editar', label: 'Editar apropriações', descricao: 'Permite alterar a apropriação principal e o rateio de apropriações da solicitação, mantendo auditoria.' },
          { key: 'solicitacoes.retorno.solicitar', label: 'Solicitar retorno ao setor', descricao: 'Permite pedir que uma solicitação visível volte ao setor operacional do usuário.' },
          { key: 'solicitacoes.retorno.decidir', label: 'Decidir pedidos de retorno', descricao: 'Permite aprovar ou rejeitar pedidos de retorno enquanto a solicitação está no próprio setor.' }
        ]
      },
      {
        key: 'solicitacoes.anexos',
        label: 'Anexos de Solicitações',
        permissoes: [
          { key: 'solicitacoes.anexos.excluir', label: 'Excluir anexos', descricao: 'Permite remover anexos do histórico de solicitações.' }
        ]
      },
      {
        key: 'solicitacoes.prioridades',
        label: 'Prioridades Diretoria',
        permissoes: [
          { key: 'solicitacoes.prioridades.visualizar', label: 'Visualizar lotes', descricao: 'Acessar os lotes de prioridade da diretoria conforme o escopo configurado.' },
          { key: 'solicitacoes.prioridades.criar', label: 'Criar lotes', descricao: 'Solicitar novos lotes de prioridade da diretoria.' },
          { key: 'solicitacoes.prioridades.finalizar', label: 'Finalizar lotes', descricao: 'Selecionar solicitações e finalizar lotes de prioridade.' },
          { key: 'solicitacoes.prioridades.cancelar', label: 'Cancelar lotes', descricao: 'Cancelar lotes abertos sem itens autorizados.' },
          { key: 'solicitacoes.prioridades.excluir', label: 'Excluir lotes', descricao: 'Excluir lotes sem solicitações autorizadas.' }
        ]
      },
      {
        key: 'solicitacoes.relatorios',
        label: 'Relatórios de Solicitações',
        permissoes: [
          { key: 'solicitacoes.relatorios.visualizar', label: 'Visualizar hub de relatórios', descricao: 'Acessar a página central de relatórios de solicitações.' },
          { key: 'solicitacoes.relatorios.operacional', label: 'Painel operacional', descricao: 'Acessar o relatório operacional de volume, gargalos, status, setores e obra/centro.' },
          { key: 'solicitacoes.relatorios.abertas', label: 'Solicitações abertas', descricao: 'Acessar a base operacional de solicitações abertas a partir do hub de relatórios.' },
          { key: 'solicitacoes.relatorios.arquivadas', label: 'Solicitações arquivadas', descricao: 'Acessar o histórico de solicitações arquivadas a partir do hub de relatórios.' },
          { key: 'solicitacoes.relatorios.sla_setor', label: 'SLA por setor', descricao: 'Acessar a configuração de SLA por setor usada na leitura dos relatórios.' },
          { key: 'solicitacoes.relatorios.funil', label: 'Funil de solicitações', descricao: 'Preparar acesso futuro ao funil gerencial de solicitações.' },
          { key: 'solicitacoes.relatorios.volume_obra_centro', label: 'Volume por obra/centro de custo', descricao: 'Preparar acesso futuro ao relatório de demanda por obra ou centro de custo.' }
        ]
      }
    ]
  },
  {
    modulo: 'COMPRAS',
    label: 'Compras',
    descricao: 'Pedidos de compra, cotações e aprovações.',
    areas: [
      {
        key: 'compras.solicitacoes',
        label: 'Solicitacoes de Compra',
        permissoes: [
          { key: 'compras.solicitacoes.visualizar', label: 'Visualizar solicitacoes', descricao: 'Ver lista, detalhes e PDF das solicitacoes de compra.' },
          { key: 'compras.solicitacoes.criar', label: 'Criar solicitacao de compra', descricao: 'Acessar a pagina Nova Solicitacao de Compra e criar solicitacoes vinculadas a obra.' },
          { key: 'compras.solicitacoes.gerenciar', label: 'Gerenciar solicitacoes', descricao: 'Liberar, recusar, enviar para fornecedores, encerrar e comentar solicitacoes de compra.' },
          { key: 'compras.solicitacoes.excluir', label: 'Inativar solicitacoes', descricao: 'Inativar uma ou mais solicitacoes de compra na fila operacional.' },
          { key: 'compras.solicitacoes.encaminhar_compras', label: 'Enviar para Compras', descricao: 'Concluir a revisao no GEO e encaminhar a solicitacao para a fila do setor de Compras.' },
          { key: 'compras.solicitacoes.editar_itens', label: 'Gerenciar itens da solicitacao', descricao: 'Revisar quantidades e apropriacoes dos itens antes do envio para Compras, sem liberar cotacao ou pedido.' },
          { key: 'compras.solicitacoes.editar_quantidade', label: 'Alterar quantidade solicitada', descricao: 'Alterar quantidade solicitada dos itens com auditoria.' },
          { key: 'compras.solicitacoes.editar_apropriacoes_itens', label: 'Alterar apropriações dos itens', descricao: 'Alterar apropriações dos itens da solicitação de compra com auditoria, sem liberar encerramento da cotação.' },
          { key: 'compras.solicitacoes.gerar_pedidos', label: 'Gerar pedidos pela cotacao', descricao: 'Gerar pedidos de compra a partir da cotacao encerrada.' }
        ]
      },
      {
        key: 'compras.compra_direta',
        label: 'Compra Direta',
        permissoes: [
          { key: 'compras.compra_direta.editar_apropriacoes_itens', label: 'Alterar apropriações dos itens', descricao: 'Alterar apropriações dos itens de compra direta com auditoria, sem alterar visualização de solicitações.' }
        ]
      },
      {
        key: 'compras.escopo',
        label: 'Escopo operacional',
        permissoes: [
          { key: 'compras.escopo.minhas_atribuidas', label: 'Ver apenas atribuidas', descricao: 'Operar somente solicitacoes, cotacoes, pedidos e delegacoes vinculados ao usuario.' },
          { key: 'compras.escopo.setor', label: 'Ver setor de compras', descricao: 'Acompanhar todos os registros operacionais do setor de compras.' },
          { key: 'compras.escopo.todas', label: 'Ver todos os registros', descricao: 'Visao administrativa completa dos registros de compras.' }
        ]
      },
      {
        key: 'compras.pedidos',
        label: 'Pedidos de Compra',
        permissoes: [
          { key: 'compras.pedidos.visualizar', label: 'Visualizar pedidos', descricao: 'Ver lista e detalhes de pedidos de compra.' },
          { key: 'compras.pedidos.criar', label: 'Criar pedidos', descricao: 'Gerar novos pedidos de compra.' },
          { key: 'compras.pedidos.aprovar', label: 'Aprovar pedidos', descricao: 'Avançar o status de pedidos no fluxo de aprovação.' },
          { key: 'compras.pedidos.auditoria', label: 'Auditoria de itens', descricao: 'Acessar o relatório de auditoria de itens dos pedidos.' }
        ]
      },
      {
        key: 'compras.pedidos.acoes',
        label: 'Acoes de Pedidos',
        permissoes: [
          { key: 'compras.pedidos.editar_itens', label: 'Editar itens do pedido', descricao: 'Alterar quantidade, valor, observacoes e itens do pedido.' },
          { key: 'compras.pedidos.remanejar', label: 'Remanejar itens', descricao: 'Remanejar itens de um pedido para outro fornecedor da mesma cotacao.' },
          { key: 'compras.pedidos.cancelar', label: 'Cancelar pedido ou item', descricao: 'Cancelar pedidos ou itens mantendo rastreabilidade.' },
          { key: 'compras.pedidos.anexar_espelho', label: 'Anexar espelho', descricao: 'Anexar espelho do pedido enviado pelo fornecedor.' },
          { key: 'compras.pedidos.alterar_status', label: 'Alterar status do pedido', descricao: 'Alterar status de pedidos individualmente ou em lote.' },
          { key: 'compras.pedidos.reabrir', label: 'Reabrir pedido', descricao: 'Reabrir pedido fechado para ajustes com justificativa.' },
          { key: 'compras.pedidos.registrar_frete', label: 'Registrar frete', descricao: 'Registrar, editar e acompanhar fretes vinculados ao pedido.' },
          { key: 'compras.pedidos.cancelar_frete', label: 'Cancelar frete', descricao: 'Cancelar fretes registrados com auditoria.' }
        ]
      },
      {
        key: 'compras.pedidos.financeiro',
        label: 'Financeiro dos Pedidos pelo GEO',
        permissoes: [
          { key: 'compras.pedidos.financeiro.visualizar', label: 'Visualizar financeiro do pedido', descricao: 'Ver previsoes, titulos, documentos e pedidos de reabertura vinculados ao pedido.' },
          { key: 'compras.pedidos.financeiro.anexar_documentos', label: 'Anexar documentos', descricao: 'Registrar nota fiscal, comprovante de compra ou outra confirmacao do fornecedor.' },
          { key: 'compras.pedidos.financeiro.gerar_previsao', label: 'Gerar previsoes', descricao: 'Criar os titulos de previsao a partir de um pedido fechado pelo setor de Compras.' },
          { key: 'compras.pedidos.financeiro.liberar_pagamento', label: 'Liberar para pagamento', descricao: 'Converter previsoes confirmadas em titulos abertos para o Financeiro.' },
          { key: 'compras.pedidos.financeiro.aprovar_reabertura', label: 'Decidir reabertura', descricao: 'Aprovar ou rejeitar a reabertura solicitada por Compras quando houver titulo vinculado.' }
        ]
      },
      {
        key: 'compras.delegacao',
        label: 'Delegacao de Compras',
        permissoes: [
          { key: 'compras.delegacao.visualizar', label: 'Visualizar delegacao', descricao: 'Acompanhar responsaveis, prazos e atrasos das solicitacoes de compra.' },
          { key: 'compras.delegacao.gerenciar', label: 'Gerenciar delegacao', descricao: 'Atribuir responsavel, prazo e motivo de atraso.' },
          { key: 'compras.delegacao.alterar_responsavel', label: 'Alterar responsavel', descricao: 'Alterar responsavel pela solicitacao no painel de delegacao.' },
          { key: 'compras.delegacao.alterar_prazo', label: 'Alterar prazo', descricao: 'Alterar prazo de finalizacao da compra.' },
          { key: 'compras.delegacao.salvar_motivo', label: 'Salvar motivo de atraso', descricao: 'Registrar motivo de atraso sem alterar responsavel ou prazo.' }
        ]
      },
      {
        key: 'compras.cotacoes',
        label: 'Cotações',
        permissoes: [
          { key: 'compras.cotacoes.visualizar', label: 'Visualizar cotações', descricao: 'Ver cotações e comparativo de fornecedores.' },
          { key: 'compras.cotacoes.gerenciar', label: 'Gerenciar cotacoes', descricao: 'Criar, editar e operar cotacoes sem encerrar ou reabrir.' },
          { key: 'compras.cotacoes.editar_respostas', label: 'Editar respostas', descricao: 'Preencher, ajustar e salvar respostas de cotacao.' },
          { key: 'compras.cotacoes.salvar_rascunho', label: 'Salvar rascunho', descricao: 'Salvar respostas parciais sem encerrar cotacao.' },
          { key: 'compras.cotacoes.cancelar', label: 'Cancelar cotacao', descricao: 'Cancelar uma cotacao aberta, com ou sem respostas, mantendo a auditoria.' },
          { key: 'compras.cotacoes.fechar_parcial', label: 'Fechar parcialmente', descricao: 'Gerar pedidos dos itens selecionados e manter o saldo da cotacao aberto.' },
          { key: 'compras.cotacoes.encerrar', label: 'Encerrar cotacao', descricao: 'Gerar os pedidos finais e encerrar definitivamente a cotacao.' },
          { key: 'compras.cotacoes.encerrar_sem_pedido', label: 'Encerrar sem pedido', descricao: 'Encerrar definitivamente a cotacao descartando o saldo restante sem gerar novos pedidos.' },
          { key: 'compras.cotacoes.reabrir', label: 'Reabrir cotacao', descricao: 'Reabrir cotacao respondida para novo envio com justificativa.' }
        ]
      },
      {
        key: 'compras.fornecedores',
        label: 'Fornecedores',
        permissoes: [
          { key: 'compras.fornecedores.visualizar', label: 'Visualizar fornecedores', descricao: 'Ver fornecedores cadastrados para cotacao.' },
          { key: 'compras.fornecedores.gerenciar', label: 'Gerenciar fornecedores', descricao: 'Cadastrar, editar e inativar fornecedores.' }
        ]
      },
      {
        key: 'compras.insumos',
        label: 'Insumos',
        permissoes: [
          { key: 'compras.insumos.catalogar_itens_manuais', label: 'Catalogar itens manuais', descricao: 'Vincular itens manuais a insumos existentes ou criar insumos oficiais pela tela de detalhes.' }
        ]
      },
      {
        key: 'compras.configuracoes',
        label: 'Configuracoes de Compras',
        permissoes: [
          { key: 'compras.configuracoes.cotacoes', label: 'Configurar cotacoes', descricao: 'Alterar parametros operacionais de cotacao.' },
          { key: 'compras.configuracoes.status_pedidos', label: 'Configurar status de pedidos', descricao: 'Gerenciar status do fluxo de pedidos de compra.' },
          { key: 'compras.configuracoes.cadastros', label: 'Cadastros de compras', descricao: 'Gerenciar insumos, unidades e categorias de compras.' }
        ]
      },
      {
        key: 'compras.relatorios',
        label: 'Relatórios de Compras',
        permissoes: [
          { key: 'compras.relatorios.visualizar', label: 'Visualizar hub de relatórios', descricao: 'Acessar a página central de relatórios de compras.' },
          { key: 'compras.relatorios.cotacoes', label: 'Relatórios de cotações', descricao: 'Acessar análises de economia, pendências, fornecedores e ciclo de cotação.' },
          { key: 'compras.relatorios.pedidos', label: 'Relatórios de pedidos', descricao: 'Acessar demanda, evolução, categorias, insumos e compras por fornecedor.' }
        ]
      }
    ]
  },
  {
    modulo: 'FINANCEIRO',
    label: 'Financeiro',
    descricao: 'Títulos, conciliação bancária, relatórios e cadastros financeiros.',
    areas: [
      {
        key: 'financeiro.titulos',
        label: 'Títulos Financeiros',
        permissoes: [
          { key: 'financeiro.titulos.visualizar', label: 'Visualizar títulos', descricao: 'Ver lista e detalhes dos títulos a pagar e a receber.' },
          { key: 'financeiro.titulos.criar', label: 'Criar conta manual', descricao: 'Abrir novo título financeiro manualmente.' },
          { key: 'financeiro.titulos.importar', label: 'Importar contas a pagar', descricao: 'Exportar o modelo, validar e confirmar títulos a pagar por planilha.' },
          { key: 'financeiro.titulos.exportar', label: 'Exportar títulos', descricao: 'Exportar em CSV os títulos listados conforme os filtros e colunas visíveis.' },
          { key: 'financeiro.titulos.importar_codigos', label: 'Importar códigos de boleto', descricao: 'Importar por CSV linha digitável, código de barras e banco dos títulos.' },
          { key: 'financeiro.titulos.baixar', label: 'Registrar baixa / pagamento', descricao: 'Quitar ou baixar parcialmente um título.' },
          { key: 'financeiro.titulos.excluir', label: 'Excluir títulos', descricao: 'Excluir logicamente títulos abertos sem movimentos financeiros ativos.' },
          { key: 'financeiro.titulos.estornar', label: 'Estornar movimento', descricao: 'Reverter uma baixa ou pagamento registrado.' },
          { key: 'financeiro.titulos.pagamentos_bancarios.visualizar', label: 'Ver pagamentos bancarios do titulo', descricao: 'Exibe intencoes e lotes de pagamentos bancarios no detalhe do titulo.' },
          { key: 'financeiro.titulos.movimentos.visualizar', label: 'Ver movimentos financeiros do titulo', descricao: 'Exibe baixas, estornos e movimentos financeiros vinculados ao titulo.' },
          { key: 'financeiro.titulos.auditoria.visualizar', label: 'Ver auditoria financeira do titulo', descricao: 'Exibe eventos de criacao, baixas, estornos e rastreabilidade financeira do titulo.' }
        ]
      },
      {
        key: 'financeiro.comprovantes',
        label: 'Comprovantes',
        permissoes: [
          { key: 'financeiro.comprovantes.excluir', label: 'Excluir comprovantes', descricao: 'Permite excluir comprovantes pendentes ou vinculados.' }
        ]
      },
      {
        key: 'financeiro.cheques',
        label: 'Carteira de Cheques de Terceiros',
        permissoes: [
          { key: 'financeiro.cheques.visualizar', label: 'Visualizar carteira de cheques', descricao: 'Consultar cheques em custodia e o historico de cada documento.' },
          { key: 'financeiro.cheques.cadastrar', label: 'Cadastrar saldo inicial', descricao: 'Registrar cheques legados sem criar receita ou titulo financeiro.' },
          { key: 'financeiro.cheques.importar', label: 'Importar cheques', descricao: 'Baixar o modelo, validar e confirmar uma importacao de cheques.' },
          { key: 'financeiro.cheques.depositar', label: 'Registrar deposito', descricao: 'Retirar um cheque da carteira por deposito identificado.' },
          { key: 'financeiro.cheques.devolver', label: 'Registrar devolucao', descricao: 'Marcar um cheque como devolvido com motivo auditavel.' },
          { key: 'financeiro.cheques.cancelar', label: 'Cancelar cheque', descricao: 'Cancelar um registro incorreto ou inutilizavel com justificativa.' },
          { key: 'financeiro.cheques.transferir', label: 'Transferir custodia', descricao: 'Transferir o cheque para outra empresa do grupo com rastreabilidade.' }
        ]
      },
      {
        key: 'financeiro.baixas_compostas',
        label: 'Baixas com Multiplas Fontes',
        permissoes: [
          { key: 'financeiro.baixas_compostas.visualizar', label: 'Visualizar baixas compostas', descricao: 'Consultar pagamentos formados por mais de uma conta, forma ou cheque.' },
          { key: 'financeiro.baixas_compostas.criar', label: 'Preparar baixa composta', descricao: 'Selecionar titulos e montar componentes e rateios do pagamento.' },
          { key: 'financeiro.baixas_compostas.confirmar', label: 'Confirmar baixa composta', descricao: 'Gravar de forma atomica os componentes e as baixas dos titulos.' },
          { key: 'financeiro.baixas_compostas.estornar', label: 'Estornar baixa composta', descricao: 'Estornar integralmente o grupo de pagamento e restaurar cheques utilizados.' }
        ]
      },
      {
        key: 'financeiro.relatorios',
        label: 'Relatórios Financeiros',
        permissoes: [
          { key: 'financeiro.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar fluxo de caixa e relatórios gerenciais.' },
          { key: 'financeiro.relatorios.grupo_consolidado', label: 'Grupo consolidado', descricao: 'Acessar a visão executiva consolidada do grupo.' },
          { key: 'financeiro.relatorios.fluxo_consolidado', label: 'Fluxo consolidado', descricao: 'Acessar fluxo de caixa consolidado por empresa e grupo.' },
          { key: 'financeiro.relatorios.dre', label: 'DRE gerencial', descricao: 'Acessar a DRE gerencial por grupo e empresa.' },
          { key: 'financeiro.relatorios.diagnostico_dre', label: 'Diagnóstico DRE', descricao: 'Ver inconsistências cadastrais que afetam a DRE.' },
          { key: 'financeiro.relatorios.intercompany', label: 'Entre Empresas', descricao: 'Acessar movimentações e relações financeiras entre empresas.' },
          { key: 'financeiro.relatorios.endividamento', label: 'Endividamento', descricao: 'Acessar relatório de dívidas classificadas explicitamente.' },
          { key: 'financeiro.relatorios.analitico', label: 'Analítico financeiro', descricao: 'Acessar base analítica de títulos e movimentos financeiros.' },
          { key: 'financeiro.relatorios.financeiro_obras', label: 'Financeiro de obras', descricao: 'Acessar realizado, comprometido e a realizar por obra.' },
          { key: 'financeiro.relatorios.movimentacao_contas', label: 'Movimentacao de contas', descricao: 'Acessar entradas, saidas e permutas por conta bancaria.' },
          { key: 'financeiro.relatorios.conciliacao_contas', label: 'Conciliacao de contas', descricao: 'Acessar relatorio de movimentos bancarios conciliados, pendentes e ignorados.' },
          { key: 'financeiro.relatorios.resultado_obras', label: 'Resultado de obras', descricao: 'Ver dashboard financeiro por obra.' },
          { key: 'financeiro.relatorios.centros_custo', label: 'Centros de custo', descricao: 'Ver resultado financeiro por centro de custo.' }
        ]
      },
      {
        key: 'financeiro.conciliacao',
        label: 'Conciliação OFX',
        permissoes: [
          { key: 'financeiro.conciliacao.visualizar', label: 'Visualizar conciliação', descricao: 'Ver movimentos e sugestões de conciliação bancária.' },
          { key: 'financeiro.conciliacao.importar', label: 'Importar arquivo OFX', descricao: 'Fazer upload de extratos bancários em formato OFX.' },
          { key: 'financeiro.conciliacao.conciliar', label: 'Conciliar lançamentos', descricao: 'Confirmar, criar título ou ignorar movimentos bancários.' },
          { key: 'financeiro.conciliacao.estornar', label: 'Estornar conciliação', descricao: 'Desfazer uma conciliação incorreta e devolver o lançamento OFX para conferência manual.' }
        ]
      },
      {
        key: 'financeiro.bancos',
        label: 'Bancos Enterprise',
        permissoes: [
          { key: 'financeiro.bancos.visualizar', label: 'Visualizar bancos', descricao: 'Acessar painel consolidado de contas, remessas, retornos, pagamentos e conciliacoes.' },
          { key: 'financeiro.bancos.auditar', label: 'Auditar eventos bancarios', descricao: 'Consultar timeline, falhas tecnicas e eventos consolidados de integracoes bancarias.' },
          { key: 'financeiro.bancos.conciliar', label: 'Operar conciliacao bancaria', descricao: 'Acessar acoes relacionadas a conciliacao dentro da visao bancaria consolidada.' },
          { key: 'financeiro.bancos.remessas', label: 'Acompanhar remessas', descricao: 'Acompanhar remessas CNAB e integracoes de envio por banco.' },
          { key: 'financeiro.bancos.retornos', label: 'Acompanhar retornos', descricao: 'Acompanhar retornos CNAB, rejeicoes e liquidacoes bancarias.' },
          { key: 'financeiro.bancos.configurar', label: 'Configurar bancos', descricao: 'Preparar parametros e providers bancarios quando liberado.' }
        ]
      },
      {
        key: 'financeiro.cadastros',
        label: 'Cadastros Financeiros',
        permissoes: [
          { key: 'financeiro.cadastros.visualizar', label: 'Visualizar cadastros', descricao: 'Ver contas bancárias e categorias financeiras.' },
          { key: 'financeiro.cadastros.gerenciar', label: 'Gerenciar cadastros', descricao: 'Criar e editar contas bancárias e categorias.' }
        ]
      },
      {
        key: 'financeiro.pagamentos',
        label: 'Pagamentos em Massa',
        permissoes: [
          { key: 'financeiro.pagamentos.visualizar', label: 'Visualizar pagamentos', descricao: 'Ver lotes, intents e status bancario.' },
          { key: 'financeiro.pagamentos.preparar', label: 'Preparar lotes', descricao: 'Selecionar titulos elegiveis e criar lotes de pagamento.' },
          { key: 'financeiro.pagamentos.aprovar', label: 'Aprovar lotes', descricao: 'Papel aprovador: confere e aprova lotes de outros usuarios; incompativel com criar ou enviar lotes.' },
          { key: 'financeiro.pagamentos.rejeitar', label: 'Rejeitar lotes', descricao: 'Rejeitar lotes antes do envio bancario.' },
          { key: 'financeiro.pagamentos.enviar_banco', label: 'Enviar lotes proprios ao banco', descricao: 'Papel operador: envia somente lotes criados pelo proprio usuario e aprovados por outra pessoa.' },
          { key: 'financeiro.pagamentos.sincronizar_banco', label: 'Sincronizar retorno bancario', descricao: 'Atualizar manualmente o status do lote junto ao Banco do Brasil.' },
          { key: 'financeiro.pagamentos.cancelar', label: 'Cancelar pagamentos', descricao: 'Cancelar lotes ou itens antes do envio definitivo.' },
          { key: 'financeiro.pagamentos.reprocessar', label: 'Reprocessar falhas', descricao: 'Reprocessar jobs ou retornos elegiveis.' },
          { key: 'financeiro.pagamentos.confirmar_baixa', label: 'Confirmar baixa', descricao: 'Confirmar baixa semiautomatica apos confirmacao bancaria.' },
          { key: 'financeiro.pagamentos.auditar', label: 'Auditar pagamentos', descricao: 'Consultar logs tecnicos, aprovacoes e eventos bancarios.' },
          { key: 'financeiro.pagamentos.configurar', label: 'Configurar pagamentos', descricao: 'Gerenciar providers e contas pagadoras.' }
        ]
      },
      {
        key: 'financeiro.fila_pagamentos',
        label: 'Fila de Pagamentos',
        permissoes: [
          { key: 'financeiro.fila_pagamentos.visualizar', label: 'Visualizar fila', descricao: 'Acessar somente os titulos encaminhados para pagamento manual.' },
          { key: 'financeiro.fila_pagamentos.preparar', label: 'Enviar titulos para a fila', descricao: 'Selecionar contas a pagar e encaminha-las ao operador de pagamentos.' },
          { key: 'financeiro.fila_pagamentos.baixar', label: 'Registrar baixas da fila', descricao: 'Informar conta, data e valor efetivamente pago e registrar baixas individuais ou em massa.' },
          { key: 'financeiro.fila_pagamentos.reportar', label: 'Informar nao pagamento', descricao: 'Registrar que um titulo da fila nao foi pago, com justificativa.' },
          { key: 'financeiro.fila_pagamentos.resolver', label: 'Resolver divergencias', descricao: 'Reabrir ou encerrar pendencias de pagamento divergente e nao realizado.' }
        ]
      },
      {
        key: 'financeiro.dda',
        label: 'DDA Bancario',
        permissoes: [
          { key: 'financeiro.dda.visualizar', label: 'Visualizar DDA', descricao: 'Consultar boletos eletronicamente apresentados e seus vinculos financeiros.' },
          { key: 'financeiro.dda.sincronizar', label: 'Sincronizar DDA', descricao: 'Solicitar consulta de documentos DDA no provedor bancario quando a integracao estiver homologada.' },
          { key: 'financeiro.dda.vincular', label: 'Vincular titulos', descricao: 'Confirmar sugestoes exatas ou vincular manualmente um documento DDA a um titulo a pagar.' },
          { key: 'financeiro.dda.ignorar', label: 'Ignorar documentos', descricao: 'Ignorar documento DDA mediante justificativa auditavel.' },
          { key: 'financeiro.dda.auditar', label: 'Auditar DDA', descricao: 'Consultar sincronizacoes, eventos, divergencias e decisoes de vinculo.' },
          { key: 'financeiro.dda.configurar', label: 'Configurar DDA', descricao: 'Gerenciar futuramente contas, escopos e provider do DDA.' }
        ]
      },
      {
        key: 'financeiro.favorecidos',
        label: 'Favorecidos Bancarios',
        permissoes: [
          { key: 'financeiro.favorecidos.visualizar', label: 'Visualizar favorecidos', descricao: 'Ver dados bancarios/PIX de favorecidos.' },
          { key: 'financeiro.favorecidos.gerenciar', label: 'Gerenciar favorecidos', descricao: 'Criar, editar, validar, ativar e desativar favorecidos.' },
          { key: 'financeiro.favorecidos.auditar', label: 'Auditar favorecidos', descricao: 'Ver historico de alteracoes sensiveis em favorecidos.' }
        ]
      }
    ]
  },
  {
    modulo: 'BOLETOS',
    label: 'Boletos',
    descricao: 'Emissao de boletos bancarios a partir de titulos financeiros a receber.',
    areas: [
      {
        key: 'boletos.emitir',
        label: 'Emissao de Boletos',
        permissoes: [
          { key: 'boletos.emitir.visualizar', label: 'Visualizar boletos', descricao: 'Ver titulos elegiveis e boletos ja emitidos.' },
          { key: 'boletos.emitir.gerar', label: 'Gerar boleto', descricao: 'Gerar codigo de barras, linha digitavel e ficha de compensacao.' }
        ]
      }
    ]
  },
  {
    modulo: 'FISCAL',
    label: 'Fiscal',
    descricao: 'Entrada fiscal, documentos fiscais, configuracoes e logs de sincronizacao.',
    areas: [
      {
        key: 'fiscal.geral',
        label: 'Acesso Fiscal',
        permissoes: [
          { key: 'fiscal.view', label: 'Acessar modulo fiscal', descricao: 'Exibe o menu e o painel inicial do modulo Fiscal.' }
        ]
      },
      {
        key: 'fiscal.config',
        label: 'Configuracoes Fiscais',
        permissoes: [
          { key: 'fiscal.config.manage', label: 'Gerenciar configuracoes fiscais', descricao: 'Cadastrar empresas fiscais e parametrizacoes iniciais do modulo.' }
        ]
      },
      {
        key: 'fiscal.document',
        label: 'Documentos Fiscais',
        permissoes: [
          { key: 'fiscal.document.view', label: 'Visualizar documentos fiscais', descricao: 'Consultar caixa de entrada e detalhes de documentos fiscais.' },
          { key: 'fiscal.document.upload', label: 'Importar XML fiscal', descricao: 'Importar XML fiscal manualmente para a caixa fiscal.' },
          { key: 'fiscal.document.link', label: 'Vincular documentos fiscais', descricao: 'Preparar vinculos manuais entre documentos fiscais e outros modulos.' },
          { key: 'fiscal.document.ignore', label: 'Ignorar documentos fiscais', descricao: 'Marcar documentos fiscais como ignorados na caixa fiscal.' }
        ]
      },
      {
        key: 'fiscal.sync',
        label: 'Sincronizacao Fiscal',
        permissoes: [
          { key: 'fiscal.sync.view', label: 'Visualizar sincronizacao', descricao: 'Consultar estado de NSU e sincronizacoes fiscais.' },
          { key: 'fiscal.sync.run', label: 'Executar sincronizacao manual', descricao: 'Iniciar tentativa manual controlada de sincronizacao fiscal em DEV.' },
          { key: 'fiscal.logs.view', label: 'Visualizar logs fiscais', descricao: 'Consultar logs de processamento e auditoria tecnica fiscal.' }
        ]
      },
      {
        key: 'fiscal.relatorios',
        label: 'Relatórios Fiscais',
        permissoes: [
          { key: 'fiscal.relatorios.visualizar', label: 'Visualizar relatórios fiscais', descricao: 'Acessar o hub e o painel operacional fiscal.' }
        ]
      }
    ]
  },
  {
    modulo: 'OBRAS',
    label: 'Obras',
    descricao: 'Cadastro e gestão de obras.',
    areas: [
      {
        key: 'obras.cadastro',
        label: 'Cadastro de Obras',
        permissoes: [
          { key: 'obras.cadastro.visualizar', label: 'Visualizar obras', descricao: 'Ver lista de obras e informações básicas.' },
          { key: 'obras.cadastro.gerenciar', label: 'Criar e editar obras', descricao: 'Cadastrar novas obras e editar existentes.' }
        ]
      },
      {
        key: 'obras.gestao',
        label: 'Gestão de Obras',
        permissoes: [
          { key: 'obras.gestao.visualizar', label: 'Visualizar gestão', descricao: 'Acessar o dashboard de gestão por obra (orçado, executado, solicitações).' },
          { key: 'obras.gestao.apropriacoes', label: 'Gerenciar apropriações', descricao: 'Criar e editar apropriações orçamentárias por obra.' }
        ]
      }
    ]
  },
  {
    modulo: 'CUSTOS_RECEBIVEIS',
    label: 'Custos e Recebiveis',
    descricao: 'Planejamento mensal, custos realizados, recebiveis e governanca por obra.',
    areas: [
      {
        key: 'custos_recebiveis.acesso',
        label: 'Acesso e escopo',
        permissoes: [
          { key: 'custos_recebiveis.modulo.acessar', label: 'Acessar modulo', descricao: 'Permite acessar o modulo Custos e Recebiveis quando habilitado na instalacao.' },
          { key: 'custos_recebiveis.escopo.todas_obras', label: 'Visualizar todas as obras', descricao: 'Amplia o escopo do modulo para todas as obras, independentemente dos vinculos do usuario.' }
        ]
      },
      {
        key: 'custos_recebiveis.visualizacao',
        label: 'Visualizacao',
        permissoes: [
          { key: 'custos_recebiveis.dashboard.visualizar', label: 'Visualizar dashboard', descricao: 'Permite consultar os indicadores do modulo.' },
          { key: 'custos_recebiveis.comparativo.visualizar', label: 'Visualizar comparativo', descricao: 'Permite comparar planejado, consolidado e realizado.' },
          { key: 'custos_recebiveis.obras.visualizar', label: 'Visualizar obras', descricao: 'Permite consultar as obras dentro do escopo autorizado.' },
          { key: 'custos_recebiveis.estrutura_micro.visualizar', label: 'Visualizar estrutura micro', descricao: 'Permite consultar versoes e itens do plano micro.' },
          { key: 'custos_recebiveis.planejamento.visualizar', label: 'Visualizar planejamento', descricao: 'Permite consultar previsoes mensais de custos e recebiveis.' },
          { key: 'custos_recebiveis.medicao.visualizar', label: 'Visualizar medicoes', descricao: 'Permite consultar medicoes consolidadas de obras publicas.' },
          { key: 'custos_recebiveis.realizados.visualizar', label: 'Visualizar realizados', descricao: 'Permite consultar custos realizados e itens nao mapeados.' },
          { key: 'custos_recebiveis.obrigacoes.visualizar', label: 'Visualizar obrigacoes', descricao: 'Permite consultar obrigacoes e prazos dos responsaveis.' },
          { key: 'custos_recebiveis.auditoria.visualizar', label: 'Visualizar auditoria', descricao: 'Permite consultar a trilha de auditoria do modulo.' }
        ]
      },
      {
        key: 'custos_recebiveis.estrutura',
        label: 'Estrutura micro',
        permissoes: [
          { key: 'custos_recebiveis.estrutura_micro.importar', label: 'Importar estrutura micro', descricao: 'Permite validar e importar uma nova versao da planilha micro.' },
          { key: 'custos_recebiveis.estrutura_micro.publicar_versao', label: 'Publicar versao micro', descricao: 'Permite publicar uma versao validada do plano micro.' }
        ]
      },
      {
        key: 'custos_recebiveis.planejamento',
        label: 'Planejamento mensal',
        permissoes: [
          { key: 'custos_recebiveis.planejamento.preencher_custos', label: 'Preencher custos planejados', descricao: 'Permite registrar custos planejados por competencia.' },
          { key: 'custos_recebiveis.planejamento.preencher_recebiveis', label: 'Preencher recebiveis previstos', descricao: 'Permite registrar ou confirmar recebiveis previstos por competencia.' },
          { key: 'custos_recebiveis.planejamento.finalizar', label: 'Finalizar planejamento', descricao: 'Permite finalizar e congelar a competencia planejada.' }
        ]
      },
      {
        key: 'custos_recebiveis.medicao',
        label: 'Medicao consolidada',
        permissoes: [
          { key: 'custos_recebiveis.medicao.consolidar', label: 'Consolidar medicao', descricao: 'Permite consolidar medicao de obra publica.' }
        ]
      },
      {
        key: 'custos_recebiveis.realizados',
        label: 'Custos realizados',
        permissoes: [
          { key: 'custos_recebiveis.realizados.atualizar', label: 'Atualizar realizados', descricao: 'Permite executar a atualizacao idempotente dos realizados.' },
          { key: 'custos_recebiveis.realizados.reconciliar', label: 'Reconciliar realizados', descricao: 'Permite mapear e reconciliar movimentos pendentes.' }
        ]
      },
      {
        key: 'custos_recebiveis.governanca',
        label: 'Governanca',
        permissoes: [
          { key: 'custos_recebiveis.reabertura.solicitar', label: 'Solicitar reabertura', descricao: 'Permite solicitar a reabertura de uma competencia finalizada.' },
          { key: 'custos_recebiveis.reabertura.aprovar', label: 'Aprovar reabertura', descricao: 'Permite aprovar ou negar solicitacoes de reabertura.' },
          { key: 'custos_recebiveis.obrigacoes.conceder_bypass', label: 'Conceder bypass', descricao: 'Permite conceder excecao temporaria e auditada a obrigacoes vencidas.' },
          { key: 'custos_recebiveis.configuracoes.gerenciar', label: 'Gerenciar configuracoes', descricao: 'Permite alterar parametros operacionais do modulo.' }
        ]
      },
      {
        key: 'custos_recebiveis.saida',
        label: 'Relatorios e exportacoes',
        permissoes: [
          { key: 'custos_recebiveis.relatorio.exportar', label: 'Exportar relatorios', descricao: 'Permite exportar dados limitados ao mesmo escopo de obras do usuario.' }
        ]
      }
    ]
  },
  {
    modulo: 'CONTRATOS',
    label: 'Contratos',
    descricao: 'Gestão de contratos com fornecedores e parceiros.',
    areas: [
      {
        key: 'contratos.geral',
        label: 'Contratos',
        permissoes: [
          { key: 'contratos.geral.visualizar', label: 'Visualizar contratos', descricao: 'Ver lista e detalhes de contratos.' },
          { key: 'contratos.geral.criar', label: 'Criar contratos', descricao: 'Abrir novos contratos.' },
          { key: 'contratos.geral.editar', label: 'Editar contratos', descricao: 'Alterar dados e status de contratos existentes.' },
          {
            key: 'contratos.geral.encerrar',
            label: 'Encerrar contrato (quebra de contrato)',
            descricao: 'Encerra o contrato, zera o saldo restante e exclui os titulos em aberto. Nada mais do que estava previsto sera pago.'
          },
          {
            key: 'contratos.credor.completar_cadastro',
            label: 'Completar cadastro do credor no contrato',
            descricao: 'Permite corrigir ENDERECO e CPF/CNPJ do contratado direto na conferencia '
              + 'que antecede a criacao do contrato. Nao da acesso ao cadastro de parceiros: a rota '
              + 'altera somente esses campos, e nada mais. Existe porque 98% dos fornecedores estao '
              + 'sem endereco completo, e o Juridico precisa deles para montar a minuta.'
          },
          {
            key: 'contratos.solicitacao.cancelar',
            label: 'Cancelar a solicitacao do contrato',
            descricao: 'Encerra o pedido em definitivo: a solicitacao NAO volta para ajuste. '
              + 'Vale para o Juridico e para a Gerencia de Processos — quem manda e a permissao, nao o setor. '
              + 'Rejeitar e diferente: devolve ao responsavel em PENDENTE DE AJUSTE, para corrigir e reenviar.'
          },
          {
            key: 'contratos.fluxo.reenviar',
            label: 'Agir no contrato DE OUTRA PESSOA',
            descricao: 'Reenviar para aprovacao um contrato devolvido, e confirmar a assinatura, '
              + 'em contratos que a pessoa NAO abriu. Quem abriu ja pode fazer as duas coisas sem esta permissao. '
              + 'Existe porque antes esses dois botoes apareciam para qualquer um que pudesse CRIAR contratos — '
              + 'e criar contrato nao e o mesmo que tramitar o contrato dos outros. Sem conceder esta permissao a '
              + 'alguem, um contrato cujo autor esteja de ferias ou desligado fica parado.'
          }
        ]
      },
      {
        key: 'contratos.juridico',
        label: 'Juridico de contratos',
        permissoes: [
          {
            key: 'contratos.juridico.tramitar',
            label: 'Tramitar contrato no juridico',
            descricao: 'Avaliar a documentacao, marcar a minuta como pronta e registrar a assinatura. E na assinatura que as parcelas viram titulos.'
          }
        ]
      },
      {
        key: 'contratos.medicao',
        label: 'Medicao de contrato',
        permissoes: [
          {
            key: 'contratos.medicao.editar_valor',
            label: 'Editar valor de medicao ja criada',
            descricao: 'Permite alterar o valor da parcela depois que a solicitacao de medicao foi criada. Sem ela, o valor so pode ser definido na criacao.'
          }
        ]
      },
      {
        key: 'contratos.aprovacao',
        label: 'Aprovacao de contratos',
        permissoes: [
          {
            key: 'contratos.aprovacao.aprovar',
            label: 'Aprovar / rejeitar contratos',
            // Unica permissao do sistema sem bypass: nem SUPERADMIN nem ADMINISTRADOR
            // aprovam sem te-la marcada. Excecao deliberada, decidida pelo cliente.
            //
            // O rotulo dizia "acima do limite" e estava ERRADO: a checagem roda antes de o limite
            // ser sequer lido (`aprovarContrato`), entao ela vale para QUALQUER valor. Quem lesse
            // o texto antigo concluiria que contrato abaixo do limite dispensa a permissao — e
            // deixaria a Gerencia de Processos sem conseguir aprovar nada.
            descricao: 'Permite aprovar ou rejeitar contratos do fluxo novo, de QUALQUER valor. '
              + 'O que o limite decide e o caminho depois da aprovacao: abaixo dele o contrato vai '
              + 'direto a ATIVO e os titulos nascem; a partir dele segue para o JURIDICO, e os '
              + 'titulos so nascem na conferencia final. '
              + 'Exigida inclusive de SUPERADMIN e ADMINISTRADOR — sem ela, ninguem aprova.'
          }
        ]
      },
      {
        key: 'contratos.relatorios',
        label: 'Relatórios de Contratos',
        permissoes: [
          { key: 'contratos.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar relatórios operacionais e gerenciais de contratos.' }
        ]
      }
    ]
  },
  {
    modulo: 'COMERCIAL',
    label: 'Comercial',
    descricao: 'Empreendimentos, unidades, vendas e contratos comerciais.',
    areas: [
      {
        key: 'comercial.empreendimentos',
        label: 'Empreendimentos e Unidades',
        permissoes: [
          { key: 'comercial.empreendimentos.visualizar', label: 'Visualizar empreendimentos', descricao: 'Ver empreendimentos e disponibilidade de unidades.' },
          { key: 'comercial.empreendimentos.gerenciar', label: 'Gerenciar empreendimentos', descricao: 'Criar e editar empreendimentos e unidades.' }
        ]
      },
      {
        key: 'comercial.vendas',
        label: 'Vendas e Contratos',
        permissoes: [
          { key: 'comercial.vendas.visualizar', label: 'Visualizar vendas', descricao: 'Ver propostas, vendas e contratos comerciais.' },
          { key: 'comercial.vendas.criar', label: 'Criar proposta/venda', descricao: 'Registrar novas propostas e vendas.' },
          { key: 'comercial.vendas.contratos', label: 'Gerenciar contratos comerciais', descricao: 'Emitir e gerenciar contratos de venda.' },
          { key: 'comercial.vendas.importar', label: 'Importar contratos do Sienge', descricao: 'Baixar o modelo, validar e confirmar importacoes historicas de contratos e recebimentos.' }
        ]
      },
      {
        key: 'comercial.relatorios',
        label: 'Relatórios Comerciais',
        permissoes: [
          { key: 'comercial.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar relatórios de VGV, contratos, unidades e estoque comercial.' }
        ]
      }
    ]
  },
  {
    modulo: 'CRM',
    label: 'CRM',
    descricao: 'Leads, atendimento, tarefas, dashboards, automacoes e configuracoes comerciais.',
    areas: [
      {
        key: 'crm.dashboard',
        label: 'Dashboards CRM',
        permissoes: [
          { key: 'crm.dashboard.visualizar', label: 'Visualizar dashboards', descricao: 'Acessar dashboards operacional, gerencial, SLA e distribuicao.' }
        ]
      },
      {
        key: 'crm.leads',
        label: 'Leads e Pipeline',
        permissoes: [
          { key: 'crm.leads.visualizar', label: 'Visualizar leads', descricao: 'Ver listas, kanban, carteira, tarefas e detalhes de leads.' },
          { key: 'crm.leads.criar', label: 'Criar e editar leads', descricao: 'Criar leads, alterar etapas, registrar interacoes e tarefas.' },
          { key: 'crm.leads.exportar', label: 'Exportar leads', descricao: 'Exportar base de leads em relatorios.' },
          { key: 'crm.leads.redistribuir', label: 'Redistribuir leads', descricao: 'Redistribuir responsaveis e operar fila de distribuicao.' }
        ]
      },
      {
        key: 'crm.atendimento',
        label: 'Atendimento CRM',
        permissoes: [
          { key: 'crm.atendimento.visualizar', label: 'Visualizar conversas', descricao: 'Acessar inbox e historico de conversas.' },
          { key: 'crm.atendimento.enviar', label: 'Enviar mensagens', descricao: 'Criar conversas, mensagens e templates.' }
        ]
      },
      {
        key: 'crm.automacoes',
        label: 'Automacoes CRM',
        permissoes: [
          { key: 'crm.automacoes.visualizar', label: 'Visualizar automacoes', descricao: 'Ver regras e execucoes de automacao.' },
          { key: 'crm.automacoes.gerenciar', label: 'Gerenciar automacoes', descricao: 'Criar, editar, ativar e executar automacoes.' }
        ]
      },
      {
        key: 'crm.configuracoes',
        label: 'Configuracoes CRM',
        permissoes: [
          { key: 'crm.configuracoes.visualizar', label: 'Visualizar configuracoes', descricao: 'Ver canais, numeros e integracoes.' },
          { key: 'crm.configuracoes.gerenciar', label: 'Gerenciar configuracoes', descricao: 'Criar, editar e remover canais, numeros e integracoes.' }
        ]
      },
      {
        key: 'crm.relatorios',
        label: 'Relatórios CRM',
        permissoes: [
          { key: 'crm.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar relatórios executivos e gerenciais do CRM.' }
        ]
      }
    ]
  },
  {
    modulo: 'RH_DP',
    label: 'RH/DP',
    descricao: 'Colaboradores, documentos, importacoes, apuracoes e fechamentos.',
    areas: [
      {
        key: 'rh_dp.dashboard',
        label: 'Dashboard RH/DP',
        permissoes: [
          { key: 'rh_dp.dashboard.visualizar', label: 'Visualizar dashboard', descricao: 'Abrir a visao inicial do modulo RH/DP.' }
        ]
      },
      {
        key: 'rh_dp.empresas',
        label: 'Empresas do Grupo',
        permissoes: [
          { key: 'rh_dp.empresas.gerenciar', label: 'Gerenciar empresas', descricao: 'Criar e editar empresas do grupo usadas no RH/DP.' }
        ]
      },
      {
        key: 'rh_dp.colaboradores',
        label: 'Colaboradores',
        permissoes: [
          { key: 'rh_dp.colaboradores.visualizar', label: 'Visualizar colaboradores', descricao: 'Listar e detalhar colaboradores.' },
          { key: 'rh_dp.colaboradores.editar', label: 'Editar colaboradores', descricao: 'Cadastrar, editar e importar colaboradores.' }
        ]
      },
      {
        /**
         * Pedido de pessoal (Fase 2 do modulo DP, 25/08): a Obra pede, o DP decide.
         *
         * O PREFIXO E `rh_dp`, MAS QUEM EXISTE HOJE E SO O DP.
         *
         * `RH` e `DEPARTAMENTO PESSOAL` sao setores DIFERENTES na empresa (setores 5 e 10). Em
         * 26/08 o cliente confirmou: TODAS as etapas construidas aqui — decidir admissao, demissao,
         * troca de obra, atestar documento, apurar folha, instruir alteracao salarial — sao do
         * **DP**. O **RH ainda nao existe no sistema**; ele vai nascer depois e vai REUSAR parte
         * disto.
         *
         * O prefixo `rh_dp` fica de proposito, por duas razoes:
         *
         * 1. ele ja esta em producao, dentro da configuracao VERSIONADA de permissoes de 30
         *    usuarios. Renomear exigiria migrar essa configuracao, as 12 tabelas `rh_*`, as rotas e
         *    as telas — refatoracao grande em codigo vivo, por ganho de nome;
         * 2. `dp.colaboradores.visualizar` ficaria PIOR no dia em que o RH chegar. A permissao diz o
         *    que ela libera, nao de quem e — e ver colaborador e coisa que os dois setores vao
         *    precisar.
         *
         * O que garante que o RH consiga reusar: NENHUM servico deste modulo conhece o setor. Quem
         * decide e definido por PERMISSAO, e `rh_solicitacoes` guarda so `setor_origem` (de onde
         * veio, para a devolucao voltar) — nao ha setor de destino em lugar nenhum. Conceder a
         * permissao a um usuario do RH basta; nao ha codigo a mudar.
         */
        key: 'rh_dp.solicitacoes',
        label: 'Solicitacoes de pessoal',
        permissoes: [
          { key: 'rh_dp.solicitacoes.abrir', label: 'Abrir solicitacao de pessoal', descricao: 'Pedir admissao, demissao, troca de obra e evento recorrente.' },
          { key: 'rh_dp.solicitacoes.anexar', label: 'Anexar documento na solicitacao', descricao: 'Enviar documentos, atestados e certificados junto do pedido.' },
          { key: 'rh_dp.solicitacoes.decidir', label: 'Decidir solicitacao de pessoal', descricao: 'Aprovar ou devolver os pedidos abertos pelas obras.' },
          { key: 'rh_dp.solicitacoes.ver_todas', label: 'Ver solicitacoes de todas as obras', descricao: 'Sem esta permissao o usuario enxerga apenas a obra dele.' },
          { key: 'rh_dp.salario.aprovar', label: 'Aprovar alteracao salarial', descricao: 'Decisao de Diretoria sobre mudanca de salario. Concedida nominalmente.' }
        ]
      },
      {
        key: 'rh_dp.documentos',
        label: 'Documentos',
        permissoes: [
          { key: 'rh_dp.documentos.visualizar', label: 'Visualizar documentos', descricao: 'Consultar documentos, pendencias e links assinados.' },
          { key: 'rh_dp.documentos.gerenciar', label: 'Gerenciar documentos', descricao: 'Enviar, substituir e atualizar documentos.' }
        ]
      },
      {
        key: 'rh_dp.importacoes',
        label: 'Importacoes',
        permissoes: [
          { key: 'rh_dp.importacoes.executar', label: 'Executar importacoes', descricao: 'Subir planilhas, gerar preview e confirmar lotes.' }
        ]
      },
      {
        key: 'rh_dp.apuracao',
        label: 'Apuracao',
        permissoes: [
          { key: 'rh_dp.apuracao.visualizar', label: 'Visualizar apuracoes', descricao: 'Listar e detalhar apuracoes.' },
          { key: 'rh_dp.apuracao.editar', label: 'Editar apuracoes', descricao: 'Gerar apuracao, ajustar itens e concluir conferencia.' }
        ]
      },
      {
        key: 'rh_dp.fechamento',
        label: 'Fechamentos',
        permissoes: [
          { key: 'rh_dp.fechamento.executar', label: 'Fechar competencia', descricao: 'Fechar competencia e gerar titulos no financeiro.' },
          { key: 'rh_dp.fechamento.reabrir', label: 'Reabrir fechamento', descricao: 'Reabrir competencias fechadas quando necessario.' },
          { key: 'rh_dp.obrigacoes.visualizar', label: 'Visualizar obrigacoes', descricao: 'Acessar fechamentos e titulos gerados.' }
        ]
      },
      {
        key: 'rh_dp.relatorios',
        label: 'Relatórios RH/DP',
        permissoes: [
          { key: 'rh_dp.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar relatórios operacionais de colaboradores, documentos e apurações.' }
        ]
      }
    ]
  },
  {
    modulo: 'PROVISOES',
    label: 'Provisionamento',
    descricao: 'Previsao gerencial de desembolso, dashboard e acompanhamento de provisoes por obra.',
    areas: [
      {
        key: 'provisoes.lista',
        label: 'Provisionamentos',
        permissoes: [
          { key: 'provisoes.lista.visualizar', label: 'Visualizar provisionamentos', descricao: 'Ver a lista e o detalhe das provisoes financeiras.' },
          { key: 'provisoes.cadastro.criar', label: 'Criar provisoes', descricao: 'Registrar novas provisoes financeiras.' },
          { key: 'provisoes.cadastro.editar', label: 'Editar provisoes', descricao: 'Editar dados, comentarios e anexos das provisoes.' }
        ]
      },
      {
        key: 'provisoes.dashboard',
        label: 'Dashboard de Previsao',
        permissoes: [
          { key: 'provisoes.dashboard.visualizar', label: 'Visualizar dashboard', descricao: 'Acessar a leitura gerencial de previsao por obra, periodo e categoria.' },
          { key: 'provisoes.relatorios.visualizar', label: 'Visualizar relatórios', descricao: 'Acessar relatórios operacionais e gerenciais de provisionamento.' }
        ]
      },
      {
        key: 'provisoes.categorias',
        label: 'Categorias Macro',
        permissoes: [
          { key: 'provisoes.categorias.gerenciar', label: 'Gerenciar categorias macro', descricao: 'Criar, editar, ativar e desativar categorias macro do modulo.' }
        ]
      },
      {
        key: 'provisoes.status',
        label: 'Status e Aprovação',
        permissoes: [
          { key: 'provisoes.status.gerenciar', label: 'Gerenciar status', descricao: 'Habilita ações futuras de aprovação, tratamento e controle de status das provisões.' }
        ]
      }
    ]
  },
  {
    modulo: 'SST',
    label: 'SST',
    descricao: 'Saude e seguranca do trabalho, conformidade operacional, documentos e base futura eSocial.',
    areas: [
      {
        key: 'sst.dashboard',
        label: 'Dashboard SST',
        permissoes: [
          { key: 'sst.dashboard.visualizar', label: 'Visualizar dashboard', descricao: 'Acessar indicadores de conformidade, vencimentos, riscos e acidentes.' },
          { key: 'sst.analytics.visualizar', label: 'Visualizar analytics', descricao: 'Acessar leituras analiticas, eventos operacionais e futuras visoes inteligentes do SST.' },
          { key: 'sst.centro_operacional.visualizar', label: 'Visualizar centro operacional', descricao: 'Acessar visao corporativa multiempresa, scores, riscos e tendencias SST.' },
          { key: 'sst.inteligencia.visualizar', label: 'Visualizar inteligencia operacional', descricao: 'Acessar sinais, recomendacoes e leitura executiva do motor SST.' },
          { key: 'sst.timeline.visualizar', label: 'Visualizar timeline SST', descricao: 'Acessar timeline operacional de colaboradores.' },
          { key: 'sst.heatmap.visualizar', label: 'Visualizar heatmap SST', descricao: 'Acessar mapa de risco operacional por obra, empresa e funcao.' },
          { key: 'sst.observabilidade.visualizar', label: 'Visualizar observabilidade', descricao: 'Acessar logs, checks de homologacao, flags e saude operacional SST.' },
          { key: 'sst.producao.visualizar', label: 'Visualizar producao controlada', descricao: 'Acessar rollout assistido, telemetria, hardening e readiness operacional SST.' },
          { key: 'sst.enterprise.visualizar', label: 'Visualizar SST enterprise', descricao: 'Acessar readiness corporativo, filas, jobs, cache, qualidade e governanca SST.' },
          { key: 'sst.rollout.gerenciar', label: 'Gerenciar rollout SST', descricao: 'Criar e ajustar planos de ativacao gradual do SST.' },
          { key: 'sst.telemetria.visualizar', label: 'Visualizar telemetria SST', descricao: 'Acessar metricas operacionais de estabilidade e producao assistida.' },
          { key: 'sst.performance.visualizar', label: 'Visualizar performance SST', descricao: 'Acessar metricas de performance, filas e saude de workers SST.' },
          { key: 'sst.alertas.gerenciar', label: 'Gerenciar alertas SST', descricao: 'Gerar, tratar e resolver alertas operacionais do modulo SST.' },
          { key: 'sst.hardening.gerenciar', label: 'Gerenciar hardening SST', descricao: 'Configurar politicas de timeout, retry, cooldown e controles de resiliencia SST.' },
          { key: 'sst.jobs.gerenciar', label: 'Gerenciar jobs SST', descricao: 'Enfileirar, processar e auditar jobs internos do modulo SST.' },
          { key: 'sst.cache.gerenciar', label: 'Gerenciar cache SST', descricao: 'Consultar e limpar cache operacional de dashboards, scores e analytics SST.' },
          { key: 'sst.qualidade.gerenciar', label: 'Gerenciar qualidade SST', descricao: 'Executar quality checks e tratar inconsistencias operacionais SST.' },
          { key: 'sst.governanca.visualizar', label: 'Visualizar governanca SST', descricao: 'Consultar logs de governanca, auditoria e trilha operacional enterprise SST.' },
          { key: 'sst.analytics.gerenciar', label: 'Gerenciar eventos analytics', descricao: 'Tratar eventos operacionais SST sem alterar a origem do fato registrado.' }
        ]
      },
      {
        key: 'sst.riscos',
        label: 'Riscos e Agentes',
        permissoes: [
          { key: 'sst.riscos.visualizar', label: 'Visualizar riscos', descricao: 'Consultar riscos ocupacionais por empresa, obra, setor e funcao.' },
          { key: 'sst.riscos.gerenciar', label: 'Gerenciar riscos', descricao: 'Criar e editar riscos ocupacionais.' },
          { key: 'sst.agentes.visualizar', label: 'Visualizar agentes nocivos', descricao: 'Consultar agentes nocivos e limites de tolerancia.' },
          { key: 'sst.agentes.gerenciar', label: 'Gerenciar agentes nocivos', descricao: 'Criar e editar agentes nocivos.' },
          { key: 'sst.ambientes.visualizar', label: 'Visualizar ambientes', descricao: 'Consultar ambientes de trabalho e locais de exposicao.' },
          { key: 'sst.ambientes.gerenciar', label: 'Gerenciar ambientes', descricao: 'Criar e editar ambientes de trabalho.' },
          { key: 'sst.exposicoes.visualizar', label: 'Visualizar exposicoes', descricao: 'Consultar exposicoes ocupacionais por colaborador.' },
          { key: 'sst.exposicoes.gerenciar', label: 'Gerenciar exposicoes', descricao: 'Criar e editar exposicoes ocupacionais.' }
        ]
      },
      {
        key: 'sst.programas',
        label: 'PGR e PCMSO',
        permissoes: [
          { key: 'sst.pgr.visualizar', label: 'Visualizar PGR', descricao: 'Consultar PGR por empresa e obra.' },
          { key: 'sst.pgr.gerenciar', label: 'Gerenciar PGR', descricao: 'Criar e editar PGR.' },
          { key: 'sst.pcmso.visualizar', label: 'Visualizar PCMSO', descricao: 'Consultar PCMSO por empresa e obra.' },
          { key: 'sst.pcmso.gerenciar', label: 'Gerenciar PCMSO', descricao: 'Criar e editar PCMSO.' }
        ]
      },
      {
        key: 'sst.saude_ocupacional',
        label: 'ASO e Exames',
        permissoes: [
          { key: 'sst.aso.visualizar', label: 'Visualizar ASO', descricao: 'Consultar ASOs de colaboradores.' },
          { key: 'sst.aso.gerenciar', label: 'Gerenciar ASO', descricao: 'Criar e editar ASOs.' },
          { key: 'sst.exames.visualizar', label: 'Visualizar exames', descricao: 'Consultar exames ocupacionais.' },
          { key: 'sst.exames.gerenciar', label: 'Gerenciar exames', descricao: 'Criar e editar exames ocupacionais.' }
        ]
      },
      {
        key: 'sst.operacao',
        label: 'EPI, Treinamentos e Acidentes',
        permissoes: [
          { key: 'sst.epi.visualizar', label: 'Visualizar EPI', descricao: 'Consultar entregas e vencimentos de EPI.' },
          { key: 'sst.epi.gerenciar', label: 'Gerenciar EPI', descricao: 'Criar e editar entregas de EPI.' },
          { key: 'sst.treinamentos.visualizar', label: 'Visualizar treinamentos', descricao: 'Consultar treinamentos e certificados.' },
          { key: 'sst.treinamentos.gerenciar', label: 'Gerenciar treinamentos', descricao: 'Criar e editar treinamentos.' },
          { key: 'sst.acidentes.visualizar', label: 'Visualizar acidentes', descricao: 'Consultar acidentes e incidentes.' },
          { key: 'sst.acidentes.gerenciar', label: 'Gerenciar acidentes', descricao: 'Registrar e editar acidentes e incidentes.' }
        ]
      },
      {
        key: 'sst.inteligencia_operacional',
        label: 'Inteligencia Operacional SST',
        permissoes: [
          { key: 'sst.pendencias.visualizar', label: 'Visualizar pendencias', descricao: 'Consultar pendencias operacionais geradas pelo motor SST.' },
          { key: 'sst.pendencias.gerenciar', label: 'Gerenciar pendencias', descricao: 'Tratar pendencias operacionais SST.' },
          { key: 'sst.bloqueios.visualizar', label: 'Visualizar bloqueios', descricao: 'Consultar alertas, restricoes e bloqueios criticos.' },
          { key: 'sst.bloqueios.gerenciar', label: 'Gerenciar bloqueios', descricao: 'Avaliar e resolver bloqueios operacionais SST.' },
          { key: 'sst.notificacoes.visualizar', label: 'Visualizar notificacoes', descricao: 'Consultar central de notificacoes SST.' },
          { key: 'sst.notificacoes.gerenciar', label: 'Gerenciar notificacoes', descricao: 'Sincronizar, ler e arquivar notificacoes SST.' },
          { key: 'sst.recomendacoes.visualizar', label: 'Visualizar recomendacoes', descricao: 'Consultar recomendacoes operacionais geradas por analytics e eventos SST.' },
          { key: 'sst.recomendacoes.gerenciar', label: 'Gerenciar recomendacoes', descricao: 'Gerar, tratar e encerrar recomendacoes operacionais SST.' },
          { key: 'sst.scores.visualizar', label: 'Visualizar scores', descricao: 'Consultar score de conformidade SST.' },
          { key: 'sst.scores.gerenciar', label: 'Gerenciar scores', descricao: 'Recalcular ou ajustar scores de conformidade SST.' },
          { key: 'sst.workflows.visualizar', label: 'Visualizar workflows', descricao: 'Consultar workflows, execucoes e eventos de orquestracao SST.' },
          { key: 'sst.workflows.gerenciar', label: 'Gerenciar workflows', descricao: 'Configurar e processar workflows e automacoes SST.' },
          { key: 'sst.logs.visualizar', label: 'Visualizar logs SST', descricao: 'Consultar logs de workflows, automacoes, bloqueios e integracoes.' },
          { key: 'sst.integracoes.gerenciar', label: 'Gerenciar integracoes SST', descricao: 'Executar integracoes controladas com RH/DP e Obras por feature flag.' }
        ]
      },
      {
        key: 'sst.documentos',
        label: 'Documentos SST',
        permissoes: [
          { key: 'sst.documentos.visualizar', label: 'Visualizar documentos', descricao: 'Consultar documentos SST e URLs assinadas.' },
          { key: 'sst.documentos.gerenciar', label: 'Gerenciar documentos', descricao: 'Enviar e editar documentos SST.' },
          { key: 'sst.documentos_ia.visualizar', label: 'Visualizar analises IA', descricao: 'Consultar contratos e resultados de analise documental IA/OCR.' },
          { key: 'sst.documentos_ia.gerenciar', label: 'Gerenciar analises IA', descricao: 'Solicitar analise IA documental quando houver provider habilitado.' },
          { key: 'sst.documentos_ia.analisar', label: 'Analisar documentos com IA', descricao: 'Executar pipeline de IA documental controlado por feature flag.' },
          { key: 'sst.documentos_ia.aprovar_sugestao', label: 'Aprovar sugestoes IA', descricao: 'Aprovar ou rejeitar sugestoes extraidas pela IA documental SST.' }
        ]
      },
      {
        key: 'sst.esocial',
        label: 'eSocial SST',
        permissoes: [
          { key: 'sst.esocial.visualizar', label: 'Visualizar eventos eSocial', descricao: 'Consultar preparacao e retornos futuros dos eventos S-2210, S-2220 e S-2240.' },
          { key: 'sst.esocial.preparar', label: 'Preparar eventos eSocial', descricao: 'Preparar registros para transmissao futura, sem envio ao governo nesta fase.' },
          { key: 'sst.esocial.gerar_xml', label: 'Gerar XML eSocial', descricao: 'Gerar XML tecnico a partir do dominio SST desacoplado.' },
          { key: 'sst.esocial.validar_xml', label: 'Validar XML eSocial', descricao: 'Validar XML contra contrato estrutural e schemas disponiveis.' },
          { key: 'sst.esocial.assinar_xml', label: 'Assinar XML eSocial', descricao: 'Assinar XML com certificado A1 quando flags e dependencias estiverem habilitadas.' },
          { key: 'sst.esocial.enviar_restrita', label: 'Enviar producao restrita', descricao: 'Enviar lote ao ambiente de producao restrita, com producao oficial bloqueada.' },
          { key: 'sst.esocial.consultar_retorno', label: 'Consultar retorno eSocial', descricao: 'Consultar protocolo, recibo e rejeicoes do ambiente restrito.' }
        ]
      },
      {
        key: 'sst.ltcat',
        label: 'LTCAT e Avaliacoes Quantitativas',
        permissoes: [
          { key: 'sst.ltcat.visualizar', label: 'Visualizar LTCAT', descricao: 'Consultar laudos tecnicos das condicoes ambientais de trabalho.' },
          { key: 'sst.ltcat.gerenciar', label: 'Gerenciar LTCAT', descricao: 'Criar e atualizar laudos tecnicos das condicoes ambientais de trabalho.' },
          { key: 'sst.avaliacoes_quantitativas.visualizar', label: 'Visualizar avaliacoes quantitativas', descricao: 'Consultar medicoes e avaliacoes quantitativas vinculadas ao LTCAT.' },
          { key: 'sst.avaliacoes_quantitativas.gerenciar', label: 'Gerenciar avaliacoes quantitativas', descricao: 'Criar e atualizar medicoes e avaliacoes quantitativas vinculadas ao LTCAT.' }
        ]
      },
      {
        key: 'sst.configuracoes',
        label: 'Configuracoes SST',
        permissoes: [
          { key: 'sst.configuracoes.gerenciar', label: 'Gerenciar configuracoes SST', descricao: 'Configurar parametros, catalogos e regras futuras do modulo SST.' },
          { key: 'sst.criticidades.gerenciar', label: 'Gerenciar criticidades', descricao: 'Configurar niveis e pesos de criticidade operacional SST.' },
          { key: 'sst.politicas_bloqueio.gerenciar', label: 'Gerenciar politicas de bloqueio', descricao: 'Configurar alertas, restricoes e bloqueios criticos.' },
          { key: 'sst.workflow_acoes.gerenciar', label: 'Gerenciar acoes de workflow', descricao: 'Configurar acoes permitidas pelo motor de workflow SST.' }
        ]
      }
    ]
  },
  {
    modulo: 'BIBLIOTECA_MODELOS',
    label: 'Biblioteca de Modelos',
    descricao: 'Arquivos e documentos modelo compartilhados.',
    areas: [
      {
        key: 'biblioteca.geral',
        label: 'Biblioteca',
        permissoes: [
          { key: 'biblioteca.geral.visualizar', label: 'Visualizar arquivos', descricao: 'Baixar e consultar arquivos da biblioteca.' },
          { key: 'biblioteca.geral.gerenciar', label: 'Gerenciar arquivos', descricao: 'Fazer upload e excluir arquivos da biblioteca.' }
        ]
      }
    ]
  },
  {
    modulo: 'TREINAMENTO',
    label: 'Treinamento',
    descricao: 'Central interna de perguntas, respostas, videos, guias e trilhas por perfil.',
    areas: [
      {
        key: 'treinamento.conteudos',
        label: 'Conteudos de Treinamento',
        permissoes: [
          { key: 'treinamento.conteudos.visualizar', label: 'Visualizar treinamentos', descricao: 'Acessar FAQ, videos, guias e trilhas publicadas.' },
          { key: 'treinamento.conteudos.gerenciar', label: 'Gerenciar conteudos', descricao: 'Criar, editar, arquivar e anexar materiais de treinamento.' },
          { key: 'treinamento.conteudos.publicar', label: 'Publicar conteudos', descricao: 'Liberar conteudos de treinamento para os usuarios.' }
        ]
      },
      {
        key: 'treinamento.relatorios',
        label: 'Relatorios de Treinamento',
        permissoes: [
          { key: 'treinamento.relatorios.visualizar', label: 'Visualizar relatorios', descricao: 'Consultar leitura, aderencia e uso dos materiais de treinamento.' }
        ]
      }
    ]
  },
  {
    modulo: 'COMUNICACAO_INTERNA',
    label: 'Comunicação Interna',
    descricao: 'Mensagens e avisos internos entre usuários.',
    areas: [
      {
        key: 'comunicacao.geral',
        label: 'Comunicação',
        permissoes: [
          { key: 'comunicacao.geral.visualizar', label: 'Visualizar mensagens', descricao: 'Ler mensagens e avisos recebidos.' },
          { key: 'comunicacao.geral.enviar', label: 'Enviar mensagens', descricao: 'Criar e enviar mensagens para outros usuários ou grupos.' }
        ]
      }
    ]

  },
  {
    modulo: 'GOVERNANCA',
    label: 'Governanca do Sistema',
    descricao: 'Painel institucional de governanca, auditoria, saude tecnica e evolucao do produto.',
    areas: [
      {
        key: 'governanca.sistema',
        label: 'Governanca Executiva',
        permissoes: [
          { key: 'governanca.sistema.visualizar', label: 'Visualizar governanca', descricao: 'Equivale a SYSTEM_GOVERNANCE_VIEW. Acessar a visao executiva institucional do sistema.' },
          { key: 'governanca.sistema.gerenciar', label: 'Gerenciar governanca', descricao: 'Equivale a SYSTEM_GOVERNANCE_MANAGE. Gerar snapshots e operar controles administrativos do modulo.' }
        ]
      },
      {
        key: 'governanca.tecnico',
        label: 'Saude Tecnica',
        permissoes: [
          { key: 'governanca.tecnico.visualizar', label: 'Visualizar saude tecnica', descricao: 'Equivale a SYSTEM_TECH_MONITOR_VIEW. Consultar API, banco, storage e integracoes.' }
        ]
      },
      {
        key: 'governanca.auditoria',
        label: 'Auditoria',
        permissoes: [
          { key: 'governanca.auditoria.visualizar', label: 'Visualizar auditoria', descricao: 'Equivale a SYSTEM_AUDIT_VIEW. Consultar logs de acesso e eventos agregados de governanca.' }
        ]
      },
      {
        key: 'governanca.operacional',
        label: 'Auditoria Operacional',
        permissoes: [
          { key: 'governanca.operacional.visualizar_resumo', label: 'Visualizar resumo operacional', descricao: 'Consultar indicadores agregados de atividade, sem abrir a linha do tempo detalhada.' },
          { key: 'governanca.operacional.visualizar_usuarios', label: 'Visualizar atividade por usuario', descricao: 'Comparar volume e distribuicao das atividades dos usuarios no periodo.' },
          { key: 'governanca.operacional.visualizar_detalhes', label: 'Visualizar detalhes operacionais', descricao: 'Abrir a linha do tempo de paginas acessadas e operacoes executadas.' },
          { key: 'governanca.operacional.exportar', label: 'Exportar auditoria operacional', descricao: 'Gerar arquivo CSV da trilha conforme os filtros aplicados.' }
        ]
      },
      {
        key: 'governanca.produto',
        label: 'Evolucao do Produto',
        permissoes: [
          { key: 'governanca.produto.visualizar', label: 'Visualizar evolucao do produto', descricao: 'Equivale a SYSTEM_PRODUCT_EVOLUTION_VIEW. Acompanhar modulos ativos, snapshots e proximas frentes.' }
        ]
      }
    ]
  }
];

/**
 * Lista plana de todas as chaves de permissão para normalização.
 */
const ALL_PERMISSION_KEYS = new Set(
  MODULO_PERMISSION_GROUPS.flatMap((m) =>
    m.areas.flatMap((a) =>
      a.permissoes.map((p) => p.key.toLowerCase())
    )
  )
);

function normalizeModuloPermissaoKey(key) {
  return String(key || '').trim().toLowerCase();
}

function normalizeModuloPermissaoList(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(
    list
      .map(normalizeModuloPermissaoKey)
      .filter((k) => k && ALL_PERMISSION_KEYS.has(k))
  )];
}

module.exports = {
  MODULO_PERMISSION_GROUPS,
  ALL_PERMISSION_KEYS,
  normalizeModuloPermissaoKey,
  normalizeModuloPermissaoList
};
