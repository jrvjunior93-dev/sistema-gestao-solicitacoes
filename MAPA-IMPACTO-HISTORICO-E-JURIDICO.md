# Mapa de impacto — histórico do fluxo novo e as etapas do Jurídico

Data: 20/08/2026. Escrito antes da primeira linha de código (regra §6).

Pedidos desta rodada:

1. Permissões granulares para os três usuários do teste ponta a ponta
2. **O fluxo novo não registra nada no histórico** — precisa registrar, sem quebrar os outros tipos
3. O anexo inicial da solicitação vai só para Gestão de Contratos; precisa aparecer no histórico
4. Na etapa **minuta**, o Jurídico precisa anexar arquivo e/ou informar link de assinatura
5. Ao mandar colher assinatura, a solicitação volta ao setor de origem
6. Ao confirmar a assinatura, volta ao Jurídico para liberar o contrato

---

## 1. O que já está pronto (itens 5 e 6)

Medido em `sincronizarSolicitacaoDoContrato`. **Os dois já funcionam** e não vou mexer:

| Etapa | Status do contrato | Para onde a solicitação vai |
|---|---|---|
| Aprovado acima do limite | `EM_ANALISE_JURIDICA` | **JURIDICO** (origem parqueada em `setor_destino_pos_aprovacao`) |
| `minuta` | `AGUARDANDO_ASSINATURA` | **volta ao setor de origem** ✔ item 5 |
| `assinado` | `EM_REVISAO_JURIDICA` | **volta ao JURIDICO**, em destaque no topo ✔ item 6 |
| `conferido` | `ATIVO` | volta à origem, destaque removido |

Provado na suíte 20. O que falta nesses dois itens é **o histórico dizendo que aconteceu** — que é
o item 2.

## 2. O buraco do histórico (item 2)

**Medido:** `SELECT acao, COUNT(*) FROM historicos ... JOIN contratos` → **zero linhas**. Nenhuma
solicitação de contrato do fluxo novo tem uma única entrada de histórico.

**Causa:** o fluxo novo cria e move a Solicitação **direto** em `contratoFluxoNovoService`, sem
passar por `SolicitacaoController` — que é quem grava `SOLICITACAO_CRIADA`, `STATUS_ALTERADO`,
`ENVIADA_SETOR` e `ANEXO_ADICIONADO` no fluxo padrão (14.464 registros de `STATUS_ALTERADO` no
banco, contra 0 no fluxo novo).

Só existem hoje dois `Historico.create` no bloco: o do aditivo e o que adicionei para as
apropriações. Todo o resto — criação, aprovação, rejeição, cancelamento, as três etapas do
Jurídico, a medição — é silencioso.

**Consequência prática:** o card Histórico da solicitação de contrato aparece **vazio**, e não há
como reconstruir quem aprovou, quando foi ao Jurídico ou por que voltou.

### Como será corrigido

Uma função só, `registrarHistoricoDoContrato(...)`, chamada em cada transição — **dentro da mesma
transação** que muda o estado. Fora dela, um rollback deixaria histórico de algo que não aconteceu
(o mesmo cuidado que já existe nos eventos de título).

Vocabulário: `STATUS_ALTERADO` e `ENVIADA_SETOR` reaproveitam os nomes do fluxo padrão, para o card
e os filtros existentes lerem sem caso especial. As ações próprias do contrato ganham nome próprio.

