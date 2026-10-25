# Correcao de codificacao da resposta NSDOCS PROD

Sonda executada pelo usuario confirmou no lote Importado/01..31/01/2026:
HTTP200, application/json, Content-Encoding ausente,2bytes, sem assinaturagzip,
JSONarrayvazio e total0. O parser antigo tentava gunzip e falhava antes de gravar
a pagina. Plano8e0a4179-506a-4670-88a2-d9079728e263 preservado:1completed/19pending,
5observacoes. Capture_idfa3a4741-609c-46a4-9382-a18921753c79 fica para a retomada.

## Mudanca

Somente normalize.js e manual/transport.js em nsdocsHistorical: sem header,
detectar gzip pela assinatura1f8b e tratar o restante como identity. Cabecalho
explicito continua estrito, gzip corrompido nao cai em fallback, JSON/UTF8/XML
permanecem validados e limitados1MiB/2MiB. Nao converte resposta invalida em[];
apenas permite que uma lista vazia REAL seja lida. Sem alterar fonte do DEV.

## Aplicacao por etapas

Usar atualizar-prod-nsdocs-codec-20261024.cjs por stdin/NodePROD/cwdraizPROD.
Resposta de publicacao deve fornecer SHA completo e SHA256 do operador. Nao usar
tip de outra branch, migrate geral ou operadores de deploy anteriores.

- `preparar SHA`: exige main remota no SHA exato e delta sobre b1683b6d composto
  somente pelos2runtime+1QA e metadados. Confere hashes antigos/novos, checkout
  limpo, HEAD EC2backend0b190929 ou mainfrontendb1683b6d, ambos com mesmo backend
  anterior (catalogo de navegacao conhecido excluido dessa comparacao). Snapshot
  privado .git/fluxy-nsdocs-codec-prod-20261024, diretorio700/estado600. Nao avanca
  checkout ou executa captura. Nao usa credencial NSDOCS/RDS/S3.
- `aplicar`: exige CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
  CONFIRM_NSDOCS_PROD_CODEC_UPDATE=SIM e timerativo. Atualiza porff-only, confere
  fontes e roda50QA em ambiente isolado sem chaves/credenciais/flags PROD.
  Bloqueia execucoes concorrentes usando lockPROD e locksprivados do plano/query.
  Confere hash do plano/journal antes/depois e preservacao dos3PIDs, Nodes,
  ambientes, dumps, unidade/dropinPM2. Zero restart/migration/API/S3/RDSwrites.
- `conferir`: leitura de fontes/estado/protecao; nao compara progresso antigo
  contra plano atual, pois retomadas legitimas mudam esse progresso.
- `voltar`: mesmas3flags/timer, captura parada. Restaura APENAS2 fontes anteriores
  com modos originais, sem mexer em plano/dados/XMLs/journal. HEAD mantido;
  tracked alterado apos retorno e esperado. Nao reset/clean/pull para contornar.

Se falhar, guardar a saida sanitizada. Locks de outro processo nunca sao
removidos automaticamente; se processo foi morto abruptamente, diagnosticar
antes de remover qualquer lock. Nem preparacao nem aplicacao reiniciam servicos.
O modulo da CLI e carregado novamente no proximo comando de captura.

O aplicador antigo de carga historica conferia hashes antigos: depois deste
patch ele deve recusar esses hashes/HEAD. Usar o novo conferir/voltar para o patch;
manter os snapshots anteriores e o manifesto original como evidencias historicas.

## Retomada

Depois de NSDOCS_CODEC_PROD_APLICADO e conferencia, retomar MESMO plano com
--max-lotes1. As datas/status/offset/capture-id estao no arquivo privado; nao
recriar plano nem editar seus jobs. Na pagina vazia observada, espera-se
completed_batches2/pending18 e nfe_observations5, com1GET e zeroXML. Confirmar
o resultado real antes de voltar a10lotes. Nao anunciar carga inteira concluida.

## Validacao

50QA conector/captura/guardas/plano aprovados sem rede real, incluindo JSON/XML
simples, gzip semheader/explicito, deflate, corrupcao/CRC/truncamento, limites,
UTF8, TLS/segredo, replay e progresso.5QA aplicador com FS/PM2/Git/HTTP simulados
cobrem preservacao/replay/locks alheios/falhas/retorno/concorrencia/escopo/hashes.
Sonda3QA anteriores aprovados. Nenhuma aplicacao do patch ou nova chamada real
NSDOCS pelo agente; usuario executa os comandos por etapa.
