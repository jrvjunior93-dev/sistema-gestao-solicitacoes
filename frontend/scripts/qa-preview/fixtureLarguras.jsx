/*
 * FIXTURE VIVA DA LARGURA DE COLUNA — a `TabelaPadrao` REAL, dentro de um
 * cartão real, com o CSS real do sistema.
 * ============================================================================
 *
 * O QUE ELA EXISTE PARA MEDIR: a decisão do cliente de 06/09 — "Ajuste fino
 * de coluna vale menos que a tabela abrir certa em qualquer tela — e o caso
 * de 1805px num contêiner de 1239px é o que eu quero evitar." A largura
 * deixou de ser guardada em PIXEL ABSOLUTO e passou a ser guardada como
 * PROPORÇÃO da largura disponível.
 *
 * POR QUE COMPONENTE REAL, e não uma reprodução: a distribuição da sobra é
 * da `TabelaPadrao`, a posse da largura é da `ResizableTable`, o contêiner
 * que serve de denominador é o `.resizable-table-scroll` com o CSS real, e a
 * borda do cartão é do `BlocoConteudo`. Uma reprodução prova a aritmética
 * que eu escrevi — não prova que a tabela cabe.
 *
 * O ESTADO GUARDADO É PLANTADO PELA QUERY, e são estados REAIS, não
 * inventados:
 *
 *   ?px=nome:813        grava `{nome: 813}` em `tabela:prova-largura:v3`.
 *                       É EXATAMENTE o formato que o build anterior gravava:
 *                       pixel absoluto, por navegador. Serve para a MORDIDA
 *                       (o estouro tem de ser acusado) e para a MIGRAÇÃO.
 *
 *   ?prop=nome:0.4234   semeia a PROPORÇÃO no armazém do
 *   &ref=1793            `PreferenciasContext` — é o que a carga única do
 *                       banco entrega quando a pessoa ajustou em outra
 *                       máquina. É o caso que a decisão do cliente cria.
 *                       `ref` é o contêiner em que aquela fração foi
 *                       medida; sem ele o registro não diz de qual janela
 *                       veio, e é essa régua que separa "o usuário acabou
 *                       de arrastar aqui" de "isto vem de uma tela maior".
 *
 *   ?pronto=1           injeta um `PreferenciasContext` com `pronto: true`,
 *                       que é o portão da migração do pixel guardado. Sem
 *                       ele a fixture representa o app ANTES de a carga
 *                       única responder — e a migração, corretamente, não
 *                       acontece.
 *
 * A TABELA É A DO DEFEITO MEDIDO EM 03/09, e as medidas batem com ele: NOME
 * (identidade, a coluna de conteúdo que recebe a sobra), OBRA, VÍNCULO,
 * STATUS, ADMISSÃO, SALÁRIO e a coluna de AÇÕES. Numa janela de 1920 o
 * contêiner mede 1793px, as colunas que NÃO são de conteúdo somam 975px e
 * NOME nasce com 806px — o relato de 03/09 fala em 992px de colunas fixas e
 * 813px de NOME. É a forma da `rhdp-pessoal`, a tela onde quatro colunas
 * ficaram fora da borda do cartão.
 */
import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import BlocoConteudo from '../../src/components/padrao/BlocoConteudo';
import BlocosPersonalizaveis from '../../src/components/padrao/BlocosPersonalizaveis';
import Pagina from '../../src/components/padrao/Pagina';
import TabelaPadrao from '../../src/components/padrao/TabelaPadrao';
import PreferenciasContext, {
  TIPO_LARGURAS,
  usePreferenciaDeLista
} from '../../src/contexts/PreferenciasContext';

const CHAVE = 'tabela:prova-largura';
const params = new URLSearchParams(window.location.search);

/* `nome:813,obra:200` -> { nome: 813, obra: 200 } */
function pares(cru) {
  if (!cru) return null;
  const mapa = {};
  String(cru).split(',').forEach((par) => {
    const [chave, valor] = par.split(':');
    if (chave && Number.isFinite(Number(valor))) mapa[chave.trim()] = Number(valor);
  });
  return Object.keys(mapa).length ? mapa : null;
}

const PIXEL_GUARDADO = pares(params.get('px'));
const PROPORCAO_GUARDADA = pares(params.get('prop'));
const CONTEINER_DE_REFERENCIA = Number(params.get('ref')) || 0;
const CARGA_PRONTA = params.get('pronto') === '1';

/*
  A FORMA DA TABELA E O ARRANJO DA PÁGINA — os dois eixos que separam a
  fixture que PASSAVA da matriz que REPROVAVA (06/09, medido no preview).

  `?forma=estreita` monta a tabela de DUAS colunas da `sst-producao`: uma
  de identidade (que recebe a sobra) e um `status` de 132px. É o menor
  denominador do sistema — as colunas que NÃO são de conteúdo somam 132px,
  contra 975px da forma padrão daqui — e é ele que decide o tamanho da
  amplificação medida.

  `?arranjo=blocos` põe a tabela dentro do `BlocosPersonalizaveis`, que é
  como as quatro telas reprovadas montam a página. Sem ele o contêiner de
  rolagem é FIXO e o arrasto é fiel; com ele o contêiner ACOMPANHA a
  tabela, e é essa realimentação que amplifica o arrasto. Os dois modos
  ficam na mesma fixture de propósito: a diferença entre eles é a medida.
*/
const FORMA = params.get('forma') || 'padrao';
const ARRANJO = params.get('arranjo') || 'bloco';

