# Mapa de impacto — segredo TOTP ilegível derrubando o login

Data: 20/08/2026.

> **Nota de processo:** a regra §6 pede o mapa antes da primeira linha. Aqui o diagnóstico veio
> primeiro e o mapa foi escrito junto com a correção, porque o ponto de partida era um 500 em
> produção-local e a investigação é que revelou o escopo. Fica registrado como desvio.

---

## 1. O sintoma

`teste@teste.com` não conseguia entrar. O console do navegador mostrava dois POSTs para
`/api/login`: um **500 Internal Server Error** e um **401**. A tela dizia apenas "E-mail ou senha
inválidos", que é a mensagem do 401 — nada apontava para o 500.

## 2. A causa

`users.mfa_totp_secret` tem *getter* que **decifra** o valor (AES-256-GCM, chave
`MFA_ENCRYPTION_KEY`). Este banco é uma cópia da produção; a chave local em `backend/.env` é outra.
Resultado: `decipher.final()` lança `Unsupported state or unable to authenticate data`.

Em `AuthController.login` a leitura era assim:

```js
const mfaEnabled = Boolean(user.mfa_totp_enabled && user.mfa_totp_secret);
```

A exceção escapava de dentro do `if` e virava **500 opaco**. O 401 do print foi outra tentativa,
com senha diferente — o 401 acontece antes, então nem chega no MFA.

**Não é caso isolado:** dos 13 usuários deste banco com segredo TOTP gravado, **13 falham** ao
decifrar. Todos com `mfa_totp_enabled = 1`. Ou seja, nenhum deles consegue entrar neste ambiente.

| | |
|---|---|
| Usuários com segredo MFA | 13 |
| Decifram com a chave local | 0 |
| `MFA_ENCRYPTION_KEY` local | presente e válida (hex, 32 bytes) — só não é a mesma |
| `MFA_POLICY_ENABLED` local | `false` (o ambiente já declara que não quer MFA) |

## 3. O que foi corrigido

O 500 é defeito em qualquer ambiente — chave rotacionada em produção produziria o mesmo. Corrigido
sem esperar decisão.

`backend/src/services/mfaSecretService.js` (novo) transforma a falha em **valor** em vez de exceção:
`lerSegredoTotp(user)` devolve o segredo, `null`, ou `SEGREDO_ILEGIVEL`.

Sete pontos de leitura passaram a usá-lo — login, verificação do desafio, setup, confirmação
(segredo temporário), desabilitação e a aprovação de pagamento:

- `backend/src/controllers/AuthController.js`
- `backend/src/services/paymentApprovalService.js`

Em todos, segredo ilegível **recusa** com `503` + `code: MFA_SECRET_UNREADABLE` e mensagem que
nomeia a variável a corrigir. O login registra `AUTH_MFA_SECRET_UNREADABLE` no log de segurança.

### A decisão que importa

Segredo ilegível **nunca** vira "usuário sem MFA". Seria a leitura mais cômoda — o login voltaria a
funcionar sozinho —, e seria transformar falha de infraestrutura em **bypass do segundo fator**.
Vale principalmente no `paymentApprovalService`, onde o segundo fator é o que autoriza pagamento.

O mesmo raciocínio vale no `mfaSetup`: um segredo ilegível passando por "não configurado"
permitiria reconfigurar o MFA sem provar posse do fator anterior.

## 4. O que isso NÃO resolve

O usuário continua sem entrar — agora com uma mensagem que explica por quê, em vez de um erro
genérico. Destravar de fato é decisão do cliente, e está na seção 6.

## 5. Prova

`qa/mfa-policy/06-segredo-ilegivel.js` — cria um usuário com senha conhecida e um segredo
`enc:v1:...` cifrado com **outra** chave (o mesmo estado dos 13), e prova:

- o segredo realmente não decifra neste ambiente (premissa conferida, não presumida)
- senha errada continua `401` — a guarda de MFA vem depois
- senha certa **não** responde 500: responde `503` com `MFA_SECRET_UNREADABLE`
- a mensagem nomeia `MFA_ENCRYPTION_KEY`
- **não liberou sessão**: sem token, sem usuário, sem desafio
- o evento `AUTH_MFA_SECRET_UNREADABLE` foi gravado

Suítes `mfa-policy/01`, `02` e `03` seguem no mesmo resultado de antes (a 03 mantém 1 falha, o
achado conhecido de token emitido com política OFF).

## 6. A causa real estava mais fundo (correção da seção 3)

A primeira correção tratou os sete pontos que liam o segredo. **Não bastou**: com o MFA já
desligado, o login continuava em 500. O rastro apontou o lugar certo:

```
model.toJSON()  ->  usuariosSetores.js:89  ->  buildSessionUser  ->  login
```

`toJSON()` percorre **todos** os atributos e dispara **todos** os getters. Um getter que lança
contamina qualquer leitura do registro — inclusive rotas que nem usam o campo. Nenhuma correção nos
pontos de leitura alcança isso.

A correção passou para o getter, em `sensitiveFieldCrypto`:

- `decryptSensitiveValueSafe` devolve o sentinela `VALOR_ILEGIVEL` em vez de lançar; é ela que os
  getters de `User` usam agora
- o sentinela é **string não-vazia** de propósito: continua verdadeiro em `Boolean(...)`, então
  quem pergunta "tem segredo?" segue vendo que tem — nada de bypass —, serializa sem quebrar, e
  nunca será um TOTP válido
- `null` seria a escolha errada: faria o valor passar por "não configurado" e transformaria a falha
  de chave em bypass do segundo fator
- `encryptSensitiveValue` **recusa** gravar o sentinela: ele nunca vira um segredo de verdade

E a ordem das guardas foi invertida nos sete pontos: o segredo só é lido **depois** de confirmar que
o MFA está ligado para o usuário. Com o MFA desligado o segredo é irrelevante, e ler antes fazia um
valor guardado barrar quem nem usa segundo fator — foi o que impediu o destravamento funcionar de
primeira.

## 7. O que foi aplicado no banco local

Escolha do cliente: **desligar o MFA no banco local**.

`UPDATE users SET mfa_totp_enabled = 0` nos **13** usuários com segredo ilegível
(ids 2, 3, 6, 10, 12, 14, 18, 27, 34, 57, 62, 63, 65).

**Os segredos foram preservados** — nenhum `mfa_totp_secret` foi apagado. Se um dia a
`MFA_ENCRYPTION_KEY` correta voltar ao `.env`, basta religar o flag. Conferido: 13 de 13 segredos
seguem gravados, 0 usuários com MFA ligado.

Nada foi alterado em produção.

## 8. Como destravar o login (decisão do cliente)

| Caminho | Efeito | Custo |
|---|---|---|
| Desligar MFA dos usuários deste banco local (`mfa_totp_enabled=0`, segredo nulo) | Todos entram só com senha | Muda dado copiado da produção; nada a fazer no código |
| Fazer `MFA_POLICY_ENABLED=false` também dispensar o MFA por usuário | O ambiente local passa a ignorar MFA por inteiro | Muda o **significado** de uma variável de segurança; inerte em produção, onde ela é `true` |
| Trazer a `MFA_ENCRYPTION_KEY` de produção para o `.env` local | Os segredos voltam a decifrar | Contraria a regra do ambiente 100% offline, sem segredo de produção |

Aplicado: o primeiro (ver seção 7).
