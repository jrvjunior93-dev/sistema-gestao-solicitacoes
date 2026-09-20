// =====================================================================
// VERIFICAÇÃO CARTÃO × LISTA — MariaDB REAL + controllers REAIS.
// Para cada cartão de pendência devolvido por /dashboard/pendencias,
// abre a lista pelo LINK do próprio cartão e compara:
//   total exibido no cartão  ===  meta.total da lista aberta
// Cobre também os cartões de títulos (tela de contas a pagar/receber
// com os parâmetros do link) e o de compras.
// Cenário inclui 70 aprovações (mais que o antigo teto de 61) para
// provar que o bug "61 → lista do setor inteiro" morreu.
// =====================================================================
const path = require('path');
const BACKEND = path.resolve(__dirname, '..');

// A autorização precisa vir do comando atual. Mesmo que alguém grave a chave
// por engano no .env, ela não habilita escritas silenciosamente.
const escritaAutorizadaNoComando =
  String(process.env.ALLOW_DEV_TEST_WRITES || '').trim().toLowerCase() === 'true';

require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });

function abortarProtecao(mensagem) {
  console.error(`valida-pendencias: recusado. ${mensagem}`);
  process.exit(1);
}

if (!escritaAutorizadaNoComando) {
  abortarProtecao(
    'este script grava dados de cenário. Informe ALLOW_DEV_TEST_WRITES=true no comando atual.'
  );
}

const variaveisObrigatorias = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASSWORD',
  'DB_NAME',
  'JWT_SECRET'
];
const ausentes = variaveisObrigatorias.filter((nome) => !String(process.env[nome] || '').trim());
if (ausentes.length > 0) {
  abortarProtecao(`variáveis obrigatórias ausentes: ${ausentes.join(', ')}.`);
}

// NODE_ENV identifica o modo do Node, não o ambiente de dados: o backend-dev
// pode executar otimizado. A barreira contra produção é o fingerprint exato
// do host + banco, configurado somente no .env da EC2 dev.
const hostPermitido = String(process.env.DEV_TEST_ALLOWED_DB_HOST || '').trim();
const bancoPermitido = String(process.env.DEV_TEST_ALLOWED_DB_NAME || '').trim();
if (!hostPermitido || !bancoPermitido) {
  abortarProtecao(
    'configure DEV_TEST_ALLOWED_DB_HOST e DEV_TEST_ALLOWED_DB_NAME exclusivamente no ambiente dev.'
  );
}
if (String(process.env.DB_HOST).trim() !== hostPermitido ||
    String(process.env.DB_NAME).trim() !== bancoPermitido) {
  abortarProtecao('DB_HOST/DB_NAME não correspondem ao fingerprint autorizado do banco dev.');
}

// Cada execução recebe um namespace próprio. Isso permite repetir o QA no
// banco compartilhado de desenvolvimento sem colidir com códigos, e-mails ou
// documentos criados por execuções anteriores.
const runIdInformado = String(process.env.DEV_TEST_RUN_ID || 'QA').replace(/[^a-z0-9]/gi, '');
const runIdGerado = `${Date.now().toString(36)}${process.pid.toString(36)}`;
const QA_RUN_ID = `${runIdInformado}${runIdGerado}`.slice(-12).toUpperCase();
const qaCodigo = (prefixo, sufixo = '') =>
  [prefixo, QA_RUN_ID, sufixo].filter(Boolean).join('-');

console.log(
  `valida-pendencias: execução ${QA_RUN_ID} autorizada em ` +
  `${process.env.DB_HOST}/${process.env.DB_NAME}.`
);