| Momento | `acao` | `status_anterior` → `status_novo` |
|---|---|---|
| Criação | `SOLICITACAO_CRIADA` | — → PENDENTE |
| Anexo inicial | `ANEXO_ADICIONADO` | — |
| Aprovação (abaixo do limite) | `CONTRATO_APROVADO` | PENDENTE → APROVADA |
| Aprovação (acima) | `CONTRATO_APROVADO` + `ENVIADA_SETOR` | PENDENTE → EM ANALISE |
| Rejeição | `CONTRATO_REJEITADO` | → PENDENTE DE AJUSTE |
| Cancelamento | `SOLICITACAO_CANCELADA` | → CANCELADA |
| Minuta | `JURIDICO_MINUTA` + `ENVIADA_SETOR` | EM ANALISE → NEC. DE ASSINATURA |
| Assinado | `JURIDICO_ASSINATURA_RECEBIDA` + `ENVIADA_SETOR` | → EM ANALISE |
| Conferido | `JURIDICO_CONFERIDO` | → APROVADA |
| Medição | `MEDICAO_REGISTRADA` (já existe) | — |
| Apropriações | `CONTRATO_APROPRIACOES_ALTERADAS` (já existe) | — |

**Nada muda nos outros tipos de solicitação:** o fluxo padrão continua gravando pelo caminho dele.
As suítes de regressão do fluxo padrão provam isso.

## 3. O anexo inicial (item 3)

Hoje `NovaSolicitacao` chama `uploadContratoAnexos(idContrato, ...)` → grava em `contrato_anexos`.
Só aparece em Gestão de Contratos.

**Como fica:** o mesmo arquivo, **um upload só**, passa a ter também uma linha em `anexos` da
solicitação e o `ANEXO_ADICIONADO` no histórico. O arquivo em disco continua sendo um; o que se
acrescenta é o índice que faz ele aparecer na linha do tempo.

Duplicar o upload seria pior: dois arquivos iguais no disco e dois pontos de verdade sobre o mesmo
documento.

## 4. Minuta com arquivo e/ou link (item 4)

Hoje `minuta` é um botão que só troca o status.

**Como fica:** para concluir a etapa, o Jurídico precisa informar **pelo menos um** dos dois:

- **arquivo da minuta** — sobe como `contrato_anexos` com `tipo = 'MINUTA'` e entra no histórico;
- **link de assinatura** — coluna nova `contratos.link_assinatura`, validada como URL.

Pode informar um, o outro, ou os dois. Nenhum dos dois ⇒ 400 com mensagem clara.

**Por que os dois são opcionais entre si:** a coleta de assinatura acontece de duas formas na
empresa — documento circulando e plataforma de assinatura por link. Exigir os dois travaria metade
dos casos; não exigir nenhum é o que existe hoje, e manda o responsável colher assinatura sem
dizer de quê.

### Migration

`202608200003_contrato_link_assinatura.js` — `contratos.link_assinatura` (`STRING(500)`, anulável).
Aditiva.

## 5. Permissões dos três usuários (item 1)

Derivadas do código, ação por ação. **Estrita** = sem atalho de perfil: nem SUPERADMIN passa sem a
permissão marcada (decisão do cliente, marco 11).

| Ação | Permissão | Estrita |
|---|---|---|
| Criar a solicitação de contrato | *nenhuma de contrato* — só escopo de obra; a tela exige `solicitacoes.acoes.criar` | — |
| Completar cadastro do credor | `contratos.credor.completar_cadastro` **ou** `contratos.geral.criar` **ou** `solicitacoes.acoes.criar` | não |
| Anexar a negociação | autoria do contrato **ou** `contratos.geral.criar` **ou** `contratos.geral.editar` | não |
| Aprovar / rejeitar contrato | `contratos.aprovacao.aprovar` | **sim** |
| Cancelar a solicitação | `contratos.solicitacao.cancelar` | **sim** |
| Etapas do Jurídico | `contratos.juridico.tramitar` | **sim** |
| Editar apropriações do contrato | `contratos.geral.editar` | não |
| Encerrar contrato | `contratos.geral.encerrar` | **sim** |
| Decidir termo aditivo | `contratos.aprovacao.aprovar` | **sim** |

### O conjunto mínimo por usuário

**joão@teste.com — obra (cria contrato e medições)**

