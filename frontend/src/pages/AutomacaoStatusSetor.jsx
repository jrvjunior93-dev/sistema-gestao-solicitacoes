import { useEffect, useMemo, useState } from 'react';
import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi2';
import { getSetores } from '../services/setores';
import { getTiposSolicitacao } from '../services/tiposSolicitacao';
import { getStatusSetor } from '../services/statusSetor';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import {
  getAutomacaoStatusSetor,
  salvarAutomacaoStatusSetor
} from '../services/configuracoesSistema';

function criarLinhaVazia() {
  return {
    chave_local: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    tipo_solicitacao_id: '',
    status: '',
    setor_destino: ''
  };
}

function normalizarStatus(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_');
}

const DESCRICAO = 'Envia a solicitacao automaticamente para outro setor quando uma combinacao de tipo e status for atingida.';

export default function AutomacaoStatusSetor() {
  const [setores, setSetores] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [statusOptions, setStatusOptions] = useState([]);
  const [regras, setRegras] = useState([criarLinhaVazia()]);
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // R3/R19: carregamento, salvamento e erro viram faixa do sistema — a caixa
  // do navegador nao existe no DOM, o harness nao a mede e ela some sem rastro.
  const { avisos, avisar, fechar } = useAvisos();
  // CONSENTIMENTO: remover regra apagava a linha sem perguntar, e a linha
  // apagada nao volta na tela — nao ha desfazer nem recarga que a traga
  // enquanto a configuracao nao for salva de novo.
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    async function carregar() {
      try {
        setLoading(true);
        const [setoresData, tiposData, statusData, configuracao] = await Promise.all([
          getSetores(),
          getTiposSolicitacao(),
          getStatusSetor(),
          getAutomacaoStatusSetor()
        ]);

        const statusUnicos = Array.from(
          new Map(
            (Array.isArray(statusData) ? statusData : [])
              .filter(item => item?.ativo !== false && String(item?.nome || '').trim())
              .map(item => [normalizarStatus(item.nome), String(item.nome || '').trim()])
          ).entries()
        ).map(([value, label]) => ({ value, label }));

        const regrasConfiguradas = Array.isArray(configuracao?.regras)
          ? configuracao.regras.map(regra => ({
            chave_local: `${regra.tipo_solicitacao_id}-${regra.status}-${regra.setor_destino}`,
            tipo_solicitacao_id: String(regra.tipo_solicitacao_id || ''),
            status: String(regra.status || ''),
            setor_destino: String(regra.setor_destino || '')
          }))
          : [];

        setSetores(Array.isArray(setoresData) ? setoresData.filter(item => item?.ativo !== false) : []);
        setTipos(Array.isArray(tiposData) ? tiposData : []);
        setStatusOptions(statusUnicos.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')));
        setRegras(regrasConfiguradas.length ? regrasConfiguradas : [criarLinhaVazia()]);
      } catch (error) {
        console.error(error);
        avisar.erro('Erro ao carregar automação por status.');
      } finally {
        setLoading(false);
      }
    }

    carregar();
  }, []);

  const tiposOrdenados = useMemo(() => (
    [...tipos].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'))
  ), [tipos]);

  const setoresOrdenados = useMemo(() => (
    [...setores].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'))
  ), [setores]);

  function atualizarRegra(chaveLocal, campo, valor) {
    setRegras(prev => prev.map(regra => (
      regra.chave_local === chaveLocal ? { ...regra, [campo]: valor } : regra
    )));
  }

  function adicionarLinha() {
    setRegras(prev => [...prev, criarLinhaVazia()]);
  }

  // Descreve a regra na linguagem da tela, para a confirmacao citar o que a
  // pessoa esta vendo (id de tipo e codigo de setor nao dizem nada a ela).
  function descreverRegra(regra) {
    const tipo = tiposOrdenados.find(item => String(item.id) === String(regra.tipo_solicitacao_id))?.nome;
    const status = statusOptions.find(item => item.value === regra.status)?.label || regra.status;
    const setor = setoresOrdenados
      .find(item => String(item.codigo || '').trim().toUpperCase() === String(regra.setor_destino || '').toUpperCase())?.nome
      || regra.setor_destino;
    return [tipo, status, setor].filter(Boolean).join(' → ');
  }

  function removerDaLista(chaveLocal) {
    setRegras(prev => {
      const restantes = prev.filter(regra => regra.chave_local !== chaveLocal);
      return restantes.length ? restantes : [criarLinhaVazia()];
    });
  }

  async function removerLinha(regra) {
    // R26: a regra sai numa const ANTES do await. O modal do sistema nao
    // bloqueia a tela (o confirm do navegador bloqueava), entao reler o
    // estado depois da confirmacao faria a tela perguntar sobre uma regra e
    // apagar outra — consentimento valido para a acao errada.
    const alvo = regra;
    // Linha em branco nao guarda nada: pedir consentimento para nao perder
    // nada e so atrito. A confirmacao protege o que a pessoa digitou.
    const vazia = !alvo.tipo_solicitacao_id && !alvo.status && !alvo.setor_destino;
    if (!vazia) {
      const texto = descreverRegra(alvo);
      const { ok } = await confirmar({
        titulo: 'Remover regra',
        mensagem: `Remover a regra ${texto}? Esta acao nao pode ser desfeita: a regra sai da tela e, para recupera-la, sera preciso monta-la de novo.`,
        rotuloConfirmar: 'Remover',
        destrutiva: true
      });
      if (!ok) return;
    }
    removerDaLista(alvo.chave_local);
  }

  async function salvar() {
    const payload = regras
      .map(regra => ({
        tipo_solicitacao_id: Number(regra.tipo_solicitacao_id),
        status: String(regra.status || '').trim(),
        setor_destino: String(regra.setor_destino || '').trim()
      }))
      .filter(regra => regra.tipo_solicitacao_id && regra.status && regra.setor_destino);

    try {
      setSalvando(true);
      await salvarAutomacaoStatusSetor({ regras: payload });
      avisar.sucesso('Configuração salva com sucesso.');
    } catch (error) {
      console.error(error);
      avisar.erro(error?.message || 'Erro ao salvar automacao por status.');
    } finally {
      setSalvando(false);
    }
  }

  // Conta so o que o salvar de fato envia: linha pela metade nao e regra.
  const regrasCompletas = regras.filter(regra => (
    regra.tipo_solicitacao_id && regra.status && regra.setor_destino
  )).length;

  // B5: no carregamento o texto tambem tem superficie — antes era uma frase
  // crua sobre o canvas, sem titulo e sem cabecalho.
  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Automação de Envio por Status" descricao={DESCRICAO} />
        <Avisos avisos={avisos} aoFechar={fechar} />
        <BlocoConteudo titulo="Regras de envio" variante="primario" cor="var(--c-primary)">
          <p className="app-note">Carregando configurações...</p>
        </BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/* C1/C2/R5: titulo e apoio na faixa fixa, com superficie propria — o
          p.page-subtitle solto sobre o canvas saiu.
          R10: o ritmo vertical (o space-y-6 da raiz) e do Pagina.
          C5: as duas acoes moravam no rodape do bloco; com muitas regras a
          pagina fica longa e elas sumiam da vista. No cabecalho fixo o
          primario ("Salvar configuracao") esta sempre a um clique, e
          "Adicionar regra" fica como secundaria em contorno. */}
      <PageHeader
        titulo="Automação de Envio por Status"
        contagem={`${regrasCompletas} regra(s) configurada(s)`}
        descricao={DESCRICAO}
        secundarias={[{
          rotulo: 'Adicionar regra',
          onClick: adicionarLinha,
          icone: <HiOutlinePlus aria-hidden="true" />
        }]}
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuracao',
          onClick: salvar,
          desabilitada: salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo titulo="Regras de envio" variante="primario" cor="var(--c-primary)">
        <div className="space-y-4">
          {regras.map(regra => (
            <div key={regra.chave_local} className="grid grid-cols-1 xl:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end rounded-2xl border border-[var(--c-border)] p-4">
              {/* R12: os tres selects sao ENTRADA DE DADO da regra (o que se
                  esta cadastrando), nao recorte de lista — select de
                  formulario segue legitimo. */}
              <label className="form-field">
                <span className="form-label">Tipo de solicitação</span>
                <select className="input" value={regra.tipo_solicitacao_id} onChange={event => atualizarRegra(regra.chave_local, 'tipo_solicitacao_id', event.target.value)}>
                  <option value="">Selecione</option>
                  {tiposOrdenados.map(tipo => (
                    <option key={tipo.id} value={String(tipo.id)}>{tipo.nome}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Status gatilho</span>
                <select className="input" value={regra.status} onChange={event => atualizarRegra(regra.chave_local, 'status', event.target.value)}>
                  <option value="">Selecione</option>
                  {statusOptions.map(status => (
                    <option key={status.value} value={status.value}>{status.label}</option>
                  ))}
                </select>
              </label>

              <label className="form-field">
                <span className="form-label">Setor destino</span>
                <select className="input" value={regra.setor_destino} onChange={event => atualizarRegra(regra.chave_local, 'setor_destino', event.target.value)}>
                  <option value="">Selecione</option>
                  {setoresOrdenados.map(setor => {
                    const codigo = String(setor.codigo || '').trim().toUpperCase();
                    return <option key={setor.id} value={codigo}>{setor.nome} ({codigo})</option>;
                  })}
                </select>
              </label>

              <button type="button" className="btn btn-outline inline-flex items-center gap-2" onClick={() => removerLinha(regra)}>
                <HiOutlineTrash aria-hidden="true" />
                Remover
              </button>
            </div>
          ))}
        </div>
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
