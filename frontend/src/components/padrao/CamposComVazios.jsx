import { useMemo, useState } from 'react';
import StatGrid, { StatTile } from './StatGrid';

function temValor(valor) {
  if (valor === null || valor === undefined) return false;
  if (typeof valor === 'string') return valor.trim() !== '' && valor.trim() !== '-';
  if (typeof valor === 'number') return true;
  if (typeof valor === 'boolean') return true;
  return Boolean(valor);
}

/**
 * CAMPOS COM VAZIOS — generaliza o alternador "Ver todos os campos (N
 * vazios)" do detalhe da solicitação. Lá a contagem era uma lista manual
 * espelhando as condições do grid ladrilho a ladrilho (frágil de replicar
 * em 100 telas); aqui a lista de campos é UMA só e a contagem sai dela.
 *
 * campos: [{ label, valor, sub?, tom?, span?, contexto? }]
 * - `contexto: false` tira o campo da tela E da contagem (campo que não
 *   faz sentido neste registro — ex.: dados de contrato numa compra —
 *   continua invisível mesmo com o alternador ligado, como no detalhe).
 */
export default function CamposComVazios({ campos = [], colunas = 4 }) {
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const { visiveis, vazios } = useMemo(() => {
    const pertinentes = campos.filter((campo) => campo && campo.contexto !== false);
    const preenchidos = pertinentes.filter((campo) => temValor(campo.valor));
    return {
      visiveis: mostrarTodos ? pertinentes : preenchidos,
      vazios: pertinentes.length - preenchidos.length
    };
  }, [campos, mostrarTodos]);

  return (
    <div>
      <StatGrid colunas={colunas}>
        {visiveis.map((campo) => (
          <StatTile
            key={campo.label}
            label={campo.label}
            valor={campo.valor}
            sub={campo.sub}
            tom={campo.tom}
            span={campo.span}
            vazio={!temValor(campo.valor)}
          />
        ))}
      </StatGrid>
      {vazios > 0 && (
        <button
          type="button"
          className="app-campos-toggle"
          onClick={() => setMostrarTodos((atual) => !atual)}
        >
          {mostrarTodos
            ? `Ocultar campos vazios (${vazios})`
            : `Ver todos os campos (${vazios} vazio${vazios > 1 ? 's' : ''})`}
        </button>
      )}
    </div>
  );
}
