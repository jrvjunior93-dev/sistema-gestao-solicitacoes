'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  hasSameConciliacaoDate,
  hasSameConciliacaoValue,
  isExactOppositeBankTransfer,
  isExactConciliacaoMatch
} = require('../src/utils/conciliacaoMatch');
const {
  classifyBankReversal,
  datesWithinReversalWindow,
  hasOppositeExactAmount,
  scoreReversalCandidate
} = require('../src/services/conciliacaoEstornoBancarioService');
const {
  validateFinanceConciliacaoCorrigirContaBody,
  validateFinanceConciliacaoCreditoRotativoBody,
  validateFinanceConciliacaoEstornoBancarioBody,
  validateFinanceConciliacaoEstornoTarifaBody,
  validateFinanceConciliacaoEstornoTransferenciaBody,
  validateFinanceRelatorioConciliacaoQuery
} = require('../src/validators/financialValidators');
const {
  ALL_PERMISSION_KEYS
} = require('../src/constants/moduloPermissoes');

assert.strictEqual(hasSameConciliacaoDate('2026-07-06', '2026-07-06'), true);
assert.strictEqual(hasSameConciliacaoDate('2026-07-06', '2026-07-10'), false);

assert.strictEqual(hasSameConciliacaoValue(-1436.16, 1436.16), true);
assert.strictEqual(hasSameConciliacaoValue(-1436.16, 1436.17), false);
assert.strictEqual(hasSameConciliacaoValue(-26007.30, 1436.16), false);

assert.strictEqual(isExactConciliacaoMatch({
  bankDate: '2026-07-06',
  bankValue: -1436.16,
  movementDate: '2026-07-06',
  movementValue: 1436.16
}), true);

assert.strictEqual(isExactConciliacaoMatch({
  bankDate: '2026-07-06',
  bankValue: -26007.30,
  movementDate: '2026-07-06',
  movementValue: 1436.16
}), false);

assert.deepStrictEqual(
  classifyBankReversal({
    descricao_banco: 'PIX - REJEITADO - 10/08 11:06 CONTA DO RECEBEDOR INEXIST',
    valor: 850
  }),
  { tipo: 'PIX_REJEITADO', janela_dias: 2 }
);
assert.deepStrictEqual(
  classifyBankReversal({ descricao_banco: 'CHEQUE DEVOLVIDO', valor: 1250 }),
  { tipo: 'CHEQUE_DEVOLVIDO', janela_dias: 30 }
);
assert.deepStrictEqual(
  classifyBankReversal({ descricao_banco: 'ESTORNO DE TARIFA BANCARIA', valor: 12.5 }),
  { tipo: 'ESTORNO_TARIFA_BANCARIA', janela_dias: 5 },
  'Estorno de tarifa deve procurar a contraparte no proprio extrato antes do fluxo manual.'
);
assert.strictEqual(hasOppositeExactAmount(850, -850), true);
assert.strictEqual(hasOppositeExactAmount(850, -849.99), false);
assert.strictEqual(datesWithinReversalWindow({ reversalDate: '2026-08-10', originalDate: '2026-08-10', windowDays: 2 }), true);
assert.strictEqual(datesWithinReversalWindow({ reversalDate: '2026-08-10', originalDate: '2026-08-07', windowDays: 2 }), false);
assert.strictEqual(
  scoreReversalCandidate(
    { data_movimento: '2026-08-10', documento: 'ABC', descricao_banco: 'PIX REJEITADO' },
    { data_movimento: '2026-08-10', documento: 'ABC', descricao_banco: 'PIX ENVIADO' }
  ).score,
  125
);

