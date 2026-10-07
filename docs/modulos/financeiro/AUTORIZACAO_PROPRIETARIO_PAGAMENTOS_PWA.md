# Autorização do proprietário para envio à fila de pagamentos

## 1. Estado e objetivo

Este documento registra o plano aprovado e a implementação realizada em 30/09/2026 para permitir que o
proprietário autorize, pelo celular, quais títulos podem entrar na Fila de
Pagamentos. A solução prevista é uma PWA do próprio Fluxy, com notificações push
e confirmação por passkey protegida pelo bloqueio biométrico ou PIN do aparelho.

**Estado em 03/10/2026:** implementado na `refactor/frontend` e exercitado
em `PILOT` no ambiente dev, inclusive decisao com passkey apos correcoes
observadas no piloto. Isso **nao** equivale a homologacao para producao.
Na primeira promocao a `main`, o modo de producao deve ficar explicitamente
`OFF`; ativacao posterior de `PILOT` exige procedimento e aceite separados.

Objetivos:

- separar preparação financeira, autorização do proprietário e execução do pagamento;
- dar ao proprietário acesso somente ao dossiê necessário para decidir, sem acesso de
  edição à solicitação;
- impedir que uma solicitação alterada depois da revisão use uma autorização antiga;
- permitir implantação gradual na `refactor/frontend` e futura promoção para `main`
  sem mudar o fluxo legado enquanto o recurso estiver desligado;
- preservar idempotência, auditoria, segregação de funções e recuperação segura.

## 1.1 O que já está implementado

- modos backend `OFF`, `PILOT`, `ENFORCED` e `PAUSED`, com fallback seguro para `OFF`;
- migration exclusivamente estrutural, models, permissões granulares e capacidades na sessão;
- criação idempotente de lote com snapshot de título, favorecido, forma de pagamento e
  cópia isolada dos anexos para `financeiro/autorizacoes/<lote>`;
- lista/dossiê móvel sem link de edição da solicitação e documentos por URL assinada curta;
- WebAuthn/passkeys com `userVerification: required`, challenge Redis consumido uma vez,
  bloqueio durante `Testar usuário`, cadastro, uso e revogação de passkeys;
- proibição de o preparador autorizar o próprio lote, com bypass global de
  `SUPERADMIN` para acesso/configuração e exigência nominal preservada para assinatura;
- autorização/rejeição parcial, revalidação material antes da decisão e reuso do enqueue
  transacional/idempotente da Fila de Pagamentos;
- PWA instalável para iOS/Android, service worker limitado ao shell estático e Web Push
  opt-in com texto genérico, sem valor, credor ou dados bancários;
- preflight somente leitura e teste de contrato do modo `OFF`.

Ainda dependem de homologação ou evolução posterior: dupla autorização por alçada,
delegação temporária, expiração persistida por job, WhatsApp notificativo, teste E2E real
em iOS/Android e uma suíte de integração com banco/S3/Redis. Essas ausências impedem
`ENFORCED`, mas não alteram o fluxo legado porque o padrão permanece `OFF`.

## 2. Princípios obrigatórios

1. O backend é a autoridade. Ocultar botão no frontend nunca substitui autorização.
2. A configuração ausente, vazia ou inválida significa `OFF`.
3. Em `OFF`, a aplicação deve manter exatamente o fluxo legado, sem rotas funcionais,
   jobs, push, WhatsApp ou exigência de passkey desse módulo.
4. A biometria permanece no aparelho. O Fluxy armazena somente a credencial pública
   WebAuthn e metadados técnicos necessários.
5. A decisão vale sobre um retrato isolado e versionado na aplicação dos dados e documentos revisados.
6. Preparar e autorizar o mesmo lote são funções incompatíveis.
7. Troca rápida/impersonação de usuário nunca pode cadastrar passkey nem autorizar,
   rejeitar ou devolver lote.
8. Migrations deste plano são exclusivamente estruturais. Não podem conter `INSERT`,
   seed, classificação automática ou backfill de produção.
