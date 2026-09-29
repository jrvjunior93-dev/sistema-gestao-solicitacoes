import { useRef, useState } from 'react';
import { HiOutlineArrowDownTray } from 'react-icons/hi2';
import { Avisos } from '../../../components/padrao';
import { baixarExportacaoCustosRecebiveis, mensagemLegivel } from '../services/custosRecebiveis';
import { rotuloObra } from './CrFormatos';

const REPORTS = [
  { id: 'medicao-recebiveis', label: 'Medição e recebíveis', description: 'Previsões privadas; medição prevista e consolidada das obras públicas.' },
  { id: 'custos-previstos', label: 'Custos planejados', description: 'Planejamento por item micro e etapa macro.' },
  { id: 'comparativo', label: 'Comparativo', description: 'Previsto, realizado, desvio e estado por item.' },
  { id: 'custo-realizado', label: 'Custo realizado', description: 'Solicitação, pedido, título e baixa, com reconciliação.' },
  { id: 'solicitacoes-titulos', label: 'Solicitações e títulos', description: 'Títulos a pagar do período e a solicitação de origem.' },
  { id: 'resumo-executivo', label: 'Resumo executivo', description: 'Totais previstos, realizados, desvios e não mapeados.' }
];

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/*
  Exportações (Fase 4): competência e obra escolhidas no próprio formulário,
  sem depender de obra em contexto. O arquivo respeita o escopo do usuário.
*/
export default function CrExportacoesView({ obras = [], competenciaInicial }) {
  const [report, setReport] = useState(REPORTS[0].id);
  const [format, setFormat] = useState('xlsx');
  const [obraId, setObraId] = useState('');
  const [competencia, setCompetencia] = useState(competenciaInicial || currentMonth());
  const [loading, setLoading] = useState(false);
  const [aviso, setAviso] = useState(null);
  const enviandoRef = useRef(false);
  const selected = REPORTS.find((item) => item.id === report) || REPORTS[0];

  async function handleExport(event) {
    event.preventDefault();
    if (enviandoRef.current) return;
    enviandoRef.current = true;
    try {
      setLoading(true);
      setAviso(null);
      await baixarExportacaoCustosRecebiveis({
        tipo: report,
        competencia,
        obraId: obraId ? Number(obraId) : null,
        formato: format
      });
    } catch (error) {
      setAviso({ id: 'exportacao', tipo: 'error', mensagem: mensagemLegivel(error, 'Não foi possível gerar o arquivo.') });
    } finally {
      enviandoRef.current = false;
      setLoading(false);
    }
  }

  return (
    <>
      <Avisos avisos={aviso ? [aviso] : []} aoFechar={() => setAviso(null)} />
      <form className="cr-export-toolbar cr-export-toolbar--admin" onSubmit={handleExport}>
        <label className="cr-field">
          <span>Relatório</span>
          <select value={report} onChange={(event) => setReport(event.target.value)}>
            {REPORTS.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </label>
        <label className="cr-field">
          <span>Competência</span>
          <input
            type="month"
            required
            value={competencia}
            onChange={(event) => setCompetencia(event.target.value)}
          />
        </label>
        <label className="cr-field">
          <span>Obras</span>
          <select value={obraId} onChange={(event) => setObraId(event.target.value)}>
            <option value="">Todas as obras permitidas</option>
            {obras.map((obra) => (
              <option key={obra.id} value={obra.id}>{rotuloObra(obra)}</option>
            ))}
          </select>
        </label>
        <label className="cr-field">
          <span>Formato</span>
          <select value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="xlsx">Excel (.xlsx)</option>
            <option value="csv">CSV (.csv)</option>
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading || !competencia}>
          <HiOutlineArrowDownTray className="h-4 w-4" />
          {loading ? 'Gerando...' : 'Baixar arquivo'}
        </button>
      </form>
      <p className="cr-export-descricao">{selected.description}</p>
    </>
  );
}
