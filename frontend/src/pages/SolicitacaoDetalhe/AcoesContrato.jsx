import { useEffect, useRef, useState } from 'react';
import {
  aprovarContratoFluxoNovo,
  cancelarSolicitacaoDoContrato,
  getCategoriasContrato,
  reenviarContratoParaAprovacao,
  rejeitarContratoFluxoNovo,
  tramitarContratoNoJuridico,
  uploadMinutaContrato
} from '../../services/contratos';
import { HiArrowDownTray, HiArrowTopRightOnSquare, HiPaperClip, HiTrash } from 'react-icons/hi2';
import ApropriacaoAutocomplete from '../../components/ui/ApropriacaoAutocomplete';
import PendingAttachmentsList from '../../components/attachments/PendingAttachmentsList';
import { uploadArquivos } from '../../services/uploads';
import { API_URL, authHeaders, fileUrl } from '../../services/api';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  useAvisos,
  useConfirmacao
} from '../../components/padrao';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../../utils/pendingAttachments';

/**
 * As acoes do contrato dentro da solicitacao (PI-16).
 *
 * O contrato do fluxo novo deixou de viver fora de Solicitacoes: ele nasce como UMA solicitacao,
 * e e por ela que as pessoas trabalham. Ate aqui o backend fazia tudo isso e nao havia por onde
 * clicar — aprovacao e Juridico so rodavam por servico.
 *
 * A barra muda conforme o estado do CONTRATO, nao o da solicitacao: o contrato e quem tem a
 * maquina de estados; a solicitacao espelha. Ler o espelho para decidir o que oferecer seria
 * inverter a fonte da verdade.
 *
 * Regra que nao pode escapar daqui: a CATEGORIA FINANCEIRA e obrigatoria para aprovar, abaixo e
 * acima do limite do Juridico. Quem abre o contrato e o usuario da obra, que nao conhece o plano
 * financeiro — a decisao e de quem aprova. O backend recusa sem ela de qualquer forma; o campo
 * aqui existe para a pessoa nao descobrir isso depois de clicar.
 *
 * ---
 *
 * ## Migracao para os componentes padrao (05/09) — o que mudou e por que
 *
 * Este arquivo concentra as decisoes de contrato: aprovar, devolver, cancelar, encaminhar ao
 * Juridico e aprovar em definitivo. Tres coisas foram acertadas na migracao, e as tres sao da
 * familia CONSENTIMENTO da DoD, nao de forma:
 *
 * 1. **Toda acao que muda o estado do contrato passa por `useConfirmacao`**, e o retorno e sempre
 *    DESESTRUTURADO (`const { ok } = await confirmar(...)`, R21). O objeto e sempre truthy: ler
 *    `const ok = await confirmar(...)` faz o "Cancelar" PROSSEGUIR — foi assim que o estorno de
 *    fechamento do RH/DP passou a estornar no botao de cancelar.
 * 2. **O alvo e fixado numa `const` ANTES do `await`** (R26). O modal do sistema nao congela a
 *    pagina: esta tela recarrega por evento (`onMudou`) e a prop `contrato` pode trocar entre a
 *    pergunta e a acao. Perguntar sobre o contrato A e aprovar o B deixa uma trilha de auditoria
 *    com consentimento VALIDO para uma acao que ninguem autorizou.
 * 3. **A mensagem cita o contrato e a consequencia**, nunca "este contrato": quem le a caixa tem
 *    de conseguir conferir o codigo e o valor sem olhar para tras.
 *
 * A JUSTIFICATIVA (motivo da devolucao / do cancelamento) continua em CAMPO DE VERDADE na tela,
 * com validacao visivel — nao em `window.prompt` e nem no `campo` do `useConfirmacao`. Ela vai
 * para a auditoria e para quem recebe a devolucao; um textarea de 3 linhas dentro de uma caixa
 * modal e o lugar errado para escrever o que outra pessoa vai ter de ler para corrigir.
 * A confirmacao vem DEPOIS do campo preenchido e repete o motivo digitado, para a pessoa ver o
 * que esta prestes a gravar.
 */

const moeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ESTADOS = {
  AGUARDANDO_APROVACAO: {
    titulo: 'Aguardando aprovação',
    ajuda: 'Ao aprovar, as previsões de parcela viram títulos financeiros com a categoria informada aqui.'
  },
  EM_ANALISE_JURIDICA: {
    titulo: 'Em analise no Jurídico',
    ajuda: 'O Jurídico avalia a documentação e monta a minuta. Nenhum título existe ainda.'
  },
  AGUARDANDO_ASSINATURA: {
    titulo: 'Necessita assinatura',
    ajuda: 'A minuta esta pronta. Anexe o contrato assinado ou confirme a assinatura pelo link e solicite a revisão final do Jurídico.'
  },
  EM_REVISAO_JURIDICA: {
    titulo: 'Em revisão no Jurídico',
    ajuda: 'O Jurídico confere o contrato assinado. E na conferência que as previsões viram títulos — não antes.'
  },
  ATIVO: {
    titulo: 'Contrato ativo',
    ajuda: 'Os títulos foram criados. Medições deste contrato aparecem aqui mesmo, sem abrir nova solicitação.'
  },
  REJEITADO: {
    titulo: 'Devolvido para ajuste',
    ajuda: 'Corrija o que foi apontado e reenvie. O contrato volta para quem devolveu.'
  }
};

