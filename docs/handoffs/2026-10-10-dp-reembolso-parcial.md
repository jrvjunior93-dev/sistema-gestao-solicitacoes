# DP - valor parcial de reembolso de vale

## Pedido e estado

Usuario pediu valor editavel no modal porque somente parte do desconto pode
ser de vale reembolsavel. Implementado localmente em refactor/frontend, sem
commit, push, main, EC2, migration ou acesso ao banco real. outputs/ fora do Git.

## Comportamento e arquivos

- RhDpPagamentoModal.jsx: `Valor do reembolso` com mascara BRL compartilhada,
  estado numerico e valor inicial igual ao desconto (ou valor salvo). Confirmar
  exige valor positivo, limitado ao desconto; erro aparece abaixo do campo.
  `Sem reembolso`, Cancelar, Voltar e Escape conservam o fluxo existente.
- Escolher responsavel reaproveita apenas seus dados bancarios/Pix: nunca copia
  o valor reembolsavel de outro colaborador. Resumo/discriminacao somam valores
  informados por responsavel/empresa, nao o desconto inteiro.
- rhPagamentoSolicitacaoDomain.js: helper valorReembolso valida moeda/limites;
  agruparReembolsos usa a parcela reembolsavel para total e origens.
- rhPagamentoSolicitacaoService.js: salvar guarda reembolso.valor numerico em
  dados_json. Edicao invalida conferencia da linha conforme regra existente.
  Geracao revalida valores, conserva transacao/idempotencia e usa o agrupamento
  canonico para criar titulo/fila e discriminacao por colaborador.
- Desconto inteiro continua reduzindo o salario; nao muda dias, faltas,
  percentual, acrescimos, categoria, empresa, permissao ou recebimento salarial.
- Legado sem propriedade valor usa desconto inteiro. Valores explicitos zero,
  negativos, invalidos ou acima do desconto nao sao tratados como legado.
  Titulos/aprovacoes ja gerados conservam seus snapshots e nao sao recalculados.
- Protecao de deploy desencontrado no frontend: salvamento precisa confirmar
  o valor pela resposta antes de enviar. Backend antigo que ignora a parcela
  parcial bloqueia envio, sem gerar reembolso integral indevido.
- Testes validarRhPagamentoSolicitacao.js e validarRhPagamentoSolicitacaoUI.mjs
  ampliados; README RH/DP e ownership documentados.

## Validacoes executadas

- Backend dominio/servico reais em memoria: reembolso integral legado, parcial
  com centavos, limites/invalidos, rollback sem revisao parcial, reabertura/DP,
  invalidacao/reconferencia, agrupamento, titulo/fila, discriminacao, preservacao
  de titulo anterior, revalidacao no envio e dupla chamada sem duplicacao.
- test:rhdp-pessoal-solicitacao e test:rhdp-regras-pagamento aprovados.
- UI real: moeda/limites, valor persistido no DP, dados reutilizados sem copiar
  valor, soma parcial, liquido integral, edicao/reconferencia, titulo concluido,
  cancelamento, autosave/rede lenta, celular e rejeicao do backend antigo.
  Fixture simula serializacao HTTP sem compartilhar referencias com formulario.
- Pessoal por local nos modos legado e gerencial aprovados; selecao/individual,
  fallback todos, centros, ativos, permissao e conferencia preservados.
- Capturas do modal desktop e celular inspecionadas em outputs/.
- Sintaxe backend, build frontend, documentacao e diff aprovados.
  Build conserva os avisos preexistentes de Browserslist/chunk grande.

## Proximo passo

Usuario autorizou commit/push na refactor/frontend em 2026-10-10. Publicar
somente os oito arquivos deste ajuste, preservando outputs/ fora do Git.
Homologar em EC2 dev atualizando
frontend e backend juntos. Nenhuma migration ou flag nova. Pacote Pessoal/DP
continua fora da main ate autorizacao explicita. Sem deploy automatico.

Skill frontend-design usada para integrar campo e erro ao modal compacto
existente e reutilizar mascara/grid, sem mensagens explicativas fixas.
