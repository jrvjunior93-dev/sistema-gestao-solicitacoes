import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  Avisos,
  useAvisos
} from '../components/padrao';
import {
  getContratoObraCategorias,
  salvarContratoObraCategorias
} from '../services/configuracoesSistema';

// O cadastro tem 160 categorias a pagar; quem filtra costuma digitar sem acento.
function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

/**
 * Curadoria das categorias financeiras liberadas para o contrato de obra.
 *
 * Nao cadastra categoria: seleciona, sobre o cadastro existente, quais aparecem para o
 * solicitante. Sem isso a escolha seria feita numa lista de 160 itens.
 */
export default function ContratoObraCategorias() {
  const [disponiveis, setDisponiveis] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [invalidas, setInvalidas] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [somenteSelecionadas, setSomenteSelecionadas] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3: erro e sucesso sao EVENTO (carregou, salvou, falhou) — faixa do
  // sistema, empilhavel e fechavel. As condicoes derivadas do conteudo
  // (nenhuma marcada / categorias inativadas) NAO passam por aqui: fechar
  // a faixa nao resolve o problema, entao elas seguem fixas no fluxo.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      try {
        const data = await getContratoObraCategorias();
        setDisponiveis(Array.isArray(data?.categorias_disponiveis) ? data.categorias_disponiveis : []);
        setSelecionadas(new Set((data?.categoria_ids || []).map(Number)));
        setInvalidas(data?.categorias_invalidas || []);
      } catch {
        avisar.erro('Não foi possível carregar as categorias.');
      } finally {
        setCarregando(false);
      }
    }
    load();
  }, []);

  const visiveis = useMemo(() => {
    const termo = normalizar(filtro);
    return disponiveis.filter((c) => {
      if (somenteSelecionadas && !selecionadas.has(Number(c.id))) return false;
      if (!termo) return true;
      return normalizar(`${c.nome} ${c.dre_grupo || ''}`).includes(termo);
    });
  }, [disponiveis, filtro, somenteSelecionadas, selecionadas]);

  // Agrupa por grupo da DRE: com 160 itens, a lista plana e dificil de percorrer.
  const porGrupo = useMemo(() => {
    const mapa = new Map();
    visiveis.forEach((c) => {
      const grupo = c.dre_grupo || 'Sem grupo na DRE';
      if (!mapa.has(grupo)) mapa.set(grupo, []);
      mapa.get(grupo).push(c);
    });
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [visiveis]);

  function alternar(id) {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function marcarVisiveis(marcar) {
    setSelecionadas((prev) => {
      const proximo = new Set(prev);
      visiveis.forEach((c) => (marcar ? proximo.add(Number(c.id)) : proximo.delete(Number(c.id))));
      return proximo;
    });
  }

  async function salvar() {
    setSalvando(true);
    try {
      const data = await salvarContratoObraCategorias([...selecionadas]);
      setSelecionadas(new Set((data?.categoria_ids || []).map(Number)));
      setInvalidas(data?.categorias_invalidas || []);
      avisar.sucesso('Categorias salvas.');
    } catch {
      avisar.erro('Não foi possível salvar as categorias.');
    } finally {
      setSalvando(false);
    }
  }

  const descricao = 'Marque quais categorias financeiras ficam disponiveis ao criar um contrato de obra. Somente categorias que aceitam titulo a pagar aparecem aqui.';

  // B5: mesmo carregando, titulo vai ao PageHeader e o texto tem superficie
  // (bloco) — nada de <h1> solto nem frase crua sobre o canvas.
  if (carregando) {
    return (
      <Pagina>
        <PageHeader titulo="Categorias do contrato de obra" descricao={descricao} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Categorias liberadas" variante="primario" cor="var(--c-primary)">
          <p className="app-note">Carregando categorias...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* R5: contagem e apoio na FAIXA FIXA do topo, com escala de titulo e
          superficie propria — a contagem era um <span> miudo perdido no meio
          da linha de filtros.
          C5/R13: "Salvar" sobe para o cabecalho. A lista de 160 categorias
          rola a pagina inteira (o recorte com altura fixa saiu por ser medida
          a mao, R10), e so no cabecalho fixo a acao principal continua a um
          clique depois da rolagem. */}
      <PageHeader
        titulo="Categorias do contrato de obra"
        contagem={`${selecionadas.size} de ${disponiveis.length} marcadas`}
        descricao={descricao}
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Categorias liberadas" variante="primario" cor="var(--c-primary)">
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            {/* R3: a busca ocupa a faixa (.app-busca cresce de 220 a 480px) —
                antes era largura fixa em style inline com vazio ao lado. */}
            <input
              type="text"
              className="input app-busca"
              placeholder="Buscar por nome ou grupo da DRE"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={somenteSelecionadas}
                onChange={(e) => setSomenteSelecionadas(e.target.checked)}
              />
              <span>Somente marcadas</span>
            </label>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => marcarVisiveis(true)}>
              Marcar visíveis
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => marcarVisiveis(false)}>
              Desmarcar visíveis
            </button>
          </div>

          {selecionadas.size === 0 && (
            <div className="app-alert app-alert--error">
              Nenhuma categoria marcada — o contrato de obra ficará sem opção de categoria.
            </div>
          )}

          {invalidas.length > 0 && (
            <div className="app-alert app-alert--error">
              {invalidas.length} categoria(s) marcada(s) foram inativadas no cadastro. Revise a selecao.
            </div>
          )}

          <div className="space-y-4">
            {porGrupo.map(([grupo, itens]) => (
              <div key={grupo} className="space-y-2">
                <div className="text-xs font-bold uppercase text-muted">
                  {grupo} ({itens.length})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                  {itens.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={selecionadas.has(Number(c.id))}
                        onChange={() => alternar(Number(c.id))}
                      />
                      <span>{c.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
            {porGrupo.length === 0 && (
              <p className="app-note">Nenhuma categoria encontrada com os filtros atuais.</p>
            )}
          </div>
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
