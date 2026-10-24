# Carga historica manual NSDOCS v2 — producao

Pacote sobre main0b20cc4d. Usuario autorizou commit/push e comandos PROD por etapas;
backup cifrado/timer atuais confirmados. Publicar primeiro somente o backend.
Este arquivo nao significa que a EC2, IAM ou credencial ja foram atualizados.
O agente nao executou migration, configuracao de chave, chamada NSDOCS, escrita
AWS/RDS ou reinicio. O DEV e sua branch permanecem intactos.

## Aplicador de producao

`ops/deploy/atualizar-prod-nsdocs-historico-20261024.cjs` e exclusivo deste pacote.
Enviar por stdin via SSH com Node PROD isolado e diretorio raiz PROD; usar SHA
completo e hash SHA256 informados na resposta de publicacao, nunca tip de DEV.

- `preparar SHA_BACKEND`: fetch/main exato, inventario/backend sem frontend,
  dependencia saxes instalada5.0.1 e apenas declaracao direta, HEAD PROD0b20cc4d
  ou b5e34d7b (etapa frontend anterior ainda nao baixada), branchmain/Node/PM2/3apps
  conferidos. Snapshot privado em .git/fluxy-nsdocs-historico-prod-20261024,
  dir700/estado600. Nao altera checkout/env/schema/processos/dumps.
- `aplicar`: exige CONFIRM_PROD_BACKUP=SIM, CONFIRM_PROD_BACKUP_TIMER=SIM,
  CONFIRM_PROD_MAINTENANCE=SIM e CONFIRM_NSDOCS_PROD_SCHEMA=SIM; timer ativo.
  Avanca SHA exato por ff-only, QA de backend/inventario/aplicador, TLS/UUID/empresa/
  storageconfig/flagsOFF, aplica so migration003, confere colunas/indices/ledger
  e reinicia apenas o ID de backend-solicitacoes com Node/ambiente preservados.
  Confere health estavel/peers/Nodes/env/dumps/unidade/dropin. Sem npm/install,
  update-env/save/update/resurrect, chamada NSDOCS, IAM/S3 ou chave pelo deploy.
- `conferir`: leitura do estado, hashes, processos, persistencia e schema quando
  pronto. Retorna frontend_liberado=false. Nao substitui preflight de IAM/chave.
- `voltar`: exige backup/timer/janela. Restaura apenas fontes anteriores que
  existiam (package/lock/validador), mantendo HEAD/schema/dados/XML/historico.
  Novos modulos ficam inertes. Se ledger003 ausente, guarda migration pendente
  fora do runtime, sem desfazer DDL. Restart apenas PROD. Tracked alterado e
  esperado depois do retorno; nao reset/clean/pull para contornar essa situacao.

O aplicador serializa com o lock de operacao PROD existente. Se outro processo
ou arquivo protegido mudar, interrompe. Snapshot contem ambiente privado: nunca
enviar seu conteudo. O operator antigo de NF-e/S3 compara estados/hashes de outra
etapa e nao deve ser reutilizado para conferir/retornar este novo deploy.

Depois de NSDOCS_HISTORICO_BACKEND_PROD_PRONTO, adicionar a politica IAM abaixo
e configurar a chave em SSH interativo. Enviar somente resultados sanitizados
de conferencia/preflight, antes de liberar frontend e programar o piloto.

## Escopo e ordem da implantacao

1. Publicar primeiro somente backend/CLI/QA/migration, com SHA e inventario exatos.
   CLI nao e importada pela app e pode ser preparada sem reinicio. O filtro
   web de origem NSDOCS foi acrescentado ao validador existente: depois do schema
   sera necessario reiniciar somente backend-solicitacoes, controladamente,
   preservando Node/ambiente e conferindo health/peers, antes do frontend.
   Nunca reiniciar PM2 daemon, Experience ou DEV. Conferir dependencias instaladas;
   saxes5.0.1 ja existe transitivamente no lock e apenas foi declarado diretamente.
2. Conferir backup PROD recente no Drive cifrado, timer e identidade TLS/UUID.
   Aplicar exclusivamente `202610240003_fiscal_nsdocs_historico.js`, sem migrate
   geral, down ou restart antes da conferencia. Havendo outra pendencia, parar.
