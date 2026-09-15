import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  BarraFiltros,
  alternarValorFiltro,
  Avisos,
  useAvisos
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import ParceiroAutocomplete from '../components/ui/ParceiroAutocomplete';
import ModalPortal from '../components/ui/ModalPortal';
import { buscarParceiros } from '../services/parceiros';
import {
  atualizarUnidadeComercial,
  atualizarConfiguracaoUnidadesComerciais,
  criarUnidadeComercial,
  excluirUnidadeComercial,
  getConfiguracaoUnidadesComerciais,
  getEmpreendimentosComerciais,
  getUnidadesComerciais
} from '../services/comercial';
import { formatCurrencyInput, normalizeCurrencyTyping } from '../utils/formatters';
import DateInputBR from '../components/DateInputBR';

const SITUACOES = ['DISPONIVEL', 'RESERVADA', 'VENDIDA', 'DISTRATADA', 'BLOQUEADA'];

function defaultForm() {
  return {
    id: null,
    empreendimento_id: '',
    parceiro_reserva_id: '',
    codigo: '',
    nome: '',
    torre: '',
    pavimento: '',
    metragem_privativa: '',
    fracao_ideal: '',
    valor_tabela: '',
    valor_base_venda: '',
    situacao: 'DISPONIVEL',
    reservado_ate: '',
    observacoes: '',
    ativo: true
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

/*
  R25 — a paleta crua da antiga statusClass() (emerald/amber/blue/rose/slate)
  vira FAMÍLIA SEMÂNTICA do StatusBadge, que resolve cor, ícone e contraste
  por token. O mapa é explícito de propósito: a classificação automática do
  StatusBadge lê o texto do status e joga DISPONIVEL, RESERVADA, VENDIDA e
  DISTRATADA todas em 'info' — quatro situações diferentes com a mesma cor,
  que é justamente a distinção que a tela tinha e não pode perder.
*/
const FAMILIA_SITUACAO = {
  DISPONIVEL: 'success',
  RESERVADA: 'warning',
  VENDIDA: 'info',
  DISTRATADA: 'neutral',
  BLOQUEADA: 'danger',
  EXCLUIDA: 'danger'
};

function familiaDaSituacao(situacao) {
  return FAMILIA_SITUACAO[String(situacao || '').toUpperCase()] || 'neutral';
}

// Mesma forma da ComercialContratos (tela irmã do módulo): fixar T00:00:00
// evita o recuo de um dia que o fuso causa ao ler 'AAAA-MM-DD' como UTC.
function formatDate(value) {
  if (!value) return '-';
  const dia = String(value).slice(0, 10);
  const data = new Date(`${dia}T00:00:00`);
  if (Number.isNaN(data.getTime())) return '-';
  return data.toLocaleDateString('pt-BR');
}

function pickForm(item = {}) {
  return {
    id: item.id || null,
    empreendimento_id: item.empreendimento_id ? String(item.empreendimento_id) : '',
    parceiro_reserva_id: item.parceiro_reserva_id ? String(item.parceiro_reserva_id) : '',
    codigo: String(item.codigo || '').replace(/\D/g, ''),
    nome: item.nome || '',
    torre: item.torre || '',
    pavimento: item.pavimento || '',
    metragem_privativa: item.metragem_privativa || '',
    fracao_ideal: item.fracao_ideal || '',
    valor_tabela: formatCurrencyInput(item.valor_tabela),
    valor_base_venda: formatCurrencyInput(item.valor_base_venda),
    situacao: item.situacao || 'DISPONIVEL',
    reservado_ate: item.reservado_ate || '',
    observacoes: item.observacoes || '',
    ativo: item.ativo !== false
  };
}

export default function ComercialUnidades() {
  const [form, setForm] = useState(defaultForm());
  // R12: o recorte da lista é um conjunto de MARCAS (vazio = todos os
  // empreendimentos), não mais um select de escolha única.
  const [filtros, setFiltros] = useState({
    q: '',
    empreendimento: new Set(),
    registros: new Set(['ATIVAS'])
  });
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [unidades, setUnidades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [permitirVendaManual, setPermitirVendaManual] = useState(false);
  const [unidadeExclusao, setUnidadeExclusao] = useState(null);
  const [motivoExclusao, setMotivoExclusao] = useState('');
  const [deleting, setDeleting] = useState(false);
  // R22: hook usado é hook importado — o useRef está no import acima. A
  // referência leva o foco ao formulário (que fica ACIMA da lista); não
  // mede nada.
  const campoCodigoRef = useRef(null);
  // R3/R19: faixa de aviso do sistema no lugar do <div> de erro à mão.
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setLoading(true);
      const [empreendimentosData, clientesData, unidadesData, configuracaoData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        buscarParceiros({ cliente: 1, ativo: 1, limit: 'all' }),
        getUnidadesComerciais(),
        getConfiguracaoUnidadesComerciais()
      ]);
      setEmpreendimentos(Array.isArray(empreendimentosData) ? empreendimentosData : []);
      setClientes(Array.isArray(clientesData) ? clientesData : []);
      setUnidades(Array.isArray(unidadesData) ? unidadesData : []);
      setPermitirVendaManual(Boolean(configuracaoData?.permitir_venda_manual));
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar unidades comerciais');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const listaFiltrada = useMemo(() => {
    const termo = normalizeSearch(filtros.q);
    return unidades.filter((item) => {
      const grupoRegistro = item.ativo === false ? 'EXCLUIDAS' : 'ATIVAS';
      if (filtros.registros.size > 0 && !filtros.registros.has(grupoRegistro)) {
        return false;
      }

      // R23: o recorte aplica ao marcar — o filtro é local, não há consulta
      // cara nem botão de "aplicar".
      if (filtros.empreendimento.size > 0
        && !filtros.empreendimento.has(String(item.empreendimento_id))) {
        return false;
      }

      if (!termo) {
        return true;
      }

      const blob = normalizeSearch([
        item.codigo,
        item.nome,
        item.torre,
        item.fracao_ideal,
        item.empreendimento?.nome,
        item.parceiroReserva?.nome
      ].filter(Boolean).join(' '));

      return blob.includes(termo);
    });
  }, [filtros, unidades]);

  // O formulário fica ACIMA da lista: sem levar o foco até ele, clicar em
  // "Editar" no fim de uma lista longa não muda nada no que a pessoa está
  // vendo — a edição aconteceria fora do campo de visão (R15).
  function focarFormulario() {
    campoCodigoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll: quem rola é o scrollIntoView suave.
    campoCodigoRef.current?.focus({ preventScroll: true });
  }

  function novaUnidade() {
    setForm(defaultForm());
    focarFormulario();
  }

  function editarUnidade(item) {
    if (item.ativo === false) {
      avisar.erro('Unidade excluida nao pode ser editada. Consulte os dados de exclusao na tabela.');
      return;
    }
    setForm(pickForm(item));
    focarFormulario();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setSaving(true);

      const payload = {
        empreendimento_id: Number(form.empreendimento_id),
        parceiro_reserva_id: form.parceiro_reserva_id ? Number(form.parceiro_reserva_id) : undefined,
        codigo: form.codigo,
        nome: form.nome,
        torre: form.torre,
        pavimento: form.pavimento,
        metragem_privativa: form.metragem_privativa || undefined,
        fracao_ideal: form.fracao_ideal || undefined,
        valor_tabela: form.valor_tabela || undefined,
        valor_base_venda: form.valor_base_venda || undefined,
        situacao: form.situacao,
        reservado_ate: form.reservado_ate || undefined,
        observacoes: form.observacoes
      };

      if (form.id) {
        await atualizarUnidadeComercial(form.id, payload);
      } else {
        await criarUnidadeComercial(payload);
      }

      setForm(defaultForm());
      avisar.sucesso('Unidade salva.');
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar unidade comercial');
    } finally {
      setSaving(false);
    }
  }

  async function handleExcluirUnidade() {
    if (!unidadeExclusao || !motivoExclusao.trim()) return;
    try {
      setDeleting(true);
      await excluirUnidadeComercial(unidadeExclusao.id, motivoExclusao.trim());
      if (Number(form.id) === Number(unidadeExclusao.id)) setForm(defaultForm());
      setUnidadeExclusao(null);
      setMotivoExclusao('');
      avisar.sucesso('Unidade excluida. O cadastro e o historico foram preservados.');
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao excluir unidade comercial');
    } finally {
      setDeleting(false);
    }
  }

  async function handleVendaManualChange(checked) {
    try {
      setSavingConfig(true);
      const data = await atualizarConfiguracaoUnidadesComerciais({ permitir_venda_manual: checked });
      setPermitirVendaManual(Boolean(data?.permitir_venda_manual));
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao atualizar a configuracao de venda manual.');
    } finally {
      setSavingConfig(false);
    }
  }

  /*
    R1/R17 — a lista era um <article> por registro com NOVE campos soltos em
    <span>: sem colunas declaradas, sem redimensionamento e sem largura
    salva por usuário. Agora é TabelaPadrao, e cada coluna declara o que ELA
    É (`tipo`) — medida e alinhamento são do componente (R1/R10/R14).
    Nenhum dado do card saiu; os pares da mesma família (torre/pavimento,
    unidade/empreendimento) viraram CelulaDupla, e as colunas que sobram o
    usuário esconde no painel de colunas (colunasConfiguraveis).

    Os DOIS campos de dinheiro são `tipo: 'valor'` (R1/R17/T7): 190px,
    alinhados à direita e em tabular-nums — valor NUNCA trunca.
  */
  const colunas = [
    {
      id: 'unidade',
      titulo: 'Unidade',
      // R17: IDENTIDADE — o código (com o nome, quando existe) é o que
      // nomeia a unidade; o empreendimento vai como sub da mesma célula,
      // que é como se lê "unidade 101 do Residencial X".
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla
          principal={`${item.codigo ?? ''}${item.nome ? ` - ${item.nome}` : ''}`}
          sub={item.empreendimento?.nome || null}
        />
      )
    },
    {
      id: 'localizacao',
      titulo: 'Torre / pavimento',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={item.torre || '-'}
          sub={item.pavimento ? `Pavimento ${item.pavimento}` : null}
        />
      )
    },
    {
      id: 'metragem',
      titulo: 'Metragem privativa',
      tipo: 'numero',
      render: (item) => item.metragem_privativa || '-'
    },
    {
      id: 'fracao',
      titulo: 'Fracao ideal',
      tipo: 'numero',
      render: (item) => item.fracao_ideal || '-'
    },
    {
      id: 'reserva',
      titulo: 'Reserva',
      tipo: 'texto',
      render: (item) => item.parceiroReserva?.nome || '-'
    },
    {
      id: 'reservado_ate',
      titulo: 'Reservado até',
      tipo: 'data',
      render: (item) => formatDate(item.reservado_ate)
    },
    {
      id: 'valor_tabela',
      titulo: 'Valor tabela',
      tipo: 'valor',
      render: (item) => (item.valor_tabela ? formatCurrency(item.valor_tabela) : '-')
    },
    {
      id: 'valor_base_venda',
      titulo: 'Valor base de venda',
      tipo: 'valor',
      render: (item) => (item.valor_base_venda ? formatCurrency(item.valor_base_venda) : '-')
    },
    {
      id: 'situacao',
      titulo: 'Situação',
      tipo: 'status',
      // R25: a statusClass() devolvia DEZ classes de paleta crua para cinco
      // status (emerald/amber/blue/rose/slate) — sem par no tema escuro e
      // fora do piso de contraste do ThemeContext. O StatusBadge resolve
      // cor, ícone e contraste por token; a família vem do mapa acima, que
      // preserva a distinção entre as cinco situações.
      render: (item) => (
        <StatusBadge
          status={item.ativo === false ? 'EXCLUIDA' : item.situacao}
          kind={familiaDaSituacao(item.ativo === false ? 'EXCLUIDA' : item.situacao)}
        />
      )
    },
    {
      id: 'exclusao',
      titulo: 'Exclusao',
      tipo: 'texto',
      render: (item) => {
        if (item.ativo !== false) return '-';
        const data = item.excluido_em
          ? new Date(item.excluido_em).toLocaleString('pt-BR')
          : 'Data nao registrada';
        const usuario = item.excluidoPor?.nome ? ` por ${item.excluidoPor.nome}` : '';
        const resumo = `${data}${usuario}`;
        return (
          <CelulaDupla
            principal={resumo}
            sub={item.motivo_exclusao || 'Motivo nao registrado'}
          />
        );
      }
    },
    {
      id: 'observacoes',
      titulo: 'Observações',
      tipo: 'texto',
      // T6: texto longo trunca com o texto completo no tooltip.
      render: (item) => (
        <span title={item.observacoes || undefined}>{item.observacoes || '-'}</span>
      )
    }
  ];

  return (
    <Pagina>
      {/* R13/C1/R5: o cabeçalho era `app-page-header` cru, com o apoio num
          `page-subtitle` solto e sem compactação na rolagem. Título,
          contagem e apoio passam a viver no PageHeader. */}
      <PageHeader
        titulo="Unidades comerciais"
        contagem={loading ? null : `${listaFiltrada.length} unidade(s)`}
        descricao="Controle disponibilidade, reservas, valores de tabela e base de venda por empreendimento."
        acaoPrincipal={{ rotulo: 'Nova unidade', onClick: novaUnidade }}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        A chave "Permitir marcar unidade como Vendida manualmente" estava
        dentro da faixa fixa do cabeçalho, onde C2/R5 pedem UMA linha de
        apoio e a barra de ações. Ela não é ação sobre a tela: é uma
        CONFIGURAÇÃO gravada na hora, que muda o que o campo Situação do
        formulário oferece. Então ganha superfície própria (B5), ao lado do
        campo que ela governa — nada foi removido da tela.
      */}
      <BlocoConteudo
        titulo="Regra de venda manual"
        descricao="Vale para todas as unidades; a mudança e gravada no momento em que você marca."
      >
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={permitirVendaManual}
            onChange={(event) => handleVendaManualChange(event.target.checked)}
            disabled={savingConfig}
          />
          Permitir marcar unidade como Vendida manualmente
        </label>
      </BlocoConteudo>

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        O critério não é a frequência do cadastro: é o que a tela existe para
        fazer. Esta tela existe PARA cadastrar unidades — pelo teste da
        regra, tirando o formulário sobra uma lista que ninguém abriria por
        si só. Modal aqui é atrito: obrigaria a abrir e fechar para fazer
        justamente aquilo que a pessoa veio fazer (o uso normal é cadastrar
        várias unidades seguidas de um mesmo empreendimento). Não mover para
        OverlayModal — cinco telas foram movidas por essa leitura errada em
        04/09 e tiveram de voltar.

        ARRANJO — empilhado, e não nas duas colunas de antes: as colunas
        vinham de um grid com largura em px (`xl:grid-cols-[460px_...]`),
        medida à mão (R10), e espremiam a listagem em meia tela. Esta tabela
        tem dez colunas, duas delas de valor (190px cada): precisa da
        largura inteira.
      */}
      <BlocoConteudo titulo={form.id ? 'Editar unidade' : 'Nova unidade'}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Empreendimento" obrigatorio span={2}>
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo. O filtro da lista, esse sim, virou marcação. */}
              <select
                className="input w-full"
                value={form.empreendimento_id}
                onChange={(event) => setForm((current) => ({ ...current, empreendimento_id: event.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {empreendimentos.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.codigo ? `${item.codigo} - ${item.nome}` : item.nome}
                  </option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Código" obrigatorio>
              <input
                ref={campoCodigoRef}
                className="input w-full"
                inputMode="numeric"
                pattern="[0-9]+"
                value={form.codigo}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value.replace(/\D/g, '') }))}
                required
                placeholder="Ex.: 101"
              />
            </CampoForm>

            <CampoForm label="Nome">
              <input
                className="input w-full"
                value={form.nome}
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                placeholder="Cobertura, loja, lote..."
              />
            </CampoForm>

            <CampoForm label="Torre">
              <input
                className="input w-full"
                value={form.torre}
                onChange={(event) => setForm((current) => ({ ...current, torre: event.target.value }))}
              />
            </CampoForm>

            <CampoForm label="Pavimento">
              <input
                className="input w-full"
                value={form.pavimento}
                onChange={(event) => setForm((current) => ({ ...current, pavimento: event.target.value }))}
              />
            </CampoForm>

            <CampoForm label="Metragem privativa">
              <input
                className="input w-full"
                type="number"
                step="0.01"
                value={form.metragem_privativa}
                onChange={(event) => setForm((current) => ({ ...current, metragem_privativa: event.target.value }))}
              />
            </CampoForm>

            <CampoForm label="Fracao ideal">
              <input
                className="input w-full"
                type="number"
                step="0.000001"
                value={form.fracao_ideal}
                onChange={(event) => setForm((current) => ({ ...current, fracao_ideal: event.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Valores e disponibilidade" colunas={2}>
            {/* R6: campo de dinheiro é dimensionado pelo pior caso —
                `.input-moeda` garante 180px (cabe R$ 9.999.999.999,99),
                alinhamento à direita e tabular-nums. Os dois campos estavam
                com `input w-full` cru. */}
            <CampoForm label="Valor tabela">
              <input
                className="input input-moeda w-full"
                inputMode="decimal"
                value={form.valor_tabela}
                onChange={(event) => setForm((current) => ({ ...current, valor_tabela: normalizeCurrencyTyping(event.target.value) }))}
                onBlur={(event) => setForm((current) => ({ ...current, valor_tabela: formatCurrencyInput(event.target.value) }))}
                placeholder="R$ 0,00"
              />
            </CampoForm>

            <CampoForm label="Valor base de venda">
              <input
                className="input input-moeda w-full"
                inputMode="decimal"
                value={form.valor_base_venda}
                onChange={(event) => setForm((current) => ({ ...current, valor_base_venda: normalizeCurrencyTyping(event.target.value) }))}
                onBlur={(event) => setForm((current) => ({ ...current, valor_base_venda: formatCurrencyInput(event.target.value) }))}
                placeholder="R$ 0,00"
              />
            </CampoForm>

            <CampoForm
              label="Situação"
              hint={!permitirVendaManual && form.situacao !== 'VENDIDA'
                ? 'Vendida e definida automaticamente ao vincular um contrato.'
                : undefined}
            >
              {/*
                R12 — FALSO POSITIVO DECLARADO do validador estático.

                Este <select> é campo do FORMULÁRIO: ele define a situação da
                unidade que está sendo cadastrada/editada, e vai no payload
                (`situacao`). A R12 vale para filtro de LISTA, e diz por
                escrito que "select de FORMULÁRIO (entrada de dado) e seletor
                de CONTEXTO continuam legítimos".

                O check acusa porque procura o vocabulário /situacao/ ao redor
                de qualquer <select> — e aqui a palavra aparece por ser o nome
                do DADO, não de um recorte. O próprio validador declara essa
                limitação no comentário da regra ("nome de variável é escolha
                de quem escreveu"). Renomear o campo para escapar do detector
                seria enganar o instrumento, não corrigir a tela; o achado
                fica registrado aqui e no relatório.
              */}
              <select
                className="input w-full"
                value={form.situacao}
                onChange={(event) => setForm((current) => ({ ...current, situacao: event.target.value }))}
              >
                {SITUACOES.filter((item) => item !== 'VENDIDA' || permitirVendaManual || form.situacao === 'VENDIDA').map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Reservado até">
              <DateInputBR
                className="input w-full"
                value={form.reservado_ate}
                onChange={(event) => setForm((current) => ({ ...current, reservado_ate: event.target.value }))}
              />
            </CampoForm>

            <CampoForm
              label="Cliente da reserva"
              span={2}
              hint="Campo opcional. Apague a busca para deixar a unidade sem reserva vinculada."
            >
              {/* O rótulo vem do CampoForm (classe .form-label do sistema),
                  não do rótulo próprio do autocomplete: um campo, um rótulo
                  (R7 — label sempre acima do campo, na mesma linha de base
                  dos vizinhos). */}
              <ParceiroAutocomplete
                label=""
                value={form.parceiro_reserva_id}
                options={clientes}
                onChange={(parceiroId) => setForm((current) => ({ ...current, parceiro_reserva_id: parceiroId }))}
                placeholder="Digite nome, CPF/CNPJ ou e-mail"
                emptyLabel="Nenhum cliente encontrado"
                showOptionsOnFocus
                resultLimit={8}
              />
            </CampoForm>

            <CampoForm label="Observações" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[96px]` que estava aqui. */}
              <textarea
                className="input w-full"
                value={form.observacoes}
                onChange={(event) => setForm((current) => ({ ...current, observacoes: event.target.value }))}
                placeholder="Pendências, restrições ou detalhes da unidade"
              />
            </CampoForm>

          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : (form.id ? 'Salvar alteracoes' : 'Criar unidade')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(defaultForm())}>
              Limpar
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Unidades cadastradas"
        descricao="Base para reserva, venda, distrato e carteira de recebimentos."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/*
          R12/R3/R16: o recorte era um <select> "Empreendimento" com a busca
          ao lado — o estado do filtro só aparecia abrindo a lista suspensa.
          Agora é a BarraFiltros das Solicitações: busca única em cima
          ocupando a faixa e, abaixo, o filtro por MARCAÇÃO com etiquetas
          removíveis. A marcação é múltipla porque o recorte é feito em
          memória (nenhum parâmetro de API aceita um valor só aqui), então
          não leva `unico`.
        */}
        <BarraFiltros
          busca={{
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar código, torre, pavimento, reserva ou empreendimento'
          }}
          filtros={[
            {
              id: 'empreendimento',
              rotulo: 'Empreendimento',
              opcoes: empreendimentos.map((item) => ({
                valor: String(item.id),
                rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
              }))
            },
            {
              id: 'registros',
              rotulo: 'Registros',
              opcoes: [
                { valor: 'ATIVAS', rotulo: 'Ativas' },
                { valor: 'EXCLUIDAS', rotulo: 'Excluidas' }
              ]
            }
          ]}
          ativos={{
            empreendimento: filtros.empreendimento,
            registros: filtros.registros
          }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({
            ...prev,
            empreendimento: new Set(),
            registros: new Set()
          }))}
        />

        {/* A1: a ação da linha é um <button> focável ("Editar"), e a linha
            inteira também é acionável por teclado (o TabelaPadrao dá
            tabIndex + Enter/Espaço quando recebe aoClicarLinha). */}
        <TabelaPadrao
          colunas={colunas}
          itens={listaFiltrada}
          carregando={loading}
          getId={(item) => item.id}
          storageKey="tabela:comercial-unidades"
          rotuloRolagem="Unidades comerciais"
          larguraAcoes={190}
          colunasConfiguraveis
          aoClicarLinha={editarUnidade}
          vazio={{
            title: 'Nenhuma unidade comercial encontrada',
            message: 'Cadastre a primeira unidade do empreendimento para liberar reservas, vendas e recebimentos.'
          }}
          acoesLinha={(item) => item.ativo !== false ? (
            <>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => editarUnidade(item)}
              >
                Editar
              </button>
              <button
                type="button"
                className="btn btn-outline btn-sm text-rose-700"
                onClick={() => {
                  setUnidadeExclusao(item);
                  setMotivoExclusao('');
                }}
              >
                Excluir
              </button>
            </>
          ) : null}
        />
      </BlocoConteudo>

      {unidadeExclusao && (
        <ModalPortal
          onClose={() => {
            if (deleting) return;
            setUnidadeExclusao(null);
            setMotivoExclusao('');
          }}
          closeOnEscape={!deleting}
        >
          <div className="app-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="excluir-unidade-titulo">
            <div className="app-modal-surface app-modal-surface--compact p-5">
              <h2 id="excluir-unidade-titulo" className="text-lg font-semibold text-[var(--c-text)]">
                Excluir unidade {unidadeExclusao.codigo}
              </h2>
              <p className="mt-1 text-sm text-[var(--c-muted)]">
                A unidade deixara de aparecer em novos contratos e tabelas. O cadastro permanecera preservado para auditoria.
              </p>
              <label className="mt-4 block">
                <span className="sol-filter-label">Motivo da exclusao *</span>
                <textarea
                  className="input mt-1 min-h-[96px] w-full"
                  value={motivoExclusao}
                  maxLength={500}
                  onChange={(event) => setMotivoExclusao(event.target.value)}
                  placeholder="Explique por que esta unidade deve ser excluida."
                  autoFocus
                />
              </label>
              <div className="mt-5 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={deleting}
                  onClick={() => {
                    setUnidadeExclusao(null);
                    setMotivoExclusao('');
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={deleting || !motivoExclusao.trim()}
                  onClick={handleExcluirUnidade}
                >
                  {deleting ? 'Excluindo...' : 'Confirmar exclusao'}
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </Pagina>
  );
}
