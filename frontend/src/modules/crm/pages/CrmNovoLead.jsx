import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { criarLead } from '../../../services/crm';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../../../components/padrao';
import { getCpfCnpjError, maskCpfCnpj, maskPhone, normalizeCurrencyTyping, onlyDigits } from '../../../utils/formatters';

const SOURCE_OPTIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'SITE', label: 'Site' },
  { value: 'INDICACAO', label: 'Indicacao' },
  { value: 'META_ADS', label: 'Meta Ads' },
  { value: 'GOOGLE_ADS', label: 'Google Ads' },
  { value: 'OUTRO', label: 'Outro' }
];

export default function CrmNovoLead() {
  const navigate = useNavigate();
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    telefone: '',
    email: '',
    documento: '',
    cidade: '',
    estado: '',
    source_type: 'MANUAL',
    source_name: '',
    empreendimento_interesse: '',
    produto_interesse: '',
    faixa_valor: '',
    observacoes: '',
    temperatura: 'FRIO'
  });

  function set(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nome.trim()) {
      // R19/R3: era `alert('Nome e obrigatorio')` — a caixa do navegador.
      avisar.alerta('Informe o nome do lead para continuar.');
      return;
    }
    const documentoErro = getCpfCnpjError(form.documento);
    if (documentoErro) {
      avisar.alerta(documentoErro);
      return;
    }
    try {
      setSaving(true);
      const lead = await criarLead({
        ...form,
        telefone: onlyDigits(form.telefone),
        documento: onlyDigits(form.documento)
      });
      navigate(`/crm/leads/${lead.id}`);
    } catch (err) {
      if (err.status === 409) {
        /*
          R21 + R26 — o duplicado era perguntado com `confirm()` e o destino
          era lido DEPOIS da resposta (`err.duplicateId || ''`), o que
          mandava para `/crm/leads/` quando o id não vinha: a pessoa
          autorizava "abrir o lead existente" e caía noutro lugar.
          Agora o id é FIXADO antes do `await`, o retorno é DESESTRUTURADO
          (objeto é sempre truthy — sem isso o "Cancelar" navegaria), e sem
          id não se navega: diz-se o que houve.
        */
        const idExistente = err.duplicateId;
        const mensagemDuplicado = err.message || 'Ja existe um lead com estes dados.';
        if (!idExistente) {
          avisar.alerta(`${mensagemDuplicado} Nao foi possivel identificar o lead existente para abrir.`);
          return;
        }
        const { ok } = await confirmar({
          titulo: 'Lead já cadastrado',
          mensagem: `${mensagemDuplicado} Deseja abrir o lead existente?`,
          rotuloConfirmar: 'Abrir lead existente',
          rotuloCancelar: 'Continuar editando'
        });
        if (!ok) return;
        navigate(`/crm/leads/${idExistente}`);
      } else {
        avisar.erro(err.message || 'Erro ao criar lead');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina>
      {/*
        C3/R11 — tela de REGISTRO: a seta de voltar à esquerda é a
        affordance primária de retorno e substitui o link "Cancelar" que
        ficava solto na faixa. A saída continua existindo também no rodapé
        do formulário, ao lado do botão que grava.
      */}
      <PageHeader
        titulo="Novo lead"
        descricao="Cadastro manual de lead para o CRM."
        voltar={{ to: '/crm/leads', title: 'Voltar para leads' }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, e não em modal. O
        critério não é a frequência: é o que a tela existe para fazer. Esta
        tela TEM ROTA PRÓPRIA (`/crm/leads/novo`) e existe para cadastrar um
        lead — pelo teste da regra, tirando o formulário não sobra tela
        nenhuma. Modal aqui seria atrito puro. Não mover para OverlayModal.
      */}
      <form onSubmit={handleSubmit}>
        <BlocoConteudo titulo="Dados do lead" variante="primario" cor="var(--c-primary)">
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Nome" obrigatorio span={2}>
              <input
                className="input w-full"
                value={form.nome}
                onChange={set('nome')}
                placeholder="Nome completo"
                required
              />
            </CampoForm>

            <CampoForm label="Telefone">
              <input
                className="input w-full"
                value={form.telefone}
                onChange={(e) => setForm((current) => ({ ...current, telefone: maskPhone(e.target.value) }))}
                placeholder="(99) 99999-9999"
              />
            </CampoForm>

            <CampoForm label="E-mail">
              <input
                className="input w-full"
                type="email"
                value={form.email}
                onChange={set('email')}
                placeholder="email@exemplo.com"
              />
            </CampoForm>

            <CampoForm label="CPF / CNPJ">
              <input
                className="input w-full"
                value={form.documento}
                onChange={(e) => setForm((current) => ({ ...current, documento: maskCpfCnpj(e.target.value) }))}
                placeholder="Documento"
              />
            </CampoForm>

            {/* R12: select de FORMULÁRIO (entrada de dado) — legítimo. */}
            <CampoForm label="Temperatura">
              <select className="input w-full" value={form.temperatura} onChange={set('temperatura')}>
                <option value="FRIO">Frio</option>
                <option value="MORNO">Morno</option>
                <option value="QUENTE">Quente</option>
              </select>
            </CampoForm>

            <CampoForm label="Cidade">
              <input className="input w-full" value={form.cidade} onChange={set('cidade')} placeholder="Cidade" />
            </CampoForm>

            <CampoForm label="Estado">
              <input
                className="input w-full"
                maxLength={2}
                value={form.estado}
                onChange={(e) => setForm((current) => ({ ...current, estado: e.target.value.toUpperCase() }))}
                placeholder="ES"
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Interesse e origem" colunas={2}>
            <CampoForm label="Empreendimento de interesse">
              <input
                className="input w-full"
                value={form.empreendimento_interesse}
                onChange={set('empreendimento_interesse')}
                placeholder="Ex: Residencial Horizonte"
              />
            </CampoForm>

            <CampoForm label="Produto de interesse">
              <input
                className="input w-full"
                value={form.produto_interesse}
                onChange={set('produto_interesse')}
                placeholder="Ex: Apartamento 2 quartos"
              />
            </CampoForm>

            <CampoForm label="Faixa de valor">
              {/* R6: campo de dinheiro usa .input-moeda (piso de 180px, alinhado
                  à direita e tabular) — a medida mora na classe, não na tela. */}
              <input
                className="input input-moeda"
                inputMode="decimal"
                value={form.faixa_valor}
                onChange={(e) => setForm((current) => ({ ...current, faixa_valor: normalizeCurrencyTyping(e.target.value) }))}
                placeholder="Ex: R$ 300.000,00"
              />
            </CampoForm>

            <CampoForm label="Origem">
              <select className="input w-full" value={form.source_type} onChange={set('source_type')}>
                {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </CampoForm>

            {['META_ADS', 'GOOGLE_ADS', 'SITE'].includes(form.source_type) && (
              <CampoForm label="Nome da campanha / fonte" span={2}>
                <input
                  className="input w-full"
                  value={form.source_name}
                  onChange={set('source_name')}
                  placeholder="Nome da campanha"
                />
              </CampoForm>
            )}
          </FormSecao>

          <FormSecao legenda="Observações" colunas={2}>
            <CampoForm label="Informações adicionais" tipo="texto-longo" span={2}>
              <textarea
                className="input w-full"
                rows={4}
                value={form.observacoes}
                onChange={set('observacoes')}
                placeholder="Informações adicionais sobre o lead..."
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="button" className="btn btn-outline" onClick={() => navigate('/crm/leads')}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : 'Criar lead'}
            </button>
          </div>
        </BlocoConteudo>
      </form>

      {elementoConfirmacao}
    </Pagina>
  );
}
