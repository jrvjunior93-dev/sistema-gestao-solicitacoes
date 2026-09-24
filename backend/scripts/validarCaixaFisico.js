'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  validateFinanceCaixaMovimentoBody,
  validateFinanceCaixaMovimentoEstornoBody,
  validateFinanceCaixaMovimentoParams
} = require('../src/validators/financialValidators');

const backendRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(backendRoot, '..');

function readBackend(relativePath) {
  return fs.readFileSync(path.join(backendRoot, relativePath), 'utf8');
}

function readRepository(relativePath) {
  return fs.readFileSync(path.join(repositoryRoot, relativePath), 'utf8');
}

function validatePayloads() {
  const movimento = validateFinanceCaixaMovimentoBody({
    natureza: 'ENTRADA',
    data_movimento: '2026-08-16',
    valor: 150.75,
    descricao: 'Recebimento em dinheiro',
    documento_referencia: 'REC-001'
  });
  assert.strictEqual(movimento.natureza, 'ENTRADA');
  assert.strictEqual(movimento.valor, 150.75);

  const params = validateFinanceCaixaMovimentoParams({ id: '12', movimentoId: '34' });
  assert.deepStrictEqual(params, { id: 12, movimentoId: 34 });
  assert.strictEqual(
    validateFinanceCaixaMovimentoEstornoBody({ motivo: 'Lancamento duplicado' }).motivo,
    'Lancamento duplicado'
  );

  assert.throws(
    () => validateFinanceCaixaMovimentoBody({ natureza: 'AJUSTE', valor: 1 }),
    /Natureza/
  );
  assert.throws(
    () => validateFinanceCaixaMovimentoBody({ natureza: 'ENTRADA', valor: 1, campo_extra: true }),
    /nao permitidos|não permitidos/i
  );
}

