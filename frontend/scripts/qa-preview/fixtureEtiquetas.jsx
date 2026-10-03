/*
 * FIXTURE VIVA DA ETIQUETA DE STATUS E DO LADRILHO DE DADO — os componentes
 * REAIS, com o CSS real, nas três larguras do harness.
 * ============================================================================
 *
 * O QUE ELA EXISTE PARA MEDIR (achados do revisor separado, 06/09):
 *
 *   A5 — em `pedidos-compra`, a 1920 e a 1366, TODO pedido lê "Fechado com".
 *        O status real é "Fechado com o fornecedor". A pílula FECHA
 *        normalmente, então não há reticência, não há borda cortada, não há
 *        sinal nenhum de corte: o texto parece completo e não é. Mente sem
 *        avisar — foi assim que o revisor descreveu, e é por isso que ele
 *        pôs este achado acima dos outros.
 *
 *   A8 — em `solicitacao-compra-detalhe` a 390, a MESMA pílula dentro do
 *        ladrilho STATUS lê "LIBERADO PARA C". Mesma causa, outra caixa.
 *
 *   A12 — em `perfil` a 390, o e-mail do ladrilho quebra no meio do token:
 *        "qa.visual@fluxy.loc" numa linha e "al" na outra.
 *
 * POR QUE COMPONENTE REAL, e não uma reprodução: a largura da coluna é da
 * `TabelaPadrao` (tabela de tipos), o recorte é do `.fx-badge` (CSS do
 * sistema), a caixa do ladrilho é do `StatGrid`/`StatTile` e a grade que
 * decide quantas colunas cabem a 390 é do `componentes-padrao.css`. Uma
 * reprodução mediria os números que eu escrevesse na reprodução.
 *
 * OS DADOS SÃO OS REAIS. Os rótulos de status vêm de
 * `backend/src/services/pedidoCompraStatusConfig.js` (a lista padrão que o
 * sistema instala) e de `STATUS_PEDIDOS_FALLBACK`
 * (`PedidosCompra.jsx`), que são o mesmo texto; as colunas são as oito da
 * `PedidosCompra`, com os mesmos `tipo`. O e-mail é o da captura do
 * revisor.
 *
 * O QUE A QUERY PLANTA:
 *
 *   ?caso=tabela        (padrão) a lista de pedidos de compra.
 *   ?caso=ladrilho      os ladrilhos do detalhe da compra e do perfil.
 *   ?caso=vocabulario   cada rótulo de status numa pílula SOLTA, sem caixa
 *                       que a aperte, para medir a largura NATURAL de cada
 *                       um — é dela que sai o número da coluna, em vez de
 *                       um palpite.
 *   ?larguraStatus=132  devolve à coluna de status a largura ANTERIOR, pelo
 *                       caminho que a própria `TabelaPadrao` oferece
 *                       (`coluna.largura` manda sobre o tipo). É a MORDIDA
 *                       do achado A5: a medição tem de reprovar.
 */
import { createRoot } from 'react-dom/client';
import BlocoConteudo from '../../src/components/padrao/BlocoConteudo';
import CamposComVazios from '../../src/components/padrao/CamposComVazios';
import Pagina from '../../src/components/padrao/Pagina';
import TabelaPadrao from '../../src/components/padrao/TabelaPadrao';
import StatusBadge from '../../src/components/StatusBadge';
import { ThemeContext, TEMA_PADRAO } from '../../src/contexts/ThemeContext';

const params = new URLSearchParams(window.location.search);
const CASO = params.get('caso') || 'tabela';
const LARGURA_STATUS = Number(params.get('larguraStatus')) || 0;

/* A lista padrão que o backend instala (`pedidoCompraStatusConfig.js`) e que
   o front repete em `STATUS_PEDIDOS_FALLBACK`. Texto idêntico nos dois. */
const STATUS_PEDIDO = [
  'Aberto',
  'Em analise interna',
  'Enviado ao fornecedor',
  'Em negociacao',
  'Fechado com o fornecedor',
  'Cancelado'
];

/* O status do detalhe da solicitação de compra, como a tela o escreve:
   `formatarStatus` troca `_` por espaço e sobe para maiúsculas. */
const STATUS_SOLICITACAO = 'LIBERADO PARA COTACAO';

const PEDIDOS = STATUS_PEDIDO.map((status, i) => ({
  id: i + 1,
  fornecedor: `FORNECEDOR ${i + 1} MATERIAIS E SERVICOS LTDA`,
  obra: `Obra ${i + 1} — trecho urbano`,
  solicitacao: 900 + i,
  itens: 3 + i,
  valor: 'R$ 128.940,17',
  minimo: i % 2 ? 'R$ 1.500,00' : '-',
  status
}));

