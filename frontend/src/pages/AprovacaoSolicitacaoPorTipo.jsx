import { useEffect, useMemo, useState } from 'react';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import { getStatusSetor } from '../services/statusSetor';
import {
  getAprovacaoSolicitacaoPorTipo,
  salvarAprovacaoSolicitacaoPorTipo
} from '../services/configuracoesSistema';
import {
  Avisos,
  BlocoConteudo,
  Pagina,
  PageHeader,
  useAvisos
} from '../components/padrao';

function normalizar(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

function tipoEhSolicitacaoCompra(tipo) {
  const codigo = normalizar(tipo?.codigo_interno || tipo?.nome);
  return codigo === 'SOLICITACAO_DE_COMPRA' || codigo === 'SOLICITACAO_COMPRA';
}

function encontrarSetorCompras(setores = []) {
  return setores.find((setor) => (
    setor?.eh_setor_compras === true ||
    [setor?.codigo, setor?.nome].filter(Boolean).some((valor) => normalizar(valor) === 'COMPRAS')
  ));
}

function encontrarSetorGeo(setores = []) {
  return setores.find((setor) => (
    setor?.eh_setor_geo === true ||
    [setor?.codigo, setor?.nome]
      .filter(Boolean)
      .some((valor) => ['GEO', 'GERENCIA_DE_PROCESSOS', 'GERENCIA_PROCESSOS'].includes(normalizar(valor)))
  ));
}

function sugerirDestinoCompra(regrasAtuais = {}, tiposAtivos = [], setoresAtivos = []) {
  const tipoCompra = tiposAtivos.find(tipoEhSolicitacaoCompra);
  const setorCompras = encontrarSetorCompras(setoresAtivos);
  if (!tipoCompra || !setorCompras || regrasAtuais[String(tipoCompra.id)]) return regrasAtuais;

  return {
    ...regrasAtuais,
    [String(tipoCompra.id)]: {
      setor_destino: String(setorCompras.codigo || setorCompras.nome || '').trim().toUpperCase(),
      status_destino: ''
    }
  };
}

const DESCRICAO = 'Defina para onde cada tipo segue depois da aprovação e qual status do GEO será aplicado na chegada.';

export default function AprovacaoSolicitacaoPorTipo() {
  const [tipos, setTipos] = useState([]);
  const [setores, setSetores] = useState([]);
  const [etapas, setEtapas] = useState([]);
  const [regras, setRegras] = useState({});
  const [tiposAlterados, setTiposAlterados] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [tiposData, setoresData, etapasData, config] = await Promise.all([
          getTiposSolicitacao(),
          getSetores(),
          getStatusSetor(),
          getAprovacaoSolicitacaoPorTipo()
        ]);
        const regrasCarregadas = {};
        (Array.isArray(config?.regras) ? config.regras : []).forEach((regra) => {
          regrasCarregadas[String(regra.tipo_solicitacao_id)] = {
            setor_destino: String(regra.setor_destino || ''),
            status_destino: String(regra.status_destino || '')
          };
        });
        const tiposAtivos = (Array.isArray(tiposData) ? tiposData : []).filter((tipo) => tipo?.ativo !== false);
        const setoresAtivos = (Array.isArray(setoresData) ? setoresData : []).filter((setor) => setor?.ativo !== false);
        setTipos(tiposAtivos);
        setSetores(setoresAtivos);
        setEtapas((Array.isArray(etapasData) ? etapasData : []).filter((etapa) => etapa?.ativo !== false));
        setRegras(sugerirDestinoCompra(regrasCarregadas, tiposAtivos, setoresAtivos));
        setTiposAlterados(new Set());
      } catch (error) {
        console.error(error);
        avisar.erro(error?.message || 'Erro ao carregar os fluxos de aprovação.');
      } finally {
        setLoading(false);
      }
    }
    carregar();
  }, []);

  const tiposOrdenados = useMemo(() => (
    [...tipos].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  ), [tipos]);

  const setoresOrdenados = useMemo(() => (
    [...setores].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'))
  ), [setores]);

  const setorGeo = useMemo(() => encontrarSetorGeo(setoresOrdenados), [setoresOrdenados]);

  const statusDoGeo = useMemo(() => {
    if (!setorGeo) return [];
    const tokens = new Set([setorGeo.codigo, setorGeo.nome].filter(Boolean).map(normalizar));
    return etapas
      .filter((etapa) => tokens.has(normalizar(etapa.setor)))
      .sort((a, b) => Number(a.ordem || 0) - Number(b.ordem || 0));
  }, [etapas, setorGeo]);

  function alterarSetor(tipo, setorDestino) {
    const tipoId = String(tipo.id);
    setTiposAlterados((atuais) => new Set(atuais).add(tipoId));
    setRegras((atual) => ({
      ...atual,
      [tipoId]: {
        setor_destino: setorDestino,
        status_destino: ''
      }
    }));
  }

  function alterarStatus(tipoId, statusDestino) {
    const chave = String(tipoId);
    setTiposAlterados((atuais) => new Set(atuais).add(chave));
    setRegras((atual) => ({
      ...atual,
      [chave]: {
        setor_destino: atual[chave]?.setor_destino || '',
        status_destino: statusDestino
      }
    }));
  }

  async function salvar() {
    const tiposEditados = tiposOrdenados.filter((tipo) => tiposAlterados.has(String(tipo.id)));
    if (tiposEditados.length === 0) {
      avisar.informacao('Nenhuma alteração para salvar.');
      return;
    }

    const incompletos = tiposEditados.filter((tipo) => {
      const regra = regras[String(tipo.id)] || {};
      if (tipoEhSolicitacaoCompra(tipo) && regra.setor_destino && !regra.status_destino) {
        return false;
      }
      return Boolean(regra.setor_destino) !== Boolean(regra.status_destino);
    });
    if (incompletos.length > 0) {
      avisar.erro(`Informe setor e status juntos para: ${incompletos.map((tipo) => tipo.nome).join(', ')}.`);
      return;
    }

    const alteracoes = tiposEditados.map((tipo) => {
      const regra = regras[String(tipo.id)] || {};
      const remover = tipoEhSolicitacaoCompra(tipo)
        ? !regra.status_destino
        : !regra.setor_destino && !regra.status_destino;
      return {
        tipo_solicitacao_id: Number(tipo.id),
        setor_destino: regra.setor_destino || '',
        status_destino: regra.status_destino || '',
        remover
      };
    });

    try {
      setSalvando(true);
      const resposta = await salvarAprovacaoSolicitacaoPorTipo({ alteracoes });
      const regrasSalvas = {};
      (Array.isArray(resposta?.regras) ? resposta.regras : []).forEach((regra) => {
        regrasSalvas[String(regra.tipo_solicitacao_id)] = {
          setor_destino: regra.setor_destino,
          status_destino: regra.status_destino
        };
      });
      setRegras(sugerirDestinoCompra(regrasSalvas, tipos, setores));
      setTiposAlterados(new Set());
      avisar.sucesso('Fluxos de aprovação salvos com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar os fluxos de aprovação.');
    } finally {
      setSalvando(false);
    }
  }

  const configurados = Object.values(regras).filter(
    (regra) => regra?.setor_destino && regra?.status_destino
  ).length;

  return (
    <Pagina>
      <PageHeader
        titulo="Aprovação por Tipo"
        contagem={`${configurados} tipo(s) configurado(s)`}
        descricao={DESCRICAO}
        acaoPrincipal={{
          rotulo: salvando
            ? 'Salvando...'
            : tiposAlterados.size > 0
              ? `Salvar ${tiposAlterados.size} alteração(ões)`
              : 'Salvar configuração',
          onClick: salvar,
          desabilitada: loading || salvando || tiposAlterados.size === 0
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Destino após aprovação"
        descricao="O botão Aprovar solicitação aparece no detalhe enquanto o registro está no GEO. O destino define para onde ela segue; o status é escolhido entre os status ativos do GEO."
        variante="primario"
        cor="var(--c-primary)"
      >
        {loading ? (
          <p className="app-note">Carregando configurações...</p>
        ) : (
          <div className="space-y-3">
            {tiposOrdenados.map((tipo) => {
              const regra = regras[String(tipo.id)] || {};
              const compra = tipoEhSolicitacaoCompra(tipo);
              const opcoesStatus = statusDoGeo;
              const statusAtualEstaAtivo = !regra.status_destino || opcoesStatus.some(
                (etapa) => normalizar(etapa.nome) === normalizar(regra.status_destino)
              );
              return (
                <div
                  key={tipo.id}
                  className="grid grid-cols-1 gap-3 rounded-2xl border border-[var(--c-border)] p-4 lg:grid-cols-3 lg:items-end"
                >
                  <div className="min-w-0">
                    <p className="font-semibold text-[var(--c-text)]">{tipo.nome}</p>
                    <p className="app-note mt-1">
                      {compra
                        ? regra.status_destino
                          ? 'Fluxo operacional de Compras configurado.'
                          : 'Compras já está definido. Escolha um status apenas quando quiser ativar esta aprovação.'
                        : regra.setor_destino
                          ? 'Aprovação configurada.'
                          : 'Sem aprovação configurada.'}
                    </p>
                    {!statusAtualEstaAtivo && (
                      <p className="mt-1 text-sm font-medium text-[var(--c-danger)]">
                        O status salvo não está mais ativo no GEO. Altere este tipo quando quiser corrigir o fluxo.
                      </p>
                    )}
                  </div>

                  <label className="form-field">
                    <span className="form-label">Setor destino</span>
                    <select
                      className="input w-full"
                      value={regra.setor_destino || ''}
                      onChange={(event) => alterarSetor(tipo, event.target.value)}
                      disabled={compra}
                    >
                      <option value="">Sem configuração</option>
                      {setoresOrdenados.map((setor) => (
                        <option key={setor.id} value={String(setor.codigo || setor.nome).toUpperCase()}>
                          {setor.nome}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span className="form-label">Status de chegada (GEO)</span>
                    <select
                      className="input w-full"
                      value={regra.status_destino || ''}
                      onChange={(event) => alterarStatus(tipo.id, event.target.value)}
                      disabled={!regra.setor_destino}
                    >
                      <option value="">Selecione</option>
                      {!statusAtualEstaAtivo && (
                        <option value={regra.status_destino}>
                          {String(regra.status_destino).replaceAll('_', ' ')} (inativo no GEO)
                        </option>
                      )}
                      {opcoesStatus.map((etapa) => (
                        <option key={etapa.id} value={normalizar(etapa.nome)}>{etapa.nome}</option>
                      ))}
                    </select>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </BlocoConteudo>
    </Pagina>
  );
}
