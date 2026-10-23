import { BlocoConteudo } from '../../components/padrao';
import { lerDistribuicaoGerencialSalva } from '../../utils/distribuicaoGerencialSalva.mjs';

const moeda = centavos => centavos === null ? 'Não informado'
  : (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const percentual = valor => valor === null ? '—'
  : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 6 })}%`;

export default function DistribuicaoGerencial({ solicitacao }) {
  const distribuicao = lerDistribuicaoGerencialSalva(solicitacao);
  if (!distribuicao) return null;
  return <BlocoConteudo
    titulo="Distribuição gerencial por obra / centro de custo"
    variante="secundario" recolhivel recolhidoPadrao alternarAoClicar
    data-testid="distribuicao-gerencial-salva"
    descricao="Rateio salvo na criação. Somente consulta; não gera custo real nos destinos."
  >
    <p className="form-hint mb-2">Critério registrado: <strong>{distribuicao.criterio}</strong></p>
    <table className="w-full table-fixed text-sm" style={{ width: '100%' }} aria-label="Distribuição gerencial salva na criação">
      <thead>
        <tr className="border-b border-[var(--c-border)] text-xs text-[var(--c-muted)]">
          <th scope="col" className="pb-2 pr-2 text-left font-medium">Obra / centro de custo</th>
          <th scope="col" className="w-[22%] pb-2 pr-2 text-right font-medium">Percentual</th>
          <th scope="col" className="w-[30%] pb-2 text-right font-medium">Valor</th>
        </tr>
      </thead>
      <tbody>
        {distribuicao.linhas.map(linha => <tr key={linha.chave} className="border-b border-[var(--c-border)] align-top">
          <th scope="row" className="break-words py-2 pr-2 text-left font-normal [overflow-wrap:anywhere]">
            {linha.destino}
            {linha.tipo && <span className="block text-xs text-[var(--c-muted)]">{linha.tipo}</span>}
          </th>
          <td className="break-words py-2 pr-2 text-right tabular-nums">{percentual(linha.percentual)}</td>
          <td className="break-words py-2 text-right tabular-nums">{moeda(linha.valorCentavos)}</td>
        </tr>)}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2} className="pt-2 pr-2 text-left font-semibold">Total distribuído na criação</th>
          <td className="break-words pt-2 text-right font-semibold tabular-nums">{moeda(distribuicao.totalCentavos)}</td>
        </tr>
      </tfoot>
    </table>
    <p className="form-hint mt-2">Valores registrados na criação, sem recálculo pelo valor atual da solicitação. Esta distribuição é gerencial e não substitui as apropriações.</p>
  </BlocoConteudo>;
}
