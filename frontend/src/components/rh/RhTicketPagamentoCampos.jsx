import { CampoForm } from '../padrao';
import { formatCurrencyInput } from '../../utils/formatters';
import { PIX_TEXTO_MAX } from '../../utils/pix';

function usaContaPagamento(c) {
  return ['banco', 'agencia', 'conta', 'tipo_conta'].some(campo => String(c.pagamento?.[campo] || '').trim());
}

export function contaTicketCadastrada(c) {
  // Nunca misturar partes de duas contas diferentes. Cadastro incompleto exige revisao.
  const p = usaContaPagamento(c) ? c.pagamento : { banco: c.banco, agencia: c.agencia, conta: c.conta, tipo_conta: c.conta_tipo };
  return { colaborador_id: Number(c.id), banco: p?.banco || '', agencia: p?.agencia || '', conta: p?.conta || '',
    tipo_conta: String(p?.tipo_conta || '').trim().toUpperCase() };
}

function favorecidoConta(c) {
  return usaContaPagamento(c) ? { nome: c.pagamento.favorecido_nome || c.nome, documento: c.pagamento.favorecido_documento || c.cpf }
    : { nome: c.nome, documento: c.cpf };
}

export function contaTicketValida(p) {
  return [['banco', 10], ['agencia', 20], ['conta', 30]].every(([campo, limite]) =>
    typeof p?.[campo] === 'string' && p[campo].trim() && p[campo].trim().length <= limite)
    && ['CORRENTE', 'POUPANCA', 'SALARIO'].includes(p?.tipo_conta);
}

// Revisao local do lote: nao salva nem altera o cadastro dos colaboradores.
export default function RhTicketPagamentoCampos({ form, colaboradores, onChange, disabled }) {
  const pix = form.forma_pagamento === 'PIX';
  const conta = form.forma_pagamento === 'TRANSFERENCIA';
  const contasPorColaborador = new Map((form.pagamentos_conta || []).map(p => [Number(p.colaborador_id), p]));
  function alterarChave(id, chave_pix) {
    onChange({ ...form, pix_revisado: false, pagamentos_pix: form.pagamentos_pix.map(p =>
      Number(p.colaborador_id) === Number(id) ? { ...p, chave_pix } : p) });
  }
  function alterarConta(id, campo, valor) {
    onChange({ ...form, contas_revisadas: false, pagamentos_conta: form.pagamentos_conta.map(p =>
      Number(p.colaborador_id) === Number(id) ? { ...p, [campo]: valor } : p) });
  }
  return <div className="min-w-0 space-y-3">
    <CampoForm label="Forma de pagamento do ticket" obrigatorio>
      <select className="form-control" aria-label="Forma de pagamento do ticket" disabled={disabled}
        value={form.forma_pagamento} onChange={e => onChange({ ...form, forma_pagamento: e.target.value, boleto: null, pix_revisado: false, contas_revisadas: false })}>
        <option value="BOLETO">Boleto</option><option value="PIX">Pix por colaborador</option>
        <option value="TRANSFERENCIA">Conta bancária por colaborador</option>
      </select>
    </CampoForm>
    {form.forma_pagamento === 'BOLETO' && <CampoForm label="Boleto do ticket" obrigatorio>
      <input type="file" className="form-control" aria-label="Boleto do ticket" accept=".pdf,image/*" required disabled={disabled}
        onChange={e => onChange({ ...form, boleto: e.target.files?.[0] || null })} />
      <span className="app-note">O boleto será anexado à solicitação e poderá ser consultado na fila de pagamentos.</span>
    </CampoForm>}
    {pix && <>
      <p className="app-note">Um título por colaborador. Confira o favorecido e a chave Pix; alterações valem somente para este lote.</p>
      <div className="max-w-full overflow-x-auto rounded border" role="region" aria-label="Revisão de chaves Pix" tabIndex={0} style={{ borderColor: 'var(--c-border)' }}>
        <table className="min-w-[560px] w-full text-sm">
          <thead><tr className="text-left"><th className="p-2">Colaborador / favorecido</th><th className="p-2">Valor</th><th className="p-2">Chave Pix / Copia e Cola</th></tr></thead>
          <tbody>{colaboradores.map(c => <tr key={c.id} className="border-t" style={{ borderColor: 'var(--c-border)' }}>
            <td className="p-2"><strong>{c.nome}</strong><span className="app-note block">{c.pagamento?.favorecido_nome || c.nome}</span>
              <span className="app-note block">{c.pagamento?.favorecido_documento || c.cpf}</span></td>
            <td className="p-2 whitespace-nowrap">{formatCurrencyInput(String(c.valor_ticket || 0))}</td>
            <td className="p-2"><textarea className="form-control min-w-[180px]" rows={2} maxLength={PIX_TEXTO_MAX} required disabled={disabled}
              aria-label={`Chave Pix de ${c.nome}`} value={form.pagamentos_pix.find(p => Number(p.colaborador_id) === Number(c.id))?.chave_pix || ''}
              onChange={e => alterarChave(c.id, e.target.value)} /></td>
          </tr>)}</tbody>
        </table>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" required disabled={disabled} checked={form.pix_revisado}
        onChange={e => onChange({ ...form, pix_revisado: e.target.checked })} />Conferi os favorecidos e as chaves Pix deste lote</label>
    </>}
    {conta && <>
      <p className="app-note">Um título por colaborador, sem boleto. Contas carregadas do cadastro; confira banco, agência, conta e titular. Ajustes valem somente para este lote. Se o banco estiver pelo nome, informe seu código, sem abreviar os demais dados.</p>
      <div className="divide-y" style={{ borderColor: 'var(--c-border)' }}>
        {colaboradores.map(c => {
          const p = contasPorColaborador.get(Number(c.id)) || {};
          const titular = favorecidoConta(c);
          return <div key={c.id} className="py-3 space-y-2">
            <div className="flex flex-wrap justify-between gap-1 text-sm"><strong>{c.nome}</strong>
              <span>{formatCurrencyInput(String(c.valor_ticket || 0))}</span></div>
            <p className="app-note">Titular: {titular.nome} · {titular.documento}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[['banco', 'Banco (código)', 10], ['agencia', 'Agência', 20], ['conta', 'Conta com dígito', 30]].map(([campo, rotulo, limite]) =>
                <CampoForm key={campo} label={rotulo} obrigatorio><input className="form-control" required disabled={disabled}
                  maxLength={limite} aria-label={`${rotulo} de ${c.nome}`} value={p[campo] || ''}
                  onChange={e => alterarConta(c.id, campo, e.target.value)} /></CampoForm>)}
              <CampoForm label="Tipo de conta" obrigatorio><select className="form-control" required disabled={disabled}
                aria-label={`Tipo de conta de ${c.nome}`} value={p.tipo_conta || ''} onChange={e => alterarConta(c.id, 'tipo_conta', e.target.value)}>
                <option value="">Selecione</option><option value="CORRENTE">Corrente</option><option value="POUPANCA">Poupança</option><option value="SALARIO">Salário</option>
              </select></CampoForm>
            </div>
          </div>;
        })}
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" required disabled={disabled} checked={form.contas_revisadas}
        onChange={e => onChange({ ...form, contas_revisadas: e.target.checked })} />Conferi os titulares e as contas bancárias deste lote</label>
    </>}
  </div>;
}