async function main() {
  // O script NÃO roda migrations (decisão do responsável, 02/09): o schema
  // vem pronto do passo anterior do roteiro (ALLOW_SCHEMA_MIGRATIONS=true
  // npm run migrate). Aqui só se confere — pendência aborta com a lista.
  const { assertMigrationsUpToDate } = require(path.join(BACKEND, 'src/database/runMigrations'));
  await assertMigrationsUpToDate();

  const db = require(path.join(BACKEND, 'src/models'));
  const {
    User, Setor, Obra, TipoSolicitacao, Parceiro, Solicitacao, Historico,
    Contrato, TituloFinanceiro, SolicitacaoCompra, SolicitacaoVisibilidadeUsuario
  } = db;

  // ----- SEED ----------------------------------------------------------
  const setorFin = await Setor.create({
    nome: `Financeiro QA ${QA_RUN_ID}`,
    codigo: qaCodigo('QAFIN'),
    eh_setor_financeiro: true
  });
  const setorEng = await Setor.create({
    nome: `Engenharia QA ${QA_RUN_ID}`,
    codigo: qaCodigo('QAENG'),
    eh_setor_obra: true
  });

  const usuarioFin = await User.create({
    nome: `Valida Financeiro ${QA_RUN_ID}`,
    email: `valida.fin.${QA_RUN_ID.toLowerCase()}@test.dev`,
    senha: 'x'.repeat(60), perfil: 'FINANCEIRO', ativo: true, setor_id: setorFin.id
  });
  const outroUsuario = await User.create({
    nome: `Valida Eng ${QA_RUN_ID}`,
    email: `valida.eng.${QA_RUN_ID.toLowerCase()}@test.dev`,
    senha: 'x'.repeat(60), perfil: 'SETOR', ativo: true, setor_id: setorEng.id
  });

  const obra = await Obra.create({
    nome: `OBRA VALIDA QA ${QA_RUN_ID}`,
    codigo: qaCodigo('QAOBRA')
  });
  const tipo = await TipoSolicitacao.create({
    nome: `Pagamento QA ${QA_RUN_ID}`,
    codigo_interno: qaCodigo('QAPAG')
  });
  const parceiro = await Parceiro.create({
    nome: `FORNECEDOR VALIDA QA ${QA_RUN_ID}`,
    tipo_pessoa: 'J',
    cpf_cnpj: `99${String(Date.now()).slice(-12)}`
  });

  const criarSol = (props) => Solicitacao.create({
    obra_id: obra.id,
    tipo_solicitacao_id: tipo.id,
    descricao: props.descricao || `validação QA ${QA_RUN_ID}`,
    status_global: 'PENDENTE',
    area_responsavel: setorFin.codigo,
    criado_por: props.criado_por || outroUsuario.id,
    valor: 100,
    cancelada: false,
    ...props
  });

  // 70 aprovações de diretoria pendentes no setor (mais que o teto antigo de 61)
  for (let i = 0; i < 70; i += 1) {
    await criarSol({
      codigo: qaCodigo('SOL', `A${String(i).padStart(3, '0')}`),
      fluxo_aprovacao_diretoria: true,
      aprovada_diretoria_em: null,
      diretoria_fluxo_codigo: setorFin.codigo,
      setor_destino_pos_aprovacao: setorEng.codigo,
      descricao: `aprovação QA ${QA_RUN_ID} ${i}`
    });
  }
  // 25 paradas comuns no setor (sem fluxo de diretoria e sem qualquer
  // movimentação há mais de três dias).
  const quatroDiasAtras = new Date(Date.now() - 4 * 86400000);
  for (let i = 0; i < 25; i += 1) {
    await criarSol({
      codigo: qaCodigo('SOL', `P${String(i).padStart(3, '0')}`),
      descricao: `parada QA ${QA_RUN_ID} ${i}`,
      createdAt: quatroDiasAtras,
      updatedAt: quatroDiasAtras
    });
  }
  // 3 devoluções: criadas pelo usuárioFin, no setor dele, com ENVIADA_SETOR
  for (let i = 0; i < 3; i += 1) {
    const dev = await criarSol({
      codigo: qaCodigo('SOL', `D${String(i).padStart(2, '0')}`),
      criado_por: usuarioFin.id,
      descricao: `devolução QA ${QA_RUN_ID} ${i}`
    });
    await Historico.create({
      solicitacao_id: dev.id, acao: 'ENVIADA_SETOR', setor: setorEng.codigo,
      usuario_responsavel_id: usuarioFin.id
    });
  }
  // 2 contratos aguardando aprovação, com solicitação-mãe no setor
  for (let i = 0; i < 2; i += 1) {
    const mae = await criarSol({
      codigo: qaCodigo('SOL', `C${String(i).padStart(2, '0')}`),
      descricao: `contrato QA ${QA_RUN_ID} ${i}`
    });
    await Contrato.create({
      obra_id: obra.id,
      codigo: qaCodigo('CT', String(i)),
      descricao: `contrato QA ${QA_RUN_ID} ${i}`,
      valor_total: 1000, ativo: true, fluxo_novo: true,
      status_contrato: 'AGUARDANDO_APROVACAO', solicitacao_id: mae.id
    });
  }
  // 1 parada arquivada pelo usuário (deve sair do cartão E da lista)
  const arquivada = await criarSol({
    codigo: qaCodigo('SOL', 'ARQ'),
    descricao: `arquivada QA ${QA_RUN_ID}`
  });
  await SolicitacaoVisibilidadeUsuario.create({
    usuario_id: usuarioFin.id, solicitacao_id: arquivada.id, oculto: true
  });
  // 1 cancelada (fora de tudo)
  await criarSol({ codigo: qaCodigo('SOL', 'CANC'), cancelada: true });

  // Títulos: 4 vencidos PAGAR (PREVISAO/ABERTO/PARCIAL contam; QUITADO não),
  // 2 vencendo em 7d, 1 RECEBER vencido
  const criarTitulo = (props) => TituloFinanceiro.create({
    obra_id: obra.id, parceiro_id: parceiro.id, tipo: 'PAGAR',
    descricao: `título validação QA ${QA_RUN_ID}`,
    valor: 500, valor_original: 500, valor_saldo: 500,
    status: 'ABERTO', data_vencimento: '2026-08-01', codigo: props.codigo,
    ...props
  });
  await criarTitulo({ codigo: qaCodigo('TIT', 'V1'), status: 'ABERTO', data_vencimento: '2026-08-01' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'V2'), status: 'PREVISAO', data_vencimento: '2026-08-10' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'V3'), status: 'PARCIAL', data_vencimento: '2026-08-20' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'V4'), status: 'ABERTO', data_vencimento: '2026-08-30' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'Q'), status: 'QUITADO', data_vencimento: '2026-08-15', valor_saldo: 0 });
  await criarTitulo({ codigo: qaCodigo('TIT', 'F1'), status: 'ABERTO', data_vencimento: '2026-09-02' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'F2'), status: 'PREVISAO', data_vencimento: '2026-09-05' });
  await criarTitulo({ codigo: qaCodigo('TIT', 'R1'), tipo: 'RECEBER', status: 'ABERTO', data_vencimento: '2026-08-05' });

  // Compras: 2 liberadas + 1 encerrada
  await SolicitacaoCompra.create({ titulo: `Compra QA ${QA_RUN_ID} 1`, obra_id: obra.id, solicitante_id: usuarioFin.id, status: 'LIBERADO_PARA_COMPRA', origem: 'AVULSA' });
  await SolicitacaoCompra.create({ titulo: `Compra QA ${QA_RUN_ID} 2`, obra_id: obra.id, solicitante_id: usuarioFin.id, status: 'LIBERADO_PARA_COMPRA', origem: 'AVULSA' });
  await SolicitacaoCompra.create({ titulo: `Compra QA ${QA_RUN_ID} 3`, obra_id: obra.id, solicitante_id: usuarioFin.id, status: 'ENCERRADO', origem: 'AVULSA' });

  // ----- usuário do req (mesmo shape do buildSessionUser p/ estes casos)
  const u = await User.findByPk(usuarioFin.id, { include: [{ model: Setor, as: 'setor' }] });
  const reqUser = {
    ...u.get({ plain: true }),
    area: u.setor?.codigo || null,
    financeiro_liberado: true,
    rh_dp_capacidades: [],
    integracao_sienge_capacidades: [],
    areas_permissoes: []
  };

  const DashboardPendenciasController = require(path.join(BACKEND, 'src/controllers/DashboardPendenciasController'));
  const SolicitacaoController = require(path.join(BACKEND, 'src/controllers/SolicitacaoController'));
  const TituloFinanceiroController = require(path.join(BACKEND, 'src/controllers/TituloFinanceiroController'));

  function resMock() {
    const captura = {};
    return {
      captura,
      status(codigo) { captura.status = codigo; return this; },
      json(payload) { captura.body = payload; return this; },
      sendStatus(codigo) { captura.status = codigo; return this; }
    };
  }
  const chamar = async (controllerFn, query) => {
    const res = resMock();
    await controllerFn({ user: reqUser, query, auth: {}, headers: {} }, res);
    return res.captura;
  };

  // ----- 1) pendências -------------------------------------------------
  const pend = await chamar(DashboardPendenciasController.index, {});
  const cartoes = pend.body?.itens || [];
  console.log('\ncartões devolvidos:', cartoes.map((c) => `${c.chave}=${c.quantidade}`).join(' | '));

  const resultados = [];
  const isoLocalHoje = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  for (const cartao of cartoes) {
    const url = new URL(`http://x${cartao.link}`);
    let totalLista = null;
    let detalheLista = '';

    if (url.pathname === '/solicitacoes') {
      const query = Object.fromEntries(url.searchParams.entries());
      query.page = '1';
      query.limit = '25';
      const lista = await chamar(SolicitacaoController.index, query);
      totalLista = Number(lista.body?.meta?.total ?? NaN);
      detalheLista = `visao=${query.visao || '-'}`;
    } else if (url.pathname === '/financeiro/titulos') {
      // Reproduz EXATAMENTE o que a tela faz com os params do link.
      const tipoTela = String(url.searchParams.get('tipo') || '').toUpperCase();
      const filtros = { tipo: tipoTela, paginated: 'true', page: '1', limit: '20' };
      const hoje = isoLocalHoje();
      if (url.searchParams.get('vencidos') === '1') {
        const ontem = new Date();
        ontem.setDate(ontem.getDate() - 1);
        filtros.status = 'EM_ABERTO';
        filtros.vencimento_final = `${ontem.getFullYear()}-${String(ontem.getMonth() + 1).padStart(2, '0')}-${String(ontem.getDate()).padStart(2, '0')}`;
      } else if (url.searchParams.get('vencendo_ate')) {
        filtros.status = 'EM_ABERTO';
        filtros.vencimento_inicial = hoje;
        filtros.vencimento_final = url.searchParams.get('vencendo_ate');
      }
      const lista = await chamar(TituloFinanceiroController.index, filtros);
      totalLista = Number(lista.body?.pagination?.total ?? lista.body?.meta?.total ?? (Array.isArray(lista.body) ? lista.body.length : NaN));
      detalheLista = `titulos ${tipoTela}`;
    } else if (url.pathname === '/solicitacoes-compra') {
      // A tela filtra client-side pelo status do link sobre a lista toda.
      const status = url.searchParams.get('status');
      totalLista = await SolicitacaoCompra.count({ where: { status } });
      detalheLista = `compras status=${status}`;
    }

    const ok = Number(cartao.quantidade) === totalLista;
    resultados.push({ cartao: cartao.chave, exibido: cartao.quantidade, lista: totalLista, ok, detalheLista });
  }

  console.log('\n===== CARTÃO × LISTA =====');
  for (const r of resultados) {
    console.log(`${r.ok ? 'OK  ' : 'FALHA'} ${r.cartao.padEnd(32)} cartão=${String(r.exibido).padEnd(5)} lista=${String(r.lista).padEnd(5)} (${r.detalheLista})`);
  }
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} cartões batem com a lista.`);

  // Conferência extra: aprovações NÃO podem cair no fallback do setor
  const aprov = cartoes.find((c) => c.chave === 'aprovacoes_diretoria');
  console.log('\nlink das aprovações:', aprov?.link, aprov?.link?.includes('visao=aprovacoes-diretoria') ? '(visão nomeada OK)' : '(ERRADO)');

  process.exit(falhas.length > 0 ? 1 : 0);
}

main().catch((erro) => {
  console.error(erro);
  process.exit(1);
});
