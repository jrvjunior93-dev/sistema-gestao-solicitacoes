import { useEffect, useMemo, useState } from 'react';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  Pagina,
  PageHeader,
  useAvisos
} from '../components/padrao';
import {
  getTiposSolicitacaoPorDestino,
  salvarTiposSolicitacaoPorDestino
} from '../services/configuracoesSistema';

function idsValidos(valores) {
  return [...new Set((Array.isArray(valores) ? valores : [])
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

function textoBusca(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

export default function TiposSolicitacaoPorDestino() {
  const [configuracao, setConfiguracao] = useState({
    tipos: [],
    centros_custo: [],
    tipos_obras: [],
    tipos_por_centro_custo: {}
  });
  const [escopo, setEscopo] = useState('OBRA');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  async function carregar() {
    try {
      setCarregando(true);
      const data = await getTiposSolicitacaoPorDestino();
      const normalizada = {
        tipos: Array.isArray(data?.tipos) ? data.tipos : [],
        centros_custo: Array.isArray(data?.centros_custo) ? data.centros_custo : [],
        tipos_obras: idsValidos(data?.tipos_obras),
        tipos_por_centro_custo: data?.tipos_por_centro_custo && typeof data.tipos_por_centro_custo === 'object'
          ? data.tipos_por_centro_custo
          : {}
      };
      setConfiguracao(normalizada);
      setCentroCustoId((atual) => atual || String(normalizada.centros_custo[0]?.id || ''));
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao carregar a disponibilidade dos tipos.');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    const ids = escopo === 'OBRA'
      ? configuracao.tipos_obras
      : configuracao.tipos_por_centro_custo?.[String(centroCustoId)] || [];
    setSelecionados(new Set(idsValidos(ids)));
  }, [escopo, centroCustoId, configuracao]);

  const tiposVisiveis = useMemo(() => {
    const termo = textoBusca(busca);
    return configuracao.tipos.filter((tipo) => {
      if (tipo?.comportamento?.somente_sistema === true) return false;
      if (!termo) return true;
      return textoBusca(`${tipo.nome} ${tipo.codigo_interno}`).includes(termo);
    });
  }, [busca, configuracao.tipos]);

  function alternarTipo(tipoId) {
    const id = Number(tipoId);
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function marcarVisiveis(valor) {
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      tiposVisiveis.forEach((tipo) => {
        if (tipo.ativo !== false) {
          if (valor) proximo.add(Number(tipo.id));
          else proximo.delete(Number(tipo.id));
        }
      });
      return proximo;
    });
  }

  async function salvar() {
    if (escopo === 'CENTRO_CUSTO' && !centroCustoId) {
      avisar.alerta('Selecione um Centro de Custo.');
      return;
    }
    try {
      setSalvando(true);
      const tipos = [...selecionados].sort((a, b) => a - b);
      await salvarTiposSolicitacaoPorDestino({
        escopo,
        centro_custo_id: escopo === 'CENTRO_CUSTO' ? Number(centroCustoId) : undefined,
        tipos
      });
      await carregar();
      avisar.sucesso('Tipos disponíveis atualizados.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar a disponibilidade dos tipos.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Pagina>
      <PageHeader
        titulo="Tipos por Obra/Centro de Custo"
        contagem={`${selecionados.size} selecionado(s)`}
        descricao="Defina o catálogo da Nova Solicitação. Obras compartilham uma lista; cada Centro de Custo possui sua própria seleção."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuração',
          onClick: salvar,
          desabilitada: salvando || carregando || (escopo === 'CENTRO_CUSTO' && !centroCustoId)
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Disponibilidade na Nova Solicitação" variante="primario" cor="var(--c-primary)">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Escopo do catálogo">
            <button
              type="button"
              className={`btn btn-sm ${escopo === 'OBRA' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setEscopo('OBRA')}
            >
              Todas as Obras
            </button>
            <button
              type="button"
              className={`btn btn-sm ${escopo === 'CENTRO_CUSTO' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setEscopo('CENTRO_CUSTO')}
            >
              Centro de Custo específico
            </button>
          </div>

          {escopo === 'CENTRO_CUSTO' && (
            <CampoForm label="Centro de Custo" obrigatorio>
              <select className="input input-sm w-full" value={centroCustoId} onChange={(e) => setCentroCustoId(e.target.value)}>
                <option value="">Selecione</option>
                {configuracao.centros_custo.map((item) => (
                  <option key={item.id} value={item.id}>
                    {[item.codigo, item.nome].filter(Boolean).join(' - ')}
                  </option>
                ))}
              </select>
            </CampoForm>
          )}

          <div className="flex flex-col gap-2 border-y border-[var(--c-border)] py-3 md:flex-row md:items-center">
            <input
              className="input input-sm min-w-0 flex-1"
              placeholder="Buscar tipo por nome ou código"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => marcarVisiveis(true)}>Marcar visíveis</button>
              <button type="button" className="btn btn-outline btn-sm" onClick={() => marcarVisiveis(false)}>Desmarcar visíveis</button>
            </div>
          </div>

          {carregando ? (
            <p className="app-note">Carregando tipos...</p>
          ) : tiposVisiveis.length === 0 ? (
            <p className="app-note">Nenhum tipo encontrado.</p>
          ) : (
            <div className="divide-y divide-[var(--c-border)] rounded-lg border border-[var(--c-border)]">
              {tiposVisiveis.map((tipo) => {
                const ativo = tipo.ativo !== false;
                return (
                  <label key={tipo.id} className={`flex items-start gap-3 px-3 py-3 ${ativo ? 'cursor-pointer' : 'opacity-60'}`}>
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selecionados.has(Number(tipo.id))}
                      disabled={!ativo}
                      onChange={() => alternarTipo(tipo.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-[var(--c-text)]">{tipo.nome}</span>
                      <span className="block text-xs text-[var(--c-muted)]">
                        {tipo.codigo_interno || 'Sem código interno'}{ativo ? '' : ' · Tipo inativo'}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <p className="app-note">
            Subtipos ativos acompanham o tipo macro. Um Centro de Custo sem tipos marcados não poderá abrir solicitações até ser configurado.
          </p>
        </div>
      </BlocoConteudo>
    </Pagina>
  );
}
