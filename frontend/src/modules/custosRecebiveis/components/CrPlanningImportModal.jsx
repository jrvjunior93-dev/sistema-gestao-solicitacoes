import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineCheckCircle,
  HiOutlineExclamationTriangle,
  HiOutlineMagnifyingGlass,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark
} from 'react-icons/hi2';
import { TabelaPadrao } from '../../../components/padrao';
import { revalidarItensPlanilhaPlanejamento } from '../services/custosRecebiveis';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const TITLES = {
  custos: 'Custos planejados',
  'medicao-prevista': 'Medição prevista',
  'medicao-aprovada': 'Medição aprovada'
};

function asNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function keyOf(row, index = 0) {
  return row.chave_importacao || row.plano_item_id || `${row.descricao}-${row.unidade}-${index}`;
}

export default function CrPlanningImportModal({
  obraId,
  competencia,
  tipo,
  preview,
  onClose,
  onConfirm
}) {
  const [rows, setRows] = useState([]);
  const [result, setResult] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [validating, setValidating] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [catalogSearch, setCatalogSearch] = useState('');

  useEffect(() => {
    setRows(preview?.itens || []);
    setResult(preview || null);
    setDirty(false);
    setRequestError('');
    setCatalogSearch('');
  }, [preview]);

  const isCosts = tipo === 'custos';
  const catalog = preview?.catalogo || [];
  const selectedIds = useMemo(
    () => new Set(rows.map((row) => Number(row.plano_item_id)).filter(Boolean)),
    [rows]
  );
  const availableCatalog = useMemo(() => {
    const term = catalogSearch.trim().toLocaleLowerCase('pt-BR');
    return catalog.filter((item) => {
      if (!isCosts && selectedIds.has(Number(item.plano_item_id))) return false;
      if (!term) return true;
      return [item.codigo, item.item_codigo, item.descricao, item.etapa_macro_descricao]
        .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
    }).slice(0, 40);
  }, [catalog, catalogSearch, isCosts, selectedIds]);

  function markDirty(nextRows) {
    setRows(nextRows);
    setDirty(true);
    setRequestError('');
  }

  function updateRow(index, field, value) {
    markDirty(rows.map((row, rowIndex) => {
      if (rowIndex !== index) return row;
      const next = { ...row, [field]: value, erros: [] };
      const quantity = field === 'quantidade' ? asNumber(value) : asNumber(next.quantidade);
      const unitValue = field === 'valor_unitario' ? asNumber(value) : asNumber(next.valor_unitario);
      next.valor_total = quantity * unitValue;
      return next;
    }));
  }

  function removeRow(index) {
    markDirty(rows.filter((_, rowIndex) => rowIndex !== index));
  }

  function addFreeCost() {
    markDirty([...rows, {
      chave_importacao: `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      descricao: '',
      unidade: '',
      valor_unitario: '',
      quantidade: '',
      valor_total: 0,
      erros: []
    }]);
  }

  function addCatalogItem(item) {
    markDirty([...rows, {
      ...item,
      chave_importacao: `item-${item.plano_item_id}`,
      quantidade: '',
      valor_total: 0,
      erros: []
    }]);
    setCatalogSearch('');
  }

  async function revalidate() {
    if (!rows.length) {
      setRequestError('Adicione ao menos um item com quantidade maior que zero.');
      return;
    }
    if (rows.some((row) => asNumber(row.quantidade) <= 0)) {
      setRequestError('Preencha uma quantidade maior que zero em todos os itens da prévia ou exclua a linha.');
      return;
    }
    try {
      setValidating(true);
      setRequestError('');
      const response = await revalidarItensPlanilhaPlanejamento(
        obraId,
        competencia,
        tipo,
        rows
      );
      setRows(response.itens || []);
      setResult(response);
      setDirty(false);
    } catch (error) {
      setRequestError(error.message || 'Não foi possível revalidar a prévia.');
    } finally {
      setValidating(false);
    }
  }

  const valid = Boolean(result?.resumo?.valido) && !dirty && rows.length > 0;

  // A edição inline grava por ÍNDICE (updateRow/removeRow): a tabela recebe
  // a linha já emparelhada com o seu índice na prévia.
  const linhas = rows.map((row, index) => ({ id: keyOf(row, index), index, row }));

  return (
    <div className="cr-import-modal-backdrop" role="presentation">
      <section
        className="cr-import-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cr-import-title"
      >
        <header className="cr-import-modal__header">
          <div>
            <span>Prévia da importação</span>
            <h2 id="cr-import-title">{TITLES[tipo] || 'Planejamento mensal'}</h2>
            <p>{preview?.obra?.codigo} · {preview?.obra?.nome} · competência {competencia}</p>
          </div>
          <button type="button" className="cr-icon-action" onClick={onClose} aria-label="Fechar prévia">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </header>

        <div className="cr-import-modal__metrics">
          <div><span>Itens</span><strong>{rows.length}</strong></div>
          <div><span>Válidos</span><strong>{result?.resumo?.itens_validos || 0}</strong></div>
          <div data-tone={result?.resumo?.itens_invalidos ? 'error' : 'success'}>
            <span>Inconsistências</span><strong>{result?.resumo?.itens_invalidos || 0}</strong>
          </div>
          <div><span>Total</span><strong>{currency.format(result?.resumo?.valor_total || 0)}</strong></div>
        </div>

        <div className="cr-import-modal__add">
          {isCosts ? (
            <button type="button" className="btn btn-outline" onClick={addFreeCost}>
              <HiOutlinePlus className="h-4 w-4" />
              Adicionar linha livre
            </button>
          ) : <label>
            <span>Adicionar item do orçamento</span>
            <div>
              <HiOutlineMagnifyingGlass className="h-4 w-4" />
              <input
                type="search"
                value={catalogSearch}
                placeholder="Pesquise por código ou descrição..."
                onChange={(event) => setCatalogSearch(event.target.value)}
              />
            </div>
          </label>}
          {!isCosts && catalogSearch ? (
            <div className="cr-import-modal__catalog">
              {availableCatalog.map((item) => (
                <button
                  key={item.plano_item_id || item.codigo}
                  type="button"
                  onClick={() => addCatalogItem(item)}
                >
                  <span>{item.item_codigo || item.codigo} · {item.descricao}</span>
                  <small>{item.unidade || 'un'} · saldo {item.saldo_disponivel}</small>
                  <HiOutlinePlus className="h-4 w-4" />
                </button>
              ))}
              {!availableCatalog.length ? <span>Nenhuma opção disponível.</span> : null}
            </div>
          ) : null}
        </div>

        {requestError ? <div className="cr-feedback" data-tone="error">{requestError}</div> : null}
        {result?.erros?.length ? (
          <details className="cr-import-modal__errors" open>
            <summary>
              <HiOutlineExclamationTriangle className="h-4 w-4" />
              {result.erros.length} inconsistência(s) para revisar
            </summary>
            <div>{result.erros.map((error) => <span key={error}>{error}</span>)}</div>
          </details>
        ) : null}

        <div className="cr-import-modal__table">
          <TabelaPadrao
            /*
              GRADE DE LANÇAMENTO, NÃO LISTA DE CONSULTA (05/09).
              A maioria das colunas aqui é campo de digitação, não dado a ler.
              Oferecer "escolher colunas" numa grade assim dá ao usuário como
              esconder o campo que ele precisa preencher — e ele não descobre por
              que o lançamento parou de funcionar. A capacidade sai DAQUI, não do
              sistema: nas 246 tabelas de consulta ela continua.
            */
            colunasConfiguraveis={false}
            colunas={[
              {
                id: isCosts ? 'descricao' : 'etapa',
                titulo: isCosts ? 'Descrição' : 'Etapa / item',
                // A descrição ou a etapa/item nomeia a linha, conforme o tipo de importação.
                tipo: 'identidade',
                noCard: 'titulo',
                render: ({ row, index }) => isCosts ? (
                  <input
                    value={row.descricao || ''}
                    onChange={(event) => updateRow(index, 'descricao', event.target.value)}
                  />
                ) : (
                  <>
                    <strong>{row.etapa_macro_codigo}</strong>
                    <span>{row.item_codigo} · {row.descricao}</span>
                  </>
                )
              },
              ...(isCosts ? [
                {
                  id: 'unidade',
                  titulo: 'Unid.',
                  tipo: 'texto',
                  render: ({ row, index }) => (
                    <input
                      value={row.unidade || ''}
                      onChange={(event) => updateRow(index, 'unidade', event.target.value)}
                    />
                  )
                },
                {
                  id: 'valor_unitario',
                  titulo: 'Valor unit.',
                  tipo: 'valor',
                  render: ({ row, index }) => (
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={row.valor_unitario}
                      onChange={(event) => updateRow(index, 'valor_unitario', event.target.value)}
                    />
                  )
                }
              ] : [
                { id: 'unidade', titulo: 'Unid.', tipo: 'texto', render: ({ row }) => row.unidade || 'un' },
                { id: 'quantidade_orcada', titulo: 'Orçado', tipo: 'numero', render: ({ row }) => row.quantidade_orcada },
                { id: 'saldo_disponivel', titulo: 'Saldo', tipo: 'numero', render: ({ row }) => row.saldo_disponivel }
              ]),
              {
                id: 'quantidade',
                titulo: 'Qtde.',
                tipo: 'numero',
                render: ({ row, index }) => (
                  <>
                    <input
                      type="number"
                      min="0"
                      max={isCosts ? undefined : row.saldo_disponivel}
                      step="0.0001"
                      value={row.quantidade}
                      onChange={(event) => updateRow(index, 'quantidade', event.target.value)}
                    />
                    {row.erros?.length ? <small>{row.erros.join(' ')}</small> : null}
                  </>
                )
              },
              {
                id: 'valor_total',
                titulo: 'Total',
                tipo: 'valor',
                render: ({ row }) => <strong>{currency.format(row.valor_total || 0)}</strong>
              }
            ]}
            itens={linhas}
            getId={(linha) => linha.id}
            urgencia={(linha) => (linha.row.erros?.length ? 'danger' : null)}
            storageKey={`tabela:custos-recebiveis-previa-importacao:${isCosts ? 'custos' : 'medicao'}`}
            rotuloRolagem="Prévia da importação"
            vazio="Nenhuma linha com quantidade maior que zero."
            acoesLinha={({ index }) => (
              <button
                type="button"
                className="cr-icon-action"
                onClick={() => removeRow(index)}
                aria-label="Excluir item da prévia"
              >
                <HiOutlineTrash className="h-4 w-4" />
              </button>
            )}
            larguraAcoes={120}
          />
        </div>

        <footer className="cr-import-modal__footer">
          <div data-state={valid ? 'valid' : 'pending'}>
            {valid ? <HiOutlineCheckCircle className="h-5 w-5" /> : <HiOutlineExclamationTriangle className="h-5 w-5" />}
            <span>{valid ? 'Todos os itens passaram na validação.' : 'Valide novamente após qualquer alteração.'}</span>
          </div>
          <div>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button type="button" className="btn btn-outline" disabled={validating} onClick={revalidate}>
              {validating ? 'Validando...' : 'Validar novamente'}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!valid || validating}
              onClick={() => onConfirm(tipo, result.itens)}
            >
              Confirmar importação
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
