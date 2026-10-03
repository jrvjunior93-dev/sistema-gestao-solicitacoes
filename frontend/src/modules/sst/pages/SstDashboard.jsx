import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiOutlineClipboardDocumentCheck, HiOutlineExclamationTriangle, HiOutlineShieldCheck, HiOutlineUserGroup } from 'react-icons/hi2';
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
import { useUiVisibility } from '../../../hooks/useUiVisibility';
import { useAuth } from '../../../contexts/AuthContext';
import { canViewSstArea } from '../../../utils/acessoProduto';
import { getSstDashboard } from '../services/sst';
import { SST_NAV } from '../constants/sstResources';

/*
  R25 — o MetricCard local pintava cinco tons com paleta crua do Tailwind
  (`emerald-50/200/900`, `amber-*`, `rose-*`, `sky-*`): sem par no tema
  escuro e fora do piso de contraste do ThemeContext. O ladrilho passa a ser
  o `StatTile` do catálogo, cujo `tom` resolve a cor por token semântico.
  O mapa preserva a distinção que a tela tinha — "tem risco crítico" é
  perigo, "está zerado" é sucesso, "vence em breve" é atenção.
*/
function tom(condicao, tomAtivo, tomInativo) {
  return condicao ? tomAtivo : tomInativo;
}

export default function SstDashboard() {
  const { isVisible } = useUiVisibility();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // R19/R3: o <div> de erro à mão vira a faixa de avisos do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;
    setLoading(true);
    getSstDashboard()
      .then((payload) => {
        if (!active) return;
        setData(payload);
      })
      .catch((err) => {
        if (!active) return;
        avisar.erro(err?.message || 'Erro ao carregar SST');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const cards = data?.cards || {};
  const visibleNav = SST_NAV.filter(([key]) => canViewSstArea(user, key === 'eventos' ? 'analytics' : key));

  return (
    <Pagina>
      {/* R13/C1/R5: o cabeçalho era uma <section> com <h1> de 3xl e o apoio
          solto; agora é a faixa fixa do sistema, que compacta na rolagem e
          mantém a ação principal a um clique em página longa. */}
      <PageHeader
        titulo="Saúde e Seguranca do Trabalho"
        descricao="Controle operacional de riscos, ASO, exames, EPIs, treinamentos, acidentes e documentos por empresa e obra."
        acaoPrincipal={{ rotulo: 'Relatórios SST', to: '/sst/relatorios' }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
        em que ligar isto é SEGURO: estes 3 blocos são leituras
        independentes — sem ordem obrigatória entre si, sem botão de gravar
        dentro e sem campo obrigatório que ocultar esconda. O padrão continua
        sendo o do código; a preferência guarda só o DESVIO. No celular o
        modo não existe (arrastar é HTML5 nativo e não responde a toque).
      */}
      <BlocosPersonalizaveis chave="blocos:sst-dashboard" larguraPadrao="total">
        {isVisible('sst.dashboard.metricas_principais') ? (
          <BlocoConteudo
            titulo="Indicadores críticos"
            variante="primario"
            cor="var(--module-sst)"
            descricao={data?.periodo_alerta_dias
              ? `Alertas de validade considerando ${data.periodo_alerta_dias} dia(s).`
              : 'Compliance, risco e aptidao no recorte atual.'}
          >
            <StatGrid>
              <StatTile
                label={<><HiOutlineShieldCheck aria-hidden="true" /> Compliance score</>}
                valor={`${cards.compliance_score ?? 100}%`}
                tom="success"
              />
              <StatTile
                label={<><HiOutlineExclamationTriangle aria-hidden="true" /> Riscos críticos</>}
                valor={cards.riscos_criticos ?? 0}
                tom={tom(cards.riscos_criticos, 'danger', 'info')}
              />
              <StatTile
                label={<><HiOutlineUserGroup aria-hidden="true" /> Colaboradores inaptos</>}
                valor={cards.colaboradores_inaptos ?? 0}
                tom={tom(cards.colaboradores_inaptos, 'danger', 'success')}
              />
              <StatTile
                label={<><HiOutlineClipboardDocumentCheck aria-hidden="true" /> Pendências críticas</>}
                valor={cards.pendencias_criticas ?? 0}
                tom={tom(cards.pendencias_criticas, 'danger', undefined)}
              />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {isVisible('sst.dashboard.vencimentos') ? (
          <BlocoConteudo
            titulo="Vencimentos"
            descricao="Documentos e entregas que já venceram ou estão no prazo de alerta."
          >
            <StatGrid>
              <StatTile label="Exames vencidos" valor={cards.exames_vencidos ?? 0} tom={tom(cards.exames_vencidos, 'danger', undefined)} />
              <StatTile label="ASO vencidos" valor={cards.aso_vencidos ?? 0} tom={tom(cards.aso_vencidos, 'danger', undefined)} />
              <StatTile label="EPI vencendo" valor={cards.epi_vencendo ?? 0} tom={tom(cards.epi_vencendo, 'warning', undefined)} />
              <StatTile label="Treinamentos vencidos" valor={cards.treinamentos_vencidos ?? 0} tom={tom(cards.treinamentos_vencidos, 'danger', undefined)} />
            </StatGrid>
          </BlocoConteudo>
        ) : null}

        {isVisible('sst.dashboard.operacao') ? (
          <BlocoConteudo
            titulo="Operação SST"
            contagem={loading ? 'Carregando' : `${visibleNav.length} area(s)`}
            descricao="Áreas do módulo liberadas para o seu acesso."
          >
            {/* R25: os atalhos usavam `hover:border-sky-200 hover:bg-sky-50
              hover:text-sky-900` — paleta crua. Passam a ser botões do
                sistema (`btn btn-outline`), que já trazem alvo de 32px (R2),
                foco visível e cor por token. */}
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visibleNav.map(([key, label]) => (
                <Link key={key} to={`/sst/${key}`} className="btn btn-outline">
                  {label}
                </Link>
              ))}
            </div>
          </BlocoConteudo>
        ) : null}
      </BlocosPersonalizaveis>
    </Pagina>
  );
}
