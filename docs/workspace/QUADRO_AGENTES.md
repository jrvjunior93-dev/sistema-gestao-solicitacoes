# Quadro de Agentes

## Trabalho em andamento

- id: 2026-10-02-rhdp-jornadas-40-60
  sessao: codex-rhdp-jornadas-40-60-2026-10-02
  responsavel: Codex / sessao atual
  status: em_andamento
  escopo: separar envios e pagamentos 40%/60% de mensalistas, jornadas independentes de diaristas, rateio multiobra e vigencia do regime.
  pendencias: apropriacao contabil do acerto misto, integracao em banco dev e homologacao antes de ativar as flags; commit/push do codigo inativo autorizados, sem migration ou deploy.

## Trabalho planejado aguardando inicio

Nao ha nova implementacao planejada aguardando inicio nesta sessao.

## Trabalho concluido aguardando publicacao

- id: 2026-09-30-autorizacao-proprietario-pagamentos-pwa
  sessao: codex-autorizacao-proprietario-pagamentos-2026-09-30
  responsavel: Codex / sessao atual
  status: implementado localmente, inativo e aguardando commit/publicacao autorizados
  escopo: PWA, passkeys, push, dossie isolado e gate seguro antes da fila de pagamentos.
  validacao: teste especifico, sintaxe backend, build frontend e diff-check aprovados.
  pendencias: migration/configuracao em dev e homologacao `PILOT`; `ENFORCED` bloqueado.
  handoff: `docs/handoffs/2026-09-30-autorizacao-proprietario-pagamentos-pwa.md`.

- id: 2026-09-03-aditivo-direto-juridico
  sessao: codex-aditivo-direto-juridico-2026-09-03
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Encaminhar diretamente ao Juridico o aditivo de contrato cujo valor original ultrapassa o limite configuravel.
  feito:
    - Regra restrita ao termo aditivo; aprovacao inicial do contrato permaneceu inalterada.
    - Somente o valor original decide o destino; valores de aditivos nao entram na soma.
    - Exatamente no limite permanece GEO; contrato original acima segue para JURIDICO.
    - Historicos registram limite, valor original e destino calculado.
  pendencias:
    - Atualizar e reiniciar somente o backend dev para homologacao funcional.
  validacao:
    - Sintaxe, carregamento do servico, prova pura em quatro cenarios e diff check aprovados.

- id: 2026-08-27-auditoria-permissoes-granulares
  sessao: codex-auditoria-permissoes-granulares-2026-08-27
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Auditar e corrigir permissoes granulares entre cadastro, backend e frontend.
  feito:
    - `visualizar_todas` corrigida no detalhe sem conceder escrita.
    - Estado configurado vazio separado da compatibilidade legada.
    - Obras, Biblioteca, Comunicacao e espelho de pedido alinhados entre UI e API.
    - Catalogo de producao e auditor automatizado adicionados.
  pendencias:
    - Reinicio coordenado da porta 8100 e smoke autenticado no processo local.
  validacao:
    - Build aprovado, 338 chaves auditadas e provas somente de leitura aprovadas.
    - Ver `docs/handoffs/AUDITORIA_PERMISSOES_GRANULARES_2026-08-27.md`.

- id: 2026-08-26-aditivo-aprovado-volta-obra
  sessao: codex-aditivo-aprovado-volta-obra-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Devolver para OBRA a solicitacao vinculada ao aditivo aprovado.
  feito:
    - Aprovacao move a solicitacao para `OBRA / APROVADA` na mesma transacao.
    - Historicos de aprovacao e envio ao setor registrados.
    - Fluxos novo e legado contemplados.
  pendencias:
    - Nenhuma.
  validacao:
    - Suite QA reversivel e health check aprovados.
    - Ver `docs/handoffs/CONTRATO_ADITIVO_APROVADO_VOLTA_OBRA_2026-08-26.md`.

- id: 2026-08-26-remover-pagamentos-detalhe
  sessao: codex-remover-pagamentos-detalhe-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Remover selo Somente leitura, card Pagamentos e baixa parcial da tela de detalhes.
  feito:
    - Selo removido sem alterar a protecao interna da Obra.
    - Card Pagamentos e acao de baixa parcial deixaram de ser montados para todos os usuarios.
    - Dados, endpoints e telas do modulo Financeiro foram preservados.
  pendencias:
    - Nenhuma.
  validacao:
    - Build aprovado, 365 modulos transformados.
    - Ver `docs/handoffs/SOLICITACAO_DETALHE_REMOVER_PAGAMENTOS_2026-08-26.md`.

