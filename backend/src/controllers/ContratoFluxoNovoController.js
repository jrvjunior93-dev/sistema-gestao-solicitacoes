'use strict';

const {
  criarContrato,
  aprovarContrato,
  rejeitarContrato,
  encerrarContrato,
  tramitarNoJuridico,
  listarParcelasDoContrato,
  cancelarSolicitacaoDoContrato,
  reenviarContratoParaAprovacao,
  atualizarApropriacoesDoContrato,
  listarCategoriasParaContrato
} = require('../services/contratoFluxoNovoService');
const { criarEscopoIdempotencia } = require('../services/idempotenciaCriacaoService');
const { completarCadastroDoCredor, conferirCadastros } = require('../services/credorContratoService');
const { consultarCnpj, configuracao: configuracaoCnpj } = require('../services/cnpjLookupService');
const { obterLimiteJuridico } = require('../services/contratoLimiteConfigService');
const { atualizarMedicaoDoContrato, aprovarMedicaoDoContrato } = require('../services/medicaoContratoService');
const { solicitarAditivo, decidirAditivo, cancelarAditivo, listarAditivosDoContrato, calcularTetoAditivo } = require('../services/contratoAditivoService');
const { assertPodeInteragirSolicitacao } = require('../services/solicitacaoRetornoService');

// Mesma protecao do submit padrao da Nova Solicitacao: o ref do frontend so cobre o duplo
// clique na aba; um retry de rede repetiria a criacao e duplicaria o contrato.
const idempotenciaCriacao = criarEscopoIdempotencia({
  mensagemEmAndamento: 'Este contrato ja esta sendo criado. Aguarde a conclusao antes de tentar novamente.'
});

const idempotenciaAditivo = criarEscopoIdempotencia({
  mensagemEmAndamento: 'Este termo aditivo ja esta sendo solicitado. Aguarde a conclusao antes de tentar novamente.'
});

function parseParcelasAditivo(valor) {
  if (Array.isArray(valor) || valor == null || valor === '') return valor || null;
  try {
    const parcelas = JSON.parse(String(valor));
    if (!Array.isArray(parcelas)) throw new Error('formato');
    return parcelas;
  } catch {
    const error = new Error('O cronograma financeiro do aditivo esta em formato invalido.');
    error.statusCode = 400;
    throw error;
  }
}

// Controllers finos: as regras, permissoes e transacoes vivem no servico (auditado nas
// 5 rodadas do bloco). Aqui so a traducao HTTP.
function responderErro(res, error, fallback) {
  const status = Number(error?.statusCode) || 500;
  if (status >= 500) console.error(error);
  return res.status(status).json({ error: status >= 500 ? fallback : error.message });
}

