# NSDOCS v2: primeira consulta administrativa no DEV

Preparacao de 2026-10-24. Os comandos abaixo sao para **depois da atualizacao
destes arquivos no DEV**, seguindo o [roteiro de publicacao](../../../ops/deploy/README-nsdocs-manual-dev-20261024.md).
O commit offline f2167ff7 sozinho ainda nao contem `nsdocsDevManual.js`.

## Fronteira desta etapa

A consulta e um comando administrativo no backend da EC2, executado pelo usuario
`ubuntu`, no checkout DEV e com seu Node24.22.1 isolado. Nao cria tela, endpoint,
agenda ou nova permissao para usuarios web. ACL fiscal, autenticacao, aprovacoes
e fluxos de compras/financeiro existentes permanecem como estao.

O conector da aplicacao continua desligado: nao habilitar `NSDOCS_V2_ENABLED`,
`NSDOCS_V2_FIXTURES_ENABLED`, Fiscal ou SEFAZ para executar este comando.
Nao precisa reiniciar backend-dev, producao, Experience ou daemon PM2 para a
consulta administrativa. Nao modifica Node, PATH, PM2, dumps, `.env` ou frontend.

A chave fica em `/home/ubuntu/.config/fluxy-nsdocs-dev/credentials.json`, fora do
checkout, com diretorio700 e arquivo600, pertencentes a ubuntu. Nao e variavel
de ambiente, nao vai para dumps do PM2, navegador, Vercel ou Git. E um arquivo
protegido pelas permissoes Unix, nao um cofre criptografado: ubuntu e root podem
le-lo. Nao imprimir, compartilhar ou copiar seu conteudo.

## Conferencia de identidade e empresa

Antes de pedir ou usar a chave:
- exige Linux, uid1000, diretorio DEV exato, branch refactor/frontend e Node DEV
  isolado v24.22.1;
- exige deployment development, porta8001, host RDS staging e banco esperado;
- usa CA publica AWS RDS Ohio versionada para este comando, com hash fixo,
  certificados raiz validos e TLS/identidade verificados; nao depende da CA global
  do aplicativo nem altera `DB_SSL_CA_FILE`;
- confere UUID real do MySQL DEV em transacao `START TRANSACTION READ ONLY`;
- exige cipher TLS nao vazio na sessao MySQL antes de consultar cadastro;
- consulta o cadastro ativo de empresas do grupo por ID, compara CNPJ valido e
  encerra com rollback/close. Nao cria cadastro nem corrige dados automaticamente.

Na resposta NSDOCS, confere `empresa_cnpj` em cada documento; NF-e tambem precisa
ter a empresa entre emitente/destinatario. CNPJs pontuados sao normalizados.
Receber lista vazia **nao comprova a empresa**: o resumo indica essa limitacao.
Uma resposta correta nao prova que a chave tenha somente aquela empresa ou
somente permissoes GET; restringir a empresa tambem no painel NSDOCS.

Referencia de identidade inicial informada pelo usuario: CONSTRUTORA SUL
CAPIXABA LTDA, CNPJ27.123.008/0001-00. Conferir esse CNPJ com a empresa selecionada
na chave NSDOCS e no cadastro DEV. O ID do Fluxy nao e o ID da NSDOCS.

## Configurar a chave sem expo-la

Usar uma sessao SSH **interativa** como ubuntu. Nao usar redirecionamento de
arquivo/pipe para fornecer a chave; o configurador exige TTY.

1. Listar as empresas cadastradas no DEV para descobrir o ID correto:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-dev/backend
NODE_DEV=/home/ubuntu/fluxy-node24-dev/node-v24.22.1-linux-x64/bin/node
"$NODE_DEV" scripts/nsdocsDevManual.js --listar-empresas
```

Mostra ate100 cadastros ativos locais. Nao usa chave ou API NSDOCS. Empresa com
CNPJ ausente/invalido aparece como nao elegivel; nao escolher ID por suposicao.

2. Substituir `ID_ENCONTRADO_NO_DEV` pelo ID correto. O CNPJ abaixo corresponde a
empresa apresentada pelo usuario; ajustar somente se a chave for de outra empresa:

```bash
"$NODE_DEV" scripts/nsdocsDevManual.js --configurar \
  --empresa-id ID_ENCONTRADO_NO_DEV --cnpj 27123008000100
```

O programa confere DEV/cadastro antes de mostrar o prompt. **Somente nesse
prompt**, cole a chave criada no painel NSDOCS e pressione Enter. A entrada
fica oculta, sem eco e sem historico de linha. Nao cole a chave no chat,
argumentos do comando, `export`, `.env`, variaveis `VITE_*`, PowerShell ou CMD.
Nao inclua o prefixo `Bearer `: somente o valor da chave.

Esperado: `NSDOCS_CREDENCIAL_DEV_GUARDADA`, `external_calls:0`, conector false.
O arquivo e criado uma unica vez; nao sobrescreve credencial existente.
Ctrl+C cancela a entrada sem salvar. Nao enviar screenshot/cat do arquivo.

3. Conferir instalacao/permissoes/empresa sem chamada externa:

```bash
"$NODE_DEV" scripts/nsdocsDevManual.js --conferir \
  --empresa-id ID_ENCONTRADO_NO_DEV --cnpj 27123008000100
