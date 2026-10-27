# IAM dedicado da captura fiscal DEV

Preparacao local no fluxo de homologacao autorizado. Nenhuma chamadaAWS/EC2,
criacaoIAM, publicacao, troca de chave ou mudanca deproducao pelo agente.

## Evidencias recebidas

Usuario confirmou fluxy-fiscal-dev (preexistente) e fluxy-fiscal-prod (novo) em
us-east-2. Informou feita etapa HTTPS/versionamentoDEV, pendente preflight real.
PrintEC2 sem roleIAM. Diagnostico do arquivo backendDEV/.env: accesskey/secret
presentes, sem sessiontoken/profile/roleARN, AWS CLI ausente. STS executado pelo
operador retornou `arn:aws:iam::992500432025:user/admin-jose`. Nenhum segredo
recebido; nao inferir privilegios do nome ou compartilhamento com outros apps.

Politica existente fornecida pelo usuario: **FluxyFiscalDevS3Access**, anexada
a admin-jose. Permite ListBucket e GetObject/PutObject/GetObjectVersion em todo
fluxy-fiscal-dev. Nao contem as5 leituras de configuracao exigidas no preflight.
Esse documento nao comprova todas as permissoes efetivas do usuario. Preserva-lo
e manter o vinculo atual; nao ampliar/restringir uma politica usada pelo backend.

## Console IAM: funcao com politica em linha

Para manter as politicas gerenciadas existentes, usar documento restrito em linha
na nova funcao. O JSON e o mesmo ja testado; codigo e session policy nao mudam.

1. **IAM > Funcoes > Criar funcao > Politica de confianca personalizada**:
   usar `backend/src/modules/fiscal/services/nsdocs/manual/iam-dev-trust.json`.
2. Avancar sem selecionar politicas gerenciadas. Nome da funcao:
   **FluxyNsdocsFiscalDev**. Duracao maxima padrao1h pode permanecer: captura
   pede900s. Criar a funcao com essa confianca, inicialmente sem acessoS3.
3. Abrir a funcao > **Permissoes > Adicionar permissoes > Criar politica em
   linha > JSON**. Usar exatamente
   `backend/src/modules/fiscal/services/nsdocs/manual/iam-dev-policy.json`.
   Nome da politica em linha: **FluxyNsdocsFiscalDevS3**.

Nao anexar FluxyFiscalDevS3Access a nova funcao. Sua abrangencia permanece no
usuario atual, sem ser herdada pela sessao restrita da captura.
Se a politica gerenciada FluxyNsdocsFiscalDevS3 proposta anteriormente ja tiver
sido criada, nao apaga-la automaticamente: revisar vinculos antes de decidir
por reuso. Nao e necessario criar outra politica gerenciada para este roteiro.
[AWS: politica em linha em uma funcao](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_manage-attach-detach.html).

Resultado esperado: **arn:aws:iam::992500432025:role/FluxyNsdocsFiscalDev**.
Se ja existir recurso com esse nome, revisar seu conteudo antes de reusar;
nao sobrescrever politica/permissoes preexistentes automaticamente.

Politica em linha fica na nova role, nao no usuario admin-jose ou como instance profile
da EC2. Nao gerar accesskeys, remover chaves atuais, mudar usuario/grupos/
boundaries/SCP, reiniciar servicos ou trocar storage deproducao nesta etapa.

Confianca direta em usuario da mesma conta permite AssumeRole sem criar outra
politica no usuario, desde que nao haja bloqueio porDeny/boundary/SCP. Recusa
deve ser diagnosticada sem remover controles ou ampliar acesso automaticamente.
[AWS AssumeRole](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html).

## Limites e implementacao preparada

-5 leituras de configuracao do bucketDEV, HTTPS/owner esperado.
-GetObject/PutObject somente em dev/nsdocs/27123008000100/nfe/*.
-DenyS3 explicito fora desses recursos: PROD,Experience,staginggeral e outros
  prefixos/empresas. Sem Allow para excluir objetos ou administrar bucket/IAM.
-A mesma politica e enviada como session policy, limitando a sessao mesmo se
  a credencial de origem eventualmente possuir permissoes maiores.
-Isso limita a captura sob a role; nao revoga direitos atuais de admin-jose nem
  prova isolamento entre processos de mesmoUID. Identidades dos apps permanecem.
-SDKSTS instalado/pinado3.996.12, endpointHTTPS Ohio fixo, timeout15s, sem retry;
  resposta confere ARN/token/validade. Uma sessao porcliente/captura, em memoria.
-Sem credenciais em argv/logs/novosarquivos/PM2/process.env, nem fallback ao
  usuario original se AssumeRole falhar. XML/financeiro/NSDOCS automatico intactos.

Nomes/buckets/conta/role exigidos no codigo; configuracao publica esta no roteiro
da captura. Nenhum recursoIAM criado/homologado na AWS pelo agente. Testes
locais:24 captura,19 manuais,11 base e10 operador; rede real bloqueada.
Inclui SDKSTS serializando request/response com transporte simulado.

## Proximo passo

Criar/conferir nova role/politica no console. Quando solicitado, publicar delta
exclusivo refactor/frontend e preparar operadorDEV/migration comTLS dedicado.
Configurar nomes/roleARN noDEV preservando chaveNSDOCS e automaticoOFF. Preflight
deve validar AssumeRole, bucketprivado/owner/versionamento, empresa/schemaDEV.
Antes da captura real, conferir comNSDOCS a semantica do indicador no GET XML.
