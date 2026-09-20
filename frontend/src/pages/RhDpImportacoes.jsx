import { useEffect, useMemo, useRef, useState } from 'react';
import { HiOutlineEye } from 'react-icons/hi2';
import {
  Avisos,
  BarraFiltros,
  BlocoConteudo,
  CampoForm,
  CelulaDupla,
  FormSecao,
  PageHeader,
  Pagina,
  StatGrid,
  StatTile,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../contexts/AuthContext';
import { getObras } from '../services/obras';
import {
  confirmarRhImportacao,
  criarPreviewRhImportacao,
  getRhEmpresasGrupo,
  getRhImportacao,
  getRhImportacoes
} from '../services/rhDp';
import { canExecuteRhDpImportacoes } from '../utils/acessoProduto';
import { downloadRhImportTemplate } from '../utils/rhImportacaoPlanilha';

const TIPOS_IMPORTACAO = [
  { value: 'JORNADA', label: 'Jornada' },
  { value: 'EVENTO_VARIAVEL', label: 'Evento variável' },
  { value: 'DESCONTO', label: 'Desconto' }
];

const VINCULOS = [
  { value: 'CLT', label: 'CLT' },
  { value: 'NAO_CLT', label: 'Não CLT' }
];

// Só estes três valem como FILTRO: o validador do serviço
// (backend/src/validators/rhValidators.js, RH_STATUS_IMPORTACAO) recusa
// qualquer outro na consulta. O catálogo de EXIBIÇÃO é outro (abaixo) e é
// maior — a base tem lotes SUBSTITUIDA gravados pelo formulário de jornada.
const STATUS_LOTE = [
  { value: 'PREVIEW', label: 'Preview' },
  { value: 'CONFIRMADA', label: 'Confirmada' },
  { value: 'CANCELADA', label: 'Cancelada' }
];

/*
  Status é ETIQUETA (StatusBadge/`fx-badge`), não texto solto na célula.

  Por que isto é conserto e não enfeite: a célula de `tipo: 'status'` não
  ganha `white-space: nowrap` de ninguém — `.resizable-table td` traz
  `overflow: hidden; text-overflow: ellipsis` SEM `nowrap`, então texto puro
  que não cabe QUEBRA NO MEIO DA PALAVRA ("CONFIRM/ADA", "SUBSTITU/IDA",
  medido nas capturas de 1920 e 1366). Quebra não aumenta `scrollWidth`, e
  por isso o T6 do harness — que compara `scrollWidth` com `clientWidth` —
  passava com o defeito na tela. A pílula resolve na raiz: `fx-badge` tem
  `white-space: nowrap` + `overflow: clip` próprios (design-tokens.css) e o
  texto dela é de 12px, mais estreito que os 14px da célula.

  O rótulo humano ("Confirmada" no lugar de CONFIRMADA) é o mesmo critério
  já aplicado ao tipo por `rotuloTipo`: quem lê a tela vê o rótulo do
  catálogo. De quebra, caixa mista é mais estreita que caixa alta e a
  pílula inteira passa a caber nos 132px que o componente reserva para a
  coluna de status.

  `tom` só onde a classificação automática de `familiaSemanticaDoStatus`
  erraria: "Válida" não casa com nenhum padrão de sucesso e "Substituída"
  não casa com nenhum padrão de arquivamento.
*/
const STATUS_LOTE_EXIBICAO = {
  PREVIEW: { rotulo: 'Preview' },
  CONFIRMADA: { rotulo: 'Confirmada' },
  CANCELADA: { rotulo: 'Cancelada' },
  SUBSTITUIDA: { rotulo: 'Substituída', tom: 'neutral' }
};

const STATUS_LINHA_EXIBICAO = {
  VALIDA: { rotulo: 'Válida', tom: 'success' },
  ERRO: { rotulo: 'Erro' },
  CONFIRMADA: { rotulo: 'Confirmada' }
};

function EtiquetaStatus({ valor, catalogo }) {
  if (!valor) return '-';
  const item = catalogo[String(valor).toUpperCase()];
  return <StatusBadge status={item?.rotulo || valor} kind={item?.tom} />;
}

const IMPORTACAO_PAYLOAD_COLUMNS = {
  JORNADA: [
    { key: 'dias_trabalhados', label: 'Dias trabalhados' },
    { key: 'faltas', label: 'Faltas' },
    { key: 'horas_extras', label: 'Horas extras' },
    { key: 'adicionais', label: 'Adicionais' },
    { key: 'descontos_informados', label: 'Descontos' },
    { key: 'valor_informado', label: 'Valor informado' },
    { key: 'observacoes', label: 'Observações' }
  ],
  EVENTO_VARIAVEL: [
    { key: 'codigo_evento', label: 'Código' },
    { key: 'descricao_evento', label: 'Descrição' },
    { key: 'natureza', label: 'Natureza' },
    { key: 'valor', label: 'Valor' },
    { key: 'referencia', label: 'Referência' },
    { key: 'observacoes', label: 'Observações' }
  ],
  DESCONTO: [
    { key: 'codigo_evento', label: 'Código' },
    { key: 'descricao_evento', label: 'Descrição' },
    { key: 'valor', label: 'Valor' },
    { key: 'referencia', label: 'Referência' },
    { key: 'observacoes', label: 'Observações' }
  ]
};

// R17 — as colunas do PREVIEW mudam com o tipo do arquivo importado
// (jornada, evento variavel, desconto). O papel de cada uma é derivado do
// nome do campo, aqui no ponto de uso, para que nenhuma coluna gerada chegue
// à tabela sem `tipo` (a medida e o alinhamento saem dele).
const REGRAS_TIPO_PAYLOAD = [
  [/(observ|descricao|referencia)/i, 'texto'],
  [/natureza/i, 'badge'],
  [/^codigo/i, 'codigo'],
  [/(valor|adicionais|descontos)/i, 'valor'],
  [/(dias|faltas|horas|quantidade)/i, 'numero']
];

function tipoDaColunaPayload(chave) {
  const regra = REGRAS_TIPO_PAYLOAD.find(([padrao]) => padrao.test(chave));
  return regra ? regra[1] : 'texto';
}

// O tipo chega do serviço em caixa alta (EVENTO_VARIAVEL); quem lê a tela
// vê o rótulo do catálogo — mesmo texto da lista de escolha e do modelo.
function rotuloTipo(tipo) {
  const item = TIPOS_IMPORTACAO.find((opcao) => opcao.value === tipo);
  return item ? item.label : (tipo || '-');
}

function rotuloObra(obra) {
  if (!obra) return null;
  return obra.codigo ? `${obra.codigo} - ${obra.nome}` : obra.nome;
}

// O serviço de importações recebe UM valor por recorte
// (`tipo`, `obra_id`, `status`…). Por isso cada dimensão da BarraFiltros
// declara `unico: true`: marcar outro valor SUBSTITUI o anterior. Sem isso
// duas marcas viravam etiqueta na tela e filtro nenhum no servidor.
function valorUnico(conjunto) {
  return conjunto && conjunto.size === 1 ? conjunto.values().next().value : undefined;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString('pt-BR');
}

function formatPayloadValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') return value.toLocaleString('pt-BR');
  return String(value);
}

