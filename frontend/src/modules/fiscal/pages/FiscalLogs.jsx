import { useEffect, useState } from 'react';
import { Avisos, BlocoConteudo, Pagina, PageHeader, TabelaPadrao, useAvisos } from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getFiscalSyncLogs, getFiscalSyncLogRawUrl, getFiscalSyncStates } from '../services/fiscalApi';
const formatDateTime=value=>value?new Date(value).toLocaleString('pt-BR'):'-';
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


export default function FiscalLogs(){
  const [logs,setLogs]=useState([]),[states,setStates]=useState([]),[loading,setLoading]=useState(true);
  const {avisos,avisar,fechar}=useAvisos();
  useEffect(()=>{
    let active=true;
    Promise.all([getFiscalSyncLogs(),getFiscalSyncStates()]).then(([l,s])=>{
      if(active){setLogs(l?.data||[]);setStates(s?.data||[]);}
    }).catch(e=>{if(active)avisar.erro(e.message||'Erro ao consultar histórico fiscal');})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[avisar]);
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


  return (<Pagina className="fiscal-page">
    <PageHeader titulo="Histórico fiscal legado" contagem={logs.length+' execuções registradas'}
      descricao="Consulta dos registros anteriores. Novas capturas de NF-e são realizadas pela NSDOCS, em carga manual administrativa." />
    <Avisos avisos={avisos} aoFechar={fechar} />
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
        descricao="Execuções anteriores, suas empresas, horários e respostas. Nenhuma nova consulta é disparada nesta tela."
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
