import { useEffect, useMemo, useState } from 'react';
import {
  getCategoriasTitulosPedidosCompra,
  salvarCategoriasTitulosPedidosCompra
} from '../services/configuracoesSistema';
import {
  Avisos,
  BlocoConteudo,
  Pagina,
  PageHeader,
  TabelaPadrao,
  useAvisos
} from '../components/padrao';

export default function ConfiguracoesTitulosPedidosCompra() {
  const [categorias, setCategorias] = useState([]);
  const [selecionadas, setSelecionadas] = useState([]);
  const [padrao, setPadrao] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setLoading(true);
      const data = await getCategoriasTitulosPedidosCompra();
      const disponiveis = Array.isArray(data?.categorias_disponiveis)
        ? data.categorias_disponiveis
        : (data?.categorias || []);
      const ids = data?.configurada
        ? (data.categoria_ids || []).map(Number)
        : disponiveis.map((item) => Number(item.id));
      setCategorias(disponiveis);
      setSelecionadas(ids);
      setPadrao(data?.categoria_padrao_id ? String(data.categoria_padrao_id) : '');
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível carregar as categorias.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const selecionadasSet = useMemo(() => new Set(selecionadas.map(Number)), [selecionadas]);

  function alternar(id) {
    const numero = Number(id);
    setSelecionadas((atuais) => atuais.includes(numero)
      ? atuais.filter((item) => item !== numero)
      : [...atuais, numero]);
    if (Number(padrao) === numero) setPadrao('');
  }

  async function salvar() {
    if (!selecionadas.length) return avisar.alerta('Habilite ao menos uma categoria.');
    if (!padrao || !selecionadasSet.has(Number(padrao))) {
      return avisar.alerta('Escolha uma categoria padrão entre as habilitadas.');
    }
    try {
      setSalvando(true);
      await salvarCategoriasTitulosPedidosCompra({
        categoria_ids: selecionadas,
        categoria_padrao_id: Number(padrao)
      });
      avisar.sucesso('Categorias dos títulos de pedidos salvas.');
      await carregar();
    } catch (error) {
      avisar.erro(error.message || 'Não foi possível salvar a configuração.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas = [
    {
      id: 'habilitada',
      titulo: 'Habilitada',
      tipo: 'badge',
      flex: false,
      render: (item) => (
        <input
          type="checkbox"
          checked={selecionadasSet.has(Number(item.id))}
          onChange={() => alternar(item.id)}
          aria-label={`Habilitar ${item.nome}`}
        />
      )
    },
    { id: 'nome', titulo: 'Categoria financeira', tipo: 'identidade', render: (item) => item.nome },
    { id: 'tipo', titulo: 'Tipo', tipo: 'badge', flex: false, render: (item) => item.tipo },
    {
      id: 'padrao',
      titulo: 'Padrão',
      tipo: 'badge',
      flex: false,
      render: (item) => (
        <input
          type="radio"
          name="categoria-padrao-pedido"
          checked={Number(padrao) === Number(item.id)}
          disabled={!selecionadasSet.has(Number(item.id))}
          onChange={() => setPadrao(String(item.id))}
          aria-label={`Usar ${item.nome} como categoria padrão`}
        />
      )
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Categorias dos títulos de pedidos"
        descricao="Defina as categorias disponíveis para Compras e qual delas será preenchida automaticamente ao criar os títulos de um pedido."
        acaoPrincipal={{ rotulo: salvando ? 'Salvando...' : 'Salvar configuração', onClick: salvar, desabilitada: salvando || loading }}
      />
      <Avisos avisos={avisos} aoFechar={fechar} />
      <BlocoConteudo
        titulo="Categorias a pagar"
        contagem={loading ? null : `${selecionadas.length} habilitada(s)`}
        descricao="Compras ainda poderá escolher outra categoria habilitada antes de criar os títulos."
      >
        {loading ? <p className="app-note">Carregando...</p> : (
          <TabelaPadrao
            id="config-categorias-titulos-pedidos"
            dados={categorias}
            colunas={colunas}
            mensagemVazia="Nenhuma categoria financeira ativa para títulos a pagar."
          />
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