function firstFilled(...values) {
  return values.find((value) => value !== null && value !== undefined && String(value).trim() !== '') || '-';
}

function getLinhaColaboradorCodigo(linha) {
  const payload = linha?.payload_json || {};

  return firstFilled(
    linha?.matricula_ref,
    linha?.codigo_ref,
    payload.matricula,
    payload.Matricula,
    payload.codigo_colaborador,
    payload.Codigo_Colaborador,
    payload.codigo,
    payload.Codigo,
    linha?.colaborador?.matricula,
    linha?.colaborador?.codigo,
    linha?.cpf_ref,
    payload.cpf,
    payload.CPF
  );
}

function getLinhaColaboradorNome(linha) {
  const payload = linha?.payload_json || {};

  return firstFilled(
    linha?.colaborador?.nome,
    linha?.nome_ref,
    payload.nome_colaborador,
    payload.Nome_Colaborador,
    payload.nome,
    payload.Nome
  );
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
*/
const FILTROS_DA_TELA = [
  { id: 'competencia', rotulo: 'Competência' },
  { id: 'tipo', rotulo: 'Tipo' },
  { id: 'empresa_grupo_id', rotulo: 'Empresa do grupo' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'tipo_vinculo', rotulo: 'Vínculo' },
  { id: 'status', rotulo: 'Status' }
];

export default function RhDpImportacoes() {
  const { user } = useAuth();
  const podeEditar = canExecuteRhDpImportacoes(user);
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [carregandoBase, setCarregandoBase] = useState(false);
  const [carregandoLista, setCarregandoLista] = useState(false);
  const [gerandoPreview, setGerandoPreview] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [importacoes, setImportacoes] = useState([]);
  const [detalhe, setDetalhe] = useState(null);
  // A ação primária do cabeçalho abre o seletor de arquivo; o input fica no
  // bloco do lote (é dele que os campos do envio saem).
  const inputArquivoRef = useRef(null);

  // Colunas do preview vindas do arquivo: id/titulo do catalogo, papel
  // derivado do nome do campo (ver REGRAS_TIPO_PAYLOAD).
  const colunasPayload = useMemo(
    () => (IMPORTACAO_PAYLOAD_COLUMNS[detalhe?.tipo] || []).map((column) => ({
      id: column.key,
      titulo: column.label,
      tipo: tipoDaColunaPayload(column.key),
      render: (linha) => formatPayloadValue(linha.payload_json?.[column.key])
    })),
    [detalhe]
  );
  const [filtros, setFiltros] = useState({
    competencia: '',
    tipo: new Set(),
    empresa_grupo_id: new Set(),
    obra_id: new Set(),
    tipo_vinculo: new Set(),
    status: new Set()
  });
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
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-importacoes:lotes', FILTROS_DA_TELA, {
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
  const [form, setForm] = useState({
    tipo: 'JORNADA',
    competencia: '',
    empresa_grupo_id: '',
    obra_id: '',
    tipo_vinculo: '',
    observacoes: ''
  });

  // R12/R16: os seis selects do cartão de filtros viram uma faixa só.
  // Competência é contínua e mora em `campos`; tipo, empresa, obra, vínculo
  // e status são enumeráveis e vão em `filtros`, com marcação e etiqueta.
  const dimensoesFiltro = useMemo(() => ([
    {
      id: 'tipo',
      rotulo: 'Tipo',
      unico: true,
      opcoes: TIPOS_IMPORTACAO.map((item) => ({ valor: item.value, rotulo: item.label }))
    },
    {
      id: 'empresa_grupo_id',
      rotulo: 'Empresa do grupo',
      unico: true,
      opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      unico: true,
      opcoes: obras.map((item) => ({ valor: String(item.id), rotulo: rotuloObra(item) }))
    },
    {
      id: 'tipo_vinculo',
      rotulo: 'Vínculo',
      unico: true,
      opcoes: VINCULOS.map((item) => ({ valor: item.value, rotulo: item.label }))
    },
    {
      id: 'status',
      rotulo: 'Status',
      unico: true,
      opcoes: STATUS_LOTE.map((item) => ({ valor: item.value, rotulo: item.label }))
    }
  ]), [empresas, obras]);

  useEffect(() => {
    carregarBase();
  }, []);

  // Filtro marcado aplica na hora (padrão Solicitações, R12); a competência
  // digitada espera 350ms para não martelar a API a cada tecla. É o mesmo
  // recarregar que o botão "Aplicar filtros" fazia.
  useEffect(() => {
    const atraso = setTimeout(() => {
      carregarImportacoes(filtros);
    }, 350);
    return () => clearTimeout(atraso);
  }, [filtros]);

  async function carregarBase() {
    try {
      setCarregandoBase(true);
      const [listaEmpresas, listaObras] = await Promise.all([
        getRhEmpresasGrupo({ ativo: true }),
        getObras()
      ]);

      setEmpresas(Array.isArray(listaEmpresas) ? listaEmpresas : []);
      setObras(Array.isArray(listaObras) ? listaObras : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar base de importações RH/DP');
    } finally {
      setCarregandoBase(false);
    }
  }

  async function carregarImportacoes(filtrosAtuais = filtros) {
    try {
      setCarregandoLista(true);
      const data = await getRhImportacoes({
        tipo: valorUnico(filtrosAtuais.tipo),
        competencia: filtrosAtuais.competencia || undefined,
        empresa_grupo_id: valorUnico(filtrosAtuais.empresa_grupo_id),
        obra_id: valorUnico(filtrosAtuais.obra_id),
        tipo_vinculo: valorUnico(filtrosAtuais.tipo_vinculo),
        status: valorUnico(filtrosAtuais.status)
      });

      setImportacoes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao filtrar importações RH/DP');
    } finally {
      setCarregandoLista(false);
    }
  }

  async function selecionarImportacao(id) {
    try {
      const data = await getRhImportacao(id);
      setDetalhe(data);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar detalhe da importação RH/DP');
    }
  }

  async function onSelecionarArquivo(event) {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;
    if (!form.competencia || !form.tipo || !form.obra_id) {
      avisar.alerta('Preencha tipo, competência e obra antes de subir a planilha.');
      return;
    }

    try {
      setGerandoPreview(true);
      const data = await criarPreviewRhImportacao({
        tipo: form.tipo,
        competencia: form.competencia,
        obra_id: form.obra_id,
        empresa_grupo_id: form.empresa_grupo_id || undefined,
        tipo_vinculo: form.tipo_vinculo || undefined,
        observacoes: form.observacoes || undefined,
        file
      });

      await carregarImportacoes();
      setDetalhe(data);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao gerar preview da importação RH/DP');
    } finally {
      setGerandoPreview(false);
    }
  }

  async function confirmarImportacao() {
    if (!detalhe?.id || detalhe?.status !== 'PREVIEW') {
      return;
    }

    // A confirmação congela as linhas válidas e fecha o lote — não há como
    // reabrir por esta tela. Ela NÃO apaga nem substitui dado já gravado
    // (o serviço só marca as linhas como CONFIRMADA), então não é
    // destrutiva: o rótulo diz o que acontece e o peso do botão é o normal.
    const totalValidas = Number(detalhe.total_validas || 0);
    const totalErros = Number(detalhe.total_erros || 0);
    const { ok } = await confirmar({
      titulo: 'Confirmar importação',
      mensagem: `Confirmar a importação #${detalhe.id} (${rotuloTipo(detalhe.tipo)}) da competência ${detalhe.competencia}? As ${totalValidas} linha(s) válidas ficam congeladas para os próximos blocos do RH/DP${totalErros ? ` e as ${totalErros} linha(s) com erro ficam de fora` : ''}. O lote não pode ser reaberto por esta tela.`,
      rotuloConfirmar: 'Confirmar importação'
    });
    if (!ok) return;

    try {
      setConfirmando(true);
      const atualizado = await confirmarRhImportacao(detalhe.id);
      setDetalhe(atualizado);
      await carregarImportacoes();
      avisar.sucesso(`Importação #${detalhe.id} confirmada.`);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao confirmar importação RH/DP');
    } finally {
      setConfirmando(false);
    }
  }

  return (
    <Pagina className="rhdp-page">
      {/* D6/D7: sem prefixo "RH/DP" no título e sem os links cruzados de
          navegação — o breadcrumb e o menu já situam o módulo (R11). Os três
          modelos de planilha são AÇÃO (baixar arquivo), não navegação. Eles
          ficavam no "⋯", que saiu do sistema (07/09): são botões visíveis,
          quatro na faixa, medidos em uma linha a 1920 e a 1366. */}
      <PageHeader
        titulo="Importações"
        contagem={`${importacoes.length} lote(s)`}
        descricao="Upload de jornadas, eventos variáveis e descontos com preview persistido, validação por linha e confirmação explícita."
        acaoPrincipal={podeEditar ? {
          rotulo: gerandoPreview ? 'Gerando preview...' : 'Selecionar planilha',
          onClick: () => inputArquivoRef.current?.click(),
          desabilitada: gerandoPreview
        } : undefined}
        secundarias={TIPOS_IMPORTACAO.map((item) => ({
          rotulo: `Modelo ${item.label}`,
          title: `Baixar o modelo CSV de ${item.label.toLowerCase()}`,
          onClick: () => downloadRhImportTemplate(item.value)
        }))}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* Formulário de AÇÃO (descreve o lote que está sendo enviado), não
          filtro: continua na tela, agora com rótulo por campo e medidas da
          escala. */}
      <BlocoConteudo
        titulo="Dados do lote"
        descricao="Valem para a próxima planilha selecionada: tipo, competência e obra são obrigatórios."
        variante="secundario"
      >
        <FormSecao colunas={3}>
          <CampoForm label="Tipo" obrigatorio>
            <select
              className="input w-full"
              value={form.tipo}
              onChange={(e) => setForm((prev) => ({ ...prev, tipo: e.target.value }))}
              disabled={!podeEditar}
            >
              {TIPOS_IMPORTACAO.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Competência" obrigatorio>
            <input
              type="month"
              className="input w-full"
              value={form.competencia}
              onChange={(e) => setForm((prev) => ({ ...prev, competencia: e.target.value }))}
              disabled={!podeEditar}
            />
          </CampoForm>
          <CampoForm label="Obra" obrigatorio>
            <select
              className="input w-full"
              value={form.obra_id}
              onChange={(e) => setForm((prev) => ({ ...prev, obra_id: e.target.value }))}
              disabled={!podeEditar}
              required
            >
              <option value="">Selecione a obra</option>
              {obras.map((item) => (
                <option key={item.id} value={item.id}>{rotuloObra(item)}</option>
              ))}
            </select>
          </CampoForm>
          {/*
            Decisão do cliente (02/09): o filtro "Empresa do grupo" do
            histórico era NATIMORTO — a tela nunca mandava `empresa_grupo_id`
            ao criar o lote, então todo lote nascia com o campo nulo e o
            filtro só podia devolver lista vazia. O backend aceita e persiste
            o campo (validateRhImportacaoCreateBody + rhImportacaoService);
            faltava a tela oferecê-lo. Opcional, como no backend.
          */}
          <CampoForm label="Empresa do grupo">
            <select
              className="input w-full"
              value={form.empresa_grupo_id}
              onChange={(e) => setForm((prev) => ({ ...prev, empresa_grupo_id: e.target.value }))}
              disabled={!podeEditar}
            >
              <option value="">Não informar</option>
              {empresas.map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Vínculo">
            <select
              className="input w-full"
              value={form.tipo_vinculo}
              onChange={(e) => setForm((prev) => ({ ...prev, tipo_vinculo: e.target.value }))}
              disabled={!podeEditar}
            >
              <option value="">Todos os vínculos</option>
              {VINCULOS.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Observações do lote" tipo="observacao">
            <textarea
              className="input w-full"
              rows={3}
              placeholder="Observações do lote"
              value={form.observacoes}
              onChange={(e) => setForm((prev) => ({ ...prev, observacoes: e.target.value }))}
              disabled={!podeEditar}
            />
          </CampoForm>
        </FormSecao>

        {podeEditar && (
          <input
            ref={inputArquivoRef}
            type="file"
            accept=".csv,.xls,.xlsx"
            className="hidden"
            onChange={onSelecionarArquivo}
            disabled={gerandoPreview}
          />
        )}
      </BlocoConteudo>

      {/*
        A proporção das duas colunas segue O CONTEÚDO, não um número fixo:
        sem lote escolhido o painel da direita carrega UMA frase e quem
        precisa de largura é a tabela de lotes; com lote escolhido o preview
        vira o bloco principal (resumo + tabela por linha) e a divisão fica
        equilibrada. Quem lê essa diferença é o CSS da classe (o piso da
        coluna da lista é o que a tabela pede) — a tela não escreve medida.
      */}
      <div className={`rhdp-importacoes-workspace${detalhe ? ' rhdp-importacoes-workspace--com-preview' : ''}`}>
        <BlocoConteudo titulo="Lotes enviados">
          <BarraFiltros
            campos={[{
              id: 'competencia',
              rotulo: 'Competência',
              tipo: 'month',
              valor: filtros.competencia,
              aoMudar: (valor) => setFiltros((atuais) => ({ ...atuais, competencia: valor }))
            }].filter((campo) => visibilidadeFiltros.ehVisivel(campo.id))}
            filtros={dimensoesFiltro.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
            ativos={{
              tipo: filtros.tipo,
              empresa_grupo_id: filtros.empresa_grupo_id,
              obra_id: filtros.obra_id,
              tipo_vinculo: filtros.tipo_vinculo,
              status: filtros.status
            }}
            aoAlternar={(dimensao, valor, opcoes) => setFiltros(
              (atuais) => alternarValorFiltro(atuais, dimensao, valor, opcoes)
            )}
            aoLimpar={() => setFiltros({
              competencia: '',
              tipo: new Set(),
              empresa_grupo_id: new Set(),
              obra_id: new Set(),
              tipo_vinculo: new Set(),
              status: new Set()
            })}
            visibilidade={visibilidadeFiltros}
          />

          <TabelaPadrao
            colunas={[
              {
                id: 'lote',
                titulo: 'Lote',
                // R17: o lote é nomeado pelo arquivo enviado (o numero sozinho
                // nao diz a quem procura o envio que deu errado).
                tipo: 'identidade',
                noCard: 'titulo',
                render: (item) => (
                  <CelulaDupla
                    principal={`#${item.id} · ${rotuloTipo(item.tipo)}`}
                    sub={item.nome_arquivo || '-'}
                  />
                )
              },
              {
                id: 'competencia',
                titulo: 'Competência',
                tipo: 'codigo',
                ordenavel: true,
                valorOrdenacao: (item) => String(item.competencia || ''),
                render: (item) => item.competencia
              },
              {
                id: 'obra',
                titulo: 'Obra',
                tipo: 'texto',
                render: (item) => rotuloObra(item.obra) || '-'
              },
              {
                id: 'status',
                titulo: 'Status',
                tipo: 'status',
                render: (item) => (
                  <EtiquetaStatus valor={item.status} catalogo={STATUS_LOTE_EXIBICAO} />
                )
              },
              {
                id: 'resultado',
                titulo: 'Resultado',
                tipo: 'texto',
                render: (item) => `${item.total_validas || 0} válida(s) · ${item.total_erros || 0} erro(s)`
              }
            ]}
            itens={importacoes}
            storageKey="tabela:rh-dp-importacoes:lotes"
            rotuloRolagem="Lotes de importação RH/DP"
            carregando={carregandoBase || carregandoLista}
            vazio="Nenhuma importação RH/DP localizada"
            linhaSelecionada={(item) => Number(detalhe?.id) === Number(item.id)}
            urgencia={(item) => (Number(item.total_erros || 0) > 0 ? 'danger' : null)}
            acoesLinha={(item) => (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => selecionarImportacao(item.id)}
                title="Ver preview"
                aria-label={`Ver preview da importação ${item.id}`}
              >
                <HiOutlineEye aria-hidden="true" />
              </button>
            )}
            larguraAcoes={120}
          />
        </BlocoConteudo>

        {/* O preview validado por linha é o bloco principal da tela. */}
        <BlocoConteudo
          titulo={detalhe
            ? `Importação #${detalhe.id} · ${rotuloTipo(detalhe.tipo)}`
            : 'Preview da importação'}
          descricao={detalhe
            ? `Competência ${detalhe.competencia} · ${rotuloObra(detalhe.obra) || 'obra não informada'} · ${detalhe.status}`
            : 'Selecione uma importação para ver o preview persistido, os erros de linha e a confirmação.'}
          variante="primario"
          cor="var(--c-primary)"
          acoes={detalhe ? (
            <>
              <button type="button" className="btn btn-outline" onClick={() => setDetalhe(null)}>
                Voltar para lista
              </button>
              {podeEditar && detalhe.status === 'PREVIEW' && (
                <button type="button" className="btn btn-primary" onClick={confirmarImportacao} disabled={confirmando}>
                  {confirmando ? 'Confirmando...' : 'Confirmar importação'}
                </button>
              )}
            </>
          ) : null}
        >
          {detalhe ? (
            <>
              <StatGrid colunas={4}>
                <StatTile label="Linhas" valor={detalhe.total_linhas || 0} />
                <StatTile label="Válidas" valor={detalhe.total_validas || 0} />
                <StatTile
                  label="Erros"
                  valor={detalhe.total_erros || 0}
                  tom={Number(detalhe.total_erros || 0) > 0 ? 'danger' : undefined}
                />
                <StatTile label="Criado em" valor={formatDateTime(detalhe.createdAt)} />
                {detalhe.observacoes ? (
                  <StatTile label="Observações do lote" valor={detalhe.observacoes} full />
                ) : null}
              </StatGrid>

              <TabelaPadrao
                colunas={[
                  {
                    id: 'numero_linha',
                    titulo: 'Linha',
                    tipo: 'codigo',
                    render: (linha) => linha.numero_linha
                  },
                  {
                    id: 'codigo_ref',
                    titulo: 'Código/matrícula',
                    tipo: 'codigo',
                    render: (linha) => getLinhaColaboradorCodigo(linha)
                  },
                  {
                    id: 'colaborador',
                    titulo: 'Colaborador',
                    // R17: a linha do preview é de um COLABORADOR nomeado.
                    tipo: 'identidade',
                    noCard: 'titulo',
                    render: (linha) => getLinhaColaboradorNome(linha)
                  },
                  {
                    id: 'status',
                    titulo: 'Status',
                    tipo: 'status',
                    render: (linha) => (
                      <EtiquetaStatus valor={linha.status} catalogo={STATUS_LINHA_EXIBICAO} />
                    )
                  },
                  // Colunas VINDAS DO ARQUIVO importado: o papel de cada uma é
                  // derivado aqui, no ponto de uso, para que nenhuma coluna
                  // chegue à tabela sem `tipo`.
                  ...colunasPayload,
                  {
                    id: 'erro',
                    titulo: 'Erro',
                    tipo: 'texto',
                    render: (linha) => (linha.erro_mensagem
                      ? (
                        <span style={{ color: 'var(--sem-danger)' }}>
                          {`Linha ${linha.numero_linha}: ${linha.erro_mensagem}`}
                        </span>
                      )
                      : '-')
                  }
                ]}
                itens={detalhe.linhas || []}
                storageKey="tabela:rh-dp-importacoes:preview"
                rotuloRolagem="Linhas do preview da importação"
                vazio="Sem linhas registradas"
                urgencia={(linha) => (linha.erro_mensagem ? 'danger' : null)}
              />
            </>
          ) : null}
        </BlocoConteudo>
      </div>

      {elementoConfirmacao}
    </Pagina>
  );
}
