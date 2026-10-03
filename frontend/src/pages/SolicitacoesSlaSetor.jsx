import { useEffect, useMemo, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  StatGrid,
  StatTile,
  TabelaPadrao,
  Avisos,
  useAvisos
} from '../components/padrao';
import { getSetores } from '../services/setores';
import {
  getSlaSolicitacoesSetor,
  salvarSlaSolicitacoesSetor
} from '../services/configuracoesSistema';

function normalizeSetor(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

export default function SolicitacoesSlaSetor() {
  const [setores, setSetores] = useState([]);
  const [regras, setRegras] = useState({});
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: a faixa azul montada à mão (um <div> que servia para "salvo" e
  // para "erro ao salvar" com o MESMO peso visual) deu lugar ao aviso do
  // sistema: tom semântico, fechável, e o sucesso some sozinho em 6s.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [setoresData, config] = await Promise.all([
          getSetores(),
          getSlaSolicitacoesSetor()
        ]);

        setSetores(Array.isArray(setoresData) ? setoresData.filter((item) => item?.ativo !== false) : []);
        setRegras(config?.setores && typeof config.setores === 'object' ? config.setores : {});
      } catch (error) {
        console.error(error);
        avisar.erro(error.message || 'Erro ao carregar configuracao de SLA.');
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const setoresOrdenados = useMemo(() => (
    [...setores].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'))
  ), [setores]);

  const resumo = useMemo(() => {
    const ativos = Object.values(regras || {}).filter((regra) => regra?.ativo && Number(regra?.dias) > 0).length;
    return {
      setores: setoresOrdenados.length,
      configurados: ativos,
      pendentes: Math.max(0, setoresOrdenados.length - ativos)
    };
  }, [regras, setoresOrdenados]);

  function atualizarRegra(codigo, patch) {
    const key = normalizeSetor(codigo);
    if (!key) return;

    setRegras((prev) => ({
      ...prev,
      [key]: {
        dias: prev?.[key]?.dias || '',
        ativo: prev?.[key]?.ativo !== false,
        ...patch
      }
    }));
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarSlaSolicitacoesSetor({ setores: regras });
      avisar.sucesso('SLA por setor salvo com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error.message || 'Erro ao salvar SLA por setor.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      {/* C1/R13: o cabeçalho montado à mão não tinha `.app-page-header`, ou
          seja, não grudava na rolagem — numa lista com todos os setores da
          empresa o botão "Salvar SLA" saía da tela e só voltava rolando de
          volta ao topo. R5/C2: os dois textos de apoio soltos (page-subtitle)
          viraram props — o apoio DA TELA aqui, o apoio DO BLOCO no
          BlocoConteudo, que é onde a R5 manda o apoio de bloco morar. */}
      <PageHeader
        titulo="SLA por setor"
        contagem={loading ? null : `${resumo.setores} setor(es) ativo(s)`}
        descricao="Defina o prazo real, em dias, que cada setor possui para movimentar solicitações abertas."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar SLA',
          onClick: salvar,
          desabilitada: salvando || loading
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* M2/R10 + R25: os três cartões de resumo eram `text-2xl` (fora da
          escala) com `text-emerald-700`/`text-amber-700` (paleta crua, sem
          par no tema escuro e fora do piso de contraste do ThemeContext).
          O StatTile já traz a escala e o tom semântico por token.
          B3: o total de setores ativos é a CONTAGEM da faixa fixa e não se
          repete aqui — ficam os dois números que a faixa não diz. */}
      <StatGrid colunas={2}>
        <StatTile label="Com SLA" valor={String(resumo.configurados)} tom="success" />
        <StatTile
          label="Pendentes"
          valor={String(resumo.pendentes)}
          tom={resumo.pendentes ? 'warning' : undefined}
        />
      </StatGrid>

      {/*
        R18 — `overflow: clip`, NUNCA `overflow: hidden`, neste bloco.

        Ele é ancestral do `.resizable-table-scroll` da TabelaPadrao. Com
        `hidden` num eixo o navegador computa o OUTRO eixo para `auto`: o
        elemento vira scrollport e todo `position: sticky` de dentro passa a
        grudar NELE em vez da janela/do contêiner pretendido. Morrem, em
        silêncio, o cabeçalho grudado da tabela e a coluna fixa — sem erro no
        console, sem falhar o build, sem aparecer em teste de unidade. Foi
        exatamente esse mecanismo que deixou NOVE telas de detalhe com a
        faixa do topo quebrada desde que existiam.

        `clip` recorta igual e NÃO cria scrollport, então o sticky sobrevive.
      */}
      <BlocoConteudo
        titulo="Prazos operacionais"
        variante="primario"
        cor="var(--c-primary)"
        descricao="Setores sem prazo cadastrado não entram como vencidos no relatório. Eles aparecem separadamente como sem SLA configurado."
        className="overflow-clip"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'setor',
              titulo: 'Setor',
              // R17: o setor é o registro desta lista de SLA.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (setor) => setor.nome || '-'
            },
            {
              id: 'codigo',
              titulo: 'Código',
              tipo: 'codigo',
              render: (setor) => normalizeSetor(setor.codigo || setor.nome)
            },
            {
              id: 'dias',
              sempreVisivel: true,
              titulo: 'SLA em dias',
              tipo: 'numero',
              render: (setor) => {
                const codigo = normalizeSetor(setor.codigo || setor.nome);
                const regra = regras?.[codigo] || {};
                return (
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    className="input"
                    value={regra.dias ?? ''}
                    placeholder="Ex: 3"
                    onChange={(event) => atualizarRegra(codigo, { dias: event.target.value })}
                  />
                );
              }
            },
            {
              id: 'ativo',
              sempreVisivel: true,
              titulo: 'Ativo',
              tipo: 'status',
              render: (setor) => {
                const codigo = normalizeSetor(setor.codigo || setor.nome);
                const regra = regras?.[codigo] || {};
                return (
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--c-text)]">
                    <input
                      type="checkbox"
                      checked={regra.ativo !== false}
                      onChange={(event) => atualizarRegra(codigo, { ativo: event.target.checked })}
                    />
                    Usar no relatório
                  </label>
                );
              }
            }
          ]}
          itens={setoresOrdenados}
          getId={(setor) => setor.id || normalizeSetor(setor.codigo || setor.nome)}
          carregando={loading}
          storageKey="tabela:solicitacoes-sla-setor"
          rotuloRolagem="SLA por setor"
          vazio="Nenhum setor ativo encontrado."
        />
      </BlocoConteudo>
    </Pagina>
  );
}
