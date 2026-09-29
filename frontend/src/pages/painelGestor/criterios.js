import { valorTotalObra } from '../FinanceiroResultadoObras';
import { collator } from './OrdenacaoCards';
import { numero } from './valores';

/*
  Critérios de ordem por aba (29/09/2026). `porValor: true` marca os que
  dependem de valor financeiro: com o olho fechado eles caem para nome
  (ver OrdenacaoCards). Desempate sempre por nome.
*/
const decrescente = (fn) => (a, b) => numero(fn(b)) - numero(fn(a));

export const ORDEM_RESULTADO = {
  chave: 'painel-gestor:ordem:resultado-obras',
  padrao: 'NOME',
  criterios: [
    { id: 'RESULTADO', rotulo: 'Maior resultado do período', porValor: true, comparar: decrescente((obra) => obra.lucro_prejuizo) },
    { id: 'VALOR_TOTAL', rotulo: 'Maior valor total (VGV/planilha)', porValor: true, comparar: decrescente(valorTotalObra) },
    { id: 'EXECUTADO', rotulo: 'Maior executado', porValor: true, comparar: decrescente((obra) => obra.pagar?.executado) },
    { id: 'NOME', rotulo: 'Nome da obra (A–Z)', comparar: () => 0 },
    {
      id: 'CODIGO',
      rotulo: 'Código',
      comparar: (a, b) => {
        const ca = String(a.codigo || '');
        const cb = String(b.codigo || '');
        if (!ca !== !cb) return ca ? -1 : 1;
        return collator.compare(ca, cb);
      }
    },
    {
      id: 'CLASSIFICACAO',
      rotulo: 'Classificação (públicas primeiro)',
      comparar: (a, b) => collator.compare(String(b.classificacao || ''), String(a.classificacao || ''))
    }
  ]
};

export const ORDEM_SALDOS = {
  chave: 'painel-gestor:ordem:saldos',
  padrao: 'EMPRESA',
  criterios: [
    { id: 'SALDO', rotulo: 'Maior saldo', porValor: true, comparar: (a, b) => {
      if (!a.saldo !== !b.saldo) return a.saldo ? -1 : 1;
      return numero(b.saldo?.valor) - numero(a.saldo?.valor);
    } },
    { id: 'NOME', rotulo: 'Nome da conta (A–Z)', comparar: () => 0 },
    { id: 'EMPRESA', rotulo: 'Empresa', comparar: (a, b) => collator.compare(String(a.empresa?.nome || '~'), String(b.empresa?.nome || '~')) },
    { id: 'PENDENTES', rotulo: 'Pendentes primeiro', comparar: (a, b) => Number(Boolean(a.saldo)) - Number(Boolean(b.saldo)) }
  ]
};

export const ORDEM_CUSTOS_RECEBIVEIS = 'painel-gestor:ordem:custos-recebiveis';
