import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  PageHeader,
  Pagina,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useFiltrosVisiveis
} from '../components/padrao';
import {
  criarModeloContratoComercial,
  getEmpreendimentosComerciais,
  getModelosContratoComercial
} from '../services/comercial';

const DESCRICAO = 'Modelos DOCX por empreendimento para gerar contrato e quadro resumo com o papel timbrado correto.';

const TIPOS_DOCUMENTO_MODELO = [
  { value: 'CONTRATO', label: 'Contrato padrão' },
  { value: 'QUADRO_RESUMO', label: 'Quadro resumo' }
];

function defaultModeloForm() {
  return {
    empreendimento_id: '',
    tipo_documento: 'CONTRATO',
    nome: '',
    descricao: '',
    file: null
  };
}

function documentoTipoLabel(tipo) {
  return TIPOS_DOCUMENTO_MODELO.find((item) => item.value === String(tipo || '').toUpperCase())?.label || tipo || '-';
}

/*
  QUAIS FILTROS APARECEM (N53) — a declaração desta tela para o painel
  único de `PainelFiltrosVisiveis`, no molde do painel "Colunas" da
  TabelaPadrao.

  NENHUM `padrao: false`: todos os filtros continuam VISÍVEIS na primeira
  abertura. Só três telas têm conjunto inicial reduzido, e é o que o
  cliente aprovou nelas — aqui o seletor apenas passa a EXISTIR, para quem
  quiser mexer. Esconder por padrão mudaria o que a pessoa vê sem ela ter
  pedido.

  `obrigatorio` na busca livre: é o único caminho para achar um registro
  pelo que a pessoa lembra dele. Mesma família da coluna de identidade
  travada da TabelaPadrao — aparece na lista, marcada e sem desmarcar.
*/
const FILTROS_DA_TELA = [
  { id: 'q', rotulo: 'Busca', obrigatorio: true },
  { id: 'empreendimento', rotulo: 'Empreendimento' },
  { id: 'tipo', rotulo: 'Tipo de documento' }
];

