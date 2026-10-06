import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Pagina, PageHeader, BlocoConteudo, Avisos, useAvisos } from '../components/padrao';
import { getConfigPrazos, salvarConfigPrazos, liberarPrazos } from '../services/prazosOperacionais';

export default function PrazosOperacionaisConfig() {
  const { user } = useAuth();
  const [regra, setRegra] = useState(null), [futuras, setFuturas] = useState([]), [salvando, setSalvando] = useState(false);
  const [liberacao, setLiberacao] = useState({ obra_id: '', ate: '', motivo: '' });
  const [liberando, setLiberando] = useState(false);
  const emVoo = useRef(false), chaveLiberacao = useRef(null);
  const { avisos, avisar, fechar } = useAvisos();
  const carregar = async () => {
    try { const data = await getConfigPrazos(); setRegra(data.regra); setFuturas(data.futuras); }
    catch (error) { avisar.erro(error.message); }
  };
  useEffect(() => { void carregar(); }, []);
  const alterar = (campo, valor) => setRegra((prev) => ({ ...prev, [campo]: valor }));
  async function salvar(event) {
    event.preventDefault(); if (emVoo.current || !regra) return;
    if (regra.ativo && regra.modo === 'BLOQUEAR' && !window.confirm('Ativar bloqueio de operações da obra para usuários do setor Obra? Consultas e informação de entrega permanecerão disponíveis. Não serão criados prazos para pedidos antigos.')) return;
    emVoo.current = true; setSalvando(true);
    try { const data = await salvarConfigPrazos(regra); setRegra(data.regra); avisar.sucesso('Regra salva. Os prazos e a tolerância valem para novos ciclos; ativação e modo controlam a cobrança atual.'); }
    catch (error) { avisar.erro(error.message); }
    finally { emVoo.current = false; setSalvando(false); }
  }
  async function liberar(event) {
    event.preventDefault(); if (emVoo.current) return;
    const body = { ...liberacao, obra_id: Number(liberacao.obra_id), ate: new Date(liberacao.ate).toISOString() };
    const assinatura = JSON.stringify(body);
    if (chaveLiberacao.current?.assinatura !== assinatura) chaveLiberacao.current = { assinatura, chave: crypto.randomUUID() };
    emVoo.current = true; setLiberando(true);
    try {
      await liberarPrazos({ ...body, idempotency_key: chaveLiberacao.current.chave });
      avisar.sucesso('Liberação registrada. As obrigações continuam pendentes e voltarão a bloquear ao término da validade.');
      setLiberacao({ obra_id: '', ate: '', motivo: '' }); chaveLiberacao.current = null;
    } catch (error) { avisar.erro(error.message); }
    finally { emVoo.current = false; setLiberando(false); }
  }
  const campo = (nome, label, props = {}) => <label className="text-sm">{label}<input className="input w-full mt-1" value={regra[nome]} onChange={(e) => alterar(nome, props.type === 'number' ? Number(e.target.value) : e.target.value)} {...props} /></label>;
  return <Pagina>
    <PageHeader titulo="Prazos operacionais" descricao="Primeira etapa: informação de entregas pelo setor Obra. Demais obrigações permanecem desativadas." />
    <Avisos avisos={avisos} aoFechar={fechar} />
    {!regra ? <button type="button" className="btn btn-outline" onClick={carregar}>Carregar configuração</button> : <>
      <form onSubmit={salvar} className="!m-0 !max-w-none !p-0">
        <BlocoConteudo titulo="Informar entrega total, parcial ou não entrega" descricao="A referência é a previsão confirmada do fornecedor, não a data desejada pela Obra.">
          <fieldset disabled={salvando || liberando} className="space-y-3">
            <div className="flex flex-wrap gap-4 items-center text-sm">
              <label className="flex gap-2 items-center"><input type="checkbox" checked={regra.ativo} onChange={(e) => alterar('ativo', e.target.checked)} />Cobrança ativa</label>
              <label>Modo <select aria-label="Modo" className="input ml-2" value={regra.modo} onChange={(e) => alterar('modo', e.target.value)}><option value="OBSERVAR">Observar, sem bloquear</option><option value="BLOQUEAR">Bloquear operações da obra</option></select></label>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {campo('iniciar_em', 'Início da cobrança', { type: 'date', required: regra.ativo })}
              <label className="text-sm">Unidade<select aria-label="Unidade" className="input w-full mt-1" value={regra.unidade} onChange={(e) => alterar('unidade', e.target.value)}><option value="DIAS">Dias</option><option value="HORAS">Horas</option></select></label>
              <label className="text-sm">Calendário<select aria-label="Calendário" className="input w-full mt-1" value={regra.calendario} onChange={(e) => alterar('calendario', e.target.value)}><option value="CORRIDOS">Corrido</option><option value="UTEIS">Útil (seg. a sex. e feriados de Compras)</option></select></label>
              {campo('hora_referencia', 'Hora da previsão (São Paulo)', { type: 'time', required: true })}
              {campo('prazo', 'Prazo para informar', { type: 'number', min: 1, max: 720, step: 1, required: true })}
              {campo('tolerancia', 'Tolerância após o prazo', { type: 'number', min: 0, max: 720, step: 1, required: true })}
              {campo('aviso', 'Antecedência do aviso', { type: 'number', min: 0, max: 720, step: 1, required: true })}
            </div>
            {regra.unidade === 'HORAS' && regra.calendario === 'UTEIS' && <div className="grid grid-cols-2 gap-3 max-w-lg">
              {campo('expediente_inicio', 'Início do expediente', { type: 'time', required: true })}
              {campo('expediente_fim', 'Fim do expediente', { type: 'time', required: true })}
            </div>}
            <p className="text-xs text-[var(--c-muted)]">Prazo, tolerância e aviso usam a unidade selecionada. Avisos em dias usam janelas de 24 horas; em horas, de 60 minutos. Dias úteis preservam a hora de referência; horas úteis contam apenas o expediente.</p>
            <p className="text-sm text-[var(--c-muted)]">Sem retroatividade: apenas novas confirmações ou reprogramações após a ativação geram prazos. Alterações de duração não mudam ciclos em andamento. Ao pausar, nenhum bloqueio novo desta regra será aplicado.</p>
            <button type="submit" className="btn btn-primary">{salvando ? 'Salvando...' : 'Salvar regra'}</button>
          </fieldset>
        </BlocoConteudo>
      </form>
      <BlocoConteudo titulo="Como a obra é liberada">
        <p className="text-sm">O bloqueio alcança os usuários do setor Obra vinculados à obra com prazo vencido. Outras obras, setores administrativos e o superadmin não recebem este bloqueio. Consultas e o registro da entrega permanecem disponíveis.</p>
        <p className="text-sm mt-2">Informar entrega parcial ou não entrega encerra a obrigação da Obra e passa a pendência a Compras. Não há bloqueio da Obra pelo atraso do fornecedor já comunicado. Uma nova previsão abre um novo ciclo.</p>
        <p className="text-sm mt-2">A proteção anterior contra criar compras com entregas vencidas continua para pedidos legados sem ciclo novo. Os prazos administrativos de Compras não foram alterados.</p>
      </BlocoConteudo>
      <BlocoConteudo titulo="Próximas etapas — ainda desativadas">
        <table className="w-full text-sm"><thead><tr className="text-left"><th className="py-2">Atividade</th><th>Impacto da omissão</th></tr></thead><tbody>{futuras.map((f) => <tr key={f.tipo} className="border-t border-[var(--c-border)]"><td className="py-2 pr-3">{f.nome}</td><td>{f.impacto}</td></tr>)}</tbody></table>
      </BlocoConteudo>
      {String(user?.perfil).toUpperCase() === 'SUPERADMIN' && <details className="app-bloco p-3 mt-3"><summary className="text-sm font-semibold cursor-pointer">Liberação temporária e auditada de uma obra</summary>
        <p className="text-sm text-[var(--c-muted)] my-2">Exceção por até 7 dias. Não encerra nem apaga obrigações; o bloqueio retorna após a validade.</p>
        <form onSubmit={liberar}><fieldset disabled={salvando || liberando} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm">ID da obra<input className="input w-full mt-1" type="number" min="1" step="1" required value={liberacao.obra_id} onChange={(e) => setLiberacao((p) => ({ ...p, obra_id: e.target.value }))} /></label>
          <label className="text-sm">Liberar até (horário deste dispositivo)<input className="input w-full mt-1" type="datetime-local" required value={liberacao.ate} onChange={(e) => setLiberacao((p) => ({ ...p, ate: e.target.value }))} /></label>
          <label className="text-sm sm:col-span-2">Motivo<textarea className="input w-full mt-1" required maxLength="2000" value={liberacao.motivo} onChange={(e) => setLiberacao((p) => ({ ...p, motivo: e.target.value }))} /></label>
          <button type="submit" className="btn btn-outline justify-self-start">{liberando ? 'Registrando...' : 'Registrar liberação'}</button>
        </fieldset></form>
      </details>}
    </>}
  </Pagina>;
}
