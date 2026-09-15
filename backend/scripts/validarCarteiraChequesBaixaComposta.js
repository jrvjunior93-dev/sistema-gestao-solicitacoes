'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, '..', relativePath), 'utf8');
}

function validateMigration() {
  const migration = read('migrations/202608070001_financeiro_carteira_cheques_baixa_composta.js');
  const intercompanyMigration = read('migrations/202608100001_baixa_composta_intercompany_fontes.js');
  const chequeSettlementMigration = read('migrations/202608120001_dados_cheque_movimentos_baixas.js');
  const chequeHolderMigration = read('migrations/202608120002_cheques_titular_parceiro.js');
  const lifecycleMigration = read('migrations/202609150002_cheques_ciclo_compensacao.js');
  [
    'baixas_financeiras_grupos',
    'baixas_financeiras_componentes',
    'baixas_financeiras_alocacoes',
    'cheques_terceiros_movimentos',
    'baixa_grupo_id',
    'baixa_componente_id',
    'ux_cheques_chave_importacao'
  ].forEach((contract) => assert(migration.includes(contract), `Contrato ausente na migration: ${contract}`));
  assert(migration.includes('idx_cheques_identidade'));
  assert(!migration.includes("'ux_cheques_identidade'"), 'A migration nao pode falhar por duplicidades historicas.');
  assert(intercompanyMigration.includes("'empresa_id'"), 'Componente deve persistir a empresa de cada fonte.');
  assert(intercompanyMigration.includes('idx_baixa_componente_empresa'), 'Empresa da fonte deve estar indexada.');
  ['movimentos_financeiros', 'baixas_financeiras_componentes', 'cheque_numero', 'cheque_emitente', 'cheque_data_vencimento']
    .forEach((contract) => assert(chequeSettlementMigration.includes(contract), `Dados do cheque ausentes na migration: ${contract}`));
  assert(chequeHolderMigration.includes('titular_parceiro_id'), 'Cheque deve persistir o vinculo com o titular cadastrado.');
  [
    'movimento_deposito_id',
    'conciliacao_deposito_id',
    'movimento_devolucao_id',
    'conciliacao_devolucao_id',
    'data_compensacao',
    'deposito_idempotency_key',
    'ux_cheques_deposito_idempotency'
  ].forEach((contract) => assert(lifecycleMigration.includes(contract), `Ciclo de compensacao ausente na migration: ${contract}`));
}