/* O espelho local é escrito ANTES de a árvore montar — a `ResizableTable` o
   lê de forma síncrona no primeiro render, exatamente como no app. */
try {
  if (PIXEL_GUARDADO) window.localStorage.setItem(`${CHAVE}:v3`, JSON.stringify(PIXEL_GUARDADO));
  else window.localStorage.removeItem(`${CHAVE}:v3`);
} catch { /* sem storage */ }

const COLUNAS = [
  { id: 'nome', titulo: 'Nome', tipo: 'identidade', render: (i) => i.nome },
  { id: 'obra', titulo: 'Obra', tipo: 'texto', render: (i) => i.obra },
  { id: 'vinculo', titulo: 'Vínculo', tipo: 'badge', render: (i) => i.vinculo },
  { id: 'status', titulo: 'Status', tipo: 'status', render: (i) => i.status },
  { id: 'admissao', titulo: 'Admissão', tipo: 'data', render: (i) => i.admissao },
  { id: 'salario', titulo: 'Salário', tipo: 'valor', render: (i) => i.salario }
];

/* A tabela da `sst-producao`: `flag` (identidade, recebe a sobra) e
   `estado` (status, 132px). Duas colunas, e nada mais. */
const COLUNAS_ESTREITA = [
  { id: 'nome', titulo: 'Flag', tipo: 'identidade', noCard: 'titulo', render: (i) => i.nome },
  { id: 'status', titulo: 'Estado', tipo: 'status', render: (i) => i.status }
];

const ITENS = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  nome: `COLABORADOR DE NOME COMPRIDO NÚMERO ${i + 1}`,
  obra: `Obra ${i + 1} — trecho urbano`,
  vinculo: i % 2 ? 'CLT' : 'Temporário',
  status: i % 3 ? 'ATIVO' : 'AFASTADO',
  admissao: '22/08/2026',
  salario: 'R$ 4.317,90'
}));

/*
  A SEMENTE DO BANCO. `definir` é o mesmo caminho que a carga única usa para
  publicar o que veio do servidor: escreve no armazém do contexto, avisa
  quem lê e agenda o envio (que aqui morre numa URL inexistente, de
  propósito — esta fixture não fala com API nenhuma).

  Os filhos só entram depois da semente, senão a tabela nasceria sem ela e a
  medição pegaria o quadro errado.
*/
function ComSemente({ children }) {
  const [, definir] = usePreferenciaDeLista(CHAVE, TIPO_LARGURAS);
  const [semeado, setSemeado] = useState(!PROPORCAO_GUARDADA);
  useLayoutEffect(() => {
    if (!PROPORCAO_GUARDADA) return;
    definir({ colunas: PROPORCAO_GUARDADA, conteiner: CONTEINER_DE_REFERENCIA });
    setSemeado(true);
  }, [definir]);
  return semeado ? children : null;
}

/* O que está guardado sai no DOM para a prova ler — é a única forma de a
   medição dizer QUAL proporção produziu aquela largura. */
function Placar() {
  const [proporcoes] = usePreferenciaDeLista(CHAVE, TIPO_LARGURAS);
  return (
    <span
      className="prova-placar"
      data-proporcoes={JSON.stringify(proporcoes || {})}
      data-espelho={(() => {
        try { return window.localStorage.getItem(`${CHAVE}:v3`) || '{}'; } catch { return '{}'; }
      })()}
    />
  );
}

function Tabela() {
  return (
    <TabelaPadrao
      colunas={FORMA === 'estreita' ? COLUNAS_ESTREITA : COLUNAS}
      itens={ITENS}
      storageKey={CHAVE}
      rotuloRolagem="Tabela de pessoal"
      acoesLinha={FORMA === 'estreita' ? undefined : () => (
        <button type="button" className="btn btn-outline btn-sm">Editar</button>
      )}
    />
  );
}

function Tela() {
  return (
    <div className="layout-shell fluxy-app-shell">
      <div className="layout-shell-backdrop" aria-hidden="true" />
      <main className="layout-main">
        <div className="layout-content-shell">
          <Pagina>
            {ARRANJO === 'blocos' ? (
              <BlocosPersonalizaveis chave="blocos:prova-largura" larguraPadrao="total">
                <BlocoConteudo titulo="Pessoal" variante="primario">
                  <Tabela />
                </BlocoConteudo>
              </BlocosPersonalizaveis>
            ) : (
              <BlocoConteudo titulo="Pessoal" variante="primario">
                <Tabela />
              </BlocoConteudo>
            )}
            <Placar />
          </Pagina>
        </div>
      </main>
    </div>
  );
}

function App() {
  const tela = (
    <ComSemente>
      <Tela />
    </ComSemente>
  );
  /*
    Sem `?pronto=1` a fixture usa o contexto PADRÃO (`pronto: false`), que é
    o app antes de a carga única responder. Com ele, a migração do pixel
    guardado tem o portão aberto — a mesma condição do app depois da carga.
  */
  return CARGA_PRONTA
    ? (
      <PreferenciasContext.Provider value={{ pronto: true, erro: null, total: 0 }}>
        {tela}
      </PreferenciasContext.Provider>
    )
    : tela;
}

createRoot(document.getElementById('root')).render(<App />);