9. Cada fase deve ser integrável isoladamente e manter build e testes aprovados com
   o modo `OFF`.

## 3. Feature flag mestre

Variável backend proposta:

```text
PAYMENT_OWNER_APPROVAL_MODE=OFF
```

Valores aceitos:

| Modo | Comportamento |
|---|---|
| `OFF` | Fluxo legado preservado integralmente; módulo novo indisponível. |
| `PILOT` | Somente autorizadores e preparadores explicitamente incluídos no piloto usam o novo fluxo. |
| `ENFORCED` | O fluxo digital exige decisao valida; envio direto permanece permitido com `financeiro.fila_pagamentos.preparar`. |
| `PAUSED` | Congela preparacao, decisao e envio digital; preserva envio direto pela permissao da fila. |

Regras:

- validar o valor no bootstrap do backend e tratar qualquer valor desconhecido como
  `OFF`, emitindo alerta operacional sem derrubar o sistema;
- expor ao frontend apenas o modo efetivo e capacidades calculadas na sessão;
- não usar uma chave desconhecida de `MODULOS_HABILITADOS`, pois a compatibilidade
  atual considera módulos desconhecidos habilitados;
- `PILOT` exige lista nominal ativa no backend; não pode depender apenas de condição
  visual no frontend;
- `PAUSED` congela a camada digital. Nao revoga a permissao independente de
  envio direto; retirar essa capacidade exige ajustar a permissao da fila;
- notificações push e futura integração com WhatsApp também têm configurações próprias,
  mas nunca podem operar quando a flag mestre estiver `OFF` ou `PAUSED`.

## 4. Fluxo funcional alvo

```text
Contas a Pagar
  -> Financeiro seleciona títulos elegíveis
  -> cria lote de autorização e dossiê isolado
  -> AGUARDANDO_AUTORIZACAO
  -> proprietário recebe aviso e abre a PWA
  -> revisa valores, favorecido e documentos congelados
  -> seleciona itens e confirma com passkey
  -> backend revalida integridade e estado atual
  -> somente itens autorizados entram na Fila de Pagamentos existente
  -> solicitação muda para ENVIADO PARA PAGAMENTO no enqueue real
```

Criar o lote não deve mudar o status da solicitação para `ENVIADO PARA PAGAMENTO`.
Essa mudança continua pertencendo ao ingresso efetivo na fila.

Preparar o lote marca o titulo e a solicitacao como `EM ANÁLISE DO PROPRIETÁRIO`,
sem mover setor ou alterar saldo. A marcacao manual pela permissao de status
interno aplica a mesma regra para analise em papel. Rejeicao ou invalidacao
digital sinaliza `AGUARDANDO AJUSTE DE PAGAMENTO` no titulo e `AGUARDANDO AJUSTE`
na solicitacao ainda em analise; estados finais sao preservados.

O proprietário poderá autorizar parte do lote. Itens não autorizados permanecem
pendentes, são rejeitados ou devolvidos para correção conforme a decisão registrada.

## 5. Estados

### 5.1 Lote implementado

- `AGUARDANDO`
- `AUTORIZADO`
- `REJEITADO`
- `CONCLUIDO`

### 5.2 Item

- `PENDENTE`
- `AUTORIZADO`
- `REJEITADO`
- `INVALIDADO`
- `ENFILEIRADO`

As transições devem ser explícitas, transacionais e auditadas. Não usar exclusão
física para corrigir estado. Estados mais detalhados de devolução, expiração persistida
e falha de envio continuam como evolução posterior; hoje a expiração é validada em tempo
de decisão e falha de enqueue mantém o item `AUTORIZADO` para reprocessamento seguro.

## 6. Dados e migrations

Tabelas propostas:

- `pagamento_autorizacao_lotes`;
- `pagamento_autorizacao_itens`;
- `pagamento_autorizacao_documentos`;
- `pagamento_autorizacao_eventos`;
- `pagamento_autorizadores`;
- `webauthn_credentials`;
- `web_push_subscriptions`.