function validateSecurityAndTransactions() {
  const service = read('src/services/chequeTerceiroService.js');
  const titleService = read('src/services/tituloFinanceiroService.js');
  [
    'idempotency-key',
    'sequelize.transaction()',
    'lock: transaction.LOCK.UPDATE',
    'Mesmo credor',
    'Selecione somente titulos do mesmo credor',
    'Informe a empresa da fonte',
    'natureza_intercompany_baixa',
    'O mesmo cheque nao pode ser usado em mais de uma operacao',
    'Cartao de credito com geracao de fatura deve usar a baixa simples',
    'deve ser utilizado integralmente',
    'estornarBaixaComposta',
    'Justificativa do estorno e obrigatoria',
    "status: 'EM_CARTEIRA'"
  ].forEach((contract) => assert(service.toLowerCase().includes(contract.toLowerCase()), `Protecao ausente: ${contract}`));
  assert(titleService.includes('baixa_grupo_id'));
  assert(titleService.includes('baixa_componente_id'));
  assert(titleService.includes('skipTituloIntercompanyUpdate'), 'Baixa composta multifonte deve preservar o titulo e auditar intercompany por movimento.');
  assert(titleService.includes('Estorne o grupo completo na tela de Baixas com Multiplas Fontes'));
  assert(titleService.includes("status: 'EM_CARTEIRA'"), 'Estorno deve devolver cheque utilizado para a carteira.');
  assert(service.includes('isValidCpfCnpj'), 'Cadastro de cheque deve validar CPF/CNPJ do titular.');
  assert(service.includes('normalizarCpfCnpj'), 'CPF/CNPJ do titular deve ser persistido sem mascara.');
  assert(service.includes('Informe numero e emitente do cheque na operacao'), 'Cheque proprio da baixa composta deve exigir identificacao.');
  assert(titleService.includes('buildChequeMovimentoFields'), 'Baixa simples deve persistir os dados do cheque no movimento.');
  assert(service.includes("tipo_movimento: 'DEPOSITO_CHEQUE_TERCEIRO'"), 'Deposito deve gerar movimento bancario conciliavel.');
  assert(service.includes('confirmarCompensacaoChequePorMovimento'), 'Conciliacao deve confirmar a compensacao do cheque.');
  assert(service.includes("status: 'COMPENSADO'"), 'Cheque deve distinguir deposito de compensacao bancaria.');
  assert(service.includes('deposito_idempotency_key'), 'Deposito deve ser protegido contra repeticao.');

  const conciliacaoService = read('src/services/conciliacaoBancariaService.js');
  assert(conciliacaoService.includes('DEPOSITO_CHEQUE_TERCEIRO'), 'Conciliacao deve listar depositos de cheques de terceiros.');
  assert(conciliacaoService.includes('DEVOLUCAO_CHEQUE_TERCEIRO'), 'Devolucao bancaria deve gerar contrapartida do deposito.');
  assert(conciliacaoService.includes('chequeRecebidoStatusDestino: \'DEVOLVIDO\''), 'Devolucao deve reabrir o recebimento vinculado quando existir.');
  assert(conciliacaoService.includes('calculateDiffDays(conciliacao.data_movimento, movimento.data_movimento) <= 180'), 'Cheque proprio deve aceitar conciliacao na apresentacao bancaria posterior.');
}

function validateRoutesAndPermissions() {
  const routes = read('src/routes.js');
  const permissions = read('src/constants/moduloPermissoes.js');
  [
    '/financeiro/cheques-terceiros/modelo.xlsx',
    '/financeiro/cheques-terceiros/importacoes/preview',
    '/financeiro/cheques-terceiros/importacoes/confirmar',
    '/financeiro/cheques-terceiros/clientes',
    '/financeiro/baixas-compostas/preview',
    '/financeiro/baixas-compostas/confirmar',
    '/financeiro/baixas-compostas/:id/estornar'
  ].forEach((contract) => assert(routes.includes(contract), `Rota ausente: ${contract}`));
  [
    'financeiro.cheques.visualizar',
    'financeiro.cheques.cadastrar',
    'financeiro.cheques.importar',
    'financeiro.cheques.depositar',
    'financeiro.cheques.transferir',
    'financeiro.baixas_compostas.criar',
    'financeiro.baixas_compostas.confirmar',
    'financeiro.baixas_compostas.estornar'
  ].forEach((contract) => assert(permissions.includes(contract), `Permissao ausente: ${contract}`));
}

