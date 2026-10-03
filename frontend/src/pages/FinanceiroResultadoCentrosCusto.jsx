import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getResultadoCentrosCusto } from '../services/financeiro';

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/*
  M4 / R8 — a cor e da SERIE, nao do componente.

  Nesta tela ha exatamente uma comparacao, e ela se repete no consolidado do
  topo e dentro de cada centro: o COMPROMISSO ("a pagar" / "a receber") contra
  o que de fato passou pelo caixa ("pago" / "recebido"). Compromisso e a serie
  PREVISTA (azul); caixa e a serie REALIZADA (vermelho). As mesmas duas cores
  valem nos dois lugares — um consolidado azul com o cartao do centro em outra
  cor para o MESMO numero seria o defeito que a R8 descreve.

  Os indicadores que nao pertencem a serie nenhuma (quantidade de
  solicitacoes, saldo liquido derivado) ficam NEUTROS, como a regra manda.
*/
function Previsto({ children }) {
  return <span className="texto-previsto">{children}</span>;
}

function Realizado({ children }) {
  return <span className="texto-realizado">{children}</span>;
}

function CentroCustoBloco({ centro }) {
  const saidas = centro.pagar?.total || 0;
  const pagas = centro.pagar?.pago || 0;
  const entradas = centro.receber?.total || 0;
  const recebidas = centro.receber?.recebido || 0;
  const saldoLiquido = recebidas - pagas;

  return (
    <BlocoConteudo
      variante="secundario"
      titulo={centro.nome}
      contagem={centro.codigo || `Centro ${centro.id}`}
      descricao={centro.cidade || 'Centro de custo'}
    >
      <StatGrid colunas={2}>
        <StatTile
          label="Solicitações"
          valor={String(centro.solicitacoes?.quantidade || 0)}
          sub={formatCurrency(centro.solicitacoes?.total_valor)}
        />
        <StatTile
          label="Saldo líquido"
          valor={formatCurrency(saldoLiquido)}
          sub="Recebido menos pago"
        />
        <StatTile
          label="A pagar"
          valor={<Previsto>{formatCurrency(saidas)}</Previsto>}
          sub={`${centro.pagar?.quantidade || 0} título(s)`}
        />
        <StatTile label="Pago" valor={<Realizado>{formatCurrency(pagas)}</Realizado>} />
        <StatTile
          label="A receber"
          valor={<Previsto>{formatCurrency(entradas)}</Previsto>}
          sub={`${centro.receber?.quantidade || 0} título(s)`}
        />
        <StatTile label="Recebido" valor={<Realizado>{formatCurrency(recebidas)}</Realizado>} />
      </StatGrid>
    </BlocoConteudo>
  );
}

export default function FinanceiroResultadoCentrosCusto() {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoading(true);

    getResultadoCentrosCusto()
      .then((data) => {
        if (active) setDados(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        // R3/R19: erro em faixa do sistema, nunca em caixa do navegador.
        if (active) avisar.erro(err?.message || 'Erro ao carregar centros de custo');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [avisar]);

  const resumo = useMemo(() => dados.reduce((acc, centro) => {
    acc.solicitacoes += centro.solicitacoes?.quantidade || 0;
    acc.aPagar += centro.pagar?.total || 0;
    acc.pago += centro.pagar?.pago || 0;
    acc.aReceber += centro.receber?.total || 0;
    acc.recebido += centro.receber?.recebido || 0;
    return acc;
  }, { solicitacoes: 0, aPagar: 0, pago: 0, aReceber: 0, recebido: 0 }), [dados]);

  return (
    <Pagina>
      {/*
        R13/C1/C2 — faixa fixa do sistema no lugar da linha solta de titulo
        com `page-subtitle` (R5): titulo em 22px, contagem e apoio numa linha
        so, dentro da propria faixa.

        B3 — a contagem de centros vive AQUI e em lugar nenhum mais. O cartao
        "Centros" que existia no resumo repetia exatamente este numero.

        R23 — REGIME DECLARADO: **aplica ao marcar**, que aqui e o caso
        trivial: a tela nao tem filtro nenhum e faz UMA requisicao no
        carregamento. Nao chega perto do teto da excecao (4+ dimensoes
        combinadas ou 2s de resposta), entao nao ha botao de "atualizar
        relatorio" e nao ha marca em rascunho.
      */}
      <PageHeader
        titulo="Resultado por Centro de Custo"
        contagem={loading ? 'Carregando…' : `${dados.length} centro(s)`}
        descricao="Visão financeira dos cadastros administrativos que não são obras."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <div className="app-actionbar">
        <Link className="btn btn-outline btn-sm" to="/financeiro/relatorios/centros-custo/distribuicao-obras">
          Ver distribuição gerencial por obra
        </Link>
      </div>

      {/*
        B2 — UM bloco primario, e e ele que responde a pergunta da tela:
        quanto os centros administrativos comprometem e quanto ja passou pelo
        caixa. Os cartoes por centro sao a abertura desse numero, e por isso
        entram como blocos SECUNDARIOS.
      */}
      <BlocoConteudo
        titulo="Consolidado dos centros de custo"
        descricao="Soma de todos os centros carregados."
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <StatGrid colunas={5}>
          <StatTile label="Solicitações" valor={String(resumo.solicitacoes)} />
          <StatTile label="A pagar" valor={<Previsto>{formatCurrency(resumo.aPagar)}</Previsto>} />
          <StatTile label="Pago" valor={<Realizado>{formatCurrency(resumo.pago)}</Realizado>} />
          <StatTile label="A receber" valor={<Previsto>{formatCurrency(resumo.aReceber)}</Previsto>} />
          <StatTile label="Recebido" valor={<Realizado>{formatCurrency(resumo.recebido)}</Realizado>} />
        </StatGrid>
      </BlocoConteudo>

      {loading ? (
        <div className="app-empty-card">Carregando centros de custo...</div>
      ) : dados.length === 0 ? (
        <div className="app-empty-card">Nenhum centro de custo encontrado.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {dados.map((centro) => (
            <CentroCustoBloco key={centro.id} centro={centro} />
          ))}
        </div>
      )}
    </Pagina>
  );
}