3. Na role existente FluxyFiscalProd, adicionar APENAS a politica suplementar
   `nsdocs-prod-bucket-inspection-policy-20261024.json`. Acrescenta quatro leituras
   de seguranca do bucket; nao substituir as permissoes atuais, trust ou politica
   HTTPS. Nao anexar role a EC2, trocar chave global ou alterar IAM do DEV.
4. Criar/configurar uma chave NSDOCS exclusiva desta carga PROD, conferir empresa
   fiscal1/operacional1/CNPJ27123008000100, executar preflight e piloto de uma NF-e.
5. Depois da prova de backend/schema/storage/credencial/piloto, publicar frontend.
   Retira consulta direta SEFAZ, ensaio fixture e preflight SEFAZ das telas/cliente
   HTTP; conserva logs, horarios, NSUs, payloads assinados e origem SEFAZ legada.
   Diagnostico de armazenamento, XML, DANFE, permissoes e vinculos continuam.
6. Definir periodo historico, salvar plano privado e executar lotes limitados.
   Homologar lista/detalhe, XML, historico, duplicidade e vinculos existentes.

Nao seguir comandos genericos antigos com npm install, update-env ou PM2 save.
O frontend preparado fica em commit separado retido ate prova das etapas acima.

## Limites e isolamento

- CLI `backend/scripts/nsdocsProdCapture.js`, ubuntu1000, Linux, branchmain,
  checkout `/home/ubuntu/sistema-gestao-solicitacoes-main/backend` e Node isolado
  `/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node`, v24.22.1.
- RDS PROD/gestao_solicitacoes, UUID5ed4b970-009f-11f1-809c-0ad0e0c90c53,
  CA AWS Ohio com hash/certificados conferidos e TLS com verificacao de identidade.
  Conexao dedicada; nao importa app/models globais nem muda ambiente de PM2.
- Piloto restrito a operacional1/CNPJ27123008000100, cadastro fiscal ativo e
  vinculado conferido no banco antes da chave. Nao reutilizar empresa2 do DEV.
- Chave em `/home/ubuntu/.config/fluxy-nsdocs-prod/credentials.json`: diretorio700,
  arquivo600, uid1000, sem symlink/hardlink, criacao exclusiva. Nao copia chave DEV,
  nao vai a .env, PM2, argv, Git ou navegador. Arquivo protegido por permissoes
  Unix, nao cofre cifrado; ubuntu/root conseguem le-lo. Nao enviar seu conteudo.
- NSDOCS_V2_ENABLED e NSDOCS_V2_FIXTURES_ENABLED devem continuar ausentes/false;
  recusa se ligados inclusive no arquivo.env. Nao muda FISCAL_SEFAZ_ENABLED,
  scheduler ou certificado legado. A retirada SEFAZ desta tarefa e do frontend;
  revisar eventual agendamento SEFAZ preexistente separadamente antes da carga real.
- NF-e modelo55 nesta etapa. CT-e/NFS-e sao contabilizados como nao suportados,
  sem XML importado; nao anunciar que todos os modelos foram carregados.
- Sem endpoint web, listener, cron, job, manifestacao fiscal, marcacao em lote
  como utilizado, criacao de pedido/titulo, envio para autorizacao/fila, baixa,
  estorno ou bloqueio financeiro. Acesso web segue as permissoes existentes.

## Configurar chave sem exposicao (apos publicacao)

Somente no terminal SSH interativo da EC2, como ubuntu. Nao em CMD/Console JS.

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend
NODE_PROD=/home/ubuntu/fluxy-node24-prod/node-v24.22.1-linux-x64/bin/node
"$NODE_PROD" scripts/nsdocsProdCapture.js --configurar \
  --empresa-id 1 --cnpj 27123008000100
```

Somente quando aparecer o prompt de entrada oculta, colar o valor da chave,
sem `Bearer`. Nao digitar chave no comando, export, chat ou arquivo do repo.
Nao sobrescreve chave existente; Ctrl+C cancela. Depois:

```bash
"$NODE_PROD" scripts/nsdocsProdCapture.js --conferir --empresa-id 1 --cnpj 27123008000100
```

Confere credencial/empresa/pendencia de schema, sem NSDOCS. Schema exclusivo:

```bash
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_SCHEMA=SIM \
  "$NODE_PROD" scripts/nsdocsProdCapture.js --aplicar-schema --empresa-id 1 --cnpj 27123008000100
