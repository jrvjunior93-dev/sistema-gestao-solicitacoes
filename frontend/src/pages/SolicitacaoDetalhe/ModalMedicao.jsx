import { useEffect, useRef, useState } from 'react';
import OverlayModal from '../../components/ui/OverlayModal';
import DateInputBR from '../../components/DateInputBR';
import { API_URL, authHeaders, fileUrl } from '../../services/api';
import { aprovarMedicaoContrato, atualizarMedicaoContrato } from '../../services/contratos';
import { uploadArquivos } from '../../services/uploads';
import { HiArrowDownTray, HiEye, HiPaperClip } from 'react-icons/hi2';
import {
  Avisos,
  CampoForm,
  FormSecao,
  StatGrid,
  StatTile,
  useAvisos,
  useConfirmacao
} from '../../components/padrao';
import PreviewAnexoModal from './PreviewAnexoModal';

/**
 * A MEDICAO do contrato — conferir, ajustar e APROVAR.
 *
 * Aprovar aqui e o que LIBERA O PAGAMENTO: a parcela sai de PREVISAO e vira titulo aberto no
 * Financeiro. Por isso duas coisas nao sao negociaveis nesta tela:
 *
 * 1. **Anexo obrigatorio antes de aprovar.** Ja era regra e continua: sem documento nao ha o que
 *    conferir depois, e o pagamento fica sem lastro.
 * 2. **Consentimento explicito** (05/09): aprovar e salvar passam por `useConfirmacao`, com o
 *    retorno DESESTRUTURADO (`const { ok } = await confirmar(...)`, R21 — o objeto e sempre truthy
 *    e `const ok =` faria o "Cancelar" aprovar a medicao) e com o ALVO FIXADO numa `const` antes
 *    do `await` (R26): o modal do sistema nao congela a pagina, e a lista de parcelas por tras
 *    recarrega por evento (`onSalvo`).
 *
 * ## Estrutura do modal (R27)
 *
 * `OverlayModal` com `data-modal="cabecalho"` e `data-modal="rodape"`: o corpo rola e o botao que
 * aprova fica SEMPRE visivel. Antes, o rodape era parte do corpo — numa medicao com muitos anexos
 * e comentarios, o botao de aprovar descia junto com a rolagem.
 *
 * ## Erro POR CAMPO (o levantamento anterior dizia que este componente nao aceitava)
 *
 * Aceita — e sem mexer na interface publica. A validacao era de FORMULARIO ("informe valor e
 * vencimento de todas as parcelas", numa faixa no topo), o que obriga a pessoa a caçar qual das
 * seis linhas esta incompleta. Agora `erroPorParcela` guarda a mensagem por
 * `contrato_parcela_id` e o `erro` do `CampoForm` a exibe ao lado do campo que a causou.
 * Estado interno novo, ZERO prop nova: `medicao`, `historicos`, `parcelas`, `solicitacaoId`,
 * `podeEditar`, `podeAprovar`, `podeAnexar`, `onFechar` e `onSalvo` seguem exatamente como eram.
 */

const dataHora = (v) => (v ? new Date(v).toLocaleString('pt-BR') : '');
const soData = (v) => (v ? String(v).slice(0, 10) : '');
const brData = (v) => (soData(v) ? soData(v).split('-').reverse().join('/') : '');
const moeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const periodo = (m) => {
  const ini = brData(m?.periodo_inicio);
  const fim = brData(m?.periodo_fim);
  return ini && fim ? `${ini} a ${fim}` : (ini || fim || 'Periodo nao informado');
};

const rotuloTipoAnexo = (tipo) => {
  const rotulos = {
    BOLETO: 'Boleto',
    COMPROVANTE: 'Comprovante',
    NOTA_FISCAL: 'Nota fiscal',
    ANEXO: 'Arquivo'
  };
  const chave = String(tipo || '').trim().toUpperCase();
  return rotulos[chave] || chave.replaceAll('_', ' ').toLowerCase() || 'Arquivo';
};

