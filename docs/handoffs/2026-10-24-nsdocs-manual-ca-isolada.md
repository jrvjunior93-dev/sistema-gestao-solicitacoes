# Retomada NSDOCS manual - CA isolada

## Evidencia e escopo

Usuario executou operador f16f8351, que parou antes do fast-forward com71. O
diagnostico readonly no ambiente inicial de backend-dev mostrou development,
porta8001, host staging, banco esperado, TLS nao desativado e migrations
bloqueadas true; somente ca_configurada=false.

A preparacao anterior exigiu CA global do aplicativo, algo nao conferido no DEV.
Essa dependencia era desnecessaria para um comando isolado. Corrigir na mesma
publicacao DEV ja autorizada, sem enfraquecer TLS ou mudar a conexao do aplicativo.
O diagnostico nao comprova TLS do app e nao justifica afirmar que ele esteja ativo.

## Correcao

- Novo JSON publico manual/rds-ca-us-east-2.json, baixado do endpoint oficial
  AWS em24/10/2026: https://truststore.pki.rds.amazonaws.com/us-east-2/us-east-2-bundle.pem.
  4576 bytes, tres raizes, sem chave privada. SHA256 do conteudo PEM:
  d46e1bdfda05c8e7644e50930806a19b139a222542bf0348082fb59ece2b5fa5.
- Novo rdsTls.js: hash/regiao/origem fixos, X509 raiz/autoassinatura/validade,
  rejectUnauthorized e verifyIdentity true. Certificados publicos em JSON para
  preservar os bytes entre checkouts Windows/Linux; nao e arquivo secreto .pem.
- policy/runtime manual: guarda de ambiente deixa de exigir DB_SSL_CA_FILE global;
  conexao de leitura recebe sempre a CA dedicada validada e exige cipher MySQL
  nao vazio. Nao ha ramo sem SSL nem alteracao de .env/config/env/database do app.
- Operador manual: verifica o bundle no alvo git antes de ff, passa CA publica
  por stdin ao probe (nao a chave NSDOCS), exige TLS/UUID/READ ONLY/rollback. Aceita
  HEAD f2167ff7, f16f8351 ou alvo. Inventario cumulativo fechado de20 arquivos
  desde f2167ff7; nao aceita commits/arquivos adicionais.
- Novas regressoes: CA global vazia aceita somente com SSL verificado/dedicado,
  CA adulterada/expirada rejeitada, sessao sem cipher rejeitada, preflight real
  em VM executado com CA global ausente e retomada desdef16f8351.

## Validacao e limites

19 testes manuais e9 do operador aprovados com fronteiras ficticias.11 da base,
ACL financeira, sintaxe e inventario/diff conferidos antes da publicacao.
Somente download de certificados publicos AWS foi real; nao acessamos EC2, banco,
chave NSDOCS ou API NSDOCS. Nao houve restart, migration, instalacao, .env/Node/PM2/
dumps alterados, chamada fiscal ou escrita de negocio pelo agente.

Nao afirmar que TLS do backend ativo foi migrado: a correcao vale somente para
as conexoes administrativas de consulta. A chave ainda so sera configurada pelo
usuario em prompt TTY apos a atualizacao aprovada. Sem automatico, frontend,
permissao nova, bloqueio financeiro ou mudanca em producao/main.

## Restricao de rede

Usuario reforcou nao deixar portas expostas e depois confirmou que as regras
nao estao expostas, autorizando seguir. Essa e evidencia informada pelo usuario,
nao auditoria AWS remota executada pelo agente. Nao alterar SG, UFW, Nginx ou
bind dos apps nesta tarefa. O comando manual nao cria listener/endpoint nem
regra de entrada; usa apenas clientes de saida e TLS validado.

## Retomada operacional

Usar o novo SHA publicado com o mesmo operador, lido por git show do alvo; nao
executar f16f8351 novamente nem aplicar CA global para passar no verificador.
Roteiro e setup mantem dois blocos separados. Enviar prova de atualizacao e
conferencia sem chave/arquivo privado. Handshake/UUID/cipher reais ainda serao
conferidos na EC2 pelo usuario; falha deve interromper sem downgrade.
