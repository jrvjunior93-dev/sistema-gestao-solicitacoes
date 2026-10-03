import { useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  getFiscalCompanies,
  getFiscalDiagnostics,
  getFiscalSyncLogs,
  getFiscalSyncLogRawUrl,
  getFiscalSyncStates,
  runFiscalManualSync,
  runFiscalSyncPreflight
} from '../services/fiscalApi';

function formatDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString('pt-BR');
}

/*
  R25 — severidade de check e de log é FAMÍLIA SEMÂNTICA, não paleta crua.
  `emerald/amber/rose` eram escritos à mão aqui (três mapas diferentes na
  mesma tela): não têm par no tema escuro e não passam pelo piso de
  contraste do ThemeContext.

  O mapa é EXPLÍCITO porque a classificação automática do StatusBadge lê
  vocabulário em português ("APROVADO", "VENCIDO") e estes são códigos
  técnicos em inglês: `OK` e `ERROR` cairiam ambos em "info" — o check que
  falhou apareceria azul, do lado do que passou.
*/
const FAMILIA_CHECK = {
  OK: 'success',
  ERROR: 'danger',
  WARN: 'warning'
};

function familiaCheck(status) {
  return FAMILIA_CHECK[String(status || 'WARN').toUpperCase()] || 'warning';
}

/*
  Status do log de sincronização (chave técnica do backend). Mesmo motivo do
  mapa acima: `success`/`error` não são vocabulário que o StatusBadge
  reconheça sozinho.
*/
const FAMILIA_LOG = {
  success: 'success',
  ok: 'success',
  error: 'danger',
  failed: 'danger',
  blocked: 'danger',
  skipped: 'neutral',
  running: 'info',
  pending: 'warning',
  partial: 'warning'
};

function familiaLog(status) {
  return FAMILIA_LOG[String(status || '').toLowerCase()] || 'info';
}

