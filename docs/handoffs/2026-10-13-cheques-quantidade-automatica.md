# Cheques: campos pela quantidade automaticamente - 13/10/2026

## Entrega local

ChequesParceladosFilaModal.jsx ajusta a lista imediatamente ao receber um
inteiro de 1 a 60. Removidos Aplicar quantidade e Adicionar cheque/parcela;
remocao individual continua disponivel. Campo vazio ou quantidade invalida
nao apaga linhas e impede confirmacao. Ao reduzir, linhas ocultadas ficam
em memoria temporaria do modal para recuperacao durante a digitacao; remover
explicitamente um cheque exclui somente aquela linha da reserva. Fechar o
modal descarta a reserva; confirmacao envia somente a lista visivel.

## Mapeamento e limites

Mesmo componente usado pelo instrumento da linha individual e pelo modal de
baixa em massa. Nenhuma alteracao nos endpoints, payload, formas/contas/carteira,
ACL, soma em centavos, locks/idempotencia ou confirmacao financeira. Submit do
editor continua sem propagar para a baixa em massa. Limite 60 mantido, sem
consultas externas a cada digitacao. Nenhum valor de cheque e redistribuido
automaticamente por esta alteracao; usuario continua conferindo os valores.

## Arquivos e validacoes

- frontend/src/components/financeiro/ChequesParceladosFilaModal.jsx.
- frontend/scripts/validarFilaInstrumentosUI.mjs: 4 campos sem outro clique,
  vazio/invalido, reducao e digitacao intermediaria, preservacao de cheque
  proprio/carteira, remocao individual, payload com apenas duas linhas visiveis,
  modal individual/massa, cancelamento e duplo envio. Desktop 1366 e celular 390.
- docs/modulos/financeiro/README.md e docs/workspace/OWNERSHIP_ATIVO.md.
- Regressoes backend isoladas validarFilaInstrumentos.js e
  validarCartaoOpcionalSolicitacao.js aprovadas. Build frontend aprovado.
- Evidencias em outputs/fila-cheques-quantidade-automatica-*.png, fora do commit.

## Proximo passo

Homologar em dev, informar 4, preencher cada cheque, reduzir/aumentar e conferir
soma antes da confirmacao. Alteracao exclusivamente frontend, sem migration
ou necessidade de reinicio do backend. Nao houve banco real, EC2, commit/push
ou deploy nesta tarefa. Suite global completa nao foi executada.
