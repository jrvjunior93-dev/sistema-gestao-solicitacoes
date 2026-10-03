import { HiOutlineDocumentArrowDown, HiOutlineLink } from 'react-icons/hi2';
import { fileUrl } from '../../../services/api';
import TratamentoItemManual from './TratamentoItemManual';

export function statusCatalogacao(item) {
  if (item.tipo !== 'MANUAL' && item.unidade_sigla_manual) {
    return { label: 'UN pendente', className: 'is-pending' };
  }
  if (item.tipo !== 'MANUAL') return { label: 'Cadastro oficial', className: 'is-official' };
  if (item.insumo_catalogado_id) return { label: 'Catalogado', className: 'is-cataloged' };
  return { label: 'Pendente de cadastro', className: 'is-pending' };
}

/**
 * PAINEL DE DETALHE DO ITEM DE COMPRA.
 *
 * Era o par de <tr> do antigo ItemCompraExpansivel (linha + linha de
 * detalhe com colSpan). A linha virou colunas da TabelaPadrao e este
 * componente é o que a tela devolve em `linhaExpansivel(item)` — o
 * componente cuida do botão de expandir, do estado aberto/fechado e do
 * colSpan. Só monta quando a linha está aberta, como antes.
 */
export default function ItemCompraDetalhe({
  item,
  solicitacaoId,
  podeEditarQuantidade,
  podeEditarApropriacao,
  podeCatalogar,
  podeCadastrarUnidade,
  bloqueado,
  cadastrandoUnidade,
  salvandoQuantidade,
  salvandoApropriacao,
  onEditarQuantidade,
  onEditarApropriacao,
  onCadastrarUnidade,
  onCatalogado
}) {
  const detalheId = `compra-item-detalhe-${item.item_tipo}-${item.id}`;

  return (
    <div id={detalheId} className="compra-item-table-detail">
      <div className="compra-item-expanded-head">
        <div className="compra-item-expanded-spec">
          <span>Especificação do item</span>
          <strong>{item.especificacao || 'Sem especificacao adicional'}</strong>
        </div>

        <div className="compra-item-inline-actions">
          {podeEditarQuantidade && !bloqueado ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditarQuantidade(item)} disabled={salvandoQuantidade}>
              {salvandoQuantidade ? 'Salvando quantidade...' : 'Editar quantidade'}
            </button>
          ) : null}
          {podeEditarApropriacao && !bloqueado ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onEditarApropriacao(item)} disabled={salvandoApropriacao}>
              {salvandoApropriacao ? 'Salvando apropriacao...' : 'Editar apropriacao'}
            </button>
          ) : null}
          {item.tipo !== 'MANUAL' && item.unidade_sigla_manual && podeCadastrarUnidade && !bloqueado ? (
            <button type="button" className="btn btn-outline btn-sm" onClick={() => onCadastrarUnidade(item)} disabled={cadastrandoUnidade}>
              {cadastrandoUnidade ? 'Cadastrando UN...' : `Cadastrar UN ${item.unidade_sigla_manual}`}
            </button>
          ) : null}
          {item.link_produto ? (
            <a className="btn btn-outline btn-sm" href={item.link_produto} target="_blank" rel="noreferrer">
              <HiOutlineLink aria-hidden="true" /> Abrir link
            </a>
          ) : null}
          {item.arquivo_url ? (
            <a className="btn btn-outline btn-sm" href={fileUrl(item.arquivo_url)} target="_blank" rel="noreferrer">
              <HiOutlineDocumentArrowDown aria-hidden="true" /> {item.arquivo_nome_original || 'Abrir anexo'}
            </a>
          ) : null}
        </div>
      </div>

      {item.tipo !== 'MANUAL' && item.unidade_sigla_manual ? (
        <div className="compra-item-permission-note">
          UN livre informada neste item: <strong>{item.unidade_sigla_manual}</strong>.
          {podeCadastrarUnidade ? ' Cadastre para vinculá-la ao catálogo de unidades.' : ' Aguardando um usuário com permissão para gerenciar itens.'}
        </div>
      ) : null}

      {item.tipo === 'MANUAL' && item.insumoCatalogado ? (
        <div className="compra-item-cataloged-banner">
          <span>Cadastro oficial vinculado</span>
          <strong>{item.insumoCatalogado.codigo || `ID ${item.insumoCatalogado.id}`} — {item.insumoCatalogado.nome}</strong>
          <small>O item original desta solicitação continua preservado.</small>
        </div>
      ) : null}

      {item.tipo === 'MANUAL' && podeCatalogar ? (
        <TratamentoItemManual item={item} solicitacaoId={solicitacaoId} onCatalogado={onCatalogado} />
      ) : null}

      {item.tipo === 'MANUAL' && !podeCatalogar && !item.insumo_catalogado_id ? (
        <div className="compra-item-permission-note">Item pendente de cadastro. Somente usuários com permissão de catalogacao podem trata-lo.</div>
      ) : null}
    </div>
  );
}
