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
import { criarTipoSolicitacao } from '../services/tiposSolicitacao';
import { getDefaultTipoSolicitacaoBehavior } from '../utils/tipoSolicitacao';
import OverlayModal from '../components/ui/OverlayModal';
import { HiOutlinePlus } from 'react-icons/hi2';

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
    tipos_por_centro_custo: {},
    tipos_automaticos_por_centro_custo: {}
  });
  const [escopo, setEscopo] = useState('OBRA');
  const [centroCustoId, setCentroCustoId] = useState('');
  const [selecionados, setSelecionados] = useState(new Set());
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modalNovoTipoAberto, setModalNovoTipoAberto] = useState(false);
  const [novoTipoNome, setNovoTipoNome] = useState('');
  const [novoTipoCodigo, setNovoTipoCodigo] = useState('');
  const [criandoTipo, setCriandoTipo] = useState(false);
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
          : {},
        tipos_automaticos_por_centro_custo: data?.tipos_automaticos_por_centro_custo
          && typeof data.tipos_automaticos_por_centro_custo === 'object'
          ? data.tipos_automaticos_por_centro_custo
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
  const centroCustoAutomatico = escopo === 'CENTRO_CUSTO'
    && Boolean(configuracao.tipos_automaticos_por_centro_custo?.[String(centroCustoId)]);

  function alternarTipo(tipoId) {
    if (centroCustoAutomatico) return;
    const id = Number(tipoId);
    setSelecionados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function marcarVisiveis(valor) {
    if (centroCustoAutomatico) return;
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

  async function criarTipoNoEscopo(event) {
    event.preventDefault();
    const nome = String(novoTipoNome || '').trim();
    if (!nome) {
      avisar.alerta('Informe o nome do tipo de solicitação.');
      return;
    }
    if (escopo === 'CENTRO_CUSTO' && !centroCustoId) {
      avisar.alerta('Selecione o Centro de Custo antes de criar o tipo.');
      return;
    }

    try {
      setCriandoTipo(true);
      const criado = await criarTipoSolicitacao({
        nome,
        codigo_interno: String(novoTipoCodigo || '').trim(),
        comportamento: getDefaultTipoSolicitacaoBehavior(),
        disponivel_para_obras: escopo === 'OBRA'
      });

      const tiposDoEscopo = idsValidos([...selecionados, criado.id]);
      await salvarTiposSolicitacaoPorDestino({
        escopo,
        centro_custo_id: escopo === 'CENTRO_CUSTO' ? Number(centroCustoId) : undefined,
        tipos: tiposDoEscopo
      });

      setNovoTipoNome('');
      setNovoTipoCodigo('');
      setModalNovoTipoAberto(false);
      await carregar();
      avisar.sucesso('Tipo criado e disponibilizado no escopo selecionado. Ele poderá ser reutilizado em outras Obras e Centros de Custo.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar o tipo de solicitação.');
    } finally {
      setCriandoTipo(false);
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
          desabilitada: salvando || carregando || centroCustoAutomatico || (escopo === 'CENTRO_CUSTO' && !centroCustoId)
        }}
        secundarias={[{
          rotulo: 'Criar tipo',
          icone: <HiOutlinePlus className="h-4 w-4" aria-hidden="true" />,
          onClick: () => setModalNovoTipoAberto(true),
          desabilitada: carregando || centroCustoAutomatico || (escopo === 'CENTRO_CUSTO' && !centroCustoId),
          title: 'Criar um tipo reutilizável e adicioná-lo ao escopo atual'
        }]}
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

          {centroCustoAutomatico && (
            <p className="app-note">
              Este Centro de Custo possui um tipo automático e único. O tipo permanece no cadastro global para permitir a criação e o vínculo de subtipos.
            </p>
          )}

          <div className="flex flex-col gap-2 border-y border-[var(--c-border)] py-3 md:flex-row md:items-center">
            <input
              className="input input-sm min-w-0 flex-1"
              placeholder="Buscar tipo por nome ou código"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="btn btn-outline btn-sm" disabled={centroCustoAutomatico} onClick={() => marcarVisiveis(true)}>Marcar visíveis</button>
              <button type="button" className="btn btn-outline btn-sm" disabled={centroCustoAutomatico} onClick={() => marcarVisiveis(false)}>Desmarcar visíveis</button>
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
                      disabled={!ativo || centroCustoAutomatico}
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

      {modalNovoTipoAberto && (
        <OverlayModal
          rotulo="Criar tipo de solicitação"
          onFechar={criandoTipo ? undefined : () => setModalNovoTipoAberto(false)}
          fecharComEscape={!criandoTipo}
        >
          <div data-modal="cabecalho" className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--c-text)]">Novo tipo de solicitação</h3>
              <p className="text-sm text-[var(--c-muted)]">
                Será incluído em {escopo === 'OBRA' ? 'todas as Obras' : 'este Centro de Custo'} e continuará disponível para reutilização nos demais destinos.
              </p>
            </div>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => setModalNovoTipoAberto(false)} disabled={criandoTipo}>
              Fechar
            </button>
          </div>
          <form onSubmit={criarTipoNoEscopo} className="space-y-4 px-4 py-3">
            <FormSecao legenda="Identificação" colunas={2}>
              <CampoForm label="Nome do tipo" obrigatorio>
                <input
                  className="input w-full"
                  value={novoTipoNome}
                  onChange={(event) => setNovoTipoNome(event.target.value)}
                  placeholder="Ex.: Solicitação de serviço"
                  required
                  autoFocus
                />
              </CampoForm>
              <CampoForm label="Código interno" hint="Opcional; usado por integrações e regras internas.">
                <input
                  className="input w-full"
                  value={novoTipoCodigo}
                  onChange={(event) => setNovoTipoCodigo(event.target.value.toUpperCase())}
                  placeholder="Ex.: SOLICITACAO_SERVICO"
                />
              </CampoForm>
            </FormSecao>
            <p className="app-note">
              O cadastro é global. Aqui você apenas define que o novo tipo ficará disponível no destino selecionado; depois ele poderá ser marcado em outras Obras ou Centros de Custo.
            </p>
            <div data-modal="rodape" className="app-actionbar justify-end border-t border-[var(--c-border)] pt-3">
              <button type="button" className="btn btn-outline" onClick={() => setModalNovoTipoAberto(false)} disabled={criandoTipo}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={criandoTipo}>
                {criandoTipo ? 'Criando...' : 'Criar e disponibilizar'}
              </button>
            </div>
          </form>
        </OverlayModal>
      )}
    </Pagina>
  );
}
