import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatusBadge from '../../components/StatusBadge';
import MenuMais from '../../components/padrao/MenuMais';
import { CelulaDupla } from '../../components/padrao/TabelaPadrao';
import { isGeoSetor, solicitacaoEstaNoSetorDoUsuario, userHasSetorCapability } from '../../utils/setor';
import ModalAtribuirResponsavel from './ModalAtribuirResponsavel';
import ModalEnviarSetor from './ModalEnviarSetor';
import { API_URL, authHeaders } from '../../services/api';
import {
  arquivarSolicitacao,
  deleteSolicitacao,
  desarquivarSolicitacao,
  updateDataVencimentoSolicitacao,
  updateValorSolicitacao
} from '../../services/solicitacoes';
import { parseDateSmart } from '../../utils/dateLocal';
import { corrigirTextoCorrompido } from '../../utils/texto';
import { hasAnyExplicitPermissao } from '../../utils/acessoProduto';
import DateInputBR from '../../components/DateInputBR';

/**
 * A LINHA DA TABELA DE SOLICITAÇÕES — agora declarada como COLUNAS.
 *
 * Antes este arquivo desenhava um `<tr>` com quatorze `<td>` condicionais e,
 * dentro deles, a variação para o celular (`viewportMode === 'mobile'`
 * trocando classes e ordem). Eram dois desenhos para o mesmo dado, e o do
 * celular só existia porque a `<table>` crua não sabia virar cartão.
 *
 * Com a `TabelaPadrao` a tela declara UMA lista de colunas com `render`, e no
 * celular as MESMAS colunas viram cartões — sem segundo markup, sem segunda
 * regra de qual coluna aparece em qual largura. É o que `construirColunas`
 * devolve aqui.
 *
 * O que sobrou de componente nesta casa são as CÉLULAS QUE TÊM ESTADO
 * PRÓPRIO (edição de valor e de data) e a de ações — cada uma dona do seu
 * pedaço, montada pelo `render` da sua coluna.
 */

