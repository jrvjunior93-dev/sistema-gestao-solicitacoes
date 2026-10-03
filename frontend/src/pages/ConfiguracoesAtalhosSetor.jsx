import { useEffect, useMemo, useState } from 'react';
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
import { getAllDestinations } from '../navigation/navigationConfig';
import {
  getAtalhosSetor,
  criarAtalhoSetor,
  atualizarAtalhoSetor,
  excluirAtalhoSetor
} from '../services/atalhos';

// =====================================================================
// ATALHOS POR SETOR — Configurações
// ---------------------------------------------------------------------
// O admin define os atalhos com que cada setor começa. Até 2 podem ser
// OBRIGATÓRIOS (cadeado — o usuário não remove); os demais são sugestões
// removíveis. O destino referencia a fonte única de navegação: rótulo,
// ícone, rota e permissão vêm de lá — usuário sem acesso ao destino
// simplesmente não vê o atalho.
//
// FORMULÁRIO INLINE — POR QUÊ (R9 revista em 04/09; NÃO mover para modal)
// ---------------------------------------------------------------------
// A R9 mede INTERRUPÇÃO, não frequência: o modal existe para o cadastro
// que interrompe outro trabalho e precisa devolver a pessoa ao lugar de
// onde ela saiu. Aqui não há trabalho interrompido — esta tela existe PARA
// cadastrar atalho padrão. Teste da regra: tirando o formulário, sobra uma
// tabela de atalhos que ninguém abriria por si só; logo, o formulário é a
// tela e fica inline.
// Em 04/09 esta tela foi levada para OverlayModal citando a versão ANTIGA
// da R9 ("cadastro raro abre em modal") — critério pelo sintoma, não pela
// causa. A regra foi revista e esta é a reversão: não devolver para modal.
// =====================================================================

function formVazio() {
  return { setor: '', destino_id: '', obrigatorio: false, posicao: 0 };
}