assert.strictEqual(isExactOppositeBankTransfer({
  currentDate: '2026-08-04',
  currentValue: 100,
  counterpartDate: '2026-08-04',
  counterpartValue: -100
}), true);
assert.strictEqual(isExactOppositeBankTransfer({
  currentDate: '2026-08-04',
  currentValue: 100,
  counterpartDate: '2026-08-04',
  counterpartValue: 100
}), false);
assert.strictEqual(isExactOppositeBankTransfer({
  currentDate: '2026-08-04',
  currentValue: 100,
  counterpartDate: '2026-08-05',
  counterpartValue: -100
}), false);

assert.strictEqual(isExactConciliacaoMatch({
  bankDate: '2026-07-06',
  bankValue: -1436.16,
  movementDate: '2026-07-10',
  movementValue: 1436.16
}), false);

const serviceSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/conciliacaoBancariaService.js'),
  'utf8'
);
const routesSource = fs.readFileSync(path.resolve(__dirname, '../src/routes.js'), 'utf8');
const reportSource = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/src/pages/FinanceiroRelatorios.jsx'),
  'utf8'
);
const reconciliationPageSource = fs.readFileSync(
  path.resolve(__dirname, '../../frontend/src/pages/FinanceiroConciliacao.jsx'),
  'utf8'
);
const loadByIdSource = serviceSource.match(
  /async function loadConciliacaoById[\s\S]*?\n}\n\nasync function resolveMovimentoForConciliacao/
)?.[0] || '';

assert(
  /ConciliacaoBancaria\.findOne\(\{[\s\S]*?deleted_at: null[\s\S]*?}\);/.test(loadByIdSource),
  'A conciliacao deve ser localizada antes de carregar relacionamentos opcionais.'
);
assert(
  /conciliacao\.reload\(\{[\s\S]*?include: buildConciliacaoInclude\(\)/.test(loadByIdSource),
  'Os relacionamentos devem ser carregados somente depois que a conciliacao for localizada.'
);

const includeSource = serviceSource.match(
  /function buildConciliacaoInclude\(\)[\s\S]*?\n}\n\nfunction buildConciliacaoWhere/
)?.[0] || '';
assert(
  includeSource.includes("as: 'titulo',\n      required: false"),
  'O titulo ainda nao associado deve ser um relacionamento opcional.'
);

const suggestionAnalysisSource = serviceSource.match(
  /async function analyzeSuggestions[\s\S]*?\n}\n\nasync function listarConciliacoes/
)?.[0] || '';
assert(
  suggestionAnalysisSource.includes('const limiteSugestoesVisiveis = associacaoManualRecomendada')
    && suggestionAnalysisSource.includes('.slice(0, limiteSugestoesVisiveis)')
    && suggestionAnalysisSource.includes('const sugestaoAutomatica = ranked.length > 0 && !associacaoManualRecomendada'),
  'Matches ambiguos devem listar candidatos exatos, sem selecionar automaticamente um titulo.'
);
assert(
  reconciliationPageSource.includes('onPrepararSugestao')
    && reconciliationPageSource.includes('sugestoesCompativeis')
    && reconciliationPageSource.includes('onClick={() => onPrepararSugestao(item, sugestao)}'),
  'O frontend deve permitir preparar um titulo compativel antes da confirmacao manual.'
);

const itemConciliacaoSource = reconciliationPageSource.match(
  /function ItemConciliacao[\s\S]*?\n}\n\n\/\/ \u2500\u2500\u2500 Filtros/
)?.[0] || reconciliationPageSource.match(
  /function ItemConciliacao[\s\S]*?\n}\n\nfunction/
)?.[0] || '';
assert(
  itemConciliacaoSource.includes('{isPendente && (')
    && itemConciliacaoSource.includes('onAcoesRapidas(item)')
    && itemConciliacaoSource.includes('onAssociarManual(item)')
    && itemConciliacaoSource.includes('onAssociarFatura(item)')
    && itemConciliacaoSource.includes('onAssociarTransferencia(item)'),
  'Alertas de estorno pendentes devem manter disponiveis todas as alternativas manuais.'
);