```
solicitacoes.acoes.criar
solicitacoes.lista.visualizar_minhas
solicitacoes.lista.visualizar_setor
solicitacoes.acoes.ver_aba_financeiro
contratos.geral.visualizar
```

Não precisa de `contratos.geral.criar`: a conferência do credor e o anexo da negociação já aceitam
`solicitacoes.acoes.criar` e a autoria do contrato.

**breno.lopes@cscconstrutora.com — Gerência de Processos (analisa e aprova)**

```
contratos.aprovacao.aprovar          ← sem ela ninguém aprova, nem SUPERADMIN
contratos.solicitacao.cancelar
contratos.geral.visualizar
contratos.geral.editar               ← para corrigir o rateio antes de aprovar
contratos.credor.completar_cadastro  ← para corrigir cadastro na revisão
solicitacoes.lista.visualizar_setor
solicitacoes.acoes.ver_aba_financeiro
financeiro.titulos.visualizar        ← para conferir os títulos que nasceram
```

**teste@teste.com — Jurídico (minuta, assinatura, conferência)**

```
contratos.juridico.tramitar          ← as três etapas
contratos.solicitacao.cancelar       ← o cliente pediu que o Jurídico possa cancelar
contratos.geral.visualizar
solicitacoes.lista.visualizar_setor
solicitacoes.acoes.ver_aba_financeiro
```

O Jurídico **não** recebe `contratos.aprovacao.aprovar`: quem aprova é a Gerência de Processos. A
liberação final do Jurídico é a etapa `conferido`, coberta por `contratos.juridico.tramitar`.

### Escopo de obra, que não é permissão

`requireContratoAccess` compara a obra do contrato com o escopo do usuário. Setor fora de
`SETORES_ACESSO_TODAS_OBRAS` só vê as obras vinculadas em `usuarios_obras`. Hoje a configuração é
`COMPRAS-1, FINANCEIRO, DP, JURIDICO, SESMT` — **GEO não está**. Foi o que travou o Breno.

- **João (obra):** vincular à obra do teste.
- **Breno (GEO):** sem vínculo de obra, ou vinculado à obra do teste. Com vínculo parcial ele fica
  **restrito** a esses — vincular não acrescenta, restringe.
- **Jurídico:** o setor já está na lista, vê todas.

## 6. O que pode quebrar

| Risco | Verificação |
|---|---|
| Histórico duplicado no fluxo padrão | Suítes do fluxo padrão seguem passando |
| Histórico gravado e transação revertida | Suíte força erro depois do histórico e exige zero linhas |
| `minuta` sem arquivo nem link | Suíte exige 400 e status inalterado |
| Link inválido aceito | Suíte envia `javascript:` e texto solto, exige 400 |
| Anexo inicial duplicado em disco | Suíte confere **um** arquivo e duas linhas de índice |
| Quebrar a rota do Jurídico | Suítes 10, 18, 20 seguem passando |

## 7. Suítes

- `qa/medicao/28-historico-do-contrato.js` — cada transição deixa a entrada certa
- `qa/medicao/29-minuta-arquivo-e-link.js` — obrigatoriedade e validação de um-ou-outro

---

## 8. Resultado (20/08)

### Histórico (item 2)

`registrarHistoricoDoContrato` + `espelharERegistrar` — espelhar na solicitação e registrar passaram
a ser **uma chamada só**. Separá-las convidava a esquecer a segunda, que foi exatamente o que
aconteceu até aqui.

A sequência que a suíte 28 mede num contrato acima do limite, do começo ao fim:

```
SOLICITACAO_CRIADA > ANEXO_ADICIONADO > CONTRATO_APROVADO > ENVIADA_SETOR
  > JURIDICO_MINUTA > ENVIADA_SETOR > JURIDICO_ASSINATURA_RECEBIDA > ENVIADA_SETOR
  > CONTRATO_APROVADO > ENVIADA_SETOR
```

