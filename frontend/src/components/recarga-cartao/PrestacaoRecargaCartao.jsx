import { useEffect, useMemo, useState } from 'react';
import ApropriacaoAutocomplete from '../ui/ApropriacaoAutocomplete';
import { listarApropriacoes } from '../../services/apropriacoes';
import { decidirPrestacaoRecarga, editarRateiosPrestacaoRecarga, enviarPrestacaoRecarga } from '../../services/recargasCartao';
import { uploadArquivos } from '../../services/uploads';
import { getLinkSeguroAnexoSolicitacao } from '../../services/solicitacoes';

function moeda(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function numero(value) {
  if (typeof value === 'number') return value;
  const texto = String(value || '')
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!texto) return 0;
  return Number(texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto) || 0;
}

function moedaCampo(value) {
  if (String(value ?? '').trim() === '') return '';
  return moeda(numero(value));
}

function linhaVazia(obraId = '') {
  return { obra_id: obraId ? String(obraId) : '', apropriacao_id: '', valor_rateio: '' };
}

export default function PrestacaoRecargaCartao({ solicitacaoId, contexto, podeInteragir = true, onAtualizado }) {
  const recarga = contexto?.ultima_recarga || null;
  const prestacao = recarga?.prestacao || null;
  const obras = contexto?.obras_disponiveis || [];
  const podeValidar = contexto?.pode_validar === true;
  const documentosContexto = contexto?.documentos_prestacao || [];
  const [linhas, setLinhas] = useState([linhaVazia(obras.length === 1 ? obras[0]?.id : '')]);
  const [apropriacoesPorObra, setApropriacoesPorObra] = useState({});
  const [observacoes, setObservacoes] = useState('');
  const [motivo, setMotivo] = useState('');
  const [valorEmEdicao, setValorEmEdicao] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [enviandoDocumentos, setEnviandoDocumentos] = useState(false);
  const [abrindoDocumentoId, setAbrindoDocumentoId] = useState(null);
  const [documentos, setDocumentos] = useState(documentosContexto);
  const [erro, setErro] = useState('');
  const [rateiosAlterados, setRateiosAlterados] = useState(false);
  const assinaturaRateios = (prestacao?.rateios || [])
    .map((item) => `${item.id}:${item.obra_id}:${item.apropriacao_id}:${item.valor_rateio}`)
    .join('|');
  const assinaturaDocumentos = documentosContexto
    .map((documento) => `${documento.id}:${documento.nome_original}:${documento.caminho_arquivo}`)
    .join('|');

  useEffect(() => {
    const rateios = prestacao?.rateios || [];
    setLinhas(rateios.length
      ? rateios.map((item) => ({
          id: String(item.id || ''),
          obra_id: String(item.obra_id || item.obra?.id || ''),
          apropriacao_id: String(item.apropriacao_id || item.apropriacao?.id || ''),
          valor_rateio: String(item.valor_rateio ?? '')
        }))
      : [linhaVazia(obras.length === 1 ? obras[0]?.id : '')]);
    setObservacoes(prestacao?.observacoes || '');
    setMotivo(prestacao?.motivo_rejeicao || '');
    setRateiosAlterados(false);
  }, [prestacao?.id, prestacao?.updatedAt, assinaturaRateios, obras.length]);

  useEffect(() => {
    setDocumentos(documentosContexto);
  }, [assinaturaDocumentos]);

  useEffect(() => {
    const ids = [...new Set(linhas.map((linha) => Number(linha.obra_id)).filter(Boolean))];
    ids.forEach((obraId) => {
      if (apropriacoesPorObra[obraId]) return;
      listarApropriacoes({ obra_id: obraId })
        .then((dados) => {
          const lista = Array.isArray(dados) ? dados : dados?.items || dados?.rows || [];
          setApropriacoesPorObra((atual) => ({
            ...atual,
            [obraId]: lista.filter((item) => item?.ativo !== false)
          }));
        })
        .catch(() => setApropriacoesPorObra((atual) => ({ ...atual, [obraId]: [] })));
    });
  }, [linhas, apropriacoesPorObra]);

  const valorBase = Number(prestacao?.valor_base || recarga?.valor_efetivo || 0);
  const total = useMemo(() => linhas.reduce((acc, linha) => acc + numero(linha.valor_rateio), 0), [linhas]);
  const saldo = Math.round((valorBase - total + Number.EPSILON) * 100) / 100;
  const status = String(prestacao?.status || 'PENDENTE').toUpperCase();
  // A prestacao faz parte das interacoes da solicitacao. Vinculos secundarios e permissoes de
  // visualizacao podem mostrar os dados, mas nunca liberam rateio, envio ou decisao fora do setor.
  const podeEditarPrestacao = podeInteragir && ['PENDENTE', 'REJEITADA'].includes(status);
  const podeEditarDestinosGeo = podeInteragir && podeValidar && status === 'ENVIADA';

  function atualizar(index, campo, value) {
    setLinhas((atuais) => atuais.map((linha, i) => {
      if (i !== index) return linha;
      if (campo === 'obra_id') return { ...linha, obra_id: value, apropriacao_id: '' };
      return { ...linha, [campo]: value };
    }));
    if (podeEditarDestinosGeo && ['obra_id', 'apropriacao_id'].includes(campo)) setRateiosAlterados(true);
  }

  async function enviar() {
    if (!solicitacaoId || salvando || enviandoDocumentos) return;
    if (documentos.length === 0) {
      setErro('Anexe ao menos um documento da prestação de contas antes de enviar.');
      return;
    }
    setErro('');
    setSalvando(true);
    try {
      await enviarPrestacaoRecarga(solicitacaoId, {
        observacoes,
        rateios: linhas.map((linha) => ({
          obra_id: Number(linha.obra_id),
          apropriacao_id: Number(linha.apropriacao_id),
          valor_rateio: numero(linha.valor_rateio)
        }))
      });
      await onAtualizado?.();
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  async function anexarDocumentos(event) {
    const arquivos = Array.from(event.target.files || []);
    event.target.value = '';
    if (!solicitacaoId || arquivos.length === 0 || enviandoDocumentos || salvando) return;
    setErro('');
    setEnviandoDocumentos(true);
    try {
      const novos = await uploadArquivos({
        files: arquivos,
        tipo: 'PRESTACAO_RECARGA',
        solicitacao_id: solicitacaoId
      });
      const registros = Array.isArray(novos) ? novos : [];
      setDocumentos((atuais) => {
        const idsNovos = new Set(registros.map((item) => String(item.id)));
        return [...registros, ...atuais.filter((item) => !idsNovos.has(String(item.id)))];
      });
    } catch (error) {
      setErro(error.message || 'Não foi possível anexar os documentos da prestação.');
    } finally {
      setEnviandoDocumentos(false);
    }
  }

  async function abrirDocumento(documento) {
    if (!documento?.caminho_arquivo || abrindoDocumentoId) return;
    setErro('');
    setAbrindoDocumentoId(documento.id);
    try {
      const url = await getLinkSeguroAnexoSolicitacao(documento.caminho_arquivo);
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setErro(error.message || 'Não foi possível abrir o documento.');
    } finally {
      setAbrindoDocumentoId(null);
    }
  }

  async function decidir(aprovar) {
    if (!solicitacaoId || salvando) return;
    setErro('');
    setSalvando(true);
    try {
      await decidirPrestacaoRecarga(solicitacaoId, { aprovar, motivo });
      await onAtualizado?.();
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  async function salvarDestinosGeo() {
    if (!solicitacaoId || salvando || !rateiosAlterados) return;
    setErro('');
    setSalvando(true);
    try {
      await editarRateiosPrestacaoRecarga(solicitacaoId, {
        rateios: linhas.map((linha) => ({
          id: Number(linha.id),
          obra_id: Number(linha.obra_id),
          apropriacao_id: Number(linha.apropriacao_id)
        }))
      });
      setRateiosAlterados(false);
      await onAtualizado?.();
    } catch (error) {
      setErro(error.message);
    } finally {
      setSalvando(false);
    }
  }

  if (!prestacao || valorBase <= 0) return null;

  return (
    <section className="min-w-0 space-y-3" aria-labelledby={`prestacao-recarga-${solicitacaoId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--c-border)] pb-3">
        <div>
          <h3 id={`prestacao-recarga-${solicitacaoId}`} className="text-sm font-semibold text-[var(--c-text)]">
            Prestação de contas da recarga
          </h3>
          <p className="text-xs text-[var(--c-muted)]">
            Distribua {moeda(valorBase)} entre as obras e apropriações vinculadas ao solicitante.
          </p>
        </div>
        <span className="app-status-pill bg-[var(--ui-surface-2)] text-[var(--c-text)]">{status}</span>
      </div>

      {prestacao?.motivo_rejeicao && status === 'REJEITADA' ? (
        <div className="app-alert app-alert--warning">Correção solicitada: {prestacao.motivo_rejeicao}</div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-[var(--c-border)]">
        <div className="hidden grid-cols-[minmax(190px,0.9fr)_minmax(240px,1.3fr)_minmax(130px,0.45fr)_auto] gap-3 bg-[var(--ui-surface-2)] px-3 py-2 text-xs uppercase tracking-wide text-[var(--c-muted)] lg:grid">
          <span>Obra / Centro de custo</span>
          <span>Apropriação</span>
          <span>Valor</span>
          <span className="text-right">Ação</span>
        </div>

        <div className="divide-y divide-[var(--c-border)]">
          {linhas.map((linha, index) => (
            <div
              key={`prestacao-${index}`}
              className="grid min-w-0 gap-3 p-3 sm:grid-cols-2 lg:grid-cols-[minmax(190px,0.9fr)_minmax(240px,1.3fr)_minmax(130px,0.45fr)_auto] lg:items-start"
            >
              <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--c-muted)] lg:block">
                <span className="lg:hidden">Obra / Centro de custo</span>
                  <select
                    className="input input-sm w-full"
                    value={linha.obra_id}
                    onChange={(event) => atualizar(index, 'obra_id', event.target.value)}
                    disabled={(!podeEditarPrestacao && !podeEditarDestinosGeo) || salvando}
                    aria-label={`Obra do rateio ${index + 1}`}
                  >
                    <option value="">Selecione</option>
                    {obras.map((obra) => <option key={obra.id} value={obra.id}>{obra.codigo} - {obra.nome}</option>)}
                  </select>
              </label>

              <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--c-muted)] lg:block">
                <span className="lg:hidden">Apropriação</span>
                  <ApropriacaoAutocomplete
                    value={linha.apropriacao_id}
                    options={apropriacoesPorObra[Number(linha.obra_id)] || []}
                    onChange={(value) => atualizar(index, 'apropriacao_id', value)}
                    disabled={!linha.obra_id || (!podeEditarPrestacao && !podeEditarDestinosGeo) || salvando}
                    placeholder={linha.obra_id ? 'Buscar apropriação' : 'Selecione a obra'}
                    inputClassName="input input-sm w-full"
                  />
              </label>

              <label className="grid min-w-0 gap-1 text-xs font-semibold text-[var(--c-muted)] lg:block">
                <span className="lg:hidden">Valor</span>
                  <input
                    className="input input-sm w-full font-[inherit] tabular-nums"
                    value={valorEmEdicao === index ? linha.valor_rateio : moedaCampo(linha.valor_rateio)}
                    onChange={(event) => atualizar(index, 'valor_rateio', event.target.value)}
                    onFocus={() => setValorEmEdicao(index)}
                    onBlur={() => setValorEmEdicao(null)}
                    disabled={!podeEditarPrestacao || salvando}
                    inputMode="decimal"
                    placeholder="R$ 0,00"
                    aria-label={`Valor do rateio ${index + 1}`}
                  />
              </label>

              <div className="flex items-end justify-end sm:col-span-2 lg:col-span-1">
                {podeEditarPrestacao ? (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setLinhas((atuais) => atuais.filter((_, i) => i !== index))}
                    disabled={salvando || linhas.length === 1}
                  >
                    Remover
                  </button>
                ) : <span className="px-3 py-2 text-xs text-[var(--c-muted)]">—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {podeEditarPrestacao ? (
        <button
          type="button"
          className="btn btn-outline btn-sm"
          onClick={() => setLinhas((atuais) => [...atuais, linhaVazia(obras.length === 1 ? obras[0]?.id : '')])}
          disabled={salvando}
        >
          Adicionar rateio
        </button>
      ) : null}

      <div className="grid gap-2 border-y border-[var(--c-border)] py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-[var(--c-text)]">
              Documentos da prestação <span className="text-red-600" aria-hidden="true">*</span>
            </div>
            <p className="text-xs text-[var(--c-muted)]">
              Anexe ao menos um comprovante ou documento antes de enviar a prestação.
            </p>
          </div>
          {podeEditarPrestacao ? (
            <label className={`btn btn-outline btn-sm ${enviandoDocumentos || salvando ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
              {enviandoDocumentos ? 'Enviando documentos...' : 'Anexar documentos'}
              <input
                type="file"
                className="sr-only"
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.png,.jpg,.jpeg,.rar"
                onChange={anexarDocumentos}
                disabled={enviandoDocumentos || salvando}
              />
            </label>
          ) : null}
        </div>

        {documentos.length > 0 ? (
          <ul className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)]">
            {documentos.map((documento) => (
              <li key={documento.id} className="flex min-w-0 items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0 truncate text-sm text-[var(--c-text)]" title={documento.nome_original}>
                  {documento.nome_original || `Documento #${documento.id}`}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm shrink-0"
                  onClick={() => abrirDocumento(documento)}
                  disabled={abrindoDocumentoId === documento.id}
                >
                  {abrindoDocumentoId === documento.id ? 'Abrindo...' : 'Abrir'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs font-medium text-amber-700">Nenhum documento anexado.</p>
        )}
      </div>

      <div className="grid gap-3 text-sm lg:grid-cols-[1fr_auto] lg:items-center">
        <div className="grid gap-1 tabular-nums sm:grid-cols-3 sm:gap-x-5">
          <span>Valor a prestar: <strong>{moeda(valorBase)}</strong></span>
          <span>Informado: <strong>{moeda(total)}</strong></span>
          <span className={saldo === 0 ? 'text-emerald-700' : 'text-amber-700'}>Diferença: <strong>{moeda(saldo)}</strong></span>
        </div>
        {podeEditarPrestacao ? (
          <button type="button" className="btn btn-primary btn-sm w-full sm:w-auto" onClick={enviar} disabled={salvando || enviandoDocumentos || saldo !== 0 || documentos.length === 0}>
            {salvando ? 'Enviando prestação...' : 'Enviar prestação'}
          </button>
        ) : null}
      </div>

      {podeEditarPrestacao ? (
        <label className="grid gap-1 text-sm">
          Observações
          <textarea className="input min-h-[72px]" value={observacoes} onChange={(event) => setObservacoes(event.target.value)} disabled={salvando} />
        </label>
      ) : null}

      {podeInteragir && podeValidar && status === 'ENVIADA' ? (
        <div className="grid gap-3 border-t border-[var(--c-border)] pt-3">
          <div className="flex flex-wrap items-center justify-between gap-3 bg-[var(--ui-surface-2)] px-3 py-2">
            <p className="text-xs text-[var(--c-muted)]">
              Ajuste obra e apropriação acima, se necessário. Os valores informados pelo solicitante permanecem preservados.
            </p>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={salvarDestinosGeo}
              disabled={salvando || !rateiosAlterados || linhas.some((linha) => !linha.obra_id || !linha.apropriacao_id)}
            >
              {salvando && rateiosAlterados ? 'Salvando rateio...' : 'Salvar obra e apropriação'}
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="grid gap-1 text-sm">
              Motivo para rejeição
              <input className="input input-sm" value={motivo} onChange={(event) => setMotivo(event.target.value)} placeholder="Obrigatório somente ao rejeitar" />
            </label>
            <div className="flex items-end gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => decidir(false)} disabled={salvando || !motivo.trim() || rateiosAlterados}>Rejeitar prestação</button>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => decidir(true)} disabled={salvando || rateiosAlterados}>Validar prestação</button>
            </div>
          </div>
          {rateiosAlterados ? <p className="text-xs text-amber-700">Salve as alterações de obra e apropriação antes de validar ou rejeitar.</p> : null}
        </div>
      ) : null}

      {erro ? <div className="app-alert app-alert--error" role="alert">{erro}</div> : null}
    </section>
  );
}
