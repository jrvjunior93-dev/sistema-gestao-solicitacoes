import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BlocoConteudo, Pagina, PageHeader } from '../components/padrao';
import { getSecoesConfiguracoes } from '../navigation/navigationConfig';

/*
  HUB DE CONFIGURAÇÕES — as seções vêm da FONTE ÚNICA (05/09)
  ---------------------------------------------------------------------
  Esta tela carregava um `SECOES_CONFIG` com oito seções e 45 destinos
  escritos à mão. Era a maior lista de navegação fora do
  `navigation/navigationConfig.jsx`, e cobrava três preços conhecidos:

  1. PERMISSÃO COM REGRA PRÓPRIA. O filtro daqui olhava só a área de
     configuração do card (`canManageConfiguracoesArea`), e por isso
     divergia da guarda da rota em quatro destinos — o mais grave era o
     SLA por setor, que a rota protege com `<BusinessAdminRoute>`: quem
     gerenciava `status_vinculos` via o card e era redirecionado ao
     clicar. As quatro divergências estão anotadas nos nós, no
     `navigationConfig`.
  2. RÓTULO QUE ENVELHECE SOZINHO. Nomear o destino duas vezes é aceitar
     que um dos dois vai ficar velho, e o hub tinha nove rótulos já
     diferentes dos da fonte única.
  3. TODA PORTA NOVA VIRAVA DÍVIDA. É o que o trinco mediu: na rodada 1,
     abrir duas portas que o responsável mandou abrir subiu o passivo de
     43 para 45 destinos à mão e deixou o portão vermelho por dois dias.
     Decisão certa punida por limitação de arquitetura.

  O agrupamento por seção passou a ser DECLARADO na fonte única: o
  catálogo `SECOES_CONFIGURACOES` diz quais seções existem, em que ordem
  e com que rótulo, e cada destino declara `secaoConfig`/`ordemConfig`
  dizendo em qual delas aparece. Os 25 destinos que só existiam nesta
  lista foram acrescentados lá (todos já tinham rota e guarda no
  App.jsx) — nenhum deixou de ser alcançável, e de quebra passaram a
  existir também no Ctrl+K, no breadcrumb e nos atalhos fixáveis.

  A MOLDURA NÃO MUDOU (é a de 04/09, mesma da `ModuloRelatorios.jsx`):
  seção = `BlocoConteudo` com contagem, destino = `Link` em volta de um
  `BlocoConteudo` secundário; navegação no CORPO, sem seta de voltar e
  sem busca. O que mudou foi de ONDE vem a lista.
*/
export default function Configuracoes() {
  const { user } = useAuth();

  // Nenhum filtro de permissão aqui: `getSecoesConfiguracoes` já devolve
  // o que ESTE usuário pode abrir, pela mesma regra que o menu usa.
  const secoesVisiveis = getSecoesConfiguracoes(user);

  // Quantos destinos ESTE usuário pode abrir — o mesmo número que a tela
  // desenha logo abaixo, e não o total do arquivo. Quem tem menos acesso
  // não deve ler uma contagem que não corresponde ao que está vendo.
  const totalAtalhos = secoesVisiveis.reduce((acc, secao) => acc + secao.itens.length, 0);

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título (22px), contagem e apoio na faixa fixa do
          topo, em superfície própria e uma linha só. Hub não tem ação
          sobre si mesmo, então a barra de ações fica vazia. */}
      <PageHeader
        titulo="Configurações"
        contagem={`${totalAtalhos} atalhos`}
        descricao="Gerencie cadastros, regras operacionais e, quando aplicavel, a camada de módulos da instalacao."
      />

      {/* B3 — BLOCO REMOVIDO EM 04/09, por decisão do responsável.

          Havia aqui um bloco "Ajustes estruturais do Fluxy" dizendo quase
          o mesmo que o apoio da faixa fixa, três linhas acima. Texto que
          repete o que está logo acima não é informação, é ruído — e pela
          R16 o apoio da faixa já é o dono desse papel. Dois donos para a
          mesma frase fazem o leitor procurar a diferença que não existe.

          O que ele dizia de próprio ("preservam o backend atual") não é
          informação para quem usa o hub: é nota de implementação. */}
      {secoesVisiveis.map((secao, indice) => (
        <BlocoConteudo
          key={secao.id}
          titulo={secao.label}
          /* B2: UM primário por tela — o primeiro grupo é por onde se
             começa a ler; os demais recuam em neutro. Mesma escolha da
             ModuloRelatorios, pelo mesmo motivo. */
          variante={indice === 0 ? 'primario' : 'neutro'}
          cor={indice === 0 ? 'var(--c-primary)' : undefined}
          contagem={`${secao.itens.length} item(ns)`}
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {secao.itens.map((item) => (
              <ConfigItem
                key={item.id}
                title={item.label}
                description={item.desc}
                to={item.to}
              />
            ))}
          </div>
        </BlocoConteudo>
      ))}
    </Pagina>
  );
}

/*
  DESTINO DO HUB — `Link` em volta de um bloco secundário.

  Trocou `.config-item` + `.config-item-title` (0,97rem = 15,52px) +
  `.config-item-description` (0,88rem = 14,08px), todos fora dos degraus,
  pelo `BlocoConteudo`: título de 18px e apoio de 14px, medidas do
  componente. A1 continua atendida — o card É um `<Link>`, focável por
  teclado, com foco visível pelo `focus-visible:outline`.

  O ramo "indisponível" saiu em 05/09 junto com a lista à mão: nenhum
  destino declarava `disabled`, e a fonte única não tem esse conceito —
  lá, destino que o usuário não pode abrir não é desenhado apagado, ele
  não vem.
*/
function ConfigItem({ title, description, to }) {
  return (
    <Link
      to={to}
      title={`Abrir ${title}`}
      className="block h-full rounded-[var(--raio-3)] transition hover:shadow-[shadow:var(--ui-shadow-md)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--c-primary)]"
    >
      <BlocoConteudo
        titulo={title}
        descricao={description}
        variante="secundario"
        className="h-full"
      />
    </Link>
  );
}