Cada `ENVIADA_SETOR` diz de onde para onde (`Encaminhada de GEO para JURIDICO.`), e o fluxo padrão
segue com 7.936 `STATUS_ALTERADO` intactos.

### Anexo na linha do tempo (item 3)

`espelharAnexoNaSolicitacao` cria a linha em `anexos` e o `ANEXO_ADICIONADO` — **um arquivo em
disco, dois índices**. Vale para o anexo da abertura, para a negociação detalhada e para a minuta.

Falha ao espelhar **não** derruba o upload: o arquivo já está salvo e vinculado ao contrato. Perder
a entrada da linha do tempo é ruim; perder o anexo por causa dela seria pior.

**Achado:** `anexos.tipo` é NOT NULL e o sistema só grava `SOLICITACAO` ou `ANEXO`. Gravar
`MINUTA`/`NEGOCIACAO_DETALHADA` ali faria telas e filtros encontrarem um valor que não sabem tratar
— o papel do documento ficou no metadado e na descrição.

### Minuta com arquivo e/ou link (item 4)

- Rota nova `POST /contratos/:id/minuta`, guarda do **Jurídico** (`contratos.juridico.tramitar`) e
  só enquanto o contrato está com ele. Reenviar troca.
- `contratos.link_assinatura` (migration `202608200003`), validado como http(s).
- `tramitarNoJuridico` recusa a etapa `minuta` sem nenhum dos dois.
- Na tela, o bloco do Jurídico ganhou o anexo e o campo de link, com o aviso do que acontece a
  seguir. O arquivo sobe **antes** de trocar a etapa — na ordem inversa o backend recusaria.

**Rejeitados na validação do link:** texto solto, `javascript:` e `data:`. O último dois viram XSS
no dia em que alguém transformar o campo num link clicável.

### Itens 5 e 6 — já existiam

`minuta` devolve ao setor de origem, `assinado` volta ao Jurídico em destaque, `conferido` libera.
Confirmado na suíte 29: `NEC. DE ASSINATURA|GEO` depois da minuta.

### Dois defeitos da própria suíte 28

1. `conferir('...', rejeitar(id) === 'OK', rejeitar(id))` executava a rejeição **duas vezes** — a
   segunda falhava e era ela que aparecia no detalhe.
2. O teste da transação reaproveitava um contrato já rejeitado: a chamada morria em "não está
   aguardando aprovação" e a prova passava por um erro que **não era o testado**. Agora usa contrato
   novo e confere a **mensagem**, não só que houve erro.

É a terceira vez que uma prova minha passa medindo a coisa errada. Já está nas armadilhas do
`LEIA-PRIMEIRO.md`.

### Bateria

05, 10, 13, 17, 18, 19, 20, 21, 23, 24, 25, 26, 27, **28** e **29** — todas passando.

---

## 9. A solicitação sumia para o Jurídico depois da minuta (20/08)

Relatado pelo cliente junto com a regra que faltava: **um usuário vê a solicitação quando criou, foi
mencionado, ela está ou passou pelo setor dele, ele pode ver todas, ou foi atribuído.**

O caminho que quebrou foi o terceiro — e ele **não lê uma coluna**. `montarLiteralHistoricoSetoresEnvolvidos`
casa o TEXTO do histórico:

```sql
WHERE UPPER(TRIM(h.acao)) = 'ENVIADA_SETOR' AND (
     UPPER(...) LIKE 'DE <SETOR> PARA %'
  OR UPPER(...) LIKE '% PARA <SETOR>'
  OR UPPER(h.setor) = '<SETOR>'
)
```

O `ENVIADA_SETOR` que eu tinha acabado de escrever era `"Encaminhada de GEO para JURIDICO."` com
`setor` = setor de quem agiu. **Os três casam falso:**

| Padrão | Por que falhou |
|---|---|
| `LIKE 'DE GEO PARA %'` | o texto começa com "Encaminhada", não com "De" |
| `LIKE '% PARA JURIDICO'` | o **ponto final** — o `LIKE` termina no token |
| `h.setor = 'JURIDICO'` | gravava o setor do ator, e a sincronização já tinha mudado a área para GEO |

