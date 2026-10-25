# Complemento NSDOCS e lista fiscal paginada

Implementado e testado LOCALMENTE. Este roteiro prepara a operacao futura:
nao executar na EC2 antes de publicar/conferir o novo backend. Nao usar os
aplicadores antigos: seus manifestos descrevem releases anteriores e continuam
imutaveis. A publicacao Git e tratada por etapas; este roteiro nao executa deploy ou carga real.

## Problema corrigido

O provedor devolveu cinco linhas e X-Total-Registros=5 tanto no offset 0 como no
offset5. A sonda confirmou quatro IDs novos e um repetido entre essas paginas.
O plano original terminou operacionalmente, mas nao cobriu o acervo integral.

O modo manual agora trata pagina cheia como cobertura incerta e nao segue
offsets com ordenacao por data como garantia de completude. Uma pagina vazia
com deslocamento positivo e reconhecida pelo parser; a captura legada pede
subdivisao/conferencia em vez de anunciar janela concluida sem prova.

## Funcionamento do complemento

1. Preparar um NOVO ID, referenciando o plano original. Ler as chaves das
   observacoes do plano anterior e validar empresa, schema e capturas concluidas.
   Nao editar o plano original, as observacoes ou os XMLs existentes.
2. Descobrir somente metadados, em janelas de ate 31 dias e ambos status, usando
   quantidade100/offset 0. Cada execucao faz de 1 a 10 consultas, com 60 s entre elas.
   Se uma resposta vier cheia ou indicar continuacao, descartar essa amostra
   como prova de cobertura e subdividir a janela em dois periodos disjuntos.
3. Uma janela menor que 100 e sem sinal de continuacao tem seus metadados
   registrados no snapshot privado. A ordem das linhas nao importa. A mesma
   NF-e entre status/janelas e deduplicada pela chave; identidade conflitante
   interrompe a descoberta. Um dia cheio nao e considerado enumerado: fica
   needs_review, sem capturar ou anunciar completude. Nao ha fallback por offset.
4. Ao terminar a enumeracao, congelar um manifesto com hash e IDs duraveis
   para lotes de ate 5 NF-e. Metadados privados600/diretorio700; manifesto imutavel
   e checkpoint separado e compacto. Cada lote grava apenas seu progresso,
   nao reescreve todos os metadados. Limites de 8 MiB/arquivo, 10 mil documentos e
   20 mil janelas interrompem com erro, sem declarar completo.
5. Capturar de 1 a 10 lotes por comando. Conferir a identidade e reutilizar
   referencias XML ja observadas para a mesma empresa/bucket/prefixo e com hash
   valido. So documentos novos ou sem observacao reutilizavel pedem XML NSDOCS.
   Cadastro canonico anterior, status, manifestacao, links e baixas permanecem.
   Novas observacoes/eventos registram a reutilizacao. Nao ha DeleteObject.
6. Retomar o MESMO ID apos falha. Commit no RDS antes de perder ACK/checkpoint
   produz replay do lote, sem novo XML ou duplicacao. O banco existente fornece
   unicidade por chave e captura/chave, transacoes e lock MySQL.

O snapshot representa o acervo retornado durante a enumeracao, nao uma trava
no provedor. Notas recebidas depois precisam de consulta futura. Nao equiparar
contagem de lotes ao total do portal. source_documents_missing deve ser 0 para
anunciar complete; se alguma das notas originais nao aparecer no novo snapshot,
ela permanece no sistema e a cobertura fica pendente de conferencia.

## Preparacao da operacao apos homologacao/deploy do backend

Manter Nodes isolados, ambiente e PM2; nenhuma migration ou npm install e
necessario para esta implementacao. Backend antes do frontend. Preparar um
aplicador especifico com inventario/retorno antes de publicar a release.

No terminal Ubuntu, depois desse deploy, definir e GUARDAR um UUID de complemento
uma unica vez (usar a biblioteca node:crypto do Node PROD). Nao gerar outro ID
para retomar. Os trechos abaixo sao exemplos operacionais, nao foram executados.

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend
NODE_PROD=/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node
ORIGEM_NSDOCS_ID=8e0a4179-506a-4670-88a2-d9079728e263
COMPLEMENTO_NSDOCS_ID=COLOQUE_AQUI_O_UUID_GUARDADO
```

Preparar somente o arquivo privado, sem NSDOCS/XML/S3 nem escrita no banco:

```bash
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM \
CONFIRM_NSDOCS_PROD_CAPTURE=SIM \
  "$NODE_PROD" scripts/nsdocsProdComplement.js --preparar \
  --empresa-id 1 --cnpj 27123008000100 \
  --origem-id "$ORIGEM_NSDOCS_ID" --plano-id "$COMPLEMENTO_NSDOCS_ID"