function validateFrontend() {
  const titles = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroTitulos.jsx'), 'utf8');
  const modal = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/financeiro/BaixaCompostaModal.jsx'), 'utf8');
  const detail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroBaixasCompostas.jsx'), 'utf8');
  const styles = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/index.css'), 'utf8');
  const custody = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroChequesTerceiros.jsx'), 'utf8');
  const personAutocomplete = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/financeiro/PessoaChequeAutocomplete.jsx'), 'utf8');
  const chequeFields = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/components/financeiro/ChequePagamentoFields.jsx'), 'utf8');
  const titleDetail = fs.readFileSync(path.resolve(__dirname, '../../frontend/src/pages/FinanceiroTituloDetalhe.jsx'), 'utf8');
  assert(titles.includes('BaixaCompostaModal'));
  assert(titles.includes('Baixa com múltiplas fontes'));
  assert(modal.includes('crypto.randomUUID()'));
  assert(modal.includes('overflow-y-auto'), 'Modal composto deve permitir rolagem.');
  assert(modal.includes('finance-operation-modal--wide'), 'Modal composto deve usar a superficie financeira opaca.');
  assert(titles.includes('finance-operation-modal--medium'), 'Modal de baixa em massa deve usar a superficie financeira opaca.');
  assert(detail.includes('finance-operation-modal--detail'), 'Detalhe da baixa deve usar a superficie financeira opaca.');
  assert(!detail.includes('var(--c-card)'), 'Detalhe da baixa nao pode depender de token de fundo inexistente.');
  assert(styles.includes('.finance-operation-notice--warning'), 'Avisos financeiros devem possuir contraste tematico.');
  assert(!modal.includes('Empresa da fonte'), 'A empresa da fonte nao deve ser solicitada separadamente da conta.');
  assert(modal.includes('Natureza entre empresas'), 'Rateio entre empresas deve exigir classificacao operacional.');
  assert(modal.includes("next.empresa_id = String(conta?.empresa_id"), 'A conta selecionada deve definir automaticamente a empresa da fonte.');
  assert(modal.includes('Cheque de terceiro em carteira'), 'Modal deve identificar claramente os cheques cadastrados em carteira.');
  assert(modal.includes('Selecione um cheque cadastrado'), 'Opcao vazia do cheque nao pode sugerir uma origem ambigua.');
  assert(modal.includes('ChequePagamentoFields'), 'Baixa composta deve coletar os dados do cheque proprio em cada fonte.');
  assert(titles.includes('ChequePagamentoFields'), 'Baixa selecionada e em massa devem coletar os dados do cheque.');
  assert(titleDetail.includes('Cheque nº'), 'Detalhe do titulo deve exibir o cheque vinculado ao movimento.');
  ['cheque_numero', 'cheque_emitente', 'titular_documento', 'data_vencimento']
    .forEach((contract) => assert(chequeFields.includes(contract), `Campo de cheque ausente no componente reutilizavel: ${contract}`));
  assert(titles.includes("getChequesTerceiros({ status: 'EM_CARTEIRA', limit: 300 })"), 'Baixa composta deve carregar a mesma carteira exibida na gestao de cheques.');
  assert(custody.includes('Importar cheques'));
  assert(custody.includes('Confirmar importação'));
  assert(
    custody.includes('min-h-0 overflow-y-auto p-4'),
    'O corpo do modal de importacao deve permitir rolagem sem ultrapassar a viewport.'
  );
  assert(
    custody.includes('rotuloRolagem="Linhas do lote de importação"'),
    'A tabela do preview deve manter a regiao de rolagem identificada.'
  );
  assert(!custody.includes("['data_emissao', 'Data de emissão'"), 'Data de emissao nao deve aparecer no cadastro de custodia.');
  assert(custody.includes('PessoaChequeAutocomplete'), 'Cadastro deve usar a consulta central de pessoas.');
  assert(custody.includes('titular_parceiro_id'), 'Cadastro manual deve exigir o titular selecionado.');
  assert(custody.includes('parceiro_entregou_id'), 'Cliente/origem deve manter o vinculo com a pessoa selecionada.');
  assert(personAutocomplete.includes('buscarParceiros'), 'Autocomplete deve consultar o cadastro central de pessoas.');
  assert(personAutocomplete.includes('criarClienteChequeTerceiro'), 'Cadastro rapido deve criar a pessoa como cliente.');
  assert(personAutocomplete.includes('Listar pessoas cadastradas'), 'Campo deve oferecer lupa para listar pessoas.');
  assert(personAutocomplete.includes("limit: 'all'"), 'Modal deve listar todas as pessoas ativas.');
}

validateMigration();
validateSecurityAndTransactions();
validateRoutesAndPermissions();
validateFrontend();
console.log('Carteira de cheques e baixa composta validadas com sucesso.');
