import DateInputBR from '../../../components/DateInputBR';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { canCreateProvisionamentos } from '../../../utils/acessoProduto';
import { useWorkspaceClearPage, useWorkspaceState, useWorkspaceWork } from '../../../navigation/WorkspaceContext';
import useQueryRevision from '../../../navigation/useQueryRevision';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  FormSecao,
  Pagina,
  PageHeader,
  useAvisos
} from '../../../components/padrao';
import {
  criarProvisaoFinanceira,
  getProvisionamentoFinanceiroContexto,
  listarCategoriasMacroProvisionamento,
  uploadAnexosProvisaoFinanceira
} from '../../../services/provisoesFinanceiras';
import {
  formatarMoedaBRL,
  normalizarEntradaMoeda
} from '../utils/moeda';
import PendingAttachmentsList from '../../../components/attachments/PendingAttachmentsList';
import {
  UPLOAD_MAX_FILE_SIZE_MB_PADRAO,
  concatenarAnexosPendentes,
  extrairFilesAnexosPendentes,
  montarMensagemArquivosAcimaDoLimite
} from '../../../utils/pendingAttachments';

function formatarObra(obra) {
  if (!obra) return '-';
  return `${obra.codigo ? `${obra.codigo} - ` : ''}${obra.nome}`;
}

const FORM_INICIAL = { obra_id: '', data_prevista_desembolso: '', item_macro: '',
  descricao: '', valor_previsto: '', fornecedor_texto: '', prioridade: '' };