```

Esperado: `NSDOCS_CREDENCIAL_DEV_CONFERIDA` e `external_calls:0`. Esse comando
valida o arquivo local; ainda nao testa autenticacao no provedor.

## Consulta real, somente quando executar explicitamente

Exemplo de periodo curto. Ajustar datas e ID antes de executar:

```bash
"$NODE_DEV" scripts/nsdocsDevManual.js --consultar \
  --empresa-id ID_ENCONTRADO_NO_DEV --cnpj 27123008000100 \
  --inicio 2026-10-18 --fim 2026-10-24 --status Pendente \
  --quantidade 10 --deslocamento 0 --confirmar-chamada-real
```

Cada execucao faz **um GET real** da lista de documentos armazenados na NSDOCS.
Nao pressupomos ausencia de consumo/limite do plano contratado. Limites locais:
periodo de ate31 dias, ate20 registros por pagina, teto2000 da API, timeout15s,
corpo compacto/descompactado ate1MiB e intervalo minimo60s entre tentativas.
Nao segue redirects, nao usa proxy de ambiente e nao faz retentativa automatica.
Ctrl+C encerra a requisicao e libera o lock quando o encerramento e normal.

O status e obrigatorio: `Pendente` significa nao marcado como utilizado na
NSDOCS, nao aprovacao financeira. Para consultar documentos ja utilizados por
outro integrador, repetir manualmente com `--status Importado`, respeitando o
intervalo. Nao varrer ambos automaticamente nesta etapa.

Por padrao imprime apenas resumo: empresa conferida, quantidade/total/paginacao,
request_id e `persisted:false`. Para uma previa limitada no terminal autorizado,
acrescentar `--mostrar-documentos`: numero, emitente, data, centavos e situacao.
Nao compartilhar saida de documentos reais no chat. Nunca imprime a chave,
Authorization, URL completa de erro, resposta bruta ou arquivo privado.

## Historico, falhas e limites

Historico operacional privado600 em `history.jsonl`, no mesmo diretorio privado:
somente instante, request_id, ID da empresa, resultado fixo e contagem. Sem chave,
payload, XML, PDF, favorecido, chave fiscal ou erro bruto. Lock de arquivo exclusivo
impede duas consultas simultaneas; limite local de1000 eventos/256KiB interrompe
antes de descartar historico. Uma interrupcao forcada/SIGKILL pode deixar lock;
nao apagar automaticamente nem contornar protecoes, conferir o estado primeiro.

401/403 indicam falha de autenticacao/acesso; 429 indica limite do provedor.
202 nao e tratado como lista pronta. Esses casos nao disparam nova chamada.
Nao presumir liberacao de cota apos60s; seguir o limite do contrato/provedor.
Erros de rede/arquivo/SQL sao sanitizados. Guardas ou cadastros divergentes
interrompem sem API; nao flexibilizar TLS, empresa ou ambiente para continuar.

Esta etapa nao baixa XML/PDF, manifesta, importa por chave, marca utilizado com
PUT ou grava documentos em tabelas/S3. NFS-e/CT-e ficam como nao implementados.
Metadados NF-e sao nao verificados fiscalmente; futura captura precisara de XML,
eventos e auditoria/idempotencia persistente. Nenhum pedido/titulo/favorecido/PIX,
saldo/baixa/historico de negocio e alterado; nao ha novos bloqueios financeiros.

Contrato: [documentacao oficial NSDOCS v2](https://developer.nsdocs.com.br/).
CA publica: [AWS RDS por regiao](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/UsingWithRDS.SSL.html).
O JSON `manual/rds-ca-us-east-2.json` contem somente os tres certificados raiz
publicos de Ohio, com origem e SHA256; nenhum segredo. O helper `rdsTls.js` valida
hash, regiao, validade e autoassinatura antes de construir ssl. Nao registra CA no
SO/Node global e nao faz download na EC2. Uma CA adulterada/expirada interrompe.
A origem HTTPS e o endpoint de listagem sao fixos no backend; Bearer somente no
header dessa origem. Escopo real da chave sera homologado na execucao pelo usuario.

## QA desta entrega

```bash
cd backend
npm run test:nsdocs-manual-dev
npm run test:nsdocs-v2
```

Testes usam somente fronteiras ficticias: SO/Git/FS, banco, terminal e HTTPS.
Nenhuma credencial real, `.env`, EC2, MySQL ou NSDOCS foi acessada pelo agente.
