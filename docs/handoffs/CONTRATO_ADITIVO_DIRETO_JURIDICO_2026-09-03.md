# Contrato — aditivo acima do limite segue direto ao Juridico

Data: 2026-09-03

## Causa confirmada

O pedido de aditivo tinha o setor `GEO` fixado em `contratoAditivoService.js`. A configuracao
`CONTRATO_LIMITE_JURIDICO`, usada na abertura do contrato, nao participava desse roteamento.

## Regra entregue

- Esta alteracao e exclusiva do pedido de termo aditivo. O fluxo de criacao e aprovacao inicial do
  contrato permanece inalterado.
- O corte usa a configuracao `CONTRATO_LIMITE_JURIDICO`; o fallback continua R$ 50.000,00.
- O valor comparado e exclusivamente o valor original do contrato.
- Aditivos ja aprovados e o valor do novo pedido nao participam do roteamento.
- Exatamente no limite, o pedido continua em `GEO / PED. ADITIVO`.
- Acima do limite, segue diretamente para `JURIDICO / PENDENTE`.
- Um contrato original de R$ 49.000,00 continua em GEO tanto com aditivo de R$ 1.000,00 quanto de
  R$ 2.000,00.
- Um contrato cujo valor original seja superior ao limite segue diretamente ao Juridico,
  independentemente do tipo ou valor do aditivo.
- O historico `ADITIVO_SOLICITADO` e o envio `ENVIADA_SETOR` registram o destino calculado, o limite
  aplicado e o valor original considerado.
- Contratos do fluxo novo e legados usam o mesmo calculo. No legado, o status historico de abertura
  da solicitacao propria permanece `PENDENTE`.

## Arquivos alterados

- `backend/src/services/contratoAditivoService.js`
- `backend/src/services/contratoAditivoRoteamento.js`
- `backend/scripts/validarRoteamentoAditivoJuridico.js`

## Validacoes

- `node --check` nos arquivos alterados: aprovado.
- Prova pura, sem conexao nem escrita no banco: aprovada em quatro cenarios.
  - total exatamente no limite;
  - um centavo acima;
  - contrato de R$ 49.000,00 com aditivo que ultrapassaria o limite pela soma;
  - contrato original acima do limite, independentemente do aditivo.
- `git diff --check`: aprovado.

## Banco e deploy

- Nenhuma migration.
- Nenhum dado de teste criado.
- O backend dev precisa ser reiniciado depois que a EC2 receber o commit.
- Nenhuma operacao de producao faz parte desta entrega.
