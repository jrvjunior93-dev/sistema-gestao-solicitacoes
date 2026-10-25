# Correcao da codificacao NSDOCS no historico PROD

## Evidencia e estado da carga

Plano `8e0a4179-506a-4670-88a2-d9079728e263`, emissao de 01/01/2026 a
23/10/2026. Primeiro lote concluido: 1 completo, 19 pendentes, 5 observacoes NF-e.
Tentativa seguinte falhou com `NSDOCS_RESPOSTA_COMPACTADA_INVALIDA` no capture_id
`fa3a4741-609c-46a4-9382-a18921753c79`, janeiro/2026, status Importado, offset 0.
Nenhuma pagina foi persistida nessa tentativa. Preservar plano, IDs e historico.

A sonda executada pelo usuario confirmou HTTP 200, application/json, ausencia de
Content-Encoding, corpo de 2 bytes, sem assinatura gzip, array JSON vazio e total
zero. Fez um GET, sem XML, escrita no RDS/S3 ou mudanca do plano. O parser antigo
presumia gzip na ausencia do cabecalho e rejeitava essa resposta valida.

## Alteracao e validacao

- `normalize.js` e `manual/transport.js`: cabecalho ausente aceita corpo simples
  ou gzip identificado por assinatura. Cabecalho explicito permanece estrito;
  gzip corrompido nunca tem fallback para uma lista vazia. Limites de JSON/XML,
  validacao, permissoes, idempotencia e eventos anteriores preservados.
- 58 testes aprovados: 50 do conector/captura/guardas/plano, 5 do aplicador e 3
  da sonda. Transportes e FS/PM2/Git/HTTP simulados; nenhuma rede externa no QA.
- Nenhuma dependencia, migration, frontend, financeiro, credencial ou storage
  alterado. DEV permanece na branch anterior. `outputs/` nao pertence ao commit.

## Aplicador e retorno

`ops/deploy/atualizar-prod-nsdocs-codec-20261024.cjs` usa inventario proprio,
base Git main `b1683b6d3148d68ffe34f90b00d7a620ab5363ab`; aceita HEAD EC2
`0b1909293720731d99990bb3b55a96433b6cfd15` ou a base, com backend anterior igual.
Nao alterar o manifesto antigo de release para contornar hashes.

Preparar guarda codigo anterior em estado privado 700/600. Aplicar exige as tres
flags documentadas e timer ativo; usa ff-only e QA em ambiente sem credenciais.
Locks de operacao, plano e consulta impedem capturas concorrentes. Confere plano
e journal antes/depois, alem de PIDs, Nodes, ambientes, dumps e unidade PM2.
Nao reinicia servicos, conecta ao banco, consulta NSDOCS ou escreve S3.

Voltar restaura apenas os dois arquivos de runtime; nao restaura plano ou dados.
Mantem HEAD e deixa duas alteracoes tracked esperadas. Conferir permite progresso
legitimo posterior do plano. Nao remover locks alheios nem forcar Git.

## Proximo passo exato

Publicar patch na main, fornecer SHA/hash e comandos preparar/aplicar/conferir
ao usuario. Somente depois de `NSDOCS_CODEC_PROD_APLICADO`, retomar o MESMO plano
com `--max-lotes 1`. Se o provedor repetir a pagina vazia, esperar 2 completos,
18 pendentes, 5 observacoes, um GET e nenhum XML. Conferir resultado antes de
retornar a dez lotes. A carga inteira ainda nao esta concluida.

Backup e timer foram confirmados para esta mesma carga. O agente nao aplicou o
patch na EC2 nem repetiu a captura real; o usuario executa as etapas.