export default function NovaProvisaoFinanceira() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const permitido = canCreateProvisionamentos(user);
  const consulta = useQueryRevision(permitido);
  const mutex = useRef(false);
  const limparWorkspace = useWorkspaceClearPage();
  const { avisos, avisar, fechar } = useAvisos();
  const [contexto, setContexto] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState('');
  const [arquivosPendentes, setArquivosPendentes] = useWorkspaceState('provisao:nova:arquivos', []);
  const [form, setForm] = useWorkspaceState('provisao:nova:inputs', FORM_INICIAL);
  const valorPrevistoTexto = form.valor_previsto === '' ? '' : formatarMoedaBRL(form.valor_previsto);
  useWorkspaceWork(arquivosPendentes.length > 0 || Object.values(form).some(value => value !== ''), saving, 'provisao:nova:work');

  useEffect(() => {
    const token = consulta.begin();
    if (!permitido) { setContexto(null); setCategorias([]); setLoading(false); return; }
    async function carregar() {
      try {
        setLoading(true);
        setErroCarregamento('');
        const [contextoData, categoriasData] = await Promise.all([
          getProvisionamentoFinanceiroContexto(),
          listarCategoriasMacroProvisionamento()
        ]);
        if (!consulta.isCurrent(token)) return;
        setContexto(contextoData);
        setCategorias(Array.isArray(categoriasData) ? categoriasData : []);
      } catch (error) {
        if (!consulta.isCurrent(token)) return;
        console.error(error);
        setContexto(null); setCategorias([]);
        setErroCarregamento(error?.message || 'Erro ao carregar formulario de provisao.');
        avisar.erro(error?.message || 'Erro ao carregar formulario de provisao.');
      } finally {
        if (consulta.isCurrent(token)) setLoading(false);
      }
    }

    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permitido, consulta.begin, consulta.isCurrent]);

  const obrasCriacao = useMemo(() => (
    Array.isArray(contexto?.obras_criacao) ? contexto.obras_criacao : []
  ), [contexto]);
  const disponivel = permitido && !loading && !erroCarregamento && contexto?.permissoes?.pode_criar === true;
  const obraAtualDisponivel = !form.obra_id || obrasCriacao.some(obra => String(obra.id) === String(form.obra_id));

  function atualizarCampo(campo, valor) {
    if (mutex.current || !disponivel || !Object.hasOwn(FORM_INICIAL, campo)) return;
    setForm((atual) => ({ ...atual, [campo]: valor }));
  }

  function atualizarValorPrevisto(raw) {
    atualizarCampo('valor_previsto', normalizarEntradaMoeda(raw).valorNumerico);
  }

  function adicionarArquivos(files) {
    if (mutex.current || !disponivel) return;
    const { arquivos: proximoEstado, rejeitados } = concatenarAnexosPendentes(arquivosPendentes, files, {
      maxFileSizeMb: UPLOAD_MAX_FILE_SIZE_MB_PADRAO
    });
    setArquivosPendentes(proximoEstado);
    if (rejeitados.length > 0) {
      avisar.alerta(montarMensagemArquivosAcimaDoLimite(rejeitados, UPLOAD_MAX_FILE_SIZE_MB_PADRAO));
    }
  }

  function removerArquivoPendente(index) {
    if (mutex.current || !disponivel) return;
    setArquivosPendentes((atual) => atual.filter((_, itemIndex) => itemIndex !== index));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (mutex.current || !disponivel || !obraAtualDisponivel) return;

    if (!form.obra_id || !form.data_prevista_desembolso || !form.item_macro.trim() || !form.descricao.trim() || !form.valor_previsto) {
      avisar.erro('Preencha obra, data prevista, item macro, descrição e valor previsto.');
      return;
    }

    // Fixar campos e arquivos antes do primeiro await. Nenhuma criacao ou
    // upload acontece por restauracao; o servidor continua validando o escopo.
    const payload = { ...form, obra_id: Number(form.obra_id) };
    const files = extrairFilesAnexosPendentes(arquivosPendentes);
    const token = consulta.capture();
    mutex.current = true;
    try {
      setSaving(true);
      const provisao = await criarProvisaoFinanceira(payload);
      if (!consulta.isCurrent(token)) return;

      if (files.length) {
        try {
          await uploadAnexosProvisaoFinanceira(provisao.id, files);
        } catch (uploadError) {
          if (!consulta.isCurrent(token)) return;
          console.error(uploadError);
          /*
            O aviso do anexo NÃO pode virar a única notícia: a provisão já
            foi criada e a navegação abaixo troca de tela. Por isso ele não
            substitui o fluxo — mantém o mesmo comportamento de antes
            (avisar e seguir para o detalhe, onde o anexo pode ser reenviado).
          */
          avisar.alerta(uploadError?.message || 'A provisao foi criada, mas houve erro ao enviar os anexos.');
        }
      }

      if (!consulta.isCurrent(token)) return;
      setForm(FORM_INICIAL); setArquivosPendentes([]); limparWorkspace();
      navigate(`/provisoes-financeiras/${provisao.id}`);
    } catch (error) {
      if (!consulta.isCurrent(token)) return;
      console.error(error);
      avisar.erro(error?.message || 'Erro ao criar provisao.');
    } finally {
      mutex.current = false;
      if (consulta.isCurrent(token)) setSaving(false);
    }
  }

  if (!loading && !disponivel) return (
    <Pagina><PageHeader titulo="Nova Provisão" voltar={{ to: '/provisoes-financeiras', title: 'Voltar para provisoes' }} />
      <BlocoConteudo>{erroCarregamento || 'Criação de provisão indisponível para este usuário.'}</BlocoConteudo>
    </Pagina>
  );

  if (loading) {
    return (
      <Pagina>
        <PageHeader titulo="Nova Provisão" />
        <BlocoConteudo>Carregando formulário...</BlocoConteudo>
      </Pagina>
    );
  }

  return (
    <Pagina>
      {/*
        R5/C2 — título, contagem e apoio na faixa fixa; o `page-subtitle`
        solto que estava aqui é reprovado pelo validador.

        A barra de ações do PageHeader fica VAZIA de propósito: a ação
        principal desta tela é o SUBMIT do formulário, e botão de submit
        precisa estar dentro do <form> (fora dele viraria um clique que não
        valida nem envia). Ele vive no `app-actionbar` do rodapé do form,
        como no molde aprovado (ComercialUnidades).
      */}
      <PageHeader
        titulo="Nova Provisão"
        /* C3 (apontado pela matriz): tela de CADASTRO com rota propria tem
           registro-pai a que voltar — a listagem de onde se veio. E o inverso
           da listagem, onde a seta e redundante. */
        voltar={{ to: '/provisoes-financeiras', title: 'Voltar para provisoes' }}
        contagem={`${obrasCriacao.length} obra(s) disponível(is)`}
        descricao="Registre uma previsão gerencial de desembolso com os dados essenciais do compromisso."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />
      {!obraAtualDisponivel && <p role="alert" className="app-note">A obra selecionada não está disponível no contexto atual. Selecione uma obra disponível antes de criar a provisão.</p>}

      {/* R10: o ritmo vertical vem da escala — `gap-4` é o degrau de 16px, o
          mesmo vão que o `Pagina` dá entre blocos. O <form> precisa envolver
          os três blocos para que o submit alcance todos os campos. */}
      <form className="grid gap-4" onSubmit={handleSubmit}>
        <fieldset disabled={saving || !disponivel} className="grid min-w-0 gap-4">
        {/*
          R9 (revista em 04/09) — FORMULÁRIO INLINE, NÃO EM MODAL.
          Esta tela EXISTE para cadastrar a provisão: pelo teste da regra,
          tirando o formulário não sobra tela nenhuma. Modal aqui seria
          esconder atrás de um botão o motivo pelo qual a pessoa abriu a
          tela. Não mover para OverlayModal.
        */}
        <BlocoConteudo
          titulo="Dados da provisão"
          variante="primario"
          cor="var(--c-primary)"
        >
          <FormSecao legenda="Compromisso" colunas={2}>
            <CampoForm label="Obra" obrigatorio>
              {/* R12: select de FORMULÁRIO (entrada de dado do registro) é
                  legítimo — a regra vale para filtro de LISTA. */}
              <select
                aria-label="Obra"
                className="input w-full"
                value={form.obra_id}
                onChange={(event) => atualizarCampo('obra_id', event.target.value)}
                required
              >
                <option value="">Selecione...</option>
                {obrasCriacao.map((obra) => (
                  <option key={obra.id} value={obra.id}>{formatarObra(obra)}</option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Data prevista de desembolso" obrigatorio>
              <DateInputBR
                chaveWorkspace="provisao:nova:desembolso"
                aria-label="Data prevista de desembolso"
                className="input w-full"
                value={form.data_prevista_desembolso}
                onChange={(event) => atualizarCampo('data_prevista_desembolso', event.target.value)}
                required
              />
            </CampoForm>

            <CampoForm label="Item macro" obrigatorio hint="Escolha uma categoria macro cadastrada ou digite uma nova.">
              <input
                type="text"
                aria-label="Item macro"
                className="input w-full"
                list="provisao-item-macro-opcoes"
                value={form.item_macro}
                onChange={(event) => atualizarCampo('item_macro', event.target.value)}
                placeholder="Ex.: concretagem, locacao, estrutura metalica"
              />
              <datalist id="provisao-item-macro-opcoes">
                {categorias.map((categoria) => (
                  <option key={categoria.id} value={categoria.nome} />
                ))}
              </datalist>
            </CampoForm>

            <CampoForm label="Prioridade">
              <select
                aria-label="Prioridade"
                className="input w-full"
                value={form.prioridade}
                onChange={(event) => atualizarCampo('prioridade', event.target.value)}
              >
                <option value="">Não definida</option>
                <option value="baixa">Baixa</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="critica">Critica</option>
              </select>
            </CampoForm>

            {/*
              R6 — MÓDULO DE DINHEIRO: o campo de valor é dimensionado pelo
              PIOR CASO (`.input-moeda`: mín 180px, cabe R$ 9.999.999.999,99,
              alinhado à direita e em tabular-nums). Estava com `input` cru.
            */}
            <CampoForm label="Valor previsto" obrigatorio>
              <input
                type="text"
                aria-label="Valor previsto"
                inputMode="numeric"
                className="input input-moeda w-full"
                value={valorPrevistoTexto}
                onChange={(event) => atualizarValorPrevisto(event.target.value)}
                placeholder={formatarMoedaBRL(0)}
              />
            </CampoForm>

            <CampoForm label="Credor" hint="Opcional.">
              <input
                aria-label="Credor"
                className="input w-full"
                value={form.fornecedor_texto}
                onChange={(event) => atualizarCampo('fornecedor_texto', event.target.value)}
                placeholder="Nome do credor"
              />
            </CampoForm>

            <CampoForm label="Descrição" obrigatorio tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[110px]` que estava aqui. */}
              <textarea
                aria-label="Descrição"
                className="input w-full"
                value={form.descricao}
                onChange={(event) => atualizarCampo('descricao', event.target.value)}
                placeholder="Descreva o desembolso previsto com contexto suficiente para a equipe entender a provisão."
              />
            </CampoForm>
          </FormSecao>
        </BlocoConteudo>

        <BlocoConteudo
          titulo="Anexos da provisão"
          contagem={`${arquivosPendentes.length} arquivo(s) selecionado(s)`}
          descricao={`Enviados logo após o registro ser salvo. Limite atual: até ${UPLOAD_MAX_FILE_SIZE_MB_PADRAO} MB por arquivo.`}
          variante="secundario"
          acoes={(
            <label className={`btn btn-outline${saving ? ' pointer-events-none opacity-60' : ''}`}>
              <input
                type="file"
                className="hidden"
                multiple
                onChange={(event) => {
                  adicionarArquivos(event.target.files);
                  event.target.value = '';
                }}
              />
              Adicionar arquivos
            </label>
          )}
        >
          {arquivosPendentes.length > 0 ? (
            <PendingAttachmentsList
              items={arquivosPendentes}
              onRemove={(index) => removerArquivoPendente(index)}
              className="grid gap-2"
              itemClassName="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--c-border)] px-3 py-2 text-sm"
              removeButtonClassName="btn btn-outline btn-sm"
            />
          ) : (
            <p className="text-sm text-[var(--c-muted)]">Nenhum arquivo selecionado.</p>
          )}
        </BlocoConteudo>

        <BlocoConteudo>
          <div className="app-actionbar">
            <button type="button" className="btn btn-outline" disabled={saving} onClick={() => { if (!mutex.current) navigate('/provisoes-financeiras'); }}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving || !obraAtualDisponivel}>
              {saving ? 'Salvando...' : 'Criar provisao'}
            </button>
          </div>
        </BlocoConteudo>
        </fieldset>
      </form>
    </Pagina>
  );
}
