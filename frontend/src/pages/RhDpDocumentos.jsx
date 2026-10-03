import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Avisos,
  BarraFiltros,
  CelulaDupla,
  PageHeader,
  Pagina,
  TabelaPadrao,
  alternarValorFiltro,
  useAvisos,
  useConfirmacao,
  useFiltrosVisiveis
} from '../components/padrao';
import { useAuth } from '../contexts/AuthContext';
import { getObras } from '../services/obras';
import {
  getRhDocumentoLink,
  getRhDocumentos,
  getRhDocumentoTipos,
  getRhEmpresasGrupo,
  substituirRhDocumento
} from '../services/rhDp';
import { canManageRhDpDocumentos } from '../utils/acessoProduto';

// A lista sempre pediu 20 por página e nada na tela mudava esse número:
// vira constante em vez de estado que ninguém escreve.
const LIMITE_PAGINA = 20;

function formatCpf(value) {
  const digits = String(value || '').replace(/\D+/g, '');
  if (digits.length === 11) {
    return digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  }
  return value || '-';
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('pt-BR');
}

function validadeLabel(status) {
  switch (status) {
    case 'VENCIDO':
      return 'Vencido';
    case 'A_VENCER':
      return 'A vencer';
    case 'VALIDO':
      return 'Válido';
    default:
      return 'Sem validade';
  }
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
  { id: 'busca', rotulo: 'Busca', obrigatorio: true },
  { id: 'empresa_grupo_id', rotulo: 'Empresa' },
  { id: 'obra_id', rotulo: 'Obra' },
  { id: 'tipo_vinculo', rotulo: 'Vínculo' },
  { id: 'tipo_documento_id', rotulo: 'Tipo de documento' },
  { id: 'status', rotulo: 'Status' },
  { id: 'validade_status', rotulo: 'Validade' },
  { id: 'incluir_historico', rotulo: 'Histórico' }
];