Resultado: enviada a minuta, o Jurídico perdia a solicitação de vista.

**Corrigido** para o formato exato das 2.422 linhas do fluxo padrão: texto `De X para Y` (sem
prefixo, **sem ponto**) e `setor` = **destino**.

> A lição: aqui o histórico não é só registro, é **estrutura de dados da visibilidade**. Escrever
> uma frase "equivalente" quebra a regra sem erro nenhum aparecer. Anotado nas armadilhas.

### Suíte `qa/medicao/30-visibilidade-do-juridico.js`

Prova com três usuários **logando de verdade** (Jurídico, origem, e um terceiro sem relação), todos
com a **mesma** permissão de lista — assim a diferença medida é só a regra de visibilidade:

- o Jurídico vê enquanto a solicitação está com ele;
- **continua vendo depois da minuta**, com a solicitação já em GEO;
- a origem vê nos dois momentos;
- quem não tem relação **não** vê;
- e o texto gravado segue o formato do fluxo padrão.

### Três defeitos da própria suíte, em sequência

1. Filtrava a listagem por `busca=` — parâmetro que a rota **não conhece** e ignora em silêncio.
   Recebia as 200 primeiras solicitações do sistema.
2. Lia a resposta como `data`/`rows`, mas ela é `{ items, meta }`. O `|| []` transformava
   "não reconheci o formato" em "não vê nada" — e **todos** os usuários apareciam sem ver, inclusive
   o dono da solicitação.
3. Com isso, a prova "quem não tem relação não vê" passava — pelo motivo errado, porque ninguém via.

O helper agora **lança** quando não reconhece o formato, em vez de devolver lista vazia. É a quarta
vez hoje que uma prova minha mede a coisa errada, e as quatro tinham a mesma forma: um caminho de
falha silencioso que se disfarça de resultado.

### Bateria

18, 20, 26, 28, 29 e **30** passando.

---

## 10. Permissões aplicadas (20/08)

Aplicadas com autorização do cliente, **mesclando** e não substituindo.

`PERMISSOES_AREAS_USUARIOS` é versionada: o sistema lê a linha de maior id e ela vale para **todos**.
Inserir uma linha só com os três apagaria as permissões dos outros 24 — foi exatamente assim que 26
usuários ficaram zerados hoje de manhã. Por isso o script leu a linha atual, fez **união** (sem tirar
nada de ninguém) e gravou a versão nova.

| Usuário | Setor | Antes | Depois | Acrescentado |
|---|---|---|---|---|
| joao@teste.com | OBRA | 27 | 32 | as 5 do fluxo (criar, ver minhas/setor, aba financeiro, ver contratos) |
| breno.lopes | GEO | 80 | 81 | `contratos.credor.completar_cadastro` |
| teste@teste.com | JURIDICO | 13 | 14 | `solicitacoes.acoes.ver_aba_financeiro` |

Breno e o Jurídico já tinham quase tudo — faltava uma permissão em cada.

**Conferido depois**, com o serviço real de autorização: as três contas têm todas as permissões
críticas, os 27 usuários da configuração continuam lá, e nenhum dos 60 usuários ativos conferidos
perdeu o que tinha.

Versão anterior (`id 37`) permanece no banco para rollback; a nova é a `310`.

### Escopo de obra — conferido também

| Usuário | Situação |
|---|---|
| joao@teste.com | vinculado à obra 15 (FÓRUM CARANGOLA) — vê só ela, que é a do teste |
| breno.lopes | **sem vínculo** — cai no acesso global de contratos, vê todas |
| teste@teste.com | JURIDICO está em `SETORES_ACESSO_TODAS_OBRAS` — vê todas |

Os três estão prontos para o teste ponta a ponta na obra 15.
