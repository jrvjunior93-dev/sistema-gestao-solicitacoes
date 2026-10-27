import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
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
import StatusBadge from '../../../components/StatusBadge';
import { getFiscalDashboard } from '../services/fiscalApi';

function texto(valor) {
  return valor === null || valor === undefined ? '—' : String(valor);
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('pt-BR');
}

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

export default function FiscalDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  // R3/R19: a faixa de erro à mão (border-red-200/bg-red-50, sem par no tema
  // escuro) vira o aviso do sistema.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    getFiscalDashboard()
      .then((response) => {
        if (mounted) setData(response);
      })
      .catch((err) => {
        if (mounted) avisar.erro(err.message || 'Erro ao carregar painel fiscal');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumo = data?.resumo || {};
  const modulo = data?.modulo || {};
  const documentos = data?.documentos || {};
  const sincronizacao = data?.sincronizacao || {};

  return (
    <Pagina>
      {/*
        R13/C1 — o cabeçalho era um bloco solto que rolava para fora; vira a
        faixa fixa que compacta e não some.

        C2 × B3 (critério de 05/09): a faixa fica com o TOTAL de documentos
        fiscais — o número que responde "quanto existe" — e os ladrilhos
        ficam com os RECORTES (pendentes, com divergência, validados,
        ignorados). O cartão "Documentos fiscais" repetia exatamente o
        número da faixa e não tinha recorte próprio: sai do bloco e fica na
        faixa, onde acompanha a pessoa na rolagem.

        R11/C6: os botões "Empresas fiscais" e "Documentos" eram NAVEGAÇÃO
        na barra de ações. Antes de tirá-los conferi o destino: `/fiscal/
        empresas` (fiscal-empresas) e `/fiscal/documentos` (fiscal-documentos)
        são itens do menu do módulo no `navigationConfig`, ou seja, porta de
        nível 1 — ninguém perde caminho.
      */}
      <PageHeader
        titulo="Painel Fiscal"
        contagem={loading ? null : `${texto(resumo.documentos_total)} documento(s) fiscal(is)`}
        descricao="Fundacao do módulo fiscal preparada para empresas monitoradas, documentos DFe e logs de sincronização."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? (
        <BlocoConteudo>Carregando painel...</BlocoConteudo>
      ) : (
        <>
          {/*
            M2/R10 + R25: os cartões eram `text-3xl` (fora dos papéis
            12/14/18/22) com paleta crua. O StatTile traz escala e tom
            semântico por token; o tom acompanha o que o número significa.
          */}
          <StatGrid colunas={4}>
            <StatTile label="Empresas ativas" valor={texto(resumo.empresas_ativas)} />
            <StatTile
              label="Pendentes"
              valor={texto(resumo.documentos_pendentes)}
              tom={Number(resumo.documentos_pendentes) > 0 ? 'warning' : undefined}
            />
            <StatTile
              label="Divergências abertas"
              valor={texto(resumo.divergencias_abertas)}
              tom={Number(resumo.divergencias_abertas) > 0 ? 'danger' : undefined}
            />
            <StatTile
              label="Com divergência"
              valor={texto(resumo.documentos_com_divergencia)}
              tom={Number(resumo.documentos_com_divergencia) > 0 ? 'warning' : undefined}
            />
            <StatTile label="Validados" valor={texto(resumo.documentos_validados)} tom="success" />
            <StatTile label="Ignorados" valor={texto(resumo.documentos_ignorados)} />
            <StatTile
              label="Último sync"
              valor={texto(sincronizacao?.ultimo_log?.status || '-')}
              sub={formatDateTime(sincronizacao?.ultimo_log?.started_at)}
              span={2}
            />
          </StatGrid>

          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 4 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:fiscal-dashboard"
            larguraPadrao="total"
            dentroDeGrade
          >
            <BlocoConteudo
              titulo="Estado da fundacao"
              descricao="Como o módulo esta configurado neste ambiente."
            >
              <StatGrid colunas={3}>
                <StatTile label="SEFAZ real" valor={modulo.sefaz_enabled ? 'habilitada' : 'desabilitada'} />
                <StatTile label="S3 fiscal" valor={modulo.storage_configured ? 'configurado' : 'pendente'} />
                <StatTile label="Prefixo S3" valor={modulo.storage_prefix || '—'} />
              </StatGrid>
            </BlocoConteudo>

            {/*
              R1/R17 — as duas listas eram pares rótulo/valor em <div> soltos:
              sem coluna declarada, sem alinhamento por tipo, sem
              redimensionamento e sem largura salva por usuário.
            */}
            <BlocoConteudo titulo="Documentos por status">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'status',
                    titulo: 'Status',
                    // R17: `semIdentidade` abaixo — status é classificação, não
                    // nome de registro.
                    tipo: 'texto',
                    noCard: 'titulo',
                    render: (item) => <StatusBadge status={item.status || '-'} />
                  },
                  {
                    id: 'total',
                    titulo: 'Documentos',
                    tipo: 'numero',
                    render: (item) => item.total
                  }
                ]}
                itens={documentos.por_status || []}
                semIdentidade
                getId={(item) => item.status}
                storageKey="tabela:painel-fiscal:documentos-por-status"
                rotuloRolagem="Documentos por status"
                vazio="Sem dados ainda."
              />
            </BlocoConteudo>

            <BlocoConteudo titulo="Documentos por origem">
              <TabelaPadrao
                colunas={[
                  {
                    id: 'origem',
                    titulo: 'Origem',
                    tipo: 'texto',
                    noCard: 'titulo',
                    render: (item) => item.source || '-'
                  },
                  {
                    id: 'total',
                    titulo: 'Documentos',
                    tipo: 'numero',
                    render: (item) => item.total
                  }
                ]}
                itens={documentos.por_origem || []}
                semIdentidade
                getId={(item) => item.source}
                storageKey="tabela:painel-fiscal:documentos-por-origem"
                rotuloRolagem="Documentos por origem"
                vazio="Sem dados ainda."
              />
            </BlocoConteudo>

            {/*
              B2 — UM primário por tela: é a caixa de entrada recente que gera
              ação, e por isso ela carrega a barra de cor.
              O "Ver todos" fica: ele é caminho no CORPO, junto do dado que o
              origina (a lista completa daquelas linhas), não navegação vestida
              de ação na faixa.
            */}
            <BlocoConteudo
              titulo="Documentos recentes"
              variante="primario"
              cor="var(--module-fiscal)"
              acoes={(
                <Link className="btn btn-outline btn-sm" to="/fiscal/documentos">Ver todos</Link>
              )}
            >
              <TabelaPadrao
                colunas={[
                  {
                    id: 'emissao',
                    titulo: 'Emissão',
                    tipo: 'data',
                    render: (item) => formatDate(item.emission_date)
                  },
                  {
                    id: 'fornecedor',
                    titulo: 'Fornecedor',
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (item) => (
                      <Link className="text-[var(--c-primary)] hover:underline" to={`/fiscal/documentos/${item.id}`}>
                        {item.issuer_name || item.issuer_cnpj || '-'}
                      </Link>
                    )
                  },
                  {
                    id: 'numero',
                    titulo: 'Número',
                    tipo: 'codigo',
                    render: (item) => item.document_number || '-'
                  },
                  {
                    id: 'valor',
                    titulo: 'Valor',
                    // T7: dinheiro nunca trunca — 190px, à direita, tabular.
                    tipo: 'valor',
                    render: (item) => formatMoney(item.total_value)
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (item) => <StatusBadge status={item.document_status} />
                  }
                ]}
                itens={documentos.recentes || []}
                storageKey="tabela:painel-fiscal:documentos-recentes"
                rotuloRolagem="Documentos recentes"
                vazio="Nenhum documento fiscal encontrado."
              />
            </BlocoConteudo>
          </BlocosPersonalizaveis>

          {/* Histórico/auditoria nasce recolhido, mas o título fica à vista. */}
          <BlocoConteudo
            titulo="Logs recentes"
            variante="secundario"
            recolhivel
            chavePreferencia="bloco:fiscal-dashboard:logs-recentes"
            recolhidoPadrao={!(sincronizacao.logs_recentes || []).length}
          >
            {/* semIdentidade: log de sincronizacao nao nomeia registro algum —
                e um evento (inicio + tipo + status), sem entidade titular. */}
            <TabelaPadrao
              semIdentidade
              colunas={[
                {
                  id: 'inicio',
                  titulo: 'Início',
                  tipo: 'data',
                  noCard: 'titulo',
                  render: (log) => formatDateTime(log.started_at)
                },
                {
                  id: 'tipo',
                  titulo: 'Tipo',
                  tipo: 'texto',
                  render: (log) => log.request_type
                },
                {
                  id: 'status',
                  titulo: 'Status',
                  tipo: 'status',
                  render: (log) => <StatusBadge status={log.status} />
                },
                {
                  id: 'docs',
                  titulo: 'Docs',
                  tipo: 'numero',
                  render: (log) => log.documents_processed || log.documents_found || 0
                },
                {
                  id: 'mensagem',
                  titulo: 'Mensagem',
                  tipo: 'texto',
                  render: (log) => (
                    <span title={log.response_message || log.error_message || undefined}>
                      {log.response_message || log.error_message || '-'}
                    </span>
                  )
                }
              ]}
              itens={sincronizacao.logs_recentes || []}
              storageKey="tabela:painel-fiscal:logs-recentes"
              rotuloRolagem="Logs recentes"
              vazio="Nenhum log fiscal registrado."
            />
          </BlocoConteudo>
        </>
      )}
    </Pagina>
  );
}
