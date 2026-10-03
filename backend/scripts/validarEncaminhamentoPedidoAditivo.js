'use strict';

/**
 * Teste local reversivel do encaminhamento de um pedido de aditivo do fluxo novo.
 *
 * Cria registros com prefixo proprio e remove somente pelos ids retornados pelas insercoes. A
 * limpeza e conferida no fim e qualquer falha nela reprova o teste, porque o banco local e
 * compartilhado com outras sessoes.
 */

const {
  sequelize,
  Contrato,
  ContratoAditivo,
  ContratoAnexo,
  EtapaSetor,
  Historico,
  Obra,
  Solicitacao,
  TipoSolicitacao,
  User
} = require('../src/models');
const { solicitarAditivo } = require('../src/services/contratoAditivoService');

const PREFIXO = `QA-ADITIVO-FILA-${Date.now()}`;

function garantir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function limpar({ solicitacaoId, contratoId }) {
  if (solicitacaoId) {
    await Historico.destroy({ where: { solicitacao_id: solicitacaoId }, force: true });
  }
  if (contratoId) {
    await ContratoAnexo.destroy({ where: { contrato_id: contratoId }, force: true });
    await ContratoAditivo.destroy({ where: { contrato_id: contratoId }, force: true });
  }
  if (solicitacaoId) {
    await Solicitacao.update({ contrato_id: null }, { where: { id: solicitacaoId } });
  }
  if (contratoId) {
    await Contrato.update({ solicitacao_id: null }, { where: { id: contratoId } });
    await Contrato.destroy({ where: { id: contratoId }, force: true });
  }
  if (solicitacaoId) {
    await Solicitacao.destroy({ where: { id: solicitacaoId }, force: true });
  }

  const [solicitacoesRestantes, contratosRestantes, aditivosRestantes, anexosRestantes, historicosRestantes] = await Promise.all([
    solicitacaoId ? Solicitacao.count({ where: { id: solicitacaoId } }) : 0,
    contratoId ? Contrato.count({ where: { id: contratoId } }) : 0,
    contratoId ? ContratoAditivo.count({ where: { contrato_id: contratoId } }) : 0,
    contratoId ? ContratoAnexo.count({ where: { contrato_id: contratoId } }) : 0,
    solicitacaoId ? Historico.count({ where: { solicitacao_id: solicitacaoId } }) : 0
  ]);

  garantir(
    solicitacoesRestantes + contratosRestantes + aditivosRestantes + anexosRestantes + historicosRestantes === 0,
    'A limpeza do teste nao devolveu integralmente o estado do banco.'
  );
}

async function executar() {
  let solicitacaoId = null;
  let contratoId = null;
  let erroDoTeste = null;

  try {
    const [obra, tipo, usuario] = await Promise.all([
      Obra.findOne({ attributes: ['id'], order: [['id', 'ASC']] }),
      TipoSolicitacao.findOne({ attributes: ['id'], order: [['id', 'ASC']] }),
      User.findOne({ attributes: ['id'], order: [['id', 'ASC']] })
    ]);
    garantir(obra && tipo && usuario, 'Banco local sem obra, tipo de solicitacao ou usuario para o teste.');

    const solicitacao = await Solicitacao.create({
      codigo: PREFIXO,
      obra_id: obra.id,
      tipo_solicitacao_id: tipo.id,
      descricao: PREFIXO,
      status_global: 'APROVADA',
      area_responsavel: 'OBRA',
      criado_por: usuario.id
    });
    solicitacaoId = solicitacao.id;

    const contrato = await Contrato.create({
      obra_id: obra.id,
      codigo: PREFIXO,
      descricao: PREFIXO,
      valor_total: 1000,
      fluxo_novo: true,
      status_contrato: 'ATIVO',
      solicitacao_id: solicitacao.id,
      ativo: true
    });
    contratoId = contrato.id;
    await solicitacao.update({ contrato_id: contrato.id });

    const resultado = await solicitarAditivo({
      contrato_id: contrato.id,
      tipo: 'VALOR',
      valor: 10,
      justificativa: `${PREFIXO} validar fila`
    }, {
      usuarioId: usuario.id,
      negociacaoArquivo: {
        originalname: 'negociacao-detalhada-teste.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 teste controlado')
      },
      uploadArquivo: async () => `testes/${PREFIXO}/negociacao-detalhada.pdf`
    });

    await solicitacao.reload();
    garantir(resultado.solicitacao_id === solicitacao.id, 'O aditivo nao permaneceu ligado a solicitacao-mae.');
    garantir(solicitacao.area_responsavel === 'GEO', `Setor esperado GEO; recebido ${solicitacao.area_responsavel}.`);
    garantir(solicitacao.status_global === 'PED. ADITIVO', `Status esperado PED. ADITIVO; recebido ${solicitacao.status_global}.`);

    const historicos = await Historico.findAll({
      where: { solicitacao_id: solicitacao.id },
      order: [['id', 'ASC']]
    });
    const pedido = historicos.find((item) => item.acao === 'ADITIVO_SOLICITADO');
    const envio = historicos.find((item) => item.acao === 'ENVIADA_SETOR');
    garantir(pedido?.status_anterior === 'APROVADA' && pedido?.status_novo === 'PED. ADITIVO',
      'Historico do pedido nao registrou a transicao de status.');
    garantir(envio?.setor === 'GEO' && envio?.descricao === 'De OBRA para GEO',
      'Historico nao registrou o encaminhamento para GEO no formato operacional.');

    const etapa = await EtapaSetor.findOne({ where: { setor: 'GEO', nome: 'PED. ADITIVO', ativo: true } });
    garantir(etapa, 'Status PED. ADITIVO nao esta ativo na configuracao do setor GEO.');

    console.log('PASSOU: pedido de aditivo encaminhou a solicitacao para GEO com status PED. ADITIVO.');
  } catch (error) {
    erroDoTeste = error;
  } finally {
    try {
      await limpar({ solicitacaoId, contratoId });
      console.log('LIMPEZA: registros do teste removidos e ausencia confirmada.');
    } catch (erroLimpeza) {
      erroDoTeste = erroDoTeste
        ? new Error(`${erroDoTeste.message} | Falha na limpeza: ${erroLimpeza.message}`)
        : erroLimpeza;
    }
    await sequelize.close();
  }

  if (erroDoTeste) throw erroDoTeste;
}

executar().catch((error) => {
  console.error(`FALHOU: ${error.message}`);
  process.exitCode = 1;
});
