# Fila de pagamentos - resumo compacto do titulo

## Pedido e implementacao

- Removida exclusivamente a linha numero do documento / forma de pagamento
  abaixo da descricao do titulo, inclusive o fallback "Sem documento".
- Arquivo funcional: frontend/src/pages/FinanceiroFilaPagamentos.jsx.
- Mantidos codigo, descricao, icones de solicitacao, arquivos e comprovantes,
  coluna Forma / instrumento, seletores, permissoes e regras de baixa.
- Nao se altera exigencia de documento ou comprovante no backend.

## Validacoes

- frontend/scripts/validarFilaInstrumentosUI.mjs ampliado com verificacoes
  da celula do titulo no desktop (1366) e mobile (390), com/sem documento.
- npm run test:fila-instrumentos-ui: aprovado, sem APIs externas;
  navegacao/arquivos, cartoes/cheques, encargos, conta limpa e upload tardio
  sem repetir baixa continuam aprovados. Imagem mobile conferida.
- npm run build: aprovado. Avisos existentes de Browserslist e chunk >500 kB.
- git diff --check: aprovado.

## Estado e proximo passo

- Concluido localmente na refactor/frontend, sem commit/push/main/deploy.
- Alteracoes Pix pendentes anteriores preservadas; nao misturar os escopos
  numa eventual publicacao isolada deste ajuste. outputs/ fora dos commits.
- Proximo passo: commit/publicacao somente quando solicitados pelo usuario.
- Exclusao/substituicao auditada de comprovantes pelo superadmin permanece
  pedido separado, ainda nao implementado por esta tarefa visual.

## Publicacao DEV autorizada - 2026-10-10

Usuario autorizou commit/push das pendencias na refactor/frontend. Teste UI real
da fila reexecutado e aprovado antes da publicacao. outputs/ excluido; nenhuma
alteracao em main, banco ou EC2. O estado local acima descreve a implementacao
antes desta autorizacao.
