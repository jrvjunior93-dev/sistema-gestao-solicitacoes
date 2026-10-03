import { useEffect, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import { getSetores } from '../services/setores';
import {
  CATALOGO_ACOES_PRINCIPAIS,
  getAcoesPrincipais,
  criarAcaoPrincipal,
  atualizarAcaoPrincipal,
  excluirAcaoPrincipal
} from '../services/acoesPrincipais';

// =====================================================================
// AÇÃO PRINCIPAL POR SETOR — Configurações
// ---------------------------------------------------------------------
// Mapeia setor + estado (status_global) → ação em destaque no topo do
// detalhe da solicitação. Estado vazio = qualquer estado (curinga); o
// match mais específico vence. Sem mapeamento, o detalhe mantém as ações
// genéricas atuais. O catálogo referencia SOMENTE ações que a tela de
// detalhe já executa — nada de regra nova.
//
// FORMULÁRIO INLINE — POR QUÊ (R9 revista em 04/09; NÃO mover para modal)
// ---------------------------------------------------------------------
// O critério da R9 é a INTERRUPÇÃO, não a frequência: modal é para o
// cadastro que interrompe outro trabalho (criar um credor no meio de uma
// solicitação); em tela que existe PARA cadastrar, o formulário fica na
// tela. Aplicando o teste da regra: tire o formulário daqui e sobra uma
// lista de mapeamentos que ninguém abriria por si só — quem entra em
// "Ação principal por setor" vem mapear setor → ação. O formulário É a
// tela, e escondê-lo atrás de um botão obriga a abrir e fechar um modal
// para fazer exatamente aquilo que se veio fazer.
// Em 04/09 esta tela chegou a ir para OverlayModal citando a versão
// ANTIGA da R9 ("cadastro esporádico abre em modal"), que media o sintoma
// (raro) em vez da causa (interrompe). A regra foi corrigida e isto aqui é
// a reversão — não "conserte" de volta para modal.
// =====================================================================

function formVazio() {
  return { setor: '', status_global: '', acao: '', rotulo: '' };
}

// UM rótulo de ação para a tela inteira: a coluna "Ação" da lista e a
// pergunta de exclusão precisam dizer a MESMA palavra — quem leu
// "Aprovar cotação" na linha não pode ser questionado sobre
// "aprovar_cotacao". Depende só do catálogo importado, por isso vive no
// módulo e não dentro do componente.
function rotuloAcao(valor) {
  return CATALOGO_ACOES_PRINCIPAIS.find((acao) => acao.valor === valor)?.rotulo || valor;
}

export default function ConfiguracoesAcoesPrincipais() {
  const [itens, setItens] = useState([]);
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // O formulário existe SEMPRE (não há mais estado "fechado"): ele é o
  // trabalho da tela, não um episódio dela.
  const [form, setForm] = useState(formVazio());
  // R3/R19: erro de carga, de validação e de gravação passam pela faixa de
  // avisos do sistema — a caixa do navegador ignorava tema e tokens,
  // bloqueava a página e sumia sem deixar rastro no DOM.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  async function carregar() {
    try {
      setCarregando(true);
      const [lista, listaSetores] = await Promise.all([
        getAcoesPrincipais(),
        getSetores().catch(() => [])
      ]);
      setItens(lista);
      setSetores(Array.isArray(listaSetores) ? listaSetores : []);
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function adicionar() {
    if (!form.setor || !form.acao) {
      avisar.erro('Informe o setor e a ação.');
      return;
    }
    try {
      setSalvando(true);
      await criarAcaoPrincipal(form);
      setForm(formVazio());
      await carregar();
      avisar.sucesso('Mapeamento adicionado.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao criar mapeamento');
    } finally {
      setSalvando(false);
    }
  }

  async function alternarAtivo(item) {
    try {
      await atualizarAcaoPrincipal(item.id, { ativo: !item.ativo });
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao atualizar');
    }
  }

  async function excluir(item) {
    // R26: o alvo já chega FIXADO como parâmetro da linha clicada e é ele
    // que a mensagem cita e que a exclusão usa — nada é relido do estado
    // depois do `await`. Isso importa porque o modal do sistema NÃO
    // bloqueia a página como o `window.confirm` bloqueava: a lista segue
    // montada e pode até recarregar enquanto a pergunta está aberta.
    // O CONTEÚDO do mapeamento é a ação em destaque — sem ela a pergunta
    // descreve só onde a regra vale, nunca o que se perde. O rótulo é o
    // mesmo que a coluna "Ação" mostra, e é fixado aqui junto da descrição,
    // antes do `await`.
    const descricao = `${item.setor}${item.status_global ? ` + "${item.status_global}"` : ''}`;
    const acaoAlvo = rotuloAcao(item.acao);
    const { ok } = await confirmar({
      titulo: 'Excluir mapeamento',
      mensagem: `Excluir o mapeamento de ${descricao}, que hoje destaca a ação "${acaoAlvo}"? Esta ação não pode ser desfeita — para voltar a destacar essa ação será preciso cadastrar o mapeamento de novo.`,
      rotuloConfirmar: 'Excluir mapeamento',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirAcaoPrincipal(item.id);
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao excluir');
    }
  }

  return (
    <Pagina>
      {/* C1/R13: título, contagem e apoio na faixa fixa do topo.
          A ação principal deixou de ser "Novo mapeamento" (que só abria o
          modal e, sem modal, seria botão sem função): a faixa passa a levar
          o GRAVAR da tela — numa tela cujo trabalho é cadastrar, é a ação
          de gravar que precisa estar sempre a um clique (R13), inclusive
          com a lista longa rolada. Ela é a única cópia do botão: repetir o
          mesmo "Adicionar" dentro do bloco seria dois donos da mesma
          responsabilidade (R16). */}
      <PageHeader
        titulo="Ação principal por setor"
        contagem={carregando ? null : `${itens.length} mapeamento(s)`}
        descricao="Define qual ação aparece em destaque no topo da solicitação para cada setor e estado. Estado em branco vale para qualquer estado; o mapeamento mais específico vence. Sem mapeamento, a tela mantém as ações genéricas — e a ação só é destacada para quem tem permissão de executá-la."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando…' : 'Adicionar mapeamento',
          onClick: adicionar,
          desabilitada: salvando
        }}
      />

      {/* R16: UM dono para a faixa de avisos. Com o formulário inline não
          há mais fundo escuro para escondê-la — validação, gravação e carga
          reportam todas no mesmo lugar, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* ARRANJO: formulário ACIMA da lista, os dois em largura cheia — não
          em duas colunas. A tabela tem cinco colunas mais a de ações e, pela
          R1, cada coluna textual pede no mínimo 160px: em meia tela ela
          entraria em rolagem horizontal permanente. O formulário, por sua
          vez, são duas linhas de dois campos — ocupa pouco da primeira
          dobra e devolve a largura inteira para a lista logo abaixo. */}
      <BlocoConteudo
        titulo="Novo mapeamento"
        descricao="Escolha o setor, o estado em que a regra vale e a ação que deve aparecer em destaque."
      >
        {/* R12: estes selects são entrada de FORMULÁRIO (o dado que está
            sendo cadastrado), não filtro de lista. */}
        <FormSecao legenda="Quando destacar" colunas={2}>
          <CampoForm label="Setor" obrigatorio>
            <select
              className="input w-full"
              value={form.setor}
              onChange={(event) => setForm((prev) => ({ ...prev, setor: event.target.value }))}
            >
              <option value="">Selecione…</option>
              {setores.map((setor) => (
                <option key={setor.id} value={setor.codigo || setor.nome}>
                  {setor.nome}
                </option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Estado (status global)" hint="Vazio = qualquer estado.">
            <input
              className="input w-full"
              type="text"
              placeholder="Vazio = qualquer estado"
              value={form.status_global}
              onChange={(event) => setForm((prev) => ({ ...prev, status_global: event.target.value }))}
            />
          </CampoForm>
        </FormSecao>

        <FormSecao legenda="O que destacar" colunas={2}>
          <CampoForm label="Ação em destaque" obrigatorio>
            <select
              className="input w-full"
              value={form.acao}
              onChange={(event) => setForm((prev) => ({ ...prev, acao: event.target.value }))}
            >
              <option value="">Selecione…</option>
              {CATALOGO_ACOES_PRINCIPAIS.map((acao) => (
                <option key={acao.valor} value={acao.valor}>{acao.rotulo}</option>
              ))}
            </select>
          </CampoForm>
          <CampoForm label="Rótulo do botão (opcional)">
            <input
              className="input w-full"
              type="text"
              placeholder="Ex.: Gerar conta"
              value={form.rotulo}
              onChange={(event) => setForm((prev) => ({ ...prev, rotulo: event.target.value }))}
            />
          </CampoForm>
        </FormSecao>

        <div className="app-actionbar">
          <button type="button" className="btn btn-outline" onClick={() => setForm(formVazio())}>
            Limpar campos
          </button>
        </div>
      </BlocoConteudo>

      {/* B2: a listagem continua sendo o bloco primário da tela — é ela que
          mostra o efeito do cadastro —, com a barra de cor do primário. */}
      <BlocoConteudo
        titulo="Mapeamentos"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'setor',
              titulo: 'Setor',
              // R17: o setor é quem nomeia o mapeamento desta lista.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.setor
            },
            {
              id: 'status_global',
              titulo: 'Estado',
              tipo: 'texto',
              render: (item) => (
                item.status_global || <em className="text-[var(--c-muted)]">qualquer estado</em>
              )
            },
            {
              id: 'acao',
              titulo: 'Ação',
              tipo: 'texto',
              render: (item) => rotuloAcao(item.acao)
            },
            {
              id: 'rotulo',
              titulo: 'Rótulo',
              tipo: 'texto',
              render: (item) => item.rotulo || '-'
            },
            {
              id: 'ativo',
              sempreVisivel: true,
              titulo: 'Ativo',
              tipo: 'status',
              render: (item) => (
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(item.ativo)} onChange={() => alternarAtivo(item)} />
                  <span>{item.ativo ? 'Sim' : 'Não'}</span>
                </label>
              )
            }
          ]}
          itens={itens}
          getId={(item) => item.id}
          carregando={carregando}
          storageKey="tabela:configuracoes-acoes-principais"
          rotuloRolagem="Mapeamentos de ação principal"
          vazio="Nenhum mapeamento — o detalhe da solicitação segue com as ações genéricas."
          acoesLinha={(item) => (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => excluir(item)}>
              Excluir
            </button>
          )}
          larguraAcoes={120}
        />
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