function normalizarUrlArquivo(url) {
  const valor = String(url || '');
  if (!valor.startsWith('http')) return valor;
  return valor.replace(/%(?![0-9A-Fa-f]{2})/g, '%25');
}

export default function ModalMedicao({
  medicao,
  historicos = [],
  parcelas = [],
  solicitacaoId = null,
  podeEditar = false,
  podeAprovar = false,
  podeAnexar = false,
  onFechar,
  onSalvo
}) {
  const daMedicao = (Array.isArray(parcelas) ? parcelas : [])
    .filter((p) => p?.medicao && String(p.medicao.id) === String(medicao?.id || ''));

  const [edicao, setEdicao] = useState({});
  // Erro POR PARCELA: `{ [parcelaId]: { valor?: string, vencimento?: string } }`. A mensagem mora
  // ao lado do campo que a causou — "informe valor e vencimento de todas as parcelas" numa faixa
  // no topo obriga a pessoa a caçar qual das seis linhas esta incompleta.
  const [erroPorParcela, setErroPorParcela] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aprovando, setAprovando] = useState(false);
  const [abrindoAnexoId, setAbrindoAnexoId] = useState(null);
  const [baixandoAnexoId, setBaixandoAnexoId] = useState(null);
  const [previewAnexo, setPreviewAnexo] = useState(null);
  const [anexosAdicionados, setAnexosAdicionados] = useState([]);
  const [enviandoAnexos, setEnviandoAnexos] = useState(false);
  const inputAnexosRef = useRef(null);
  const { avisos, avisar, fechar, limpar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    const inicial = {};
    daMedicao.forEach((p) => {
      inicial[p.id] = { valor: String(Number(p.valor).toFixed(2)), vencimento: soData(p.vencimento) };
    });
    setEdicao(inicial);
    setErroPorParcela({});
    limpar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicao?.id, parcelas]);

  useEffect(() => {
    setAnexosAdicionados([]);
  }, [medicao?.id]);

  if (!medicao || typeof document === 'undefined') return null;

  const comentarios = (Array.isArray(historicos) ? historicos : [])
    .filter((h) => String(h?.medicao_id || '') === String(medicao.id));
  const anexosPorId = new Map();
  [...(Array.isArray(medicao.anexos) ? medicao.anexos : []), ...anexosAdicionados]
    .forEach((anexo) => anexosPorId.set(String(anexo.id), anexo));
  const anexos = [...anexosPorId.values()]
    .sort((a, b) => Number(String(b?.tipo).toUpperCase() === 'BOLETO')
      - Number(String(a?.tipo).toUpperCase() === 'BOLETO'));
  const formaPagamento = medicao.forma_pagamento?.nome || medicao.forma_pagamento?.codigo || 'Nao informada';
  const favorecido = medicao.favorecido?.nome || 'Nao informado';
  const documentoFavorecido = medicao.favorecido?.cpf_cnpj || '';
  const ehPix = /PIX/i.test(`${medicao.forma_pagamento?.nome || ''} ${medicao.forma_pagamento?.tipo || ''}`);
  const medicaoAprovada = Boolean(medicao.aprovada_em);
  const temAnexo = anexos.length > 0;
  const podeCompletarAnexos = podeAnexar && !medicaoAprovada && Boolean(solicitacaoId);

  const temBaixa = (p) => Number(p?.titulo_valor_baixado || 0) > 0;
  const editaveis = medicaoAprovada ? [] : daMedicao.filter((p) => !temBaixa(p));
  const podeSalvar = podeEditar && !medicaoAprovada && editaveis.length > 0;
  // O total desta medicao — o numero que a aprovacao libera para pagamento. Soma as parcelas DESTA
  // medicao (`daMedicao`), que sao exatamente as listadas abaixo: rotulo e lista descrevem o mesmo
  // conjunto.
  const totalDaMedicao = daMedicao.reduce((acc, p) => acc + Number(p.valor || 0), 0);

  async function salvar() {
    // R26: alvo fixado ANTES do await — o modal nao congela a tela por tras.
    const alvo = medicao;
    const linhas = editaveis;
    const valores = edicao;
    limpar();

    const erros = {};
    linhas.forEach((p) => {
      const linha = valores[p.id] || {};
      const desteCampo = {};
      if (!linha.valor) desteCampo.valor = 'Informe o valor medido desta parcela.';
      if (!linha.vencimento) desteCampo.vencimento = 'Informe o vencimento desta parcela.';
      if (Object.keys(desteCampo).length) erros[p.id] = desteCampo;
    });
    if (Object.keys(erros).length) {
      setErroPorParcela(erros);
      return;
    }
    setErroPorParcela({});

    const itens = linhas.map((p) => ({
      contrato_parcela_id: p.id,
      valor_medido: valores[p.id]?.valor,
      vencimento: valores[p.id]?.vencimento
    }));
    const totalNovo = itens.reduce((acc, i) => acc + Number(i.valor_medido || 0), 0);

    const { ok } = await confirmar({
      titulo: `Alterar a medicao ${alvo.numero}`,
      mensagem: `Gravar ${itens.length} parcela(s) da medicao ${alvo.numero} (${periodo(alvo)}) somando ${moeda(totalNovo)}. A diferenca em relacao ao previsto e redistribuida nas ULTIMAS parcelas do contrato — o saldo do contrato muda junto.`,
      rotuloConfirmar: 'Salvar alteracoes'
    });
    if (!ok) return;

    setSalvando(true);
    try {
      await atualizarMedicaoContrato(alvo.id, itens);
      onSalvo?.();
      onFechar?.();
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel alterar a medicao.');
    } finally {
      setSalvando(false);
    }
  }

  async function aprovar() {
    // R26: alvo fixado ANTES do await. Aprovar a medicao errada libera pagamento errado, e a
    // trilha registra um consentimento valido para a acao que ninguem autorizou.
    const alvo = medicao;
    const quantasParcelas = daMedicao.length;
    const total = totalDaMedicao;
    const quantosAnexos = anexos.length;
    limpar();
    if (!temAnexo) {
      avisar.erro(`Anexe ao menos um arquivo na medicao ${alvo.numero} antes de aprovar.`);
      return;
    }

    const { ok } = await confirmar({
      titulo: `Aprovar a medicao ${alvo.numero}`,
      mensagem: `Aprovar a medicao ${alvo.numero} (${periodo(alvo)}) LIBERA O PAGAMENTO de ${quantasParcelas} parcela(s), no total de ${moeda(total)}, para ${favorecido} por ${formaPagamento}. Conferido em ${quantosAnexos} arquivo(s) anexado(s). Depois de aprovada, valor e vencimento ficam somente para consulta e a medicao nao volta a ser editavel por aqui.`,
      rotuloConfirmar: 'Aprovar e enviar ao Financeiro'
    });
    if (!ok) return;

    setAprovando(true);
    try {
      await aprovarMedicaoContrato(alvo.id);
      onSalvo?.();
      onFechar?.();
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel aprovar a medicao.');
    } finally {
      setAprovando(false);
    }
  }

  async function anexarArquivos(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;

    limpar();
    setEnviandoAnexos(true);
    try {
      const registros = await uploadArquivos({
        files,
        solicitacao_id: solicitacaoId,
        medicao_id: medicao.id,
        tipo: 'SOLICITACAO'
      });
      setAnexosAdicionados((atuais) => [...atuais, ...(Array.isArray(registros) ? registros : [])]);
      onSalvo?.();
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel anexar os arquivos da medicao.');
    } finally {
      setEnviandoAnexos(false);
    }
  }

  async function resolverUrlAnexo(anexo) {
    const caminho = String(anexo.caminho_arquivo || '');
    if (!caminho) throw new Error('Arquivo sem endereco para abertura.');
    if (!caminho.startsWith('http')) return fileUrl(caminho);

    const params = new URLSearchParams({ url: normalizarUrlArquivo(caminho) });
    const resposta = await fetch(`${API_URL}/anexos/presign?${params.toString()}`, {
      headers: authHeaders()
    });
    const dados = await resposta.json().catch(() => null);
    if (!resposta.ok || !dados?.url) {
      throw new Error(dados?.error || 'Nao foi possivel gerar o link seguro do arquivo.');
    }
    return dados.url;
  }

  async function abrirAnexo(anexo) {
    limpar();
    setAbrindoAnexoId(anexo.id);
    try {
      const url = await resolverUrlAnexo(anexo);
      const nome = anexo.nome_original || 'Arquivo da medicao';
      setPreviewAnexo({ nome, caminho: nome, url, downloadUrl: url });
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel abrir o arquivo.');
    } finally {
      setAbrindoAnexoId(null);
    }
  }

  async function baixarAnexo(anexo) {
    limpar();
    setBaixandoAnexoId(anexo.id);
    try {
      const url = await resolverUrlAnexo(anexo);
      const resposta = await fetch(url);
      if (!resposta.ok) throw new Error('Nao foi possivel carregar o arquivo para download.');
      const blobUrl = window.URL.createObjectURL(await resposta.blob());
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = anexo.nome_original || 'arquivo-medicao';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (e) {
      avisar.erro(e.message || 'Nao foi possivel baixar o arquivo.');
    } finally {
      setBaixandoAnexoId(null);
    }
  }

  return (
    <>
      <OverlayModal
        aberto
        largura="var(--modal-max-w-lg, 860px)"
        rotulo={`Medição ${medicao.numero}`}
        onFechar={onFechar}
        fecharComEscape={!previewAnexo}
      >
        {/* R27: cabecalho FIXO — a identificacao da medicao e a situacao nao rolam para fora. */}
        <header
          data-modal="cabecalho"
          className="flex items-start justify-between gap-4 border-b border-[var(--c-border)] px-4 py-4"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Medicao {medicao.numero}</h3>
              {/* Situacao por classe do sistema (R25): `badge-status--*` aponta para token e
                  acompanha o tema escuro. O `style` inline com hexadecimal de reserva
                  (`var(--c-success, #15803d)`) nao acompanhava nenhum dos dois — e como este modal
                  vive num PORTAL, fora do `.layout-shell`, as classes `badge-*` do shell nao
                  chegariam ate aqui. `badge-status--*` e declarada sem escopo, e chega. */}
              <span className={medicaoAprovada ? 'badge-status badge-status--approved' : 'badge-status badge-status--pending'}>
                {medicaoAprovada ? 'Aprovada' : 'Pendente de aprovacao'}
              </span>
            </div>
            <p className="mt-1 text-xs text-[var(--c-muted)]">Periodo: {periodo(medicao)}</p>
          </div>
          <button type="button" className="btn btn-outline btn-sm shrink-0" onClick={onFechar}>Fechar</button>
        </header>

        <div data-testid="modal-medicao" className="space-y-4 px-4 py-4">
          <Avisos avisos={avisos} aoFechar={fechar} />

          <section aria-labelledby="conferencia-medicao">
            <div className="border-b border-[var(--c-border)] pb-2">
              <h4 id="conferencia-medicao" className="text-sm font-semibold text-[var(--c-text)]">
                Conferência para aprovação
              </h4>
              <p className="mt-1 text-xs text-[var(--c-muted)]">
                Dados informados para o pagamento desta medição.
              </p>
            </div>

            {podeAprovar && !medicaoAprovada && !temAnexo && (
              <div className="app-alert app-alert--error mt-3" data-testid="medicao-sem-anexo">
                Anexe ao menos um arquivo na medicao {medicao.numero} antes de aprovar.
              </div>
            )}

            {/* Os dados que a pessoa confere antes de liberar o pagamento — ladrilho padrao, com o
                total desta medicao ao lado, que e o numero que a aprovacao libera. */}
            <StatGrid colunas={2}>
              <StatTile label="Total desta medição" valor={moeda(totalDaMedicao)}
                sub={`${daMedicao.length} parcela(s)`} />
              <StatTile label="Forma de pagamento" valor={formaPagamento} />
              <StatTile label="Favorecido" valor={favorecido} sub={documentoFavorecido || undefined} />
              {ehPix && (
                <StatTile label="Chave PIX" valor={medicao.favorecido_chave_pix || 'Nao informada'} />
              )}
              {medicao.favorecido_contato && (
                <StatTile
                  label={ehPix ? 'Contato' : 'Dados para pagamento'}
                  valor={medicao.favorecido_contato}
                />
              )}
            </StatGrid>

            <div className="mt-3 border-t border-[var(--c-border)] pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">
                  Arquivos da medição
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[var(--c-muted)]">{anexos.length} arquivo(s)</span>
                  {podeCompletarAnexos && (
                    <>
                      <input
                        ref={inputAnexosRef}
                        type="file"
                        multiple
                        className="sr-only"
                        data-testid="anexar-arquivos-medicao-input"
                        onChange={anexarArquivos}
                      />
                      <button
                        type="button"
                        className="btn btn-outline btn-sm"
                        data-testid="anexar-arquivos-medicao"
                        disabled={enviandoAnexos}
                        onClick={() => inputAnexosRef.current?.click()}
                      >
                        <HiPaperClip className="h-4 w-4" aria-hidden="true" />
                        {enviandoAnexos ? 'Enviando...' : 'Anexar arquivos'}
                      </button>
                    </>
                  )}
                </div>
              </div>
              {anexos.length === 0 ? (
                <p className="py-3 text-sm text-[var(--c-muted)]">
                  Nenhum arquivo vinculado a esta medição.
                  {podeCompletarAnexos && ' Anexe o documento para que GEO possa aprovar.'}
                </p>
              ) : (
                <div className="mt-1 divide-y divide-[var(--c-border)]">
                  {anexos.map((anexo) => (
                    <div key={anexo.id} className="flex items-center gap-3 py-2">
                      <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-[var(--c-muted)]">
                        {rotuloTipoAnexo(anexo.tipo)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm text-[var(--c-text)]" title={anexo.nome_original}>
                        {anexo.nome_original || 'Arquivo sem nome'}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          className="btn btn-outline btn-sm !px-2"
                          title="Visualizar arquivo"
                          aria-label={`Visualizar ${anexo.nome_original || 'arquivo'}`}
                          disabled={abrindoAnexoId === anexo.id}
                          onClick={() => abrirAnexo(anexo)}
                        >
                          <HiEye className="h-4 w-4" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm !px-2"
                          title="Baixar arquivo"
                          aria-label={`Baixar ${anexo.nome_original || 'arquivo'}`}
                          disabled={baixandoAnexoId === anexo.id}
                          onClick={() => baixarAnexo(anexo)}
                        >
                          <HiArrowDownTray className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {medicaoAprovada && (
              <p className="border-t border-[var(--c-border)] pt-3 text-xs text-[var(--sem-success)]">
                Aprovada em {dataHora(medicao.aprovada_em)} e liberada para o Financeiro.
              </p>
            )}
          </section>

          {daMedicao.length > 0 && (
            <section aria-labelledby="parcelas-medicao">
              <div className="border-b border-[var(--c-border)] pb-2">
                <h4 id="parcelas-medicao" className="text-sm font-semibold text-[var(--c-text)]">
                  Parcelas desta medição
                </h4>
              </div>

              <div className="divide-y divide-[var(--c-border)]">
                {daMedicao.map((p) => (
                  <div key={p.id} className="py-3">
                    {podeEditar && !medicaoAprovada && !temBaixa(p) ? (
                      <FormSecao legenda={`Parcela ${p.numero} — ${p.situacao || p.status}`} colunas={2}>
                        <CampoForm label="Valor" obrigatorio erro={erroPorParcela[p.id]?.valor}>
                          <input
                            className="input input-sm input-moeda"
                            type="text"
                            inputMode="decimal"
                            data-testid={`medicao-valor-${p.numero}`}
                            value={edicao[p.id]?.valor ?? ''}
                            onChange={(e) => {
                              const valor = e.target.value;
                              setEdicao((s) => ({ ...s, [p.id]: { ...s[p.id], valor } }));
                              setErroPorParcela((s) => ({ ...s, [p.id]: { ...s[p.id], valor: '' } }));
                            }}
                          />
                        </CampoForm>
                        <CampoForm label="Vencimento" obrigatorio erro={erroPorParcela[p.id]?.vencimento}>
                          <DateInputBR
                            className="input input-sm"
                            name={`vencimento_medicao_${p.id}`}
                            data-testid={`medicao-vencimento-${p.numero}`}
                            value={edicao[p.id]?.vencimento ?? ''}
                            onChange={(e) => {
                              const vencimento = e.target.value;
                              setEdicao((s) => ({ ...s, [p.id]: { ...s[p.id], vencimento } }));
                              setErroPorParcela((s) => ({ ...s, [p.id]: { ...s[p.id], vencimento: '' } }));
                            }}
                          />
                        </CampoForm>
                      </FormSecao>
                    ) : (
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <span className="text-sm font-medium text-[var(--c-text)]">Parcela {p.numero}</span>
                          <span className="block text-xs text-[var(--c-muted)]">{p.situacao || p.status}</span>
                        </div>
                        <span className="text-sm text-[var(--c-text)]">{moeda(p.valor)}</span>
                        <span className="text-sm text-[var(--c-text)]">{brData(p.vencimento)}</span>
                        <span className="text-xs text-[var(--c-muted)]">
                          {temBaixa(p) ? `Pago ${moeda(p.titulo_valor_baixado)}` : 'Somente leitura'}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {medicaoAprovada && (
                <p className="border-t border-[var(--c-border)] pt-3 text-xs text-[var(--c-muted)]" data-testid="medicao-aprovada-somente-leitura">
                  Medição aprovada e liberada para o Financeiro. Valor e vencimento permanecem somente para consulta.
                </p>
              )}

              {!podeEditar && !medicaoAprovada && (
                <p className="border-t border-[var(--c-border)] pt-3 text-xs text-[var(--c-muted)]" data-testid="medicao-sem-permissao">
                  Alterar uma medição exige permissão especifica.
                </p>
              )}
            </section>
          )}

          {comentarios.length > 0 && (
            <section aria-labelledby="comentarios-medicao">
              <h4 id="comentarios-medicao" className="border-b border-[var(--c-border)] pb-2 text-sm font-semibold text-[var(--c-text)]">
                Comentários da medição
              </h4>
              <div className="divide-y divide-[var(--c-border)]">
                {comentarios.map((h) => (
                  <div key={h.id} className="py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-[var(--c-text)]">
                        {h.usuario?.nome || h.setor || 'Sistema'}
                      </span>
                      <span className="text-xs text-[var(--c-muted)]">{dataHora(h.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-sm text-[var(--c-text)]">{h.observacao || h.descricao || h.acao}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* R27: rodape FIXO — os botoes que gravam e que aprovam nunca saem da vista, por mais
            anexos e comentarios que a medicao tenha. Antes eles eram parte do corpo rolante. */}
        {(podeSalvar || (podeAprovar && !medicaoAprovada)) && (
          <div
            data-modal="rodape"
            className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--c-border)] px-4 py-3"
          >
            <span className="text-xs text-[var(--c-muted)]">
              {podeSalvar
                ? 'A diferenca de valor e redistribuida nas ultimas parcelas do contrato.'
                : 'Aprovar libera o pagamento desta medicao no Financeiro.'}
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {podeSalvar && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  data-testid="salvar-medicao"
                  disabled={salvando}
                  onClick={salvar}
                >
                  {salvando ? 'Salvando...' : 'Salvar alteracoes'}
                </button>
              )}
              {podeAprovar && !medicaoAprovada && (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  data-testid="aprovar-medicao"
                  disabled={aprovando || !temAnexo}
                  title={!temAnexo ? 'Anexe ao menos um arquivo antes de aprovar.' : undefined}
                  onClick={aprovar}
                >
                  {aprovando ? 'Aprovando...' : 'Aprovar e enviar ao Financeiro'}
                </button>
              )}
            </div>
          </div>
        )}
      </OverlayModal>
      {elementoConfirmacao}
      {previewAnexo && (
        <PreviewAnexoModal anexo={previewAnexo} onClose={() => setPreviewAnexo(null)} usarPortal />
      )}
    </>
  );
}
