import { useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  createFiscalAccountingBatch,
  generateFiscalAccountingBatch,
  getFiscalAccountingBatch,
  getFiscalAccountingBatches,
  getFiscalAccountingBatchZipUrl,
  getFiscalCompanies
} from '../services/fiscalApi';

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function periodoDoLote(batch) {
  if (!batch) return '-';
  return `${String(batch.reference_month).padStart(2, '0')}/${batch.reference_year}`;
}

/*
  R25 — o status do lote é chave técnica em inglês; a classificação
  automática do StatusBadge lê vocabulário em português e cairia em "info"
  para todos eles. Mapa EXPLÍCITO, com o significado contábil de cada
  estado: rascunho ainda dá para refazer, gerado já produziu arquivo,
  enviado é o ponto sem volta, cancelado é encerrado.
*/
const FAMILIA_STATUS_LOTE = {
  draft: 'warning',
  generated: 'info',
  sent: 'success',
  cancelled: 'neutral'
};

const ROTULO_STATUS_LOTE = {
  draft: 'Rascunho',
  generated: 'Gerado',
  sent: 'Enviado',
  cancelled: 'Cancelado'
};

function familiaStatusLote(status) {
  return FAMILIA_STATUS_LOTE[String(status || '').toLowerCase()] || 'info';
}

function rotuloStatusLote(status) {
  return ROTULO_STATUS_LOTE[String(status || '').toLowerCase()] || status || '-';
}