Requisitos estruturais:

- migrations somente de schema, idempotentes e compatíveis com MySQL/Linux;
- detectar o tipo real das chaves referenciadas antes de criar FKs, como já é feito
  nas migrations seguras da fila;
- índice para localizar títulos ativos e locks transacionais que impeçam o mesmo título
  de participar simultaneamente de dois lotes;
- chave de idempotência na criação do lote, na decisão e no enqueue;
- eventos append-only, sem update ou delete pela aplicação;
- credenciais e assinaturas armazenadas separadas dos dados financeiros;
- nenhuma migration classifica contratos/títulos existentes ou ativa autorizadores;
- nenhum lote é criado retroativamente por migration.

Campos do lote incluem preparador, status, totais,
hash do snapshot, expiração, idempotência e timestamps. O item preserva título,
saldo/valor proposto e decisão individual. O documento preserva origem, cópia isolada e
hash canônico da referência de origem. Os eventos são append-only e encadeados por hash.
Metadados ampliados de sessão/dispositivo e hash binário do arquivo permanecem como
hardening posterior antes de uma exigência regulatória formal.

## 7. Dossiê somente leitura

O proprietário não deve receber acesso à tela nem aos endpoints de edição da
solicitação. O dossiê dedicado deve mostrar apenas:

- código da solicitação como texto, sem link operacional;
- solicitante;
- credor e favorecido;
- valor, saldo e vencimento;
- forma de pagamento e dados bancários/PIX mascarados;
- empresa, obra ou centro de custo;
- descrição e justificativas pertinentes;
- documentos congelados no momento da preparação;
- histórico do lote e de suas decisões.

Endpoints implementados:

```text
GET  /financeiro/autorizacoes-pagamento
POST /financeiro/autorizacoes-pagamento
GET  /financeiro/autorizacoes-pagamento/:id
GET  /financeiro/autorizacoes-pagamento/documentos/:id
POST /financeiro/autorizacoes-pagamento/:id/autenticacao/opcoes
POST /financeiro/autorizacoes-pagamento/:id/decidir
POST /financeiro/autorizacoes-pagamento/:id/enfileirar
GET/POST/DELETE /financeiro/autorizacoes-pagamento/passkeys/...
POST /financeiro/autorizacoes-pagamento/push/assinar
POST /financeiro/autorizacoes-pagamento/push/remover
```

Não criar `PATCH`, `PUT` ou `DELETE` da solicitação nesse contexto. Links de arquivo
devem ser assinados por poucos minutos e só depois de autorização nominal do usuário.

Os documentos não apontam para o arquivo vivo da solicitação. Na submissão do lote, o
sistema copia o objeto para a área isolada do lote no storage e preserva o hash canônico
da referência original. Mudança na coleção/referência dos anexos invalida a autorização.
Hash binário do conteúdo e Object Lock do bucket são hardenings recomendados antes de
classificar essa cópia como imutabilidade regulatória.

## 8. Integridade e invalidação

O snapshot deve incluir, no mínimo:

- IDs e versões dos títulos;
- valor original, saldo e valor proposto;
- vencimento;
- credor e favorecido;
- forma e dados de pagamento relevantes;
- empresa, obra e centro de custo;
- IDs, versões e hashes dos documentos;
- versão dos registros de origem.

O backend gera um hash canônico desse conjunto. Alteração material entre preparação e
decisão deve invalidar o item/lote. Antes de inserir na fila, o backend recalcula o hash
e revalida status, saldo, favorecido, empresa, forma, documentos, existência de outro
item ativo e elegibilidade já aplicada pela fila atual. Divergência resulta em
`INVALIDADO_ALTERACAO`; nada é enviado parcialmente por acidente.

## 9. Integração com a fila existente

O serviço atual de enqueue deve ser separado conceitualmente em:

- um wrapper de envio direto, autorizado pela permissao independente da fila;
- um serviço interno de enqueue já autorizado, não exposto como atalho HTTP público.

Comportamento por modo:

- `OFF`: `POST /financeiro/fila-pagamentos` mantém o comportamento atual;
- `PILOT` e `ENFORCED`: o usuario pode preparar autorizacao digital ou enviar
  diretamente, conforme a permissao propria de cada acao;
- `PAUSED`: bloqueia novas decisoes e envios digitais, mas preserva o envio
  direto de usuarios com `financeiro.fila_pagamentos.preparar`.

Regra expressamente aprovada em 07/10/2026: o envio direto exige apenas a
permissao da fila, em qualquer modo. Nao exige preparar autorizacao nem
declarar autorizacao em papel. Mantem a confirmacao habitual e registra
auditoria obrigatoria na mesma transacao, sem fabricar assinatura digital.
Dossie ativo impede envio concorrente do mesmo titulo; concluir o fluxo
digital antes de reutilizar a via direta. Escopo, saldo, bloqueios materiais
e idempotencia continuam obrigatorios.

O serviço interno deve reutilizar locks de linha, transação, validações financeiras e
idempotência existentes. Não duplicar a regra de elegibilidade em outro controller.

## 10. Permissões e segregação

Permissões granulares propostas:

```text
financeiro.autorizacoes_pagamento.visualizar
financeiro.autorizacoes_pagamento.preparar
financeiro.autorizacoes_pagamento.decidir
financeiro.autorizacoes_pagamento.configurar
financeiro.autorizacoes_pagamento.auditar
```

Preparar autorizacao e enviar diretamente para a fila nao liberam uma a
outra. Contas a Pagar mostra ambos os botoes quando o usuario possui as duas
permissoes. Solicitar autorizacao fica desabilitado em OFF ou PAUSED; enviar
para pagamento permanece habilitado pela permissao da fila.

`SUPERADMIN` possui bypass das permissões granulares para acessar, visualizar,
preparar, configurar e auditar o módulo, coerente com sua função de configurador
global do sistema. Esse bypass não transforma o usuário em signatário: para decidir
um lote, inclusive o `SUPERADMIN` precisa estar nominalmente ativo em
`pagamento_autorizadores` e possuir uma passkey válida. Os demais perfis dependem das
permissões granulares correspondentes.

Regras adicionais:

- preparador do lote não pode decidir o próprio lote;
- delegação precisa de início, fim, motivo e evento de auditoria;
- remoção de autorizador ou credencial deve ter efeito imediato em novos desafios;
- uma sessão com `req.dev_user_switch` deve receber negação explícita em cadastro de
  passkey, geração de desafio e decisão;
- acesso aos anexos do dossiê não deve herdar a regra ampla da fila de pagamentos.

## 11. Passkeys, Face ID, Touch ID e PIN

A PWA usa WebAuthn/passkeys. Face ID, Touch ID, biometria Android ou PIN desbloqueiam
a chave privada dentro do autenticador do aparelho. O Fluxy não recebe foto, impressão
digital nem código do aparelho.

Configuração por ambiente:

| Ambiente | RP ID esperado |
|---|---|
| Desenvolvimento | `refactor-dev.jrfluxy.com.br` |
| Produção | `csc.jrfluxy.com.br` |

Credenciais não devem ser copiadas entre ambientes. O challenge deve ser único, curto,
armazenado em Redis, consumido uma única vez e vinculado a:

- UUID do lote;
- hash do snapshot;
- itens selecionados;
- total da decisão;
- nonce;
- expiração;
- usuário e sessão.

Usar `userVerification: required`. Cada decisão exige step-up; desbloquear a PWA não
autoriza automaticamente outro lote. Registrar contador/estado da credencial e tratar
sinais de clonagem ou credencial revogada.

O plano de recuperação deve prever ao menos uma passkey adicional ou chave FIDO2 física
sob custódia controlada. E-mail ou SMS isolado não deve substituir a assinatura.

