// =====================================================================
// PENDÊNCIAS DO USUÁRIO (Hub Principal)
// ---------------------------------------------------------------------
// Cada contador é uma CONSULTA NOMEADA, restrita ao que diz respeito ao
// usuário logado (setor, autoria, escopo de obras do financeiro) e
// gateada pelas MESMAS permissões das telas de destino. O SQL de
// conferência de cada contador está documentado em
// docs/PENDENCIAS-SQL.md — os WHERE abaixo espelham aquele documento.
// Somente leitura: nenhuma regra de negócio é alterada aqui.
// =====================================================================
const {
  TituloFinanceiro,
  SolicitacaoCompra,
  Sequelize
} = require('../models');
const {
  canAccessFinanceiro,
  canViewCompraSolicitacoes,
  getFinanceiroObraScopeIds,
  userHasAreaPermission
} = require('../services/authorizationService');
const { resolverEscopoObrasComprasLista } = require('../middlewares/resourceAccess');
const { isModuleEnabled } = require('../services/moduleConfigService');
const {
  DIAS_SEM_MOVIMENTACAO_PARA_PARADA,
  contarVisaoPendencia,
  buscarLinhasVisaoPendencia
} = require('../services/pendenciasVisoes');
// Tokens de setor, ids ocultos e permissões vêm do MESMO escopo da lista
// (montarEscopoVisibilidadeLista): cartão e lista usam o mesmo resolvedor
// por construção — decisão do porte (02/09), nunca um resolvedor próprio.
const SolicitacaoController = require('./SolicitacaoController');

const { Op } = Sequelize;

const DIAS_VENCENDO = 7;

function dataLocalISO(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// ----- Itens da seção "Para resolver agora" ---------------------------
// Converte linhas das MESMAS consultas acima em itens acionáveis:
// identificação curta, o que é, valor e atraso, com tom de urgência.
function diasDeAtraso(dataVencimento) {
  if (!dataVencimento) return null;
  const hoje = new Date(`${dataLocalISO()}T00:00:00`);
  const vencimento = new Date(`${String(dataVencimento).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(vencimento.getTime())) return null;
  return Math.round((hoje - vencimento) / 86400000);
}

function itemSolicitacaoParaResolver(linha, oQueE, tom) {
  const atraso = diasDeAtraso(linha.data_vencimento);
  return {
    tipo: 'solicitacao',
    id: linha.id,
    codigo: linha.codigo || `#${linha.id}`,
    contexto: linha.obra?.nome || null,
    o_que_e: oQueE,
    descricao: String(linha.descricao || '').slice(0, 90),
    valor: linha.valor != null ? Number(linha.valor) : null,
    data_vencimento: linha.data_vencimento || null,
    atraso_dias: atraso,
    tom,
    link: `/solicitacoes/${linha.id}`
  };
}

// ---------------------------------------------------------------------
// Consulta nomeada: compras_aguardando_acao
// Solicitações de compra LIBERADAS aguardando tratamento — gate da tela
// de compras + o MESMO escopo de obras que governa contratos/financeiro
// (getUserObraScopeIds): quem tem escopo global (setor de COMPRAS) vê a
// fila global; usuário de obra vê apenas as das obras vinculadas — e a
// lista que o cartão abre aplica o mesmo recorte. Decisão do porte 02/09.
// ---------------------------------------------------------------------
async function contarComprasAguardandoAcao(obraIds) {
  const where = { status: 'LIBERADO_PARA_COMPRA' };
  if (obraIds) {
    where.obra_id = { [Op.in]: obraIds };
  }
  return SolicitacaoCompra.count({ where });
}

// ---------------------------------------------------------------------
// Consultas nomeadas: titulos_pagar_vencidos, titulos_pagar_vencendo_7d,
// titulos_receber_vencidos — títulos em aberto no escopo de obras do
// usuário (mesmo escopo do módulo Financeiro).
// ---------------------------------------------------------------------
async function contarTitulos({ obraIds, tipo, vencimento }) {
  const where = {
    tipo,
    status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] },
    data_vencimento: vencimento
  };
  if (obraIds) {
    where.obra_id = { [Op.in]: obraIds };
  }
  return TituloFinanceiro.count({ where });
}

