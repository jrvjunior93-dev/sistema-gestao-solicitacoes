# Modulo FISCAL

## Consulta contextual em pagamentos - 2026-10-24

NF-e vinculadas manualmente/confirmadas podem ser consultadas no dossie de
autorizacao e nos arquivos da solicitacao na fila. Acesso limitado ao contexto
financeiro autenticado, obra e empresa destinataria; nao adiciona permissao
geral Fiscal. Mesmo documento em varios pedidos/solicitacoes e deduplicado por
arquivo. XML/DANFE permanecem no storage fiscal original, sem novas capturas,
manifestacoes, downloads NSDOCS ou geracao automatica de DANFE.

Consulta atual separada da assinatura do envio. Sem alterar vinculos, XML,
historico fiscal, titulos ou baixas. Abertura registra evento de seguranca
contextual sem URL assinada/chave S3 nos metadados. Mais detalhes no
[handoff](../../handoffs/2026-10-24-nfe-dossie-arquivos-fila.md).

## Papel

Fiscal administra entrada e armazenamento de documentos fiscais, certificados, sincronizacao DFe, importacao manual, divergencias, matching, validacao, vinculos e exportacao contabil controlada.

## Propriedade e fronteiras

Fiscal e dono do documento fiscal e de seu estado de processamento. Parceiros e dono do emitente cadastrado; Compras e dono do pedido; Financeiro e dono do titulo. Um vinculo fiscal nao transfere a propriedade desses registros.

## Fluxo

1. documento entra por XML manual, fixture de desenvolvimento ou sincronizacao autorizada;
2. payload bruto e armazenado de forma privada;
3. processor normaliza resumo, documento ou evento;
4. sistema detecta divergencias e sugere vinculos;
5. usuario valida, ignora ou vincula;
6. documentos validados podem compor lote/exportacao contabil.

## Regras

- chave fiscal e identificadores oficiais impedem duplicidade;
- payload bruto nao deve aparecer em logs publicos;
- certificados sao criptografados e acessiveis por permissao;
- sincronizacao usa lock, NSU/estado e espera para consumo indevido;
- fixtures so funcionam em desenvolvimento e com bloqueios explicitos;
- matching sugerido nao confirma vinculo ambiguo;
- ignorar e exclusao logica com justificativa;
- exportacao e ZIP usam storage privado e URL assinada;
- primeira chamada externa exige preflight e ativacao controlada.

## Integracoes

Compras fornece pedido e fornecedor esperado. Financeiro fornece titulo potencial. S3 armazena XML, DANFE, retornos e lotes. Governanca recebe diagnosticos agregados.

NSDOCS API v2: [base offline e sequencia de evolucao](NSDOCS_API_V2_BASE.md).
Desligada por padrao, apenas fixtures sinteticas e diagnostico com permissao
de configuracao fiscal. Sem transporte HTTP, persistencia, agenda ou novos
bloqueios de pedidos/titulos. Captura real e vinculos operacionais sao etapas futuras.
Publicacao e QA exclusivamente DEV: [roteiro NSDOCS offline](../../../ops/deploy/README-nsdocs-v2-dev-20261024.md).

Etapa seguinte preparada: [consulta administrativa manual NSDOCS no DEV](NSDOCS_V2_CONSULTA_MANUAL_DEV.md).
Comando de backend separado da aplicacao, chave em arquivo privado fora do Git,
cadastro/UUID/CNPJ conferidos e um GET limitado por execucao explicita.
Conector automatico e permissoes web permanecem como estao; sem gravacao financeira.

Preparacao seguinte: [captura manual persistente com XML no DEV](NSDOCS_V2_CAPTURA_MANUAL_DEV.md).
CLI explicita, idempotencia por lote/chave fiscal, historico e XML privado imutavel.
Requer migration estrutural e bucket fiscalDEV separado, ainda nao criados/aplicados
nesta etapa. Sem ativar automatico, alterar producao ou criar bloqueios financeiros.

## Mudanca segura

Vinculos operacionais NF-e/pedidos/titulos preparados para o piloto DEV:
[contrato, permissoes e homologacao local](NFE_VINCULOS_PEDIDOS_TITULOS_DEV.md).
Suporta a mesma nota em pedidos de varias solicitacoes, sem bloquear financeiro
ou ativar sincronizacao NSDOCS. Migration aditiva ainda nao aplicada; liberar
backend/schema DEV antes do frontend, em etapa de publicacao autorizada.

Testar parser, processor, fixtures, duplicidade, certificado, criptografia, S3, locks, preflight, permissao, vinculos, divergencias e consumidores. Os documentos `fiscal_fase*` registram a construcao historica; este arquivo define o estado conceitual atual.