export default function ConfiguracoesAtalhosSetor() {
  const [itens, setItens] = useState([]);
  const [setores, setSetores] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  // O formulário está sempre montado: é o trabalho da tela, não um
  // episódio dela — por isso não existe mais estado "aberto/fechado".
  const [form, setForm] = useState(formVazio());
  // R3/R19: aviso do sistema no lugar da caixa do navegador.
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  const destinos = useMemo(() => (
    getAllDestinations().sort((a, b) => `${a.moduleId} ${a.label}`.localeCompare(`${b.moduleId} ${b.label}`))
  ), []);
  const rotuloDestino = useMemo(() => {
    const mapa = new Map(destinos.map((destino) => [destino.id, `${destino.label} (${destino.moduleId})`]));
    return (id) => mapa.get(id) || id;
  }, [destinos]);

  async function carregar() {
    try {
      setCarregando(true);
      const [lista, listaSetores] = await Promise.all([
        getAtalhosSetor(),
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
    if (!form.setor || !form.destino_id) {
      avisar.erro('Informe o setor e o destino.');
      return;
    }
    try {
      setSalvando(true);
      await criarAtalhoSetor(form);
      setForm(formVazio());
      await carregar();
      avisar.sucesso('Atalho padrão adicionado.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao criar atalho');
    } finally {
      setSalvando(false);
    }
  }

  async function alternar(item, campo) {
    try {
      await atualizarAtalhoSetor(item.id, { [campo]: !item[campo] });
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao atualizar');
    }
  }

  async function excluir(item) {
    // R26: o atalho já chega FIXADO como parâmetro da linha clicada — a
    // mensagem cita e a exclusão usa a MESMA referência, nada é relido do
    // estado depois do `await`. O modal do sistema não bloqueia a página
    // como o `window.confirm` bloqueava: a lista segue montada e pode
    // recarregar enquanto a pergunta está aberta.
    const { ok } = await confirmar({
      titulo: 'Remover atalho padrão',
      mensagem: `Remover o atalho "${rotuloDestino(item.destino_id)}" do setor ${item.setor}? Esta ação não pode ser desfeita — para restabelecê-lo será preciso cadastrar o atalho de novo.`,
      rotuloConfirmar: 'Remover atalho',
      destrutiva: true
    });
    if (!ok) return;
    try {
      await excluirAtalhoSetor(item.id);
      await carregar();
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao excluir');
    }
  }

  return (
    <Pagina>
      {/* C1/R13: faixa fixa com título, contagem e apoio. A ação principal
          era "Novo atalho padrão", que só abria o modal — sem modal viraria
          botão sem função. No lugar dela vai o GRAVAR do cadastro, que é o
          trabalho da tela e o que a R13 quer sempre a um clique. Não há
          cópia do botão dentro do bloco: um dono por responsabilidade
          (R16). */}
      <PageHeader
        titulo="Atalhos por setor"
        contagem={carregando ? null : `${itens.length} atalho(s)`}
        descricao="Atalhos com que cada setor começa. Até 2 por setor podem ser obrigatórios — aparecem com cadeado, à esquerda dos pessoais, e o usuário não remove. Os demais são sugestões que o usuário pode remover ou reordenar; quem não tem permissão no destino não vê o atalho."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando…' : 'Adicionar atalho',
          onClick: adicionar,
          desabilitada: salvando
        }}
      />

      {/* R16: UM dono para a faixa de avisos — sem modal, validação, carga e
          gravação reportam todas aqui, logo abaixo do cabeçalho. */}
      <Avisos avisos={avisos} aoFechar={fechar} />

      {/* ARRANJO: formulário ACIMA da lista, ambos em largura cheia. Em duas
          colunas a tabela ficaria com metade da tela para cinco colunas mais
          a de ações — pela R1 (coluna textual mín. 160px) ela viveria em
          rolagem horizontal, e o destino, que é o texto mais longo da
          linha, é justamente o que precisa da sobra. O formulário são duas
          linhas de dois campos: custa pouca altura e não disputa largura. */}
      <BlocoConteudo
        titulo="Novo atalho padrão"
        descricao="Escolha o setor e o destino; a posição ordena os atalhos e o obrigatório vem com cadeado."
      >
        {/* R12: os dois selects são entrada de FORMULÁRIO — o setor e o
            destino que estão sendo cadastrados —, não filtro de lista. */}
        <FormSecao legenda="Atalho" colunas={2}>
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
          <CampoForm label="Destino" obrigatorio hint="Rótulo, ícone, rota e permissão vêm da fonte única de navegação.">
            <select
              className="input w-full"
              value={form.destino_id}
              onChange={(event) => setForm((prev) => ({ ...prev, destino_id: event.target.value }))}
            >
              <option value="">Selecione…</option>
              {destinos.map((destino) => (
                <option key={destino.id} value={destino.id}>
                  {destino.label} ({destino.moduleId})
                </option>
              ))}
            </select>
          </CampoForm>
        </FormSecao>

        <FormSecao legenda="Como aparece" colunas={2}>
          <CampoForm label="Posição">
            <input
              className="input w-full"
              type="number"
              min="0"
              value={form.posicao}
              onChange={(event) => setForm((prev) => ({ ...prev, posicao: Number(event.target.value) }))}
            />
          </CampoForm>
          <div className="form-campo--linha">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.obrigatorio}
                onChange={(event) => setForm((prev) => ({ ...prev, obrigatorio: event.target.checked }))}
              />
              Obrigatório (máx. 2 por setor)
            </label>
          </div>
        </FormSecao>

        <div className="app-actionbar">
          <button type="button" className="btn btn-outline" onClick={() => setForm(formVazio())}>
            Limpar campos
          </button>
        </div>
      </BlocoConteudo>

      {/* B2: a lista continua sendo o bloco primário — é onde o cadastro
          aparece feito —, com a barra de cor do primário. */}
      <BlocoConteudo
        titulo="Atalhos configurados"
        variante="primario"
        cor="var(--c-primary)"
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'setor',
              titulo: 'Setor',
              // R17: o setor é quem nomeia o atalho configurado.
              tipo: 'identidade',
              noCard: 'titulo',
              render: (item) => item.setor
            },
            {
              id: 'destino',
              titulo: 'Destino',
              tipo: 'texto',
              render: (item) => rotuloDestino(item.destino_id)
            },
            {
              id: 'posicao',
              titulo: 'Posição',
              tipo: 'numero',
              render: (item) => item.posicao
            },
            {
              id: 'obrigatorio',
              sempreVisivel: true,
              titulo: 'Obrigatório',
              tipo: 'status',
              render: (item) => (
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(item.obrigatorio)}
                    onChange={() => alternar(item, 'obrigatorio')}
                  />
                  <span>{item.obrigatorio ? 'Sim' : 'Não'}</span>
                </label>
              )
            },
            {
              id: 'ativo',
              sempreVisivel: true,
              titulo: 'Ativo',
              tipo: 'status',
              render: (item) => (
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={Boolean(item.ativo)}
                    onChange={() => alternar(item, 'ativo')}
                  />
                  <span>{item.ativo ? 'Sim' : 'Não'}</span>
                </label>
              )
            }
          ]}
          itens={itens}
          getId={(item) => item.id}
          carregando={carregando}
          storageKey="tabela:configuracoes-atalhos-setor"
          rotuloRolagem="Atalhos configurados por setor"
          vazio="Nenhum atalho configurado — cada setor recebe as sugestões padrão do sistema."
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
