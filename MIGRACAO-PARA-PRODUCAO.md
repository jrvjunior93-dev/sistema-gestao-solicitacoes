# Migração do Fluxy V4 para produção

> **Atenção — referência histórica.** Este arquivo preserva o plano original da
> consolidação V4, cuja fotografia principal termina em 25/08/2026. Para promover a
> branch `refactor/frontend` atual para `main`, configurar a produção e preparar o
> treinamento, use o documento vigente
> [`docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md`](docs/deploy/POS_DEPLOY_REFACTOR_FRONTEND.md).
> Ele compara as branches por commit, registra as migrations, permissões, configurações
> administrativas, testes, validação pós-deploy e mudanças que precisam ser comunicadas.

Processo para levar o trabalho feito em `Fluxy-V4` (ambiente local) para a produção em
`main`, sem regressão e sem quebrar o sistema em uso.

> **Documento vivo.** As seções [Variáveis de ambiente novas](#1-variáveis-de-ambiente-novas)
> e [Inventário de alterações](#3-inventário-de-alterações-fora-do-frontend) são atualizadas a
> cada mudança que exija ação manual sua. Consulte-as imediatamente antes de migrar — elas são
> o contrato entre o que foi desenvolvido aqui e o que precisa ser preparado lá.

Última atualização do conteúdo histórico: **2026-08-25**

Referência operacional atual adicionada em: **2026-09-11**

---

## Contexto da produção

Levantado da documentação existente do projeto (`docs/arquitetura/`).

| Componente | Onde |
|---|---|
| API | `api.jrfluxy.com.br` |
| Backend | EC2 + PM2, processo `backend-solicitacoes`, porta 8000 |
| Proxy | Nginx → `127.0.0.1:8000` |
| Frontend | Vercel |
| Banco | MySQL |
| Arquivos | S3 |
| Branch de produção | `main` |
| Branch de desenvolvimento | `dev-v2` (PM2 `backend-dev`) |

Os processos PM2 **não são intercambiáveis**: deploy de `main` reinicia só
`backend-solicitacoes`; deploy de `dev-v2` reinicia só `backend-dev`.

---

## Princípio: o que migra e o que nunca migra

### Migra

- Código do frontend reelaborado
- Alterações de backend listadas no [inventário](#3-inventário-de-alterações-fora-do-frontend)
- Migrations novas, se houver

### Nunca migra

| Item | Motivo |
|---|---|
| `backend/.env` | Contém a configuração local com integrações desligadas. Sobrescrever o `.env` de produção derrubaria pagamentos, e-mail, S3 e Sienge de uma vez. |
| `frontend/.env.local` | Aponta para `127.0.0.1:8100`. |
| `AMBIENTE-LOCAL.md`, `MIGRACAO-PARA-PRODUCAO.md` | Documentos do ambiente local (pode levar, mas não têm função em produção). |
| `backups/*.sql` | Dump de 70 MB. |
| Senha do usuário id 1 | Foi redefinida **só no banco local**. É dado, não código — não acompanha o deploy. A senha de produção desse usuário continua intacta. |
| Estado do banco local | O `fluxy_main_copia` é cópia de trabalho. Nenhum dado local volta para produção. |

> Antes de qualquer commit, confirme que `.env` e `.env.local` estão fora. O `.gitignore`
> do projeto já cobre isso, mas a conferência é obrigatória no checklist de PR.

---

## 1. Variáveis de ambiente novas

**Estas precisam entrar no `.env` de produção ANTES do deploy do código.** Você aplica
manualmente na EC2.

### Registro atual

| Variável | Valor em produção | Obrigatória? | Se faltar |
|---|---|---|---|
| `MFA_POLICY_ENABLED` | `true` (ou simplesmente **não criar**) | Não | Nada quebra. O código assume `true` por padrão, que é o comportamento atual de produção. |

**Contexto do `MFA_POLICY_ENABLED`:** o Fluxy obriga perfis ADMIN/SUPERADMIN a configurar
TOTP antes de liberar o sistema. Essa regra estava fixa no código e travava o dashboard
local. Foi transformada em chave de ambiente com **padrão seguro**: só desliga com
`MFA_POLICY_ENABLED=false` explícito, que existe apenas no `.env` local.

Ou seja: esta variável é a única nova até agora, e é **opcional em produção**. Se você não
fizer nada, produção continua exigindo MFA exatamente como hoje.

> ⚠️ O que **não** pode acontecer é `MFA_POLICY_ENABLED=false` chegar ao `.env` de produção.
> Isso removeria a exigência de MFA de todos os administradores.

### Previstas — alertas de vencimento (ainda não implementadas)

Decisão de 16/08 criou o job diário de alertas de vencimento. **Estas variáveis precisarão
existir no `.env` de produção antes do deploy dessa funcionalidade:**

| Variável | Valor em produção | Obrigatória? | Se faltar |
|---|---|---|---|
| `ALERTA_VENCIMENTOS_ENABLED` | `true` | Sim, para o alerta funcionar | O job não roda. Padrão será `false`, então a ausência **não quebra nada** — apenas não envia. |
| `ALERTA_VENCIMENTOS_HORA` | a definir (D25) | Não | Assume um horário padrão |

**Pré-requisito que não é variável nova, mas precisa ser conferido:**

O envio depende de `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `MAIL_FROM`. O código
**bloqueia o envio** se qualquer uma faltar (`emailService.js` lança `EMAIL_NOT_CONFIGURED`).

O sistema já usa e-mail na recuperação de senha, então provavelmente estão configuradas — mas
**nenhuma delas consta do `.env.example`**, então não há como confirmar daqui. Antes do deploy:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && grep -cE "^(SMTP_HOST|SMTP_USER|SMTP_PASS|MAIL_FROM)=.+" .env
```

Esperado: **4**. Se vier menos, o alerta não sairá — e a falha é silenciosa do ponto de vista
do usuário.

### Como novas entradas serão registradas

A cada variável nova que eu introduzir durante a reelaboração, adiciono uma linha aqui com:
nome, valor recomendado em produção, se é obrigatória e o que acontece se faltar. Eu também
aviso na conversa no momento em que criar. Nenhuma variável nova entra em código sem passar
por esta tabela.

---

## 2. Verificações obrigatórias antes do deploy

### 2.1 Credenciais AWS — bloqueante

A alteração no `s3.js` (ver inventário) introduziu `isStorageOfflineMode()`. Ela considera o
storage desligado quando **qualquer uma** destas três estiver vazia:

```
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
```

Em modo offline, `getPresignedUrl()` devolve a URL bruta em vez de assinar — **os anexos
param de abrir para os usuários**, sem erro visível no log.

Confirme na EC2, antes de subir o código:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && grep -cE "^AWS_REGION=.+|^AWS_ACCESS_KEY_ID=.+|^AWS_SECRET_ACCESS_KEY=.+" .env
```

O resultado precisa ser **3**. Se vier menos, **não faça o deploy** — me avise antes.

> Essa checagem importa especialmente se a produção usar IAM Role da EC2 em vez de chaves
> estáticas no `.env`. Nesse cenário o código novo entraria em modo offline indevidamente e
> eu preciso ajustar a detecção antes da migração.

### 2.2 Conferência geral do `.env` de produção

Sem expor senhas:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && grep -E "^(NODE_ENV|PORT|DB_HOST|DB_NAME|DB_USER|MFA_POLICY_ENABLED|BB_TLS_REJECT_UNAUTHORIZED)=" .env
```

Esperado:

```env
NODE_ENV=production
PORT=8000
BB_TLS_REJECT_UNAUTHORIZED=true
```

`MFA_POLICY_ENABLED` deve estar **ausente** ou `true`. Nunca `false`.

### 2.3 TESTE PRINCIPAL — acesso a arquivos não pode regredir

**Este é o teste mais importante da migração do `s3.js`.** Ele existe porque a correção de
segurança aperta a validação de hostname, e apertar validação carrega risco de **usuário
legítimo deixar de ver arquivo**.

#### O que muda

A validação atual usa `hostname.startsWith('<bucket>.s3')`, que só olha o começo do texto e
por isso aceita `<bucket>.s3.evil-attacker.com`. A correção exige que o hostname **termine em
`.amazonaws.com`**, mantendo todas as variações legítimas de endpoint da AWS.

#### Resultado do teste contra dados reais

Executado sobre as **54 colunas de URL** do banco (cópia de produção, corte 14/08):

| Verificação | Resultado |
|---|---|
| URLs reais que continuam abrindo | **14.815 de 14.815** |
| Regressões (deixariam de abrir) | **0** |
| Divergência de bucket resolvido | **0** |
| Variações legítimas de endpoint aceitas | 7 de 7 (com região, sem região, `s3-<região>`, dualstack, fips, outra região, bucket de staging) |
| Hostnames forjados barrados | 5 de 5 |

Observação relevante: a implementação **atual aceitava os 5 hostnames forjados**. A correção
barra todos, sem custo de compatibilidade.

Reexecutável: `node qa/auditoria-urls/validar-correcao-hostname.js`
(sai com código 0 = aprovado, 1 = reprovado)

#### Pré-deploy: confirmar contra os dados reais de PRODUÇÃO

A validação acima usou a cópia local, cujo dado mais recente é 14/08. Antes do deploy, confirme
que produção não tem nenhum hostname fora do padrão:

```bash
mysql -h HOST_RDS -u admin -p -D gestao_solicitacoes -N -e "SELECT DISTINCT SUBSTRING_INDEX(SUBSTRING_INDEX(caminho_arquivo,'/',3),'/',-1) FROM anexos WHERE caminho_arquivo LIKE 'http%'"
```

**Critério de liberação:** todo hostname retornado deve terminar em `.amazonaws.com`.
Se aparecer qualquer host que não termine assim, **não faça o deploy** — significa que existe
registro que deixaria de abrir. Me avise antes.

Para cobrir as demais tabelas além de `anexos`, rode o script completo apontando para produção
(ele é somente leitura).

#### Pós-deploy: validação funcional

1. Abrir uma solicitação com anexo e **visualizar o arquivo** — precisa abrir normalmente
2. Repetir com um anexo antigo (registro de meses atrás) e um recente
3. Testar um documento de RH e um comprovante financeiro (usam o mesmo caminho de assinatura)
4. Conferir que não surgiram eventos novos:

```bash
mysql -h HOST_RDS -u admin -p -D gestao_solicitacoes -N -e "SELECT COUNT(*) FROM security_event_logs WHERE tipo_evento='FILE_PRESIGN_INVALID_TARGET' AND createdAt >= NOW() - INTERVAL 1 HOUR"
```

Esperado: `0`. Qualquer valor acima disso indica arquivo legítimo sendo rejeitado pela
validação nova — sinal de regressão, e motivo para rollback do backend.

### 2.4 Nota lateral: `.env.example` defasado

Comparando o `.env.example` com as variáveis que o código realmente lê, 41 chaves usadas em
runtime não constam no exemplo — entre elas `SMTP_HOST`, `OPS_ENABLED`, as `SIENGE_*`,
`WEB_URL`, `PASSWORD_RESET_URL` e `AUDIT_IP_HASH_SECRET`.

Isso **não é efeito deste projeto** e provavelmente já está correto no `.env` real de
produção. Fica registrado porque, no dia em que alguém montar um ambiente novo a partir do
`.env.example`, vai faltar configuração. Vale corrigir em algum momento, fora desta migração.

---

## 3. Inventário de alterações fora do frontend

Toda alteração de backend feita no V4 fica registrada aqui, porque é o que carrega risco de
regressão. O frontend será reescrito por inteiro e é avaliado como um bloco.

| Arquivo | O que mudou | Vai para produção? | QA | Risco |
|---|---|---|---|---|
| `backend/src/services/mfaPolicyService.js` | Política de MFA virou chave de ambiente, com `true` como padrão | **Sim** | ✅ **APROVADO** — `qa/relatorios/mfa-policy.md` | Baixo — sem a variável no `.env`, o comportamento é idêntico ao atual |
| `backend/src/services/s3.js` | `S3Client` passou a ser lazy; `getPresignedUrl` não assina em modo offline | **Bloqueado** | ❌ **REPROVADO** — `qa/relatorios/storage-s3.md` | **Alto** — quebra produção em deploy com IAM Role. Ver 3.1 |
| `frontend/vite.config.js` | Porta dev 5273, `strictPort`, host `127.0.0.1`, default de API `8100` | **Opcional** | n/a | Nulo em produção — o bloco `server` só age em `vite dev`; a Vercel usa `vite build` |
| `backend/.env` | Configuração local completa | **Não** | — | — |
| `frontend/.env.local` | API local | **Não** | — | — |
| `legal-pages/.git` | Remote `origin` removido | **Não** | — | Alteração só do clone local |
| **Apropriação padrão por obra** — migration `202608160001`, model `ObraTipoApropriacaoPadrao`, `ObraTipoApropriacaoController`, 3 rotas, página `ObraTipoApropriacao.jsx`, card em `Configuracoes.jsx` | Funcionalidade nova: mapeia apropriação automática por obra + tipo | **Sim** | ✅ **APROVADO** (re-auditoria, 226/230) — `qa/relatorios/obra-tipo-apropriacao.md` | Baixo — tabela nova, nenhuma tabela existente alterada. **Sem variável de ambiente nova.** |
| **Estrutura do fluxo de contratos** — migrations `202608160002` e `202608160003`, `contratoCodigoService`, `ContratoCodigoSequencia`, `Contrato` ampliado e auditoria somente leitura de duplicados | 15 colunas em `contratos`, índice único `(codigo, obra_id)`, sequencial `CT-0001` | **Sim** | ⚠️ **REPROVADO na 1ª auditoria; correções aplicadas e verificadas pelo implementador, sem re-auditoria independente** — `qa/relatorios/contratos-estrutura.md` | Médio — ver 3.3 |

### 3.3 Ensaio de deploy — executado em 16/08

O deploy foi **ensaiado do começo ao fim** num banco restaurado a partir de
`backups/fluxy_main_copia_pre_migrations.sql`, que reproduz o estado de produção hoje
(246 tabelas, 165 migrations aplicadas, `contratos` com 14 colunas e os 5 duplicados
`CT/ADM001-33` ainda presentes).

| Passo | Resultado |
|---|---|
| 1. Rodar migrations **sem** limpar antes | `202608160001` e `202608160002` aplicam; **`202608160003` falha** com a mensagem apontando `CT/ADM001-33 (obra 23): 5` |
| 2. Conferir registro | A `003` **não** foi registrada em `schema_migrations` — tenta de novo na próxima subida |
| 3. Efeito parcial | As 15 colunas de `contratos` foram criadas mesmo assim (14 → 29): a falha não bloqueia o que já passou |
| 4. Saneamento no banco isolado do ensaio | Removidos 4 contratos (715–718); este procedimento histórico não é autorização para alterar dev-v2 ou produção por script |
| 5. Rodar migrations de novo | `003` e `004` aplicam; **"Migrations concluidas"** |
| 6. Rodar uma terceira vez | Nada aplicado — idempotente |
| 7. Comparar schema final | **249 tabelas / 3.770 colunas**, idêntico ao ambiente local |

**Conclusão prática:** se houver duplicados, a migration para com mensagem clara e sem dano.
Os registros devem ser revisados e corrigidos por um usuário na interface antes de uma nova
tentativa. Nenhum script de limpeza acompanha ou integra o procedimento de deploy.

> O ensaio usou um banco `qa_migration_teste`, criado com privilégio concedido ao usuário
> local `admin` restrito ao padrão `qa\_%` — ele continua sem poder criar ou tocar outros
> bancos da instância.

### 3.4 Estrutura de contratos — pré-requisito de deploy

> **Antes do deploy**, executar apenas a auditoria de leitura
> `node scripts/auditarContratosDuplicados.js` e corrigir pela interface de **Gestão de
> Contratos** qualquer grupo encontrado.
>
> A migration `202608160003` **falha de propósito** se houver contrato com código repetido na
> mesma obra: o boot para com mensagem clara e a migration não é registrada, para tentar de
> novo na subida seguinte. É deliberado — a alternativa (apenas avisar) deixava o índice único
> nunca ser criado, sem ninguém perceber.
>
> Depois do deploy, confirmar que o índice existe:
>
> ```bash
> mysql -h HOST_RDS -u admin -p -D gestao_solicitacoes -N -e "SHOW INDEX FROM contratos WHERE Key_name='idx_contratos_codigo_obra'"
> ```
>
> Retorno vazio significa que o índice não foi criado — a proteção contra código duplicado não
> está ativa.

> **Nota de processo:** esta entrega foi reprovada na primeira auditoria (2 falhas críticas) e
> as correções foram verificadas pelo próprio implementador, a pedido do cliente, sem nova
> auditoria independente. Fica registrado para a decisão de migração.

### 3.5 Fluxo novo de contratos dentro da Nova Solicitação (D38) — passos de dados

O código migra pelo repositório (inclui a chave `usa_fluxo_contrato_novo` registrada no
comportamento de tipos, backend e frontend). Mas o fluxo **só aparece** para os usuários após
três passos de **dados**, feitos pela própria interface de produção (nenhum SQL manual):

1. **Cadastrar pela interface:** em **Configurações > Tipos (Macro)**, criar `CONTRATO`, usar
   `codigo_interno = CONTRATO_FLUXO_NOVO`, marcar **Usar fluxo novo de contratos** e configurar
   os campos obrigatórios. Em **Tipos de Subcontrato**, criar `ABERTURA DE CONTRATO`,
   `SOLICITACAO DE CONTRATO` e `ADITIVO DE CONTRATO`, vinculados ao tipo criado.
2. **Liberar o tipo por setor:** tela **Tipos de Solicitação por Setor** — adicionar o tipo
   CONTRATO aos setores que abrem contrato (no local foi liberado para GERENCIA via a mesma
   config `CHAVE_TIPOS_SOLICITACAO_POR_SETOR`; sem isso o tipo não aparece no select).
3. **Curar categorias e conceder permissão** (já documentado na etapa 8): categorias
   financeiras do contrato na tela de configuração (local usa 46/48/49) e permissão estrita
   `contratos.aprovacao.aprovar` a quem aprova.

Sem o passo 2 o comportamento é o padrão do sistema: o tipo existe mas nenhum setor o vê.

### 3.6 Medição do fluxo novo (wireframe 2) — migration nova

`backend/migrations/202608170002_medicao_parcelas.js` cria a tabela `medicao_parcelas`, que
registra qual medição consumiu qual parcela de contrato e quanto (decisão MD-6 do cliente).
Roda sozinha no boot, como as demais; é `CREATE TABLE IF NOT EXISTS` e não toca em dado
existente.

Sem variável de ambiente nova. Nada a configurar por tela.

**Regra que difere entre fluxos, de propósito:** a validação de período sobreposto vale
apenas para contratos do fluxo novo. Em produção há **375 pares de medições sobrepostas** no
mesmo contrato — é prática corrente, e ligar a regra para todos bloquearia trabalho real.
`fim >= início` vale para os dois fluxos.

### 3.7 Medição: coluna `valor_previsto` — migration nova

`backend/migrations/202608180001_contrato_parcelas_valor_previsto.js` adiciona
`contrato_parcelas.valor_previsto` sem alterar registros existentes.

É a referência da auditoria pedida pelo cliente (PI-5): comparar o **valor previsto na criação
do contrato** com o **valor solicitado por parcela**. Sem ela a comparação é impossível, porque
`valor` é sobrescrito a cada medição.

Registros antigos permanecem nulos. O valor passa a ser preenchido pela aplicação nas ações
feitas pela interface depois do deploy.

Sem variável de ambiente nova.

### 3.8 Medição: devolução de saldo e encerramento de contrato

**Migration:** `202608180002_medicao_parcelas_devolucao.js` adiciona `devolvido_em` e
`devolvido_motivo` em `medicao_parcelas`. Sem variável de ambiente nova.

**Duas permissões novas** aparecem na tela de permissões após o deploy (catálogo em
`backend/src/constants/moduloPermissoes.js`) e precisam ser concedidas a quem for usá-las:

| Permissão | Para quê |
|---|---|
| `contratos.geral.encerrar` | Encerrar contrato (quebra de contrato): zera o saldo e exclui os títulos em aberto |
| `contratos.medicao.editar_valor` | Editar o valor da parcela depois que a medição já foi criada |
| `contratos.juridico.tramitar` | Marcar minuta pronta e registrar assinatura (é na assinatura que as parcelas viram títulos) |

Ninguém as tem por padrão — inclusive administradores. Enquanto não forem concedidas, a ação de
encerrar responde 403, que é o comportamento seguro.

**Efeito colateral esperado na tela de títulos:** excluir um título que pertence a contrato do
fluxo novo passa a devolver o valor para a parcela final daquele contrato. Títulos que não são de
contrato seguem exatamente como hoje.

### 3.9 Limite do Jurídico como configuração

Chave nova `CONTRATO_LIMITE_JURIDICO` em `configuracoes_sistema`, com endpoints
`GET/PATCH /configuracoes/contrato-limite-juridico`. **Sem migration e sem variável de
ambiente**: enquanto a chave não existir, o sistema usa R$ 50.000, que é o comportamento atual.

Depois do deploy, a Diretoria define o valor pela tela de configurações. O número manda em duas
coisas: o caminho do Jurídico na aprovação e a exigência de negociação detalhada.

### 3.10 Favorecido do contrato — migration nova

`202608180003_contrato_favorecido.js` adiciona `contratos.favorecido_id` (quem recebe o
pagamento) sem inferir ou alterar contratos existentes. Registros antigos permanecem nulos até
uma atualização feita pela interface. Sem variável de ambiente.

Efeito no fluxo novo: o contrato passa a registrar **todos os contratados** em
`contrato_credores` (antes não gravava nenhum) e as parcelas/títulos apontam para o
**favorecido**, que pode ser um terceiro.

### 3.11 Justificativa do contrato — migration nova

`202608180004_contrato_justificativa.js` adiciona `contratos.justificativa` (TEXT, nulo).
Contratos existentes ficam nulos — não há como inventar a justificativa de contrato já
assinado. Sem variável de ambiente.

### 3.12 Termo aditivo — migration nova

`202608180005_contrato_aditivos.js` cria `contrato_aditivos`. Não altera nada do que existe:
`contratos.valor_aditivos` continua sendo a fonte do saldo e passa a ser alimentado pela
**aprovação** do aditivo, em vez de à mão. Sem variável de ambiente.

Endpoints novos: `GET /contratos/fluxo-novo/:id/aditivos/teto`,
`POST /contratos/fluxo-novo/:id/aditivos` e
`POST /contratos/fluxo-novo/aditivos/:aditivoId/decisao`. A decisão exige a permissão de
aprovação de contrato que já existe — nenhuma permissão nova.

### 3.13 Abertura única e termo aditivo na medição (PI-14 / PI-15) — 19/08

**Sem migration de schema. Sem variável de ambiente nova. Sem permissão nova.**
São dois passos de **cadastro** e três de código. Mapa: `MAPA-IMPACTO-ADITIVO-E-SUBTIPOS.md`.

#### Passos de cadastro — executar no corte

```sql
-- 1. PI-14: sobra so a ABERTURA como subtipo de criacao de contrato.
UPDATE tipos_sub_contrato SET ativo = 0 WHERE id IN (26, 27);

-- 2. Conferir que nao sobrou regra de campos apontando para os subtipos desativados.
SELECT valor FROM configuracoes_sistema
 WHERE chave = 'NOVA_SOLICITACAO_CAMPOS_POR_TIPO'
 ORDER BY id DESC LIMIT 1;   -- nao pode conter "33:26" nem "33:27"
```

**3. Desativar o tipo de solicitação 2 (`ABERTURA DE CONTRATO`, o do fluxo antigo)** — decisão do
cliente, no corte. Ele tem **172 solicitações históricas**, que continuam consultáveis: desativar
o tipo tira a opção de abrir novas, não apaga o passado.

> Enquanto o tipo 2 estiver ativo, ele e o subtipo 25 têm **o mesmo nome**. Não quebra a tela
> (o `<select>` de tipo e o de subtipo são campos distintos), mas confunde quem lê e já quebrou
> teste. É mais um motivo para o passo 3 acontecer junto.

#### Código

| Arquivo | O que mudou | Risco |
|---|---|---|
| `backend/src/routes.js` | Rotas do aditivo neutras de fluxo (`/contratos/:id/aditivos*`), com validação numérica do `:id`. As antigas sob `fluxo-novo` permanecem por compatibilidade | Baixo — só acrescenta rotas |
| `backend/src/services/contratoAditivoService.js` | Guarda nova: contrato **encerrado ou inativo** não aceita aditivo, na solicitação **e** na aprovação. `calcularTetoAditivo` passou a devolver `aceita_aditivo` | Baixo — fecha uma porta que estava aberta |
| `backend/src/controllers/ContratoController.js` | Saldo do contrato passa a somar `valor_aditivos`, nos **dois** pontos que o calculam (listagem e relatório operacional) | **Médio — é o único ponto que toca a trilha legada** |

**Sobre o risco médio:** a conta virou `valor_total + ajuste_solicitado + valor_aditivos`.
Hoje os **335 contratos legados têm `valor_aditivos = 0`**, então o saldo de todos eles é
idêntico ao de antes. **Conferir isso em produção antes do deploy:**

```sql
SELECT COUNT(*) AS legados_com_aditivo
  FROM contratos WHERE fluxo_novo = 0 AND COALESCE(valor_aditivos, 0) <> 0;
-- Esperado: 0. Se vier diferente de zero, o saldo desses contratos MUDA no deploy —
-- levantar quais sao e validar com o cliente antes de seguir.
```

O `ajuste_solicitado` (ajuste manual do legado, hoje em 10 dos 335) **não é tocado** pela
aprovação do aditivo: cada mecanismo tem seu campo, e não há duplo cômputo. Provado em
`qa/medicao/16-aditivo-contrato-legado.js`, que escolhe de propósito um contrato com ajuste
manual e confere os dois campos antes e depois.

#### QA

`qa/medicao/15-tela-aditivo.js` (14 provas), `16-aditivo-contrato-legado.js` (15 provas) e
`17-abertura-unica.js` (12 provas), mais as regressões de `medicao/03` a `14` e
`integracao-d38/01` e `03`. Todas ✅ em 19/08. **Ainda sem auditoria independente.**

---


### 3.14 Contrato como solicitação (PI-16 / PI-17) — 19/08

**Backend concluído; a tela ainda não.** Não migrar antes de a tela estar pronta e auditada —
o backend já não cria solicitação para medição do fluxo novo, e sem a tela correspondente o
usuário fica sem por onde acompanhar.

#### Migrations (aplicadas e conferidas no local)

| Migration | O quê |
|---|---|
| `202608190001_contrato_solicitacao` | `contratos.solicitacao_id` (anulável) — a solicitação única do contrato |
| `202608190002_contrato_medicoes` | tabela `contrato_medicoes` + `medicao_parcelas.medicao_id` |
| `202608190003_anexo_historico_medicao` | `medicao_id` em `anexos` e `historicos` |

Nenhuma coluna removida, nenhuma linha convertida: **não existe contrato do fluxo novo** hoje.

#### Passos de cadastro — executar no corte

```sql
-- 1. Tipo de uso do sistema para o aditivo de contrato LEGADO (PI-17).
--    `somente_sistema: true` e o que o esconde da Nova Solicitacao em TODOS os setores.
INSERT INTO tipo_solicitacao (nome, ativo, codigo_interno, comportamento, createdAt, updatedAt)
VALUES ('ADITIVO DE CONTRATO', 1, 'ADITIVO_DE_CONTRATO',
        '{"mostrar_valor":true,"exige_valor":true,"mostrar_descricao":true,"exige_descricao":false,
          "mostrar_apropriacao_principal":false,"exige_apropriacao_principal":false,
          "mostrar_contrato":true,"exige_contrato":true,"mostrar_subtipo":false,"exige_subtipo":false,
          "mostrar_periodo_medicao":false,"exige_periodo_medicao":false,
          "mostrar_ref_contrato_abertura":false,"exige_ref_contrato_abertura":false,
          "mostrar_itens_apropriacao":false,"exige_itens_apropriacao":false,
          "exige_apropriacoes_contrato":false,"usa_fluxo_contrato_novo":false,
          "somente_sistema":true}', NOW(), NOW());

-- 2. Apontar a configuracao para o id gerado acima.
INSERT INTO configuracoes_sistema (chave, valor, createdAt, updatedAt)
VALUES ('CONTRATO_ADITIVO_TIPO_SOLICITACAO',
        (SELECT id FROM (SELECT id FROM tipo_solicitacao WHERE codigo_interno='ADITIVO_DE_CONTRATO' LIMIT 1) t),
        NOW(), NOW());
```

**Conferir depois:** o tipo **não** pode aparecer na Nova Solicitação em setor nenhum, e
`POST /solicitacoes` com ele tem de responder 400. Provado por `qa/medicao/17-abertura-unica.js`.

#### Permissão nova

`contratos.solicitacao.cancelar` — **ninguém a tem por padrão**. Cancelar é terminal; rejeitar,
que devolve em `PENDENTE DE AJUSTE`, continua sob a permissão de aprovação.

#### Mudança de comportamento que as pessoas vão sentir

**Medições de contrato do fluxo novo deixam de aparecer na lista de Solicitações.** Um contrato com
19 medições passa a ter **uma** linha, e as medições vivem dentro dela (histórico, títulos e o
registro numerado). O Financeiro deixa de aprovar/pagar "a medição" e passa a fazê-lo **pelo
título**. As 665 medições legadas ficam intactas, e medição de contrato legado continua gerando
solicitação própria.

Avisar o Financeiro e a Gerência de Processos **antes** do corte.

---

### 3.15 Cadastro do credor e anexo da negociação (PI-20) — 20/08

#### Migration

`202608200001_contrato_anexo_tipo.js` — coluna `tipo` em `contrato_anexos` (nullable, com índice
`(contrato_id, tipo)`). Aditiva: todo anexo existente fica com `NULL`.

#### Permissão nova

`contratos.credor.completar_cadastro`. **Ninguém a tem por padrão — e não é obrigatória.** A rota
também aceita quem tem `contratos.geral.criar` ou `solicitacoes.acoes.criar`, porque a decisão do
cliente é que **quem cria a solicitação corrige o cadastro e a Gerência de Processos revisa**.
Conceder a granular só a quem precisa corrigir sem criar contrato (o próprio GEO, ao revisar).

**Ponto de atenção para a revisão da GEO:** a rota alcança qualquer parceiro, não apenas o do
contrato em aberto. O escopo é curto (endereço e CPF/CNPJ) e toda alteração grava
`PARTNER_CONTRACT_DATA_UPDATED` com antes e depois — é por esse evento que a revisão se faz.

#### Variáveis de ambiente novas

| Variável | Padrão | O que faz |
|---|---|---|
| `CNPJ_LOOKUP_URL` | *(vazia)* | Endpoint da consulta de CNPJ, com `{cnpj}` no lugar do número. **Vazia = recurso desligado**: a rota responde 501 e a tela não mostra o botão. |
| `CNPJ_LOOKUP_TIMEOUT_MS` | `8000` | Tempo máximo da consulta. |
| `UPLOAD_NEGOCIACAO_MAX_MB` | `20` | Tamanho máximo do documento de negociação. |

Sugestão para `CNPJ_LOOKUP_URL`: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}` — gratuita e sem
chave. **Ligar exige liberar saída HTTPS do servidor de aplicação para o host escolhido.** A chamada
sai do backend, nunca do navegador; o que trafega é apenas o CNPJ consultado.

Se a consulta ficar desligada, nada quebra: o preenchimento manual é o caminho garantido, e é o
único disponível hoje no ambiente local.

#### ⚠️ Ligar o ClamAV em produção

`CLAMAV_ENABLED` está `false`. O código de varredura existe e funciona (`clamavService`), mas **não
roda** enquanto a variável estiver desligada. Com a negociação detalhada passando a chegar em
`.docx`, isto deixa de ser detalhe:

- a validação de estrutura (assinatura ZIP, `[Content_Types].xml`, `word/`) confirma que o arquivo
  **é** um `.docx` — não que ele seja inofensivo;
- a checagem nova de macro e objeto embutido cobre os vetores mais comuns de documento Office;
- **malware dentro de um `.docx` estruturalmente válido só é pego por antivírus.**

Definir `CLAMAV_ENABLED=true`, `CLAMAV_HOST` e `CLAMAV_PORT` antes de liberar o campo.

#### Achado registrado, não corrigido

Os `fileFilter` de `uploadComprovantes`, `uploadCnab`, `uploadOfx` e `uploadTreinamentoFile` lançam
`Error` puro ao recusar um tipo de arquivo. Sem `statusCode`, o multer devolve **500 "Erro interno do
servidor"** — quem escolheu o arquivo errado lê isso como sistema quebrado, não como arquivo
recusado. O upload novo (`uploadNegociacaoContrato`) já usa `UploadSecurityError` e responde 400 com
mensagem que orienta. Corrigir os outros quatro muda o status de rotas existentes e ficou fora desta
rodada — decidir antes do deploy.

#### Mudança de comportamento que as pessoas vão sentir

1. **Acima do limite, criar contrato passa por uma conferência.** O cadastro do contratado (endereço
   completo + CPF/CNPJ válido) precisa estar completo. Dos 2.454 fornecedores ativos, **26** estão
   nessa condição — na prática, quase toda abertura acima do limite vai exigir preencher o endereço.
   O modal permite corrigir ali mesmo.
2. **Cadastrar credor passou a exigir endereço completo.** O botão "Cadastrar credor" da busca já
   existia; os campos de endereço não eram mostrados, e é essa lacuna que produziu 2.428
   fornecedores sem endereço. Agora são obrigatórios, na tela e no backend.
3. **"Detalhes da contratação" deixou de ser texto.** Virou anexo `.docx` ou `.pdf`. A coluna
   `contratos.detalhes_contratacao` continua no banco e o texto dos contratos antigos segue visível.
4. **Sem o documento, o contrato não é aprovado** acima do limite.

Avisar a obra e a Gerência de Processos **antes** do corte: o passo 1 é atrito real no primeiro mês,
até a base de fornecedores ser completada.

---

### 3.1 `s3.js` está REPROVADO e não pode migrar

Auditoria independente encontrou, com teste explícito sob `NODE_ENV=production`:

**Deploy com IAM Role da EC2** (região e bucket no `.env`, sem chaves estáticas) faz
`isStorageOfflineMode()` retornar `true` **em produção**. Consequência: anexos voltam sem
assinatura, o backend responde 200, e não há log nem alerta — **falha silenciosa**. Uploads
passam a dar 503.

Não é hipótese: o próprio codebase já contempla IAM Role em `fiscalS3Service.js`.

### Correções pendentes no `s3.js`

Duas, a aplicar juntas (mesmo arquivo, uma auditoria cobre as duas):

**C1 — modo offline por flag explícita.** Trocar a inferência por ausência de credenciais por
`STORAGE_OFFLINE`, presente apenas no `.env` local. Sem a flag, comportamento de produção — o
cenário IAM Role deixa de existir. Mesmo critério do `MFA_POLICY_ENABLED`.
Introduz variável nova: registrar na seção 1 quando aplicada.

**C2 — validação de hostname (segurança, pré-existente).** Trocar
`hostname.startsWith('<bucket>.s3')` por verificação que exige terminação `.amazonaws.com`.
Já validada contra 14.815 URLs reais com **zero regressão** — ver [teste principal](#23-teste-principal--acesso-a-arquivos-não-pode-regredir).

> C2 corrige uma falha que **já existe em produção hoje**, independente deste projeto. Auditoria
> não encontrou indício de exploração: `FILE_PRESIGN_INVALID_TARGET` tem 0 ocorrências no
> histórico, as 14.815 URLs armazenadas apontam todas para o bucket legítimo, e o ataque
> simulado foi barrado pela exigência de arquivo registrado no banco.

Depois de aplicadas, **nova auditoria do zero** antes de liberar.

### 3.2 Nota operacional do MFA (achado da auditoria, severidade média)

O flag `mfa_setup_pending` viaja **dentro do JWT** e o middleware nunca reavalia a política.
Ficou provado que um token emitido com a política desligada continua acessando rotas
protegidas depois de a política ser ligada, por até `JWT_EXPIRES_IN` (8h).

Produção que nunca teve a variável **não é afetada**. Mas se um dia a política for
ligada/desligada num ambiente em uso, é preciso **invalidar as sessões ativas** — o sistema já
tem `token_version` na tabela `users` para isso.

### Detalhe: por que o `s3.js` mudou

O `S3Client` era instanciado no momento do `import` e exigia `AWS_REGION`, derrubando o boot
inteiro do backend em qualquer ambiente sem AWS. Duas consequências da correção:

1. **Lazy loading** — o client só nasce quando é usado. Em produção, com AWS configurada,
   o comportamento é o mesmo de antes, apenas adiado para a primeira chamada.
2. **Modo offline** — necessário porque os anexos herdados da cópia do banco apontam para os
   buckets S3 de produção. Sem essa trava, o ambiente local geraria URLs assinadas válidas
   para produção, o que contraria o isolamento exigido.

Em produção com as três variáveis AWS preenchidas, `isStorageOfflineMode()` retorna `false` e
nada muda no comportamento observável.

---

## 4. Estratégia anti-regressão para a reescrita do frontend

As mudanças de frontend serão grandes. O que protege o sistema:

### 4.1 O frontend é a parte barata de reverter

A Vercel mantém os deploys anteriores. Um rollback de frontend é *promote* do deployment
anterior — segundos, sem tocar em backend nem banco. **Backend e banco não têm essa
facilidade**, então a regra é concentrar o risco no frontend e manter o backend o mais
inalterado possível.

### 4.2 Preview antes de produção

Cada etapa aprovada vai primeiro para um **preview deploy da Vercel** apontando para a API de
produção *ou* para `dev-v2`, conforme combinarmos. Só depois de validada é promovida.

### 4.3 Contrato de API imutável

Enquanto for possível, o frontend novo consome **exatamente os mesmos endpoints e formatos**
que o atual. Se algum ajuste de backend for inevitável, ele entra:

- primeiro como **adição** compatível (novo campo/endpoint), nunca como alteração de contrato
- com o frontend antigo continuando funcional durante a transição
- registrado no [inventário](#3-inventário-de-alterações-fora-do-frontend)

### 4.4 Fluxos críticos — roteiro de validação

Validar sempre estes, em produção logo após o deploy e em preview antes dele:

1. Login (com MFA real, que em produção continua ativo)
2. Dashboard carregando indicadores
3. Lista e detalhe de solicitação
4. Criação de nova solicitação
5. Solicitações de compra e pedidos
6. Financeiro: contas a pagar e a receber
7. Conciliação e baixas existentes
8. Upload e abertura de anexo *(cobre a alteração do `s3.js`)*
9. Comunicação interna
10. Navegação em resolução de notebook e mobile

### 4.5 Migrations

O `runMigrations` roda **automaticamente no boot** do backend. Ele executa apenas o `up` de
cada arquivo ainda não registrado em `schema_migrations`, em ordem alfabética de nome. **O
runner nunca chama `down`** — rollback de código não desfaz migration.

Boa notícia: o projeto já segue o padrão certo. As migrations existentes usam
`src/database/schemaUtils` (`tableExists`, `columnExists`, `indexExists`) antes de cada
operação, o que as torna **idempotentes**, e adicionam colunas sempre com `allowNull: true`,
o que as torna **retrocompatíveis**. O runner ainda reforça isso interceptando `addColumn`
para ignorar coluna já existente.

Toda migration nova deve seguir esse mesmo padrão. Referência real:
`backend/migrations/202608140002_conciliacao_match_auditoria.js`.

```js
'use strict';

const { columnExists, indexExists, tableExists } = require('../src/database/schemaUtils');

const TABLE = 'nome_da_tabela';

module.exports = {
  async up({ DataTypes, queryInterface, sequelize }) {
    if (!(await tableExists(sequelize, TABLE))) return;      // não explode se a tabela não existe

    if (!(await columnExists(sequelize, TABLE, 'campo_novo'))) {
      await queryInterface.addColumn(TABLE, 'campo_novo', {
        type: DataTypes.STRING(40),
        allowNull: true,                                      // nullable = código antigo segue funcionando
        after: 'campo_existente'
      });
    }

    if (!(await indexExists(sequelize, TABLE, 'idx_nome'))) {
      await queryInterface.addIndex(TABLE, ['campo_novo'], { name: 'idx_nome' });
    }
  },

  async down() {
    // Sem rollback destrutivo.
  }
};
```

Regras obrigatórias:

| Regra | Por quê |
|---|---|
| Sempre **aditiva** (nova coluna/tabela/índice), nunca destrutiva | Rollback de código não desfaz schema |
| Coluna nova **sempre** `allowNull: true` ou com default | A versão anterior do código não conhece a coluna; se houver rollback, precisa continuar inserindo |
| Guardas de existência antes de cada operação | Torna a migration re-executável sem erro |
| Nada de `UPDATE`/`DELETE` em massa dentro da migration | Boot do backend não é lugar para operação longa; trava o start em produção |
| Remoção de coluna só em deploy **posterior** | Expand → migrate → contract: só remova depois que nenhuma versão em uso a referencia |
| Nome com prefixo de data `AAAAMMDD####_descricao.js` | A ordem de execução é alfabética |

Antes de ir para produção: backup do banco, e migration testada em staging/`dev-v2` —
regra que já existe na documentação do projeto e continua valendo.

> **Atenção ao baseline.** O banco local tem as 165 migrations registradas, sendo que a última
> foi aplicada pelo boot local em 15/08. Antes de escrever qualquer migration nova, confirme
> quais delas produção já aplicou (ver seção 8). Uma migration nova que pressupõe coluna
> criada por uma migration que produção ainda não rodou quebra no deploy.

---

## 5. Processo de migração

Este ambiente não tem git. O código precisa ser reintegrado ao repositório antes do deploy.

### Passo 1 — Reintegrar ao repositório

Trabalhe a partir de um clone limpo do repositório real (`C:\Fluxy` ou um clone novo), em
branch dedicada a partir de `dev-v2`:

```bash
git checkout dev-v2 && git pull --ff-only origin dev-v2 && git checkout -b frontend-v4
```

Copie para esse clone **apenas** o que a coluna "Vai para produção?" do inventário marca como
sim, mais o frontend reelaborado. Nunca copie a pasta inteira do V4 por cima.

### Passo 2 — Revisar o diff

```bash
git status --short && git diff --stat
```

Confirme que **não** aparecem: `.env`, `.env.local`, `backups/`, `.pfx`, certificados,
`AMBIENTE-LOCAL.md`, `node_modules`.

### Passo 3 — Validar em dev-v2

Merge da branch em `dev-v2`, deploy no ambiente de desenvolvimento (PM2 `backend-dev`) e
percorrer os [fluxos críticos](#44-fluxos-críticos--roteiro-de-validação).

```bash
cd frontend && npm install && npm run build
```

O build precisa passar limpo antes de qualquer promoção.

### Passo 4 — Preparar o `.env` de produção

Aplique manualmente as [variáveis novas](#1-variáveis-de-ambiente-novas) e rode as
[verificações obrigatórias](#2-verificações-obrigatórias-antes-do-deploy).

**Este passo vem antes do deploy do código, não depois.**

### Passo 5 — Backup

```bash
mysqldump --single-transaction --routines --triggers -u USUARIO -p BANCO > backup-pre-v4-$(date +%F).sql
```

Anote também o commit atual de produção, para rollback:

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main && git rev-parse HEAD
```

### Passo 6 — Promover para `main`

Por Pull Request de `dev-v2` para `main`, com revisão dos arquivos alterados.

### Passo 7 — Deploy do backend

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main && git pull --ff-only origin main
```

```bash
cd /home/ubuntu/sistema-gestao-solicitacoes-main/backend && npm install && pm2 restart backend-solicitacoes --update-env
```

Confirmar:

```bash
curl -I http://127.0.0.1:8000/health && pm2 logs backend-solicitacoes --lines 80
```

O health responde `{"ok":true}`. Nos logs, confirme que as migrations aplicadas (se houver)
aparecem sem erro.

### Passo 8 — Deploy do frontend

Redeploy na Vercel a partir de `main`, com cache limpo quando necessário.

### Passo 9 — Validação pós-deploy

Percorrer os dez [fluxos críticos](#44-fluxos-críticos--roteiro-de-validação) em produção.
Verificar também:

```bash
sudo tail -n 50 /var/log/nginx/error.log
```

---

## 6. Rollback

| Camada | Como | Custo |
|---|---|---|
| Frontend | Vercel → promover o deployment anterior | Segundos |
| Backend | `git checkout <commit-anterior>` + `npm install` + `pm2 restart backend-solicitacoes --update-env` | Minutos |
| Banco | Restaurar o dump do passo 5 | Alto — perde transações feitas depois do backup |

**Rollback de código não desfaz migration.** Por isso a regra 4.5: migrations aditivas e
compatíveis com a versão anterior do código. Se as migrations forem aditivas, o rollback de
backend funciona sozinho, sem tocar no banco.

Regra herdada da documentação do projeto e mantida: nunca apagar dados operacionais para
adequar uma versão anterior.

---

## 7. Pendência aberta: baseline de schema

**Status: não resolvido.** É pré-requisito para escrever migrations com segurança.

O banco local tem **165 migrations** registradas em `schema_migrations`. Parte delas foi
aplicada aqui recentemente — a última, `202608140002_conciliacao_match_auditoria.js`, entrou
em **15/08 às 01:12**, no boot do backend local. Ou seja: **o schema local pode estar à frente
do de produção**, e daqui não há como verificar (o ambiente é isolado por decisão de projeto).

Para fechar essa lacuna, rode na EC2 e me passe a saída:

```bash
mysql -u USUARIO -p -N -e "SELECT name FROM schema_migrations ORDER BY name" NOME_DO_BANCO | tail -20
```

Só os nomes — nenhum dado sensível. Com isso eu comparo com as 165 daqui e determino o
baseline real. Enquanto isso não acontecer:

- migrations novas devem assumir o **menor denominador comum** e usar guardas de existência
  para todas as dependências, não só para o que estão criando
- nenhuma migration nova pode pressupor coluna criada por migration recente sem confirmação

---

## 8. Checklist final

Antes de promover para `main`:

- [ ] Variáveis novas da seção 1 aplicadas no `.env` de produção
- [ ] `grep` das credenciais AWS retornou **3** (verificação 2.1)
- [ ] **Teste principal de arquivos (2.3): hostnames de produção todos em `.amazonaws.com`**
- [ ] Anexo real aberto e visualizado após o deploy, antigo e recente
- [ ] `MFA_POLICY_ENABLED` ausente ou `true` em produção
- [ ] Nenhum `.env`, certificado, chave ou backup no diff
- [ ] `npm run build` do frontend passou limpo
- [ ] Fluxos críticos validados em `dev-v2`
- [ ] Baseline de schema de produção confirmado (seção 7)
- [ ] Migrations (se houver) são aditivas, idempotentes e foram testadas em staging
- [ ] Relatório de QA **APROVADO** para cada alteração (ver `PROTOCOLO-QA.md`)
- [ ] Backup do banco de produção feito
- [ ] Commit atual de produção anotado para rollback
- [ ] Janela de deploy combinada — o sistema tem uso operacional real

### 3.5 Cadastro do fluxo novo de contratos pela interface

Nenhum seed de dados acompanha o deploy. Após as migrations, um usuário autorizado deve:

1. criar o tipo `CONTRATO` em **Configurações > Tipos (Macro)**;
2. informar `codigo_interno = CONTRATO_FLUXO_NOVO`;
3. marcar **Usar fluxo novo de contratos** e os campos obrigatórios do formulário;
4. criar os três subtipos em **Tipos de Subcontrato**;
5. liberar o tipo por setor, curar as categorias e conceder
   `contratos.aprovacao.aprovar` aos aprovadores.

Cada gravação é iniciada e confirmada pelo próprio usuário na interface.

---

## 9. Acesso pela rede local — o que NÃO vai para produção (21/08/2026)

> **Endereço atual (conferido em 27/08/2026): `http://192.168.1.229:5273`**
>
> Terceiro endereço: `192.168.1.66` em 21/08, `192.168.0.202` em 25/08, `192.168.1.229` em
> 27/08. O IP vem de DHCP e muda sozinho. **Nada precisou ser
> reconfigurado** — e isso não é sorte: foi a razão de `VITE_API_URL` ser `/api` (relativo) em vez
> do IP absoluto. O navegador chama o mesmo endereço de onde carregou a página, então o app segue
> a máquina para onde o DHCP a levar.
>
> Para descobrir o endereço quando ele mudar de novo, o Vite anuncia sozinho ao subir
> (`➜ Network: http://<ip>:5273/`), ou:
>
> ```bash
> powershell -NoProfile -Command "(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' }).IPAddress"
> ```

Para abrir o V4 aos outros aparelhos da rede da máquina de desenvolvimento, três coisas mudaram.
**Nenhuma delas se aplica em produção**, e é por isso que estão registradas aqui: para ninguém
carregar por engano.

| Item | Onde | Valor local | Em produção |
|---|---|---|---|
| `VITE_API_URL` | `frontend/.env.local` | `/api` (relativo) | continua a URL absoluta da API |
| `VITE_DEV_API_PROXY_TARGET` | `frontend/.env.local` | `http://127.0.0.1:8100` | **não existe** — é do dev server |
| `server.host` do Vite | `frontend/vite.config.js` | `0.0.0.0` | irrelevante: em produção o frontend é estático |

### A mudança de código que exige atenção no deploy

`isLocalOrigin` (`backend/src/app.js`) passou a aceitar também as faixas privadas da RFC 1918
(`10.x`, `172.16–31.x`, `192.168.x`), além de `localhost` e `127.0.0.1`.

**Ela é chamada atrás de `if (!isProduction)`.** Com `NODE_ENV=production`, nada muda: as origens
continuam vindo de `allowed_origins` da linha `INSTALACAO_CONFIG`.

Consequência a conferir no deploy: **se algum dia o backend rodar em produção sem
`NODE_ENV=production`**, qualquer origem de rede privada passaria — e atrás de um proxy reverso isso
é um buraco. O `.env` de produção já define `NODE_ENV`; o passo 4 desta migração deve continuar
conferindo isso, agora com um motivo a mais.

### Firewall e perfil de rede — conferidos em 25/08

| Item | Estado |
|---|---|
| Regra de entrada para `C:\Program Files\nodejs\node.exe` | **existe**, habilitada, `Allow`, perfil `Public` |
| Regra por porta (5273) | **não existe** — e não é necessária: a regra por programa já cobre |
| Perfil da rede "Construtora Sul Capixaba" | **Public** |

A rede estar classificada como **Pública** aperta outras coisas do Windows, mas **não impede** o
acesso ao V4, porque a regra do Node cobre esse perfil. Trocar para Privada é decisão de quem
administra a máquina — é configuração de segurança do sistema, não do projeto.

Teste de ponta a ponta pelo IP da rede (e não pelo `localhost`), em 25/08:

| Verificação | Resultado |
|---|---|
| `http://192.168.1.229:5273/` | **200** |
| `http://192.168.1.229:5273/api/health` | **401** `{"error":"Nao autenticado"}` |

> O **401 é o resultado bom**: prova que o proxy do Vite atravessou até o backend e que o backend
> respondeu. Bloqueio de firewall não produz 401 — produz silêncio.

Se um aparelho da rede ainda não abrir, o próximo suspeito é **isolamento de clientes no roteador**
(comum em rede corporativa), que não se resolve nesta máquina.

### O que NÃO foi alterado, de propósito

`CORS_ALLOWED_ORIGINS` continua só com `127.0.0.1` e `localhost`. O `allowed_origins` que vale em
execução vem do banco (`INSTALACAO_CONFIG`, com os domínios de produção) e
`normalizeAllowedOrigins` **descarta qualquer entrada com `*`** — liberar a rede por ali sujaria a
configuração que vai para produção, e o curinga nem sobreviveria.

---

## Item 31 — permissão nova `contratos.fluxo.reenviar` (24/08)

**Não é variável de ambiente nem migration.** É uma **chave de permissão granular nova**, e por isso
entra aqui: sem uma ação deliberada no deploy, ela não existe para ninguém.

### O que mudou

Dois botões do fluxo de contrato — **solicitar revisão** (reenviar contrato devolvido) e
**confirmar assinatura** — eram liberados por `contratos.geral.criar` / `contratos.geral.editar`,
lidos pela função **não estrita**. Isso abria três portas de uma vez:

1. "nenhuma permissão configurada" era tratado como **liberado**;
2. `SUPERADMIN` tinha passe livre;
3. poder **abrir** contrato passou a valer como poder **tramitar o contrato dos outros**.

Foi o cliente que relatou o efeito: *"o botão de solicitar revisão aparece para mais de um usuário"*.

Agora os dois exigem **ou** ser o autor da solicitação, **ou** a permissão nominal
`contratos.fluxo.reenviar`, verificada de forma **estrita**.

### O passo obrigatório no deploy

> **Conceder `contratos.fluxo.reenviar` a quem hoje faz esse papel na prática** — provavelmente a
> Gerência de Processos.

Sem essa concessão o sistema **não quebra**, mas fica mais restrito do que era: um contrato cujo
autor esteja de férias, afastado ou desligado **fica parado**, porque só ele consegue reenviá-lo.

A concessão é feita na tela de permissões por usuário (`PERMISSOES_AREAS_USUARIOS`), como qualquer
outra granular. Lembrando que essa configuração é **versionada**: a linha de maior `id` vale para
todos os usuários, então a concessão tem de ser feita **editando a configuração atual**, e não
inserindo uma linha nova com um usuário só.

### Como conferir depois do deploy

1. entrar com alguém que tenha `contratos.geral.criar` e **não** seja autor de um contrato devolvido:
   o botão "solicitar revisão" **não** deve aparecer;
2. entrar com o **autor** do mesmo contrato: o botão deve aparecer, sem permissão nenhuma a mais;
3. entrar com quem recebeu `contratos.fluxo.reenviar`: o botão deve aparecer em contrato de terceiro.

Provado em `qa/medicao/31-rejeicao-e-reenvio.js` e `qa/medicao/32-acoes-por-permissao.js`.

---

# Dados legados — política de não mutação no deploy

**Decisão do cliente, 24/08/2026:**

> Migrations só alteram **estrutura**. Correção de dados **não** sobe junto com o código na migração
> para produção, e precisa estar **extremamente bem mapeada**.

Esta seção registra a decisão definitiva: o pacote não leva scripts de backfill, seed ou
limpeza para execução em dev-v2 ou produção.

## O que mudou no repositório

`server.js` roda as migrations antes de abrir a porta. Uma migration que gravava dados executaria
sozinha no deploy, contra dados reais, sem contagem antes nem conferência depois.

Três migrations da faixa V4 faziam isso e foram limpas em 24/08. **As colunas continuam sendo
criadas por elas**, mas nenhum `UPDATE` ou script separado integra o deploy.

## Consequência direta no deploy

> Depois de aplicar as migrations, as colunas novas existem e podem permanecer **VAZIAS** nos
> registros antigos. Todas são anuláveis. O sistema passa a preenchê-las apenas nas operações
> futuras realizadas pela interface.

Não executar carga inicial, inferência automática nem correção retroativa durante o deploy. Se
um registro antigo precisar dessas informações, um usuário autorizado deve abri-lo e corrigir o
dado pela tela correspondente, com o histórico normal da aplicação.

## O que NÃO foi tocado

As migrations do `dev-v2` (faixa abaixo de `0050`). Muitas gravam dados, e são a base do sistema que
**já está em produção** — elas já rodaram lá. Reescrevê-las agora é que seria arriscado. A regra vale
para o que o V4 cria daqui em diante, e a auditoria de 24/08 confirmou que **a faixa V4 está limpa**.

---

# Módulo DP — Fase 1: vínculo do colaborador com a obra (25/08)

## Migration nova

`backend/migrations/202608250050_rh_colaborador_vinculos.js` cria a tabela
`rh_colaborador_vinculos` (colaborador × obra × vigência). **Cria estrutura e nada mais** — nenhum
dado é escrito pela migration.

**Sem variável de ambiente nova. Sem permissão nova.** (A permissão `rh_dp.salario.aprovar` entra
na Fase 5, não aqui.)

## Por que a tabela existe

`rh_colaboradores.obra_id` é uma coluna só: transferir alguém **reescreve o presente e apaga o
passado**. Sem histórico de lotação, o custo de mão de obra por obra atribui tudo à obra atual, e
qualquer período que atravesse uma transferência mostra a obra anterior mais barata do que foi.

`rh_colaboradores.obra_id` **continua existindo** e continua sendo a obra corrente — é o que as
telas, os filtros e a apuração já leem. A tabela nova é o histórico ao lado dela.

## O que passou a acontecer no código existente

`rhService` grava o vínculo em três momentos:

| Momento | Efeito |
|---|---|
| Criar colaborador | abre o vínculo, motivo `ADMISSAO`, na data de admissão |
| Mudar `obra_id` | fecha o anterior no **dia anterior** e abre o novo, motivo `TROCA_OBRA` |
| Preencher `data_demissao` | fecha o vínculo aberto no **próprio dia**, motivo `DEMISSAO` |

> A gravação começa **antes** de o fluxo de pedidos existir (Fase 2), de propósito: cada
> transferência feita até lá sem essa linha seria um buraco que nenhum backfill futuro consegue
> preencher — a informação simplesmente não teria ficado em lugar nenhum.

## Sem chave estrangeira em `obra_id` e `solicitacao_id` — de propósito

Duas razões, uma delas aprendida na marra em 24/08:

1. preencher `titulos_financeiros.solicitacao_id` fez o `ON DELETE RESTRICT` disparar e derrubou
   quatro suítes que apagavam a solicitação antes do título. Ao ligar uma coluna a uma chave, a
   pergunta não é só *"quem lê isto?"* — é também *"o que a chave passa a impedir?"*;
2. o histórico precisa **sobreviver à obra**: se uma obra for removida um dia, o custo que passou
   por ela já aconteceu.

`colaborador_id` tem FK com `CASCADE`: vínculo sem colaborador não significa nada.

## Limite dos dados anteriores

Não existe reconstrução automática de transferências passadas. Quem já trocou de obra pode não
ter o histórico anterior porque o valor antigo não ficou armazenado.

> **O custo por obra só é confiável a partir da data em que esta tabela entrou.** Os vínculos
> passam a nascer das operações confirmadas na interface.

## Achado no banco de teste, a conferir em produção

Dos 137 colaboradores, **apenas 1 tem `obra_id`**. `salario_base` e `data_admissao` estão em todos
os 137; a lotação, não.

Consequência: o relatório de custo por obra (Fase 7) só terá base depois que a operação lotar
essas pessoas pela interface — trabalho de operação, não de código. **Conferir a mesma contagem
em produção antes de concluir qualquer coisa**: pode ser que lá
o campo esteja preenchido.

Achado secundário: `rh_empresas_grupo` está vazia no banco de teste, mas os colaboradores apontam
para as empresas 1, 5, 6, 8 e 9 — referências órfãs. Também a conferir em produção.

## Prova

`qa/medicao/49-vinculo-de-obra-com-vigencia.js` — 13 provas, **APROVADA**. A central é a nº 4:
depois de uma transferência, perguntar *"onde ele estava no mês passado?"* devolve a obra **antiga**.

---

# Módulo DP — Fase 2: o pedido de pessoal (25/08)

## Migration nova

`backend/migrations/202608250051_rh_solicitacoes.js` cria **duas tabelas**:
`rh_solicitacoes` e `rh_solicitacao_historicos`. **Só estrutura.**

**Sem variável de ambiente nova.**

## ⚠️ Permissões novas — passo manual no deploy

Quatro permissões entram em `moduloPermissoes.js`. Como no item 31, elas **não se concedem
sozinhas**: sem a concessão, ninguém abre nem decide pedido de pessoal.

| Permissão | Para quem |
|---|---|
| `rh_dp.solicitacoes.abrir` | usuários de **Obra** |
| `rh_dp.solicitacoes.decidir` | **Departamento Pessoal** |
| `rh_dp.solicitacoes.ver_todas` | DP e Diretoria — sem ela, o usuário vê só a obra dele |
| `rh_dp.salario.aprovar` | **Diretoria** — declarada agora, usada na Fase 5 |

> **Cuidado com `PERMISSOES_AREAS_USUARIOS`:** é versionada — a linha de maior `id` vale para o
> sistema inteiro. A concessão tem de **editar a configuração atual**; inserir uma linha nova com um
> usuário só apaga a configuração de todos os outros. Já aconteceu neste projeto, em 24/08.

## Os tipos 9, 18 e 19 NÃO foram tocados

Decisão registrada, porque é o que protege um fluxo em uso diário.

Admissão (110 solicitações), demissão (129) e atestado (67) continuam existindo e funcionando em
`solicitacoes`, com os status de sempre. O levantamento de 25/08 mostrou que, apesar do nome, eles
são **pedidos de pagamento e de providência contábil** — `APROVADA PELO DP` é pagamento aprovado,
`COM A CONTABILIDADE` é ação do escritório contábil externo. O próprio cadastro confirma:
`ADMISSAO` exige valor e apropriação.

Por isso o pedido de pessoal ganhou tabela própria em vez de estender os tipos existentes.
**Nenhuma linha de `solicitacoes` é lida ou escrita por esta fase.**

## Mudança de comportamento: a obra não se troca mais pelo cadastro

`atualizarColaboradorRh` passa a **recusar** alteração de `obra_id`, com mensagem que diz o que
fazer. O único caminho é a solicitação de troca de obra.

Fechado **sem período de convivência** porque o módulo RH/DP não é operado pela empresa hoje. Em
módulo vivo isso exigiria transição.

> `salario_base` **não** foi fechado: a alteração salarial só ganha fluxo na Fase 5, e fechar antes
> deixaria o salário impossível de corrigir por qualquer caminho.

A importação de planilha **não é afetada** — ela só cria colaborador, nunca atualiza.

## O efeito da aprovação

| Tipo | O que produz |
|---|---|
| `ADMISSAO` | cria o colaborador `ATIVO` e abre o vínculo; o pedido passa a apontar para quem criou |
| `TROCA_OBRA` | fecha o vínculo anterior no dia anterior, abre o novo, atualiza a obra corrente |
| `DEMISSAO` | `data_demissao` + `DEMITIDO` + vínculo encerrado no próprio dia |
| `EVENTO_RECORRENTE` | decisão registrada; o efeito no cálculo vem na fase do pagamento |
| `ALTERACAO_SALARIAL` | idem, com a permissão da Diretoria na Fase 5 |

**Aviso prévio trabalhado:** o vínculo encerra na **data de desligamento**, não na aprovação. Até
lá o colaborador continua na obra e continua no custo, porque continua trabalhando.

## Prova

`qa/medicao/50-pedido-de-pessoal.js` — 26 provas, **APROVADA**. Bateria completa: **48/48**.

`qa/medicao/49-vinculo-de-obra-com-vigencia.js` foi **atualizada** nesta fase: ela testava a troca
pelo cadastro, que deixou de existir, e passou a exercitar o serviço de vínculo diretamente.

---

# Módulo DP — Fase 3: documentos no pedido (25/08)

## Migration nova

`backend/migrations/202608250052_rh_solicitacao_anexos.js` cria `rh_solicitacao_anexos`.
**Só estrutura.** Sem variável de ambiente nova.

## ⚠️ Permissão nova — passo manual no deploy

| Permissão | Para quem |
|---|---|
| `rh_dp.solicitacoes.anexar` | usuários de **Obra** (e DP, se for anexar em nome dela) |

Vale o mesmo aviso das outras: `PERMISSOES_AREAS_USUARIOS` é **versionada** — a linha de maior `id`
governa o sistema inteiro. Conceder **editando a configuração atual**; inserir linha nova com um
usuário só apaga a de todos os outros.

> Isso aconteceu de novo em 25/08, agora por acidente de teste: uma suíte publicou sua configuração
> de um usuário, morreu no meio e não restaurou. Durante ~15 minutos **29 usuários ficaram sem
> permissão granular**. Restaurado publicando a última boa como versão nova (id 767). A linha
> contaminada fica no histórico — nunca se apaga.

## Por que uma tabela em vez de gravar em `rh_documentos`

`rh_documentos.colaborador_id` é obrigatório, e na **ADMISSÃO o colaborador só nasce na aprovação**
(Fase 2). Não dá para anexar o RG de alguém que ainda não é ninguém.

A alternativa era criar o colaborador já na abertura, com status `EM_ADMISSAO`. Descartada por dois
motivos, e o segundo é o que decide:

1. admissão pode ser **recusada** — cada recusa deixaria uma pessoa meio-cadastrada, entrando em
   contagem, busca e relatório;
2. **o CPF é único.** O provisório prenderia o CPF, e o **reenvio do próprio pedido falharia** —
   sendo que reenviar depois de corrigir é exatamente o que a Fase 2 garantiu que funciona. O
   caminho "mais simples" quebraria o caminho principal.

## Comportamento: a conferência AVISA, não trava

`conferirDocumentacao` diz o que falta pelos tipos obrigatórios do vínculo — mas **o DP continua
podendo aprovar sem o ASO**. O exame costuma sair depois do pedido; travar obrigaria a obra a ter
tudo em mãos no minuto zero, que não é como a operação funciona.

> Quem aprova sem o documento faz isso **sabendo**, e o histórico registra. É a mesma escolha do
> alerta de saldo do contrato (item 21): a cor avisa, o botão não some.

## O que a aprovação faz com os anexos

| Situação | Efeito |
|---|---|
| Anexo **tipado** | vira `rh_documentos` do colaborador, com `documento_gerado_id` marcado |
| Anexo **avulso** (sem tipo) | fica no pedido como prova, **não** entra na pasta — lá o tipo é obrigatório |
| Aprovação repetida | não duplica: `documento_gerado_id` já preenchido é ignorado |

Vale para **admissão, demissão e troca de obra** — não só a admissão. O termo de rescisão também
precisa chegar na pasta do colaborador, que é onde alguém vai procurar.

## Sem FK em `documento_gerado_id` e `criado_por`

Mesma razão de sempre (lição de 24/08): ao ligar uma coluna a uma chave, a pergunta não é só *"quem
lê isto?"* — é também *"o que a chave passa a impedir?"*.

## Pendência de decisão

**Documentos de uma admissão rejeitada e nunca reenviada ficam para sempre?** São dados pessoais —
RG, CPF, CTPS de quem não foi contratado. Hoje **ficam**, que é o comportamento conservador e
reversível. Apagar depois é mais fácil do que recuperar.

## Prova

`qa/medicao/51-documentos-no-pedido.js` — 15 provas, **APROVADA**. Bateria completa: **49/49**, com
sentinela de PID do backend e de versão das permissões, ambas intactas.

---

# Módulo DP — Fase 4: eventos recorrentes na folha (26/08)

## Migration nova

`backend/migrations/202608260050_rh_eventos_recorrentes.js` cria **duas tabelas**:
`rh_eventos_recorrentes` e `rh_apuracao_evento_itens`. **Só estrutura.**

`backend/migrations/202608260054_rh_importacao_origem.js` acrescenta `rh_importacoes.origem`
(`PLANILHA` | `FORMULARIO` | `INDIVIDUAL`), com padrão `PLANILHA` — tudo que existe hoje veio de
planilha, e assumir o contrário faria o histórico existente mentir.

> A coluna existe porque o formulário grava **a mesma estrutura** da planilha (ver "O formulário não
> tem cálculo próprio", abaixo). Sendo a estrutura a mesma, `origem` é a única coisa que responde
> *"quem digitou este dia de falta, e por onde?"*.

**Sem variável de ambiente nova. Sem permissão nova** — o evento recorrente é criado pelo fluxo de
pedido, que já usa `rh_dp.solicitacoes.abrir` e `.decidir`.

## O problema que ela resolve

`rh_apuracao_eventos` tinha `ajuste_credito_manual` e `ajuste_debito_manual`: **dois números
digitados à mão todo mês**. Para pagar certo, alguém precisava lembrar — de cabeça ou numa planilha
à parte — que fulano tem vale alimentação, que está na 4ª de 6 parcelas do adiantamento, que tem
pensão, que desconta plano. E somar tudo num campo só, **sem memória do que o compõe**.

## A regra separada do lançamento

| Tabela | O que guarda |
|---|---|
| `rh_eventos_recorrentes` | a **regra**: "desconta R$ 200 por mês, 6 vezes" |
| `rh_apuracao_evento_itens` | o **lançamento**: "na folha de 08/2026, R$ 200, parcela 4 de 6" |

Os campos de ajuste deixam de ser digitados e passam a ser **a soma dos itens**.

## As três regras que protegem o dinheiro

**1. A parcela é DERIVADA, nunca incrementada.** Conta quantas competências anteriores já receberam
o evento e soma um. A apuração nasce `RASCUNHO` e vai ser recalculada; um contador faria o
adiantamento de 6 parcelas acabar em 3 recálculos — e ninguém notaria, porque **cada folha isolada
pareceria correta**. Mesmo defeito da cascata da medição em 24/08: *recomputação não pode ser
tratada como evento*.

**2. O valor é COPIADO para o item.** Se o vale subir de R$ 300 para R$ 350, as folhas já fechadas
continuam com R$ 300. Mesma razão de `contrato_parcelas.valor_previsto` existir.

**3. `entra_no_liquido` separa o que é pago à parte.** Vale alimentação é crédito pago por fora
(recarga de cartão ou pagamento direto, conforme o cliente definiu em 25/08). Se entrasse no
líquido, o colaborador receberia **no salário e na recarga**: pagamento em dobro. Ele fica
registrado nos itens — é de lá que o custo por obra vai buscá-lo na Fase 7.

> `entra_no_liquido` tem **padrão por tipo**: `VALE_ALIMENTACAO` e `VALE_TRANSPORTE` nascem como
> pagos à parte. Um padrão único faria o caso mais comum nascer errado.

## O que NÃO foi construído, de propósito

**Percentual e `base_percentual`.** O cliente colocou a pensão alimentícia em standby, dizendo que é
*"um valor que vai ser informado no sistema para reduzir o valor final"*. Sem percentual, some a
dependência de ordem entre descontos — que era o risco de maior peso legal do desenho. `forma` nasce
só com `VALOR_FIXO`.

## Mudança em código existente

`rhApuracaoService.gerarApuracaoRecorteRh` passa a chamar `aplicarRecorrentesNaApuracao` depois de
criar as linhas. **Sem isso o serviço existiria e nunca seria chamado** — que parece pronto e não
está.

Regerar a mesma competência **não dobra nada**: os itens de origem `RECORRENTE` são apagados e
reescritos, e itens `MANUAL` e `PLANILHA` são preservados (um ajuste combinado com a obra não veio
de regra nenhuma e não pode sumir num recálculo).

## Prova

`qa/medicao/52-eventos-recorrentes.js` — **21 provas**, incluindo o caminho real de ponta a ponta:
planilha confirmada → `gerarApuracaoRh` → folha com bruto 3.000, pensão 300 no líquido, vale 500
fora dele, líquido 2.700 — e regerar mantém tudo igual.

> **Bateria completa pendente.** Em 26/08 outro agente trabalhava no mesmo repositório (fora do
> módulo DP), alterando `Solicitacao.js`, controllers e uma migration de `solicitacoes` **durante a
> execução** — o que tornou a bateria não interpretável. As quatro suítes do DP (49 a 52) rodaram
> isoladas: **4/4**. A bateria completa fica para quando os dois trabalhos terminarem.

---

# Módulo DP — Fase 5: alteração salarial (26/08)

## Migration nova

`backend/migrations/202608260053_rh_colaborador_salarios.js` cria `rh_colaborador_salarios`.
**Só estrutura.** Sem variável de ambiente nova.

## ⚠️ A permissão de Diretoria entra em uso

`rh_dp.salario.aprovar` foi **declarada** na Fase 2 e passa a ser **exigida** agora.

> Sem ela concedida a alguém, **nenhuma alteração salarial é aprovável** — o pedido fica aberto para
> sempre. É o comportamento correto (a decisão é da Diretoria), mas precisa ser concedida no deploy,
> senão parece defeito.

A verificação é `userHasStrictAreaPermission`: **sem atalho de SUPERADMIN** e sem tratar "não
configurado" como liberado. Foi o que o item 31 estabeleceu para o contrato, e vale aqui pela mesma
razão — quem pode aumentar salário tem de ser escolha explícita, nunca consequência de um perfil
amplo.

## Por que uma tabela de histórico

Mesmo problema da obra na Fase 1: `salario_base` é uma coluna só, e aprovar um aumento **reescrevia
o presente e apagava o passado**.

A objeção óbvia é que a folha já guarda — `rh_apuracao_eventos.valor_base_calculo` copia o salário
de cada competência. Mas isso **só cobre os meses que tiveram folha**. Colaborador admitido em março
cuja primeira folha é de junho não tem como dizer quanto ganhava em abril.

A estrutura é **deliberadamente igual** à de `rh_colaborador_vinculos` — mesma vigência, mesmo
fechamento no dia anterior, mesma recusa de retroatividade. Dois formatos de vigência no mesmo
módulo seriam duas regras para a mesma pergunta.

## Comportamento: vigência futura não antecipa o pagamento

`rh_colaboradores.salario_base` (o cache do salário corrente) **só é atualizado quando a vigência
começa hoje ou antes**.

> Sem essa condição, aprovar hoje um aumento marcado para o mês que vem **já pagaria mais na folha
> deste mês**. O registro fica gravado com a vigência certa e passa a valer sozinho na data.

## Mudança de comportamento: o salário não se altera mais pelo cadastro

`atualizarColaboradorRh` passa a **recusar** alteração de `salario_base`, com mensagem citando a
Diretoria.

Na Fase 2 esta porta ficou aberta de propósito — não havia fluxo que a substituísse, e fechar antes
teria deixado o salário impossível de corrigir por qualquer caminho. **Agora as duas portas dos
fundos estão fechadas.**

## Prova

`qa/medicao/54-alteracao-salarial.js` — **18 provas**, incluindo a recusa de quem não tem a
permissão (com a solicitação continuando ABERTA para quem pode decidir) e a folha já fechada
mantendo o salário da época.

---

# Módulo DP — Fase 6: a tela consolidada (26/08)

**Sem migration. Sem variável de ambiente nova. Sem permissão nova** — usa as declaradas nas
Fases 2 e 3.

## Rotas novas (9)

| Método | Rota | Permissão |
|---|---|---|
| GET | `/rh/solicitacoes` | ver colaboradores + filtro por obra |
| GET | `/rh/solicitacoes/:id` | idem |
| GET | `/rh/solicitacoes/:id/conferencia` | idem |
| POST | `/rh/solicitacoes` | `rh_dp.solicitacoes.abrir` |
| POST | `/rh/solicitacoes/:id/anexos` | `rh_dp.solicitacoes.anexar` |
| POST | `/rh/solicitacoes/:id/aprovar` | `rh_dp.solicitacoes.decidir` **+** `rh_dp.salario.aprovar` se for salarial |
| POST | `/rh/solicitacoes/:id/rejeitar` | `rh_dp.solicitacoes.decidir` |
| POST | `/rh/solicitacoes/:id/reenviar` | `rh_dp.solicitacoes.abrir` |
| POST | `/rh/solicitacoes/:id/cancelar` | `rh_dp.solicitacoes.abrir` |

## Frontend

Página `frontend/src/pages/RhDpPessoal.jsx`, rota `/rh-dp/pessoal`, com card de entrada em
`RhDpInicio`. Estilos em `index.css` (bloco `rh-pessoal-*`), com tema claro e escuro.

## A visibilidade por obra fica em um lugar só

O controller resolve `obrasVisiveis(req)`: `null` = todas (quem tem `ver_todas`), lista = só as obras
do usuário. **Sem obra nenhuma, a lista é vazia** — e não "todas", que seria o vazamento.

## A ordenação é do backend, não do navegador

`listarColaboradoresRh` devolve quem tem pedido em aberto **primeiro**, com os pedidos embutidos na
linha, em **uma consulta**.

> Ordenar no navegador exigiria baixar tudo para só então decidir o que mostrar em cima — e a tela
> que existe para dar **agilidade** ficaria mais lenta quanto mais pedidos houvesse.

## Os botões seguem permissão, não setor

Um usuário que acumule abrir e decidir vê as duas coisas. O sistema **não presume** que "obra" e "DP"
sejam pessoas diferentes, porque em obra pequena às vezes não são.

A alteração salarial só mostra "Aprovar" para quem tem a permissão de Diretoria — mas **a tranca de
verdade é a do servidor**; esconder o botão só evita oferecer uma ação que vai falhar.

## Três defeitos encontrados antes de entregar

Registrados porque a classe deles se repete:

1. **`userHasStrictAreaPermission` não estava importado em `routes.js`.** O arquivo carregava
   normalmente — a referência está dentro de callback e só estouraria **na primeira requisição**;
2. **a tela lia `permissoes_areas[chave]`**, objeto que não existe. O certo é `areas_permissoes`,
   um **array**. Teria escondido todos os botões de todo mundo, em silêncio;
3. **o helper era o permissivo.** `hasPermissao` trata "não configurado" como liberado — o oposto do
   backend estrito. A tela ofereceria "Aprovar" a quem o servidor recusa. Trocado por
   `hasAnyExplicitPermissao`.

## ⚠️ Pendente de validação

**A tela não foi aberta no navegador.** O backend em execução no ambiente local não tem as rotas
novas (só as pega ao reiniciar), e reiniciá-lo derrubaria o outro agente que trabalhava no
repositório em 26/08.

Antes de considerar a Fase 6 concluída: reiniciar o backend, abrir `/rh-dp/pessoal`, e rodar a
bateria completa. As seis suítes do DP (49 a 54) rodaram isoladas: **6/6**.

---

# Módulo DP — validação de documento, upload e jornada (26/08)

> **Leia antes: RH e DP são setores diferentes, e só o DP existe.** Todo este módulo é do
> Departamento Pessoal. O prefixo `rh_dp` das permissões cobre os dois de propósito — o RH nasce
> depois e reusa. Detalhe em `MAPA-IMPACTO-MODULO-DP-OPERACIONAL.md` §0.0.

## Migrations novas

| Migration | O que faz |
|---|---|
| `202608260054_rh_importacao_origem.js` | `rh_importacoes.origem` — `PLANILHA` / `FORMULARIO` / `INDIVIDUAL` |
| `202608260055_rh_anexo_validacao.js` | `rh_solicitacao_anexos` ganha `situacao`, `validado_por`, `validado_em`, `motivo_recusa`, `observacao_validacao` |

**Só estrutura. Sem variável de ambiente nova.**

## ⚠️ Mudança de regra: o DP atesta antes de o documento entrar na pasta

**Isto inverte o comportamento entregue na Fase 3.**

Antes: aprovar o pedido copiava **todo** anexo tipado para `rh_documentos`. Bastava a obra anexar um
arquivo com o tipo certo para ele virar documento oficial — foto tremida, página faltando, CPF de
outra pessoa, tudo entrava.

Agora: o anexo nasce `PENDENTE`, e **só o que o DP atestar entra na pasta**.

| Situação | O que acontece na aprovação do pedido |
|---|---|
| `VALIDADO` | vira `rh_documentos` do colaborador |
| `PENDENTE` | **fica no pedido**; pode ser atestado depois |
| `RECUSADO` | não entra, e o motivo fica legível para a obra |

Três decisões dentro disso:

- **recusar não apaga** — a obra precisa ver o que reenviar;
- **grava quem e quando**, não um booleano: atestar que um documento é válido é declaração de
  responsabilidade, e um `1` não diz de quem;
- **a observação da conferência acompanha o documento até a pasta** — "confere com o original" fica
  onde alguém vai procurar depois.

A conferência passou de dois baldes para **três**: o que nunca chegou, o que chegou e aguarda o DP,
e o que foi atestado. **Documento recusado conta como faltando** — dar-lhe um balde próprio faria a
conferência dizer "está tudo lá" sobre algo que o DP rejeitou.

> A tela avisa antes de aprovar quando há documento pendente: *"eles NÃO vão para a pasta do
> colaborador se você aprovar agora"*. Quem aprova precisa saber disso antes, não depois.

## Upload de arquivo

`POST /rh/solicitacoes/:id/anexos` passou a aceitar `multipart/form-data`, com `uploadRateLimit` e
`uploadComprovantes.single('file')` — as mesmas defesas das outras rotas de upload.

O arquivo vai para `rh-solicitacoes/{id}` pelo `uploadToS3`. **A pasta é a do pedido, não a do
colaborador**, porque na admissão o colaborador ainda não existe. Quando o documento é atestado e
vira `rh_documentos`, a URL é **copiada como está** — o arquivo não se move, porque mover quebraria
o que já foi apontado.

`arquivo_url` como texto continua aceito (reenvio que aponta para documento já armazenado, e as
suítes). **Quando vem arquivo, ele manda** — senão um payload poderia gravar uma URL arbitrária ao
lado de um upload legítimo.

## Rotas novas (total do módulo: 19)

Além das 9 da Fase 6:

```
GET  /rh/solicitacoes/:id/anexos
POST /rh/solicitacoes/:id/anexos/:anexoId/validar
GET  /rh/jornada/colaboradores
POST /rh/jornada
POST /rh/jornada/individual
GET  /rh/colaboradores/:id/eventos-recorrentes
POST /rh/eventos-recorrentes/:id/desativar
GET  /rh/apuracao-eventos/:id/itens
GET  /rh/colaboradores/:id/historico-vinculo
GET  /rh/colaboradores/:id/historico-salario
```

> As 10 últimas existem porque `rhJornadaFormularioService` estava **órfão**: provado por 14
> conferências e referenciado por **zero** arquivos do sistema. Serviço que ninguém chama parece
> pronto e não está — e a suíte verde ajuda a esconder isso.

## Telas

| Rota | O que é |
|---|---|
| `/rh-dp/pessoal` | duas abas: **Solicitações** (primeira, com contador) e **Colaboradores** |
| `/rh-dp/jornada` | formulário de jornada por obra e competência |

Na aba Colaboradores: **Pedir admissão acima da tabela**; demissão, troca de obra, evento recorrente
e alteração salarial **na coluna de ações de cada linha**.

## Três defeitos que só o navegador encontrou

Registrados porque nenhuma suíte os pegaria:

1. **Faixa "Acesso negado para empresas do RH/DP"** em duas telas. As empresas eram buscadas junto
   com a lista principal; quem não tem `rh_dp.empresas.gerenciar` recebia 403 e o erro subia como
   falha da **página inteira**, quando só um campo de um formulário fechado não carregou. Agora são
   buscadas quando o formulário de admissão abre, e a falha não vira erro de página;
2. **`R$ R$ 2.805,97`** — `formatCurrencyInput` já devolve o símbolo, e o template somava outro;
3. **campo de empresa vazio** para quem não pode vê-las — agora some.

> Suíte não recebe 403 de permissão no meio do caminho e não olha texto renderizado. Foi preciso
> entrar como um usuário real, numa tela real.

## Validação no navegador — 26/08

Entrada como `matriz-gp@teste.local`, ciclo completo:

| Passo | Resultado |
|---|---|
| Abrir demissão com aviso prévio | campo condicional apareceu com o aviso sobre o custo |
| Colaborador subiu ao topo | linha destacada, contador da aba em 1 |
| Aprovar pela aba Solicitações | `DEMITIDO`, vínculo encerrado **na data do aviso** (20/12), `decidida_por = 337` |
| Jornada: montar lista | veio pelo **vínculo**, salário formatado certo |
| Jornada: 25 dias + 10 faltas | linha em vermelho, mensagem, **botão desabilitado** |

> O colaborador usado (ADAILTON, id 79) era **real**, um dos 137. Foi **restaurado** ao estado
> original: `ATIVO`, vínculo reaberto, solicitação apagada.

## Permissões concedidas no ambiente local

Para o teste, os usuários da matriz receberam permissões de RH/DP, publicadas como **versão nova com
os 30 usuários preservados** (config id **848**; a anterior, 767, segue no histórico).

**Isso é do ambiente local e não vai para produção.** Em produção, conceder conforme as tabelas das
Fases 2, 3 e 5.

## Prova

`qa/medicao/55-validacao-de-documento-pelo-dp.js` — **13 provas**, APROVADA.

Suítes do módulo (49 a 55): **7/7**.

---

## Documentação jurídica na abertura de contrato acima do limite — 26/08/2026

Migration estrutural criada no V4:

- `202608260057_contrato_documentacao_juridica.js`
  - acrescenta `contratos.representante_legal_qualificacao` como JSON anulável;
  - não altera nem preenche dados existentes;
  - contratos antigos permanecem com `NULL` e não recebem exigência retroativa.

Após o deploy do backend, executar as migrations normalmente. Não há script de dados associado.
A aprovação dos novos contratos acima de `CONTRATO_LIMITE_JURIDICO` exige os anexos tipados
`CARTAO_CNPJ`, `ATO_CONSTITUTIVO` e `DOCUMENTOS_REPRESENTANTE_LEGAL`.

Validação local: `node qa/medicao/56-documentacao-juridica-abertura.js`.

---

## Estornos bancários no OFX — 27/08/2026

**Origem: `C:\Fluxy`, commit `6e620310`.** Não é trabalho criado no V4 — foi trazido de lá.

### Migration — nome preservado de propósito

- `202608270001_conciliacao_estornos_bancarios.js`

**O nome NÃO foi alterado, e não pode ser.** Regra 1 da `CONVENCAO-MIGRATIONS.md`: migration vinda do
`dev-v2` pode já ter rodado em produção, e o nome é a identidade dela no `schema_migrations`.
Renomear faria executar de novo no deploy. Ela fica na faixa `0001–0049`, que é a faixa de fora; a
faixa do V4 (`0050+`) permanece intocada.

Ordem no dia 27/08, conferida — o runner ordena por nome:

```
202608270001_conciliacao_estornos_bancarios.js   <- veio do dev-v2
202608270050_solicitacao_pedidos_retorno.js      <- criada aqui
```

O que ela faz, **só estrutura** (Regra 5): acrescenta a `conciliacoes_bancarias` as colunas
`evento_bancario_tipo`, `estorno_status`, `estorno_conciliacao_origem_id`, `estorno_candidatos` e
`estorno_avaliado_em`, mais dois índices e a FK `fk_conciliacao_estorno_origem`. Idempotente. Sem
`UPDATE`, sem script de dados associado.

### Estado do inventário de migrations

Conferido em 27/08: das 167 migrations de `C:\Fluxy`, esta era a **única** ausente aqui. As 33
exclusivas do V4 estão todas na faixa `0050+`. Nenhuma colisão de nome, nenhuma fora de ordem.

### Não exige nada novo em produção

| | |
|---|---|
| Variável de ambiente nova | **nenhuma** |
| Permissão nova | **nenhuma** — `financeiro.conciliacao.estornar` já existe e já é usada |
| Script de dados | **nenhum** |
| `tipo_movimento` aceitar `ESTORNO_BANCARIO` | já é `varchar(40)`, não é ENUM |

### Mudança de comportamento que as pessoas vão sentir

Lançamentos do OFX cujo texto indique rejeição, estorno, devolução ou sustação passam a receber o
alerta `ESTORNO_ALERTA` e **saem de todos os caminhos automáticos**: conciliação manual, lote,
fatura, transferência, tarifa, crédito rotativo, criar título, ignorar e remover passam a devolver
**409** até que alguém confirme a devolução apontando a saída original.

**Medido contra o banco local (2.064 conciliações): 82 lançamentos pendentes passariam a ter
alerta.** Em produção o número será maior. Vale medir antes do corte:

```sql
SELECT COUNT(*) FROM conciliacoes_bancarias
WHERE deleted_at IS NULL AND status = 'PENDENTE'
  AND (descricao_banco LIKE '%REJEIT%' OR descricao_banco LIKE '%ESTORN%'
    OR descricao_banco LIKE '%DEVOL%' OR descricao_banco LIKE '%SUSTA%')
  AND descricao_banco NOT LIKE '%TARIFA%';
```

### Defeito conhecido, herdado da origem — não corrigido aqui

Dos 82, **30 são `Taxa de Devolução de Cheque` de −0,35**, que é a **tarifa** cobrada pela
devolução, não uma devolução de dinheiro. A proteção do código exclui a palavra `TARIFA`, mas este
banco escreve `Taxa`. Essas 30 linhas são débito, e a classificação não olha o sinal.

Efeito: saem do fluxo de tarifas e ficam travadas esperando uma saída original que não existe.

**Está fiel ao `C:\Fluxy` de propósito**, para os dois repositórios continuarem mescláveis. A
correção proposta — excluir também `TAXA DE DEVOLU` e exigir `valor > 0` — depende de decisão, e
deve ser feita **nos dois repositórios ao mesmo tempo**.

### Validação local

`node backend/scripts/validarConciliacaoMatchesExatos.js` — passou, com as 9 asserções novas do
commit de origem.

Mapa de impacto completo: `MAPA-IMPACTO-ESTORNOS-BANCARIOS-OFX.md`.
Documentação funcional: `docs/modulos/financeiro/ESTORNOS_BANCARIOS_OFX.md`.

---

## DP — Fase 7: catálogo de cargos e exigências de documento — 27/08/2026

Primeira fase do escopo do cliente (itens 8 a 11: admissão, movimentações, demissão e pagamento de
mão de obra). Mapa completo em `MAPA-IMPACTO-DP-ADMISSAO-MOVIMENTACAO-DEMISSAO-PAGAMENTO.md`.

### Migration estrutural — faixa V4

- `202608270051_rh_catalogo_cargos_e_documentos.js`
  - cria `rh_cargos`, `rh_documento_exigencias` e `rh_solicitacao_checklist`;
  - acrescenta `rh_colaboradores.cargo_id` (FK) e `rh_colaboradores.carga_horaria_semanal`;
  - acrescenta `rh_solicitacoes.subtipo`;
  - **não grava dado nenhum** (Regra 5). Depois do deploy as três tabelas existem **vazias**.

**Collation fixada de propósito.** As tabelas nascem com `utf8mb4` / `utf8mb4_unicode_ci` explícito.
Motivo medido aqui em 27/08: `rh_colaboradores` e `rh_documentos_tipos` são `utf8mb4_0900_ai_ci`
(vieram assim de produção), enquanto o padrão deste banco é `utf8mb4_unicode_ci`. Herdar o padrão
faria a tabela nascer com uma collation aqui e possivelmente outra em produção — e o
`Illegal mix of collations` apareceria **no deploy**, não no desenvolvimento.

### Scripts de dados — rodar DEPOIS do deploy, na ordem

Ambos têm `--conferir` e são idempotentes. **Nenhum dos dois roda sozinho.**

| Ordem | Script | O que faz | Medido no local |
|---|---|---|---|
| 1 | `backend/scripts/dados/seedCargosDoRh.js` | cria `rh_cargos` a partir do cargo em texto livre dos colaboradores e liga `cargo_id` | 158 linhas → **21 cargos, 137 colaboradores ligados** |
| 2 | `backend/scripts/dados/seedCatalogoDeDocumentosDoDp.js` | cria os 21 tipos de documento dos checklists e monta a matriz de exigências | 54 linhas → **21 tipos + 33 exigências** |

```bash
node backend/scripts/dados/seedCargosDoRh.js --conferir
```

**O script de cargos não funde cargo nenhum.** Conferido no local: 21 valores distintos crus, 21
depois de normalizar acento, espaço e caixa — nenhuma duplicata semântica. `OFICIAL` e
`Oficial Pleno` são cargos diferentes. Dois pares ficam para decisão humana na tela, e o script
deliberadamente **não** os une:

- `ALMOXARIFE DE OBRAS` × `ALMOXARIFE DE OBRAS NIVEL I`
- `SECRETARIO (A)` × `SECRETARIA(O) NIVEL I`

**Em produção o número será outro** — meça antes com `--conferir`.

`rh_colaboradores.cargo` (texto) **não é apagada**. Continua sendo a prova do que estava escrito
antes do de-para.

### O que NÃO muda no comportamento de hoje

Os 21 tipos de documento novos nascem com a flag antiga `rh_documentos_tipos.obrigatorio = 0`, e
isso é deliberado: essa coluna é lida pela conferência atual, que cobra por CLT / NÃO CLT. Criar
tipos obrigatórios faria **toda admissão existente passar a acusar 21 documentos faltando**, hoje,
antes de a Fase 9 reescrever a conferência. Provado pela suíte (prova 13).

A obrigatoriedade nova mora só em `rh_documento_exigencias`.

### Nada novo a conceder

| | |
|---|---|
| Variável de ambiente nova | nenhuma |
| Permissão nova | nenhuma |

### Prova

`node qa/medicao/58-catalogo-e-checklist-do-dp.js` — **17 provas, todas PASSOU**. A suíte é somente
de leitura. Erro forçado conferido: quebrando a regra "mais específico vence", 4 provas passam a
FALHAR — a suíte não é verde por acidente.

---

## DP — Fases 8 a 12: cadastro, rascunho, movimentações, demissão e pagamento — 27/08/2026

Fecha o escopo dos itens 8 a 11. Mapa completo em `MAPA-IMPACTO-DP-FASES-8-A-12.md`.

### Migrations estruturais — faixa V4

| Migration | O que abre |
|---|---|
| `202608270052_rh_colaborador_cadastro_completo.js` | 16 colunas em `rh_colaboradores`: filiação, endereço, dados bancários, PIX, responsável pela contratação |
| `202608270054_rh_pagamento_adicionais_e_periodo.js` | 4 adicionais em `rh_apuracao_eventos`; período, data prevista e vínculo com o pedido em `rh_apuracoes` |

**Todas as colunas são anuláveis, sem exceção.** São 137 colaboradores já cadastrados sem esses
dados; uma coluna `NOT NULL` faria o `ALTER TABLE` falhar ou preencher com vazio — e preencher é
gravar dado, que migration não faz (Regra 5). A obrigatoriedade é da **admissão nova** e mora na
validação do pedido.

> **Atenção ao renumerar.** A `...0054` nasceu como `202608270053` e colidiu com
> `202608270053_despesa_eventual.js`, de outro trabalho em andamento no mesmo dia. Regra 6: quem
> chegou depois cede — o arquivo do outro é de 14:23, o meu de 14:28. O arquivo foi renomeado **e**
> o `schema_migrations` atualizado no mesmo passo, senão a migration rodaria de novo no deploy.

### Script de dados adicional

| Script | O que faz | Medido no local |
|---|---|---|
| `backend/scripts/dados/migrarTrocaObraParaMovimentacao.js` | reetiqueta `TROCA_OBRA` e `ALTERACAO_SALARIAL` como `MOVIMENTACAO` + subtipo | **4 registros** |

```bash
node backend/scripts/dados/migrarTrocaObraParaMovimentacao.js --conferir
```

Não altera efeito, situação, datas nem `dados_json` — só o rótulo. `efeitoDoPedido` traduz o subtipo
de volta para o efeito antigo, que continua sendo o mesmo código provado pelas suítes 49 e 54.

**Em produção o número será outro.** Meça antes.

### MUDANÇA DE COMPORTAMENTO — ler antes do corte

**A solicitação de pessoal passa a nascer em RASCUNHO.** O escopo exige impedir o envio sem os
documentos obrigatórios, e o anexo precisa de um pedido gravado para se pendurar — sem um estado
anterior ao envio, não havia onde impedir.

O ciclo passa a ser: a obra **abre** (rascunho) → **anexa** → **envia** → o DP decide.

| Consequência | Efeito |
|---|---|
| O DP só vê o que foi **enviado** | rascunho não entra na fila de decisão |
| Rascunho **aparece** na lista de colaboradores | com a situação à vista, para não ficar esquecido e invisível |
| Enviar sem documento obrigatório | **409** com a lista do que falta |
| Aprovar com item do checklist marcado e não **validado** | **409** |
| A demissão passa a exigir **motivo, último dia trabalhado e quem pediu** | pedidos abertos pelo formato antigo são recusados |
| Acordo entre as partes | exige **valor acordado** e justificativa |
| Pagamento de mão de obra | exige competência `AAAA-MM`, período coerente e data prevista |

> Quem tiver integração ou script que abre solicitação de pessoal pela API **precisa passar a
> chamar `POST /rh/solicitacoes/:id/enviar`** — sem isso o pedido fica em rascunho e nunca chega ao
> DP.

### Rotas novas

```
GET  /rh/solicitacoes/checklist          o checklist do TIPO (antes de o pedido existir)
POST /rh/solicitacoes/:id/enviar         RASCUNHO -> ABERTA
POST /rh/solicitacoes/:id/checklist      marcar a promessa
GET  /rh/cargos                          o catálogo de cargos
GET  /rh/colaboradores/:id/apontamentos  férias vencidas e pendências
```

Todas reutilizam as permissões que já existem (`rh_dp.solicitacao.ver` / `.abrir`).

### Nada novo a conceder

| | |
|---|---|
| Variável de ambiente nova | nenhuma |
| Permissão nova | nenhuma |

### Prova

`node qa/medicao/59-rascunho-checklist-movimentacao-e-demissao.js` — **23 provas**.

As suítes **50, 51, 52, 54 e 55** foram atualizadas: abriam e decidiam direto, sem o envio. Onde a
asserção descrevia o sistema anterior (a conferência por vínculo, "a demissão não tem checklist", a
pasta com um documento só), ela foi reescrita para descrever a **regra** — nunca afrouxada para
ficar verde.

## 2026-08-27 — Recarga de Cartao

- Migration: `backend/migrations/202608270055_recarga_cartao_fluxo.js`.
- Script de dados idempotente: `backend/scripts/dados/configurarFluxoRecargaCartao.js`.
- Conferir antes: `node backend/scripts/dados/configurarFluxoRecargaCartao.js --conferir`.
- O script apenas ativa o comportamento novo no tipo existente; nao converte solicitacoes legadas.
- Depois da implantacao, cadastrar os cartoes e usuarios em Configuracoes > Cartoes de Recarga.
- Nao ha variavel de ambiente nem permissao nova.
- Prova local: `npm run test:recarga-cartao` com rollback e sequencia de titulo restaurada.
- Handoff: `docs/handoffs/RECARGA_CARTAO_2026-08-27.md`.

## 2026-08-27 — Despesa Eventual

- Migration: `backend/migrations/202608270053_despesa_eventual.js`.
- Script de dados idempotente: `backend/scripts/dados/configurarDespesaEventual.js`.
- Conferir antes: `node backend/scripts/dados/configurarDespesaEventual.js --conferir`.
- Aplicar: `node backend/scripts/dados/configurarDespesaEventual.js`.
- Conferir novamente: `node backend/scripts/dados/configurarDespesaEventual.js --conferir` deve informar zero alteracoes.
- O script so acrescenta o tipo `DESPESA_EVENTUAL` a lista fechada da GEO quando essa lista existe;
  preserva todos os demais tipos e modos de visibilidade e nao mexe em configuracao permissiva.
- O tipo continua restrito a Gerencia de Processos pela regra autoritativa do backend.
- Prova local: `npm run test:despesa-eventual` e repeticao visual no navegador interno.
- Handoff: `docs/handoffs/DESPESA_EVENTUAL_2026-08-27.md`.