"$NODE_PROD" scripts/nsdocsProdCapture.js --preflight --empresa-id 1 --cnpj 27123008000100
```

O preflight faz leituras RDS/STS/S3 e valida a chave local sem testar autenticacao
NSDOCS. Nao grava objeto nem chama a NSDOCS. Falta de permissao IAM interrompe;
nao ha fallback de escrita com a credencial original administrativa.

## Piloto e comportamento de status

A [documentacao oficial NSDOCS v2](https://developer.nsdocs.com.br/) permite
filtros por emissao/recebimento e separa os grupos Pendente e Importado. O GET
de XML recebe um parametro de status de utilizacao. Enviamos explicitamente o
status observado na lista, nunca PUT de marcacao ou manifestacao. A documentacao
nao resolve a concorrencia com outro consumidor que altere esse status entre
lista e XML: homologar em uma nota de teste antes de lotes maiores. A flag
`--confirmar-status-xml` registra a escolha explicita do operador; nao prova que
uma chamada GET seja isenta de efeitos remotos.

Primeiro uma nota, com UUID guardado e filtros identicos na retomada:

```bash
CAPTURA_ID=$("$NODE_PROD" -e 'console.log(require("node:crypto").randomUUID())')
# Guardar o CAPTURA_ID. Ajustar somente as datas de um piloto previamente escolhido.
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CAPTURE=SIM \
  "$NODE_PROD" scripts/nsdocsProdCapture.js --capturar --empresa-id 1 --cnpj 27123008000100 \
  --captura-id "$CAPTURA_ID" --inicio 2026-10-16 --fim 2026-10-16 --campo-data data_emissao \
  --status Pendente --quantidade 1 --confirmar-chamada-real --confirmar-persistencia --confirmar-status-xml
"$NODE_PROD" scripts/nsdocsProdCapture.js --historico --empresa-id 1 --cnpj 27123008000100 --captura-id "$CAPTURA_ID"
```

Mesmo ID/filtros/destino concluido devolve replay com zero NSDOCS. Outro ID pode
registrar nova observacao da mesma chave sem outra NF-e canonica. XML/nomes/status/
manifestacao/vinculos de uma nota existente ficam intactos. Historico de cada
captura inclui eventos; XML/observacao e evento da nota sao transacionais.

## Planejar e executar historico

Exemplo ilustrativo: ajustar periodo depois da homologacao do piloto. `--planejar`
sem `--salvar` e puro, nao usa banco/chave/rede. Com `--salvar`, confere empresa
PROD no banco e cria plano privado600, sem chamadas NSDOCS ou escrita RDS/S3.

```bash
"$NODE_PROD" scripts/nsdocsProdCapture.js --planejar --salvar \
  --empresa-id 1 --cnpj 27123008000100 --inicio 2026-01-01 --fim 2026-10-24
```

Guardar o `plan_id` retornado. O plano usa emissao por padrao; pode escolher
`--campo-data data_recebimento` explicitamente. Janelas inclusivas de ate31dias,
sem lacunas, ambos status e lotes de ate5 documentos. IDs de lotes persistidos
antes das chamadas. O plano nao inicia captura sozinho.

```bash
# Substituir UUID_DO_PLANO pelo plan_id retornado, sem recriar o plano na retomada.
CONFIRM_PROD_BACKUP=SIM CONFIRM_PROD_BACKUP_TIMER=SIM CONFIRM_NSDOCS_PROD_CAPTURE=SIM \
  "$NODE_PROD" scripts/nsdocsProdCapture.js --executar-plano --plano-id UUID_DO_PLANO \
  --empresa-id 1 --cnpj 27123008000100 --max-lotes 1 \
  --confirmar-chamada-real --confirmar-persistencia --confirmar-status-xml
"$NODE_PROD" scripts/nsdocsProdCapture.js --consultar-plano --plano-id UUID_DO_PLANO \
  --empresa-id 1 --cnpj 27123008000100