- id: 2026-08-26-financeiro-obra-somente-leitura
  sessao: codex-financeiro-obra-somente-leitura-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Exibir aba Financeiro para setor Obra sem acoes e respeitando o escopo de obras.
  feito:
    - Aba financeira liberada como leitura operacional da solicitacao.
    - Acoes financeiras, links de edicao e abertura da medicao removidos para Obra.
    - Resposta backend reduzida aos dados necessarios e protegida pelo escopo de obras.
  pendencias:
    - Nenhuma no ambiente local.
  validacao:
    - Build, teste com usuario real de Obra e health check aprovados.
    - Ver `docs/handoffs/SOLICITACAO_FINANCEIRO_OBRA_SOMENTE_LEITURA_2026-08-26.md`.

- id: 2026-08-26-fluxo-novo-pedido-aditivo
  sessao: codex-fluxo-novo-pedido-aditivo-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Encaminhar solicitacao do contrato do fluxo novo para GEO com status PED. ADITIVO.
  feito:
    - Encaminhamento e status gravados na mesma transacao do pedido.
    - Historicos de status e mudanca de setor registrados.
    - Status operacional cadastrado por migration idempotente.
  pendencias:
    - Nenhuma dentro da abertura do pedido de aditivo.
  validacao:
    - Migration local, teste reversivel e health check aprovados.
    - Ver `docs/handoffs/CONTRATO_FLUXO_NOVO_PEDIDO_ADITIVO_2026-08-26.md`.

- id: 2026-08-26-remover-numero-pedido-detalhe
  sessao: codex-remover-numero-pedido-detalhe-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Remover o Numero do Pedido da tela de detalhes sem apagar dados ou integracoes legadas.
  feito:
    - Componente e acao de edicao removidos da tela para todos os usuarios.
    - Campo no banco, endpoint, busca e historicos legados preservados.
  pendencias:
    - Nenhuma.
  validacao:
    - `npm run build`: aprovado, 364 modulos.

- id: 2026-08-26-ocultar-trava-parcelas
  sessao: codex-ocultar-trava-parcelas-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Ocultar a coluna Trava da montagem de parcelas, preservando a logica interna.
  feito:
    - Cabecalho, coluna e botao removidos da apresentacao.
    - Fixacao automatica ao editar valor preservada.
  pendencias:
    - Nenhuma.
  validacao:
    - `npm run build`: aprovado, 365 modulos.

- id: 2026-08-26-formas-pagamento-nova-solicitacao
  sessao: codex-formas-pagamento-nova-solicitacao-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Corrigir a tela interrompida, explicitar a configuracao global de formas e validar o salvamento dos campos.
  feito:
    - Correcao de forma nula e atalhos de configuracao implementados.
    - Backend local reiniciado; catalogo atual de 24 campos carregado.
    - Persistencia temporaria confirmada e estado original restaurado.
  pendencias:
    - Nenhuma no ambiente local.
  validacao:
    - Build e navegador autenticado aprovados.
    - Ver `docs/handoffs/FORMAS_PAGAMENTO_NOVA_SOLICITACAO_2026-08-26.md`.

- id: 2026-08-26-adm-pagamento
  sessao: codex-adm-pagamento-2026-08-26
  responsavel: Codex / sessao atual
  status: finalizado
  escopo: Credor como favorecido, chave PIX automatica/editavel, boleto obrigatorio e ocultacao
    visual da apropriacao automatica.
  feito:
    - Implementacao e migration local concluidas.
    - Ver `docs/handoffs/NOVA_SOLICITACAO_FAVORECIDO_PIX_BOLETO_2026-08-26.md`.
  pendencias:
    - Reiniciar o backend com aviso previo e executar teste visual controlado.
  validacao:
    - build, sintaxe, regras puras e banco aprovados.