module.exports = {
  diasDeAtraso,

  async index(req, res) {
    try {
      const usuarioId = Number(req.user?.id);
      if (!Number.isInteger(usuarioId) || usuarioId <= 0) {
        return res.json({ itens: [] });
      }

      const perfil = String(req.user?.perfil || '').trim().toUpperCase();
      const superadmin = perfil === 'SUPERADMIN';
      const itens = [];
      // Itens acionáveis da seção "Para resolver agora" (as mesmas
      // consultas dos contadores, com linhas). Ordenados por urgência
      // no fim; vazio = a seção não aparece.
      const paraResolver = [];
      let resumoObras = [];

      // ----- Solicitações ------------------------------------------------
      const moduloSolicitacoes = superadmin || (await isModuleEnabled('SOLICITACOES'));
      if (moduloSolicitacoes) {
        // O MESMO escopo da lista: tokens de setor (aliases GEO↔Gerência
        // incluídos), ids ocultos e permissões saem de um único lugar.
        const escopoLista = await SolicitacaoController.montarEscopoVisibilidadeLista(req, { listarArquivadas: false });
        const contextoLista = escopoLista.contexto || {};
        const tokensSetor = contextoLista.setorTokens || [];
        const idsOcultos = contextoLista.idsOcultos || [];
        const permissoesConfiguradas = Boolean(contextoLista.temPermissoesAreasConfiguradas);

        const podeVerMinhas = !permissoesConfiguradas || Boolean(contextoLista.podeVerSolicitacoesProprias);
        const podeVerSetor = !permissoesConfiguradas || Boolean(contextoLista.podeVerSolicitacoesSetor);
        const podeVerTodas = !permissoesConfiguradas || Boolean(contextoLista.podeVerTodasSolicitacoes);

        // Contexto compartilhado com a lista (?visao=): cada cartão
        // conta com o MESMO recorte que a lista aplica ao abrir, e o
        // link leva à visão nomeada — número e lista sempre batem.
        const ctxVisao = { usuarioId, tokensSetor, idsOcultos, acessoGlobal: superadmin };
        // O contador precisa atravessar exatamente as mesmas duas camadas
        // da lista: WHERE de visibilidade e, no perfil misto, o pós-filtro
        // por tipo. Antes ele usava só o recorte da pendência e podia
        // contar uma solicitação que desaparecia ao abrir o cartão.
        const filtrarItensVisiveis = contextoLista.usuarioComRegraMistaPorTipo
          ? (linhas) => SolicitacaoController.filtrarRegraMistaPorTipo(linhas, contextoLista)
          : null;
        const opcoesVisao = {
          baseWhere: escopoLista.where,
          filtrarItens: filtrarItensVisiveis
        };

        if ((tokensSetor.length > 0 || superadmin) && (podeVerSetor || podeVerTodas)) {
          const podeAprovarDiretoria = superadmin || !permissoesConfiguradas || await userHasAreaPermission(
            req.user,
            ['solicitacoes.acoes.aprovar']
          );
          const [totalAprovacoes, linhasAprovacoes] = podeAprovarDiretoria
            ? await Promise.all([
                contarVisaoPendencia('aprovacoes-diretoria', ctxVisao, opcoesVisao),
                buscarLinhasVisaoPendencia('aprovacoes-diretoria', ctxVisao, {
                  ...opcoesVisao,
                  limit: 5
                })
              ])
            : [0, []];
          for (const linha of linhasAprovacoes) {
            paraResolver.push(itemSolicitacaoParaResolver(linha, 'Aprovação aguardando você', 'danger'));
          }

          if (totalAprovacoes > 0) {
            itens.push({
              chave: 'aprovacoes_diretoria',
              modulo: 'solicitacoes',
              rotulo: totalAprovacoes === 1
                ? 'aprovação aguardando você'
                : 'aprovações aguardando você',
              quantidade: totalAprovacoes,
              // Aguardando aprovação é bloqueio de fluxo: urgência máxima.
              tom: 'danger',
              criterio: 'Ação Aprovar disponível para o seu acesso.',
              link: '/solicitacoes?visao=aprovacoes-diretoria'
            });
          }

          const jaListadas = new Set(linhasAprovacoes.map((linha) => linha.id));
          const paradasUrgentes = await buscarLinhasVisaoPendencia('paradas-no-setor', ctxVisao, {
            ...opcoesVisao,
            limit: 5,
            order: [['data_vencimento', 'ASC']],
            extraWhere: [{ data_vencimento: { [Op.ne]: null } }]
          });
          for (const linha of paradasUrgentes) {
            if (jaListadas.has(linha.id)) continue;
            const atraso = diasDeAtraso(linha.data_vencimento);
            if (atraso === null || atraso < -DIAS_VENCENDO) continue; // só o que aperta
            paraResolver.push(itemSolicitacaoParaResolver(
              linha,
              'Parada no seu setor',
              atraso > 0 ? 'danger' : 'warning'
            ));
          }

          const quantidadeSetor = await contarVisaoPendencia('paradas-no-setor', ctxVisao, opcoesVisao);
          if (quantidadeSetor > 0) {
            itens.push({
              chave: 'solicitacoes_no_setor',
              modulo: 'solicitacoes',
              rotulo: quantidadeSetor === 1
                ? 'solicitação parada no seu setor'
                : 'solicitações paradas no seu setor',
              quantidade: quantidadeSetor,
              tom: 'warning',
              criterio: `Aberta no seu setor e sem movimentação há ${DIAS_SEM_MOVIMENTACAO_PARA_PARADA}+ dias.`,
              link: '/solicitacoes?visao=paradas-no-setor'
            });
          }
        }

        // Contratos aguardando aprovação no setor do usuário (a aprovação
        // acontece na solicitação-mãe do contrato, parada no setor).
        const moduloContratos = superadmin || (await isModuleEnabled('CONTRATOS'));
        if (moduloContratos && tokensSetor.length > 0 && (podeVerSetor || podeVerTodas)) {
          const totalContratos = await contarVisaoPendencia(
            'contratos-aguardando-aprovacao',
            ctxVisao,
            opcoesVisao
          );
          if (totalContratos > 0) {
            itens.push({
              chave: 'contratos_aguardando_aprovacao',
              modulo: 'solicitacoes',
              rotulo: totalContratos === 1
                ? 'contrato aguardando aprovação no seu setor'
                : 'contratos aguardando aprovação no seu setor',
              quantidade: totalContratos,
              tom: 'danger',
              link: '/solicitacoes?visao=contratos-aguardando-aprovacao'
            });
          }
        }

        if (tokensSetor.length > 0 && (podeVerMinhas || podeVerSetor || podeVerTodas)) {
          const [totalDevolucoes, linhasDevolucoes] = await Promise.all([
            contarVisaoPendencia('devolucoes-recebidas', ctxVisao, opcoesVisao),
            buscarLinhasVisaoPendencia('devolucoes-recebidas', ctxVisao, {
              ...opcoesVisao,
              limit: 3,
              order: [['updatedAt', 'DESC']]
            })
          ]);
          for (const linha of linhasDevolucoes) {
            paraResolver.push(itemSolicitacaoParaResolver(linha, 'Devolução recebida', 'warning'));
          }
          if (totalDevolucoes > 0) {
            itens.push({
              chave: 'devolucoes_recebidas',
              modulo: 'solicitacoes',
              rotulo: totalDevolucoes === 1
                ? 'devolução recebida no seu setor'
                : 'devoluções recebidas no seu setor',
              quantidade: totalDevolucoes,
              tom: 'warning',
              link: '/solicitacoes?visao=devolucoes-recebidas'
            });
          }
        }
      }

      // ----- Financeiro ---------------------------------------------------
      const moduloFinanceiro = superadmin || (await isModuleEnabled('FINANCEIRO'));
      if (moduloFinanceiro && (await canAccessFinanceiro(req.user))) {
        const obraIds = superadmin ? null : await getFinanceiroObraScopeIds(req.user);
        const escopoVazio = Array.isArray(obraIds) && obraIds.length === 0;

        if (!escopoVazio) {
          const hoje = dataLocalISO();
          const limite = new Date();
          limite.setDate(limite.getDate() + DIAS_VENCENDO);
          const dataLimite = dataLocalISO(limite);

          const [pagarVencidos, pagarVencendo, receberVencidos] = await Promise.all([
            contarTitulos({ obraIds, tipo: 'PAGAR', vencimento: { [Op.lt]: hoje } }),
            contarTitulos({ obraIds, tipo: 'PAGAR', vencimento: { [Op.between]: [hoje, dataLimite] } }),
            contarTitulos({ obraIds, tipo: 'RECEBER', vencimento: { [Op.lt]: hoje } })
          ]);

          // Top títulos vencidos: o MESMO where da contagem, com linhas.
          if (pagarVencidos > 0) {
            const whereVencidos = {
              tipo: 'PAGAR',
              status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] },
              data_vencimento: { [Op.lt]: hoje }
            };
            if (obraIds) whereVencidos.obra_id = { [Op.in]: obraIds };
            const titulosVencidos = await TituloFinanceiro.findAll({
              where: whereVencidos,
              attributes: ['id', 'codigo', 'descricao', 'valor_saldo', 'data_vencimento', 'tipo'],
              include: [
                { association: 'parceiro', attributes: ['id', 'nome'] },
                { association: 'obra', attributes: ['id', 'nome'] }
              ],
              order: [['data_vencimento', 'ASC']],
              limit: 5
            });
            for (const titulo of titulosVencidos) {
              paraResolver.push({
                tipo: 'titulo',
                id: titulo.id,
                codigo: titulo.codigo || `Título #${titulo.id}`,
                contexto: titulo.parceiro?.nome || titulo.obra?.nome || null,
                o_que_e: 'Título a pagar vencido',
                descricao: String(titulo.descricao || '').slice(0, 90),
                valor: titulo.valor_saldo != null ? Number(titulo.valor_saldo) : null,
                data_vencimento: titulo.data_vencimento || null,
                atraso_dias: diasDeAtraso(titulo.data_vencimento),
                tom: 'danger',
                link: `/financeiro/titulos?tipo=pagar&q=${encodeURIComponent(titulo.codigo || String(titulo.id))}`
              });
            }
          }

          // Mini-resumo gerencial: as obras com maior saldo a pagar no
          // mês corrente (só para quem tem permissão financeira).
          const inicioMes = `${hoje.slice(0, 7)}-01`;
          const fimMesData = new Date(Number(hoje.slice(0, 4)), Number(hoje.slice(5, 7)), 0);
          const fimMes = dataLocalISO(fimMesData);
          const whereMes = {
            tipo: 'PAGAR',
            status: { [Op.in]: ['PREVISAO', 'ABERTO', 'PARCIAL'] },
            data_vencimento: { [Op.between]: [inicioMes, fimMes] },
            obra_id: { [Op.ne]: null }
          };
          if (obraIds) whereMes.obra_id = { [Op.in]: obraIds };
          const somasPorObra = await TituloFinanceiro.findAll({
            where: whereMes,
            attributes: [
              'obra_id',
              [Sequelize.fn('SUM', Sequelize.col('valor_saldo')), 'total'],
              [Sequelize.fn('COUNT', Sequelize.col('TituloFinanceiro.id')), 'quantidade']
            ],
            include: [{ association: 'obra', attributes: ['id', 'nome'] }],
            group: ['obra_id', 'obra.id', 'obra.nome'],
            order: [[Sequelize.literal('total'), 'DESC']],
            limit: 4,
            subQuery: false
          });
          resumoObras = somasPorObra
            .filter((linha) => Number(linha.get('total')) > 0)
            .map((linha) => ({
              obra_id: linha.obra_id,
              obra: linha.obra?.nome || `Obra #${linha.obra_id}`,
              total: Number(linha.get('total')),
              quantidade: Number(linha.get('quantidade')),
              link: `/financeiro/titulos?tipo=pagar&status=EM_ABERTO&obra_id=${linha.obra_id}&vencimento_inicial=${inicioMes}&vencimento_final=${fimMes}`
            }));

          if (pagarVencidos > 0) {
            itens.push({
              chave: 'titulos_pagar_vencidos',
              modulo: 'financeiro',
              rotulo: pagarVencidos === 1 ? 'título a pagar vencido' : 'títulos a pagar vencidos',
              quantidade: pagarVencidos,
              tom: 'danger',
              criterio: 'Previsão, aberto ou parcial; vencido até ontem.',
              link: '/financeiro/titulos?tipo=pagar&vencidos=1'
            });
          }

          if (pagarVencendo > 0) {
            itens.push({
              chave: 'titulos_pagar_vencendo_7d',
              modulo: 'financeiro',
              rotulo: pagarVencendo === 1
                ? `título a pagar vence em ${DIAS_VENCENDO} dias`
                : `títulos a pagar vencem em ${DIAS_VENCENDO} dias`,
              quantidade: pagarVencendo,
              tom: 'warning',
              criterio: `Previsão, aberto ou parcial; vence entre hoje e ${DIAS_VENCENDO} dias.`,
              link: `/financeiro/titulos?tipo=pagar&vencendo_ate=${dataLimite}`
            });
          }

          if (receberVencidos > 0) {
            itens.push({
              chave: 'titulos_receber_vencidos',
              modulo: 'financeiro',
              rotulo: receberVencidos === 1 ? 'título a receber vencido' : 'títulos a receber vencidos',
              quantidade: receberVencidos,
              tom: 'warning',
              criterio: 'Previsão, aberto ou parcial; vencido até ontem.',
              link: '/financeiro/titulos?tipo=receber&vencidos=1'
            });
          }
        }
      }

      // ----- Compras --------------------------------------------------------
      const moduloCompras = superadmin || (await isModuleEnabled('COMPRAS'));
      if (moduloCompras && (await canViewCompraSolicitacoes(req.user))) {
        // null = escopo global de obras (setor de COMPRAS vê a fila toda);
        // lista de ids = usuário de obra, só as obras vinculadas dele.
        // A MESMA função que o middleware da lista usa (compraScopeObraIds):
        // o número do cartão e a lista aberta saem do mesmo escopo.
        const obraIdsCompras = superadmin ? null : await resolverEscopoObrasComprasLista(req.user);
        const escopoComprasVazio = Array.isArray(obraIdsCompras) && obraIdsCompras.length === 0;
        const aguardando = escopoComprasVazio ? 0 : await contarComprasAguardandoAcao(obraIdsCompras);
        if (aguardando > 0) {
          itens.push({
            chave: 'compras_aguardando_acao',
            modulo: 'compras',
            rotulo: aguardando === 1
              ? 'solicitação de compra liberada aguardando tratamento'
              : 'solicitações de compra liberadas aguardando tratamento',
            quantidade: aguardando,
            tom: 'warning',
            // A tela abre já filtrada no MESMO status contado.
            link: '/solicitacoes-compra?status=LIBERADO_PARA_COMPRA'
          });
        }
      }

      // "Para resolver agora": danger antes de warning; dentro do tom,
      // o mais atrasado primeiro. Máximo de 8 itens.
      const pesoTom = { danger: 0, warning: 1 };
      paraResolver.sort((a, b) => (
        (pesoTom[a.tom] ?? 2) - (pesoTom[b.tom] ?? 2)
        || (b.atraso_dias ?? -9999) - (a.atraso_dias ?? -9999)
      ));

      return res.json({
        itens,
        para_resolver: paraResolver.slice(0, 8),
        resumo_obras: resumoObras
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Erro ao carregar pendências' });
    }
  }
};
