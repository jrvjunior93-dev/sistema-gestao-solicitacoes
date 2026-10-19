# Cancelamento seguro de titulo financeiro

## Escopo / estado

Pedido explicito: implementar para refactor/frontend, motivo obrigatorio,
historico, permissao especifica e protecao de pagamentos/operacoes; sem producao.
Implementacao local na branch codex/fila-multiplas-fontes-20261018, derivada de
refactor/frontend. Preservados os pacotes pendentes de multiplas fontes,
compras/centros de custo e auditoria. Sem commit/push/deploy/EC2.

## Fluxo

- Detalhe de Contas a Pagar/Receber > Dados do titulo > Cancelar titulo.
  Confirmacao compacta com motivo de3 a1000 caracteres. Escape/Manter titulo
  nao enviam nada; rascunho conservado entre abas; trava de duplo clique;
  erros preservam chave para retry. Nao ha sucesso otimista.
- POST /financeiro/titulos/:id/cancelar; payload estrito motivo,
  idempotency_key e versao (updatedAt ISO da consulta). Guarda granular da
  rota + validacao no service. ACL canonica e todas as obras do rateio
  conferidas tambem no replay. Versao obsoleta exige nova conferencia.
- canCancelTitulosFinanceiros exige financeiro.titulos.cancelar para usuarios
  comuns, sem herdar setor/editar/excluir/legado. Excecao administrativa habitual
  SUPERADMIN/ADMINISTRADOR preservada. Nenhuma concessao gravada automaticamente.
- Transacao com lock do titulo, compartilhado pelos fluxos canonicos de baixa/
  envio. Somente PAGAR/RECEBER ABERTO/PREVISAO com saldo, baixado zero e sem
  quitacao. CANCELADO e saldo zero; valores originais, encargos, documentos e
  movimentos preservados. Nao registra pagamento, estorno, exclusao ou reabertura.

## Protecoes

- Baixas ativas, fila nao encerrada, autorizacoes PENDENTE/AUTORIZADO/ENFILEIRADO,
  pagamento bancario nao terminal (inclusive falha de integracao), fatura/cartao,
  cobranca emitida, boleto bancario/DDA, cheque, conciliacao e integracao externa.
- Contrato/medicao/comercial, pedido de compra, DP, adiantamento, recarga,
  financiamento, renegociacao, compartilhados, impostos/retencoes, intercompany
  e retorno da Obra devem ser regularizados nos fluxos de origem. Nao cancela
  parcelas especializadas isoladamente nem altera saldo do modulo dono.
- Origens genericas aceitas: MANUAL, SOLICITACAO, BAIXA_MASSA_PARCELADA;
  ainda verificam as tabelas de vinculos especializados. Outras origens falham
  fechadas com orientacao. Consulta indisponivel/tabela ausente aborta tudo.
- Compartilhados seguem com Cancelar lote compartilhado, permissoes/protecoes
  anteriores; nao ha modificacao do cancelamento especializado neste pacote.

## Historico e schema

Sem migration: status e coluna de saldo ja existem. Trilha permanente em
logs_exclusao, entidade TITULO_CANCELAMENTO, seguindo o precedente financeiro
de TITULO_DESVINCULACAO_FATURA. Essa escrita NAO exclui nada. Guarda motivo
integral, data, autor, snapshot anterior/posterior e recibo de idempotencia.
SecurityEventLog gravado na mesma transacao; falha de qualquer registro desfaz
tudo. Retencao do log de seguranca nao remove o historico/replay.

Resumo do cancelamento mostrado no detalhe somente apos ACL do titulo; evento
integrado a auditoria financeira existente, sem duplicar log/registro permanente.
Nao cria Historico da solicitacao, que poderia ampliar visibilidade por autoria,
nem altera o status da solicitacao. Anexos e vinculos sao preservados.

## Arquivos

- Novos tituloCancelamentoService.js, tituloCancelamentoAuditoriaService.js,
  tituloCancelamentoValidator.js, TituloCancelamentoController.js.
- Registro moduloPermissoes, authorizationService, financeiroRotaPermissoesService,
  routes, TituloFinanceiroController (resumo), tituloFinanceiroService (auditoria).
- Novo CancelarTitulo.jsx, integracao FinanceiroTituloDetalhe, cliente financeiro
  e helper acessoProduto. Scripts npm test:titulo-cancelamento em backend/frontend.
- validarTituloCancelamento.js e validarTituloCancelamentoUI.mjs; imagens locais
  de QA desktop/mobile em outputs/titulo-cancelamento-20261019/.

## Validacoes realizadas

- Backend: PAGAR/RECEBER, ABERTO/PREVISAO, motivo/chave/versao/payload estritos,
  permissao nominal/legado/editar/excluir, ACL/rateio, todas as origens/vinculos
  bloqueados, falha de consulta/log/evento e rollback, concorrencia serializada
  em memoria, replay com autor/permissao/escopo revalidados, historico apos
  retencao, show/auditoria reais sem duplicar evento. Banco somente simulado.
- Baixa e envio canonicos reais recusam CANCELADO sem criar movimento/fila.
- validarTituloDesvincularFatura.js e validarCartaoOpcionalSolicitacao.js aprovados.
- validarPermissoesFinanceiroRota.js:76 rotas mapeadas, chave central conferida.
- Frontend: componente/ACL reais desktop1366 e mobile390, sem API externa;
  motivo, Escape/Manter, rascunho, pagos/compartilhados, legado/editar/excluir
  negados, erro/retry com mesma chave, duplo clique, versao obsoleta, texto
  escapado e identificacao do responsavel. Screenshots revisadas sem cortes.
- Vite build local concluido (sem prebuild/geracao de catalogo); warnings usuais
  de caniuse-lite antigo e chunk grande. Sintaxe backend e git diff --check OK.
- Nenhuma conexao a banco/EC2/Redis/S3 real, migration, configuracao ou processo
  alterado. Nao houve teste MySQL real; locks/transacoes simulados localmente.

## Proximo passo

Mediante pedido, commitar/publicar na refactor/frontend, coordenando os outros
pacotes locais sem inclui-los acidentalmente. Atualizacao DEV nao necessita
migration deste pacote. Homologar com usuario autorizado e outro sem permissao;
cancelar titulo manual PAGAR e RECEBER sem baixa, conferir motivo/autor/data,
filtro Cancelado, saldo zero, anexos e ausencia de movimento. Tentar baixar/enviar
o cancelado e cancelar um parcial/quitado/na fila/autorizado/vinculado a fatura:
devem permanecer protegidos. Testar dois cliques e atualizar apos falha de rede.
Nao conectar a EC2: fornecer comandos para o proprio usuario executar.
