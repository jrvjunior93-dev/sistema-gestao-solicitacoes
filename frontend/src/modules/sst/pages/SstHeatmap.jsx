import { useEffect, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getSstHeatmap } from '../services/sst';

/*
  R25 — ESTE é o lugar onde a escala de cor crua morava: a toneClass()
  devolvia `rose/amber/sky/emerald` (fundo + borda + texto) para os quatro
  níveis de criticidade. Paleta crua não tem par no tema escuro e não passa
  pelo piso de contraste do ThemeContext.

  O sistema NÃO tem paleta de INTENSIDADE em token — tem cinco famílias
  semânticas (`--sem-danger/warning/info/success/neutral`, cada uma com
  `-bg` e `-border`). Não inventei degrau nenhum: os quatro níveis vão para
  quatro famílias distintas, então a distinção que a tela tinha continua de
  pé, e a cor passa a acompanhar o tema e o piso de contraste.

  O que ficou faltando está no relatório: uma rampa de intensidade de VERDADE
  (o `indice_risco`, que é contínuo, hoje só aparece como número) exigiria
  tokens novos em `styles/design-tokens.css` — arquivo compartilhado, fora
  do alcance desta rodada.
*/
const FAMILIA_CRITICIDADE = {
  CRITICA: 'danger',
  CRITICO: 'danger',
  EMERGENCIAL: 'danger',
  ALTA: 'warning',
  ATENCAO: 'warning',
  MEDIA: 'info',
  CONTROLADO: 'info',
  BAIXA: 'success',
  EXCELENTE: 'success'
};

function familiaCriticidade(valor) {
  return FAMILIA_CRITICIDADE[String(valor || '').toUpperCase()] || 'neutral';
}

function rotuloTotal(chave) {
  return String(chave || '').replace(/_/g, ' ');
}

export default function SstHeatmap() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    getSstHeatmap()
      .then((payload) => setData(payload))
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar heatmap SST'))
      .finally(() => setLoading(false));
  }, []);

  const totais = Object.entries(data?.totais || {});
  const pontos = data?.heatmap || [];

  return (
    <Pagina>
      <PageHeader
        titulo="Mapa de risco operacional"
        contagem={loading ? 'Carregando' : `${pontos.length} obra(s)`}
        descricao="Concentra pendências, bloqueios, acidentes e riscos por obra para priorizar ação operacional."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 2 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-heatmap" larguraPadrao="total">
        <BlocoConteudo titulo="Totais do recorte" descricao="Soma do que o mapa distribui por obra.">
          <StatGrid>
            {totais.map(([chave, valor]) => (
              <StatTile key={chave} label={rotuloTotal(chave)} valor={valor} />
            ))}
            {!totais.length ? <StatTile label="Totais" valor={0} vazio /> : null}
          </StatGrid>
        </BlocoConteudo>

        {/*
          Mapa de calor, não tabela: a leitura aqui é espacial — a pessoa
          varre o grid procurando as manchas vermelhas, não compara colunas.
          Por isso o padrão entra como MOLDURA (Pagina + PageHeader +
          BlocoConteudo) e o miolo continua sendo um grid de células, cada
          uma com a tarja da sua família e a etiqueta de criticidade (cor +
          ícone + texto — cor sozinha não comunica para daltônicos).
        */}
        <BlocoConteudo
          titulo="Risco por obra"
          variante="primario"
          cor="var(--module-sst)"
          contagem={`${pontos.length} ponto(s)`}
          descricao="Cada celula soma pendências, bloqueios, acidentes e riscos da obra."
        >
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pontos.map((item) => (
              <BlocoConteudo
                key={`${item.obra_id || 'sem'}-${item.obra}`}
                variante="secundario"
                className={`tarja tarja--${familiaCriticidade(item.criticidade)}`}
                titulo={item.obra}
                descricao={`Índice de risco ${item.indice_risco}`}
                acoes={<StatusBadge status={item.criticidade || 'SEM NIVEL'} kind={familiaCriticidade(item.criticidade)} />}
              >
                <StatGrid colunas={2}>
                  <StatTile label="Pendências" valor={item.pendencias ?? 0} tom={item.pendencias ? 'warning' : undefined} />
                  <StatTile label="Bloqueios" valor={item.bloqueios ?? 0} tom={item.bloqueios ? 'danger' : undefined} />
                  <StatTile label="Acidentes" valor={item.acidentes ?? 0} tom={item.acidentes ? 'danger' : undefined} />
                  <StatTile label="Riscos" valor={item.riscos ?? 0} tom={item.riscos ? 'warning' : undefined} />
                </StatGrid>
              </BlocoConteudo>
            ))}
            {!pontos.length ? <p className="text-sm text-muted">Nenhum ponto crítico detectado.</p> : null}
          </div>
        </BlocoConteudo>
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
