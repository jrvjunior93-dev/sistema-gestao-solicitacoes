import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import {
  getSetoresCriacaoTodasObras,
  salvarSetoresCriacaoTodasObras
} from '../services/configuracoesSistema';
import { Pagina, PageHeader, BlocoConteudo, Avisos, useAvisos } from '../components/padrao';

export default function SetoresCriacaoTodasObras() {
  const [setores, setSetores] = useState([]);
  const [selecionados, setSelecionados] = useState(new Set());
  const [salvando, setSalvando] = useState(false);
  // R3/R19: aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function load() {
      const [listaSetores, cfg] = await Promise.all([
        getSetores(),
        getSetoresCriacaoTodasObras()
      ]);

      const ativos = Array.isArray(listaSetores)
        ? listaSetores.filter(item => item?.ativo !== false)
        : [];
      setSetores(ativos);

      const listaCfg = Array.isArray(cfg?.setores) ? cfg.setores : [];
      setSelecionados(new Set(listaCfg.map(item => String(item || '').toUpperCase())));
    }
    load();
  }, []);

  const setoresOrdenados = useMemo(() => {
    return [...setores].sort((a, b) =>
      String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR', { sensitivity: 'base' })
    );
  }, [setores]);

  const totalMarcados = useMemo(() => (
    setoresOrdenados.filter(s => selecionados.has(String(s?.codigo || '').toUpperCase())).length
  ), [setoresOrdenados, selecionados]);

  function alternarSetor(codigo) {
    const key = String(codigo || '').toUpperCase();
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function salvar() {
    try {
      setSalvando(true);
      await salvarSetoresCriacaoTodasObras({ setores: Array.from(selecionados) });
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro('Erro ao salvar configuração.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      {/* C2: apoio na faixa (decisão 02/09) — contagem + descrição em uma
          linha no próprio PageHeader. */}
      <PageHeader
        titulo="Setores com criação em todas as obras"
        contagem={`${totalMarcados} de ${setoresOrdenados.length} selecionados`}
        descricao="Setores marcados podem criar solicitação em qualquer obra na tela de Nova Solicitação. A visibilidade das solicitações continua seguindo as regras atuais."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Setores habilitados"
        variante="primario"
        cor="var(--c-primary)"
      >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {setoresOrdenados.map(setor => {
            const codigo = String(setor?.codigo || '').toUpperCase();
            const marcado = selecionados.has(codigo);
            return (
              <label key={setor.id} className="flex items-center gap-2 rounded-lg border border-[var(--c-border)] bg-[var(--c-surface)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternarSetor(codigo)}
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
