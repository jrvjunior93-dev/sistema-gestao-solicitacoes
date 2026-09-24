import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HiOutlineCheckCircle, HiOutlineWallet } from 'react-icons/hi2';
import { useAuth } from '../contexts/AuthContext';
import { canCorrectPainelGestorSaldos } from '../utils/acessoProduto';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';
import DateInputBR from '../components/DateInputBR';
import { normalizeCurrencyTyping, parseCurrencyInput } from '../utils/formatters';
import { obterPreenchimentoSaldosPainelGestor, salvarSaldosPainelGestor } from '../services/painelGestor';
import '../styles/painel-gestor.css';

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

function normalizeBalanceTyping(value) {
  const raw = String(value || '');
  const negative = raw.trim().startsWith('-');
  const formatted = normalizeCurrencyTyping(raw.replace(/-/g, ''));
  if (!formatted) return negative ? '-' : '';
  return negative ? `-${formatted}` : formatted;
}

export default function PainelGestorSaldosRegistro() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [data, setData] = useState(searchParams.get('data') || localDate());
  const [contas, setContas] = useState([]);
  const [values, setValues] = useState({});
  const [justificativa, setJustificativa] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();
  const isPast = data < localDate();
  const canCorrect = canCorrectPainelGestorSaldos(user);

  useEffect(() => {
    let active = true;
    setLoading(true);
    obterPreenchimentoSaldosPainelGestor(data)
      .then((payload) => {
        if (!active) return;
        const items = Array.isArray(payload?.contas) ? payload.contas : [];
        setContas(items);
        setValues(Object.fromEntries(items.map((item) => [item.id, item.saldo ? Number(item.saldo.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : ''])));
      })
      .catch((error) => { if (active) avisar.erro(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [avisar, data]);

  const filled = useMemo(() => contas.filter((item) => String(values[item.id] || '').trim()), [contas, values]);

  async function submit(event) {
    event.preventDefault();
    if (!filled.length) { avisar.alerta('Informe o saldo de pelo menos uma conta.'); return; }
    if (filled.some((item) => String(values[item.id]).trim() === '-')) {
      avisar.alerta('Revise os saldos informados. O sinal negativo precisa acompanhar um valor.');
      return;
    }
    if (isPast && !canCorrect) { avisar.erro('Você não possui permissão para corrigir saldos de dias anteriores.'); return; }
    if (isPast && justificativa.trim().length < 10) { avisar.alerta('Informe uma justificativa com pelo menos 10 caracteres.'); return; }
    setSaving(true);
    try {
      await salvarSaldosPainelGestor({
        data_referencia: data,
        justificativa: justificativa.trim() || null,
        contas: filled.map((item) => ({ conta_bancaria_id: item.id, saldo_disponivel: parseCurrencyInput(values[item.id]) }))
      });
      avisar.sucesso('Saldos registrados com sucesso.');
      window.setTimeout(() => navigate(`/painel-gestor?aba=saldos&data=${data}`, { replace: true }), 500);
    } catch (error) {
      avisar.erro(error.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina>
      <PageHeader titulo="Informar saldos disponíveis" contagem={`${filled.length} de ${contas.length} conta(s)`} descricao="Fotografia financeira do momento. Este lançamento não altera conciliação, caixa ou movimentos financeiros." />
      <Avisos avisos={avisos} aoFechar={fechar} />
      <BlocoConteudo titulo="Data de referência" descricao="A consulta e o consolidado usam somente os saldos registrados nesta data.">
        <div className="pg-register-date"><label><span>Data</span><DateInputBR value={data} max={localDate()} onChange={(event) => setData(event.target.value)} /></label>{isPast ? <p data-alert="true">Correção retroativa: justificativa obrigatória e histórico preservado.</p> : <p>Os valores podem ser atualizados durante o dia e cada alteração ficará registrada.</p>}</div>
      </BlocoConteudo>
      <form onSubmit={submit} className="pg-register-form">
        <BlocoConteudo titulo="Contas do seu escopo" descricao="Preencha apenas as contas conferidas. Campos vazios não aparecem no painel do dia." variante="primario" cor="var(--module-financeiro)">
          {loading ? <div className="app-empty-card">Carregando contas...</div> : contas.length ? <div className="pg-register-list">{contas.map((item) => (
            <label className="pg-register-row" key={item.id}>
              <span className="pg-register-row__identity"><HiOutlineWallet /><span><strong>{item.nome}</strong><small>{item.empresa?.nome || 'Sem empresa vinculada'} · {item.tipo_operacional === 'CAIXA_INTERNO' ? 'Caixa interno' : item.banco || 'Conta bancária'}</small></span></span>
              <span className="pg-register-row__value"><span>Saldo disponível</span><input inputMode="decimal" placeholder="R$ 0,00" value={values[item.id] || ''} onChange={(event) => setValues((current) => ({ ...current, [item.id]: normalizeBalanceTyping(event.target.value) }))} /></span>
              <span className="pg-register-row__status">{item.saldo ? <><HiOutlineCheckCircle /> Já informado</> : 'Pendente'}</span>
            </label>
          ))}</div> : <div className="app-empty-card">Nenhuma conta ativa encontrada no seu escopo.</div>}
        </BlocoConteudo>
        {isPast ? <BlocoConteudo titulo="Justificativa da correção" descricao="Obrigatória para preservar a rastreabilidade da posição financeira anterior."><textarea className="input min-h-24 w-full" value={justificativa} onChange={(event) => setJustificativa(event.target.value)} placeholder="Explique por que o saldo anterior precisa ser corrigido." disabled={!canCorrect} /></BlocoConteudo> : null}
        <div className="pg-register-actions"><Link className="btn btn-outline" to={`/painel-gestor?aba=saldos&data=${data}`}>Cancelar</Link><button className="btn btn-primary" type="submit" disabled={saving || loading || !filled.length || (isPast && !canCorrect)}>{saving ? 'Salvando...' : 'Salvar saldos informados'}</button></div>
      </form>
    </Pagina>
  );
}