## 12. PWA e notificações

Entregáveis frontend previstos:

- manifest e ícones instaláveis;
- service worker mínimo;
- cadastro e revogação de dispositivo/passkey;
- tela móvel de lotes pendentes;
- detalhe/dossiê somente leitura;
- decisão em lote ou por item;
- histórico e confirmação inequívoca do total;
- Web Push com VAPID.

O service worker pode armazenar apenas o shell estático versionado. É proibido cachear:

- respostas de API;
- dossiês e documentos;
- dados bancários/PIX;
- tokens, cookies ou desafios;
- telas com conteúdo financeiro renderizado.

Push deve conter texto genérico, por exemplo “Há pagamentos aguardando sua análise”,
sem valor, credor, banco ou documento na notificação do sistema operacional.

WhatsApp fica para fase opcional e inicialmente serve apenas como aviso com link para a
PWA. Não haverá aprovação por resposta de mensagem. A integração deve possuir flag e
credenciais próprias, consentimento e trilha de entrega; nenhuma chamada externa quando
o modo mestre estiver `OFF`.

## 13. Segurança adicional

- cookies `HttpOnly`, `Secure` e `SameSite` compatíveis com o fluxo atual;
- CSRF e `X-Audit-Session-Id` mantidos;
- rate limit específico em cadastro, challenge e decisão;
- bloqueio de duplo clique no frontend e idempotência no backend;
- transação e locks no enqueue;
- alertas ao cadastrar/remover passkey e dispositivo;
- revogação imediata de assinatura/dispositivo perdido;
- dados bancários sempre mascarados fora da confirmação necessária;
- dupla autorização configurável por valor, empresa ou risco em fase posterior;
- eventos financeiros do módulo não podem depender da retenção curta do log genérico;
- retenção e acesso ao histórico devem seguir obrigação contábil/jurídica definida antes
  do piloto.

## 14. Preflight e ativação

Script somente leitura implementado:

```text
npm run preflight:autorizacao-proprietario
```

O preflight deve conferir:

- modo efetivo;
- migrations pendentes, tabelas, FKs e índices;
- Redis e política de expiração dos challenges;
- RP ID, origins e HTTPS;
- autorizadores ativos e suas permissões;
- existência de passkey válida para cada autorizador do piloto;
- VAPID e push, quando habilitado;
- integração interna com a fila;
- assinatura digital sem bypass: ate `SUPERADMIN` precisa ser autorizador
  nominal ativo e confirmar a decisao digital com passkey. O envio direto
  permitido pela fila e uma acao distinta e nao registra decisao digital;
- proteção contra impersonação;
- configuração de retenção/auditoria.

`ENFORCED` não pode iniciar se o preflight falhar. O comando deve ser somente leitura e
retornar código diferente de zero com diagnóstico claro.

## 15. Fases e estado da implementação

Cada fase deve ter ownership próprio antes de qualquer edição:

1. **Fases 0 a 6 — implementadas localmente**: flag, schema, domínio, fila interna,
   dossiê isolado, passkeys, frontend móvel, PWA e push.
2. **Fase 7 — pendente**: migration/configuração em dev e homologação `PILOT` com
   usuários e aparelhos controlados.
3. **Fase 8 — bloqueada até aceite**: ativação `ENFORCED` somente após preflight,
   integração real e matriz completa.
4. **Fase 9 — futura**: WhatsApp apenas notificativo.

Divisão recomendada sem sobreposição:

- Agente backend: flag, migrations, models, services, endpoints, passkeys e testes;
- Agente frontend: PWA, telas móveis, estados de UX e testes de interface;
- arquivos centrais como `backend/src/routes.js`, registro de permissões,
  `frontend/src/App.jsx`, `AuthContext` e service worker exigem ownership exclusivo e
  integração por turnos;
- o frontend só começa integração contra um contrato de API versionado e aprovado.

