import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  FormSecao,
  CampoForm,
  StatGrid,
  StatTile,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import { getSstConfig, salvarSstConfig } from '../services/sst';

const LIST_FIELDS = [
  ['tipos_risco', 'Tipos de risco'],
  ['severidades', 'Severidades'],
  ['probabilidades', 'Probabilidades'],
  ['tipos_exame', 'Tipos de exame'],
  ['status_exame', 'Status de exame'],
  ['tipos_documento', 'Tipos de documento'],
  ['status_documento', 'Status de documento'],
  ['tipos_acidente', 'Tipos de acidente/incidente'],
  ['gravidades_acidente', 'Gravidades'],
  ['status_epi', 'Status de EPI'],
  ['status_programa', 'Status de PGR/PCMSO'],
  ['eventos_esocial', 'Eventos eSocial preparados'],
  ['status_esocial', 'Status eSocial']
];

const ESOCIAL_AMBIENTES = ['NAO_CONFIGURADO', 'PRODUCAO_RESTRITA', 'PRODUCAO'];

function listToText(value) {
  return Array.isArray(value) ? value.join('\n') : '';
}

function textToList(value) {
  return String(value || '')
    .split(/\r?\n|,/)
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

export default function SstConfiguracoes() {
  const [form, setForm] = useState({ dias_alerta_validade: 30 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /*
    DEFEITO DE SIGNIFICADO corrigido aqui: a tela tinha UM estado `message`
    para as três coisas — "salvas com sucesso", "erro ao carregar" e "erro
    ao salvar" — e pintava as três na MESMA faixa azul de informação. Falha
    de gravação com cara de aviso neutro é o defeito inverso do que este
    projeto já registrou (erro pintado de sucesso no upload de
    comprovantes). Agora o tom vem do que aconteceu: `avisar.erro` para
    falha, `avisar.sucesso` para gravação.
  */
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let active = true;
    getSstConfig()
      .then((data) => {
        if (active) setForm(data || {});
      })
      .catch((err) => {
        if (active) avisar.erro(err?.message || 'Erro ao carregar configuracoes SST');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const totalItens = useMemo(() => (
    LIST_FIELDS.reduce((acc, [key]) => acc + (Array.isArray(form[key]) ? form[key].length : 0), 0)
  ), [form]);

  function updateList(key, value) {
    setForm((current) => ({ ...current, [key]: textToList(value) }));
  }

  function updateCampo(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    try {
      const data = await salvarSstConfig(form);
      setForm(data || {});
      avisar.sucesso('Configurações SST salvas com sucesso.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar configuracoes SST');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina>
      <PageHeader
        titulo="Configurações SST"
        contagem={loading ? 'Carregando' : `${totalItens} item(ns) configurado(s)`}
        descricao="Parametrize as listas operacionais usadas no módulo, evitando hardcode e mantendo o cadastro alinhado com a realidade da empresa."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Panorama" descricao="O que este cadastro governa hoje.">
        <StatGrid colunas={3}>
          <StatTile label="Itens configurados" valor={totalItens} sub="Listas operacionais" />
          <StatTile label="Alerta de validade" valor={`${form.dias_alerta_validade || 30} dias`} sub="Vencimentos próximos" />
          <StatTile
            label="eSocial"
            valor={Array.isArray(form.eventos_esocial) ? form.eventos_esocial.length : 0}
            sub="Eventos preparados"
          />
        </StatGrid>
      </BlocoConteudo>

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, e não em modal. Esta tela
        EXISTE para configurar: pelo teste da regra, tirando o formulário
        sobra um painel de três números que ninguém abriria por si só. O
        modal aqui obrigaria a abrir e fechar para fazer exatamente aquilo
        que a pessoa veio fazer. O painel fica ACIMA da lista de listas, no
        molde da ComercialUnidades.
      */}
      <BlocoConteudo
        titulo="Parametros do módulo"
        variante="primario"
        cor="var(--module-sst)"
        descricao="Vale para todas as empresas do grupo; a mudança so grava ao salvar."
      >
        <form className="space-y-4" onSubmit={submit}>
          <FormSecao legenda="Alertas e ambiente" colunas={2}>
            <CampoForm label="Dias de alerta de validade" hint="Antecedencia com que vencimentos entram no painel.">
              <input
                className="input w-full"
                type="number"
                min="1"
                value={form.dias_alerta_validade || 30}
                onChange={(event) => updateCampo('dias_alerta_validade', event.target.value)}
              />
            </CampoForm>

            <CampoForm label="Ambiente eSocial" hint="Nenhuma transmissao real acontece nesta fase.">
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo pela própria regra; não é filtro de lista. */}
              <select
                className="input w-full"
                value={form.esocial_ambiente || 'NAO_CONFIGURADO'}
                onChange={(event) => updateCampo('esocial_ambiente', event.target.value)}
              >
                {ESOCIAL_AMBIENTES.map((ambiente) => <option key={ambiente} value={ambiente}>{ambiente}</option>)}
              </select>
            </CampoForm>

            <CampoForm label="Preparacao do eSocial" span={2}>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.esocial_documentacao_oficial_validada)}
                    onChange={(event) => updateCampo('esocial_documentacao_oficial_validada', event.target.checked)}
                  />
                  Documentação oficial validada
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(form.esocial_transmissao_habilitada)}
                    onChange={(event) => updateCampo('esocial_transmissao_habilitada', event.target.checked)}
                  />
                  Habilitar transmissão futura
                </label>
              </div>
            </CampoForm>

            <CampoForm label="Observações técnicas eSocial" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-20` que estava aqui. */}
              <textarea
                className="input w-full"
                value={form.esocial_observacoes_tecnicas || ''}
                onChange={(event) => updateCampo('esocial_observacoes_tecnicas', event.target.value)}
                placeholder="Decisões, pendências e combinados técnicos do eSocial"
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Listas operacionais" colunas={2}>
            {LIST_FIELDS.map(([key, label]) => (
              <CampoForm
                key={key}
                label={label}
                hint="Um item por linha (ou separados por virgula). Sao gravados em maiusculas."
              >
                <textarea
                  className="input w-full"
                  value={listToText(form[key])}
                  onChange={(event) => updateList(key, event.target.value)}
                />
              </CampoForm>
            ))}
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={loading || saving}>
              {saving ? 'Salvando...' : 'Salvar configuracoes'}
            </button>
          </div>
        </form>
      </BlocoConteudo>
    </Pagina>
  );
}