function validateBackendContracts() {
  const service = readBackend('src/services/caixaFinanceiroService.js');
  const sessionHelper = readBackend('src/services/financeiroCaixaSessionHelper.js');
  const routes = readBackend('src/routes.js');
  const controller = readBackend('src/controllers/CaixaFinanceiroController.js');
  const permissionRegistry = readBackend('src/constants/moduloPermissoes.js');
  const authorizationService = readBackend('src/services/authorizationService.js');
  const caixaConfigService = readBackend('src/services/caixaDiarioConfigService.js');
  const caixaPermissionKeys = [
    'financeiro.caixas.visualizar',
    'financeiro.caixas.confirmar_conciliacao',
    'financeiro.caixas.abrir',
    'financeiro.caixas.movimentar',
    'financeiro.caixas.estornar',
    'financeiro.caixas.fechar',
    'financeiro.caixas.decidir_divergencia'
  ];

  [
    "=== 'CAIXA_INTERNO'",
    'CAIXA_ENTRADA_MANUAL',
    'CAIXA_SAIDA_MANUAL',
    'sequelize.transaction',
    'lock: transaction.LOCK.UPDATE',
    'Informe uma justificativa com pelo menos 10 caracteres',
    'Somente lancamentos manuais podem ser estornados',
    'FINANCIAL_CASH_MOVEMENT_CREATED',
    'FINANCIAL_CASH_MOVEMENT_REVERSED',
    'FINANCIAL_CASH_DIVERGENCE_REQUESTED',
    'CASH_DIVERGENCE_OPENING',
    'CASH_DIVERGENCE_CLOSING',
    'FINANCIAL_CASH_DIVERGENCE_APPROVED',
    'Quem informou a divergencia nao pode aprovar ou rejeitar a propria solicitacao'
  ].forEach((contract) => assert(service.includes(contract), `Regra do caixa fisico ausente: ${contract}`));

  assert(service.includes('if (!contaEhCaixaFisico(conta))'), 'Caixa fisico deve ignorar a trava de conciliacao OFX na abertura.');
  assert(service.includes('movimentoWhereVinculadoSessao'), 'Movimentos novos devem usar o vinculo canonico com a sessao do caixa.');
  assert(service.includes('movimentoWhereLegadoSessao'), 'Movimentos antigos devem manter compatibilidade por conta e periodo.');
  assert(service.includes('obterDataMinimaFechamento'), 'Fechamento deve considerar hoje e o movimento mais recente da sessao.');
  assert(service.includes('Data de fechamento nao pode ser retroativa'), 'Backend deve bloquear fechamento retroativo do caixa.');
  assert(service.includes('model: TituloFinanceiro.unscoped()'), 'Livro do caixa deve ignorar o escopo de exclusao logica do titulo opcional.');
  assert(service.includes("as: 'titulo',") && service.includes('required: false'), 'Titulo e usuario devem ser associacoes opcionais no livro do caixa.');
  assert(service.includes('const resumoAnterior = await calcularResumoSessao'), 'Movimento manual deve partir do resumo bloqueado da sessao.');
  assert(service.includes('detalheAtualizado = await montarDetalheSessaoCaixa(sessaoAudit.id);'), 'Livro do caixa deve ser recarregado somente depois do commit do movimento.');
  assert(!service.includes("Nenhum lancamento foi mantido"), 'Releitura de apresentacao nao deve provocar rollback de um INSERT valido.');
  assert(service.includes("...sessao.get({ plain: true })"), 'Detalhe do caixa deve ser serializado explicitamente para o frontend.');
  assert(service.includes('total_entradas: totalEntradas'), 'Resumo persistido deve acompanhar atomicamente o movimento criado.');
  assert(service.includes("natureza === 'SAIDA' && !comprovante"), 'Saidas manuais devem exigir comprovante no backend.');
  assert(service.includes('saldoContado - saldoPadrao'), 'A abertura deve cruzar o valor contado com o fechamento anterior.');
  assert(service.includes('AJUSTE_ABERTURA'), 'Divergencia de abertura deve gerar movimento de ajuste rastreavel.');
  assert(sessionHelper.includes('Number(valorConfigurado) === 1'), 'Flag numerica do controle diario deve ser interpretada corretamente.');
  assert(sessionHelper.includes(".trim().toLowerCase() === 'true'"), 'Flag textual do controle diario deve aceitar somente true explicito.');
  assert(routes.includes("'/financeiro/caixas/:id/movimentos'"), 'Rota de movimento manual ausente.');
  assert(routes.includes("uploadComprovantes.single('comprovante')"), 'Rotas de caixa devem receber comprovante protegido.');
  assert(routes.includes("'/financeiro/caixas/:id/movimentos/:movimentoId/estornar'"), 'Rota de estorno manual ausente.');
  assert(routes.includes("'/financeiro/caixas/:id/decidir-divergencia'"), 'Rota de decisao da divergencia ausente.');
  assert(routes.includes("'/financeiro/caixas-painel-diario'"), 'Rota do painel diario consolidado ausente.');
  assert(routes.includes('criticalRateLimit'), 'Rotas criticas do caixa devem manter rate limit.');
  caixaPermissionKeys.forEach((permissionKey) => {
    assert(permissionRegistry.includes(permissionKey), `Permissao de caixa ausente no registro central: ${permissionKey}`);
    assert(routes.includes(permissionKey), `Permissao de caixa sem protecao de rota: ${permissionKey}`);
  });
  assert(
    authorizationService.includes("[...ALL_PERMISSION_KEYS].filter((key) => key.startsWith('financeiro.'))"),
    'Acesso geral ao Financeiro deve ser derivado do registro central de permissoes.'
  );
  assert(
    caixaConfigService.includes("userHasConfiguredAreaPermissions(user)")
      && caixaConfigService.includes("financeiro.caixas.decidir_divergencia"),
    'A permissao granular deve liberar a decisao da divergencia sem uma segunda lista silenciosa.'
  );
  assert(controller.includes('registrarMovimentoCaixa'), 'Controller de movimento manual ausente.');
  assert(controller.includes('estornarMovimentoCaixa'), 'Controller de estorno manual ausente.');
}