export default function ComercialModelosContrato() {
  const [empreendimentos, setEmpreendimentos] = useState([]);
  const [modelos, setModelos] = useState([]);
  const [form, setForm] = useState(defaultModeloForm());
  // R12: o recorte da lista é um CONJUNTO por dimensão (vazio = todas), e
  // não a escolha única de um select — a BarraFiltros mostra o que está
  // filtrando em etiquetas removíveis.
  const [filtros, setFiltros] = useState({ q: '', empreendimento: new Set(), tipo: new Set() });
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => {
      const valor = filtros[filtro.id];
      return valor instanceof Set ? valor.size > 0 : String(valor ?? '').trim() !== '';
    }).map((filtro) => filtro.id),
    [filtros]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:comercial-modelos-contrato', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      setFiltros((atual) => ({ ...atual, [id]: atual[id] instanceof Set ? new Set() : '' }));
    }
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // O <input type="file"> é NÃO CONTROLADO: zerar `form.file` no estado não
  // limpa o nome do arquivo que o campo mostra. Sem remontar o CAMPO, a tela
  // ficava exibindo o DOCX já enviado e recusava o próximo envio com
  // "Selecione um arquivo DOCX" — campo cheio, erro de campo vazio.
  // A chave fica só no input do arquivo, e não no <form>: remontar o
  // formulário inteiro descartaria o nó que o `campoEmpreendimentoRef`
  // aponta, e a ação "Novo modelo" levaria o foco a um elemento prestes a
  // sair da tela.
  const [versaoArquivo, setVersaoArquivo] = useState(0);
  // R3/R19: erro de carga e de gravação viram faixa do sistema (Avisos), que
  // tem superfície própria e sobrevive ao estado de carregamento (B5).
  const { avisos, avisar, fechar } = useAvisos();
  // R22: hook usado é hook importado — o useRef está no import acima. Serve
  // à ação da faixa fixa (levar o foco ao formulário), não a medida nenhuma.
  const campoEmpreendimentoRef = useRef(null);

  async function carregar() {
    try {
      setLoading(true);
      const [empreData, modelosData] = await Promise.all([
        getEmpreendimentosComerciais({ ativo: 1 }),
        getModelosContratoComercial()
      ]);
      setEmpreendimentos(Array.isArray(empreData) ? empreData : []);
      setModelos(Array.isArray(modelosData) ? modelosData : []);
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao carregar modelos de contrato');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const modelosFiltrados = useMemo(() => {
    const busca = filtros.q.trim().toLowerCase();
    return modelos.filter((modelo) => {
      if (filtros.empreendimento.size && !filtros.empreendimento.has(String(modelo.empreendimento_id))) return false;
      if (filtros.tipo.size && !filtros.tipo.has(String(modelo.tipo_documento || '').toUpperCase())) return false;
      if (!busca) return true;
      const alvo = [modelo.nome, modelo.descricao, modelo.empreendimento?.nome]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return alvo.includes(busca);
    });
  }, [filtros, modelos]);

  // A ação da faixa fixa não abre nada: o formulário já está na tela (R9).
  // Ela limpa o rascunho e LEVA O FOCO até ele — o que serve para quem está
  // no fim de uma lista longa (R13: a ação principal a um clique).
  function irParaCadastro() {
    setForm(defaultModeloForm());
    setVersaoArquivo((atual) => atual + 1);
    campoEmpreendimentoRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    campoEmpreendimentoRef.current?.focus({ preventScroll: true });
  }

  async function handleSalvarModelo(event) {
    event.preventDefault();
    if (!form.file) {
      avisar.erro('Selecione um arquivo DOCX para o modelo.');
      return;
    }

    try {
      setSaving(true);
      await criarModeloContratoComercial(form);
      setForm(defaultModeloForm());
      setVersaoArquivo((atual) => atual + 1);
      avisar.sucesso('Modelo de contrato cadastrado.');
      await carregar();
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao salvar modelo de contrato');
    } finally {
      setSaving(false);
    }
  }

  /*
    R1/R17 — a listagem virou TabelaPadrao.

    Os cards à mão traziam quatro dados por registro (tipo, nome,
    empreendimento e descrição) sempre nos mesmos lugares: é uma lista
    tabular desenhada como card. Na tabela o nome trunca com reticências e
    leva o texto completo no tooltip (T6, pela CelulaDupla), a largura de
    cada coluna vem do `tipo` e não da tela (R1/R10), e no celular o MESMO
    markup vira card (X1).
  */
  const colunas = [
    {
      id: 'modelo',
      titulo: 'Modelo',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (modelo) => (
        <CelulaDupla
          principal={modelo.nome || 'Sem nome interno'}
          sub={modelo.descricao || null}
        />
      )
    },
    {
      id: 'empreendimento',
      titulo: 'Empreendimento',
      tipo: 'texto',
      // A sobra da linha vai para a coluna de identidade (R1).
      flex: false,
      render: (modelo) => modelo.empreendimento?.nome || 'Empreendimento nao informado'
    },
    {
      id: 'tipo_documento',
      titulo: 'Tipo de documento',
      tipo: 'texto',
      flex: false,
      render: (modelo) => documentoTipoLabel(modelo.tipo_documento)
    }
  ];

  /*
    B5 — no carregamento a tela também tem cabeçalho e superfície.

    Antes o estado de carga devolvia um card solto sobre o canvas: sem faixa
    fixa, sem título e sem nenhum lugar onde um erro de carga pudesse
    aparecer. A `contagem` fica NULA de propósito: passar `0` afirmaria "0
    modelos", e a tela ainda não sabe quantos são.
  */
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Modelos de contrato" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Modelos cadastrados" variante="primario" cor="var(--module-comercial)">
          <p className="app-note">Carregando modelos de contrato...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C1/C2/R5/R13: título, contagem e apoio na faixa fixa do topo, com
          superfície própria — o <p class="page-subtitle"> solto sobre o
          canvas saiu. O ritmo vertical da raiz é do Pagina (R10). */}
      <PageHeader
        titulo="Modelos de contrato"
        contagem={`${modelosFiltrados.length} de ${modelos.length} modelo(s)`}
        descricao={DESCRICAO}
        acaoPrincipal={{ rotulo: 'Novo modelo', onClick: irParaCadastro }}
      />

      {/* R16: UM dono para a faixa de avisos — logo abaixo do cabeçalho,
          onde ela é vista tanto pelo cadastro quanto pela lista. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        "Páginas de modelo" é o exemplo literal da coluna "a tela existe PARA
        cadastrar" da tabela da R9. Tire o formulário daqui e o que sobra é
        uma lista de arquivos que ninguém abriria por si só. Modal fica
        reservado ao cadastro que INTERROMPE outro trabalho.
      */}
      <BlocoConteudo titulo="Novo modelo">
        <form className="space-y-4" onSubmit={handleSalvarModelo}>
          <p className="app-note">
            Envie DOCX com variaveis no formato {'{{cliente.nome}}'}; o sistema usa o empreendimento e tipo
            selecionados na geracao.
          </p>

          {/* R12: estes selects são ENTRADA DE DADO (o que se está
              cadastrando), não recorte de lista — select de formulário
              segue legítimo. */}
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Empreendimento" obrigatorio>
              <select
                ref={campoEmpreendimentoRef}
                className="input w-full"
                value={form.empreendimento_id}
                onChange={(event) => setForm((current) => ({ ...current, empreendimento_id: event.target.value }))}
                required
              >
                <option value="">Selecione</option>
                {empreendimentos.map((item) => <option key={item.id} value={item.id}>{item.nome}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Tipo de documento">
              <select
                className="input w-full"
                value={form.tipo_documento}
                onChange={(event) => setForm((current) => ({ ...current, tipo_documento: event.target.value }))}
              >
                {TIPOS_DOCUMENTO_MODELO.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </CampoForm>
            <CampoForm label="Nome interno" hint="Ex.: Contrato Costa do Mar">
              <input
                className="input w-full"
                value={form.nome}
                onChange={(event) => setForm((current) => ({ ...current, nome: event.target.value }))}
              />
            </CampoForm>
            <CampoForm label="Arquivo DOCX" obrigatorio>
              <input
                key={versaoArquivo}
                className="input w-full"
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={(event) => setForm((current) => ({ ...current, file: event.target.files?.[0] || null }))}
                required
              />
            </CampoForm>
            <CampoForm
              label="Descrição"
              tipo="texto-longo"
              hint="Observacao para identificar quando usar este modelo."
            >
              <input
                className="input w-full"
                value={form.descricao}
                onChange={(event) => setForm((current) => ({ ...current, descricao: event.target.value }))}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Enviando...' : 'Salvar modelo'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Modelos cadastrados"
        descricao="Revise quais arquivos ficam disponíveis para cada empreendimento."
        variante="primario"
        cor="var(--module-comercial)"
      >
        {/* R12/R3: busca larga em cima + filtros por marcação com etiquetas
            removíveis — os dois <select> de recorte saíram. O filtro aplica
            ao marcar (R23: uma dimensão local, nada de botão "aplicar"). */}
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('q') ? {
            valor: filtros.q,
            aoMudar: (valor) => setFiltros((prev) => ({ ...prev, q: valor })),
            placeholder: 'Buscar por nome, descrição ou empreendimento'
          } : null}
          filtros={[
            {
              id: 'empreendimento',
              rotulo: 'Empreendimento',
              opcoes: empreendimentos.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
            },
            {
              id: 'tipo',
              rotulo: 'Tipo de documento',
              opcoes: TIPOS_DOCUMENTO_MODELO.map((item) => ({ valor: item.value, rotulo: item.label }))
            }
          ].filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={{ empreendimento: filtros.empreendimento, tipo: filtros.tipo }}
          aoAlternar={(dim, valor, opcoes) => setFiltros((prev) => ({
            ...alternarValorFiltro(prev, dim, valor, opcoes),
            q: prev.q
          }))}
          aoLimpar={() => setFiltros((prev) => ({ ...prev, empreendimento: new Set(), tipo: new Set() }))}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={colunas}
          itens={modelosFiltrados}
          storageKey="tabela:comercial-modelos-contrato"
          rotuloRolagem="Modelos de contrato"
          vazio={{
            title: 'Nenhum modelo encontrado',
            message: 'Cadastre um DOCX acima para o empreendimento gerar contrato e quadro resumo com o papel timbrado correto.'
          }}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
