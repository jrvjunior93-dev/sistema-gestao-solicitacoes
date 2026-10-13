# DP - remover botao Sem reembolso

## Pedido e escopo

Usuario pediu remover o botao `Sem reembolso` do modal de vale.
Alteracao exclusivamente frontend em refactor/frontend. Sem commit/push,
main, EC2, banco real ou migration. outputs/ permanece fora do Git.

## Mapeamento e alteracao

- RhDpPagamentoModal.jsx: removido o botao que limpava reembolso e marcava
  desconto_sem_reembolso. Cancelar/Voltar/Escape continuam apenas fechando
  o editor; nao apagam dados confirmados nem invalidam conferencia.
- Confirmar conserva validacao de valor/responsavel e dados bancarios;
  linhaAlterar/autosave, permissoes, endpoints, desconto/liquido, agrupamento,
  idempotencia e geracao/envio de titulos nao foram modificados.
- validarRhPagamentoSolicitacaoUI.mjs: verifica ausencia do botao; cancelar
  novo reembolso e fechar edicao de reembolso salvo pelos tres mecanismos
  preserva dados, total do grupo e conferencia.
- README RH/DP e ownership atualizados. Skill frontend-design aplicada para
  reduzir acoes no rodape sem alterar o padrao visual compacto.

## Validacoes

- UI real desktop/mobile aprovada: ausencia do botao, cancelamento de novo
  reembolso, preservacao de reembolso salvo e conferencia via Cancelar/Voltar/
  Escape; demais fluxos de pagamento, moeda e autosave preservados.
- Build frontend aprovado, com avisos preexistentes Browserslist/chunk grande.
- Documentacao (463 Markdown / 19 canonicos) e diff sem erros.

## Proximo passo

Usuario autorizou commit/push na refactor/frontend em 2026-10-10.
Publicar somente os cinco arquivos deste ajuste, preservando outputs/ fora do Git.
Nenhuma atualizacao de backend necessaria para esta remocao visual.
