import { useEffect, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  BlocosPersonalizaveis,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import { obterDashboardOperacional } from '../../../services/crm';

const LIFECYCLE_LABEL = {
  NOVO: 'Novo',
  CONTATO: 'Contato',
  QUALIFICADO: 'Qualificado',
  OPORTUNIDADE: 'Oportunidade',
  CONVERTIDO: 'Convertido',
  PERDIDO: 'Perdido',
  ARQUIVADO: 'Arquivado'
};

function texto(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

export default function CrmDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  /*
    R3/R19 — o `alert()` do navegador (que era o ÚNICO tratamento de erro
    desta tela) virou faixa do sistema. A caixa do Chrome ignorava tema e
    tokens, bloqueava a página e sumia sem deixar rastro no DOM; pior, aqui
    ela aparecia sobre uma tela em branco, porque o `catch` não desligava
    nada além do carregando.
  */
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    obterDashboardOperacional()
      .then(setData)
      .catch((err) => avisar.erro(err?.message || 'Erro ao carregar dashboard'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leads = data?.leads || {};
  const sla = data?.sla || {};
  const tarefas = data?.tarefas || {};
  const distribuicaoLifecycle = data?.distribuicaoLifecycle || [];
  const backlogPorResponsavel = data?.backlogPorResponsavel || [];

  return (
    <Pagina>
      {/*
        R13/C1 — o cabeçalho era um `.app-toolbar-card` que rolava para fora
        da tela; agora é a faixa fixa do PageHeader, que compacta e não some.

        C2 × B3 (critério de 05/09): a faixa fica com o TOTAL (leads ativos,
        o número que responde "quanto existe") e os ladrilhos ficam com os
        RECORTES (hoje, semana, convertidos, perdidos). O cartão "Leads
        ativos" repetia exatamente o número da faixa e não tinha recorte
        próprio para mostrar — some do bloco, permanece na faixa, onde
        acompanha a pessoa na rolagem.

        R11/C6: os botões "Leads" e "Tarefas" eram NAVEGAÇÃO na barra de
        ações — menu lateral e Ctrl+K resolvem, e o catálogo é explícito
        ("links para telas irmãs não entram no PageHeader").
      */}
      <PageHeader
        titulo="Dashboard CRM"
        contagem={loading ? null : `${texto(leads.ativos)} lead(s) ativo(s)`}
        descricao="Visão operacional em tempo real."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? (
        <BlocoConteudo>Carregando dashboard operacional...</BlocoConteudo>
      ) : !data ? null : (
        <>
          {/*
            M2/R10 + R25: os cartões eram `text-3xl` (fora dos papéis
            12/14/18/22) pintados com paleta crua — indigo/blue/emerald/red,
            sem par no tema escuro e fora do piso de contraste do
            ThemeContext. O StatTile traz escala e tom semântico por token.
          */}
          <StatGrid colunas={3}>
            <StatTile label="Recebidos hoje" valor={texto(leads.hoje)} />
            <StatTile label="Recebidos esta semana" valor={texto(leads.semana)} />
            <StatTile label="Convertidos (total)" valor={texto(leads.convertidos)} tom="success" />
            <StatTile label="Conversões (7 dias)" valor={texto(leads.conversoesUltimos7Dias)} tom="success" />
            <StatTile label="Perdidos (total)" valor={texto(leads.perdidos)} tom="danger" />
          </StatGrid>

          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 3 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:crm-dashboard"
            larguraPadrao="total"
            dentroDeGrade
          >
            {/*
              B2 — UM primário por tela: é a fila que exige ação hoje, e por
              isso ela carrega a barra de cor. Os dois blocos de leitura abaixo
              ficam neutros.
            */}
            <BlocoConteudo
              titulo="Fila e atrasos"
              variante="primario"
              cor="var(--sem-warning)"
              descricao="O que precisa de tratamento antes de novas entradas."
            >
              <StatGrid colunas={3}>
                <StatTile
                  label="Sem primeiro contato (SLA)"
                  valor={texto(sla.semPrimeiroContato)}
                  sub="Leads novos sem contato ha mais de 60 min"
                  tom={sla.semPrimeiroContato > 0 ? 'warning' : undefined}
                />
                <StatTile
                  label="Tarefas pendentes"
                  valor={texto(tarefas.pendentes)}
                  tom="info"
                />
                <StatTile
                  label="Tarefas vencidas"
                  valor={texto(tarefas.vencidas)}
                  sub="Prazo expirado, ainda pendentes"
                  tom={tarefas.vencidas > 0 ? 'danger' : undefined}
                />
              </StatGrid>
            </BlocoConteudo>

            {/*
              R1/R17 — as duas listas eram pares rótulo/valor em <div> soltos:
              sem coluna declarada, sem alinhamento por tipo, sem
              redimensionamento e sem largura salva por usuário. Viram
              TabelaPadrao com o papel de cada coluna declarado.
            */}
            <BlocoConteudo
              titulo="Distribuição por status"
              descricao="Onde a carteira esta parada no ciclo de vida do lead."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'status',
                    titulo: 'Status',
                    // R17: `semIdentidade` abaixo — status é classificação, não
                    // o nome de um registro; forçar 'identidade' aqui poria
                    // maiúsculas num rótulo que já tem caixa própria.
                    tipo: 'texto',
                    noCard: 'titulo',
                    render: (item) => LIFECYCLE_LABEL[item.lifecycle_status] || item.lifecycle_status
                  },
                  {
                    id: 'total',
                    titulo: 'Leads',
                    tipo: 'numero',
                    render: (item) => item.total
                  }
                ]}
                itens={distribuicaoLifecycle}
                semIdentidade
                getId={(item) => item.lifecycle_status}
                vazio="Nenhum dado disponível."
                storageKey="tabela:crm-dashboard:distribuicao-status"
                rotuloRolagem="Distribuicao por status"
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Backlog por responsável"
              descricao="Carteira ativa atribuída a cada usuário."
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'responsavel',
                    titulo: 'Responsável',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => item.usuario?.nome || '—'
                  },
                  {
                    id: 'total',
                    titulo: 'Leads',
                    tipo: 'numero',
                    render: (item) => item.total
                  }
                ]}
                itens={backlogPorResponsavel}
                getId={(item) => item.usuario?.id || item.usuario?.nome}
                vazio="Nenhum responsável atribuído."
                storageKey="tabela:crm-dashboard:backlog-responsavel"
                rotuloRolagem="Backlog por responsavel"
              />
            </BlocoConteudo>
          </BlocosPersonalizaveis>
        </>
      )}
    </Pagina>
  );
}