const funcoesManuaisComSobreposicao = [
  'confirmarConciliacaoFatura',
  'confirmarConciliacaoTransferencia',
  'confirmarConciliacaoTarifa',
  'confirmarConciliacaoCreditoRotativo',
  'confirmarConciliacao',
  'criarTituloEConciliar'
];
for (const [index, nomeFuncao] of funcoesManuaisComSobreposicao.entries()) {
  const proximaFuncao = funcoesManuaisComSobreposicao[index + 1];
  const fim = proximaFuncao
    ? `async function ${proximaFuncao}`
    : 'async function listarMovimentosAssociacao';
  const trecho = serviceSource.match(
    new RegExp(`async function ${nomeFuncao}[\\s\\S]*?${fim}`)
  )?.[0] || '';
  assert(
    trecho && !trecho.includes('assertSemAlertaEstornoBancario(conciliacao)'),
    `${nomeFuncao} deve aceitar a classificacao manual de um falso positivo de estorno.`
  );
}

for (const nomeFuncao of ['ignorarConciliacao', 'removerConciliacao']) {
  const trecho = serviceSource.match(
    new RegExp(`async function ${nomeFuncao}[\\s\\S]*?\\n}`)
  )?.[0] || '';
  assert(
    trecho.includes('assertSemAlertaEstornoBancario(conciliacao)'),
    `${nomeFuncao} deve continuar bloqueado enquanto houver alerta de estorno.`
  );
}
assert(
  serviceSource.includes("as: 'categoriaFinanceira'")
    && serviceSource.includes('categoria_financeira_nome: movimento.titulo?.categoriaFinanceira?.nome || null'),
  'As sugestoes da conciliacao devem informar a categoria financeira do titulo.'
);
assert(
  serviceSource.includes("as: 'obra'")
    && serviceSource.includes('obra_nome: movimento.titulo?.obra?.nome || null')
    && serviceSource.includes('obra_tipo_centro_custo: movimento.titulo?.obra?.tipo_centro_custo || null')
    && reconciliationPageSource.includes('<ContextoObraTitulo registro={topSugestao} />'),
  'O card do lancamento Fluxy deve informar a obra ou o centro de custo do titulo.'
);

const exactTransferPairSource = serviceSource.match(
  /function isContraparteTransferenciaExata[\s\S]*?\n}\n\nasync function listarConciliacoes/
)?.[0] || '';
assert(
  exactTransferPairSource.includes("status: 'PENDENTE'")
    && exactTransferPairSource.includes('transferencia_financeira_id: null')
    && exactTransferPairSource.includes('isExactOppositeBankTransfer'),
  'O pareamento automatico de transferencias deve exigir OFX pendente, livre, na mesma data e com sinal oposto.'
);

const transferConfirmationSource = serviceSource.match(
  /async function confirmarConciliacaoTransferencia[\s\S]*?\n}\n\nasync function estornarConciliacaoTransferencia/
)?.[0] || '';
assert(
  transferConfirmationSource.includes('contrapartesExatas.length === 1')
    && transferConfirmationSource.includes('conciliacao_origem_id: isSaidaDaContaAtual')
    && transferConfirmationSource.includes('await conciliacaoContraparte.update'),
  'Somente uma contraparte OFX exata deve ser vinculada atomicamente a transferencia.'
);
assert(
  reconciliationPageSource.includes('contaOrigemTransferencia')
    && reconciliationPageSource.includes('contaDestinoTransferencia')
    && reconciliationPageSource.includes('transferencia_contraparte_automatica'),
  'A previa deve respeitar o sinal do OFX e preselecionar apenas a contraparte exata.'
);

assert.deepStrictEqual(
  validateFinanceConciliacaoCorrigirContaBody({
    conta_bancaria_id: 12,
    motivo: 'OFX conciliado na conta incorreta.'
  }),
  {
    conta_bancaria_id: 12,
    motivo: 'OFX conciliado na conta incorreta.'
  }
);

