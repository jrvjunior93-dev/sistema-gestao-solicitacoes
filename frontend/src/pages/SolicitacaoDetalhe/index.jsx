import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useLiveUpdateSubscription } from '../../contexts/LiveUpdatesContext';

import Header, { apoioDoRegistro, formatarValorSolicitacao } from './Header';
import ApropriacoesDoContrato from './ApropriacoesDoContrato';
import AditivosDoContrato from './AditivosDoContrato';
import Timeline from './Timeline';
import Conversa from './Conversa';
import FinanceiroCard from './FinanceiroCard';
import AcoesContrato from './AcoesContrato';
import RetornoSolicitacaoBar from './RetornoSolicitacaoBar';
import RecargaCartaoDetalhe from './RecargaCartaoDetalhe';
import { getContratoParcelas } from '../../services/contratos';
import ModalAlterarStatus from './ModalAlterarStatus';
import { getAcoesPrincipais, resolverAcaoPrincipal } from '../../services/acoesPrincipais';
import { BLOCOS_DETALHE, resolverLayoutDetalhe } from './blocosDetalhe';
import { getDetalheLayouts } from '../../services/detalheLayout';
import { getListaPreferencias, salvarListaPreferencias } from '../../services/listasPreferencias';
import { tokenSetorDe } from '../../services/atalhos';
import ModalEnviarSetor from '../Solicitacoes/ModalEnviarSetor';
import ApropriacaoAutocomplete from '../../components/ui/ApropriacaoAutocomplete';
import TratamentoItemManual from '../../modules/solicitacao-compra/components/TratamentoItemManual';
import StatusBadge from '../../components/StatusBadge';
import { formatarDataLocalPtBr } from '../../utils/dateLocal';
import OverlayModal from '../../components/ui/OverlayModal';
import {
  Avisos,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  useAvisos,
  useConfirmacao
} from '../../components/padrao';
import {
  aprovarDiretoriaSolicitacao,
  atualizarApropriacoesSolicitacao,
  atualizarPendenciaFinanceiraSolicitacao,
  getSolicitacaoById,
  updateStatusSolicitacao
} from '../../services/solicitacoes';
import {
  atualizarApropriacoesItemSolicitacaoCompra,
  cadastrarUnidadeItemSolicitacaoCompra,
  obterSolicitacaoCompraPorSolicitacao
} from '../../services/compras';
import { listarApropriacoes } from '../../services/apropriacoes';
import {
  criarRateioBase,
  montarLinhasResumoApropriacao,
  normalizarRateiosEntrada,
  parseQuantidade,
  sincronizarItemComRateios,
  validarRateiosItem
} from '../../modules/solicitacao-compra/utils/apropriacoes';
import { isGeoSetor, solicitacaoEstaNoSetorDoUsuario, userHasSetorCapability } from '../../utils/setor';
import {
  canAccessFinanceiro,
  canAlterarQuantidadeSolicitacaoCompra,
  canCatalogarItensManuaisCompras,
  canDeleteSolicitacaoAnexo,
  canEditarApropriacoesItemCompraDireta,
  canEditarApropriacoesItemSolicitacaoCompra,
  canEditarApropriacoesSolicitacao,
  canViewSolicitacaoFinanceiro,
  hasConfiguredAreaPermissions,
  hasEnabledModule,
  hasPermissao
} from '../../utils/acessoProduto';

/*
  DETALHE DA SOLICITAÇÃO — migração de 05/09 para os componentes padrão.

  A pergunta central da tela é "em que pé está esta solicitação e o que eu
  faço com ela agora?". A ordem segue essa pergunta (regra de organização
  do cliente):

    1. faixa fixa  — identificação do registro, valor e as ações (R13/C3/C4/C5);
    2. pedido de retorno e falha de contrato — o que TRAVA a decisão vem antes de tudo;
    3. ladrilhos de situação — status, setor, prazo, última atualização;
    4. dados do registro — o bloco principal, em largura total;
    5. blocos de trabalho — contrato, financeiro, apropriações;
    6. histórico, conversa e auditoria — registros, POR ÚLTIMO. Histórico e conversa
       nascem ABERTOS (decisão do cliente, 07/09); só a auditoria nasce recolhida.

  Reorganização é PURA: mesma rota, mesmos handlers, mesmas chamadas de
  serviço. Nenhum campo, botão ou bloco saiu — o que mudou foi ordem, peso
  e o componente que desenha.

  ## Consentimento (a razão pela qual esta tela é a mais delicada do módulo)

  Aqui se aprova pela diretoria, se muda o status (inclusive CANCELADO), se
  envia para outro setor e se reescreve o rateio contábil. As três regras
  que valem em TODO handler assíncrono deste arquivo:

  - `const { ok } = await confirmar(...)` DESESTRUTURADO. O hook devolve
    `{ ok, texto }` e objeto é SEMPRE verdadeiro: `const ok = await` faz o
    botão "Cancelar" PROSSEGUIR com a ação, calado (R21).
  - o alvo é fixado numa `const` ANTES do `await` (R26). O modal do sistema
    NÃO congela a página, e esta tela recarrega sozinha por evento
    (`useLiveUpdateSubscription`): ler `solicitacao` depois da confirmação
    pode agir sobre um registro diferente do que a pessoa leu na pergunta.
  - a mensagem NOMEIA o registro e a consequência, e cita o valor quando há
    dinheiro envolvido. "Confirmar?" sobre "esta solicitação" não é
    consentimento informado.

  As 19 caixas do navegador (`alert`) saíram para `Avisos`/`useAvisos` (R19).
*/

function parseNumeroLocal(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;
  const texto = String(valor).trim().replace(/\s+/g, '');
  if (!texto) return 0;
  const normalizado = texto.includes(',')
    ? texto.replace(/\./g, '').replace(',', '.')
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : 0;
}

