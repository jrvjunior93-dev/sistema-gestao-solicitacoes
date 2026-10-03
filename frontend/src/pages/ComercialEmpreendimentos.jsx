import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {
  atualizarEmpreendimentoComercial,
  criarEmpreendimentoComercial,
  getEmpreendimentosComerciais,
  getObrasComerciais
} from '../services/comercial';
import { maskCep, onlyDigits } from '../utils/formatters';

function defaultForm() {
  return {
    id: null,
    obra_id: '',
    codigo: '',
    nome: '',
    descricao: '',
    endereco: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    ativo: true
  };
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function pickForm(item = {}) {
  return {
    id: item.id || null,
    obra_id: item.obra_id ? String(item.obra_id) : '',
    codigo: item.codigo || '',
    nome: item.nome || '',
    descricao: item.descricao || '',
    endereco: item.endereco || '',
    numero: item.numero || '',
    bairro: item.bairro || '',
    cidade: item.cidade || '',
    estado: item.estado || '',
    cep: maskCep(item.cep),
    ativo: item.ativo !== false
  };
}

export default function ComercialEmpreendimentos() {
  const [form, setForm] = useState(defaultForm());
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [obras, setObras] = useState([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // R22: hook usado é hook importado — o useRef está no import acima. A
  // referência serve à ação da faixa fixa e ao "Editar" da linha (levar o
  // foco ao formulário, que fica ACIMA da lista), não a medida nenhuma.
  const campoNomeRef = useRef(null);
  // R3/R19: a faixa de aviso do sistema no lugar do <div> de erro montado à
  // mão — mesmo tom semântico, fechável, e medível pelo harness.
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setLoading(true);
      const [empreendimentosData, obrasData] = await Promise.all([
        getEmpreendimentosComerciais(),
        getObrasComerciais()
      ]);
      setEmpreendimentos(Array.isArray(empreendimentosData) ? empreendimentosData : []);
      setObras(Array.isArray(obrasData) ? obrasData : []);
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao carregar empreendimentos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const listaFiltrada = useMemo(() => {
    const termo = normalizeSearch(busca);
    if (!termo) return empreendimentos;
    return empreendimentos.filter((item) => {
      const blob = normalizeSearch([
        item.nome,
        item.codigo,
        item.cidade,
        item.estado,
        item.obra?.nome
      ].filter(Boolean).join(' '));
      return blob.includes(termo);
    });
  }, [busca, empreendimentos]);

  // O formulário fica ACIMA da lista: sem levar o foco até ele, clicar em
  // "Editar" no fim de uma lista longa não muda nada na tela que a pessoa
  // está vendo — a edição acontece fora do campo de visão (R15: capacidade
  // sem sinal não existe).
  function focarFormulario() {
    campoNomeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll: quem rola é o scrollIntoView suave; sem ele o foco dá
    // um salto seco por cima da rolagem.
    campoNomeRef.current?.focus({ preventScroll: true });
  }

  function novoEmpreendimento() {
    setForm(defaultForm());
    focarFormulario();
  }

  function editarEmpreendimento(item) {
    setForm(pickForm(item));
    focarFormulario();
  }

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      setSaving(true);

      const nome = String(form.nome || '').trim();
      if (!nome) {
        avisar.erro('Informe o nome do empreendimento.');
        return;
      }

      const payload = {
        obra_id: form.obra_id ? Number(form.obra_id) : undefined,
        codigo: form.codigo,
        nome,
        descricao: form.descricao,
        endereco: form.endereco,
        numero: form.numero,
        bairro: form.bairro,
        cidade: form.cidade,
        estado: form.estado,
        cep: onlyDigits(form.cep),
        ativo: form.ativo
      };

      if (form.id) {
        await atualizarEmpreendimentoComercial(form.id, payload);
      } else {
        await criarEmpreendimentoComercial(payload);
      }

      setForm(defaultForm());
      avisar.sucesso('Empreendimento salvo.');
      await carregar();
    } catch (err) {
      avisar.erro(err?.message || 'Erro ao salvar empreendimento');
    } finally {
      setSaving(false);
    }
  }

  /*
    R1/R17 — a lista era um <article> por registro, com os campos soltos em
    <span>: sem colunas declaradas, sem redimensionamento e sem largura
    salva por usuário. Toda listagem de registros é TabelaPadrao, e cada
    coluna declara o que ELA É (`tipo`) — a medida e o alinhamento são do
    componente (R1/R10/R14). Nenhum dado do card saiu: código, obra, cidade,
    endereço, descrição e situação continuam na tela, agrupados em
    CelulaDupla onde eram dois dados da mesma família.
  */
  const colunas = [
    {
      id: 'empreendimento',
      titulo: 'Empreendimento',
      // R17: IDENTIDADE — o nome é o que nomeia o registro desta lista
      // (o código é secundário e vai como sub da mesma célula).
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <CelulaDupla principal={item.nome} sub={item.codigo ? `Cód. ${item.codigo}` : null} />
      )
    },
    {
      id: 'obra',
      titulo: 'Obra vinculada',
      tipo: 'texto',
      render: (item) => item.obra?.nome || 'Sem vinculo'
    },
    {
      id: 'local',
      titulo: 'Localização',
      tipo: 'texto',
      render: (item) => (
        <CelulaDupla
          principal={[item.cidade, item.estado].filter(Boolean).join(' / ') || '-'}
          sub={[item.endereco, item.numero].filter(Boolean).join(', ') || null}
        />
      )
    },
    {
      id: 'descricao',
      titulo: 'Descrição',
      tipo: 'texto',
      // T6: texto longo trunca com o texto completo no tooltip.
      render: (item) => (
        <span title={item.descricao || undefined}>{item.descricao || '-'}</span>
      )
    },
    {
      id: 'situacao',
      titulo: 'Situação',
      tipo: 'status',
      // R25: o par bg-emerald-100/text-emerald-700 (e o bg-slate-100 do
      // inativo) era paleta crua — sem par no tema escuro e fora do piso de
      // contraste. O StatusBadge resolve família, ícone e cor por token.
      render: (item) => <StatusBadge status={item.ativo ? 'Ativo' : 'Inativo'} />
    }
  ];

  return (
    <Pagina>
      {/* R13/C1/R5: o cabeçalho era `app-page-header` cru (faixa sem
          compactação) com o apoio num `page-subtitle` solto. Título,
          contagem e apoio passam a viver no PageHeader, na faixa fixa que
          compacta e não some — e a ação principal fica a um clique mesmo no
          fim da lista. */}
      <PageHeader
        titulo="Empreendimentos"
        contagem={loading ? null : `${listaFiltrada.length} empreendimento(s)`}
        descricao="Base comercial para agrupar unidades, contratos de venda e carteira do cliente."
        acaoPrincipal={{ rotulo: 'Novo empreendimento', onClick: novoEmpreendimento }}
      />

      {/* R16: UM dono para a faixa de avisos, logo abaixo do cabeçalho —
          vista tanto por quem cadastra quanto por quem lê a lista. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        O critério da R9 não é a frequência do cadastro: é o que a tela
        existe para fazer. Esta tela existe PARA cadastrar empreendimentos —
        pelo teste da regra, tirando o formulário sobra uma lista que
        ninguém abriria por si só. Em tela assim o modal é atrito: obriga a
        abrir e fechar para fazer exatamente aquilo que a pessoa veio fazer.
        Modal fica reservado ao cadastro que INTERROMPE outro trabalho.
        Não mover para OverlayModal: cinco telas foram movidas por essa
        leitura errada em 04/09 e tiveram de voltar.

        ARRANJO — empilhado, e não nas duas colunas de antes: as colunas
        vinham de um grid com largura em px (`xl:grid-cols-[440px_...]`),
        que é medida à mão (R10), e espremiam a listagem em meia tela. A
        tabela precisa da largura inteira; a ordem de leitura passa a ser a
        ordem do trabalho (cadastrar → conferir a lista).
      */}
      <BlocoConteudo titulo={form.id ? 'Editar empreendimento' : 'Novo empreendimento'}>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Obra vinculada" span={2} hint="Vinculo operacional opcional.">
              {/* R12: select de FORMULÁRIO (entrada de dado do registro),
                  não filtro de lista — segue legítimo. */}
              <select
                className="input w-full"
                value={form.obra_id}
                onChange={(event) => setForm((current) => ({ ...current, obra_id: event.target.value }))}
              >
                <option value="">Sem vínculo operacional</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome}
                  </option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Nome" obrigatorio span={2}>
              <input
                ref={campoNomeRef}
                className="input w-full"
                value={form.nome}
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
                required
                placeholder="Nome do empreendimento"
              />
            </CampoForm>

            <CampoForm label="Código">
              <input
                className="input w-full"
                value={form.codigo}
                onChange={(event) => setForm((current) => ({ ...current, codigo: event.target.value }))}
                placeholder="Ex.: EMP-001"
              />
            </CampoForm>

            <CampoForm label="UF">
              <input
                className="input w-full"
                maxLength={2}
                value={form.estado}
                onChange={(event) => setForm((current) => ({ ...current, estado: event.target.value.toUpperCase() }))}
                placeholder="UF"
              />
            </CampoForm>

            <CampoForm label="Descrição" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[96px]` que estava aqui. */}
              <textarea
                className="input w-full"
                value={form.descricao}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
                placeholder="Resumo comercial e operacional"
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Endereço" colunas={2}>
            <CampoForm label="Endereço" span={2}>
              <input
                className="input w-full"
                value={form.endereco}
                onChange={(event) => setForm((current) => ({ ...current, endereco: event.target.value }))}
                placeholder="Rua / avenida"
              />
            </CampoForm>
            <CampoForm label="Número">
              <input
                className="input w-full"
                value={form.numero}
                onChange={(event) => setForm((current) => ({ ...current, numero: event.target.value }))}
                placeholder="Número"
              />
            </CampoForm>
            <CampoForm label="Bairro">
              <input
                className="input w-full"
                value={form.bairro}
                onChange={(event) => setForm((current) => ({ ...current, bairro: event.target.value }))}
                placeholder="Bairro"
              />
            </CampoForm>
            <CampoForm label="Cidade">
              <input
                className="input w-full"
                value={form.cidade}
                onChange={(event) => setForm((current) => ({ ...current, cidade: event.target.value }))}
                placeholder="Cidade"
              />
            </CampoForm>
            <CampoForm label="CEP">
              <input
                className="input w-full"
                value={form.cep}
                onChange={(event) => setForm((current) => ({ ...current, cep: maskCep(event.target.value) }))}
                placeholder="CEP"
              />
            </CampoForm>
            <div className="form-campo--linha">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(event) => setForm((current) => ({ ...current, ativo: event.target.checked }))}
                />
                Empreendimento ativo
              </label>
            </div>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Salvando...' : (form.id ? 'Salvar alteracoes' : 'Criar empreendimento')}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setForm(defaultForm())}>
              Limpar
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Empreendimentos cadastrados"
        descricao="Estrutura comercial pronta para unidades, reservas e contratos."
        variante="primario"
        cor="var(--c-primary)"
      >
        {/*
          R3: a busca ocupa a faixa — `.app-busca` cresce de 220 a 480px e
          nunca fica pequena com vazio ao lado; antes era `input w-full`.
          Ela vale AQUI porque este é o campo de busca de verdade da tela
          (recorta a listagem inteira): `.app-busca` é classe de LARGURA, não
          de papel — pô-la num campo que não busca é o engano que já quebrou
          duas telas deste projeto.
          R16/F1: é a ÚNICA busca deste contexto. Não há BarraFiltros porque
          não há dimensão de recorte marcável nesta tela — só busca textual.
        */}
        {/* F4: o vão entre a busca e a tabela é um degrau da escala (16px),
            o mesmo que a BarraFiltros aplica sozinha nas telas que a usam. */}
        <div className="space-y-4">
          <input
            className="input app-busca"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            placeholder="Buscar nome, código, cidade ou obra"
            aria-label="Buscar nome, código, cidade ou obra"
          />

          {/* A1: a ação da linha é um <button> focável ("Editar"), e a linha
              inteira também é acionável por teclado (o TabelaPadrao dá
              tabIndex + Enter/Espaço quando recebe aoClicarLinha). */}
          <TabelaPadrao
            colunas={colunas}
            itens={listaFiltrada}
            carregando={loading}
            getId={(item) => item.id}
            storageKey="tabela:comercial-empreendimentos"
            rotuloRolagem="Empreendimentos cadastrados"
            larguraAcoes={110}
            colunasConfiguraveis
            aoClicarLinha={editarEmpreendimento}
            vazio={{
              title: 'Nenhum empreendimento encontrado',
              message: 'Cadastre o primeiro empreendimento para liberar unidades, reservas e contratos.'
            }}
            acoesLinha={(item) => (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => editarEmpreendimento(item)}
              >
                Editar
              </button>
            )}
          />
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
