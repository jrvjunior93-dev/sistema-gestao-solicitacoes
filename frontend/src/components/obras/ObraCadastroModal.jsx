import { useEffect, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import { criarObra } from '../../services/obras';
import { getEmpresasGrupo } from '../../services/empresasGrupo';
import { formatCurrencyInput, normalizeCurrencyTyping, parseCurrencyInput } from '../../utils/formatters';

const VAZIO = {
  codigo: '',
  nome: '',
  classificacao: '',
  fase_obra: 'PRE_OBRA',
  valor_obra: '',
  responsavel_tecnico: '',
  endereco_logradouro: '',
  cidade: '',
  endereco_uf: '',
  empresa_grupo_id: '',
  cno: '',
  nivel_apropriacao_formulario: 'SERVICO',
  margem_custo_esperada: ''
};

export default function ObraCadastroModal({ aberto, onFechar, dadosIniciais, solicitacaoId, onCriada }) {
  const [form, setForm] = useState(VAZIO);
  const [empresas, setEmpresas] = useState([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!aberto) return;
    setForm({
      ...VAZIO,
      ...(dadosIniciais || {}),
      classificacao: dadosIniciais?.tipo_obra || dadosIniciais?.classificacao || '',
      responsavel_tecnico: dadosIniciais?.responsavel_tecnico
        || dadosIniciais?.responsavelTecnico?.nome
        || '',
      valor_obra: dadosIniciais?.valor_obra != null ? formatCurrencyInput(dadosIniciais.valor_obra) : '',
      endereco_logradouro: dadosIniciais?.endereco || dadosIniciais?.endereco_logradouro || ''
    });
    setErro('');
    getEmpresasGrupo()
      .then((listaEmpresas) => {
        setEmpresas((Array.isArray(listaEmpresas) ? listaEmpresas : []).filter((item) => (
          String(item.tipo_empresa || 'OPERACIONAL').toUpperCase() !== 'HOLDING' && item.ativo !== false
        )));
      })
      .catch((error) => setErro(error?.message || 'Nao foi possivel carregar os dados do cadastro.'));
  }, [aberto, dadosIniciais]);

  function alterar(campo, valor) {
    setForm((atual) => ({ ...atual, [campo]: valor }));
    setErro('');
  }

  async function salvar(event) {
    event.preventDefault();
    if (!form.codigo.trim() || !form.nome.trim() || !form.classificacao || !form.fase_obra
      || parseCurrencyInput(form.valor_obra) <= 0 || !form.responsavel_tecnico.trim() || !form.endereco_logradouro.trim()
      || !form.nivel_apropriacao_formulario) {
      setErro('Preencha os campos obrigatorios antes de cadastrar a obra.');
      return;
    }
    setSalvando(true);
    try {
      const criada = await criarObra({
        ...form,
        tipo_centro_custo: 'OBRA',
        valor_obra: parseCurrencyInput(form.valor_obra),
        responsavel_tecnico: form.responsavel_tecnico.trim(),
        empresa_grupo_id: form.empresa_grupo_id ? Number(form.empresa_grupo_id) : null,
        margem_custo_esperada: form.margem_custo_esperada !== '' ? Number(form.margem_custo_esperada) : null,
        solicitacao_cadastro_origem_id: solicitacaoId ? Number(solicitacaoId) : null
      });
      onCriada?.(criada);
      onFechar?.();
    } catch (error) {
      setErro(error?.message || 'Nao foi possivel cadastrar a obra.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <OverlayModal aberto={aberto} onFechar={salvando ? undefined : onFechar} rotulo="Cadastrar obra" largura="980px">
      <div data-modal="cabecalho" className="modal-header">
        <div>
          <h2 className="modal-title">Cadastrar obra</h2>
          <p className="modal-subtitle">Dados pré-preenchidos pela solicitação. Complete somente as informações operacionais.</p>
        </div>
        <button type="button" className="modal-close-btn" onClick={onFechar} disabled={salvando} aria-label="Fechar">×</button>
      </div>

      <form id="cadastro-obra-solicitacao-form" className="modal-body grid gap-4 md:grid-cols-2" onSubmit={salvar}>
        {erro ? <div className="app-alert app-alert--danger md:col-span-2">{erro}</div> : null}
        <label className="grid gap-1 text-sm font-medium">Código *
          <input className="input" value={form.codigo} onChange={(e) => alterar('codigo', e.target.value.toUpperCase())} placeholder="Ex.: OBRA-001" />
        </label>
        <label className="grid gap-1 text-sm font-medium">Nome resumido *
          <input className="input" value={form.nome} onChange={(e) => alterar('nome', e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Tipo da obra *
          <select className="input" value={form.classificacao} onChange={(e) => alterar('classificacao', e.target.value)}>
            <option value="">Selecione</option><option value="PUBLICA">Pública</option><option value="PRIVADA">Privada</option><option value="PROPRIA">Própria</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Fase da obra *
          <select className="input" value={form.fase_obra} onChange={(e) => alterar('fase_obra', e.target.value)}>
            <option value="PRE_OBRA">Pré-Obra</option><option value="OBRA_INICIADA">Obra iniciada</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Valor da obra *
          <input
            className="input input-moeda w-full"
            inputMode="decimal"
            value={form.valor_obra}
            onChange={(e) => alterar('valor_obra', normalizeCurrencyTyping(e.target.value))}
            onBlur={(e) => alterar('valor_obra', formatCurrencyInput(e.target.value))}
            placeholder="R$ 0,00"
          />
        </label>
        <label className="grid gap-1 text-sm font-medium">Responsável técnico *
          <input
            className="input"
            maxLength={160}
            value={form.responsavel_tecnico}
            onChange={(e) => alterar('responsavel_tecnico', e.target.value.slice(0, 160))}
          />
        </label>
        <label className="grid gap-1 text-sm font-medium md:col-span-2">Endereço da obra *
          <textarea className="input" rows={2} value={form.endereco_logradouro} onChange={(e) => alterar('endereco_logradouro', e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Cidade
          <input className="input" value={form.cidade} onChange={(e) => alterar('cidade', e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">UF
          <input className="input" maxLength={2} value={form.endereco_uf} onChange={(e) => alterar('endereco_uf', e.target.value.toUpperCase())} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Empresa do grupo
          <select className="input" value={form.empresa_grupo_id} onChange={(e) => alterar('empresa_grupo_id', e.target.value)}>
            <option value="">Selecione</option>{empresas.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">CNO
          <input className="input" value={form.cno} onChange={(e) => alterar('cno', e.target.value)} />
        </label>
        <label className="grid gap-1 text-sm font-medium">Nível de apropriação *
          <select className="input" value={form.nivel_apropriacao_formulario} onChange={(e) => alterar('nivel_apropriacao_formulario', e.target.value)}>
            <option value="ETAPA">Etapa</option><option value="SERVICO">Serviço</option><option value="SUBSERVICO">Subserviço</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm font-medium">Margem de custo (%)
          <input className="input" type="number" min="0" max="100" step="0.01" value={form.margem_custo_esperada} onChange={(e) => alterar('margem_custo_esperada', e.target.value)} />
        </label>
      </form>

      <div data-modal="rodape" className="modal-footer">
        <button type="button" className="btn btn-outline" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="submit" form="cadastro-obra-solicitacao-form" className="btn btn-primary" disabled={salvando}>
          {salvando ? 'Cadastrando...' : 'Cadastrar obra'}
        </button>
      </div>
    </OverlayModal>
  );
}