```

Piloto de descoberta (um GET de lista, dois eventos no journal privado, locks
temporarios; sem XML, escrita RDS/S3 ou alteracao do plano antigo):

```bash
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM \
CONFIRM_NSDOCS_PROD_CAPTURE=SIM \
  "$NODE_PROD" scripts/nsdocsProdComplement.js --descobrir \
  --empresa-id 1 --cnpj 27123008000100 \
  --plano-id "$COMPLEMENTO_NSDOCS_ID" --max-consultas 1 \
  --confirmar-chamada-real
```

Conferir antes de continuar. Aumentar para ate 10 consultas somente apos piloto
aprovado; aguardar cooldown de 60 s desde a ultima consulta. Janelas cheias podem
acrescentar outras janelas ao plano. Contagens pequenas de metadados nao sao
o limite da carga integral. O CLI imprime progresso depois de cada consulta.

Quando enumeration_complete=true, needs_review=false e source_documents_missing=0,
conferir os totais descobertos com a NSDOCS no MESMO CNPJ/periodo/modelo antes de
liberar XMLs. Comecar com um lote, revisar e so depois aumentar ate 10:

```bash
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM \
CONFIRM_NSDOCS_PROD_CAPTURE=SIM \
  "$NODE_PROD" scripts/nsdocsProdComplement.js --capturar \
  --empresa-id 1 --cnpj 27123008000100 \
  --plano-id "$COMPLEMENTO_NSDOCS_ID" --max-lotes 1 \
  --confirmar-chamada-real --confirmar-persistencia --confirmar-status-xml
```

Consulta somente leitura, sem chave/NSDOCS, disponivel em outro terminal:

```bash
"$NODE_PROD" scripts/nsdocsProdComplement.js --consultar \
  --empresa-id 1 --cnpj 27123008000100 --plano-id "$COMPLEMENTO_NSDOCS_ID"
```

Nao iniciar outra captura enquanto uma esta ativa. A mesma exclusao mutua de
plano/query e usada com o CLI anterior. Nunca remover locks para contornar erro.
Os resumos imprimem contagens e IDs do plano, nao notas/XML/chaves. A chave
NSDOCS continua no arquivo privado existente e nunca vai em argv/env/frontend.
O automatico/fixtures devem permanecer OFF inclusive no arquivo.env, com TLS e
identidade do RDS conferidos pelo runtime existente. Nenhum bloqueio financeiro.

## Lista fiscal

GET /api/fiscal/documents existente, com as mesmas permissoes/filtros. Consulta
limitada a 50 registros por pagina; navegacao numerada ou rolagem sob demanda.
Nao consulta a NSDOCS, captura notas ou baixa XMLs ao rolar. Empresas carregadas
uma vez por abertura; uma requisicao de documentos ativa por vez, fila guarda
somente o filtro mais recente, eventos repetidos de scroll nao duplicam chamadas.
Filtros continuam rascunho ate Atualizar lista; alterar o recorte reinicia pagina1.
Erro de continuacao preserva linhas e pede tentativa explicita. O total da faixa
vem do servidor, nao do tamanho da pagina. A lista exclui parsed_xml_json e
raw_summary_json; detalhe, arquivos assinados, DANFE e historico mantidos.

## Testes locais

- Backend: `npm run test:nsdocs-complemento` e
  `npm run test:fiscal-documentos-paginacao` em backend.
- Regressao de vinculos, baixas parciais e dossie: validarVinculosNfePedidos.js e
  validarFiscalPagamentoDocumentos.js, alem de estorno/permissoes granulares.
- Frontend: `npm run test:fiscal-documentos-paginacao` e `npm run build`.
- Fixtures/SQLite em memoria/transportes simulados: 46 notas existentes + 14 novas
  preservam os 46 cadastros/XMLs; so 14 XMLs novos sao baixados. Outro complemento e
  replay nao duplicam arquivos. Sobreposicao, ordem diferente, dia cheio, nota
  original ausente, conflito, falha de rede/disco/ACK, locks e tamanho protegidos.
- Navegador: 125 documentos / 3 paginas, scroll, serializacao, erro/retry, filtros,
  XML/detalhes, mobile e datas/historico em tres fusos. Sem rede externa.

Nao houve chamada real a NSDOCS/AWS/RDS, SSH, escrita de dados reais, migration,
restart, mudanca de env/Node/dump ou alteracao em producao/DEV nesta implementacao.