function formatarMoedaLocal(valor) {
  const numero = Number(valor || 0);
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatarNumeroEntrada(valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return String(valor);
}

function normalizarTextoBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function normalizarRateiosSolicitacao(solicitacao) {
  const rateios = Array.isArray(solicitacao?.apropriacoes) ? solicitacao.apropriacoes : [];
  if (rateios.length) {
    return rateios.map((item) => ({
      apropriacao_id: item?.apropriacao_id || item?.apropriacao?.id ? String(item.apropriacao_id || item.apropriacao.id) : '',
      percentual: formatarNumeroEntrada(item?.percentual),
      valor: formatarNumeroEntrada(item?.valor)
    }));
  }

  if (solicitacao?.apropriacao_id) {
    return [{
      apropriacao_id: String(solicitacao.apropriacao_id),
      percentual: '100',
      valor: ''
    }];
  }

  return [{
    apropriacao_id: '',
    percentual: '100',
    valor: ''
  }];
}

function mapearItemManualCompraDireta(item) {
  const insumoOficial = item?.insumoCatalogado || null;
  const descricaoOficial = String(insumoOficial?.descricao || '').trim()
    || insumoOficial?.nome
    || item?.nome_manual
    || item?.descricao
    || `Item manual #${item?.id || ''}`;
  const unidadeOficial = insumoOficial?.unidade?.sigla
    || insumoOficial?.unidade?.nome
    || insumoOficial?.unidade_manual
    || item?.unidade_sigla_manual
    || item?.unidade_sigla
    || '';

  return {
    ...item,
    item_tipo: 'MANUAL',
    descricao: descricaoOficial,
    unidade_label: unidadeOficial,
    nome: insumoOficial?.nome || item?.nome_manual || descricaoOficial,
    unidade: unidadeOficial || '-',
    especificacao: insumoOficial?.descricao || item?.especificacao || '-',
    descricao_original: item?.nome_manual || item?.descricao || '',
    especificacao_original: item?.especificacao || ''
  };
}

/*
  Regra de organização do cliente: "histórico e registros por último". O
  catálogo `ORDEM_PADRAO` (blocosDetalhe.js) é espelhado no backend e
  validado pelo validarNavegacao.mjs — a ORDEM de apresentação, não. Então o
  rebaixamento acontece aqui, e SÓ quando nenhuma camada declarou arranjo:
  usuário e setor que já escolheram uma ordem continuam com a deles, byte a
  byte.
*/
const BLOCOS_DE_REGISTRO = ['historico', 'conversa', 'auditoria'];

/*
  IR POR ÚLTIMO E NASCER RECOLHIDO ERAM A MESMA LISTA — E NÃO SÃO A MESMA
  COISA (decisão do cliente, 07/09).

  Os três desciam para o fim E nasciam recolhidos, pela mesma constante.
  Descer para o fim continua certo: são registro, não decisão. Nascer
  recolhido, não — histórico e conversa são JUSTAMENTE o que a pessoa vem
  ler nesta tela, e o custo era maior do que um clique: o recolhimento
  acontecia em DUAS camadas (esta, do arranjo, e o `recolhidoPadrao` do
  próprio bloco), então abrir o histórico pedia dois cliques.

  A auditoria fica: ela é registro de pendência, ato raro e de administração.

  Quem já declarou `recolhidos` (usuário ou setor) não é tocado — o `Set`
  abaixo só entra quando ninguém declarou nada, e a escolha de quem fechou o
  bloco continua gravada onde sempre esteve.
*/
const BLOCOS_QUE_NASCEM_RECOLHIDOS = ['auditoria'];

export default function SolicitacaoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Declarados no topo: `carregar` (function declaration, içada) usa
  // `avisar` no catch, e todo handler de consentimento usa `confirmar`.
  const { avisos, avisar, fechar: fecharAviso } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const setorTokens = [
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];

  const isSetorGeo = setorTokens.some(isGeoSetor);
  const isSetorObra = userHasSetorCapability(user, 'eh_setor_obra');
  const isSetorFinanceiro = setorTokens.includes('FINANCEIRO') || userHasSetorCapability(user, 'eh_setor_financeiro');
  const isSuperadmin = String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN';
  const podeAcessarModuloFinanceiro = canAccessFinanceiro(user);
  const isFinanceiro = canViewSolicitacaoFinanceiro(user);
  const podeEnviarQualquerSetor = Boolean(user?.pode_enviar_qualquer_setor);
  const podeAlterarStatusQualquerSetor =
    hasConfiguredAreaPermissions(user) &&
    hasPermissao(user, 'solicitacoes.acoes.alterar_status_qualquer_setor');
  useEffect(() => {
    let ativo = true;
    getAcoesPrincipais()
      .then((lista) => {
        if (ativo) setMapeamentosAcaoPrincipal(lista);
      })
      .catch(() => {});
    // Layout configurável do detalhe: camada do setor (admin) + camada do
    // usuário (banco). Falha em qualquer uma = layout atual, nada quebra.
    const setorUsuario = tokenSetorDe(user);
    if (setorUsuario) {
      getDetalheLayouts(setorUsuario)
        .then((linhas) => {
          if (ativo) setLayoutSetor(linhas[0]?.config || null);
        })
        .catch(() => {});
    }
    getListaPreferencias('detalhe-solicitacao')
      .then((prefs) => {
        const temAlgo = prefs && (
          Array.isArray(prefs.ordem) || Array.isArray(prefs.recolhidos)
          || Array.isArray(prefs.removidos) || prefs.larguras || prefs.historico_ordem
        );
        if (ativo && temAlgo) setPrefsLayoutUsuario(prefs);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  const moduloContratosHabilitado = hasEnabledModule(user, 'CONTRATOS');
  const moduloComprasHabilitado = hasEnabledModule(user, 'COMPRAS');
  const podeEditarApropriacoes = moduloComprasHabilitado && canEditarApropriacoesSolicitacao(user);
  const podeEditarItensCompraDiretaBase = moduloComprasHabilitado && canEditarApropriacoesItemCompraDireta(user);
  const podeEditarItensSolicitacaoCompraBase = moduloComprasHabilitado && (
    canAlterarQuantidadeSolicitacaoCompra(user) || canEditarApropriacoesItemSolicitacaoCompra(user)
  );
  const podeCadastrarUnidadeCompraDireta = podeEditarItensCompraDiretaBase || podeEditarItensSolicitacaoCompraBase;
  const podeCatalogarItensManuaisCompra = moduloComprasHabilitado && canCatalogarItensManuaisCompras(user);

  const [solicitacao, setSolicitacao] = useState(null);
  // PI-16: o contrato do fluxo novo vive DENTRO desta solicitacao. O estado dele decide o que a
  // barra de acoes oferece — e e o contrato quem tem a maquina de estados; a solicitacao espelha.
  const [contratoDoFluxo, setContratoDoFluxo] = useState(null);
  // Por que o contrato nao carregou. Vazio quando carregou ou quando a solicitacao nem tem contrato.
  const [falhaContrato, setFalhaContrato] = useState('');
  const [loading, setLoading] = useState(true);
  const [modalStatus, setModalStatus] = useState(false);
  const [statusDependenciasVersao, setStatusDependenciasVersao] = useState(0);
  // Mapeamento configurável setor+estado → ação em destaque (Configurações
  // → Ação principal por setor). Vazio/indisponível = layout atual.
  const [mapeamentosAcaoPrincipal, setMapeamentosAcaoPrincipal] = useState([]);
  // Camadas do layout configurável do detalhe (usuário → setor → padrão).
  const [layoutSetor, setLayoutSetor] = useState(null);
  const [prefsLayoutUsuario, setPrefsLayoutUsuario] = useState(null);
  const [personalizando, setPersonalizando] = useState(false);
  /*
    O "ADICIONAR BLOCO" ERA CÓPIA LITERAL DO DA HOME — E A CÓPIA TROUXE O
    DESENHO SEM TRAZER O FECHAMENTO (medido e corrigido em 05/09: aqui o
    `useFecharAoSair` nunca tinha sido ligado, e o painel só fechava
    clicando de novo no próprio botão; `Esc` não fazia nada).

    A correção não mora mais nesta tela: o painel, o ref e o hook foram
    junto com o resto do mecanismo para o `BlocosPersonalizaveis`. É a
    razão de a extração valer a pena — o defeito da cópia existia porque
    havia cópia, e agora só há um lugar onde ele pode voltar a existir.
  */
  // Abaixo de 768px o detalhe vira ABAS, com a ação principal fixa no topo.
  const [isMobileDetalhe, setIsMobileDetalhe] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches
  ));
  const [abaMobile, setAbaMobile] = useState('detalhes');
  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const listener = (event) => setIsMobileDetalhe(event.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);
  // Auditoria de prazo/documentos é de uso raro: colapsada num botão e
  // abaixo de Financeiro/Pagamentos/Histórico.
  const [auditoriaAberta, setAuditoriaAberta] = useState(false);
  const [modalEnviarSetor, setModalEnviarSetor] = useState(false);
  const [pendenciaFinanceira, setPendenciaFinanceira] = useState({
    marcar: false,
    tipo: 'FORA_DO_PRAZO',
    observacao: ''
  });
  const [salvandoPendenciaFinanceira, setSalvandoPendenciaFinanceira] = useState(false);
  const [apropriacoesCatalogo, setApropriacoesCatalogo] = useState([]);
  const [modalApropriacoesAberto, setModalApropriacoesAberto] = useState(false);
  const [salvandoApropriacoes, setSalvandoApropriacoes] = useState(false);
  const [apropriacaoPrincipalId, setApropriacaoPrincipalId] = useState('');
  const [rateiosApropriacao, setRateiosApropriacao] = useState([]);
  const [motivoApropriacoes, setMotivoApropriacoes] = useState('');
  const [modalCompraDiretaAberto, setModalCompraDiretaAberto] = useState(false);
  const [compraDiretaDetalhe, setCompraDiretaDetalhe] = useState(null);
  const [carregandoCompraDireta, setCarregandoCompraDireta] = useState(false);
  const [itemCompraDiretaSelecionado, setItemCompraDiretaSelecionado] = useState(null);
  const [rateiosCompraDireta, setRateiosCompraDireta] = useState([]);
  const [motivoCompraDireta, setMotivoCompraDireta] = useState('');
  const [salvandoCompraDireta, setSalvandoCompraDireta] = useState(false);
  const [acaoItemCompraDireta, setAcaoItemCompraDireta] = useState('APROPRIAR');
  const localMutationsRef = useRef(new Map());

  const tipoSolicitacaoNormalizado = normalizarTextoBusca(
    solicitacao?.tipo?.nome ||
    solicitacao?.tipo_nome ||
    solicitacao?.tipo_solicitacao ||
    solicitacao?.descricao_tipo
  );
  const isCompraDiretaSolicitacao = tipoSolicitacaoNormalizado.includes('COMPRA DIRETA');
  const isSolicitacaoCompra = isCompraDiretaSolicitacao || tipoSolicitacaoNormalizado.includes('SOLICITACAO DE COMPRA');
  const isRecargaCartaoSolicitacao = tipoSolicitacaoNormalizado.includes('RECARGA DE CARTAO');
  // Numa solicitacao de Abertura de Contrato o rateio que vale e o do CONTRATO
  // (`contrato_apropriacoes`). O card da solicitacao grava em `solicitacao_apropriacoes`, que ali
  // ninguem consome — deixa-lo aberto convidava a criar uma segunda verdade sobre o mesmo contrato.
  const solicitacaoEhContrato = Boolean(contratoDoFluxo);
  const contextoInteracao = solicitacao?.contexto_interacao || null;
  const podeInteragirSolicitacao = contextoInteracao
    ? contextoInteracao.pode_interagir === true
    : Boolean(solicitacao?.area_responsavel && solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user));
  const podeEditarApropriacoesSolicitacaoNormal = podeEditarApropriacoes
    && podeInteragirSolicitacao
    && !isSolicitacaoCompra
    && !solicitacaoEhContrato;
  const podeEditarItensCompraDireta = podeInteragirSolicitacao && podeEditarItensCompraDiretaBase && isCompraDiretaSolicitacao;
  const podeGerenciarItensCompra = isSolicitacaoCompra && podeInteragirSolicitacao && (
    (isCompraDiretaSolicitacao ? podeEditarItensCompraDiretaBase : podeEditarItensSolicitacaoCompraBase)
    || podeCatalogarItensManuaisCompra
  );
  const contratoSomenteLeitura = contratoDoFluxo && !podeInteragirSolicitacao
    ? { ...contratoDoFluxo, permissoes: {} }
    : contratoDoFluxo;

  const perfil = String(user?.perfil || '').trim().toUpperCase();
  const setorUsuario = user?.setor?.codigo || user?.area || user?.setor?.nome || '';
  const setorParaStatus =
    perfil === 'SUPERADMIN'
      ? null
      : isSetorGeo
        ? 'GEO'
        : setorUsuario;

  useEffect(() => {
    carregar();
  }, [id]);

  useEffect(() => {
    const obraId = solicitacao?.obra_id || solicitacao?.obra?.id;
    if (!obraId || (!podeEditarApropriacoesSolicitacaoNormal && !podeEditarItensCompraDireta)) {
      setApropriacoesCatalogo([]);
      return;
    }

    let ativo = true;
    listarApropriacoes({ obra_id: obraId })
      .then((dados) => {
        if (!ativo) return;
        const lista = Array.isArray(dados) ? dados : dados?.items || dados?.rows || [];
        setApropriacoesCatalogo(
          lista.filter((item) => item?.ativo !== false && item?.somadora !== true)
        );
      })
      .catch((error) => {
        console.error(error);
        if (ativo) setApropriacoesCatalogo([]);
      });

    return () => {
      ativo = false;
    };
  }, [
    solicitacao?.obra_id,
    solicitacao?.obra?.id,
    podeEditarApropriacoesSolicitacaoNormal,
    podeEditarItensCompraDireta
  ]);

  useEffect(() => {
    if (!solicitacao) return;
    setPendenciaFinanceira({
      marcar: Boolean(solicitacao.financeiro_pendencia_prazo),
      tipo: solicitacao.financeiro_pendencia_tipo || 'FORA_DO_PRAZO',
      observacao: solicitacao.financeiro_pendencia_observacao || ''
    });
  }, [
    solicitacao?.id,
    solicitacao?.financeiro_pendencia_prazo,
    solicitacao?.financeiro_pendencia_tipo,
    solicitacao?.financeiro_pendencia_observacao
  ]);

  function registrarMutacaoLocal(solicitacaoId) {
    const idNumerico = Number(solicitacaoId);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) return;
    localMutationsRef.current.set(idNumerico, Date.now());
  }

  function eventoFoiTratadoLocalmente(payload) {
    const recordId = Number(payload?.record_id || 0);
    if (!Number.isInteger(recordId) || recordId <= 0) {
      return false;
    }

    const actorId = Number(payload?.actor?.id || 0);
    if (!Number.isInteger(actorId) || actorId <= 0 || actorId !== Number(user?.id || 0)) {
      return false;
    }

    const handledAt = localMutationsRef.current.get(recordId);
    if (!handledAt) {
      return false;
    }

    if (Date.now() - handledAt > 10 * 1000) {
      localMutationsRef.current.delete(recordId);
      return false;
    }

    localMutationsRef.current.delete(recordId);
    return true;
  }

  async function carregar({ silent = false } = {}) {
    try {
      if (!silent) {
        setLoading(true);
      }

      const data = await getSolicitacaoById(id);
      setSolicitacao(data);

      // PI-16: carrega o contrato quando esta solicitacao E a solicitacao DELE.
      //
      // A guarda do `solicitacao_id` importa: uma solicitacao de medicao ou de aditivo do fluxo
      // ANTIGO tambem aponta para um contrato (`contrato_id`), e sem a guarda ela mostraria a
      // barra de acoes de um contrato que nao e dela.
      //
      // O erro nao derruba a tela — a solicitacao abre de qualquer jeito —, mas ele APARECE.
      // Engolir esta falha ja custou duas investigacoes: sem o contrato, somem de uma vez as
      // previsoes e o botao Aprovar, e a tela nao dava nenhuma pista do motivo (na pratica, um
      // 403 de escopo de obra). Quem olha precisa ler "acesso negado", nao encarar o vazio.
      if (data?.contrato_id) {
        try {
          const doContrato = await getContratoParcelas(data.contrato_id);
          const c = doContrato?.contrato;
          setContratoDoFluxo(c?.fluxo_novo && String(c.solicitacao_id) === String(data.id) ? c : null);
          setFalhaContrato('');
        } catch (erroContrato) {
          setContratoDoFluxo(null);
          setFalhaContrato(erroContrato?.message || 'Nao foi possivel carregar o contrato desta solicitacao.');
        }
      } else {
        setContratoDoFluxo(null);
        setFalhaContrato('');
      }
    } catch (err) {
      console.error(err);
      const status = Number(err?.status || 0);
      if (status === 403 || status === 404) {
        setSolicitacao(null);
        navigate('/solicitacoes');
        return;
      }
      if (!silent) {
        avisar.erro(err?.message || 'Erro ao carregar solicitacao');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }

  /*
    ALTERAR STATUS — a ação que também CANCELA a solicitação.

    A CONFIRMAÇÃO NÃO MORA AQUI, e é decisão, não esquecimento: quem
    pergunta é o `ModalAlterarStatus`, que já foi migrado e já desestrutura
    o retorno (`const { ok } = await confirmar(...)`) e já fixa o status
    escolhido numa `const` antes do `await`. Uma segunda confirmação neste
    handler faria a pessoa responder duas caixas para o mesmo ato — e duas
    perguntas sobre a mesma coisa é o defeito que a R16 chama de dois donos
    para a mesma responsabilidade.

    O que a mensagem de lá NÃO faz é nomear o registro: ela diz "esta
    solicitacao" porque o componente só recebe `setor`, `aberto`, `onClose`
    e `onSalvar` — o código e o valor não chegam até ele. Está no relatório
    como proposta de prop, não corrigido aqui (o arquivo é de outro agente).

    R26 continua valendo deste lado: `alvo` e `statusAlvo` são fixados
    antes de qualquer `await`, e a gravação usa a MESMA referência. A tela
    recarrega sozinha por evento (LiveUpdates) — reler `solicitacao` depois
    do await gravaria num registro que não é o que a pessoa autorizou.
  */
  async function salvarStatus(novoStatus) {
    const alvo = solicitacao;
    const statusAlvo = String(novoStatus || '').trim();
    if (!alvo?.id || !statusAlvo) return;

    try {
      await updateStatusSolicitacao(alvo.id, statusAlvo);
      registrarMutacaoLocal(alvo.id);
      setModalStatus(false);
      await carregar({ silent: true });
      // Recarga e Financeiro carregam dados por endpoints proprios. A solicitacao principal ja
      // atualizou, mas esses paineis precisam remontar para refletir no mesmo instante a troca
      // PREVISAO -> ABERTO (ou o cancelamento), sem depender de F5.
      setStatusDependenciasVersao((versao) => versao + 1);
      avisar.sucesso(`Status da solicitação ${alvo.codigo} alterado para ${statusAlvo}.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao atualizar status');
    }
  }

  /*
    APROVAR PELA DIRETORIA — libera a solicitação para o próximo setor.

    Não havia confirmação nenhuma: um clique aprovava e encaminhava. A
    mensagem nomeia o registro, o VALOR aprovado e o destino, porque é o
    conjunto disso que a pessoa está autorizando.
  */
  async function aprovarDiretoria() {
    const alvo = solicitacao;
    if (!alvo?.id) return;
    const destino = alvo.setor_destino_aprovacao
      || alvo.setor_destino_pos_aprovacao
      || 'a área responsável';

    const { ok } = await confirmar({
      titulo: 'Aprovar pela diretoria',
      mensagem: `Aprovar a solicitação ${alvo.codigo} (${alvo.tipo?.nome || 'sem tipo'}), no valor de `
        + `${formatarMoedaLocal(alvo.valor)}, e enviá-la para ${destino}? `
        + 'A aprovação fica registrada em seu nome no histórico.',
      rotuloConfirmar: 'Aprovar e enviar'
    });
    if (!ok) return;

    try {
      await aprovarDiretoriaSolicitacao(alvo.id);
      registrarMutacaoLocal(alvo.id);
      await carregar({ silent: true });
      avisar.sucesso(`Solicitação ${alvo.codigo} aprovada pela diretoria e enviada para ${destino}.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao aprovar solicitacao pela diretoria');
    }
  }

  async function salvarPendenciaFinanceira() {
    // R26: registro e conteúdo do formulário fixados antes do await.
    const alvo = solicitacao;
    const pendenciaAlvo = pendenciaFinanceira;
    if (!alvo?.id) return;
    try {
      setSalvandoPendenciaFinanceira(true);
      await atualizarPendenciaFinanceiraSolicitacao(alvo.id, pendenciaAlvo);
      registrarMutacaoLocal(alvo.id);
      await carregar({ silent: true });
      avisar.sucesso(pendenciaAlvo.marcar
        ? `Pendência registrada para auditoria na solicitação ${alvo.codigo}.`
        : `Pendência da solicitação ${alvo.codigo} marcada como regularizada.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao registrar pendencia financeira');
    } finally {
      setSalvandoPendenciaFinanceira(false);
    }
  }

  function abrirModalApropriacoes() {
    setApropriacaoPrincipalId(solicitacao?.apropriacao_id ? String(solicitacao.apropriacao_id) : '');
    setRateiosApropriacao(normalizarRateiosSolicitacao(solicitacao));
    setMotivoApropriacoes('');
    setModalApropriacoesAberto(true);
  }

  function fecharModalApropriacoes() {
    if (salvandoApropriacoes) return;
    setModalApropriacoesAberto(false);
  }

  function atualizarRateioApropriacao(index, campo, valor) {
    setRateiosApropriacao((atuais) => (
      atuais.map((item, i) => (i === index ? { ...item, [campo]: valor } : item))
    ));
  }

  function adicionarRateioApropriacao() {
    setRateiosApropriacao((atuais) => [
      ...atuais,
      { apropriacao_id: '', percentual: '', valor: '' }
    ]);
  }

  function removerRateioApropriacao(index) {
    setRateiosApropriacao((atuais) => (
      atuais.length <= 1 ? atuais : atuais.filter((_, i) => i !== index)
    ));
  }

  function resumoRateioApropriacao() {
    const percentual = rateiosApropriacao.reduce(
      (acc, item) => acc + parseNumeroLocal(item.percentual),
      0
    );
    const valor = rateiosApropriacao.reduce(
      (acc, item) => acc + parseNumeroLocal(item.valor),
      0
    );

    return {
      percentual,
      valor,
      usaPercentual: rateiosApropriacao.some((item) => String(item.percentual || '').trim()),
      usaValor: rateiosApropriacao.some((item) => String(item.valor || '').trim())
    };
  }

  async function salvarApropriacoesSolicitacao() {
    if (!String(motivoApropriacoes || '').trim()) {
      avisar.alerta('Informe o motivo da alteração das apropriações.');
      return;
    }

    const rateiosValidos = rateiosApropriacao
      .filter((item) => (
        String(item.apropriacao_id || '').trim() ||
        String(item.percentual || '').trim() ||
        String(item.valor || '').trim()
      ))
      .map((item) => ({
        apropriacao_id: item.apropriacao_id ? Number(item.apropriacao_id) : null,
        percentual: String(item.percentual || '').trim() ? parseNumeroLocal(item.percentual) : null,
        valor: String(item.valor || '').trim() ? parseNumeroLocal(item.valor) : null
      }));

    if (rateiosValidos.some((item) => !item.apropriacao_id)) {
      avisar.alerta('Preencha todas as apropriações do rateio.');
      return;
    }

    const resumo = resumoRateioApropriacao();
    if (resumo.usaPercentual && resumo.usaValor) {
      avisar.alerta('Use somente percentual ou somente valor em R$ no rateio.');
      return;
    }

    // R26: registro e payload fixados ANTES da confirmação — o modal não
    // congela a tela e o LiveUpdates pode trocar `solicitacao` no meio.
    const alvo = solicitacao;
    const motivoAlvo = motivoApropriacoes.trim();
    const principalAlvo = apropriacaoPrincipalId ? Number(apropriacaoPrincipalId) : null;
    if (!alvo?.id) return;

    const { ok } = await confirmar({
      titulo: 'Alterar apropriações',
      mensagem: `Regravar o rateio contábil da solicitação ${alvo.codigo}, no valor de `
        + `${formatarMoedaLocal(alvo.valor)}, em ${rateiosValidos.length} `
        + `apropriaç${rateiosValidos.length === 1 ? 'ão' : 'ões'}? `
        + 'O rateio anterior é substituído; a troca fica no histórico com o motivo informado.',
      rotuloConfirmar: 'Regravar rateio'
    });
    if (!ok) return;

    try {
      setSalvandoApropriacoes(true);
      await atualizarApropriacoesSolicitacao(alvo.id, {
        apropriacao_id: principalAlvo,
        apropriacoes_rateio: rateiosValidos,
        motivo: motivoAlvo
      });
      registrarMutacaoLocal(alvo.id);
      setModalApropriacoesAberto(false);
      await carregar({ silent: true });
      avisar.sucesso(`Apropriações da solicitação ${alvo.codigo} atualizadas.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao atualizar apropriacoes');
    } finally {
      setSalvandoApropriacoes(false);
    }
  }

  function montarItensCompraDireta() {
    const itens = Array.isArray(compraDiretaDetalhe?.itens) ? compraDiretaDetalhe.itens : [];
    const itensManuais = Array.isArray(compraDiretaDetalhe?.itensManuais) ? compraDiretaDetalhe.itensManuais : [];

    return [
      ...itens.map((item) => ({
        ...item,
        item_tipo: 'CADASTRADO',
        descricao: item?.insumo?.nome || item?.descricao || `Item #${item?.id || ''}`,
        unidade_label: item?.unidade_sigla_manual || item?.unidade?.sigla || item?.unidade?.nome || item?.unidade_sigla || ''
      })),
      ...itensManuais.map(mapearItemManualCompraDireta)
    ];
  }

  async function abrirGerenciamentoItensCompra() {
    if (!solicitacao?.id) return;

    try {
      setCarregandoCompraDireta(true);
      setItemCompraDiretaSelecionado(null);
      setRateiosCompraDireta([]);
      setMotivoCompraDireta('');
      setAcaoItemCompraDireta(podeCatalogarItensManuaisCompra ? 'CATALOGAR' : 'APROPRIAR');
      const data = await obterSolicitacaoCompraPorSolicitacao(solicitacao.id);
      if (!isCompraDiretaSolicitacao) {
        navigate(`/solicitacoes-compra/${data.id}`);
        return;
      }
      setCompraDiretaDetalhe(data || null);
      setModalCompraDiretaAberto(true);
    } catch (error) {
      console.error(error);
      avisar.erro(
        error?.code === 'COMPRA_LEGADA_SEM_ITENS_ESTRUTURADOS'
          ? 'Registro legado sem itens estruturados. Os itens precisam ser reconstruídos antes de usar o gerenciamento.'
          : error?.message || 'Erro ao carregar itens da compra'
      );
    } finally {
      setCarregandoCompraDireta(false);
    }
  }

  function fecharModalCompraDireta() {
    if (salvandoCompraDireta) return;
    setModalCompraDiretaAberto(false);
    setItemCompraDiretaSelecionado(null);
    setRateiosCompraDireta([]);
    setMotivoCompraDireta('');
    setAcaoItemCompraDireta(podeCatalogarItensManuaisCompra ? 'CATALOGAR' : 'APROPRIAR');
  }

  function selecionarItemCompraDireta(item) {
    const rateios = normalizarRateiosEntrada(item);
    setItemCompraDiretaSelecionado(item);
    setRateiosCompraDireta(rateios.length ? rateios : [criarRateioBase(item?.quantidade)]);
    setMotivoCompraDireta('');
    setAcaoItemCompraDireta(
      item?.item_tipo === 'MANUAL' && podeCatalogarItensManuaisCompra
        ? 'CATALOGAR'
        : 'APROPRIAR'
    );
  }

  async function recarregarCompraDiretaAposCatalogacao() {
    if (!solicitacao?.id) return;

    try {
      const data = await obterSolicitacaoCompraPorSolicitacao(solicitacao.id);
      setCompraDiretaDetalhe(data || null);
      const itemAtualizado = (data?.itensManuais || []).find(
        (item) => Number(item.id) === Number(itemCompraDiretaSelecionado?.id)
      );
      if (itemAtualizado) {
        selecionarItemCompraDireta(mapearItemManualCompraDireta(itemAtualizado));
      }
      registrarMutacaoLocal(solicitacao.id);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'O item foi catalogado, mas a lista nao pôde ser atualizada. Reabra os itens da compra direta.');
    }
  }

  async function cadastrarUnidadeCompraDireta() {
    const compraAlvo = Number(compraDiretaDetalhe?.id || 0);
    const itemAlvo = itemCompraDiretaSelecionado;
    const unidadeLivre = String(itemAlvo?.unidade_sigla_manual || '').trim();
    if (!compraAlvo || itemAlvo?.item_tipo !== 'CADASTRADO' || !unidadeLivre) return;

    const { ok } = await confirmar({
      titulo: 'Cadastrar unidade de medida',
      mensagem: `Cadastrar "${unidadeLivre}" no catálogo de unidades e vinculá-la somente a este item? A unidade padrão do insumo não será alterada.`,
      rotuloConfirmar: 'Cadastrar UN'
    });
    if (!ok) return;

    try {
      setSalvandoCompraDireta(true);
      const data = await cadastrarUnidadeItemSolicitacaoCompra(compraAlvo, itemAlvo.id);
      setCompraDiretaDetalhe(data || null);
      const itemAtualizado = (data?.itens || []).find((item) => Number(item.id) === Number(itemAlvo.id));
      if (itemAtualizado) {
        selecionarItemCompraDireta({
          ...itemAtualizado,
          item_tipo: 'CADASTRADO',
          descricao: itemAtualizado?.insumo?.nome || itemAtualizado?.descricao || `Item #${itemAtualizado.id}`,
          unidade_label: itemAtualizado?.unidade?.sigla || itemAtualizado?.unidade?.nome || ''
        });
      }
      registrarMutacaoLocal(solicitacao?.id);
      avisar.sucesso(`UN ${unidadeLivre} cadastrada e vinculada ao item.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao cadastrar a unidade informada no item');
    } finally {
      setSalvandoCompraDireta(false);
    }
  }

  function atualizarRateioCompraDireta(index, campo, valor) {
    setRateiosCompraDireta((atuais) => (
      atuais.map((rateio, i) => (i === index ? { ...rateio, [campo]: valor } : rateio))
    ));
  }

  function adicionarRateioCompraDireta() {
    setRateiosCompraDireta((atuais) => [...atuais, criarRateioBase('')]);
  }

  function removerRateioCompraDireta(index) {
    setRateiosCompraDireta((atuais) => (
      atuais.length <= 1 ? atuais : atuais.filter((_, i) => i !== index)
    ));
  }

  async function salvarApropriacoesCompraDireta() {
    if (!compraDiretaDetalhe?.id || !itemCompraDiretaSelecionado?.id) {
      avisar.alerta('Selecione um item para alterar.');
      return;
    }

    const itemComRateios = sincronizarItemComRateios({
      ...itemCompraDiretaSelecionado,
      apropriacoes: rateiosCompraDireta
    });
    const validacao = validarRateiosItem(itemComRateios);

    if (!validacao.ok) {
      avisar.alerta(validacao.mensagem);
      return;
    }

    const motivo = String(motivoCompraDireta || '').trim();
    if (!motivo) {
      avisar.alerta('Informe o motivo da alteração.');
      return;
    }

    // R26: o ITEM é fixado antes da confirmação. A lista lateral do modal
    // continua clicável enquanto a pergunta está aberta — sem fixar, dava
    // para perguntar sobre um item e gravar em outro.
    const compraAlvo = compraDiretaDetalhe.id;
    const itemAlvo = itemCompraDiretaSelecionado;
    const rateiosAlvo = normalizarRateiosEntrada(itemComRateios).map((rateio) => ({
      apropriacao_id: Number(rateio.apropriacao_id),
      quantidade_apropriada: parseQuantidade(rateio.quantidade_apropriada)
    }));

    const { ok } = await confirmar({
      titulo: 'Alterar apropriações do item',
      mensagem: `Regravar as apropriações do item "${itemAlvo.descricao}" `
        + `(${itemAlvo.quantidade || '-'} ${itemAlvo.unidade_label || ''}) da compra direta da `
        + `solicitação ${solicitacao?.codigo || ''} em ${rateiosAlvo.length} `
        + `apropriaç${rateiosAlvo.length === 1 ? 'ão' : 'ões'}? `
        + 'As apropriações anteriores deste item são substituídas, com auditoria.',
      rotuloConfirmar: 'Regravar apropriações'
    });
    if (!ok) return;

    try {
      setSalvandoCompraDireta(true);
      const data = await atualizarApropriacoesItemSolicitacaoCompra(
        compraAlvo,
        itemAlvo.id,
        {
          item_tipo: itemAlvo.item_tipo,
          apropriacoes: rateiosAlvo,
          motivo
        }
      );

      setCompraDiretaDetalhe(data || null);
      setItemCompraDiretaSelecionado(null);
      setRateiosCompraDireta([]);
      setMotivoCompraDireta('');
      registrarMutacaoLocal(solicitacao?.id);
      avisar.sucesso(`Apropriações do item "${itemAlvo.descricao}" atualizadas com auditoria.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao atualizar apropriacoes do item');
    } finally {
      setSalvandoCompraDireta(false);
    }
  }

  useLiveUpdateSubscription({
    enabled: !!id,
    filter: (payload) => (
      String(payload?.entity || '').toUpperCase() === 'SOLICITACAO' &&
      Number(payload?.record_id || 0) === Number(id || 0)
    ),
    onEvent: async (payload) => {
      if (eventoFoiTratadoLocalmente(payload)) {
        return;
      }

      const action = String(payload?.action || '').trim().toUpperCase();
      if (action === 'DELETED') {
        navigate('/solicitacoes');
        return;
      }

      await carregar({ silent: true });
    },
    fallbackRefresh: () => carregar({ silent: true }),
    fallbackMs: 45 * 1000
  });

  // B5: nem o "Carregando" fica solto sobre o canvas — a tela já nasce com
  // faixa fixa e superfície, e a seta de voltar existe antes do dado chegar.
  if (loading) {
    return (
      <Pagina className="sol-detail-page">
        <PageHeader
          titulo="Solicitação"
          descricao="Carregando o registro..."
          voltar={{ to: '/solicitacoes', title: 'Voltar para solicitações' }}
        />
        <Avisos avisos={avisos} aoFechar={fecharAviso} />
        <BlocoConteudo>Carregando...</BlocoConteudo>
      </Pagina>
    );
  }
  if (!solicitacao) return null;

  const usaFluxoAprovacaoDiretoria = Boolean(
    solicitacao.usa_fluxo_aprovacao_diretoria ??
    (
      solicitacao.fluxo_aprovacao_diretoria &&
      !solicitacao.aprovada_diretoria_em &&
      solicitacao.diretoria_fluxo_codigo
    )
  );
  const podeAprovarDiretoria = Boolean(
    podeInteragirSolicitacao && (
      solicitacao.acao_aprovar_diretoria_disponivel ??
      (
        solicitacao.fluxo_aprovacao_diretoria &&
        !solicitacao.aprovada_diretoria_em &&
        (isSuperadmin || solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user))
      )
    )
  );
  const podeEnviarSetor =
    podeInteragirSolicitacao &&
    !usaFluxoAprovacaoDiretoria &&
    !isSetorObra &&
    (
      isSuperadmin ||
      podeEnviarQualquerSetor ||
      solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user)
    );
  const podeAlterarStatus =
    podeInteragirSolicitacao && (
      isSuperadmin ||
      podeAlterarStatusQualquerSetor ||
      solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user)
    );
  const podeMarcarPendenciaFinanceira = podeInteragirSolicitacao && (isSuperadmin || isSetorGeo || isSetorFinanceiro);

  const atualizadoEm = new Date(solicitacao.updatedAt || solicitacao.createdAt).toLocaleString('pt-BR');

  // Setor do último STATUS_ALTERADO — o badge diz de qual setor é o estado.
  const historicosDoRegistro = Array.isArray(solicitacao.historicos) ? solicitacao.historicos : [];
  const ultimoHistoricoStatus = [...historicosDoRegistro]
    .filter((item) => item?.acao === 'STATUS_ALTERADO')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const setorStatusAtual = ultimoHistoricoStatus?.setor || solicitacao.area_responsavel || null;

  // C4: o título da faixa é a IDENTIFICAÇÃO do registro — código E tipo.
  // Número sem nome é defeito; o número do contrato entra quando existe.
  const numeroContratoCabecalho = String(
    solicitacao.codigo_contrato || solicitacao.contrato?.codigo || ''
  ).trim().replace(/^CT-\s*/i, '');
  const tituloRegistro = [
    solicitacao.codigo || `#${solicitacao.id}`,
    solicitacao.tipo?.nome || 'Solicitação',
    contratoDoFluxo && numeroContratoCabecalho && numeroContratoCabecalho !== '-'
      ? numeroContratoCabecalho
      : null
  ].filter(Boolean).join(' · ');
  const apoioRegistro = apoioDoRegistro(solicitacao, contratoDoFluxo);

  // Ação principal por setor+estado — compartilhada pelo cabeçalho e pela
  // barra fixa do mobile. Catálogo restrito a handlers que JÁ existem.
  const rolarAte = (idAlvo) => () => {
    document.getElementById(idAlvo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const catalogoAcoes = {
    alterar_status: { rotulo: 'Alterar status', disponivel: podeAlterarStatus, executar: () => setModalStatus(true) },
    enviar_setor: { rotulo: 'Enviar para outro setor', disponivel: podeEnviarSetor, executar: () => setModalEnviarSetor(true) },
    aprovar_diretoria: { rotulo: 'Aprovar e enviar', disponivel: podeAprovarDiretoria, executar: aprovarDiretoria },
    gerar_titulo: { rotulo: 'Gerar conta', disponivel: isFinanceiro && podeAcessarModuloFinanceiro, executar: rolarAte('sol-detail-financeiro') },
    // O card Pagamentos saiu do detalhe (a função vive no card Financeiro);
    // "informar_pagamento" leva ao mesmo destino para mapeamentos antigos.
    informar_pagamento: { rotulo: 'Informar pagamento', disponivel: isFinanceiro && podeAcessarModuloFinanceiro, executar: rolarAte('sol-detail-financeiro') },
    registrar_medicao: { rotulo: 'Registrar medição', disponivel: solicitacaoEhContrato, executar: rolarAte('sol-detail-contrato-acoes') }
  };
  const acaoPrincipalResolvida = (() => {
    const mapeada = resolverAcaoPrincipal(
      mapeamentosAcaoPrincipal,
      solicitacao.area_responsavel,
      solicitacao.status_global
    );
    if (!mapeada) return null;
    const acao = catalogoAcoes[mapeada.acao];
    if (!acao || !acao.disponivel) return null;
    return { acao: mapeada.acao, rotulo: mapeada.rotulo || acao.rotulo, executar: acao.executar };
  })();

  /*
    BARRA DE AÇÕES DA FAIXA (C5/C6): um primário sólido, secundários em
    contorno, nada de navegação para outra tela. As três ações são as
    mesmas de antes — "Alterar status", "Enviar para outro setor" e a ação
    mapeada por setor+estado. Quando há ação mapeada, ela é a primária e as
    outras duas viram secundárias (antes iam para um menu "⋯" escrito à mão
    dentro do Header).
  */
  const acoesSecundarias = [
    podeAlterarStatus && acaoPrincipalResolvida?.acao !== 'alterar_status'
      ? { rotulo: 'Alterar status', onClick: () => setModalStatus(true) }
      : null,
    podeEnviarSetor && acaoPrincipalResolvida?.acao !== 'enviar_setor'
      ? { rotulo: 'Enviar para outro setor', onClick: () => setModalEnviarSetor(true) }
      : null,
    !acaoPrincipalResolvida && podeAprovarDiretoria
      ? { rotulo: 'Aprovar e enviar', onClick: aprovarDiretoria }
      : null
  ].filter(Boolean);

  // ----- LAYOUT CONFIGURÁVEL: resolução usuário → setor → padrão --------
  const {
    ordem: ordemResolvida,
    ocultos: blocosOcultos,
    recolhidos: recolhidosResolvidos,
    larguras: largurasBlocos,
    historicoOrdem
  } = resolverLayoutDetalhe({ configSetor: layoutSetor, prefsUsuario: prefsLayoutUsuario });

  /*
    Regra de organização do cliente aplicada SÓ ao padrão: histórico,
    conversa e auditoria vão para o fim; só a auditoria nasce recolhida
    (07/09 — ver a nota da `BLOCOS_QUE_NASCEM_RECOLHIDOS`). Quem já
    declarou ordem (usuário ou admin do setor) mantém a dele — mudar o
    arranjo de quem escolheu seria trocar a decisão da pessoa por uma
    regra genérica. Recolher é reversível e persiste no clique.
  */
  const usuarioDeclarouOrdem = Boolean(prefsLayoutUsuario?.ordem?.length);
  const setorDeclarouOrdem = Array.isArray(layoutSetor) && layoutSetor.length > 0;
  const ordemBlocos = (usuarioDeclarouOrdem || setorDeclarouOrdem)
    ? ordemResolvida
    : [
      ...ordemResolvida.filter((blocoId) => !BLOCOS_DE_REGISTRO.includes(blocoId)),
      ...ordemResolvida.filter((blocoId) => BLOCOS_DE_REGISTRO.includes(blocoId))
    ];

  const usuarioDeclarouRecolhidos = Array.isArray(prefsLayoutUsuario?.recolhidos);
  const blocosRecolhidos = usuarioDeclarouRecolhidos
    ? recolhidosResolvidos
    : new Set([...recolhidosResolvidos, ...BLOCOS_QUE_NASCEM_RECOLHIDOS]);

  const temCamadaUsuario = (novo) => Boolean(
    novo && (
      novo.ordem?.length || novo.recolhidos?.length || novo.removidos?.length
      || novo.adicionados?.length
      || Object.keys(novo.larguras || {}).length || novo.historico_ordem === 'desc'
    )
  );
  const persistirLayoutUsuario = (novo) => {
    setPrefsLayoutUsuario(temCamadaUsuario(novo) ? novo : null);
    salvarListaPreferencias('detalhe-solicitacao', novo || {}).catch(() => {});
  };
  // Sempre grava a camada completa — mudar uma coisa não perde as outras.
  const camadaAtual = () => ({
    ordem: prefsLayoutUsuario?.ordem?.length ? ordemBlocos : [],
    recolhidos: Array.from(blocosRecolhidos),
    removidos: Array.from(blocosOcultos),
    larguras: { ...largurasBlocos },
    historico_ordem: historicoOrdem
  });
  /*
    AS SEIS FUNÇÕES DE MUTAÇÃO SAÍRAM DAQUI (05/09).

    `moverBloco`, `alternarBlocoRecolhido`, `removerBloco`,
    `readicionarBloco`, `definirLarguraBloco` e o `restaurarPadraoSetor`
    existiam palavra por palavra na Home também. Elas agora vivem UMA vez,
    no `BlocosPersonalizaveis`, que devolve a camada de BLOCOS inteira; o
    que sobrou aqui é o que é DO DETALHE e não é bloco — a ordem do
    histórico, que continua a viajar na mesma preferência.
  */
  const persistirArranjoBlocos = (camada) => {
    persistirLayoutUsuario(camada ? { ...camada, historico_ordem: historicoOrdem } : null);
  };
  const definirOrdemHistorico = (ordem) => {
    persistirLayoutUsuario({ ...camadaAtual(), historico_ordem: ordem === 'desc' ? 'desc' : 'asc' });
  };
  const restaurarPadraoSetor = () => {
    persistirLayoutUsuario(null);
  };

  const aoRecarregarSilencioso = () => {
    registrarMutacaoLocal(id);
    void carregar({ silent: true });
  };

  // Cada bloco: condições de permissão/tipo continuam decidindo se PODE
  // aparecer; a configuração decide onde e se aparece quando pode.
  const conteudoBlocos = {
    apropriacoes: podeEditarApropriacoesSolicitacaoNormal ? (
      <BlocoConteudo
        titulo="Apropriações da solicitação"
        variante="secundario"
        descricao="Ajuste a apropriação principal ou o rateio do contrato com motivo e auditoria."
        acoes={(
          <button type="button" className="btn btn-outline btn-sm" onClick={abrirModalApropriacoes}>
            Editar apropriações
          </button>
        )}
      />
    ) : null,

    itens_compra_direta: podeGerenciarItensCompra ? (
      <BlocoConteudo
        titulo={isCompraDiretaSolicitacao ? 'Itens da compra direta' : 'Itens da solicitação de compra'}
        variante="secundario"
        descricao={!isCompraDiretaSolicitacao
          ? 'Abra o gerenciamento completo para revisar quantidades, apropriações e itens manuais.'
          : podeCatalogarItensManuaisCompra
          ? 'Trate os itens manuais para reutiliza-los em novas compras, mantendo o registro original.'
          : 'Ajuste as apropriacoes item por item, com motivo e auditoria.'}
        acoes={(
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={abrirGerenciamentoItensCompra}
            disabled={carregandoCompraDireta}
          >
            {carregandoCompraDireta ? 'Carregando itens...' : 'Gerenciar itens'}
          </button>
        )}
      />
    ) : null,

    rateio_contrato: solicitacaoEhContrato ? (
      <ApropriacoesDoContrato
        contrato={contratoDoFluxo}
        podeEditar={podeInteragirSolicitacao && podeEditarApropriacoes}
        onMudou={aoRecarregarSilencioso}
      />
    ) : null,

    // ITEM 26 (23/08): os termos aditivos, com Aprovar, Rejeitar e Cancelar. Fica ANTES da barra
    // de acoes do contrato porque um aditivo pendente e uma decisao que trava o contrato: quem
    // abre a tela precisa ver que ha algo esperando por ele. O card se oculta sozinho quando o
    // contrato nao tem aditivo, que e a maioria.
    aditivos_contrato: solicitacaoEhContrato ? (
      <AditivosDoContrato
        contrato={contratoSomenteLeitura}
        onMudou={aoRecarregarSilencioso}
      />
    ) : null,

    acoes_contrato: (solicitacaoEhContrato || falhaContrato) ? (
      <>
        {falhaContrato && (
          <div className="app-alert app-alert--warning" data-testid="falha-contrato">
            {falhaContrato} As previsoes de parcela e as acoes do contrato dependem deste acesso.
          </div>
        )}
        <div id="sol-detail-contrato-acoes">
          <AcoesContrato contrato={contratoSomenteLeitura} onMudou={aoRecarregarSilencioso} />
        </div>
      </>
    ) : null,

    aprovacao_diretoria: podeAprovarDiretoria ? (
      <BlocoConteudo
        titulo="Aprovação por diretoria"
        variante="secundario"
        descricao={`Ao aprovar, a solicitação segue para ${solicitacao.setor_destino_aprovacao || solicitacao.setor_destino_pos_aprovacao || 'a area responsavel'}.`}
        acoes={(
          <button type="button" className="btn btn-primary btn-sm" onClick={aprovarDiretoria}>
            Aprovar e enviar
          </button>
        )}
      />
    ) : null,

    historico: (
      <Timeline
        ordem={historicoOrdem}
        aoMudarOrdem={definirOrdemHistorico}
        historicos={solicitacao.historicos || []}
        canRemoveAnexo={podeInteragirSolicitacao && canDeleteSolicitacaoAnexo(user)}
        canRemoveComentario={podeInteragirSolicitacao && String(user?.perfil || '').trim().toUpperCase() === 'SUPERADMIN'}
        onAnexoRemovido={aoRecarregarSilencioso}
      />
    ),

    financeiro: isFinanceiro ? (
      <div id="sol-detail-financeiro">
        <FinanceiroCard
          key={`financeiro-${id}-${statusDependenciasVersao}`}
          solicitacao={solicitacao}
          podeAcessarModuloFinanceiro={podeAcessarModuloFinanceiro}
          podeVisualizarTitulos={isFinanceiro}
          somenteLeitura={isSetorObra}
          onSolicitacaoAtualizada={() => {
            registrarMutacaoLocal(id);
            return carregar({ silent: true });
          }}
          onTituloCriado={aoRecarregarSilencioso}
        />
      </div>
    ) : null,

    // Comentar e anexar num ato só (dá para anexar sem escrever).
    conversa: (
      <Conversa
        solicitacaoId={id}
        podeInteragir={podeInteragirSolicitacao}
        motivoBloqueio={contextoInteracao?.motivo_bloqueio}
        onSucesso={aoRecarregarSilencioso}
      />
    ),

    auditoria: podeMarcarPendenciaFinanceira ? (
      !auditoriaAberta ? (
        <button
          type="button"
          className="btn btn-outline btn-sm self-start"
          onClick={() => setAuditoriaAberta(true)}
        >
          Registrar pendência de auditoria
        </button>
      ) : (
        <BlocoConteudo
          titulo="Auditoria de prazo e documentos"
          variante="secundario"
          descricao="Registre solicitações enviadas fora do prazo ou sem nota/boleto para medir regularizacao por usuário."
          acoes={(
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setAuditoriaAberta(false)}>
              Recolher auditoria
            </button>
          )}
        >
          <FormSecao colunas={2}>
            {/* `CampoForm` já é um <label>: aninhar outro aqui produziria
                label dentro de label (HTML inválido, e o clique deixaria de
                alcançar a caixa). O <span> é só o arranjo. */}
            <CampoForm label="Pendência" linha>
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={pendenciaFinanceira.marcar}
                  onChange={(event) => setPendenciaFinanceira((prev) => ({
                    ...prev,
                    marcar: event.target.checked
                  }))}
                />
                Marcar pendência para auditoria
              </span>
            </CampoForm>

            <CampoForm label="Tipo">
              {/* Entrada de dado, não filtro — uso que a R12 mantém legítimo. */}
              <select
                className="input"
                value={pendenciaFinanceira.tipo}
                onChange={(event) => setPendenciaFinanceira((prev) => ({
                  ...prev,
                  tipo: event.target.value
                }))}
                disabled={!pendenciaFinanceira.marcar}
              >
                <option value="FORA_DO_PRAZO">Enviada fora do prazo</option>
                <option value="SEM_NOTA">Sem nota até o vencimento</option>
                <option value="SEM_BOLETO">Sem boleto até o vencimento</option>
                <option value="SEM_NOTA_E_BOLETO">Sem nota e boleto</option>
                <option value="OUTRO">Outro</option>
              </select>
            </CampoForm>

            <CampoForm label="Observação" tipo="observacao">
              <textarea
                className="input"
                value={pendenciaFinanceira.observacao}
                onChange={(event) => setPendenciaFinanceira((prev) => ({
                  ...prev,
                  observacao: event.target.value
                }))}
                placeholder="Ex.: nota enviada após vencimento, boleto ausente, prazo regularizado..."
              />
            </CampoForm>
          </FormSecao>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={salvarPendenciaFinanceira}
              disabled={salvandoPendenciaFinanceira}
            >
              {salvandoPendenciaFinanceira ? 'Salvando...' : 'Salvar auditoria'}
            </button>
          </div>
        </BlocoConteudo>
      )
    ) : null
  };

  const blocosVisiveis = ordemBlocos
    .filter((blocoId) => !blocosOcultos.has(blocoId))
    .map((blocoId) => ({ id: blocoId, conteudo: conteudoBlocos[blocoId] }))
    .filter((bloco) => bloco.conteudo);

  const ABA_DO_BLOCO = {
    apropriacoes: 'detalhes',
    itens_compra_direta: 'detalhes',
    rateio_contrato: 'detalhes',
    aditivos_contrato: 'detalhes',
    acoes_contrato: 'detalhes',
    aprovacao_diretoria: 'detalhes',
    conversa: 'conversa',
    financeiro: 'financeiro',
    auditoria: 'financeiro',
    historico: 'historico'
  };
  const ABAS_MOBILE = [
    { id: 'detalhes', rotulo: 'Detalhes' },
    { id: 'conversa', rotulo: 'Conversa' },
    { id: 'financeiro', rotulo: 'Financeiro' },
    { id: 'historico', rotulo: 'Histórico' }
  ];

  /*
    O DESENHO DO ARRANJO TAMBÉM SAIU (05/09): a barra por bloco, o
    popover "Adicionar bloco", os segmentos de largura e o bloco recolhido
    virando uma linha "— mostrar" eram markup copiado entre esta tela e a
    Home. Agora é o `BlocosPersonalizaveis` quem desenha, com as classes
    DESTA tela (`classes` abaixo) para o `columns: 2` do detalhe continuar
    o que sempre foi — a grade neutra do componente é a da Home.
  */
  const catalogoBlocos = BLOCOS_DETALHE.map((bloco) => ({
    id: bloco.id,
    rotulo: bloco.rotulo,
    conteudo: conteudoBlocos[bloco.id]
  }));
  const arranjoBlocos = {
    ordem: ordemBlocos,
    ocultos: blocosOcultos,
    recolhidos: blocosRecolhidos,
    larguras: largurasBlocos
  };

  const resumoRateio = resumoRateioApropriacao();

  return (
    <Pagina className="sol-detail-page">
      {/*
        C3 (R11 revisto, 02/09): tela de DETALHE tem a seta de voltar à
        esquerda SEMPRE. C4: o título é a identificação do registro
        (código · tipo · nº do contrato), não um número solto.
        R5/C2: a contagem da faixa é o VALOR — o número que decide, e o
        único que acompanha a pessoa na rolagem. Por isso ele saiu da
        grade de campos: total mora na faixa, recorte mora no bloco (B3).
      */}
      <PageHeader
        titulo={tituloRegistro}
        contagem={formatarValorSolicitacao(solicitacao.valor) || undefined}
        descricao={apoioRegistro || undefined}
        voltar={{ to: '/solicitacoes', title: 'Voltar para solicitações' }}
        acaoPrincipal={acaoPrincipalResolvida
          ? { rotulo: acaoPrincipalResolvida.rotulo, onClick: acaoPrincipalResolvida.executar }
          : undefined}
        /*
          "PERSONALIZAR LAYOUT" SAIU DO "⋯" (decisão do cliente, 07/09).

          Ela era o único item do menu desta tela: um botão que só revelava
          outro botão. O menu saiu do sistema e ela é secundária VISÍVEL da
          faixa, ao lado das outras. Medido a 1920, 1366 e 390 no pior caso
          desta tela (principal + duas secundárias + esta): uma linha nas
          duas primeiras larguras, duas a 390, sem rótulo cortado.

          `pressionada` vai junto porque a ação tem ESTADO (liga/desliga o
          modo) — sem ela, quem usa leitor de tela deixa de saber se o modo
          está ligado. Continua fora do celular: lá o modo não arranja nada
          (largura e arrasto são do desktop).
        */
        secundarias={[
          ...acoesSecundarias,
          !isMobileDetalhe ? {
            rotulo: personalizando ? 'Concluir personalização' : 'Personalizar layout',
            pressionada: personalizando,
            onClick: () => setPersonalizando((atual) => !atual)
          } : null
        ].filter(Boolean)}
      />

      <Avisos avisos={avisos} aoFechar={fecharAviso} />

      {/* O que TRAVA a decisão vem antes de qualquer dado: pedido de
          retorno da Obra e falha de acesso ao contrato. */}
      <RetornoSolicitacaoBar
        solicitacao={solicitacao}
        onMudou={() => carregar({ silent: true })}
      />

      {/* A resposta imediata: em que pé está, com quem, para quando.
          Os três ladrilhos vinham do cabeçalho antigo (Status, Setor,
          Data Resposta/Pagamento) e da linha de breadcrumb ("Atualizado
          em"), que era texto solto sobre o canvas — B5. */}
      <StatGrid colunas={4}>
        <StatTile
          label="Status"
          valor={<StatusBadge status={solicitacao.status_global} setor={setorStatusAtual} />}
        />
        <StatTile label="Setor responsável" valor={solicitacao.area_responsavel || '—'} />
        <StatTile
          label="Data Resposta/Pagamento"
          valor={formatarDataLocalPtBr(solicitacao.data_vencimento) || '—'}
        />
        <StatTile label="Atualizado em" valor={atualizadoEm} />
      </StatGrid>

      {/* Bloco principal, largura total: o que ESTE registro é. */}
      <Header
        solicitacao={solicitacao}
        contratoDoFluxo={contratoDoFluxo}
        mostrarContratoInfo={moduloContratosHabilitado}
      />

      {isRecargaCartaoSolicitacao && (
        <RecargaCartaoDetalhe
          key={`recarga-${id}-${statusDependenciasVersao}`}
          solicitacaoId={id}
          podeInteragir={podeInteragirSolicitacao}
        />
      )}

      {/* Barra fixa do mobile: a ação principal sempre visível. */}
      {isMobileDetalhe && (acaoPrincipalResolvida || podeAlterarStatus) && (
        <div className="sol-detail-acao-fixa">
          {acaoPrincipalResolvida ? (
            <button type="button" className="btn btn-primary w-full" onClick={acaoPrincipalResolvida.executar}>
              {acaoPrincipalResolvida.rotulo}
            </button>
          ) : (
            <button type="button" className="btn btn-primary w-full" onClick={() => setModalStatus(true)}>
              Alterar status
            </button>
          )}
        </div>
      )}

      {isMobileDetalhe ? (
        <>
          <div className="sol-detail-abas" role="tablist" aria-label="Seções do detalhe">
            {ABAS_MOBILE.map((aba) => (
              <button
                key={aba.id}
                type="button"
                role="tab"
                aria-selected={abaMobile === aba.id}
                className={`sol-detail-aba ${abaMobile === aba.id ? 'ativa' : ''}`}
                onClick={() => setAbaMobile(aba.id)}
              >
                {aba.rotulo}
              </button>
            ))}
          </div>
          {/* No celular o catálogo entregue ao componente é só o da ABA: o
              arranjo continua sendo o mesmo (a ordem e os blocos mantidos
              valem aqui), mas quem não é desta aba não entra no desenho. */}
          <BlocosPersonalizaveis
            blocos={catalogoBlocos.filter((bloco) => ABA_DO_BLOCO[bloco.id] === abaMobile)}
            arranjo={arranjoBlocos}
            preferenciasBrutas={prefsLayoutUsuario}
            aoMudarArranjo={persistirArranjoBlocos}
            aoRestaurar={restaurarPadraoSetor}
            personalizando={false}
            classes={{
              arranjo: 'sol-detail-arranjo',
              colunas: 'sol-detail-blocos sol-detail-blocos--mobile',
              segmentoTotal: 'sol-detail-segmento-total',
              bloco: 'sol-detail-bloco'
            }}
          />
          {blocosVisiveis.filter((bloco) => ABA_DO_BLOCO[bloco.id] === abaMobile).length === 0 && (
            <BlocoConteudo variante="secundario">
              Nada nesta aba para esta solicitação.
            </BlocoConteudo>
          )}
        </>
      ) : (
        <BlocosPersonalizaveis
          blocos={catalogoBlocos}
          arranjo={arranjoBlocos}
          preferenciasBrutas={prefsLayoutUsuario}
          aoMudarArranjo={persistirArranjoBlocos}
          aoRestaurar={restaurarPadraoSetor}
          rotuloRestaurar="Restaurar padrão do setor"
          /* O modo é ligado pelo botão "Personalizar layout" da faixa (ação
             SOBRE ESTA TELA — R11/C6), então ele é controlado daqui e a
             entrada própria do componente não aparece: dois botões para a
             mesma coisa seriam dois donos. */
          personalizando={personalizando}
          aoAlternarPersonalizando={(ligado) => setPersonalizando(ligado)}
          /*
            A ORDEM DO HISTÓRICO SAIU DAQUI (07/09).

            Ela morava nesta barra porque é preferência DESTA tela e não é
            bloco. Só que esta barra só existe em modo de personalização —
            que por sua vez nascia atrás do "⋯" da faixa. Eram dois cliques
            e um modo inteiro para inverter a leitura de uma lista.

            Agora ela é `controles` do próprio bloco Histórico
            (`Timeline.jsx`), ao lado do título, no lugar onde antes havia
            só o TEXTO dizendo a ordem. Um dono, no bloco que ela governa —
            manter uma cópia aqui seria o segundo dono.
          */
          classes={{
            arranjo: 'sol-detail-arranjo',
            colunas: 'sol-detail-blocos',
            segmentoTotal: 'sol-detail-segmento-total',
            bloco: 'sol-detail-bloco'
          }}
        />
      )}

      <ModalAlterarStatus
        aberto={modalStatus}
        setor={setorParaStatus}
        onClose={() => setModalStatus(false)}
        onSalvar={salvarStatus}
      />

      {modalEnviarSetor && podeEnviarSetor && (
        <ModalEnviarSetor
          solicitacaoId={solicitacao.id}
          onClose={() => setModalEnviarSetor(false)}
          onSucesso={() => {
            registrarMutacaoLocal(solicitacao.id);
            void carregar({ silent: true });
          }}
        />
      )}

      {/*
        R27: a casca é o `OverlayModal` — corpo rolante e rodapé fixo são
        do componente. O painel escrito à mão tinha `overflow-hidden` (R18)
        e larguras em pixel na classe (R10); o rodapé com "Salvar
        apropriações" dependia de a tela lembrar de rolar o corpo.
      */}
      {modalApropriacoesAberto && (
        <OverlayModal rotulo="Editar apropriações" onFechar={fecharModalApropriacoes}>
          <div data-modal="cabecalho" className="app-bloco-head">
            <h2 className="app-bloco-titulo">Editar apropriações</h2>
            <span className="app-bloco-acoes">
              <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalApropriacoes}>
                Fechar
              </button>
            </span>
          </div>
          <p className="app-bloco-lead" title="A alteração não muda a visibilidade da solicitação e fica registrada no histórico.">
            A alteração não muda a visibilidade da solicitação e fica registrada no histórico.
          </p>

          <FormSecao colunas={2}>
            <CampoForm label="Apropriação principal" linha>
              <ApropriacaoAutocomplete
                value={apropriacaoPrincipalId}
                options={apropriacoesCatalogo}
                onChange={setApropriacaoPrincipalId}
                placeholder="Digite para buscar a apropriação"
              />
            </CampoForm>
          </FormSecao>

          <BlocoConteudo
            titulo="Rateio do contrato"
            variante="secundario"
            descricao="Use percentual ou valor em R$. Não misture os dois critérios na mesma alteração."
            acoes={(
              <button type="button" className="btn btn-outline btn-sm" onClick={adicionarRateioApropriacao}>
                Adicionar linha
              </button>
            )}
          >
            {rateiosApropriacao.map((rateio, index) => (
              <FormSecao key={`rateio-solicitacao-${index}`} colunas={4}>
                <CampoForm label="Apropriação" span={2}>
                  <ApropriacaoAutocomplete
                    value={rateio.apropriacao_id}
                    options={apropriacoesCatalogo}
                    onChange={(valor) => atualizarRateioApropriacao(index, 'apropriacao_id', valor)}
                    placeholder="Buscar apropriação"
                  />
                </CampoForm>
                <CampoForm label="Percentual">
                  <input
                    className="input"
                    value={rateio.percentual}
                    onChange={(event) => atualizarRateioApropriacao(index, 'percentual', event.target.value)}
                    placeholder="%"
                    inputMode="decimal"
                  />
                </CampoForm>
                <CampoForm label="Valor R$">
                  <input
                    className="input input-moeda"
                    value={rateio.valor}
                    onChange={(event) => atualizarRateioApropriacao(index, 'valor', event.target.value)}
                    placeholder="Valor R$"
                    inputMode="decimal"
                  />
                </CampoForm>
                <CampoForm label="&nbsp;">
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={() => removerRateioApropriacao(index)}
                    disabled={rateiosApropriacao.length <= 1}
                  >
                    Remover
                  </button>
                </CampoForm>
              </FormSecao>
            ))}

            <StatGrid colunas={3}>
              <StatTile label="Percentual informado" valor={`${resumoRateio.percentual.toFixed(4)}%`} />
              <StatTile label="Valor informado" valor={formatarMoedaLocal(resumoRateio.valor)} />
              <StatTile label="Valor da solicitação" valor={formatarMoedaLocal(solicitacao?.valor)} />
            </StatGrid>
          </BlocoConteudo>

          <FormSecao colunas={2}>
            <CampoForm label="Motivo da alteração" obrigatorio tipo="observacao">
              <textarea
                className="input"
                value={motivoApropriacoes}
                onChange={(event) => setMotivoApropriacoes(event.target.value)}
                placeholder="Explique por que a apropriação foi alterada."
              />
            </CampoForm>
          </FormSecao>

          <div data-modal="rodape" className="app-actionbar">
            <button type="button" className="btn btn-outline" onClick={fecharModalApropriacoes}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={salvarApropriacoesSolicitacao}
              disabled={salvandoApropriacoes}
            >
              {salvandoApropriacoes ? 'Salvando...' : 'Salvar apropriacoes'}
            </button>
          </div>
        </OverlayModal>
      )}

      {modalCompraDiretaAberto && (
        <OverlayModal
          rotulo="Itens da compra direta"
          largura="var(--modal-max-w-xl, 1120px)"
          onFechar={fecharModalCompraDireta}
        >
          <div
            data-modal="cabecalho"
            className="app-bloco-head border-b border-[var(--c-border)] px-4 py-3 sm:px-6"
          >
            <h2 className="app-bloco-titulo">Itens da compra direta</h2>
            <span className="app-bloco-acoes">
              <button type="button" className="btn btn-outline btn-sm" onClick={fecharModalCompraDireta}>
                Fechar
              </button>
            </span>
          </div>
          {/*
            O OverlayModal separa cabecalho e corpo para manter a rolagem.
            Este modal nasceu antes dessa separacao e dependia do padding do
            card externo; depois da padronizacao, lista e painel ficaram
            colados nas bordas e o workspace encolhia ate parecer cortado.
          */}
          <div className="min-w-0 p-4 sm:p-6">
            <p
              className="app-bloco-lead app-bloco-lead--integral"
              title="Selecione um item para catalogar, cadastrar sua unidade ou corrigir as apropriações."
            >
              Selecione um item para catalogar, cadastrar sua unidade ou corrigir as apropriações.
            </p>

            <div className="mt-4 flex min-w-0 flex-col gap-4 md:flex-row md:items-stretch">
              {/* A medida do painel lateral mora na classe, não na tela (R10). */}
              <div className="app-painel-lateral flex min-h-0 flex-col gap-2">
                <h3 className="app-bloco-titulo">Itens</h3>
                {montarItensCompraDireta().length === 0 ? (
                  <BlocoConteudo variante="secundario">
                    Nenhum item localizado para esta compra direta.
                  </BlocoConteudo>
                ) : (
                  montarItensCompraDireta().map((item) => {
                    const selecionado =
                      itemCompraDiretaSelecionado?.id === item.id &&
                      itemCompraDiretaSelecionado?.item_tipo === item.item_tipo;
                    const resumoApropriacao = montarLinhasResumoApropriacao(item, apropriacoesCatalogo).join(' | ') || '-';

                    return (
                      <button
                        key={`${item.item_tipo}-${item.id}`}
                        type="button"
                        className={`btn w-full shrink-0 justify-start text-left ${selecionado ? 'btn-primary' : 'btn-outline'}`}
                        aria-pressed={selecionado}
                        onClick={() => selecionarItemCompraDireta(item)}
                      >
                        <span className="flex min-w-0 flex-col gap-1">
                          <span className="break-words font-semibold">{item.descricao}</span>
                          <span className="text-xs text-muted">
                            Qtd.: {item.quantidade || '-'} {item.unidade_label || ''}
                          </span>
                          <span className="text-xs text-muted">
                            {item.item_tipo === 'MANUAL'
                              ? (item.insumo_catalogado_id ? 'Manual · catalogado' : 'Manual · pendente de cadastro')
                              : (item.unidade_sigla_manual ? 'Cadastro oficial · UN pendente' : 'Cadastro oficial')}
                          </span>
                          <span className="break-words text-xs text-muted">{resumoApropriacao}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className="min-w-0 flex-1">
              {!itemCompraDiretaSelecionado ? (
                <BlocoConteudo variante="secundario">
                  Selecione um item para ver as ações disponíveis.
                </BlocoConteudo>
              ) : (
                <BlocoConteudo
                  titulo={itemCompraDiretaSelecionado.descricao}
                  variante="secundario"
                  descricao={`Quantidade total: ${itemCompraDiretaSelecionado.quantidade || '-'} ${itemCompraDiretaSelecionado.unidade_label || ''}`}
                  acoes={(
                    <span className="flex flex-wrap gap-2" role="group" aria-label="Ação do item selecionado">
                      {itemCompraDiretaSelecionado.item_tipo === 'MANUAL' && podeCatalogarItensManuaisCompra ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${acaoItemCompraDireta === 'CATALOGAR' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setAcaoItemCompraDireta('CATALOGAR')}
                          aria-pressed={acaoItemCompraDireta === 'CATALOGAR'}
                        >
                          Catalogar item
                        </button>
                      ) : null}
                      {podeEditarItensCompraDireta ? (
                        <button
                          type="button"
                          className={`btn btn-sm ${acaoItemCompraDireta === 'APROPRIAR' ? 'btn-primary' : 'btn-outline'}`}
                          onClick={() => setAcaoItemCompraDireta('APROPRIAR')}
                          aria-pressed={acaoItemCompraDireta === 'APROPRIAR'}
                        >
                          Editar apropriações
                        </button>
                      ) : null}
                      {itemCompraDiretaSelecionado.item_tipo === 'CADASTRADO'
                        && itemCompraDiretaSelecionado.unidade_sigla_manual
                        && podeCadastrarUnidadeCompraDireta ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={cadastrarUnidadeCompraDireta}
                            disabled={salvandoCompraDireta}
                          >
                            {salvandoCompraDireta
                              ? 'Cadastrando UN...'
                              : `Cadastrar UN ${itemCompraDiretaSelecionado.unidade_sigla_manual}`}
                          </button>
                        ) : null}
                    </span>
                  )}
                >
                  {/*
                    ESCOPO DE MÓDULO APLICADO À MÃO, e preservado de propósito.

                    `compras-responsive-scope` faz a folha
                    `modules/solicitacao-compra/compras-responsive.css` (global,
                    entra pelo main.jsx) redefinir 12 classes da TOPBAR e 15
                    classes genéricas `app-*` dentro deste pedaço da tela. Tirar
                    daqui mudaria o arranjo do `TratamentoItemManual`, que foi
                    desenhado dentro dele. A folha declara, no próprio topo, que
                    as sobrescritas de `topbar-*`/`app-*` só saem junto com a
                    rodada de Compras (docs/PENDENCIAS-REGISTRADAS.md).
                  */}
                  {acaoItemCompraDireta === 'CATALOGAR' && itemCompraDiretaSelecionado.item_tipo === 'MANUAL' && podeCatalogarItensManuaisCompra ? (
                    <div className="compras-responsive-scope">
                      <TratamentoItemManual
                        item={itemCompraDiretaSelecionado}
                        solicitacaoId={compraDiretaDetalhe.id}
                        onCatalogado={() => { void recarregarCompraDiretaAposCatalogacao(); }}
                      />
                    </div>
                  ) : null}

                  {acaoItemCompraDireta === 'CATALOGAR' && itemCompraDiretaSelecionado.item_tipo !== 'MANUAL' ? (
                    <p className="text-sm text-muted">
                      Este item já pertence ao cadastro oficial de insumos e não precisa ser catalogado.
                    </p>
                  ) : null}

                  {acaoItemCompraDireta === 'APROPRIAR' && podeEditarItensCompraDireta ? (
                    <>
                      {rateiosCompraDireta.map((rateio, index) => (
                        <FormSecao key={`rateio-compra-direta-${index}`} colunas={4}>
                          <CampoForm label="Apropriação" span={2}>
                            <ApropriacaoAutocomplete
                              value={rateio.apropriacao_id}
                              options={apropriacoesCatalogo}
                              onChange={(valor) => atualizarRateioCompraDireta(index, 'apropriacao_id', valor)}
                              placeholder="Buscar apropriação"
                            />
                          </CampoForm>
                          <CampoForm label="Quantidade">
                            <input
                              className="input"
                              value={rateio.quantidade_apropriada}
                              onChange={(event) => atualizarRateioCompraDireta(index, 'quantidade_apropriada', event.target.value)}
                              placeholder="Qtd."
                              inputMode="decimal"
                            />
                          </CampoForm>
                          <CampoForm label="&nbsp;">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              onClick={() => removerRateioCompraDireta(index)}
                              disabled={rateiosCompraDireta.length <= 1}
                            >
                              Remover
                            </button>
                          </CampoForm>
                        </FormSecao>
                      ))}

                      <button type="button" className="btn btn-outline btn-sm" onClick={adicionarRateioCompraDireta}>
                        Adicionar linha
                      </button>

                      <FormSecao colunas={2}>
                        <CampoForm label="Motivo da alteração" obrigatorio tipo="observacao">
                          <textarea
                            className="input"
                            value={motivoCompraDireta}
                            onChange={(event) => setMotivoCompraDireta(event.target.value)}
                            placeholder="Explique por que a apropriação do item foi alterada."
                          />
                        </CampoForm>
                      </FormSecao>

                      <div className="app-actionbar">
                        <button
                          type="button"
                          className="btn btn-outline"
                          onClick={() => selecionarItemCompraDireta(itemCompraDiretaSelecionado)}
                          disabled={salvandoCompraDireta}
                        >
                          Desfazer alterações
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary"
                          onClick={salvarApropriacoesCompraDireta}
                          disabled={salvandoCompraDireta}
                        >
                          {salvandoCompraDireta ? 'Salvando apropriações...' : 'Salvar apropriações'}
                        </button>
                      </div>
                    </>
                  ) : null}

                  {itemCompraDiretaSelecionado.item_tipo !== 'MANUAL' && !podeEditarItensCompraDireta ? (
                    <p className="text-sm text-muted">
                      Este item já está cadastrado. Sua permissão atual é exclusiva para tratar itens manuais.
                    </p>
                  ) : null}
                </BlocoConteudo>
              )}
              </div>
            </div>
          </div>
        </OverlayModal>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
