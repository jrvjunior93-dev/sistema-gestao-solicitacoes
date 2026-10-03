# Projecao do reajuste das parcelas na medicao

## Escopo concluido

- A tela **Medicao — titulos do contrato** passou a mostrar, em tempo real, os novos valores das parcelas afetadas pela edicao da medicao.
- A projecao espelha a regra existente do backend: a diferenca vai primeiro para a ultima parcela livre e segue em cascata para as anteriores apenas quando necessario.
- Parcelas ja medidas nao entram como destino do reajuste.
- A coluna **Previsto** permanece inalterada como referencia historica do contrato.
- O payload da medicao e a regra transacional do backend nao foram alterados.

## Arquivo funcional alterado

- `frontend/src/components/contratos/BlocoMedicaoContrato.jsx`

## Validacoes executadas

- `npm run build`: aprovado, 372 modulos.
- Projecao isolada executada a partir do componente empacotado: aprovada em quatro cenarios:
  - aumento consumindo a ultima parcela;
  - reducao devolvendo valor para a ultima parcela;
  - aumento em cascata por mais de uma parcela;
  - edicao simultanea de duas parcelas.
- `git diff --check`: aprovado.

## Exemplo conferido

- Contrato com quatro parcelas de R$ 12.250,00.
- Parcela 1 editada para R$ 15.000,00.
- Projecao exibida: R$ 15.000,00; R$ 12.250,00; R$ 12.250,00; R$ 9.500,00.

## Riscos e observacoes

- A projecao e somente visual; o backend continua sendo a fonte de verdade e recalcula dentro da transacao.
- O texto `reajustado nesta medicao` identifica linhas cujo valor foi afetado indiretamente.
- Nao ha migration nem alteracao de backend.

## Proximo passo exato

1. Incluir esta alteracao no commit exclusivo das mudancas pendentes desta sessao.
2. Publicar em `dev-v2`.
3. Na dev, repetir o exemplo de quatro parcelas e conferir a parcela final antes de enviar.