function normalizarTextoSolicitacaoCompra(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

export function isSolicitacaoCompraNormal(solicitacao) {
  const texto = [
    solicitacao?.tipo_solicitacao?.nome,
    solicitacao?.tipo_solicitacao?.codigo,
    solicitacao?.tipoSolicitacao?.nome,
    solicitacao?.tipoSolicitacao?.codigo,
    solicitacao?.tipo?.nome,
    solicitacao?.tipo?.codigo,
    solicitacao?.tipo_solicitacao_nome,
    solicitacao?.tipo_solicitacao_codigo,
    solicitacao?.titulo,
    solicitacao?.descricao
  ].filter(Boolean).join(' ');
  const normalizado = normalizarTextoSolicitacaoCompra(texto);
  return normalizado.includes('SOLICITACAO DE COMPRA') || normalizado.includes('COMPRA DIRETA');
}

function formatarMoedaLinha(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '-';
  return numero.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function limitarTexto(valor, limite = 15) {
  const texto = String(valor || '');
  if (!texto) return '';
  return texto.length > limite ? `${texto.slice(0, limite)}...` : texto;
}

function dataCriacaoDe(solicitacao) {
  const bruta =
    solicitacao.createdAt ||
    solicitacao.data_criacao ||
    solicitacao.created_at ||
    null;
  const data = bruta ? new Date(bruta) : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
}

function dataVencimentoDe(solicitacao) {
  const bruta = solicitacao.data_vencimento || null;
  const data = bruta ? parseDateSmart(bruta) : null;
  return data && !Number.isNaN(data.getTime()) ? data : null;
}

/* Os dois números que a coluna de valor mostra: o principal (saldo, ou o
   total quando a solicitação está paga) e o total, quando diferem. */
export function valoresDaSolicitacao(solicitacao) {
  const valorTotal = Number(solicitacao.valor_total ?? solicitacao.valor);
  const valorPago = Number(solicitacao.valor_pago_acumulado || 0);
  const statusGlobal = String(solicitacao.status_global || '').trim().toUpperCase();
  const saldoRestante = Number.isFinite(valorTotal)
    ? Math.max(valorTotal - (Number.isFinite(valorPago) ? valorPago : 0), 0)
    : null;
  const principal = statusGlobal === 'PAGA'
    ? valorTotal
    : Number(solicitacao.valor_exibicao ?? solicitacao.saldo_pagamento ?? saldoRestante ?? solicitacao.valor);
  const mostrarTotal =
    statusGlobal !== 'PAGA' &&
    Number.isFinite(valorTotal) &&
    Number.isFinite(principal) &&
    Math.abs(valorTotal - principal) > 0.009;
  return { valorTotal, principal, mostrarTotal };
}

/* ===================== CÉLULA DE VALOR (com edição) ===================== */

function CelulaValor({ solicitacao, podeEditar, onAtualizar, avisar }) {
  const [editando, setEditando] = useState(false);
  const [valorEditado, setValorEditado] = useState(
    solicitacao.valor !== null && solicitacao.valor !== undefined
      ? String(solicitacao.valor)
      : ''
  );
  const { valorTotal, principal, mostrarTotal } = valoresDaSolicitacao(solicitacao);

  useEffect(() => {
    if (!editando) {
      setValorEditado(
        solicitacao.valor !== null && solicitacao.valor !== undefined
          ? String(solicitacao.valor)
          : ''
      );
    }
  }, [solicitacao.valor, editando]);

  async function salvarValor() {
    // R26 — o alvo é fixado ANTES de qualquer `await`: a lista pode ser
    // recarregada por baixo enquanto a gravação está em voo.
    const alvo = solicitacao;
    try {
      const valorNumero = valorEditado === '' ? null : Number(valorEditado);
      if (valorEditado !== '' && Number.isNaN(valorNumero)) {
        avisar.erro('Valor inválido');
        return;
      }
      await updateValorSolicitacao(alvo.id, valorNumero);
      setEditando(false);
      await onAtualizar?.({ type: 'refresh_item', id: alvo.id });
      avisar.sucesso(`Valor de ${alvo.codigo || alvo.id} atualizado.`);
    } catch (err) {
      console.error(err);
      avisar.erro('Erro ao atualizar valor');
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="number"
          step="0.01"
          className="input input-moeda"
          value={valorEditado}
          onChange={(e) => setValorEditado(e.target.value)}
          aria-label={`Valor de ${solicitacao.codigo || solicitacao.id}`}
        />
        <div className="app-actionbar">
          <button type="button" className="btn btn-primary" onClick={salvarValor}>Salvar</button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setValorEditado(
                solicitacao.valor !== null && solicitacao.valor !== undefined
                  ? String(solicitacao.valor)
                  : ''
              );
              setEditando(false);
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <CelulaDupla
        principal={formatarMoedaLinha(principal)}
        sub={mostrarTotal ? `Total: ${formatarMoedaLinha(valorTotal)}` : null}
        title={Number.isFinite(valorTotal) ? `Total: ${formatarMoedaLinha(valorTotal)}` : undefined}
      />
      {podeEditar && (
        <button type="button" className="btn btn-outline" onClick={() => setEditando(true)}>
          Editar
        </button>
      )}
    </div>
  );
}

/* ================ CÉLULA DE DATA RESPOSTA/PAGAMENTO ==================== */

function CelulaVencimento({ solicitacao, podeEditar, onAtualizar, avisar }) {
  const [editando, setEditando] = useState(false);
  const [dataEditada, setDataEditada] = useState(solicitacao.data_vencimento || '');
  const data = dataVencimentoDe(solicitacao);

  useEffect(() => {
    if (!editando) setDataEditada(solicitacao.data_vencimento || '');
  }, [solicitacao.data_vencimento, editando]);

  async function salvarData() {
    const alvo = solicitacao;                     // R26: alvo fixado antes do await
    try {
      await updateDataVencimentoSolicitacao(alvo.id, dataEditada || null);
      setEditando(false);
      await onAtualizar?.({ type: 'refresh_item', id: alvo.id });
      avisar.sucesso(`Data de ${alvo.codigo || alvo.id} atualizada.`);
    } catch (err) {
      console.error(err);
      avisar.erro(err?.message || 'Erro ao atualizar data de vencimento');
    }
  }

  if (editando) {
    return (
      <div className="flex flex-col gap-1">
        <DateInputBR
          className="input"
          value={dataEditada || ''}
          onChange={(e) => setDataEditada(e.target.value)}
          aria-label={`Data resposta/pagamento de ${solicitacao.codigo || solicitacao.id}`}
        />
        <div className="app-actionbar">
          <button type="button" className="btn btn-primary" onClick={salvarData}>Salvar</button>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => {
              setDataEditada(solicitacao.data_vencimento || '');
              setEditando(false);
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <span title={data ? data.toLocaleString('pt-BR') : ''}>
        {data ? data.toLocaleDateString('pt-BR') : '-'}
      </span>
      {podeEditar && (
        <button type="button" className="btn btn-outline" onClick={() => setEditando(true)}>
          Editar
        </button>
      )}
    </div>
  );
}

/* ============================ AÇÕES DA LINHA =========================== */

function AcoesSolicitacao({
  solicitacao,
  permissoes,
  setoresMap,
  mostrarArquivadas,
  onAtualizar,
  avisar,
  confirmar
}) {
  const navigate = useNavigate();
  const [modalAtribuir, setModalAtribuir] = useState(false);
  const [modalEnviar, setModalEnviar] = useState(false);

  const setorSolicitacao = setoresMap?.[solicitacao.area_responsavel] || null;
  const setorNome = setorSolicitacao?.nome || setorSolicitacao || solicitacao.area_responsavel || '';
  const isSetorObraSolicitacao =
    Boolean(setorSolicitacao?.eh_setor_obra) ||
    String(setorNome).trim().toUpperCase() === 'OBRA';

  const {
    user,
    isSetorObra,
    isSuperadmin,
    isAdminGEO,
    isUsuario,
    isFinanceiro,
    permissaoUsuario
  } = permissoes;

  const modoRecebimento = String(permissaoUsuario?.modo_recebimento || 'TODOS_VISIVEIS').toUpperCase();
  const podeAssumir =
    !isSetorObra &&
    (isSuperadmin || solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user)) &&
    modoRecebimento === 'TODOS_VISIVEIS' &&
    (isUsuario ? (!!permissaoUsuario?.usuario_pode_assumir || isFinanceiro) : true);
  const podeAtribuir =
    !isSetorObra &&
    modoRecebimento === 'TODOS_VISIVEIS' &&
    (isUsuario ? (!!permissaoUsuario?.usuario_pode_atribuir || isFinanceiro) : true);
  const podeEnviar =
    !isSetorObra &&
    (isSuperadmin || solicitacaoEstaNoSetorDoUsuario(solicitacao.area_responsavel, user));

  async function assumir() {
    const alvo = solicitacao;                     // R26
    try {
      const res = await fetch(`${API_URL}/solicitacoes/${alvo.id}/assumir`, {
        method: 'POST',
        headers: authHeaders()
      });

      if (!res.ok) {
        let mensagem = 'Erro ao assumir solicitação';
        try {
          const data = await res.json();
          mensagem = data?.error || mensagem;
        } catch (_) {}
        avisar.erro(mensagem);
        return;
      }

      avisar.sucesso('Solicitação assumida com sucesso.');
      await onAtualizar?.({ type: 'refresh_item', id: alvo.id });
    } catch (err) {
      console.error(err);
      avisar.erro('Erro ao assumir solicitação');
    }
  }

  async function excluir() {
    /*
      R21 + R26: o retorno se DESESTRUTURA (`{ ok }` — o objeto inteiro é
      sempre verdadeiro), e o alvo é fixado numa `const` ANTES do `await`.
      O modal do sistema não congela a tela: sem a `const`, a pessoa lê o
      código de uma solicitação e o sistema apaga outra.
    */
    const alvo = solicitacao;
    const { ok } = await confirmar({
      titulo: 'Excluir solicitação',
      mensagem: `Excluir a solicitação ${alvo.codigo || alvo.id}? Esta ação não pode ser desfeita.`,
      rotuloConfirmar: 'Excluir',
      destrutiva: true
    });
    if (!ok) return;

    try {
      await deleteSolicitacao(alvo.id);
      avisar.sucesso(`Solicitação ${alvo.codigo || alvo.id} excluída.`);
      await onAtualizar?.({ type: 'remove_item', id: alvo.id });
    } catch (err) {
      console.error(err);
      avisar.erro('Erro ao excluir solicitação');
    }
  }

  async function arquivar() {
    const alvo = solicitacao;                     // R26
    const { ok } = await confirmar({
      titulo: 'Arquivar solicitação',
      mensagem: `Arquivar ${alvo.codigo || alvo.id} somente para a sua visualização?`,
      rotuloConfirmar: 'Arquivar'
    });
    if (!ok) return;

    try {
      await arquivarSolicitacao(alvo.id);
      avisar.sucesso(`Solicitação ${alvo.codigo || alvo.id} arquivada.`);
      await onAtualizar?.({ type: 'remove_item', id: alvo.id });
    } catch (err) {
      console.error(err);
      avisar.erro('Erro ao arquivar solicitação');
    }
  }

  async function desarquivar() {
    const alvo = solicitacao;                     // R26
    try {
      await desarquivarSolicitacao(alvo.id);
      avisar.sucesso(`Solicitação ${alvo.codigo || alvo.id} desarquivada.`);
      await onAtualizar?.({ type: 'remove_item', id: alvo.id });
    } catch (err) {
      console.error(err);
      avisar.erro('Erro ao desarquivar solicitação');
    }
  }

  /*
    R11 — o "⋯" só recebe AÇÃO SOBRE ESTA TELA, nunca navegação. Excluir,
    arquivar e desarquivar são as raras; as do dia a dia ficam visíveis.
  */
  const itensMais = [
    !mostrarArquivadas
      ? { rotulo: 'Arquivar', onClick: arquivar, title: 'Arquivar somente para a sua visualização' }
      : { rotulo: 'Desarquivar', onClick: desarquivar },
    ...((isSuperadmin || isAdminGEO)
      ? [{ rotulo: 'Excluir', onClick: excluir, perigosa: true }]
      : [])
  ];

  return (
    <>
      <button
        type="button"
        className="btn btn-outline"
        onClick={() => navigate(`/solicitacoes/${solicitacao.id}`)}
      >
        Ver
      </button>

      {podeAssumir && (
        <button type="button" className="btn btn-outline" onClick={assumir}>Assumir</button>
      )}

      {podeAtribuir && (
        <button type="button" className="btn btn-outline" onClick={() => setModalAtribuir(true)}>
          Atribuir
        </button>
      )}

      {podeEnviar && (
        <button type="button" className="btn btn-outline" onClick={() => setModalEnviar(true)}>
          Enviar
        </button>
      )}

      <MenuMais itens={itensMais} />

      {modalAtribuir && (
        <ModalAtribuirResponsavel
          solicitacaoId={solicitacao.id}
          obraId={solicitacao.obra_id}
          isSetorObraSolicitacao={isSetorObraSolicitacao}
          isUsuarioSetorObra={isSetorObra}
          exigirPrazoCompra={isSolicitacaoCompraNormal(solicitacao)}
          onClose={() => setModalAtribuir(false)}
          onSucesso={() => {
            void onAtualizar?.({ type: 'refresh_item', id: solicitacao.id });
          }}
        />
      )}

      {modalEnviar && (
        <ModalEnviarSetor
          solicitacaoId={solicitacao.id}
          onClose={() => setModalEnviar(false)}
          onSucesso={() => {
            void onAtualizar?.({ type: 'refresh_item', id: solicitacao.id });
          }}
        />
      )}
    </>
  );
}

/* ====================== AS COLUNAS DA TABELA =========================== */

/**
 * Monta as permissões que TODA linha usa, uma vez, a partir do usuário —
 * antes cada `<tr>` recalculava as mesmas dez condições.
 */
export function permissoesDeLinha(user, permissaoUsuario) {
  const perfil = String(user?.perfil || '').toUpperCase();
  const setorTokens = [
    String(user?.setor?.nome || '').toUpperCase(),
    String(user?.setor?.codigo || '').toUpperCase(),
    String(user?.area || '').toUpperCase()
  ];
  const isAdminGEO = perfil.startsWith('ADMIN') && setorTokens.some(isGeoSetor);
  const isSuperadmin = perfil === 'SUPERADMIN';

  return {
    user,
    permissaoUsuario,
    isSetorObra: userHasSetorCapability(user, 'eh_setor_obra'),
    isFinanceiro: userHasSetorCapability(user, 'eh_setor_financeiro'),
    isUsuario: user?.perfil === 'USUARIO',
    isAdminGEO,
    isSuperadmin,
    podeEditarValor:
      isAdminGEO || isSuperadmin || hasAnyExplicitPermissao(user, ['solicitacoes.acoes.alterar_valor']),
    podeEditarDataVencimento:
      isAdminGEO || isSuperadmin || hasAnyExplicitPermissao(user, ['solicitacoes.acoes.alterar_data_vencimento'])
  };
}

/**
 * As colunas da lista de solicitações. Cada uma declara o seu `tipo` (R10/
 * R17): a MEDIDA e o ALINHAMENTO são decisão da `TabelaPadrao`, a tela só
 * diz o que a coluna é.
 */
export function construirColunas({
  permissoes,
  setoresMap,
  mostrarRefContrato = false,
  mostrarContrato = false,
  mostrarArquivadas = false,
  onAtualizar,
  avisar,
  confirmar
}) {
  return [
    {
      id: 'data',
      titulo: 'Data',
      tipo: 'data',
      ordenavel: true,
      valorOrdenacao: (item) => dataCriacaoDe(item)?.getTime() ?? null,
      render: (item) => {
        const data = dataCriacaoDe(item);
        return (
          <span title={data ? data.toLocaleString('pt-BR') : ''}>
            {data ? data.toLocaleDateString('pt-BR') : '-'}
          </span>
        );
      }
    },
    {
      // R17: a coluna de IDENTIDADE da lista. Código de solicitação é o que
      // a pessoa lê para saber de qual registro está falando.
      id: 'codigo',
      titulo: 'Código',
      tipo: 'identidade',
      noCard: 'titulo',
      render: (item) => (
        <span className="sol-codigo-retorno">
          <span>{item.codigo || `#${item.id}`}</span>
          {item.retorno_solicitado_pendente && (
            <span
              className="sol-retorno-pendente"
              title={item.pedido_retorno_pendente?.motivo || 'Esta solicitação precisa de atenção do setor atual.'}
            >
              Retorno solicitado
            </span>
          )}
          {item.atencao_pendente && (
            <span className="sol-retorno-pendente" title={item.atencao_pendente.resumo || 'Nova interação nesta solicitação.'}>
              {item.atencao_pendente.tipo === 'ENVIO_MANUAL' ? 'Enviada ao setor' : 'Novo comentário'}
            </span>
          )}
        </span>
      )
    },
    {
      id: 'numero_sienge',
      titulo: 'Nº pedido',
      tipo: 'codigo',
      render: (item) => (
        <span title={item.numero_sienge || item.numero_pedido || ''}>
          {limitarTexto(item.numero_sienge || item.numero_pedido, 15) || '-'}
        </span>
      )
    },
    {
      id: 'obra',
      titulo: 'Obra',
      tipo: 'texto',
      render: (item) => (
        <span title={item.obra?.nome || ''}>{limitarTexto(item.obra?.nome, 15) || '-'}</span>
      )
    },
    ...(mostrarContrato ? [{
      id: 'contrato',
      titulo: 'Contrato',
      tipo: 'codigo',
      render: (item) => (
        <span title={item.contrato?.codigo || item.codigo_contrato || ''}>
          {limitarTexto(item.contrato?.codigo || item.codigo_contrato, 15) || '-'}
        </span>
      )
    }] : []),
    ...(mostrarRefContrato && mostrarContrato ? [{
      id: 'ref_contrato',
      titulo: 'Ref. do Contrato',
      tipo: 'texto',
      render: (item) => {
        const ref = item.contrato?.ref_contrato || '';
        return <span title={ref}>{limitarTexto(ref, 30) || '-'}</span>;
      }
    }] : []),
    {
      id: 'descricao',
      titulo: 'Descrição',
      tipo: 'texto',
      render: (item) => {
        const descricao = corrigirTextoCorrompido(item.descricao || '');
        return <span title={descricao}>{limitarTexto(descricao, 15) || '-'}</span>;
      }
    },
    {
      id: 'tipo',
      titulo: 'Tipo de Solicitação',
      tipo: 'texto',
      render: (item) => {
        const nome = item.tipo?.nome || item.tipoMacroSolicitacao?.nome || '-';
        return <span title={nome}>{nome}</span>;
      }
    },
    {
      id: 'valor',
      titulo: 'Valor',
      tipo: 'valor',
      ordenavel: true,
      valorOrdenacao: (item) => {
        const n = Number(item?.valor_exibicao ?? item?.saldo_pagamento ?? item?.valor);
        return Number.isNaN(n) ? null : n;
      },
      render: (item) => (
        <CelulaValor
          solicitacao={item}
          podeEditar={permissoes.podeEditarValor}
          onAtualizar={onAtualizar}
          avisar={avisar}
        />
      )
    },
    {
      id: 'setor',
      titulo: 'Setor',
      tipo: 'texto',
      render: (item) => {
        const setor = setoresMap?.[item.area_responsavel] || null;
        const nome = setor?.nome || setor || item.area_responsavel || '';
        return <span title={nome}>{nome || '-'}</span>;
      }
    },
    {
      id: 'responsavel',
      titulo: 'Responsável',
      tipo: 'texto',
      render: (item) => <span title={item.responsavel || ''}>{item.responsavel || '-'}</span>
    },
    {
      id: 'status',
      titulo: 'Status',
      tipo: 'status',
      render: (item) => (
        <StatusBadge
          status={item.status_global}
          setor={item.setor_status_atual || item.area_responsavel}
        />
      )
    },
    {
      id: 'vencimento',
      titulo: 'Data Resposta/Pagamento',
      tipo: 'data',
      ordenavel: true,
      valorOrdenacao: (item) => dataVencimentoDe(item)?.getTime() ?? null,
      render: (item) => (
        <CelulaVencimento
          solicitacao={item}
          podeEditar={permissoes.podeEditarDataVencimento}
          onAtualizar={onAtualizar}
          avisar={avisar}
        />
      )
    }
  ];
}

/**
 * As ações da linha, para a prop `acoesLinha` da `TabelaPadrao` — visíveis,
 * numa linha só, com as raras no menu "⋯".
 */
export function acoesDaLinha(opcoes) {
  return (item) => (
    <AcoesSolicitacao
      solicitacao={item}
      permissoes={opcoes.permissoes}
      setoresMap={opcoes.setoresMap}
      mostrarArquivadas={opcoes.mostrarArquivadas}
      onAtualizar={opcoes.onAtualizar}
      avisar={opcoes.avisar}
      confirmar={opcoes.confirmar}
    />
  );
}

export default construirColunas;