export default function RhDpDocumentos() {
  const { user } = useAuth();
  const podeEditar = canManageRhDpDocumentos(user);
  // R3/R19: aviso e confirmação do sistema — nada de caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();
  const [carregando, setCarregando] = useState(false);
  const [substituindoId, setSubstituindoId] = useState(null);
  const [documentos, setDocumentos] = useState([]);
  const [meta, setMeta] = useState({ page: 1, total_pages: 0, total: 0, limit: LIMITE_PAGINA });
  const [empresas, setEmpresas] = useState([]);
  const [obras, setObras] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [busca, setBusca] = useState('');
  // R12: cada recorte é um conjunto MARCÁVEL (vazio = todos). A API aceita
  // um valor por recorte, então uma marca vira o parâmetro e nenhuma marca
  // deixa o parâmetro de fora — exatamente o que o select fazia antes.
  const [ativos, setAtivos] = useState({});
  /*
    N53 — filtro com VALOR é filtro VISÍVEL. Um recorte pode chegar pela URL
    ou do estado da tela e cair sobre um filtro escondido; o painel REVELA em
    vez de apagar, porque o recorte foi o usuário que montou.
  */
  const filtrosPreenchidos = useMemo(
    () => FILTROS_DA_TELA.filter((filtro) => (filtro.id === 'busca'
      ? busca.trim() !== ''
      : (ativos[filtro.id]?.size || 0) > 0)).map((filtro) => filtro.id),
    [busca, ativos]
  );
  /*
    A escolha mora na MESMA chave de lista que esta tela já usa na
    TabelaPadrao: é a mesma lista respondendo a duas perguntas (quais
    colunas, quais filtros), e o `PreferenciasContext` separa as duas pelo
    TIPO. Sem `legado`: esta faixa nunca gravou a escolha em lugar nenhum,
    então não há chave antiga de onde migrar.
  */
  const visibilidadeFiltros = useFiltrosVisiveis('tabela:rh-dp-documentos', FILTROS_DA_TELA, {
    preenchidos: filtrosPreenchidos,
    /*
      Contrato 1 do painel: esconder LIMPA o valor. Filtro fora da faixa que
      continuasse recortando a lista seria critério invisível — a pessoa lê a
      contagem e conclui que é o conjunto inteiro.
    */
    aoEsconder: (id) => {
      // A lista vem paginada: alargar o recorte sem voltar à primeira
      // página deixaria a pessoa numa página que já não existe.
      setPagina(1);
      setAtivos((atuais) => ({ ...atuais, [id]: new Set() }));
    }
  });
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    carregarBase();
  }, []);

  // Filtro marcado aplica na hora; a busca digitada espera 350ms para não
  // martelar a API a cada tecla. Trocar QUALQUER recorte (ou a página)
  // recarrega a lista — por isso o botão "Aplicar filtros" deixou de ter uso.
  useEffect(() => {
    const atraso = setTimeout(() => {
      carregarDocumentos().catch((error) => {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar documentos RH/DP');
      });
    }, 350);
    return () => clearTimeout(atraso);
  }, [busca, ativos, pagina]);

  async function carregarBase() {
    try {
      const [listaEmpresas, listaObras, listaTipos] = await Promise.all([
        getRhEmpresasGrupo({ ativo: true }),
        getObras(),
        getRhDocumentoTipos({ ativo: true })
      ]);

      setEmpresas(Array.isArray(listaEmpresas) ? listaEmpresas : []);
      setObras(Array.isArray(listaObras) ? listaObras : []);
      setTipos(Array.isArray(listaTipos) ? listaTipos : []);
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar base documental RH/DP');
    }
  }

  function valorUnico(dimensao) {
    const conjunto = ativos[dimensao];
    if (!conjunto || conjunto.size !== 1) return undefined;
    return conjunto.values().next().value;
  }

  async function carregarDocumentos() {
    setCarregando(true);
    try {
      const resposta = await getRhDocumentos({
        q: busca || undefined,
        empresa_grupo_id: valorUnico('empresa_grupo_id'),
        obra_id: valorUnico('obra_id'),
        tipo_vinculo: valorUnico('tipo_vinculo'),
        tipo_documento_id: valorUnico('tipo_documento_id'),
        status: valorUnico('status'),
        validade_status: valorUnico('validade_status'),
        incluir_historico: ativos.incluir_historico?.size ? true : undefined,
        page: pagina,
        limit: LIMITE_PAGINA
      });

      setDocumentos(Array.isArray(resposta?.data) ? resposta.data : []);
      setMeta({
        page: Number(resposta?.meta?.page || pagina || 1),
        total_pages: Number(resposta?.meta?.total_pages || 0),
        total: Number(resposta?.meta?.total || 0),
        limit: Number(resposta?.meta?.limit || LIMITE_PAGINA)
      });
    } finally {
      setCarregando(false);
    }
  }

  // O terceiro argumento (`{ unico }`) vem da BarraFiltros e PRECISA ser
  // repassado: sem ele, marcar dois valores numa dimensão de valor único
  // fazia o parâmetro sair da consulta — a lista abria para tudo com duas
  // etiquetas afirmando que estava filtrando.
  function alternarFiltro(dimensao, valor, opcoes) {
    setAtivos((atual) => alternarValorFiltro(atual, dimensao, valor, opcoes));
    setPagina(1);
  }

  function limparFiltros() {
    setAtivos({});
    setPagina(1);
  }

  async function abrirDocumento(id) {
    try {
      const url = await getRhDocumentoLink(id);
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao abrir documento RH/DP');
    }
  }

  async function onSelecionarSubstituicao(documento, file) {
    if (!file) return;

    const { ok } = await confirmar({
      titulo: 'Substituir documento',
      mensagem: `Substituir o documento "${documento.nome_original}"?`,
      rotuloConfirmar: 'Substituir'
    });
    if (!ok) return;

    try {
      setSubstituindoId(documento.id);
      await substituirRhDocumento(documento.id, {
        tipo_documento_id: documento.documento_tipo_id,
        validade: documento.validade || undefined,
        status: documento.status === 'REJEITADO' ? 'ENVIADO' : documento.status,
        observacoes: documento.observacoes || undefined,
        file
      });
      await carregarDocumentos();
      avisar.sucesso('Documento substituído.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao substituir documento RH/DP');
    } finally {
      setSubstituindoId(null);
    }
  }

  // R12: os oito campos da grade crua viraram um recorte marcável cada.
  // Nenhum é contínuo (validade aqui é SITUAÇÃO — válido/a vencer/vencido —,
  // não uma data), então a prop `campos` da BarraFiltros não tem uso nesta
  // tela; ligá-la seria inventar um filtro que a tela nunca teve.
  const dimensoes = useMemo(() => [
    {
      id: 'empresa_grupo_id',
      rotulo: 'Empresa',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: empresas.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'obra_id',
      rotulo: 'Obra',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: obras.map((item) => ({
        valor: String(item.id),
        rotulo: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome
      }))
    },
    {
      id: 'tipo_vinculo',
      rotulo: 'Vínculo',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: [
        { valor: 'CLT', rotulo: 'CLT' },
        { valor: 'NAO_CLT', rotulo: 'Não CLT' }
      ]
    },
    {
      id: 'tipo_documento_id',
      rotulo: 'Tipo de documento',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: tipos.map((item) => ({ valor: String(item.id), rotulo: item.nome }))
    },
    {
      id: 'status',
      rotulo: 'Status',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: [
        { valor: 'ENVIADO', rotulo: 'Enviado' },
        { valor: 'CONFERIDO', rotulo: 'Conferido' },
        { valor: 'REJEITADO', rotulo: 'Rejeitado' },
        { valor: 'SUBSTITUIDO', rotulo: 'Substituído' }
      ]
    },
    {
      id: 'validade_status',
      rotulo: 'Validade',
      // O serviço aceita UM valor por recorte (getRhDocumentos).
      unico: true,
      opcoes: [
        { valor: 'VALIDO', rotulo: 'Válido' },
        { valor: 'A_VENCER', rotulo: 'A vencer' },
        { valor: 'VENCIDO', rotulo: 'Vencido' },
        { valor: 'SEM_VALIDADE', rotulo: 'Sem validade' }
      ]
    },
    {
      id: 'incluir_historico',
      rotulo: 'Histórico',
      opcoes: [{ valor: 'sim', rotulo: 'Incluir histórico' }]
    }
  ], [empresas, obras, tipos]);

  const paginaAtual = Number(meta.page || 1);
  const totalPaginas = Number(meta.total_pages || 0);

  return (
    <Pagina className="rhdp-page">
      <PageHeader
        titulo="Documentos"
        contagem={carregando ? null : `${meta.total} documento(s)`}
        descricao="Painel geral de documentos por colaborador, com busca, validade, histórico e acesso por link assinado."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <div className="card sol-surface-card">
        <BarraFiltros
          busca={visibilidadeFiltros.ehVisivel('busca') ? {
            valor: busca,
            aoMudar: (valor) => { setBusca(valor); setPagina(1); },
            placeholder: 'Buscar por colaborador, CPF, matrícula, arquivo ou observação'
          } : null}
          filtros={dimensoes.filter((dim) => visibilidadeFiltros.ehVisivel(dim.id))}
          ativos={ativos}
          aoAlternar={alternarFiltro}
          aoLimpar={limparFiltros}
          visibilidade={visibilidadeFiltros}
        />

        <TabelaPadrao
          colunas={[
            {
              id: 'colaborador',
              titulo: 'Colaborador',
              // R17: o documento é lido pelo COLABORADOR dono dele.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => (
                <CelulaDupla
                  principal={item.colaborador?.nome || '-'}
                  sub={`${formatCpf(item.colaborador?.cpf)} · ${item.colaborador?.matricula || '-'} · ${item.colaborador?.empresaGrupo?.nome || '-'}`}
                />
              )
            },
            {
              id: 'tipo',
              titulo: 'Tipo',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla
                  principal={item.tipoDocumento?.nome || '-'}
                  sub={item.colaborador?.tipo_vinculo === 'NAO_CLT' ? 'Não CLT' : item.colaborador?.tipo_vinculo || '-'}
                />
              )
            },
            {
              id: 'arquivo',
              titulo: 'Arquivo',
              tipo: 'texto',
              render: (item) => (
                <CelulaDupla principal={item.nome_original} sub={item.observacoes || '-'} />
              )
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              render: (item) => (
                <CelulaDupla principal={item.status} sub={item.ativo ? 'Atual' : 'Histórico'} />
              )
            },
            {
              id: 'validade',
              titulo: 'Validade',
              tipo: 'data',
              render: (item) => (
                <CelulaDupla principal={formatDate(item.validade)} sub={validadeLabel(item.validade_status)} />
              )
            }
          ]}
          itens={documentos}
          storageKey="tabela:rh-dp-documentos"
          rotuloRolagem="Documentos RH/DP"
          carregando={carregando}
          vazio="Nenhum documento localizado"
          acoesLinha={(item) => (
            <>
              <button type="button" className="btn btn-outline" onClick={() => abrirDocumento(item.id)}>
                Abrir
              </button>
              <Link
                to={`/rh-dp/colaboradores?colaborador_id=${item.colaborador_id}`}
                className="btn btn-outline"
              >
                Colaborador
              </Link>
              {podeEditar && item.ativo && (
                <label className={`btn btn-outline cursor-pointer ${substituindoId === item.id ? 'opacity-60 pointer-events-none' : ''}`}>
                  Substituir
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      onSelecionarSubstituicao(item, file);
                    }}
                    disabled={substituindoId === item.id}
                  />
                </label>
              )}
            </>
          )}
          larguraAcoes={320}
        />
      </div>

      {/* Paginação de servidor: não existe componente de paginação em
          components/padrao (nem em tela reformada), então o markup segue o
          da tela — só a cor cinza fixa virou token. */}
      {totalPaginas > 0 && (
        <div className="app-page-actions" role="navigation" aria-label="Paginação">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPagina(Math.max(1, paginaAtual - 1))}
            disabled={paginaAtual <= 1 || carregando}
          >
            Página anterior
          </button>
          <span className="text-sm" style={{ color: 'var(--c-muted)' }}>
            Página {paginaAtual} de {Math.max(totalPaginas, 1)}
          </span>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => setPagina(Math.min(totalPaginas, paginaAtual + 1))}
            disabled={paginaAtual >= totalPaginas || carregando}
          >
            Próxima página
          </button>
        </div>
      )}

      {elementoConfirmacao}
    </Pagina>
  );
}
