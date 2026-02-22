import { useEffect, useMemo, useState } from 'react';
import StatusBadge from '../../components/StatusBadge';

function formatarData(valor) {
  if (!valor) return '-';
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return '-';
  const numero = Number(valor);
  if (Number.isNaN(numero)) return '-';
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function extrairMensagemErro(error) {
  if (!error?.message) return 'Erro ao atualizar ref. do contrato';
  try {
    const parsed = JSON.parse(error.message);
    return parsed?.error || error.message;
  } catch {
    return error.message;
  }
}

export default function Header({
  solicitacao,
  onAlterarStatus,
  mostrarAlterarStatus = true,
  podeEditarRefContrato = false,
  contratosObra = [],
  onSalvarRefContrato
}) {
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState('');
  const [salvandoRef, setSalvandoRef] = useState(false);

  useEffect(() => {
    setContratoSelecionadoId(solicitacao?.contrato_id ? String(solicitacao.contrato_id) : '');
  }, [solicitacao?.contrato_id]);

  const opcoesContrato = useMemo(() => {
    if (!Array.isArray(contratosObra)) return [];
    return contratosObra.map(contrato => ({
      id: String(contrato.id),
      label: `${contrato.ref_contrato || '-'} (${contrato.codigo || '-'})`
    }));
  }, [contratosObra]);

  const refContratoAtual = solicitacao?.contrato?.ref_contrato || '-';
  const codigoContratoAtual = solicitacao?.codigo_contrato || solicitacao?.contrato?.codigo || '-';
  const houveAlteracaoRef = contratoSelecionadoId && String(contratoSelecionadoId) !== String(solicitacao?.contrato_id || '');

  async function handleSalvarRefContrato() {
    if (!onSalvarRefContrato || !contratoSelecionadoId || !houveAlteracaoRef) return;
    try {
      setSalvandoRef(true);
      await onSalvarRefContrato(Number(contratoSelecionadoId));
    } catch (error) {
      alert(extrairMensagemErro(error));
    } finally {
      setSalvandoRef(false);
    }
  }

  const historicos = Array.isArray(solicitacao?.historicos) ? solicitacao.historicos : [];
  const ultimoHistoricoStatus = [...historicos]
    .filter(item => item?.acao === 'STATUS_ALTERADO')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  const setorStatusAtual = ultimoHistoricoStatus?.setor || solicitacao?.area_responsavel || null;

  return (
    <div className="bg-white p-6 rounded-xl shadow">

      <div className="flex justify-between items-center">

        <div>
          <h1 className="text-xl font-semibold">
            {solicitacao.codigo}
          </h1>

          <p className="text-sm text-gray-500">
            Tipo: {solicitacao.tipo?.nome || '-'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <StatusBadge status={solicitacao.status_global} setor={setorStatusAtual} />
          {mostrarAlterarStatus && (
            <button
              onClick={onAlterarStatus}
              className="btn btn-outline"
            >
              Alterar status
            </button>
          )}
        </div>

      </div>

      <p className="mt-4">
        {solicitacao.descricao}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-7 gap-4 mt-4 text-sm">

        <div>
          <span className="text-gray-500">Obra</span>
          <p>{solicitacao.obra?.nome}</p>
        </div>

        <div>
          <span className="text-gray-500">Setor</span>
          <p>{solicitacao.area_responsavel}</p>
        </div>

        <div>
          <span className="text-gray-500">Valor</span>
          <p>{formatarValor(solicitacao.valor)}</p>
        </div>

        <div>
          <span className="text-gray-500">Criado em</span>
          <p>
            {new Date(solicitacao.createdAt).toLocaleString()}
          </p>
        </div>

        <div>
          <span className="text-gray-500">Data de vencimento</span>
          <p>{formatarData(solicitacao.data_vencimento)}</p>
        </div>

        <div>
          <span className="text-gray-500">Inicio da medicao</span>
          <p>{formatarData(solicitacao.data_inicio_medicao)}</p>
        </div>

        <div>
          <span className="text-gray-500">Fim da medicao</span>
          <p>{formatarData(solicitacao.data_fim_medicao)}</p>
        </div>

        <div>
          <span className="text-gray-500">Status</span>
          <p>{solicitacao.status_global}</p>
        </div>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
        <div>
          <span className="text-gray-500">Ref. do Contrato</span>
          <p>{refContratoAtual}</p>
        </div>
        <div>
          <span className="text-gray-500">Contrato</span>
          <p>{codigoContratoAtual}</p>
        </div>
      </div>

      {podeEditarRefContrato && (
        <div className="mt-4 p-3 border rounded-lg bg-gray-50">
          <p className="text-sm font-medium text-gray-700 mb-2">
            Editar Ref. do Contrato
          </p>
          <div className="flex flex-col md:flex-row gap-2">
            <select
              className="input"
              value={contratoSelecionadoId}
              onChange={e => setContratoSelecionadoId(e.target.value)}
            >
              <option value="">Selecione um contrato</option>
              {opcoesContrato.map(opcao => (
                <option key={opcao.id} value={opcao.id}>
                  {opcao.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSalvarRefContrato}
              disabled={!houveAlteracaoRef || salvandoRef}
            >
              {salvandoRef ? 'Salvando...' : 'Salvar Ref.'}
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