export default function FiscalAccountingBatches() {
  const today = useMemo(() => new Date(), []);
  const [companies, setCompanies] = useState([]);
  const [batches, setBatches] = useState([]);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [form, setForm] = useState({
    fiscal_company_id: '',
    reference_month: String(today.getMonth() + 1),
    reference_year: String(today.getFullYear())
  });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [openingZip, setOpeningZip] = useState(false);
  const [opening, setOpening] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const load = async () => {
    setLoading(true);
    try {
      const [batchesResult, companiesResult] = await Promise.all([
        getFiscalAccountingBatches(),
        getFiscalCompanies({ ativo: true })
      ]);
      setBatches(batchesResult?.data || []);
      const nextCompanies = companiesResult?.data || [];
      setCompanies(nextCompanies);
      setForm((current) => ({
        ...current,
        fiscal_company_id: current.fiscal_company_id || String(nextCompanies[0]?.id || '')
      }));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar lotes contabeis fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    setCreating(true);
    try {
      const result = await createFiscalAccountingBatch({
        fiscal_company_id: form.fiscal_company_id,
        reference_month: form.reference_month,
        reference_year: form.reference_year
      });
      /*
        DEFEITO DE SIGNIFICADO CONSERTADO: o backend devolve `created: false`
        com a mensagem "Ja existe um lote contabil fiscal para esta empresa e
        periodo" — nada foi criado. A tela pintava essa resposta na MESMA
        faixa verde de sucesso do lote recém-criado, e quem lia "processado"
        acreditava ter gerado o rascunho do período. Agora o tom segue o que
        de fato aconteceu.
      */
      if (result?.created) {
        avisar.sucesso(result?.message || 'Lote contabil fiscal criado em modo rascunho.');
      } else {
        avisar.alerta(result?.message || 'Ja existe um lote contabil fiscal para esta empresa e periodo — nenhum lote novo foi criado.');
      }
      setSelectedBatch(result?.batch || null);
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao criar lote contabil fiscal');
    } finally {
      setCreating(false);
    }
  };

  const openBatch = async (batch) => {
    // R26: alvo fixado ANTES do await — a lista recarrega sozinha e ler o
    // estado depois abriria outro lote.
    const alvo = batch;
    setOpening(true);
    try {
      const result = await getFiscalAccountingBatch(alvo.id);
      setSelectedBatch(result);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao abrir lote contabil fiscal');
    } finally {
      setOpening(false);
    }
  };

  const generateBatchFile = async (batch) => {
    /*
      R26 — o lote é fixado numa `const` ANTES da confirmação, e a ação usa
      ESSA referência. O modal do sistema NÃO congela a página: com a lista
      ao lado, clicar noutro lote enquanto a pergunta está aberta faria a
      tela perguntar sobre o lote A e fechar o lote B — consentimento válido
      registrado para a ação errada, que nenhum log denuncia.

      A confirmação existe porque gerar o arquivo NÃO é só baixar um ZIP:
      o backend muda o status do lote para `generated`, grava o ZIP no S3
      fiscal e registra o evento de segurança. Um lote em `sent` ou
      `cancelled` não pode mais ser gerado — ou seja, este é o passo que
      fecha o período contábil.
    */
    const lote = batch;
    if (!lote) return;
    const documentos = Number(lote.total_documents || 0);
    const periodo = periodoDoLote(lote);
    const empresa = lote.company?.razao_social || 'empresa fiscal';

    const { ok } = await confirmar({
      titulo: 'Gerar arquivo do lote contábil',
      mensagem: `Gerar o ZIP do lote #${lote.id} (${periodo}, ${empresa}) com ${documentos} documento(s) e ${formatMoney(lote.total_value)}? O lote passa a "Gerado", o arquivo vai para o storage fiscal e a operação fica registrada na trilha de auditoria. Esta ação não pode ser desfeita.`,
      rotuloConfirmar: 'Gerar arquivo',
      destrutiva: true
    });
    if (!ok) return;

    setGenerating(true);
    try {
      const result = await generateFiscalAccountingBatch(lote.id);
      avisar.sucesso(`Arquivo ZIP do lote #${lote.id} (${periodo}) gerado com ${documentos} documento(s).`);
      setSelectedBatch(result?.batch || null);
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar arquivo do lote contabil fiscal');
    } finally {
      setGenerating(false);
    }
  };

  const openZip = async (batch) => {
    // R26: mesma disciplina — o id vem do lote fixado, não do estado relido.
    const alvo = batch;
    setOpeningZip(true);
    try {
      const result = await getFiscalAccountingBatchZipUrl(alvo.id);
      if (result?.url) window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      avisar.erro(err.message || 'Erro ao abrir ZIP do lote contabil fiscal');
    } finally {
      setOpeningZip(false);
    }
  };

  const totalDocumentos = useMemo(
    () => batches.reduce((soma, batch) => soma + Number(batch.total_documents || 0), 0),
    [batches]
  );

  return (
    <Pagina className="fiscal-page">
      <PageHeader
        titulo="Exportação contábil"
        contagem={`${batches.length} lotes`}
        descricao="Lotes com documentos fiscais validados, prontos para o envio contábil."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 — o formulário fica INLINE, acima da lista (padrão de TELA MISTA).
        Teste da regra: tirando o formulário, o que sobra é uma lista de
        lotes que ninguém abriria por si só — gerar o rascunho do período É o
        trabalho pelo qual se abre esta tela.
      */}
      <BlocoConteudo
        titulo="Gerar rascunho do período"
        descricao="Reune os documentos fiscais VALIDADOS da empresa no mês de referência. Se já existir lote do período, nenhum novo e criado."
        variante="secundario"
      >
        <form onSubmit={submit}>
          <FormSecao colunas={4}>
            <CampoForm label="Empresa fiscal" obrigatorio>
              <select
                className="input"
                value={form.fiscal_company_id}
                onChange={(event) => setForm((current) => ({ ...current, fiscal_company_id: event.target.value }))}
                required
              >
                <option value="">Empresa fiscal</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.razao_social}</option>
                ))}
              </select>
            </CampoForm>
            <CampoForm label="Mês" obrigatorio>
              <input
                className="input"
                type="number"
                min="1"
                max="12"
                value={form.reference_month}
                onChange={(event) => setForm((current) => ({ ...current, reference_month: event.target.value }))}
                required
              />
            </CampoForm>
            <CampoForm label="Ano" obrigatorio>
              <input
                className="input"
                type="number"
                min="2000"
                max="2100"
                value={form.reference_year}
                onChange={(event) => setForm((current) => ({ ...current, reference_year: event.target.value }))}
                required
              />
            </CampoForm>
            <CampoForm label="Ação">
              <div className="app-actionbar">
                <button className="btn btn-primary" type="submit" disabled={creating}>
                  {creating ? 'Gerando...' : 'Gerar rascunho'}
                </button>
              </div>
            </CampoForm>
          </FormSecao>
        </form>
      </BlocoConteudo>

      {/* B2 — o bloco principal é a lista de lotes: é ela que responde à
          pergunta central da tela ("o que já foi fechado, e o que falta?"). */}
      <BlocoConteudo
        titulo="Lotes contábeis"
        contagem={`${batches.length} lotes`}
        descricao={`${totalDocumentos} documento(s) fiscais incluidos no total.`}
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'periodo',
              titulo: 'Período',
              tipo: 'data',
              render: (batch) => periodoDoLote(batch)
            },
            {
              id: 'empresa',
              titulo: 'Empresa',
              // R17: o lote é lido pela EMPRESA fiscal a que pertence — é o
              // nome próprio da linha.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (batch) => batch.company?.razao_social || '-'
            },
            {
              id: 'documentos',
              titulo: 'Documentos',
              tipo: 'numero',
              render: (batch) => batch.total_documents || 0
            },
            {
              id: 'valor',
              titulo: 'Valor',
              tipo: 'valor',
              render: (batch) => formatMoney(batch.total_value)
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (batch) => (
                <StatusBadge status={rotuloStatusLote(batch.status)} kind={familiaStatusLote(batch.status)} />
              )
            },
            {
              id: 'arquivo',
              titulo: 'Arquivo',
              tipo: 'badge',
              render: (batch) => (
                <StatusBadge
                  status={batch.zip_storage_key ? 'ZIP gerado' : 'Pendente'}
                  kind={batch.zip_storage_key ? 'success' : 'warning'}
                />
              )
            }
          ]}
          itens={batches}
          carregando={loading}
          vazio="Nenhum lote contábil fiscal encontrado."
          storageKey="tabela:lotes-contabeis-fiscais"
          rotuloRolagem="Lotes contabeis"
          linhaSelecionada={(batch) => String(batch.id) === String(selectedBatch?.id)}
          larguraAcoes={200}
          acoesLinha={(batch) => (
            <>
              <button className="btn btn-outline" type="button" onClick={() => openBatch(batch)} disabled={opening}>
                Abrir
              </button>
              {batch.zip_storage_key ? (
                <button className="btn btn-outline" type="button" onClick={() => openZip(batch)} disabled={openingZip}>
                  ZIP
                </button>
              ) : null}
            </>
          )}
        />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Detalhe do lote"
        contagem={selectedBatch ? `Lote #${selectedBatch.id}` : null}
        descricao={selectedBatch ? `${periodoDoLote(selectedBatch)} · ${selectedBatch.company?.razao_social || '-'}` : null}
        variante="secundario"
        acoes={selectedBatch ? (
          <>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => generateBatchFile(selectedBatch)}
              disabled={generating}
            >
              {generating ? 'Gerando ZIP...' : 'Gerar ZIP'}
            </button>
            {selectedBatch.zip_storage_key ? (
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => openZip(selectedBatch)}
                disabled={openingZip}
              >
                Abrir ZIP
              </button>
            ) : null}
          </>
        ) : null}
      >
        {selectedBatch ? (
          <>
            <StatGrid colunas={4}>
              <StatTile label="Período" valor={periodoDoLote(selectedBatch)} />
              <StatTile
                label="Status"
                valor={<StatusBadge status={rotuloStatusLote(selectedBatch.status)} kind={familiaStatusLote(selectedBatch.status)} />}
              />
              <StatTile label="Documentos" valor={selectedBatch.total_documents || 0} />
              <StatTile label="Valor total" valor={formatMoney(selectedBatch.total_value)} />
            </StatGrid>

            <TabelaPadrao
              colunas={[
                {
                  id: 'fornecedor',
                  titulo: 'Fornecedor',
                  // R17: o item do lote é lido pelo emitente do documento.
                  tipo: 'identidade',
                  noCard: 'titulo',
                  render: (item) => item.document?.issuer_name || item.document?.issuer_cnpj || '-'
                },
                {
                  id: 'numero',
                  titulo: 'NF',
                  tipo: 'codigo',
                  render: (item) => item.document?.document_number || '-'
                },
                {
                  id: 'emissao',
                  titulo: 'Emissão',
                  tipo: 'data',
                  render: (item) => formatDate(item.document?.emission_date)
                },
                {
                  id: 'valor',
                  titulo: 'Valor',
                  tipo: 'valor',
                  render: (item) => formatMoney(item.document?.total_value)
                },
                {
                  id: 'xml',
                  titulo: 'XML',
                  tipo: 'badge',
                  render: (item) => (
                    <StatusBadge status={item.included_xml ? 'Incluido' : 'Ausente'} kind={item.included_xml ? 'success' : 'warning'} />
                  )
                },
                {
                  id: 'pdf',
                  titulo: 'PDF/DANFE',
                  tipo: 'badge',
                  render: (item) => (
                    <StatusBadge status={item.included_pdf ? 'Incluido' : 'Ausente'} kind={item.included_pdf ? 'success' : 'warning'} />
                  )
                }
              ]}
              itens={selectedBatch.items || []}
              vazio="Este lote não tem documentos incluidos."
              storageKey="tabela:lotes-contabeis-fiscais:documentos-do-lote"
              rotuloRolagem="Documentos do lote"
            />
          </>
        ) : (
          <p className="text-sm text-[var(--c-muted)]">
            Selecione um lote para conferir os documentos que entraram no rascunho.
          </p>
        )}
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