export default function AcoesContrato({ contrato, onMudou }) {
  const [categorias, setCategorias] = useState([]);
  const [erroCategorias, setErroCategorias] = useState('');
  // Minuta: o Juridico entrega o documento, o link da plataforma, ou os dois (20/08).
  const [arquivoMinuta, setArquivoMinuta] = useState(null);
  const [arquivoAssinado, setArquivoAssinado] = useState(null);
  const [anexoAssinadoId, setAnexoAssinadoId] = useState(null);
  const [assinadoPeloLink, setAssinadoPeloLink] = useState(false);
  const [baixandoMinuta, setBaixandoMinuta] = useState(false);
  const [linkAssinatura, setLinkAssinatura] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [motivo, setMotivo] = useState('');
  const [comentarioReenvio, setComentarioReenvio] = useState('');
  const [arquivosReenvio, setArquivosReenvio] = useState([]);
  const [anexosReenvioIds, setAnexosReenvioIds] = useState([]);
  const [modo, setModo] = useState(null); // 'rejeitar' | 'cancelar' | 'aprovar-juridico'
  const [confirmacaoJuridica, setConfirmacaoJuridica] = useState('');
  const [ocupado, setOcupado] = useState(false);
  /*
    ERRO DE CAMPO x AVISO DE EVENTO — a fronteira que o `Avisos.jsx` declara.

    O `erro` unico de antes misturava duas coisas: "a rota recusou a aprovacao" (evento, some
    quando a pessoa fecha) e "falta a categoria financeira" (CONDICAO do formulario — fecha e o
    problema continua, porque o campo segue vazio). Condicao virada em faixa dispensavel some com
    um clique e deixa a pessoa enviar de novo sem ver o que a impedia.

    Entao: falha de rota vai para `useAvisos`; validacao de campo mora AO LADO DO CAMPO, no `erro`
    do `CampoForm`, que e onde a pessoa esta olhando quando o botao recusa.
  */
  const [erroCategoria, setErroCategoria] = useState('');
  const [erroMotivo, setErroMotivo] = useState('');
  const [erroConfirmacaoJuridica, setErroConfirmacaoJuridica] = useState('');
  const [erroReenvio, setErroReenvio] = useState('');
  const [erroMinuta, setErroMinuta] = useState('');
  const [erroAssinado, setErroAssinado] = useState('');
  const acaoEmAndamentoRef = useRef(false);
  const inputReenvioRef = useRef(null);
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const status = contrato?.status_contrato || null;
  const linkAssinaturaSeguro = (() => {
    const valor = String(contrato?.link_assinatura || '').trim();
    if (!valor) return null;
    try {
      return ['http:', 'https:'].includes(new URL(valor).protocol) ? valor : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    // O plano de contas inteiro de CONTAS A PAGAR (pedido do cliente, 20/08). Eram tres categorias
    // curadas, e classificar contrato de qualquer natureza entre elas nao dava conta.
    //
    // O erro NAO e mais engolido. A versao anterior fazia `.catch(() => setCategorias([]))`, e a
    // rota antiga exigia permissao de Configuracoes que quem aprova nao tem: o campo aparecia
    // vazio, sem "Selecione" nenhum para escolher e sem dizer por que. Foi assim que o defeito
    // chegou — e e a quarta vez nesta implantacao que um catch mudo esconde um 403.
    if (status !== 'AGUARDANDO_APROVACAO') return undefined;
    let cancelado = false;
    setErroCategorias('');
    getCategoriasContrato()
      .then((lista) => { if (!cancelado) setCategorias(lista); })
      .catch((e) => {
        if (cancelado) return;
        setCategorias([]);
        setErroCategorias(e.message || 'Nao foi possivel carregar as categorias financeiras.');
      });
    return () => { cancelado = true; };
  }, [status]);

  useEffect(() => {
    setCategoriaId(contrato?.categoria_financeira_id ? String(contrato.categoria_financeira_id) : '');
  }, [contrato?.categoria_financeira_id]);

  useEffect(() => {
    if (status === 'REJEITADO') return;
    setComentarioReenvio('');
    setArquivosReenvio([]);
    setAnexosReenvioIds([]);
    if (inputReenvioRef.current) inputReenvioRef.current.value = '';
  }, [status]);

  useEffect(() => {
    if (status === 'AGUARDANDO_ASSINATURA') return;
    setArquivoAssinado(null);
    setAnexoAssinadoId(null);
    setAssinadoPeloLink(false);
  }, [status]);

  if (!contrato?.fluxo_novo || !status) return null;

  const info = ESTADOS[status] || { titulo: status, ajuda: '' };
  const valorComAditivos = Number(contrato.valor_total) + Number(contrato.valor_aditivos || 0);

  /**
   * O que ESTE usuario pode fazer, respondido pelo backend (`contrato.permissoes`).
   *
   * Ate aqui a barra decidia so pelo `status_contrato`: o usuario da OBRA que recebia um contrato
   * devolvido via "Minuta pronta — enviar para assinatura", que e de quem tramita no Juridico. A
   * rota recusava com 403, mas so depois de a pessoa anexar o arquivo e clicar.
   *
   * Campo AUSENTE e tratado como NEGADO. O contrario — assumir liberado quando o backend nao
   * respondeu — faria uma resposta antiga ou truncada reabrir os botoes em silencio, que e
   * exatamente o modo de falha que se quer evitar.
   */
  const pode = contrato.permissoes || {};
  const podeAprovar = pode.aprovar === true;
  const podeTramitarJuridico = pode.tramitar_juridico === true;
  // Confirmar a assinatura e da ORIGEM, nao do Juridico: quando a minuta sai, a solicitacao volta
  // ao setor que pediu o contrato justamente para colher a assinatura.
  const podeConfirmarAssinatura = pode.confirmar_assinatura === true;
  const podeRejeitar = pode.rejeitar === true;
  const podeReenviar = pode.reenviar === true;
  const podeCancelar = pode.cancelar === true;

  // De quem e a vez, quando nao e desta pessoa. Sem esta linha o card ficaria so com o titulo e a
  // ajuda, e quem olhasse nao saberia se esta esperando alguem ou se a tela quebrou.
  const DONO_DA_VEZ = {
    AGUARDANDO_APROVACAO: 'a Gerencia de Processos',
    EM_ANALISE_JURIDICA: 'o Juridico',
    AGUARDANDO_ASSINATURA: 'o setor responsavel pela coleta da assinatura',
    EM_REVISAO_JURIDICA: 'o Juridico',
    REJEITADO: 'quem abriu o contrato'
  };
  const semAcaoNesteEstado = (
    (status === 'AGUARDANDO_APROVACAO' && !podeAprovar && !podeRejeitar && !podeCancelar)
    || (status === 'EM_ANALISE_JURIDICA' && !podeTramitarJuridico && !podeRejeitar && !podeCancelar)
    || (status === 'AGUARDANDO_ASSINATURA' && !podeConfirmarAssinatura && !podeCancelar)
    || (status === 'EM_REVISAO_JURIDICA' && !podeTramitarJuridico && !podeRejeitar && !podeCancelar)
    || (status === 'REJEITADO' && !podeReenviar)
  );

  async function executar(acao) {
    if (acaoEmAndamentoRef.current) return;
    acaoEmAndamentoRef.current = true;
    setOcupado(true);
    limpar();
    try {
      await acao();
      setModo(null);
      setMotivo('');
      onMudou?.();
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel concluir a acao.');
    } finally {
      acaoEmAndamentoRef.current = false;
      setOcupado(false);
    }
  }

  function adicionarArquivosReenvio(files) {
    if (anexosReenvioIds.length > 0) {
      setErroReenvio('Os arquivos desta tentativa ja foram enviados. Reenvie o contrato ou atualize a pagina para trocar os anexos.');
      return;
    }
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivosReenvio, files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    if (proximoEstado.length > 20) {
      setErroReenvio('Envie no maximo 20 arquivos por reenvio.');
      return;
    }
    setArquivosReenvio(proximoEstado);
    setErroReenvio('');
    if (rejeitados.length > 0) {
      // R19: era `alert()` do navegador. A lista de arquivos recusados por tamanho e um EVENTO
      // (aconteceu agora, some quando a pessoa fecha) — faixa do sistema, dentro da pagina.
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function removerArquivoReenvio(index) {
    if (anexosReenvioIds.length > 0) return;
    setArquivosReenvio((atual) => atual.filter((_, i) => i !== index));
  }

  async function reenviarAjuste() {
    // R26: alvo fixado ANTES de qualquer `await`. Daqui para baixo so `alvo` e lido.
    const alvo = contrato;
    const comentario = String(comentarioReenvio || '').trim();
    const arquivosDaVez = arquivosReenvio;
    const idsJaEnviados = anexosReenvioIds;
    const temArquivo = arquivosDaVez.length > 0 || idsJaEnviados.length > 0;
    if (!comentario && !temArquivo) {
      setErroReenvio('Informe um comentario e/ou anexe um arquivo antes de reenviar.');
      return;
    }
    if (!alvo.solicitacao_id) {
      setErroReenvio('A solicitacao vinculada ao contrato nao foi identificada. Atualize a pagina e tente novamente.');
      return;
    }
    setErroReenvio('');

    const quantosAnexos = arquivosDaVez.length || idsJaEnviados.length;
    const { ok } = await confirmar({
      titulo: `Reenviar o contrato ${alvo.codigo} para aprovacao`,
      mensagem: `O contrato ${alvo.codigo} (${moeda(valorComAditivos)}) volta para a fila de quem o devolveu, com ${quantosAnexos ? `${quantosAnexos} arquivo(s) e ` : ''}${comentario ? 'o comentario do ajuste' : 'sem comentario'}. Enquanto ele estiver na fila voce nao consegue editar o ajuste por aqui.`,
      rotuloConfirmar: 'Reenviar para aprovacao'
    });
    if (!ok) return;

    return executar(async () => {
      let ids = idsJaEnviados;
      if (arquivosDaVez.length > 0 && ids.length === 0) {
        const anexos = await uploadArquivos({
          files: extrairFilesAnexosPendentes(arquivosDaVez),
          tipo: 'ANEXO',
          solicitacao_id: alvo.solicitacao_id
        });
        ids = (Array.isArray(anexos) ? anexos : []).map((anexo) => Number(anexo?.id)).filter(Boolean);
        if (ids.length !== arquivosDaVez.length) {
          throw new Error('O upload nao confirmou todos os arquivos. Atualize a pagina antes de tentar novamente.');
        }
        setAnexosReenvioIds(ids);
      }

      await reenviarContratoParaAprovacao(alvo.id, {
        comentario: comentario || null,
        anexo_ids: ids
      });
      setComentarioReenvio('');
      setArquivosReenvio([]);
      setAnexosReenvioIds([]);
      if (inputReenvioRef.current) inputReenvioRef.current.value = '';
    });
  }

  /**
   * APROVAR — a acao mais cara desta tela, e a que precisava de consentimento e nao tinha.
   *
   * A consequencia depende do VALOR: ate o limite do Juridico o contrato ja fica ATIVO e os
   * titulos financeiros nascem na hora; acima do limite ele segue para o Juridico e nenhum titulo
   * e criado ainda (`contratoFluxoNovoService.aprovarContrato`). A mensagem diz as duas, porque a
   * tela nao conhece o limite — afirmar so uma delas seria prometer o que pode nao acontecer.
   */
  async function aprovar() {
    const alvo = contrato;                                   // R26: fixado ANTES do await
    const categoriaEscolhida = categoriaId;
    if (!categoriaEscolhida) {
      setErroCategoria('Informe a categoria financeira: ela e aplicada a todos os titulos deste contrato.');
      return;
    }
    setErroCategoria('');
    const categoria = categorias.find((c) => String(c.id) === String(categoriaEscolhida));
    const nomeCategoria = [categoria?.codigo, categoria?.nome].filter(Boolean).join(' — ')
      || `categoria #${categoriaEscolhida}`;

    const { ok } = await confirmar({
      titulo: `Aprovar o contrato ${alvo.codigo}`,
      mensagem: `Aprovar o contrato ${alvo.codigo}, de ${moeda(valorComAditivos)}, com a categoria financeira ${nomeCategoria} aplicada a TODOS os titulos dele. Ate o limite do Juridico o contrato ja fica ativo e os titulos financeiros sao criados agora; acima do limite ele segue para o Juridico e nenhum titulo nasce ainda. A aprovacao nao pode ser repetida: para desfazer, e preciso encerrar o contrato.`,
      rotuloConfirmar: 'Aprovar contrato'
    });
    if (!ok) return;
    return executar(() => aprovarContratoFluxoNovo(alvo.id, {
      categoria_financeira_id: Number(categoriaEscolhida)
    }));
  }

  /**
   * O arquivo sobe ANTES de trocar a etapa: o backend so aceita `minuta` quando ja existe o anexo
   * ou o link. Na ordem inversa, o documento chegaria depois da validacao e a etapa seria recusada.
   */
  async function enviarMinuta() {
    const alvo = contrato;                                   // R26: fixado ANTES do await
    const arquivo = arquivoMinuta;
    const link = String(linkAssinatura || '').trim();
    if (!arquivo && !link) {
      setErroMinuta('Anexe a minuta ou informe o link de assinatura antes de enviar.');
      return;
    }
    setErroMinuta('');

    const entregue = [arquivo ? `o documento "${arquivo.name}"` : null, link ? 'o link de assinatura' : null]
      .filter(Boolean).join(' e ');
    const { ok } = await confirmar({
      titulo: `Enviar a minuta do contrato ${alvo.codigo} para assinatura`,
      mensagem: `O contrato ${alvo.codigo} (${moeda(valorComAditivos)}) sai do Juridico com ${entregue} e a solicitacao volta ao setor de origem para colher a assinatura. Enquanto estiver la, o Juridico nao consegue trocar a minuta por aqui.`,
      rotuloConfirmar: 'Enviar para assinatura'
    });
    if (!ok) return;

    return executar(async () => {
      if (arquivo) await uploadMinutaContrato(alvo.id, arquivo);
      await tramitarContratoNoJuridico(alvo.id, 'minuta', link ? { link_assinatura: link } : {});
      setArquivoMinuta(null);
      setLinkAssinatura('');
    });
  }

  /**
   * DEVOLVER / CANCELAR — a justificativa e campo de verdade (acima), e a confirmacao repete o
   * que foi digitado. Cancelar e IRREVERSIVEL e o texto diz isso, como a DoD exige de toda
   * confirmacao destrutiva.
   */
  async function confirmarMotivo() {
    const alvo = contrato;                                   // R26: fixado ANTES do await
    const acao = modo;                                       // idem: 'rejeitar' ou 'cancelar'
    const texto = String(motivo || '').trim();
    if (!texto) {
      setErroMotivo(acao === 'cancelar'
        ? 'Informe o motivo do cancelamento: ele vai para a auditoria e para quem acompanha a solicitacao.'
        : 'Informe o motivo da devolucao: e por ele que a pessoa sabe o que corrigir.');
      return;
    }
    setErroMotivo('');

    const { ok } = await confirmar({
      titulo: acao === 'cancelar'
        ? `Cancelar o contrato ${alvo.codigo}`
        : `Devolver o contrato ${alvo.codigo} para ajuste`,
      mensagem: acao === 'cancelar'
        ? `Cancelar o contrato ${alvo.codigo}, de ${moeda(valorComAditivos)}, encerra o pedido: a solicitacao NAO volta e esta acao nao pode ser desfeita. Motivo registrado: "${texto}".`
        : `Devolver o contrato ${alvo.codigo}, de ${moeda(valorComAditivos)}, ao responsavel para ajuste e reenvio. Motivo registrado: "${texto}".`,
      rotuloConfirmar: acao === 'cancelar' ? 'Cancelar contrato' : 'Devolver para ajuste',
      destrutiva: true
    });
    if (!ok) return;

    return executar(() => (acao === 'cancelar'
      ? cancelarSolicitacaoDoContrato(alvo.id, texto)
      : rejeitarContratoFluxoNovo(alvo.id, texto)));
  }

  /**
   * A APROVACAO FINAL do Juridico e onde o compromisso financeiro nasce (PI-18). Ela ja exigia
   * digitar o codigo do contrato — consentimento mais forte que um clique, e por isso o campo
   * FICA. A confirmacao vem por cima porque e ela que nomeia a consequencia (titulos criados,
   * solicitacao devolvida a obra) no momento do clique.
   */
  async function confirmarAprovacaoJuridica() {
    const alvo = contrato;                                   // R26: fixado ANTES do await
    const codigoEsperado = String(alvo?.codigo || '').trim();
    const digitado = String(confirmacaoJuridica || '').trim();
    if (!codigoEsperado || digitado.toUpperCase() !== codigoEsperado.toUpperCase()) {
      setErroConfirmacaoJuridica(`Digite ${codigoEsperado || 'o codigo do contrato'} para confirmar a aprovacao juridica final.`);
      return;
    }
    setErroConfirmacaoJuridica('');

    const { ok } = await confirmar({
      titulo: `Aprovacao final do contrato ${alvo.codigo}`,
      mensagem: `Aprovar em definitivo o contrato ${alvo.codigo}, de ${moeda(valorComAditivos)}: ele passa a ATIVO, os titulos financeiros das parcelas sao criados e a solicitacao volta para a obra. Esta acao nao pode ser desfeita por aqui — desfazer exige encerrar o contrato, que trata os titulos ja criados.`,
      rotuloConfirmar: 'Aprovar em definitivo'
    });
    if (!ok) return;

    return executar(async () => {
      await tramitarContratoNoJuridico(alvo.id, 'conferido');
      setConfirmacaoJuridica('');
    });
  }

  async function baixarMinuta() {
    const minuta = contrato?.minuta;
    const caminho = String(minuta?.caminho_arquivo || '').trim();
    if (!caminho) {
      avisar.erro('A minuta não possui um endereço de arquivo valido.');
      return;
    }

    setBaixandoMinuta(true);
    limpar();
    try {
      let url = fileUrl(caminho);
      if (caminho.startsWith('http')) {
        const params = new URLSearchParams({
          url: caminho.replace(/%(?![0-9A-Fa-f]{2})/g, '%25')
        });
        const respostaPresign = await fetch(`${API_URL}/anexos/presign?${params.toString()}`, {
          headers: authHeaders()
        });
        const dadosPresign = await respostaPresign.json().catch(() => null);
        if (!respostaPresign.ok || !dadosPresign?.url) {
          throw new Error(dadosPresign?.error || 'Nao foi possivel gerar o link seguro da minuta.');
        }
        url = dadosPresign.url;
      }

      const resposta = await fetch(url);
      if (!resposta.ok) throw new Error('Nao foi possivel carregar a minuta.');
      const blobUrl = window.URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = minuta.nome_original || 'minuta-contrato';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel baixar a minuta.');
    } finally {
      setBaixandoMinuta(false);
    }
  }

  async function solicitarRevisaoDoAssinado() {
    const alvo = contrato;                                   // R26: fixado ANTES do await
    const arquivo = arquivoAssinado;
    const idJaEnviado = anexoAssinadoId;
    const peloLink = assinadoPeloLink;
    if (!arquivo && !idJaEnviado && !peloLink) {
      setErroAssinado('Anexe o contrato assinado ou confirme que ele foi assinado pelo link informado.');
      return;
    }
    if (arquivo && !alvo.solicitacao_id) {
      setErroAssinado('A solicitacao vinculada ao contrato nao foi identificada. Atualize a pagina e tente novamente.');
      return;
    }
    setErroAssinado('');

    const prova = arquivo
      ? `o documento assinado "${arquivo.name}"`
      : (idJaEnviado ? 'o documento assinado ja enviado' : 'a confirmacao de assinatura pelo link');
    const { ok } = await confirmar({
      titulo: `Solicitar a revisao final do contrato ${alvo.codigo}`,
      mensagem: `O contrato ${alvo.codigo} (${moeda(valorComAditivos)}) volta ao Juridico com ${prova} para a conferencia final. Esta acao NAO cria titulo: e a conferencia do Juridico que ativa o contrato e cria os titulos financeiros.`,
      rotuloConfirmar: 'Solicitar revisao'
    });
    if (!ok) return;

    return executar(async () => {
      let idAnexo = idJaEnviado;
      if (arquivo && !idAnexo) {
        const anexos = await uploadArquivos({
          files: [arquivo],
          tipo: 'CONTRATO',
          solicitacao_id: alvo.solicitacao_id
        });
        idAnexo = Number(anexos?.[0]?.id) || null;
        if (!idAnexo) {
          throw new Error('O upload nao confirmou o contrato assinado. Atualize a pagina antes de tentar novamente.');
        }
        // Se a troca de etapa falhar, a repeticao reutiliza o upload confirmado e nao duplica o
        // arquivo no banco/S3.
        setAnexoAssinadoId(idAnexo);
      }
      await tramitarContratoNoJuridico(alvo.id, 'assinado', peloLink
        ? { assinado_pelo_link: true }
        : {});
      setArquivoAssinado(null);
      setAnexoAssinadoId(null);
      setAssinadoPeloLink(false);
    });
  }

  return (
    <BlocoConteudo
      titulo={`Contrato ${contrato.codigo} — ${info.titulo}`}
      contagem={`Valor ${moeda(valorComAditivos)}`}
      descricao={info.ajuda}
      data-testid="acoes-contrato"
      recolhivel
      recolhidoPadrao
      alternarAoClicar
    >
      <div className="space-y-3">
        <Avisos avisos={avisos} aoFechar={fechar} />
        {/* Nem toda pessoa que ENXERGA a solicitacao age nela. Sem esta linha o card ficaria com o
            titulo e nenhum botao, e quem olhasse nao saberia se esta esperando alguem ou se a tela
            falhou ao carregar. */}
        {!modo && semAcaoNesteEstado && (
          <p className="text-sm text-[var(--c-muted)]" data-testid="sem-acao-contrato">
            Nesta etapa a acao e {DONO_DA_VEZ[status] || 'de outro setor'}. Voce acompanha o contrato,
            mas nao tem permissao para agir aqui.
          </p>
        )}
        {status === 'REJEITADO' && contrato.motivo_rejeicao && (
          <div className="app-alert app-alert--warning">Motivo: {contrato.motivo_rejeicao}</div>
        )}

        {status === 'AGUARDANDO_ASSINATURA' && (linkAssinaturaSeguro || contrato.minuta) && (
          <section className="border-y border-[var(--c-border)] py-2" aria-label="Material para assinatura">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">
              Material para assinatura
            </h3>
            <div className="divide-y divide-[var(--c-border)]">
              {linkAssinaturaSeguro && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--c-text)]">Link de assinatura</p>
                    <p className="truncate text-xs text-[var(--c-muted)]">{linkAssinaturaSeguro}</p>
                  </div>
                  <a className="btn btn-outline btn-sm shrink-0" href={linkAssinaturaSeguro}
                    target="_blank" rel="noreferrer" title="Abrir link de assinatura">
                    <HiArrowTopRightOnSquare className="h-4 w-4" />
                    <span className="ml-1">Abrir</span>
                  </a>
                </div>
              )}
              {contrato.minuta && (
                <div className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--c-text)]">Minuta do contrato</p>
                    <p className="truncate text-xs text-[var(--c-muted)]">{contrato.minuta.nome_original}</p>
                  </div>
                  <button type="button" className="btn btn-outline btn-sm shrink-0"
                    onClick={baixarMinuta} disabled={baixandoMinuta} title="Baixar minuta">
                    <HiArrowDownTray className="h-4 w-4" />
                    <span className="ml-1">{baixandoMinuta ? 'Baixando...' : 'Baixar'}</span>
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Confirmacao de motivo, compartilhada por rejeitar e cancelar. As duas exigem motivo:
            quem recebe a devolucao precisa saber o que corrigir, e cancelamento sem motivo vira
            discussao depois. O motivo e CAMPO DE TELA com validacao visivel — justificativa que
            vai para a auditoria nao se digita em caixa do navegador. */}
        {modo && modo !== 'aprovar-juridico' && (
          <div className="space-y-2">
            <FormSecao colunas={2}>
              <CampoForm
                label={modo === 'cancelar' ? 'Motivo do cancelamento' : 'Motivo da devolucao'}
                obrigatorio
                tipo="texto-longo"
                erro={erroMotivo}
                hint={modo === 'cancelar'
                  ? 'Cancelar encerra o pedido: a solicitacao NAO volta.'
                  : 'Rejeitar devolve ao responsavel para ajuste e reenvio.'}
              >
                <textarea
                  className="input"
                  rows={2}
                  name="motivo_acao_contrato"
                  value={motivo}
                  onChange={(e) => { setMotivo(e.target.value); setErroMotivo(''); }}
                />
              </CampoForm>
            </FormSecao>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => { setModo(null); setErroMotivo(''); limpar(); }} disabled={ocupado}>
                Voltar
              </button>
              <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={confirmarMotivo} disabled={ocupado}
                data-testid="confirmar-motivo-contrato">
                {ocupado ? 'Enviando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {modo === 'aprovar-juridico' && (
          <div className="space-y-3" data-testid="confirmacao-aprovacao-juridica">
            <div className="app-alert app-alert--warning">
              Esta ação ativa o contrato, cria os títulos financeiros e devolve a solicitação para a
              obra. Confira o documento assinado antes de continuar.
            </div>
            <FormSecao colunas={2}>
              <CampoForm
                label={`Digite ${contrato.codigo} para confirmar`}
                obrigatorio
                erro={erroConfirmacaoJuridica}
              >
                <input
                  className="input input-sm"
                  value={confirmacaoJuridica}
                  onChange={(e) => { setConfirmacaoJuridica(e.target.value); setErroConfirmacaoJuridica(''); limpar(); }}
                  autoComplete="off"
                  aria-label={`Digite ${contrato.codigo} para confirmar`}
                  data-testid="codigo-confirmacao-aprovacao-juridica"
                />
              </CampoForm>
            </FormSecao>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn btn-outline btn-sm"
                onClick={() => { setModo(null); setConfirmacaoJuridica(''); setErroConfirmacaoJuridica(''); limpar(); }} disabled={ocupado}>
                Voltar
              </button>
              <button type="button" className="btn btn-primary btn-sm" onClick={confirmarAprovacaoJuridica}
                disabled={ocupado || String(confirmacaoJuridica || '').trim().toUpperCase() !== String(contrato.codigo || '').trim().toUpperCase()}
                data-testid="confirmar-aprovacao-juridica">
                {ocupado ? 'Aprovando...' : 'Confirmar aprovacao final'}
              </button>
            </div>
          </div>
        )}

        {/* Ate 20/08 este estado nao tinha saida nenhuma: o responsavel corrigia o que foi apontado e
            nao havia botao que devolvesse o contrato para a fila. */}
        {!modo && status === 'REJEITADO' && podeReenviar && (
          <div className="space-y-3 border-t border-[var(--c-border)] pt-3" data-testid="ajuste-contrato-rejeitado">
            <FormSecao legenda="Resposta ao ajuste" colunas={2}>
              <CampoForm
                label="Comentário do ajuste"
                tipo="texto-longo"
                erro={erroReenvio}
                hint="Informe o que foi corrigido, anexe o documento atualizado, ou use as duas opcoes. Comentario ou arquivo: ao menos um e obrigatorio."
              >
                <textarea
                  className="input"
                  rows={3}
                  maxLength={4000}
                  value={comentarioReenvio}
                  onChange={(e) => { setComentarioReenvio(e.target.value); setErroReenvio(''); }}
                  placeholder="Descreva objetivamente o que foi corrigido..."
                  data-testid="comentario-reenvio-contrato"
                />
              </CampoForm>
            </FormSecao>

            <div className="flex flex-wrap items-center gap-2">
              <label className="btn btn-outline btn-sm" style={{ cursor: ocupado ? 'not-allowed' : 'pointer' }}>
                <HiPaperClip className="h-4 w-4" />
                <span className="ml-1">Anexar arquivo</span>
                <input
                  ref={inputReenvioRef}
                  type="file"
                  multiple
                  disabled={ocupado || anexosReenvioIds.length > 0}
                  className="sr-only"
                  onChange={(e) => {
                    adicionarArquivosReenvio(e.target.files);
                    e.target.value = '';
                  }}
                  data-testid="anexos-reenvio-contrato"
                />
              </label>
            </div>

            <PendingAttachmentsList
              items={arquivosReenvio}
              onRemove={anexosReenvioIds.length > 0 ? undefined : removerArquivoReenvio}
              className="space-y-1"
              itemClassName="flex items-center justify-between gap-3 border-b border-[var(--c-border)] px-1 py-2 text-sm last:border-b-0"
            />

            {anexosReenvioIds.length > 0 && (
              <p className="text-xs text-[var(--c-muted)]">Arquivo(s) enviado(s); aguardando concluir o reenvio.</p>
            )}

            <div className="flex justify-end">
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado}
                data-testid="reenviar-contrato" onClick={reenviarAjuste}>
                {ocupado ? 'Reenviando...' : 'Registrar ajuste e reenviar'}
              </button>
            </div>
          </div>
        )}

        {!modo && status === 'AGUARDANDO_APROVACAO' && (podeAprovar || podeRejeitar || podeCancelar) && (
          <div className="space-y-3">
            {/* A categoria e condicao para APROVAR — quem so devolve ou cancela nao precisa dela, e
                mostrar um campo obrigatorio que a pessoa nao usa faz parecer que falta preencher. */}
            {podeAprovar && (
            <FormSecao colunas={2}>
              <CampoForm
                label="Categoria financeira"
                obrigatorio
                span={2}
                erro={erroCategorias || erroCategoria}
                hint="Plano de contas a pagar. Vale para todos os titulos deste contrato e e obrigatoria para aprovar."
              >
                {/* Autocomplete, e nao `select`: sao 160 categorias de contas a pagar, e rolar uma
                    lista desse tamanho para achar "2.01.01.05" e pior do que digitar. O mesmo campo
                    da apropriacao — busca por codigo ou nome, lista em portal. */}
                <ApropriacaoAutocomplete
                  value={categoriaId}
                  options={categorias}
                  onChange={(id) => { setCategoriaId(id ? String(id) : ''); setErroCategoria(''); }}
                  inputClassName="input input-sm w-full"
                  placeholder="Buscar por código ou nome do plano de contas..."
                  mostrarConsultaCompleta={false}
                />
                <input type="hidden" name="categoria_financeira_id" value={categoriaId} />
              </CampoForm>
            </FormSecao>
            )}
            <div className="flex flex-wrap gap-2">
              {podeAprovar && (
              <button type="button" className="btn btn-primary btn-sm" onClick={aprovar} disabled={ocupado}
                data-testid="aprovar-contrato">
                {ocupado ? 'Aprovando...' : 'Aprovar'}
              </button>
              )}
              {podeRejeitar && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setModo('rejeitar'); setErroMotivo(''); limpar(); }} disabled={ocupado}
                data-testid="rejeitar-contrato">
                Rejeitar
              </button>
              )}
              {podeCancelar && (
              <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => { setModo('cancelar'); setErroMotivo(''); limpar(); }} disabled={ocupado}
                data-testid="cancelar-contrato">
                Cancelar
              </button>
              )}
            </div>
          </div>
        )}

        {!modo && status === 'EM_ANALISE_JURIDICA' && (podeTramitarJuridico || podeRejeitar || podeCancelar) && (
          <div className="space-y-3">
            {podeTramitarJuridico && (
            <>
            {/* Concluir a minuta exige ENTREGAR alguma coisa: o documento, o link da plataforma de
                assinatura, ou os dois. Antes era so um botao que trocava o status, e o responsavel
                recebia "colete a assinatura" sem receber de que. Exigir os dois travaria metade dos
                casos — parte dos contratos circula em papel, parte por plataforma. */}
            <FormSecao colunas={2}>
              <CampoForm
                label="Minuta (documento)"
                erro={erroMinuta}
                hint="Informe a minuta, o link de assinatura, ou os dois. Ao enviar, a solicitacao volta ao setor de origem para colher a assinatura."
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer' }} title="Anexar .docx ou .pdf">
                    <HiPaperClip className="w-4 h-4" />
                    <span className="ml-1">{arquivoMinuta ? 'Trocar arquivo' : 'Anexar minuta'}</span>
                    <input
                      type="file"
                      name="arquivo_minuta"
                      accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      className="sr-only"
                      onChange={(e) => {
                        setArquivoMinuta(e.target.files?.[0] || null);
                        setErroMinuta('');
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {arquivoMinuta ? (
                    <>
                      <span className="text-xs text-[var(--c-text)]" data-testid="minuta-nome">{arquivoMinuta.name}</span>
                      <button type="button" className="btn btn-outline btn-sm" title="Remover"
                        aria-label="Remover minuta" onClick={() => setArquivoMinuta(null)}>
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--c-muted)]">Nenhum documento anexado</span>
                  )}
                </div>
              </CampoForm>

              <CampoForm label="Link de assinatura">
                <input
                  className="input input-sm"
                  name="link_assinatura"
                  placeholder="https://..."
                  value={linkAssinatura}
                  onChange={(e) => { setLinkAssinatura(e.target.value); setErroMinuta(''); }}
                />
              </CampoForm>
            </FormSecao>
            </>
            )}

            <div className="flex flex-wrap gap-2">
              {podeTramitarJuridico && (
              <button type="button" className="btn btn-primary btn-sm" disabled={ocupado}
                data-testid="minuta-pronta"
                onClick={enviarMinuta}>
                {ocupado ? 'Enviando...' : 'Minuta pronta — enviar para assinatura'}
              </button>
              )}
              {podeRejeitar && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => { setModo('rejeitar'); setErroMotivo(''); limpar(); }} disabled={ocupado}
                data-testid="rejeitar-contrato-juridico">
                Rejeitar
              </button>
              )}
              {podeCancelar && (
              <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => { setModo('cancelar'); setErroMotivo(''); limpar(); }} disabled={ocupado}>
                Cancelar
              </button>
              )}
            </div>
          </div>
        )}

        {!modo && status === 'AGUARDANDO_ASSINATURA' && (podeConfirmarAssinatura || podeCancelar) && (
          <div className="space-y-3">
            {/* PI-18: este botao NAO cria titulo. Ele devolve a solicitacao ao Juridico, em destaque,
                para a conferencia final — e e a conferencia que cria os titulos. */}
            {podeConfirmarAssinatura && (
            <div className="grid gap-2">
              {linkAssinaturaSeguro && (
                <label className="flex items-start gap-2 rounded-md bg-[var(--ui-surface-2)] px-3 py-2 text-sm text-[var(--c-text)]">
                  <input type="checkbox" className="mt-1" checked={assinadoPeloLink}
                    onChange={(e) => { setAssinadoPeloLink(e.target.checked); setErroAssinado(''); limpar(); }}
                    data-testid="assinado-pelo-link" />
                  <span>
                    <strong className="font-semibold">Contrato assinado pelo link informado</strong>
                    <span className="block text-xs text-[var(--c-muted)]">
                      Ao confirmar esta opção, anexar o contrato assinado deixa de ser obrigatório para solicitar a revisão.
                    </span>
                  </span>
                </label>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <label className="btn btn-outline btn-sm" style={{ cursor: anexoAssinadoId ? 'default' : 'pointer' }}>
                  <HiPaperClip className="w-4 h-4" />
                  <span className="ml-1">{arquivoAssinado || anexoAssinadoId
                    ? 'Contrato assinado selecionado'
                    : `Anexar contrato assinado${assinadoPeloLink ? ' (opcional)' : ''}`}</span>
                  <input
                    type="file"
                    name="arquivo_contrato_assinado"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="sr-only"
                    disabled={Boolean(anexoAssinadoId)}
                    onChange={(e) => {
                      setArquivoAssinado(e.target.files?.[0] || null);
                      setAnexoAssinadoId(null);
                      setErroAssinado('');
                      limpar();
                      e.target.value = '';
                    }}
                  />
                </label>
                {arquivoAssinado && !anexoAssinadoId && (
                  <>
                    <span className="text-xs text-[var(--c-text)]" data-testid="assinado-nome">{arquivoAssinado.name}</span>
                    <button type="button" className="btn btn-outline btn-sm" title="Remover"
                      aria-label="Remover contrato assinado" onClick={() => setArquivoAssinado(null)}>
                      <HiTrash className="w-4 h-4" />
                    </button>
                  </>
                )}
                {anexoAssinadoId && (
                  <span className="text-xs text-[var(--c-muted)]">Upload confirmado. Pronto para reenviar.</span>
                )}
              </div>
              {erroAssinado && <p className="form-error">{erroAssinado}</p>}
              <button type="button" className="btn btn-primary btn-sm justify-self-start" disabled={ocupado}
                data-testid="solicitar-revisao"
                onClick={solicitarRevisaoDoAssinado}>
                {ocupado ? 'Enviando...' : 'Solicitar revisao'}
              </button>
            </div>
            )}
            {podeCancelar && <div>
              <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => { setModo('cancelar'); setErroMotivo(''); limpar(); }} disabled={ocupado}>
                Cancelar
              </button>
            </div>}
          </div>
        )}

        {!modo && status === 'EM_REVISAO_JURIDICA' && (podeTramitarJuridico || podeRejeitar || podeCancelar) && (
          <div className="flex flex-wrap gap-2">
            {/* PI-18: e AQUI que o compromisso financeiro nasce. */}
            {podeTramitarJuridico && (
            <button type="button" className="btn btn-primary btn-sm" disabled={ocupado}
              data-testid="conferir-assinado"
              onClick={() => { setModo('aprovar-juridico'); setConfirmacaoJuridica(''); setErroConfirmacaoJuridica(''); limpar(); }}>
              Conferido — aprovar contrato
            </button>
            )}
            {podeRejeitar && (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setModo('rejeitar'); setErroMotivo(''); limpar(); }} disabled={ocupado}
              data-testid="rejeitar-contrato-revisao">
              Rejeitar
            </button>
            )}
            {podeCancelar && (
            <button type="button" className="btn btn-outline btn-perigo-suave btn-sm" onClick={() => { setModo('cancelar'); setErroMotivo(''); limpar(); }} disabled={ocupado}>
              Cancelar
            </button>
            )}
          </div>
        )}
      </div>
      {elementoConfirmacao}
    </BlocoConteudo>
  );
}
