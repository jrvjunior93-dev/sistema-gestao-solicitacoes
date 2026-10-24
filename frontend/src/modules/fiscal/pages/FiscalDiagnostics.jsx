import { useEffect, useState } from 'react';
import { Avisos, BlocoConteudo, BlocosPersonalizaveis, CamposComVazios, Pagina, PageHeader, StatGrid, StatTile, useAvisos } from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import { getFiscalDiagnostics, runFiscalStorageProbe } from '../services/fiscalApi';
function SinalConfigurado({ativo}){return <StatusBadge status={ativo?'OK':'Pendente'} kind={ativo?'success':'warning'} />;}
export default function FiscalDiagnostics(){
 const [data,setData]=useState(null),[loading,setLoading]=useState(true),[probeLoading,setProbeLoading]=useState(false),[probeResult,setProbeResult]=useState(null);
 const {avisos,avisar,fechar}=useAvisos();
 useEffect(()=>{let active=true;getFiscalDiagnostics().then(d=>{if(active)setData(d);})
  .catch(e=>{if(active)avisar.erro(e.message||'Erro ao carregar diagnóstico');})
  .finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[avisar]);
 const modulo=data?.modulo||{},storage=data?.storage||{},crypto=data?.crypto||{},dados=data?.dados||{},ultimoLog=data?.ultimo_log;
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


 return (<Pagina className="fiscal-page"><PageHeader titulo="Diagnóstico fiscal"
  descricao="Verificação do armazenamento privado e consulta das configurações. Captura NSDOCS manual administrada pelo backend." />
  <Avisos avisos={avisos} aoFechar={fechar} />
  {loading?<div className="app-empty-card">Carregando diagnóstico...</div>:data?(<BlocosPersonalizaveis chave="blocos:fiscal-diagnostics" larguraPadrao="total" dentroDeGrade>
   <BlocoConteudo titulo="Módulo" variante="secundario"><CamposComVazios campos={[
    {label:'Fiscal habilitado',valor:<SinalConfigurado ativo={modulo.enabled} />},
    {label:'Ambiente Fiscal',valor:modulo.env},{label:'Captura de NF-e',valor:'NSDOCS — manual'}
   ]} /></BlocoConteudo>
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


   <BlocoConteudo titulo="Criptografia" variante="secundario"><CamposComVazios campos={[
    {label:'Crypto configurado',valor:<SinalConfigurado ativo={crypto.configured} />},
    {label:'Crypto produção',valor:<SinalConfigurado ativo={crypto.min_length_ok_for_production} />}
   ]} /></BlocoConteudo>
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

 </BlocosPersonalizaveis>):null}</Pagina>);
}