export default function FiscalLogs() {
  const [logs, setLogs] = useState([]);
  const [states, setStates] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [diagnostics, setDiagnostics] = useState(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflight, setPreflight] = useState(null);
  const { avisos, avisar, fechar } = useAvisos();

  const load = async () => {
    setLoading(true);
    try {
      const [logsResult, statesResult, companiesResult, diagnosticsResult] = await Promise.all([
        getFiscalSyncLogs(),
        getFiscalSyncStates(),
        getFiscalCompanies({ ativo: true }),
        getFiscalDiagnostics()
      ]);
      const nextCompanies = companiesResult?.data || [];
      setLogs(logsResult?.data || []);
      setStates(statesResult?.data || []);
      setCompanies(nextCompanies);
      setDiagnostics(diagnosticsResult);
      setSelectedCompanyId((current) => current || String(nextCompanies.find((company) => company.modulo_fiscal_habilitado)?.id || nextCompanies[0]?.id || ''));
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar logs fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    load().finally(() => {
      if (!mounted) return;
    });
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runManual = async () => {
    setRunning(true);
    try {
      const result = await runFiscalManualSync({
        document_type: 'nfe',
        company_id: selectedCompanyId || undefined
      });
      avisar.sucesso(result?.message || 'Tentativa de sincronizacao registrada.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao registrar tentativa manual');
    } finally {
      setRunning(false);
    }
  };

  const runPreflight = async () => {
    setPreflightRunning(true);
    try {
      const result = await runFiscalSyncPreflight({
        document_type: 'nfe',
        company_id: selectedCompanyId || undefined
      });
      setPreflight(result);
      /*
        Tom SEMÂNTICO segue o RESULTADO, não o fato de a chamada ter
        terminado: preflight com pendências não é sucesso. Pintar de verde
        um "revise os checks antes de ativar SEFAZ" é o defeito de erro
        vestido de sucesso que este projeto já registrou.
      */
      if (result?.ready) {
        // Resultado do preflight fica fixo no painel (StatusBadge/tabela) abaixo: o aviso pode sumir sozinho.
        avisar.sucesso('Preflight concluído. Ambiente pronto para a próxima etapa controlada.', undefined, { efemero: true });
      } else {
        avisar.alerta('Preflight concluído com pendências. Revise os checks antes de ativar SEFAZ.');
      }
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao executar preflight fiscal');
    } finally {
      setPreflightRunning(false);
    }
  };

  const openRawPayload = async (log, type) => {
    /*
      R26 — o log é fixado no argumento ANTES do `await`: a lista recarrega
      sozinha depois de cada execução, e ler `log.id` de um estado relido
      abriria o payload de outra execução.
    */
    const alvo = log;
    try {
      const result = await getFiscalSyncLogRawUrl(alvo.id, type);
      if (result?.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
        avisar.informacao(`URL assinada do ${type === 'request' ? 'request' : 'response'} gerada por tempo limitado.`);
      }
    } catch (err) {
      avisar.erro(err.message || 'Erro ao gerar URL do payload bruto fiscal');
    }
  };

  const sefazEnabled = Boolean(diagnostics?.sefaz?.enabled);
  const endpointOk = Boolean(diagnostics?.sefaz?.distribution_url_configured && diagnostics?.sefaz?.distribution_url_https);
  const manualActionLabel = sefazEnabled ? 'Sincronizar SEFAZ agora' : 'Registrar tentativa sem consultar';
  const manualActionHelp = sefazEnabled
    ? 'Executa uma chamada real ao Ambiente Nacional da NF-e para a empresa selecionada. O request e o response brutos serao armazenados no S3 fiscal privado.'
    : 'SEFAZ esta desabilitada por FISCAL_SEFAZ_ENABLED=false. O botao apenas registra uma tentativa controlada, sem chamada externa.';

  const empresaSelecionada = useMemo(
    () => companies.find((company) => String(company.id) === String(selectedCompanyId)) || null,
    [companies, selectedCompanyId]
  );

  return (
    <Pagina className="fiscal-page">
      <PageHeader
        titulo="Logs de sincronização"
        contagem={`${logs.length} execuções registradas`}
        descricao="Auditoria técnica das sincronizacoes fiscais. Jobs reais serão ativados em fase posterior."
        acaoPrincipal={{
          rotulo: running ? 'Executando...' : manualActionLabel,
          onClick: runManual,
          desabilitada: running || !companies.length || (sefazEnabled && !endpointOk),
          title: manualActionHelp
        }}
        secundarias={[{
          rotulo: preflightRunning ? 'Validando...' : 'Executar preflight',
          onClick: runPreflight,
          desabilitada: preflightRunning || !companies.length
        }]}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Escopo da execução"
        descricao="Empresa e tipo documental que as duas ações acima vao usar."
        variante="secundario"
      >
        {/*
          R12 — este `select` NÃO é filtro de lista: as tabelas abaixo
          continuam mostrando TUDO. Ele escolhe sobre QUAL empresa a
          sincronização e o preflight vão agir — seletor de CONTEXTO, que a
          própria R12 declara legítimo. Vestir de marcação um controle que
          decide o alvo de uma chamada externa faria a etiqueta prometer
          recorte de lista que não existe.
        */}
        <FormSecao colunas={2}>
          <CampoForm label="Empresa fiscal">
            <select
              className="input"
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              disabled={loading || !companies.length || running || preflightRunning}
            >
              <option value="">Todas as empresas monitoradas</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.razao_social || company.nome_fantasia || company.cnpj}
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>

        <StatGrid colunas={4}>
          <StatTile
            label="SEFAZ real"
            valor={sefazEnabled ? 'Habilitada' : 'Desabilitada'}
            sub={manualActionHelp}
            tom={sefazEnabled ? 'danger' : undefined}
          />
          <StatTile
            label="Endpoint"
            valor={endpointOk ? 'Configurado' : 'Pendente'}
            tom={endpointOk ? 'success' : 'warning'}
          />
          <StatTile label="Tipo documental" valor="nfe" />
          <StatTile
            label="Escopo"
            valor={selectedCompanyId ? 'Empresa selecionada' : 'Todas monitoradas'}
            sub={empresaSelecionada?.razao_social || 'Todas as empresas monitoradas'}
          />
        </StatGrid>
      </BlocoConteudo>

      {preflight ? (
        <BlocoConteudo
          titulo="Preflight da sincronização"
          descricao="Validação administrativa sem consulta real a SEFAZ."
          variante="secundario"
          acoes={<StatusBadge status={preflight.ready ? 'Pronto' : 'Com pendencias'} kind={preflight.ready ? 'success' : 'warning'} />}
        >
          <TabelaPadrao
            /*
              R17 — `semIdentidade` DECLARADO, com o motivo: a linha é um
              CHECK, não um registro nomeável. O que a identifica é o código
              técnico do check (`SEFAZ_ENDPOINT`, `STORAGE_WRITABLE`) e a
              coluna de identidade exibe em MAIÚSCULAS — o que transformaria
              o identificador que existe no sistema em outra string. Chave
              técnica é `tipo: 'codigo'`.
            */
            semIdentidade
            colunas={[
              {
                id: 'codigo',
                titulo: 'Check',
                tipo: 'codigo',
                noCard: 'titulo',
                render: (check) => check.code
              },
              {
                id: 'mensagem',
                titulo: 'Mensagem',
                tipo: 'texto',
                render: (check) => check.message || '-'
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (check) => <StatusBadge status={check.status} kind={familiaCheck(check.status)} />
              }
            ]}
            itens={preflight.global_checks || []}
            getId={(check) => check.code}
            vazio="Nenhum check global retornado."
            storageKey="tabela:logs-fiscais:preflight-checks-globais"
            rotuloRolagem="Checks gerais do preflight"
          />

          {(preflight.companies || []).map((item) => (
            <BlocoConteudo
              key={item.company.id}
              titulo={item.company.razao_social}
              descricao={`${item.company.cnpj} - ${item.company.uf}`}
              variante="secundario"
              acoes={<StatusBadge status={item.ready ? 'Pronta' : 'Pendente'} kind={item.ready ? 'success' : 'warning'} />}
            >
              <TabelaPadrao
                /* Mesmo motivo da tabela acima: a linha é um check da empresa,
                   e o nome próprio (a razão social) já é o TÍTULO do bloco. */
                semIdentidade
                colunas={[
                  {
                    id: 'codigo',
                    titulo: 'Check',
                    tipo: 'codigo',
                    noCard: 'titulo',
                    render: (check) => check.code
                  },
                  {
                    id: 'mensagem',
                    titulo: 'Mensagem',
                    tipo: 'texto',
                    render: (check) => check.message || '-'
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (check) => <StatusBadge status={check.status} kind={familiaCheck(check.status)} />
                  }
                ]}
                itens={item.checks || []}
                getId={(check) => check.code}
                vazio="Nenhum check retornado para esta empresa."
                storageKey="tabela:logs-fiscais:preflight-checks-empresa"
                rotuloRolagem={`Checks do preflight de ${item.company.razao_social}`}
              />
            </BlocoConteudo>
          ))}
        </BlocoConteudo>
      ) : null}

      <BlocoConteudo
        titulo="Estados de sincronização"
        contagem={`${states.length} estados`}
        descricao="Controle de NSU por empresa, ambiente e tipo documental."
        variante="secundario"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'empresa',
              titulo: 'Empresa',
              /*
                R17 — aqui a identidade EXISTE e é a empresa: o estado de
                sincronização é um REGISTRO por empresa/ambiente/tipo (o
                controle de NSU dela), não um evento. Razão social em
                maiúsculas continua sendo a razão social.
              */
              tipo: 'identidade',
              noCard: 'titulo',
              render: (state) => state.company?.razao_social || '-'
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (state) => state.document_type
            },
            {
              id: 'ambiente',
              titulo: 'Ambiente',
              tipo: 'texto',
              render: (state) => state.ambiente_sefaz
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (state) => <StatusBadge status={state.status || '-'} kind={familiaLog(state.status)} />
            },
            {
              id: 'ult_nsu',
              titulo: 'Ult. NSU',
              tipo: 'numero',
              render: (state) => state.ult_nsu || '0'
            },
            {
              id: 'max_nsu',
              titulo: 'Max. NSU',
              tipo: 'numero',
              render: (state) => state.max_nsu || '0'
            },
            {
              id: 'ultima_tentativa',
              titulo: 'Última tentativa',
              tipo: 'data',
              render: (state) => formatDateTime(state.last_attempt_at)
            },
            {
              id: 'proxima_tentativa',
              titulo: 'Próxima tentativa',
              tipo: 'data',
              render: (state) => formatDateTime(state.next_allowed_sync_at)
            },
            {
              id: 'erro',
              titulo: 'Erro',
              tipo: 'texto',
              render: (state) => (
                <div className="text-xs text-[var(--c-muted)]">
                  {state.last_error_code ? (
                    <div className="font-semibold text-[var(--c-text)]">{state.last_error_code}</div>
                  ) : null}
                  <div className="line-clamp-2">{state.last_error_message || '-'}</div>
                </div>
              )
            }
          ]}
          itens={states}
          carregando={loading}
          vazio="Nenhum estado de sincronização registrado."
          storageKey="tabela:logs-fiscais:estados-sincronizacao"
          rotuloRolagem="Estados de sincronizacao"
        />
      </BlocoConteudo>

      {/* B2 — o bloco principal é o que a tela existe para mostrar: o
          histórico de execuções. */}
      <BlocoConteudo
        titulo="Logs recentes"
        contagem={`${logs.length} execuções`}
        descricao="Cada linha e uma EXECUÇÃO: quando comecou, sobre qual empresa, o que a SEFAZ respondeu."
        variante="primario"
        cor="var(--module-fiscal)"
      >
        <TabelaPadrao
          /*
            R17 — `semIdentidade` DECLARADO, com o motivo: a linha de log é um
            EVENTO (data + tipo + status + mensagem), não um registro com
            nome próprio. A empresa aparece na linha como CONTEXTO da
            execução, não como identidade dela — e forçá-la a `identidade`
            faria a tabela afirmar que a linha É a empresa, quando a mesma
            empresa aparece em dezenas de execuções diferentes.
          */
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
              id: 'empresa',
              titulo: 'Empresa',
              tipo: 'texto',
              render: (log) => log.company?.razao_social || '-'
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (log) => log.document_type
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (log) => <StatusBadge status={log.status || '-'} kind={familiaLog(log.status)} />
            },
            {
              id: 'mensagem',
              titulo: 'Mensagem',
              tipo: 'texto',
              render: (log) => log.response_message || log.error_message || '-'
            }
          ]}
          itens={logs}
          carregando={loading}
          vazio="Nenhum log fiscal registrado."
          storageKey="tabela:logs-fiscais:logs-recentes"
          rotuloRolagem="Logs recentes"
          larguraAcoes={220}
          acoesLinha={(log) => (
            <>
              {log.raw_request_storage_key ? (
                <button className="btn btn-outline" type="button" onClick={() => openRawPayload(log, 'request')}>
                  Request
                </button>
              ) : null}
              {log.raw_response_storage_key ? (
                <button className="btn btn-outline" type="button" onClick={() => openRawPayload(log, 'response')}>
                  Response
                </button>
              ) : null}
              {!log.raw_request_storage_key && !log.raw_response_storage_key ? (
                <span className="text-[var(--c-muted)]">-</span>
              ) : null}
            </>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
