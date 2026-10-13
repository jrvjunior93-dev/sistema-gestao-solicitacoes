import { useContext, useMemo } from 'react';
import { WorkspacePageContext, useWorkspaceState } from '../../../navigation/WorkspaceContext';
import { readComprasDraft, writeComprasDraft, removeComprasDraft } from './comprasDraftStorage';

// Referencia escolhida no formulario, nao um DTO de Pessoas (contas,
// enderecos, documentos, permissoes etc.). IDs continuam sendo input nao
// confiavel e sao validados pelo endpoint original na criacao.
export const referenciaParceiroCompra = value => value?.id
  ? { id: value.id, nome: value.nome || '', cpf_cnpj: value.cpf_cnpj || '' } : null;
export function useComprasPartnerChoice(name) {
  const [value, set] = useWorkspaceState(name, null);
  return [value, update => set(atual => referenciaParceiroCompra(typeof update === 'function' ? update(atual) : update))];
}

// Compatibilidade com o rascunho legado. A memoria e da sessao efetiva,
// nunca do modulo global; continua funcionando com storage negado/quota.
export default function useComprasDraft(key, userId) {
  const page = useContext(WorkspacePageContext);
  const memory = page?.snapshot ? page.memory : null;
  // Duas criacoes do mesmo tipo em abas distintas nao compartilham payload
  // de revisao. A chave em disco permanece legada para compatibilidade.
  const flowKey = page ? `${page.tabId}|${key}` : key;
  return useMemo(() => ({
    read() {
      if (memory) memory.set(page.key + '|flow', flowKey);
      const value = memory?.getFlow(flowKey, page.tabId);
      if (value) return value;
      try {
        const saved = readComprasDraft(key);
        const owner = saved?.meta?.workspace_tab_id;
        // Nao importar o rascunho de outra aba ainda aberta. Depois de um
        // reload (memoria vazia), o rascunho legado continua recuperavel.
        if (memory && owner && owner !== page.tabId && memory.hasFlow(`${owner}|${key}`)) return null;
        return saved;
      } catch { return null; }
    },
    stage(value) {
      if (!memory) return;
      memory.set(page.key + '|flow', flowKey);
      memory.setFlow(flowKey, value, page.tabId);
    },
    write(value) {
      if (memory) {
        memory.set(page.key + '|flow', flowKey);
        memory.setFlow(flowKey, value, page.tabId);
      }
      try {
        writeComprasDraft(key, { ...value, meta: { ...value.meta, workspace_tab_id: page?.tabId } }, userId);
        return true;
      }
      catch { return Boolean(memory); }
    },
    remove() {
      try {
        const owner = readComprasDraft(key)?.meta?.workspace_tab_id;
        if (!memory || !owner || owner === page.tabId) removeComprasDraft(key);
      } catch { /* Nada enviado novamente. */ }
      memory?.clearFlow(flowKey);
    }
  }), [key, flowKey, userId, memory, page?.key, page?.tabId]);
}