/* As oito colunas da `PedidosCompra`, com os mesmos `tipo` e os mesmos
   títulos — inclusive os sem acento, que são os da tela hoje. */
const COLUNAS = [
  { id: 'pedido', titulo: 'Pedido', tipo: 'codigo', render: (p) => `PC-${String(p.id).padStart(5, '0')}` },
  { id: 'fornecedor', titulo: 'Fornecedor', tipo: 'identidade', noCard: 'titulo', render: (p) => p.fornecedor },
  { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (p) => p.obra },
  { id: 'solicitacao', titulo: 'Solicitacao', tipo: 'codigo', render: (p) => `SC-${String(p.solicitacao).padStart(5, '0')}` },
  { id: 'itens_ativos', titulo: 'Itens ativos', tipo: 'numero', render: (p) => p.itens },
  { id: 'valor_total', titulo: 'Valor total', tipo: 'valor', render: (p) => p.valor },
  { id: 'pedido_minimo', titulo: 'Pedido minimo', tipo: 'valor', render: (p) => p.minimo },
  {
    id: 'status',
    titulo: 'Status',
    tipo: 'status',
    ...(LARGURA_STATUS ? { largura: LARGURA_STATUS } : {}),
    render: (p) => <StatusBadge status={p.status} kind={undefined} />
  }
];

/* O tema PADRÃO do sistema, pelo contexto real. O `ThemeProvider` inteiro
   busca API e depende do `AuthContext`; o que a etiqueta lê dele é só
   `tema.status.setores` (cor por status configurada pelo administrador),
   que aqui é o padrão — nenhuma cor customizada, que é o estado de quem
   não configurou nada. Largura não depende de cor. */
function Casca({ children }) {
  return (
    <ThemeContext.Provider value={{ tema: TEMA_PADRAO }}>
    <div className="layout-shell fluxy-app-shell">
      <div className="layout-shell-backdrop" aria-hidden="true" />
      <main className="layout-main">
        <div className="layout-content-shell">
          <Pagina>{children}</Pagina>
        </div>
      </main>
    </div>
    </ThemeContext.Provider>
  );
}

function Tabela() {
  return (
    <BlocoConteudo titulo="Lista de pedidos" variante="primario" cor="var(--sem-info)">
      <TabelaPadrao
        colunas={COLUNAS}
        itens={PEDIDOS}
        storageKey="tabela:prova-etiqueta"
        rotuloRolagem="Lista de pedidos"
      />
    </BlocoConteudo>
  );
}

/* Os ladrilhos das duas telas do achado, com os campos que elas declaram —
   `solicitacao-compra-detalhe` em quatro colunas, `perfil` em três. */
function Ladrilhos() {
  return (
    <>
      <BlocoConteudo variante="secundario" titulo="Dados da solicitacao">
        <CamposComVazios
          colunas={4}
          campos={[
            { label: 'Status', valor: <StatusBadge status={STATUS_SOLICITACAO} setor="COMPRAS" /> },
            { label: 'Obra', valor: 'RESIDENCIAL PORTO SEGURO — ETAPA 2', sub: 'OB-2024-0117' },
            { label: 'Solicitante', valor: 'Maria Aparecida do Nascimento' },
            { label: 'Necessario para', valor: '22/08/2026' }
          ]}
        />
      </BlocoConteudo>
      <BlocoConteudo variante="primario" titulo="Identificacao e acesso" cor="var(--c-primary)">
        <CamposComVazios
          colunas={3}
          campos={[
            { label: 'Nome', valor: 'QA Visual' },
            { label: 'E-mail cadastrado', valor: 'qa.visual@fluxy.local' },
            { label: 'Perfil', valor: 'SUPERADMIN' }
          ]}
        />
      </BlocoConteudo>
    </>
  );
}

/* Pílulas soltas: sem caixa que as aperte, cada uma mede a largura que o
   texto REALMENTE pede. É o insumo da decisão de largura da coluna. */
function Vocabulario() {
  return (
    <BlocoConteudo titulo="Vocabulario de status" variante="secundario">
      <div className="prova-vocabulario">
        {[...STATUS_PEDIDO, STATUS_SOLICITACAO].map((status) => (
          <span key={status} className="prova-vocabulario-item" data-rotulo={status}>
            <StatusBadge status={status} />
          </span>
        ))}
      </div>
    </BlocoConteudo>
  );
}

function App() {
  if (CASO === 'ladrilho') return <Casca><Ladrilhos /></Casca>;
  if (CASO === 'vocabulario') return <Casca><Vocabulario /></Casca>;
  return <Casca><Tabela /></Casca>;
}

createRoot(document.getElementById('root')).render(<App />);
