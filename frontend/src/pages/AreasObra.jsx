import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getAreasObra, salvarAreasObra } from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, Avisos, useAvisos } from '../components/padrao';

export default function AreasObra() {
  const [setores, setSetores] = useState([]);
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  // R3/R19: aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      const [listaSetores, cfg] = await Promise.all([
        getSetores(),
        getAreasObra()
      ]);
      const areas = Array.isArray(cfg?.areas) ? cfg.areas : [];
      setSelecionadas(new Set(areas.map(a => String(a).toUpperCase())));
      setSetores(Array.isArray(listaSetores) ? listaSetores : []);
    }
    load();
  }, []);

  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) => {
      const nomeA = String(a?.nome || '').toUpperCase();
      const nomeB = String(b?.nome || '').toUpperCase();
      return nomeA.localeCompare(nomeB);
    });
  }, [setores]);

  const totalMarcadas = useMemo(() => (
    setoresOrdenados.filter(s => selecionadas.has(String(s.codigo || '').toUpperCase())).length
  ), [setoresOrdenados, selecionadas]);

  function alternar(codigo) {
    const key = String(codigo || '').toUpperCase();
    setSelecionadas(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function selecionarTodas() {
    setSelecionadas(new Set(setores.map(s => String(s.codigo || '').toUpperCase())));
  }

  function limparSelecao() {
    setSelecionadas(new Set());
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarAreasObra({ areas: Array.from(selecionadas) });
      avisar.sucesso('Configuração salva com sucesso');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar configuração');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Áreas visíveis para OBRA"
        contagem={`${totalMarcadas} de ${setoresOrdenados.length} selecionadas`}
        descricao="Marque quais áreas os usuários do setor OBRA podem selecionar na tela de Nova Solicitação."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Áreas selecionaveis"
        variante="primario"
        cor="var(--c-primary)"
        acoes={(
          <>
            <button type="button" className="btn btn-outline btn-sm" onClick={selecionarTodas}>
              Selecionar todas
            </button>
            <button type="button" className="btn btn-outline btn-sm" onClick={limparSelecao}>
              Limpar seleção
            </button>
          </>
        )}
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {setoresOrdenados.map(setor => {
            const codigo = String(setor.codigo || '').toUpperCase();
            const marcado = selecionadas.has(codigo);
            return (
              <label key={setor.id} className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(codigo)}
                />
                <span>
                  {setor.nome} ({codigo})
                </span>
              </label>
            );
          })}
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
