import { useEffect, useState } from 'react';
import { obterConfigCotacoes, salvarConfigCotacoes } from '../services/compras';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  useAvisos
} from '../components/padrao';

const CRITERIOS = [
  { value: 'menor_total', label: 'Menor total da proposta' },
  { value: 'menor_item', label: 'Menor preço por item' },
  { value: 'fornecedor_preferencial', label: 'Fornecedor preferencial' }
];

const CONDICOES_PAGAMENTO = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BOLETO', label: 'Boleto' },
  { value: 'TRANSFERENCIA', label: 'Transferência' },
  { value: 'CARTAO', label: 'Cartão' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'DINHEIRO', label: 'Dinheiro' },
  { value: 'FATURADO', label: 'Faturado' },
  { value: 'OUTROS', label: 'Outros' }
];

const CONDICOES_PRAZO_DEFAULT = ['BOLETO', 'CARTAO', 'CHEQUE', 'FATURADO', 'OUTROS'];

export default function ConfiguracoesCotacao() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: aviso do sistema no lugar da caixa do navegador — o erro fica
  // ate ser fechado, o sucesso some sozinho em 6s.
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setLoading(true);
      const data = await obterConfigCotacoes();
      setConfig(data || {});
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao carregar configurações de cotações');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  function atualizar(campo, valor) {
    setConfig((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarCondicaoPrazo(value, checked) {
    setConfig((atual) => {
      const atuais = Array.isArray(atual?.condicoes_pagamento_exigem_prazo)
        ? atual.condicoes_pagamento_exigem_prazo
        : CONDICOES_PRAZO_DEFAULT;
      const proximas = checked
        ? [...new Set([...atuais, value])]
        : atuais.filter((item) => item !== value);
      return { ...atual, condicoes_pagamento_exigem_prazo: proximas };
    });
  }

  async function handleSalvar(event) {
    event.preventDefault();
    try {
      setSalvando(true);
      await salvarConfigCotacoes({ ...config, feriados_entrega: (config.feriados_entrega || []).map((d) => d.trim()).filter(Boolean) });
      avisar.sucesso('Configurações de cotações salvas com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar configurações');
    } finally {
      setSalvando(false);
    }
  }

  // C1/R13/C2/R5: titulo e apoio na FAIXA FIXA do topo, com superficie
  // propria — antes eram um h1 + um <p class="page-subtitle"> soltos sobre
  // o canvas (B5: texto sem superficie).
  const cabecalho = (
    <PageHeader
      titulo="Configurações de Cotações"
      descricao="Regras padrão do módulo de cotações (RFQ). Apenas SUPERADMIN pode alterar."
    />
  );

  if (loading || !config) {
    // A faixa de avisos entra TAMBEM aqui: falha no carregamento deixava a
    // tela em "Carregando..." para sempre e a mensagem nunca aparecia.
    return (
      <Pagina>
        {cabecalho}
        <Avisos avisos={avisos} aoFechar={fechar} />
        <div className="app-empty-card">Carregando...</div>
      </Pagina>
    );
  }

  const condicoesSelecionadas = Array.isArray(config.condicoes_pagamento_exigem_prazo)
    ? config.condicoes_pagamento_exigem_prazo
    : CONDICOES_PRAZO_DEFAULT;

  return (
    <Pagina>
      {cabecalho}

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* B2: UM bloco principal com barra de cor — a tela tem um assunto so. */}
      <BlocoConteudo
        titulo="Regras padrão das cotações"
        variante="primario"
        cor="var(--c-primary)"
      >
        <form className="space-y-4" onSubmit={handleSalvar}>
          <CampoForm label="Feriados do acompanhamento de entregas" hint="Uma data AAAA-MM-DD por linha. O prazo de Compras conta 2 dias úteis, excluindo sábados, domingos e estas datas. Alterações valem para novos prazos; os já registrados são preservados.">
            <textarea className="input w-full" rows={3} value={(config.feriados_entrega || []).join('\n')}
              onChange={(e) => atualizar('feriados_entrega', e.target.value.split('\n'))} />
          </CampoForm>
          <FormSecao legenda="Encerramento da cotação" colunas={2}>
            <CampoForm
              label="Mínimo de cotações exigidas"
              hint="Número mínimo de respostas para encerrar uma cotação sem justificativa."
            >
              <input
                className="input w-full"
                type="number"
                min="1"
                max="10"
                value={config.min_cotacoes ?? 3}
                onChange={(event) => atualizar('min_cotacoes', Number(event.target.value))}
              />
            </CampoForm>

            <CampoForm
              label="Prazo de resposta padrão (dias)"
              hint="Dias corridos a partir do envio para o fornecedor responder."
            >
              <input
                className="input w-full"
                type="number"
                min="1"
                max="90"
                value={config.prazo_resposta_padrao_dias ?? 5}
                onChange={(event) => atualizar('prazo_resposta_padrao_dias', Number(event.target.value))}
              />
            </CampoForm>

            <CampoForm
              label="Critério de vencedor padrão"
              hint="Critério utilizado como referência na comparação de propostas."
            >
              {/* R12: select de FORMULARIO (entrada de dado), nao de filtro —
                  continua legitimo. */}
              <select
                className="input w-full"
                value={config.criterio_vencedor ?? 'menor_total'}
                onChange={(event) => atualizar('criterio_vencedor', event.target.value)}
              >
                {CRITERIOS.map((criterio) => (
                  <option key={criterio.value} value={criterio.value}>{criterio.label}</option>
                ))}
              </select>
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Exigências do responsável" colunas={2}>
            {/* M2/R10: o alinhamento da marca com a primeira linha do texto
                usava mt-0.5 (2px), degrau que nao existe na escala. */}
            <label className="form-campo--linha flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(config.permitir_aprovar_sem_minimo)}
                onChange={(event) => atualizar('permitir_aprovar_sem_minimo', event.target.checked)}
              />
              <div>
                <div className="text-sm font-medium">Permitir aprovar sem atingir o mínimo de cotações</div>
                <div className="app-note">
                  O responsável pode encerrar mesmo com menos respostas do que o mínimo, mediante justificativa.
                </div>
              </div>
            </label>

            <label className="form-campo--linha flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                className="mt-1"
                checked={Boolean(config.exigir_justificativa_se_nao_menor_preco)}
                onChange={(event) => atualizar('exigir_justificativa_se_nao_menor_preco', event.target.checked)}
              />
              <div>
                <div className="text-sm font-medium">Exigir justificativa se o vencedor não for o menor preço</div>
                <div className="app-note">
                  Quando o critério de seleção divergir do menor preço, o responsável deve informar a razão.
                </div>
              </div>
            </label>
          </FormSecao>

          <FormSecao legenda="Condições de pagamento que exigem prazo" colunas={2}>
            <div className="form-campo--linha">
              <p className="app-note">
                Controla quais formas obrigam o fornecedor a informar prazo na resposta da cotação.
              </p>
            </div>
            <div className="form-campo--linha grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {CONDICOES_PAGAMENTO.map((opcao) => (
                <label
                  key={opcao.value}
                  className="flex items-center gap-2 border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--ui-border)', borderRadius: 'var(--raio-2)' }}
                >
                  <input
                    type="checkbox"
                    checked={condicoesSelecionadas.includes(opcao.value)}
                    onChange={(event) => alternarCondicaoPrazo(opcao.value, event.target.checked)}
                  />
                  <span>{opcao.label}</span>
                </label>
              ))}
            </div>
          </FormSecao>

          <div className="flex justify-end">
            <button type="submit" className="btn btn-primary" disabled={salvando}>
              {salvando ? 'Salvando...' : 'Salvar configurações'}
            </button>
          </div>
        </form>
      </BlocoConteudo>
    </Pagina>
  );
}