```

Padrao1/maximo10 lotes por comando, intervalo minimo60s entre lotes; em retomada
imediata pode exigir aguardar60s. Um lote faz um GET de lista e ate5 GETs de XML.
Sem retry HTTP automatico, timeout15s/GET e180s/lote, corpo1MiB/lista e2MiB/XML.
Nova pagina recebe outro ID, mesmo lote usa ID original. Falha de disco apos
COMMIT retoma por replay; nao perde a pagina seguinte. Plano concluido nao faz
novas chamadas. `--consultar-plano` e `--historico` nao usam a chave nem a API.

Ao atingir2000 registros, pagina curta inconsistente ou necessidade de particionar,
para com `needs_partition`; nao declara concluido. Estreitar datas em outro plano
e revisar sobreposicoes. Fonte NSDOCS mutavel nao e um snapshot: reconciliar
novamente intervalos sobrepostos quando houver novas entradas/mudanca de status.
Unicidade impede duplicar a nota. Documentos so disponiveis fora da NSDOCS nao
serao recuperados por este fluxo. Consumo/custo depende do plano contratado.

## Storage, XML e retorno

- Role FluxyFiscalProd com a trust existente/sessionNamefluxy-fiscal-prod; sessao
  de captura reduzida a `fluxy-fiscal-prod/prod/nsdocs/27123008000100/nfe/*`.
  Nao altera o cliente fiscal global nem usa bucket DEV. Preflight exige dono,
  regiao Ohio, bloqueio publico integral, ACL desabilitada e versionamento ativo.
- XML com chave por acesso+SHA256, AES256, checksum, If-None-Match:*; se existe,
  confere os bytes. Nao sobrescreve/exclui objeto. Falha DB pode deixar XML privado
  sem referencia; retomada reutiliza conteudo. Sem limpeza automatica.
- Parser estrutural recusa DTD/entidades externas/ambiguidade, confere chave/DV,
  partes/CNPJ/modelo/numero/data/centavos. Nao valida assinatura digital, XSD ou
  situacao atual na SEFAZ. Grava identity_checked_signature_unverified.
- Migration so cria3 tabelas fiscais com FKs/indices, sem backfill. Recusa DML e
  outros alvos; ledger so depois de colunas/InnoDB/indices completos conferidos.
- Para interromper, Ctrl+C; progresso concluido fica guardado. Locks remanescentes
  apos SIGKILL/falha do host exigem diagnostico antes de remocao, nunca forcar.
  Limite do journal privado1000eventos/256KiB e plano1MiB: para para revisao,
  nunca trunca trilha automaticamente. Historico no banco e preservado.
- Retorno: parar de usar CLI e voltar frontend pela Vercel anterior se necessario.
  Manter tabelas, notas, XMLs, eventos e configuracao PROD. Nunca down/drop, copiar
  credencial DEV ou restaurar dump/Node de outro ambiente.

## QA local

44 testes de captura/guardas/plano aprovados, incluindo compatibilidade da trust
e filtro de origem NSDOCS na lista/relatorio. SQLite real para transacoes/unicidade/FKs;
MySQL locks/metadados/DDL, S3/STS e NSDOCS adaptados. Zero chamadas externas nos QA.
Inclui erros/retomada/COMMIT perdido, conflito empresa/chave, XML malicioso,
S3 privado/checksum/conditional write, credencial600, ambos status/janelas/paginas,
concorrencia, cancelamento, falha de progresso e limite de pagina.
UI real em navegador desktop/mobile: sem consulta/preflight/fixture SEFAZ, logs
e payloads assinados preservados, storage e erro de permissao funcionais.
Datas/historico/XML em3 fusos, vinculos/baixas parciais, dossie/fila/URL assinada,
ACL financeira e auditoria granular aprovados; build concluido.
Nao comprova MySQL/RDS, IAM/S3 ou semantica NSDOCS reais desta carga PROD.
Aplicador:5 testes com filesystem/PM2/HTTP/processos simulados, cobrindo prepare,
aplicacao/ordem/schema/restartunico, flags ausentes/QA/DDL falhos, retorno antes e
depois do ledger, hash divergente/frontend no pacote/peer alterado. Nenhum desses
testes efetua operacoes na EC2. Inventario usa modo backendOnly na etapa EC2,
pois os hashes frontend se referem ao candidato ainda retido.