function validateFrontendContracts() {
  const page = readRepository('frontend/src/pages/FinanceiroCaixas.jsx');
  const api = readRepository('frontend/src/services/financeiro.js');
  const access = readRepository('frontend/src/utils/acessoProduto.js');
  const app = readRepository('frontend/src/App.jsx');
  const navigation = readRepository('frontend/src/navigation/navigationConfig.jsx');

  /*
    DOIS CONTRATOS ENVELHECERAM, E O CONSERTO E OLHAR A CAPACIDADE (05/09).

    Este validador ficou vermelho depois da reforma do frontend, e a razao NAO
    era regra de negocio quebrada: as 9 ancoras de regra (trava de OFX, lock em
    transacao, bloqueio de fechamento retroativo, rotas, controller) passam
    inteiras. Quebraram duas assercoes que conferiam LITERAL de markup:

      'Caixas e Contas' — o <h1> virou <PageHeader titulo="Caixas e contas" />,
                          com "contas" minusculo;
      'overflow-x-auto' — a tabela crua virou o componente compartilhado, que
                          da a rolagem horizontal por dentro.

    Trocar o literal por outro literal so adiaria o problema para a proxima
    reforma. Teste de contrato de interface tem de perguntar pela CAPACIDADE:
    a tela se chama assim (sem depender de caixa) e a tabela e a compartilhada
    (que garante a rolagem). Assim ele sobrevive ao layout e continua mordendo
    se alguem TIRAR a capacidade.
  */
  [
    'Abrir caixa',
    'Registrar entrada ou saída',
    'Livro do caixa',
    'Conferir e fechar caixa',
    'Divergências ficam registradas com justificativa',
    'Visao consolidada do dia',
    'Decidir divergencia',
    'Saldo esperado do fechamento anterior',
    'Preparar '
  ].forEach((contract) => assert(page.includes(contract), `Contrato de interface ausente: ${contract}`));

  assert(
    /caixas e contas/i.test(page),
    'Contrato de interface ausente: a tela precisa se identificar como "Caixas e contas".'
  );
  assert(
    page.includes('TabelaPadrao') || page.includes('overflow-x-auto'),
    'Contrato de interface ausente: a tabela precisa rolar na horizontal — TabelaPadrao (que ja rola) ou overflow-x-auto na tabela crua.'
  );

  assert(page.includes("tipo_operacional || '').toUpperCase() === 'CAIXA_INTERNO'"), 'Interface deve distinguir caixa fisico de conta bancaria.');
  assert(page.includes('min={dataMinimaFechamento}'), 'Interface deve impedir a selecao de data de fechamento retroativa.');
  assert(api.includes('registrarMovimentoCaixaFinanceiro'), 'Cliente da API de movimento manual ausente.');
  assert(api.includes('new FormData()'), 'Abertura e movimentos devem enviar comprovantes por multipart/form-data.');
  assert(api.includes('estornarMovimentoCaixaFinanceiro'), 'Cliente da API de estorno manual ausente.');
  [
    'canViewFinanceiroCaixas',
    'canConfirmFinanceiroCaixaConciliacao',
    'canOpenFinanceiroCaixa',
    'canMoveFinanceiroCaixa',
    'canReverseFinanceiroCaixaMovement',
    'canCloseFinanceiroCaixa',
    'canDecideFinanceiroCaixaDivergence'
  ].forEach((helper) => assert(access.includes(helper), `Regra de acesso do frontend ausente: ${helper}`));
  assert(app.includes('FinanceiroCaixasRoute'), 'Rota da tela de caixas deve exigir permissao granular de visualizacao.');
  assert(navigation.includes('canViewFinanceiroCaixas(user)'), 'Navegacao de caixas deve respeitar permissao granular.');
  assert(page.includes('podeMovimentar') && page.includes('podeEstornar') && page.includes('podeFechar'), 'Acoes de caixa devem respeitar as permissoes granulares no frontend.');
  assert(page.includes('usuarioSolicitouDivergencia') && page.includes('podeDecidirSessao'), 'Interface deve preservar a segregacao entre solicitante e aprovador da divergencia.');
}

function validateDocumentation() {
  const doc = readRepository('docs/modulos/financeiro/CAIXA_FISICO_ABERTURA_FECHAMENTO.md');
  assert(doc.includes('nao depende da conciliacao OFX'), 'Documentacao deve registrar a independencia do OFX.');
  assert(doc.includes('Matriz de smoke test'), 'Documentacao deve conter matriz de smoke test.');
}

validatePayloads();
validateBackendContracts();
validateFrontendContracts();
validateDocumentation();

console.log('Validacao do caixa fisico concluida com sucesso.');
