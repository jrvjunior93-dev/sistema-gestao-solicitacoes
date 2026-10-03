# Mapa de impacto — "Ref. do contrato" é o Título, no fluxo novo

Data: 23/08/2026. Escrito antes da primeira linha de código (regra §6).

Lembrete do cliente: no fluxo novo, **Ref. do contrato virou o Título**.

Confirmado no código: `NovaSolicitacao.jsx` envia `ref_contrato: form.descricao`, e o campo que o
usuário preenche ali se chama **"Título do contrato"** desde 18/08 — é por ele que a Medição procura
o contrato depois. Ou seja, a coluna continua se chamando `ref_contrato` no banco, mas o que o
usuário digitou foi um **título**, e o cabeçalho ainda o rotula pelo nome antigo.

---

## 1. O que está errado hoje

No detalhe da solicitação, o mesmo texto aparece **duas vezes**, com nomes diferentes:

- sob o título da página, como descrição (`Teste`);
- no ladrilho **"Ref. do contrato"** (`Teste`).

São o mesmo dado: no fluxo novo a descrição da solicitação **é** o título, e o título **é** o
`ref_contrato` do contrato.

## 2. O que muda

### 2.1 O ladrilho passa a se chamar Título — só no fluxo novo

| Situação | Rótulo |
|---|---|
| Solicitação dona de contrato do **fluxo novo** | **Título** |
| Contrato **legado** (os 335) | continua **Ref. do contrato** |

A distinção não é preciosismo: no legado o `ref_contrato` é mesmo uma *referência* — veio do sistema
antigo ou foi digitada no campo "Ref. do Contrato" da abertura. Renomear ali seria trocar o nome
certo pelo errado.

A condição já existe e é exata: `contratoDoFluxo` só chega ao cabeçalho quando a solicitação é a
**dona** de um contrato do fluxo novo (a guarda está em `index.jsx`).

### 2.2 A repetição sai

A linha de descrição sob o título da página deixa de aparecer **quando for idêntica ao título** —
não é "esconder a descrição em contrato", é não escrever a mesma frase duas vezes a 60px de
distância. Se um dia os dois textos divergirem, os dois voltam a aparecer, sem ninguém mexer em nada.

## 3. O que NÃO muda

- **A coluna `ref_contrato`** e tudo que a lê: busca da Medição, listagens, payloads. É rótulo de
  tela, não renomeação de campo.
- **Nova Solicitação**: lá o campo já se chama "Título do contrato" no fluxo novo.
- **O bloco "Editar ref. do contrato"** no fim do cabeçalho. Vale registrar que ele **não edita a
  ref**: é um seletor que troca *qual contrato* a solicitação aponta. O nome está errado desde antes
  desta mudança e não faz parte do que você pediu — anotado como pendência, não mexido.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Contrato legado passar a dizer "Título" | Suíte abre uma medição de contrato legado e exige "Ref. do contrato" |
| O título sumir junto com a descrição | Suíte exige o ladrilho Título presente e preenchido |
| Descrição diferente do título sumir | Suíte força textos diferentes e exige os dois na tela |
| A ordem das linhas mudar | Suíte 39 segue passando |

## 5. Suíte

Estende `qa/medicao/39-cabecalho-detalhe.js`, que já lê o cabeçalho inteiro.

---

## 6. Resultado

`qa/medicao/39-cabecalho-detalhe.js` — **14 provas, passou** (eram 11; três novas).

| Prova | Resultado |
|---|---|
| Fluxo novo: o ladrilho se chama **Título** | sim, com o texto `Teste` conferido contra `contratos.ref_contrato` |
| E "Ref. do contrato" não aparece junto | confere — é um rótulo, não dois |
| Contrato **legado** (CT/ADML001-25) | continua **"Ref. do contrato"**, sem "Título" |
| A descrição sob o título da página | some quando repete o mesmo texto |
| A ordem das linhas | `Contrato \| Titulo` na primeira, o resto inalterado |

## 7. Pendência anotada, não mexida

O bloco no fim do cabeçalho se chama **"Editar ref. do contrato"** e não edita ref nenhuma: é um
seletor que troca **qual contrato** a solicitação aponta. O nome está errado desde antes desta
mudança, e renomear ali é decisão sua — "Vincular contrato" descreveria o que ele faz.