Não reservar antecipadamente arquivos funcionais para um agente que ainda não iniciou.
Cada agente deve registrar sua sessão, ownership e fase nos arquivos de workspace.

## 16. Compatibilidade e matriz mínima de testes

### Com modo `OFF`

- seleção e envio atual de Contas a Pagar permanecem iguais;
- fila, baixa, comprovantes, divergências e permissões atuais permanecem iguais;
- marcar analise atualiza o status sem mover setor; encaminhar para pagamento
  continua ocorrendo somente no ingresso efetivo na fila;
- não existem chamadas de push/WhatsApp/WebAuthn;
- nenhuma rota nova permite mutação financeira;
- build frontend e suites atuais do Financeiro continuam aprovados.

### Com `PILOT`

- usuário fora do piloto segue legado;
- usuário do piloto cria lote sem criar item na fila;
- preparador não autoriza o próprio lote;
- proprietário vê apenas seu dossiê e documentos congelados;
- mudança de título/anexo invalida a autorização;
- autorização parcial envia somente os itens confirmados;
- reenvio da mesma decisão não duplica fila;
- troca rápida de usuário é bloqueada;
- passkey errada, challenge expirado/reutilizado e dispositivo revogado falham;
- push não expõe dados financeiros;
- `PAUSED` congela o módulo sem afetar a fila já existente.

### Homologação móvel

- iOS/Safari instalado como PWA;
- Android/Chrome instalado como PWA;
- Face ID/Touch ID/biometria/PIN conforme suporte do aparelho;
- perda de rede, retorno ao app e challenge expirado;
- múltiplos aparelhos autorizados e revogação de um deles;
- acessibilidade, zoom e confirmação clara de valores.

## 17. Deploy e rollback

- promover código com `PAYMENT_OWNER_APPROVAL_MODE=OFF`;
- executar migrations estruturais somente após preflight e backup aplicáveis;
- confirmar regressão do fluxo legado ainda em `OFF`;
- ativar `PILOT` apenas em desenvolvimento/homologação, com usuários nominais;
- nunca habilitar `ENFORCED` no mesmo passo do deploy de código;
- em incidente antes do uso, voltar a `OFF`;
- em incidente após início do uso, mudar para `PAUSED`, preservar lotes/eventos e
  tratar o retorno. Para impedir tambem envios diretos, revisar a permissao da fila;
- rollback de código não deve executar `down`, `DROP` nem apagar credenciais, snapshots
  ou eventos; confirmar compatibilidade migration por migration.

## 18. Decisões pendentes antes da Fase 0

- valor/regra que exige dupla autorização;
- prazo de expiração do lote;
- prazo jurídico/contábil de retenção de dossiê e eventos;
- autorizador substituto e política de férias/ausência;
- usuário(s) e empresas do piloto;
- aparelhos suportados e estratégia de chave FIDO2 reserva;
- provedor de Web Push e, futuramente, WhatsApp;
- conteúdo exato do dossiê por tipo de título;
- política para títulos já existentes na fila quando o modo mudar.

Essas decisões não impedem documentar o plano, mas devem estar registradas antes de
qualquer ativação fora de `OFF`.

## 19. Correção operacional do rate limit Redis em homologação

Em 01/10/2026, a homologação em modo `PILOT` identificou que o armazenamento do
rate limit chamava `pTtl`, método inexistente na versão instalada do cliente Redis.
A API correta é `pTTL`. A rejeição ocorria dentro de middleware assíncrono e podia
encerrar o processo Node, fazendo Nginx e navegador apresentarem erros secundários
como `ERR_INCOMPLETE_CHUNKED_ENCODING` e uma mensagem aparente de CORS.

O armazenamento passou a usar `pTTL` e o middleware passou a encaminhar qualquer
falha por `next(error)`. Quando `REDIS_REQUIRED=true` e o Redis estiver
indisponível, a aplicação permanece em modo fail-closed e responde `503`, sem
reiniciar o backend nem liberar o rate limit em memória.
