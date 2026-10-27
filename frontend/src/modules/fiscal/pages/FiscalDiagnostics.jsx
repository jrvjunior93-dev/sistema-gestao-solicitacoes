import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avisos,
  BlocoConteudo,
  BlocosPersonalizaveis,
  CamposComVazios,
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
  runFiscalFixtureSync,
  runFiscalSyncPreflight,
  runFiscalStorageProbe
} from '../services/fiscalApi';

/*
  R25 — o diagnóstico é justamente onde `emerald/amber/rose` moravam: três
  pílulas desenhadas à mão nesta tela (`StatusBadge` local, `CheckStatusBadge`
  e as pílulas de empresa), cada uma com o seu mapa de paleta crua. Paleta
  crua não tem par no tema escuro e não passa pelo piso de contraste do
  ThemeContext (R24).

  Os dois mapas abaixo são EXPLÍCITOS de propósito: a classificação
  automática do `StatusBadge` do sistema lê vocabulário em português, e o que
  chega aqui é `OK`/`WARN`/`ERROR` e booleano. Sem mapa declarado, `ERROR`
  cairia em "info" — o check que falhou apareceria azul ao lado do que passou.
*/
const FAMILIA_CHECK = {
  OK: 'success',
  ERROR: 'danger',
  WARN: 'warning'
};

function familiaCheck(status) {
  return FAMILIA_CHECK[String(status || 'WARN').toUpperCase()] || 'warning';
}

function SinalConfigurado({ ativo }) {
  return <StatusBadge status={ativo ? 'OK' : 'Pendente'} kind={ativo ? 'success' : 'warning'} />;
}