assert.deepStrictEqual(
  validateFinanceConciliacaoEstornoTransferenciaBody({
    motivo: 'Transferencia conciliada na conta incorreta.'
  }),
  {
    motivo: 'Transferencia conciliada na conta incorreta.'
  }
);
assert.deepStrictEqual(
  validateFinanceRelatorioConciliacaoQuery({
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-08-01',
    data_final: '2026-08-31',
    conta_bancaria_id: undefined,
    status: 'CONCILIADO',
    tipo_conciliacao: 'TRANSFERENCIA',
    natureza: 'SAIDA',
    busca: 'permuta entre empresas'
  }),
  {
    periodo: 'PERSONALIZADO',
    data_inicial: '2026-08-01',
    data_final: '2026-08-31',
    conta_bancaria_id: undefined,
    status: 'CONCILIADO',
    tipo_conciliacao: 'TRANSFERENCIA',
    natureza: 'SAIDA',
    busca: 'permuta entre empresas'
  }
);
assert(
  ALL_PERMISSION_KEYS.has('financeiro.conciliacao.estornar'),
  'O estorno de conciliacao deve possuir permissao granular dedicada.'
);

const transferReversalSource = serviceSource.match(
  /async function estornarConciliacaoTransferencia[\s\S]*?\n}\n\nasync function estornarConciliacao/
)?.[0] || '';
assert(
  transferReversalSource.includes('lock: transaction.LOCK.UPDATE')
    && transferReversalSource.includes("status: 'CANCELADA'")
    && transferReversalSource.includes("status: 'PENDENTE'"),
  'O estorno da transferencia deve bloquear, cancelar a transferencia e reabrir os OFX na mesma transacao.'
);
assert(
  transferReversalSource.includes('FINANCIAL_BANK_RECONCILIATION_TRANSFER_REVERSED'),
  'O estorno da transferencia conciliada deve gerar auditoria dedicada.'
);

const reconciliationReversalSource = serviceSource.match(
  /async function estornarConciliacao\([\s\S]*?\n}\n\nasync function confirmarConciliacaoTarifa/
)?.[0] || '';
assert(
  reconciliationReversalSource.includes('lock: transaction.LOCK.UPDATE')
    && reconciliationReversalSource.includes("status: 'PENDENTE'")
    && reconciliationReversalSource.includes('movimento_financeiro_id: null')
    && reconciliationReversalSource.includes('titulo_financeiro_id: null')
    && reconciliationReversalSource.includes('fatura_cartao_id: null'),
  'O estorno generico deve bloquear e devolver o OFX para pendente sem manter vinculos ativos.'
);
assert(
  reconciliationReversalSource.includes("'TARIFA_BANCARIA',")
    && reconciliationReversalSource.includes("'ESTORNO_TARIFA_BANCARIA',")
    && reconciliationReversalSource.includes("'LIBERACAO_CREDITO_ROTATIVO',")
    && reconciliationReversalSource.includes("'AMORTIZACAO_CREDITO_ROTATIVO'")
    && reconciliationReversalSource.includes("status: 'ESTORNADO'")
    && reconciliationReversalSource.includes('fatura.update({ conciliacao_bancaria_id: null }'),
  'O estorno generico deve tratar tarifa, credito rotativo e fatura conforme a origem da conciliacao.'
);
assert(
  reconciliationReversalSource.includes('FINANCIAL_BANK_RECONCILIATION_REVERSED'),
  'O estorno generico da conciliacao deve gerar auditoria dedicada.'
);
assert(
  routesSource.includes("router.post('/financeiro/conciliacoes/:id/estornar'")
    && reportSource.includes("item.status === 'CONCILIADO'")
    && reportSource.includes('estornarConciliacaoBancaria'),
  'O relatorio deve disponibilizar o estorno generico para registros conciliados.'
);