module.exports = {
  async criar(req, res) {
    const idempotencia = idempotenciaCriacao.preparar(req, res);
    if (idempotencia.handled) return undefined;
    try {
      const resultado = await criarContrato(req.body || {}, { usuarioId: req.user?.id });
      // So memoriza apos a gravacao: erro nao pode virar resposta repetida.
      idempotenciaCriacao.armazenar(idempotencia.scopeKey, resultado);
      return res.status(201).json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao criar contrato do fluxo novo');
    }
  },

  /**
   * Editar uma medicao ja criada: valor e vencimento das parcelas que ela consumiu (20/08).
   *
   * Permissao (`contratos.medicao.editar_valor`) e regra de redistribuicao ficam no servico —
   * a rota so entrega o corpo.
   */
  async atualizarMedicao(req, res) {
    try {
      const resultado = await atualizarMedicaoDoContrato(Number(req.params.id), {
        itens: req.body?.itens,
        usuario: req.user
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao alterar a medicao');
    }
  },

  /**
   * A Gerencia de Processos aprova a medicao e ela segue ao Financeiro (item 25, 23/08).
   * Permissao e regra ficam no servico.
   */
  /** As formas que a medicao oferece — ja filtradas pela configuracao. */
  async formasPagamentoDaMedicao(req, res) {
    try {
      const { listarFormasDaMedicao } = require('../services/formasPagamentoMedicaoService');
      return res.json(await listarFormasDaMedicao());
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar as formas de pagamento da medicao');
    }
  },

  async aprovarMedicao(req, res) {
    try {
      const resultado = await aprovarMedicaoDoContrato(Number(req.params.id), { usuario: req.user, req });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao aprovar a medicao');
    }
  },

  async listarParcelas(req, res) {
    try {
      // `usuario` entra para a resposta dizer o que ELE pode fazer no contrato: sem isso a
      // barra de acoes decidia so pelo status e oferecia acao de outro setor.
      const resultado = await listarParcelasDoContrato(req.params.id, { usuario: req.user });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar parcelas do contrato');
    }
  },

  async aprovar(req, res) {
    try {
      const resultado = await aprovarContrato(Number(req.params.id), {
        usuario: req.user,
        req,
        // PI-16: informada por quem aprova, e aplicada a todos os titulos do contrato.
        categoriaFinanceiraId: req.body?.categoria_financeira_id
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao aprovar contrato');
    }
  },

  async juridico(req, res) {
    try {
      const resultado = await tramitarNoJuridico(Number(req.params.id), {
        usuario: req.user,
        req,
        etapa: req.body?.etapa,
        linkAssinatura: req.body?.link_assinatura,
        assinadoPeloLink: req.body?.assinado_pelo_link === true
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao tramitar contrato no juridico');
    }
  },

  async tetoAditivo(req, res) {
    try {
      return res.json(await calcularTetoAditivo(Number(req.params.id)));
    } catch (error) {
      return responderErro(res, error, 'Erro ao calcular o limite de aditivo');
    }
  },

  async criarAditivo(req, res) {
    const idempotencia = idempotenciaAditivo.preparar(req, res);
    if (idempotencia.handled) return undefined;
    try {
      const { Contrato } = require('../models');
      const contrato = await Contrato.findByPk(Number(req.params.id), {
        attributes: ['id', 'fluxo_novo', 'solicitacao_id']
      });
      if (contrato?.fluxo_novo && contrato?.solicitacao_id) {
        await assertPodeInteragirSolicitacao(req, contrato.solicitacao_id);
      }
      const resultado = await solicitarAditivo(
        {
          ...(req.body || {}),
          parcelas: parseParcelasAditivo(req.body?.parcelas),
          contrato_id: Number(req.params.id)
        },
        { usuarioId: req.user?.id, negociacaoArquivo: req.file }
      );
      idempotenciaAditivo.armazenar(idempotencia.scopeKey, resultado);
      // `area_responsavel` ja vem no corpo; o servico decide se abre solicitacao (legado) ou usa
      // a que existe (fluxo novo).
      return res.status(201).json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao solicitar aditivo');
    }
  },

  /** A lista que faltava para o botao ter onde ficar (item 26, 23/08). */
  async listarAditivos(req, res) {
    try {
      return res.json({ aditivos: await listarAditivosDoContrato(Number(req.params.id)) });
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar os aditivos do contrato');
    }
  },

  async cancelarAditivo(req, res) {
    try {
      const resultado = await cancelarAditivo(Number(req.params.aditivoId), {
        usuario: req.user,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao cancelar aditivo');
    }
  },

  async decidirAditivo(req, res) {
    try {
      const resultado = await decidirAditivo(Number(req.params.aditivoId), {
        usuario: req.user,
        // `req` entra porque a aprovacao passou a criar a PARCELA do aditivo, e o titulo dela nasce
        // pela mesma rota da aprovacao do contrato (`criarTituloManual`), que audita pelo request.
        req,
        aprovar: req.body?.aprovar !== false,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao decidir aditivo');
    }
  },

  /**
   * Opcoes do formulario de contrato: responsaveis e condicoes de pagamento.
   *
   * Existe porque a tela buscava esses dois em rotas ADMINISTRATIVAS — `/usuarios`
   * (`allowGestaoUsuarios`) e `/financeiro/formas-pagamento` (`allowFinanceiro`). O usuario da
   * OBRA, que e justamente quem abre contrato, nao tem nenhuma das duas: os dois selects vinham
   * VAZIOS, e vazios em silencio, porque a tela engolia o 403 num `.catch(() => [])`.
   *
   * Autenticacao basta: sao nomes de usuarios ativos, agora restritos aos vinculos da obra
   * informada, e formas de pagamento. Nao ha dado sensivel novo aqui — exigir permissao
   * administrativa para PREENCHER um formulario e que estava errado.
   */
  async opcoesDoFormulario(req, res) {
    try {
      const { listarFormasDosFluxos } = require('../services/formasPagamentoMedicaoService');
      const { listarResponsaveisVinculadosObra } = require('../services/contratoResponsavelService');

      const [usuarios, formasConfiguradas] = await Promise.all([
        listarResponsaveisVinculadosObra(req.query?.obra_id),
        listarFormasDosFluxos()
      ]);

      return res.json({
        usuarios: usuarios.map((u) => ({ id: u.id, nome: u.nome })),
        formas_pagamento: formasConfiguradas.formas
      });
    } catch (error) {
      return responderErro(res, error, 'Erro ao carregar as opcoes do formulario de contrato');
    }
  },

  // PI-16: cancelar e TERMINAL. Rejeitar (que devolve em PENDENTE DE AJUSTE) e outra rota.
  // Devolve o contrato ajustado para a fila. Sem esta rota, `REJEITADO` era um beco sem saida.
  async reenviar(req, res) {
    try {
      const resultado = await reenviarContratoParaAprovacao(Number(req.params.id), {
        usuario: req.user,
        req,
        comentario: req.body?.comentario,
        anexoIds: req.body?.anexo_ids
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao reenviar o contrato para aprovacao');
    }
  },

  async cancelarSolicitacao(req, res) {
    try {
      const resultado = await cancelarSolicitacaoDoContrato(Number(req.params.id), {
        usuario: req.user,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao cancelar a solicitacao do contrato');
    }
  },

  // Rateio de apropriacoes do contrato, editado de dentro da solicitacao (20/08).
  async atualizarApropriacoes(req, res) {
    try {
      const resultado = await atualizarApropriacoesDoContrato(Number(req.params.id), {
        usuario: req.user,
        req,
        apropriacoes: req.body?.apropriacoes,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao atualizar as apropriacoes do contrato');
    }
  },

  // Conferencia do cadastro dos contratados antes de criar o contrato acima do limite (20/08).
  // GET com a lista de ids na query: e leitura, e precisa poder ser repetida sem efeito.
  async conferirCredores(req, res) {
    try {
      const ids = String(req.query?.ids || '')
        .split(',')
        .map((item) => Number(String(item).trim()))
        .filter((n) => Number.isInteger(n) && n > 0);

      const parceiros = await conferirCadastros(ids);
      return res.json({
        parceiros,
        // A tela precisa saber se oferece o botao de consulta — e a resposta e do servidor, nao
        // uma suposicao do frontend sobre o ambiente.
        consulta_cnpj_habilitada: configuracaoCnpj().habilitado
      });
    } catch (error) {
      return responderErro(res, error, 'Erro ao conferir o cadastro dos credores');
    }
  },

  async completarCredor(req, res) {
    try {
      const resultado = await completarCadastroDoCredor(Number(req.params.id), {
        usuario: req.user,
        req,
        dados: req.body
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao completar o cadastro do credor');
    }
  },

  async consultarCnpj(req, res) {
    try {
      return res.json(await consultarCnpj(req.params.cnpj));
    } catch (error) {
      // Nao usa `responderErro`: ele mascara mensagem em status >= 500 para nao vazar detalhe
      // interno, e aqui os 501/502/504 sao mensagens ESCRITAS para o usuario ("preencha os dados
      // manualmente"). Mascarar transformaria a orientacao em "Erro ao consultar o CNPJ".
      const status = Number(error?.statusCode) || 502;
      if (!error?.statusCode) console.error(error);
      return res.status(status).json({
        error: error?.statusCode ? error.message : 'Nao foi possivel consultar o CNPJ. Preencha os dados manualmente.',
        habilitado: status !== 501
      });
    }
  },

  // O limite vive na configuracao (`CONTRATO_LIMITE_JURIDICO`) e a tela precisa dele para saber
  // quando exigir a conferencia e o documento. Ate aqui o frontend tinha 50000 fixo no codigo, e
  // mudar o limite pela tela de configuracao deixava os dois discordando.
  // Lista para o campo de categoria na aprovacao. E LEITURA de plano de contas — a autoridade de
  // aprovar continua sendo conferida na propria aprovacao, com permissao estrita.
  //
  // Nao usa `allowConfiguracoesGeral`: a rota antiga exigia permissao de Configuracoes, que quem
  // aprova nao tem, e o 403 era engolido pelo `.catch` da tela — o campo aparecia vazio, sem dizer
  // por que. Foi assim que o cliente encontrou.
  async categorias(req, res) {
    try {
      return res.json(await listarCategoriasParaContrato());
    } catch (error) {
      return responderErro(res, error, 'Erro ao listar as categorias financeiras');
    }
  },

  async limiteJuridico(req, res) {
    try {
      return res.json(await obterLimiteJuridico());
    } catch (error) {
      return responderErro(res, error, 'Erro ao obter o limite do Juridico');
    }
  },

  async encerrar(req, res) {
    try {
      const resultado = await encerrarContrato(Number(req.params.id), {
        usuario: req.user,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao encerrar contrato');
    }
  },

  async rejeitar(req, res) {
    try {
      const resultado = await rejeitarContrato(Number(req.params.id), {
        usuario: req.user,
        motivo: req.body?.motivo
      });
      return res.json(resultado);
    } catch (error) {
      return responderErro(res, error, 'Erro ao rejeitar contrato');
    }
  }
};