/** Tabela de checks do preflight — mesma forma nos dois lugares que a usam. */
function TabelaChecks({ checks, storageKey, rotulo }) {
  return (
    <TabelaPadrao
      /*
        R17 — `semIdentidade` DECLARADO, com o motivo: a linha é um CHECK de
        diagnóstico (código técnico + mensagem + status), não um registro com
        nome próprio. O identificador da linha é a chave técnica do check
        (`SEFAZ_ENDPOINT`, `STORAGE_WRITABLE`), e a coluna de identidade
        exibe SEMPRE em maiúsculas — o que descaracterizaria o identificador
        que existe no sistema. Chave técnica é `tipo: 'codigo'`.
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
      itens={checks || []}
      getId={(check) => check.code}
      vazio="Nenhum check retornado."
      storageKey={storageKey}
      rotuloRolagem={rotulo}
    />
  );
}

export default function FiscalDiagnostics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [probeLoading, setProbeLoading] = useState(false);
  const [probeResult, setProbeResult] = useState(null);
  const [fixtureLoading, setFixtureLoading] = useState(false);
  const [fixtureResult, setFixtureResult] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightResult, setPreflightResult] = useState(null);
  const [companies, setCompanies] = useState([]);
  const [fixtureCompanyId, setFixtureCompanyId] = useState('');
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    Promise.all([
      getFiscalDiagnostics(),
      getFiscalCompanies({ ativo: true })
    ])
      .then(([diagnosticsResponse, companiesResponse]) => {
        if (!mounted) return;
        const nextCompanies = companiesResponse?.data || [];
        setData(diagnosticsResponse);
        setCompanies(nextCompanies);
        setFixtureCompanyId((current) => current || String(nextCompanies.find((company) => company.modulo_fiscal_habilitado)?.id || nextCompanies[0]?.id || ''));
      })
      .catch((err) => {
        if (mounted) avisar.erro(err.message || 'Erro ao carregar diagnostico fiscal');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [avisar]);

  const modulo = data?.modulo || {};
  const storage = data?.storage || {};
  const crypto = data?.crypto || {};
  const sefaz = data?.sefaz || {};
  const dados = data?.dados || {};
  const ultimoLog = data?.ultimo_log || null;

  const handleStorageProbe = async () => {
    setProbeLoading(true);
    setProbeResult(null);
    try {
      const response = await runFiscalStorageProbe();
      setProbeResult(response);
      /* Tom pelo RESULTADO, não pelo fato de a chamada ter voltado. */
      if (response?.ok) {
        // Resultado do teste fica fixo no painel (StatTile) abaixo: o aviso pode sumir sozinho.
        avisar.sucesso('Storage fiscal validado: o backend conseguiu escrever no bucket configurado.', undefined, { efemero: true });
      } else {
        avisar.alerta('Teste de storage concluído SEM confirmação de escrita. Revise bucket, regiao e permissão.');
      }
    } catch (err) {
      avisar.erro(err.message || 'Erro ao testar storage fiscal');
    } finally {
      setProbeLoading(false);
    }
  };

  const handleFixtureSync = async () => {
    setFixtureLoading(true);
    setFixtureResult(null);
    try {
      const response = await runFiscalFixtureSync({
        document_type: 'nfe',
        company_id: fixtureCompanyId || undefined
      });
      setFixtureResult(response);
      const processados = Number(response?.processed?.documents_processed || 0);
      // Resultado do teste fica fixo no painel (StatTile) abaixo: o aviso pode sumir sozinho.
      avisar.sucesso(`Fixture DFe processada: ${processados} documento(s) na Caixa de Entrada.`, undefined, { efemero: true });
      const refreshedDiagnostics = await getFiscalDiagnostics();
      setData(refreshedDiagnostics);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao processar fixture fiscal');
    } finally {
      setFixtureLoading(false);
    }
  };

  const handlePreflight = async () => {
    setPreflightLoading(true);
    setPreflightResult(null);
    try {
      const response = await runFiscalSyncPreflight({
        document_type: 'nfe',
        company_id: fixtureCompanyId || undefined
      });
      setPreflightResult(response);
      if (response?.ready) {
        // Resultado do teste fica fixo no painel (StatTile/StatusBadge) abaixo: o aviso pode sumir sozinho.
        avisar.sucesso('Preflight concluído. Ambiente pronto para a próxima etapa controlada.', undefined, { efemero: true });
      } else {
        avisar.alerta('Preflight concluído com pendências. Revise os checks antes de ativar SEFAZ.');
      }
    } catch (err) {
      avisar.erro(err.message || 'Erro ao executar preflight fiscal');
    } finally {
      setPreflightLoading(false);
    }
  };

  return (
    <Pagina className="fiscal-page">
      <PageHeader
        titulo="Diagnóstico fiscal"
        contagem={data ? `${dados.empresas_monitoradas || 0} empresas monitoradas` : null}
        descricao="Verificacao administrativa de configurações sensiveis sem expor senha, certificado ou credenciais."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {loading ? (
        <div className="app-empty-card">Carregando diagnóstico...</div>
      ) : data ? (
        <>
          {/*
            BLOCOS PERSONALIZÁVEIS (05/09). Tela de relatório/painel é o grupo
            em que ligar isto é SEGURO: estes 7 blocos são leituras
            independentes — sem ordem obrigatória entre si, sem botão de gravar
            dentro e sem campo obrigatório que ocultar esconda. O padrão continua
            sendo o do código; a preferência guarda só o DESVIO. No celular o
            modo não existe (arrastar é HTML5 nativo e não responde a toque).
          */}
          <BlocosPersonalizaveis
            chave="blocos:fiscal-diagnostics"
            larguraPadrao="total"
            dentroDeGrade
          >
            <BlocoConteudo titulo="Módulo" variante="secundario">
              {/* B4 — campo vazio some com contador; a contagem sai da PRÓPRIA
                  lista de campos, sem espelhar condição à mão. */}
              <CamposComVazios
                campos={[
                  { label: 'Fiscal habilitado', valor: <SinalConfigurado ativo={modulo.enabled} /> },
                  { label: 'Ambiente Fiscal', valor: modulo.env },
                  { label: 'NODE_ENV', valor: modulo.node_env }
                ]}
              />
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Storage S3 fiscal"
              descricao="Bucket e endpoint aparecem MASCARADOS pelo backend — a tela nunca recebe o valor completo."
              variante="secundario"
              acoes={(
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleStorageProbe}
                  disabled={probeLoading || !storage.configured}
                  title="Cria um arquivo pequeno e sem dados fiscais no bucket configurado para validar permissão de escrita do backend."
                >
                  {probeLoading ? 'Testando...' : 'Testar storage'}
                </button>
              )}
            >
              <CamposComVazios
                campos={[
                  { label: 'Storage configurado', valor: <SinalConfigurado ativo={storage.configured} /> },
                  { label: 'Bucket', valor: storage.bucket_masked || (storage.bucket_configured ? 'configurado' : 'pendente') },
                  { label: 'Regiao', valor: storage.region || 'pendente' },
                  { label: 'Prefixo', valor: storage.prefix },
                  { label: 'URL expira em', valor: `${storage.presigned_expires_seconds || 300}s` }
                ]}
              />

              {probeResult ? (
                <StatGrid colunas={4}>
                  <StatTile label="Resultado do teste" valor={<SinalConfigurado ativo={probeResult.ok} />} />
                  <StatTile label="Bucket" valor={probeResult.bucket_masked || 'configurado'} />
                  <StatTile label="Chave criada" valor={probeResult.key} />
                  <StatTile label="Hash" valor={probeResult.hash} />
                </StatGrid>
              ) : null}
            </BlocoConteudo>

            <BlocoConteudo
              titulo="Ensaio local de DFe"
              descricao="Processa uma fixture local de retorno SEFAZ para validar parser, S3 fiscal, logs e Caixa de Entrada sem consulta externa."
              variante="secundario"
            >
              {/*
                R12 — seletor de CONTEXTO, não filtro: escolhe sobre QUAL
                empresa o ensaio e o preflight vão agir. Nenhuma lista desta
                tela é recortada por ele.
              */}
              <FormSecao colunas={2}>
                <CampoForm label="Empresa fiscal do ensaio">
                  <select
                    className="input"
                    value={fixtureCompanyId}
                    onChange={(event) => setFixtureCompanyId(event.target.value)}
                    disabled={fixtureLoading || !companies.length}
                  >
                    <option value="">Selecione a empresa fiscal</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.razao_social || company.nome_fantasia || company.cnpj}
                      </option>
                    ))}
                  </select>
                </CampoForm>
                <CampoForm label="Executar">
                  <div className="app-actionbar">
                    <button
                      type="button"
                      onClick={handleFixtureSync}
                      disabled={fixtureLoading || !storage.configured || !fixtureCompanyId}
                      className="btn btn-primary"
                    >
                      {fixtureLoading ? 'Processando...' : 'Processar fixture DFe'}
                    </button>
                  </div>
                </CampoForm>
              </FormSecao>

              {/*
                Isto é CONDIÇÃO DERIVADA DO CONTEÚDO, não evento: fecha e o
                problema continua. Por isso segue como faixa no fluxo, ao lado
                do controle que ela descreve, e NÃO vira `useAvisos` (fronteira
                declarada no próprio Avisos.jsx).
              */}
              {!dados.empresas_monitoradas ? (
                <p className="text-sm text-[var(--sem-warning)]">
                  A empresa selecionada precisa estar ativa e com o módulo fiscal habilitado. Se não estiver, o backend retornara a orientacao.
                </p>
              ) : null}

              {fixtureResult ? (
                <>
                  <StatGrid colunas={4}>
                    <StatTile label="Resultado" valor={fixtureResult.status} />
                    <StatTile label="Log" valor={fixtureResult.log_id} />
                    <StatTile label="Empresa" valor={fixtureResult.company_id} />
                    <StatTile label="Documentos" valor={fixtureResult.processed?.documents_processed ?? 0} />
                  </StatGrid>
                  {fixtureResult.processed?.items?.length ? (
                    <BlocoConteudo
                      titulo="Documentos processados"
                      contagem={`${fixtureResult.processed.items.length} documento(s)`}
                      variante="secundario"
                    >
                      {/*
                        Link para o REGISTRO RELACIONADO fica NO CORPO, junto do
                        dado que o origina (decisão de 04/09) — nunca na barra de
                        ações. Cada documento aqui foi criado por ESTE ensaio.
                      */}
                      <div className="app-actionbar">
                        {fixtureResult.processed.items.map((item) => (
                          <Link
                            key={item.document_id}
                            className="btn btn-outline"
                            to={`/fiscal/documentos/${item.document_id}`}
                          >
                            NF {item.document_id}
                          </Link>
                        ))}
                        <Link className="btn btn-outline" to="/fiscal/documentos">Ver caixa de entrada</Link>
                      </div>
                    </BlocoConteudo>
                  ) : null}
                </>
              ) : null}
            </BlocoConteudo>

            <BlocoConteudo titulo="Criptografia e SEFAZ" variante="secundario">
              <CamposComVazios
                campos={[
                  { label: 'Crypto configurado', valor: <SinalConfigurado ativo={crypto.configured} /> },
                  { label: 'Crypto produção', valor: <SinalConfigurado ativo={crypto.min_length_ok_for_production} /> },
                  { label: 'SEFAZ habilitada', valor: <SinalConfigurado ativo={sefaz.enabled} /> },
                  { label: 'Ambiente SEFAZ', valor: sefaz.ambiente },
                  { label: 'UF SEFAZ', valor: sefaz.uf || 'pendente' },
                  { label: 'Endpoint distribuição', valor: <SinalConfigurado ativo={sefaz.distribution_url_configured && sefaz.distribution_url_https} /> },
                  { label: 'Endpoint', valor: sefaz.distribution_url_masked || 'pendente' },
                  { label: 'Endpoint sugerido', valor: sefaz.suggested_distribution_url || 'pendente' },
                  { label: 'Timeout SEFAZ', valor: `${sefaz.request_timeout_ms || 30000}ms` },
                  { label: 'Max docs/run', valor: sefaz.max_docs_per_run },
                  { label: 'Lock TTL', valor: `${sefaz.lock_ttl_seconds || 900}s` },
                  { label: 'Espera sem DFe', valor: `${sefaz.empty_result_wait_minutes || 60}min` },
                  { label: 'Espera consumo indevido', valor: `${sefaz.consumo_indevido_wait_minutes || 60}min` },
                  { label: 'Bloqueio consumo indevido', valor: sefaz.block_on_consumo_indevido ? 'Sim' : 'Nao' }
                ]}
              />
            </BlocoConteudo>

            {/* B2 — o bloco principal da tela: é o preflight que responde à
                pergunta central ("posso ligar a SEFAZ real?"). Ele fica
                SEMPRE visível, com o botão que o dispara — esconder o botão
                atrás do resultado deixaria a capacidade sem porta. */}
            <BlocoConteudo
              titulo="Preflight SEFAZ"
              descricao="Valida empresa, certificado, storage, endpoint e SOAP local antes de qualquer chamada real."
              variante="primario"
              cor="var(--module-fiscal)"
              acoes={(
                <>
                  {preflightResult ? (
                    <StatusBadge status={preflightResult.ready ? 'Pronto' : 'Com pendencias'} kind={preflightResult.ready ? 'success' : 'warning'} />
                  ) : null}
                  <button
                    type="button"
                    onClick={handlePreflight}
                    disabled={preflightLoading || !fixtureCompanyId}
                    className="btn btn-primary"
                    title="Usa a empresa fiscal escolhida no bloco Ensaio local de DFe."
                  >
                    {preflightLoading ? 'Validando...' : 'Executar preflight'}
                  </button>
                </>
              )}
            >
              {preflightResult ? (
                <>
                  <StatGrid colunas={4}>
                  <StatTile label="Resultado" valor={<SinalConfigurado ativo={preflightResult.ready} />} />
                  <StatTile
                    label="SEFAZ real"
                    valor={preflightResult.sefaz_enabled ? 'Habilitada' : 'Desabilitada'}
                    tom={preflightResult.sefaz_enabled ? 'danger' : undefined}
                  />
                  <StatTile label="Tipo" valor={preflightResult.document_type} />
                  <StatTile label="Empresas" valor={preflightResult.companies?.length || 0} />
                </StatGrid>

                <BlocoConteudo titulo="Checks globais" variante="secundario">
                  <TabelaChecks
                    checks={preflightResult.global_checks}
                    storageKey="tabela:diagnostico-fiscal:preflight-checks-globais"
                    rotulo="Checks globais do preflight"
                  />
                </BlocoConteudo>

                {(preflightResult.companies || []).map((item) => (
                  <BlocoConteudo
                    key={item.company.id}
                    titulo={item.company.razao_social}
                    variante="secundario"
                    acoes={<StatusBadge status={item.ready ? 'OK' : 'WARN'} kind={item.ready ? 'success' : 'warning'} />}
                  >
                    <TabelaChecks
                      checks={item.checks}
                      storageKey="tabela:diagnostico-fiscal:preflight-checks-empresa"
                      rotulo={`Checks do preflight de ${item.company.razao_social}`}
                    />
                  </BlocoConteudo>
                ))}
                </>
              ) : (
                <p className="text-sm text-[var(--c-muted)]">
                  Escolha a empresa fiscal no bloco &quot;Ensaio local de DFe&quot; e execute o preflight para ver os checks.
                </p>
              )}
            </BlocoConteudo>

            <BlocoConteudo titulo="Dados fiscais" variante="secundario">
              <CamposComVazios
                campos={[
                  { label: 'Empresas cadastradas', valor: dados.empresas_total },
                  { label: 'Empresas monitoradas', valor: dados.empresas_monitoradas },
                  { label: 'Certificados', valor: dados.certificados_total },
                  { label: 'Certificados ativos', valor: dados.certificados_ativos },
                  { label: 'Estados sync', valor: dados.sync_states_total },
                  { label: 'Locks ativos', valor: dados.sync_states_locked }
                ]}
              />
            </BlocoConteudo>

            <BlocoConteudo titulo="Último log" variante="secundario">
              {ultimoLog ? (
                <CamposComVazios
                  campos={[
                    { label: 'ID', valor: ultimoLog.id },
                    { label: 'Início', valor: ultimoLog.started_at ? new Date(ultimoLog.started_at).toLocaleString('pt-BR') : '-' },
                    { label: 'Status', valor: ultimoLog.status },
                    { label: 'Tipo', valor: ultimoLog.request_type },
                    { label: 'Código', valor: ultimoLog.response_code },
                    { label: 'Mensagem', valor: ultimoLog.response_message || ultimoLog.error_message || '-' }
                  ]}
                />
              ) : (
                <p className="text-sm text-[var(--c-muted)]">Nenhum log fiscal registrado.</p>
              )}
            </BlocoConteudo>
          </BlocosPersonalizaveis>
        </>
      ) : null}
    </Pagina>
  );
}