assert.deepStrictEqual(
  validateFinanceConciliacaoCreditoRotativoBody({ descricao: 'Renovacao operacional' }),
  { descricao: 'Renovacao operacional' }
);
assert.throws(
  () => validateFinanceConciliacaoCreditoRotativoBody({ valor: 100 }),
  /campos nao permitidos/i,
  'Valor e natureza devem ser derivados exclusivamente do OFX.'
);
assert(
  routesSource.includes("router.post('/financeiro/conciliacoes/:id/confirmar-credito-rotativo'")
    && serviceSource.includes("? 'LIBERACAO_CREDITO_ROTATIVO'")
    && serviceSource.includes(": 'AMORTIZACAO_CREDITO_ROTATIVO'")
    && serviceSource.includes('categoria_financeira_id: null'),
  'Credito rotativo deve derivar a natureza do sinal bancario e permanecer fora da DRE.'
);
assert(
  reconciliationReversalSource.includes("'LIBERACAO_CREDITO_ROTATIVO'")
    && reconciliationReversalSource.includes("'AMORTIZACAO_CREDITO_ROTATIVO'")
    && reconciliationReversalSource.includes("'CREDITO_ROTATIVO'"),
  'Liberacao e amortizacao de credito rotativo devem ser estornaveis pelo fluxo da conciliacao.'
);

assert.deepStrictEqual(
  validateFinanceConciliacaoEstornoTarifaBody({ codigo: 'TAR_PIX', descricao: 'Devolucao bancaria' }),
  { codigo: 'TAR_PIX', movimento_tarifa_id: undefined, descricao: 'Devolucao bancaria' }
);
assert.deepStrictEqual(
  validateFinanceConciliacaoEstornoTarifaBody({ movimento_tarifa_id: 12, descricao: 'Cliente em cache' }),
  { codigo: undefined, movimento_tarifa_id: 12, descricao: 'Cliente em cache' }
);
assert.throws(
  () => validateFinanceConciliacaoEstornoTarifaBody({ descricao: 'Sem classificacao' }),
  /Codigo da tarifa.*obrigatorio/i
);
assert.deepStrictEqual(
  validateFinanceConciliacaoEstornoBancarioBody({
    conciliacao_origem_id: 81,
    motivo: 'PIX rejeitado pelo banco.'
  }),
  {
    conciliacao_origem_id: 81,
    motivo: 'PIX rejeitado pelo banco.'
  }
);
assert.throws(
  () => validateFinanceConciliacaoEstornoBancarioBody({ conciliacao_origem_id: 81 }),
  /Justificativa.*obrigat/i
);
assert(
  routesSource.includes("router.post('/financeiro/conciliacoes/:id/confirmar-estorno-bancario'")
    && serviceSource.includes("tipo_movimento: 'ESTORNO_BANCARIO'")
    && serviceSource.includes("match_inicial_tipo: 'ESTORNO_ALERTA'")
    && serviceSource.includes('origemSemBaixa = true')
    && serviceSource.includes('pareado_sem_baixa: origemSemBaixa')
    && /Sem baixa de t[ií]tulo: a sa[ií]da e a devolu[cç][aã]o ser[aã]o pareadas/i.test(reconciliationPageSource)
    && reconciliationPageSource.includes('if (!candidatoEstornoApto(candidato))')
    && !reconciliationPageSource.includes("if (!candidato?.titulo || !candidato?.movimento?.id)")
    && reconciliationPageSource.includes('Confirmar devolucao'),
  'Estornos bancarios devem aceitar o par do extrato sem exigir baixa previa do titulo.'
);
assert.throws(
  () => validateFinanceConciliacaoEstornoTarifaBody({ movimento_tarifa_id: 12, valor: 100 }),
  /campos nao permitidos/i,
  'O valor do estorno de tarifa deve ser derivado do OFX.'
);
assert(
  routesSource.includes("router.get('/financeiro/conciliacoes/:id/tarifas-estorno'")
    && routesSource.includes("router.post('/financeiro/conciliacoes/:id/confirmar-estorno-tarifa'")
    && serviceSource.includes("tipo_movimento: 'ESTORNO_TARIFA_BANCARIA'")
    && serviceSource.includes('movimento_origem_id: null')
    && serviceSource.includes('lancamento_independente: true')
    && serviceSource.includes("statusConciliacao === 'CONCILIADO'"),
  'Estorno bancario de tarifa deve criar movimento independente e usar a conciliacao como protecao de idempotencia.'
);

const financialReportServiceSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/relatorioFinanceiroService.js'),
  'utf8'
);
assert(
  financialReportServiceSource.includes("tipoMovimento === 'LIBERACAO_CREDITO_ROTATIVO'")
    && financialReportServiceSource.includes("tipoMovimento === 'AMORTIZACAO_CREDITO_ROTATIVO'")
    && financialReportServiceSource.includes("? 'CREDITO_ROTATIVO'"),
  'Relatorios devem distinguir o credito rotativo e respeitar entrada/saida.'
);
assert(
  financialReportServiceSource.includes("tipoMovimento === 'ESTORNO_TARIFA_BANCARIA'")
    && financialReportServiceSource.includes("resolucaoTipo === 'ESTORNO_TARIFA_BANCARIA'")
    && financialReportServiceSource.includes("? 'ESTORNO_TARIFA'"),
  'Relatorios devem classificar estornos de tarifa com ou sem movimento financeiro associado.'
);
assert(
  reconciliationPageSource.includes('Registrar liberacao')
    && reconciliationPageSource.includes('Registrar amortizacao')
    && reconciliationPageSource.includes('Lancar estorno de tarifa')
    && reconciliationPageSource.includes('codigo: tarifa.codigo')
    && reconciliationPageSource.includes('handleConfirmarEstornoTarifa')
    && !reconciliationPageSource.includes('getTarifasEstornoConciliacao')
    && !reconciliationPageSource.includes('EstornoTarifaModal'),
  'A conferencia OFX deve expor a acao conforme o sinal do lancamento.'
);

const reopenSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/conciliacaoEstornoService.js'),
  'utf8'
);
assert(
  reopenSource.includes("status: 'PENDENTE'")
    && reopenSource.includes('titulo_financeiro_id: null')
    && reopenSource.includes('movimento_financeiro_id: null'),
  'O estorno deve reabrir a conciliacao e limpar somente os vinculos financeiros ativos.'
);
assert(
  reopenSource.includes('lock: transaction.LOCK.UPDATE'),
  'A reabertura da conciliacao deve bloquear os registros dentro da transacao do estorno.'
);

const titleServiceSource = fs.readFileSync(
  path.resolve(__dirname, '../src/services/tituloFinanceiroService.js'),
  'utf8'
);
const titleReversalSource = titleServiceSource.match(
  /async function estornarMovimentoTitulo[\s\S]*?\n}\n\nasync function atualizarCobrancaTitulo/
)?.[0] || '';
assert(
  titleReversalSource.indexOf('reabrirConciliacoesPorMovimentos') < titleReversalSource.indexOf('await transaction.commit()'),
  'A conciliacao deve ser reaberta antes do commit do estorno da baixa.'
);

const accountCorrectionSource = serviceSource.match(
  /async function corrigirContaConciliacao[\s\S]*?\n}\n\nasync function removerConciliacao/
)?.[0] || '';
assert(
  accountCorrectionSource.includes("status || '').toUpperCase() !== 'PENDENTE'")
    && accountCorrectionSource.includes('ainda possui vinculos financeiros'),
  'A troca de conta deve aceitar somente conciliacao pendente e sem vinculos financeiros.'
);
assert(
  accountCorrectionSource.includes('FINANCIAL_BANK_RECONCILIATION_ACCOUNT_CORRECTED'),
  'A troca de conta deve gerar evento de auditoria dedicado.'
);

console.log('Validacao de matches exatos da conciliacao concluida com sucesso.');
