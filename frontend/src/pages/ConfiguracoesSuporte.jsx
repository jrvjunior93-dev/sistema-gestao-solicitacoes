import { useEffect, useMemo, useState } from 'react';
import {
  getSuporteWhatsapp,
  salvarSuporteWhatsapp
} from '../services/configuracoesSistema';
import { Avisos, BlocoConteudo, Pagina, PageHeader, useAvisos } from '../components/padrao';

/**
 * WHATSAPP DO SUPORTE — reforma de 04/09.
 *
 * O cabeçalho era `.config-page-header`, que NÃO é sticky: ao rolar, título
 * e ações sumiam (C1/R13). A faixa fixa é `Pagina` + `PageHeader` — e as
 * duas peças andam juntas: quem publica `--pos-cabecalho-fixo` é o `Pagina`,
 * e a compactação é estado do `PageHeader`.
 *
 * O "Voltar" era um `<Link className="btn btn-outline">` na faixa de ações
 * (C6/R11: navegação vestida de ação). O retorno não sumiu — mudou de forma:
 * é a prop `voltar` do `PageHeader`, a seta à esquerda do título, que é a
 * affordance primária de retorno e continua sendo a mesma navegação.
 */

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function maskPhone(value) {
  const digits = onlyDigits(value).replace(/^55(?=\d{10,11}$)/, '').slice(0, 11);

  if (digits.length <= 2) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export default function ConfiguracoesSuporte() {
  const [whatsapp, setWhatsapp] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  /*
    R3: erro e sucesso vinham em markup próprio — duas <div> com paleta crua
    (border-red-200/bg-red-50 e border-emerald-200/bg-emerald-50), cada uma
    com seu estado. É de `useAvisos`/`Avisos` que vem o tom semântico do
    sistema (que acompanha o tema escuro e o piso de contraste do
    ThemeContext, R24/R25) e o fechamento automático do sucesso em 6s.
  */
  const { avisos, avisar, fechar, limpar } = useAvisos();

  useEffect(() => {
    let active = true;

    getSuporteWhatsapp()
      .then((data) => {
        if (!active) return;
        setWhatsapp(maskPhone(data?.whatsapp || ''));
      })
      .catch((err) => {
        if (!active) return;
        avisar.erro(err?.message || 'Erro ao carregar configuracao de suporte.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [avisar]);

  const previewUrl = useMemo(() => {
    const digits = onlyDigits(whatsapp);
    if (!digits) return '';
    const normalized = digits.startsWith('55') ? digits : `55${digits}`;
    return `https://wa.me/${normalized}`;
  }, [whatsapp]);

  async function handleSubmit(event) {
    event.preventDefault();
    limpar();
    setSaving(true);

    try {
      const data = await salvarSuporteWhatsapp({ whatsapp });
      setWhatsapp(maskPhone(data?.whatsapp || ''));
      avisar.sucesso('WhatsApp de suporte atualizado.');
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar WhatsApp de suporte.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Pagina>
      {/* C6/R11: o retorno tem forma própria — a prop `voltar`. Ele não foi
          removido, saiu da barra de ações (onde moram ações SOBRE esta
          tela) para o lugar que é dele. */}
      <PageHeader
        titulo="WhatsApp do Suporte"
        descricao="Configuração de Suporte: define o número usado pelo botão Suporte no topo do sistema."
        voltar={{ to: '/configuracoes', title: 'Voltar para Configurações' }}
      />

      <BlocoConteudo
        titulo="Número de atendimento"
        variante="primario"
        cor="var(--c-primary)"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* A faixa de avisos fica dentro do bloco do formulário: o erro
              do salvamento pertence ao formulário que o produziu. */}
          <Avisos avisos={avisos} aoFechar={fechar} />

          <div className="max-w-md">
            <label className="app-filter-label" htmlFor="suporte-whatsapp">
              Número WhatsApp
            </label>
            <input
              id="suporte-whatsapp"
              className="input"
              value={whatsapp}
              onChange={(event) => {
                setWhatsapp(maskPhone(event.target.value));
                // Mexer no campo apaga a mensagem da tentativa anterior.
                limpar();
              }}
              placeholder="(27) 99999-9999"
              disabled={loading || saving}
            />
          </div>

          {previewUrl ? (
            <p className="app-note">
              Link gerado: <span className="font-semibold text-[var(--c-text)]">{previewUrl}</span>
            </p>
          ) : (
            <p className="app-note">
              Informe DDD e número. O sistema adiciona o DDI 55 automaticamente.
            </p>
          )}

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={loading || saving}>
              {saving ? 'Salvando...' : 'Salvar numero'}
            </button>
            {previewUrl ? (
              <a
                className="btn btn-outline"
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
              >
                Testar WhatsApp
              </a>
            ) : null}
          </div>
        </form>
      </BlocoConteudo>
    </Pagina>
  );
}