- id: 2026-08-20-compras-catalogacao-itens-manuais
  sessao: codex-compras-catalogacao-2026-08-20
  responsavel: Codex / fluxo de Compras
  status: concluido_e_validado_localmente
  escopo: Permitir tratar itens manuais na tela de detalhe, vinculando ou criando insumo oficial com permissao granular, auditoria e reutilizacao futura.
  arquivos:
    - ver docs/workspace/OWNERSHIP_ATIVO.md
  feito:
    - Escopo e dependencias existentes auditados em modo leitura.
    - Arquitetura nao destrutiva definida.
    - Migration, modelos, endpoint transacional e permissao granular implementados.
    - Interface expansivel, aliases, ultimo preco e relatorios integrados.
    - Testes especificos, responsividade e build de producao aprovados.
    - Migration aplicada em localhost/fluxy_main_copia e repetida com sucesso.
    - Integracao local aprovada, inclusive concorrencia, aliases, ultimo preco e relatorios.
  pendencias:
    - Separar commit das mudancas simultaneas de Contratos.
    - Revisar visualmente a tela no navegador local.
    - Conceder a nova permissao aos usuarios autorizados.
  validacao:
    - Ver docs/handoffs/COMPRAS_CATALOGACAO_ITENS_MANUAIS_2026-08-20.md
  observacoes:
    - Modulo de Contratos esta fora deste ownership.
    - Migration executada somente no banco local fluxy_main_copia.
    - Nenhum acesso a GitHub, EC2 ou producao foi realizado.
- id: 2026-08-31-data-resposta-pagamento
  sessao: codex-data-resposta-pagamento-2026-08-31
  responsavel: Codex / sessao atual
  status: implementado_aguardando_commit
  escopo: Separar a Data Resposta/Pagamento da solicitacao dos vencimentos das parcelas do CONTRATO.
  feito:
    - Campo habilitado no fluxo novo de CONTRATO conforme configuracao por tipo.
    - Rotulo alinhado na criacao, lista, detalhe, filtros, exportacao, historico e validacoes.
    - Backend grava a data informada na solicitacao sem deriva-la da primeira parcela.
    - Build, sintaxe e teste de vencimento aprovados.
  pendencias:
    - Commit e validacao funcional no ambiente dev.
  validacao:
    - Ver `docs/handoffs/DATA_RESPOSTA_PAGAMENTO_SOLICITACOES_2026-08-31.md`.
- id: 2026-08-31-projecao-reajuste-parcelas-medicao
  sessao: codex-data-resposta-pagamento-2026-08-31
  responsavel: Codex / sessao atual
  status: implementado_aguardando_commit
  escopo: Mostrar na medicao os valores projetados das parcelas reajustadas pela edicao.
  feito:
    - Projecao visual alinhada a redistribuicao em cascata do backend.
    - Previsto preservado e parcelas afetadas identificadas.
    - Build e quatro cenarios de calculo aprovados.
  pendencias:
    - Commit e validacao visual no ambiente dev.
  validacao:
    - Ver `docs/handoffs/PROJECAO_REAJUSTE_PARCELAS_MEDICAO_2026-08-31.md`.

## Edicao de vigencia contratual - 2026-10-08

- Sessao: codex-contrato-vigencia-2026-10-08; responsavel: agente desta conversa.
- Estado: em_andamento.
- Reservados: frontend/src/pages/GestaoContratos.jsx; backend/src/controllers/ContratoController.js; backend/src/validators/operationalValidators.js; backend/src/services/contratoVigenciaEdicao.js; backend/scripts/validarContratoVigenciaEdicao.js; frontend/scripts/validarContratoVigenciaEdicao.mjs; docs/modulos/contratos/README.md; docs/handoffs/2026-10-08-edicao-vigencia-contrato.md.
- Escopo: editar inicio/fim da vigencia com validacao e historico, preservando parcelas, medicoes, titulos e pagamentos. Sem banco real, EC2, migration, commit, push ou deploy.
- Colaboracao: usuario informou outro agente em autorizacao/fila de pagamentos. Esses fluxos, routes.js e package.json ficam fora desta reserva. Registros do painel apenas acrescentados, preservando os anteriores.

Sessao codex-contrato-vigencia-2026-10-08: finalizado. Edicao e validacoes locais concluidas; ownership integralmente liberado. Handoff: docs/handoffs/2026-10-08-edicao-vigencia-contrato.md. Sem banco real, EC2, commit, push ou deploy desta tarefa. Autorizacao/fila de pagamentos preservadas.
