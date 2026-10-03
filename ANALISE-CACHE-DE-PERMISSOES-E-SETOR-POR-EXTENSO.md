# Duas pendências para decisão — cache de permissões e setor por extenso

Data: 26/08/2026. Levantamento **read-only**: nenhuma linha de código ou de dado foi alterada.

Serve para você decidir. Cada problema traz o que ele **faz de verdade**, o alcance medido, as
opções e o que eu recomendo.

---

# Problema 1 — a configuração de permissões que "some"

## Correção do que eu te disse antes

Eu descrevi como *"engole erro e devolve **ninguém tem permissão** por 30 segundos"*. Lendo o código
inteiro, **está pela metade e a metade que faltava é pior**.

O sistema tem duas verificações, e elas reagem ao vazio de formas **opostas**:

| Verificação | Chamadas no sistema | Config vazia significa |
|---|---|---|
| `userHasAreaPermission` | **155** | **libera** — "não configurado = acesso completo" |
| `userHasStrictAreaPermission` | **20** | **nega** |

```js
const permissions = await getAreasPermissoesForUser(user);
if (!Array.isArray(permissions) || permissions.length === 0) {
  return true;          // ← 155 portas abrem
}
```

Então uma configuração ilegível **não tranca o sistema: ela o abre.** Só as 20 portas estritas
negam — e são justamente as que eu e o item 31 marcamos como sensíveis.

> O "não configurado = liberado" **é deliberado**, e faz sentido: instalações que nunca configuraram
> permissões continuam funcionando. O defeito não é essa escolha. É que **falha de leitura é
> indistinguível de "nunca configurado"**.

## Onde exatamente

`authorizationService.getPermissoesAreasConfig()`:

```js
const item = await ConfiguracaoSistema.findOne({ ... });   // fora do try
let config = { usuarios: {}, ... };                         // vazio
if (item?.valor) {
  try { config = { ...JSON.parse(item.valor) }; }
  catch { config = { usuarios: {}, ... }; }                 // ← vazio, sem log
}
permissoesAreasUsuariosCache = { expiresAt: now + 30s, config };   // ← guarda o vazio
```

Três coisas somadas:

1. o `catch` **não distingue** "JSON quebrado" de "não configurado";
2. **não registra nada** — nenhum log, nenhum alerta;
3. **guarda o resultado no cache por 30 segundos** — e, como a próxima leitura falha igual, o efeito
   se renova indefinidamente.

Erro de banco **não** cai aqui: o `findOne` está fora do `try` e a exceção sobe como 500. O caminho
perigoso é **JSON inválido** ou **linha ausente**.

## O gatilho concreto, medido

| Medida | Valor |
|---|---|
| Coluna que guarda a configuração | `TEXT` — **65.535 bytes** |
| Tamanho da configuração hoje | **29.552 bytes** |
| Usuários configurados | **30** |
| Custo por usuário | **~985 bytes** |
| **Teto da coluna** | **~67 usuários** |
| **Usuários ativos hoje** | **67** |

**Vocês estão exatamente no teto.** Se os 67 ativos forem configurados, a configuração passa de
65.535 bytes.

### O que acontece ao passar

Depende de uma configuração do MySQL:

| `sql_mode` | Comportamento | Resultado |
|---|---|---|
| **STRICT** (como está aqui) | MySQL **recusa** a gravação | erro ao salvar; configuração intacta |
| **não estrito** | MySQL **trunca em silêncio** | JSON quebrado → `catch` → **155 portas abertas** |

Neste ambiente o `sql_mode` **é estrito** — conferido. **Não tenho como conferir produção.**

> Se produção não for estrita, o caminho é: alguém salva a permissão do 67º usuário → gravação
> truncada → todo mundo passa a ter acesso a tudo que não seja uma das 20 portas estritas → **e
> nenhuma mensagem aparece em lugar nenhum**.

## E o que você viu na tela

Aquele bloco de 403 seguido de recuperação **não foi este defeito**. Foi outra coisa, e vale saber:

**13 suítes de QA publicam a configuração de permissões** com um usuário só, para testar, e restauram
depois. Enquanto uma delas roda, a configuração viva tem 1 usuário — e qualquer pessoa usando o
sistema naquele instante é barrada.

Isso vale **só no ambiente de desenvolvimento** (suíte não roda em produção), mas explica os testes
instáveis daqui.

## As opções

### A. Não mexer

**Custo zero.** Risco: se produção não for estrita, crescer além de 66 usuários configurados abre o
sistema em silêncio. Se for estrita, o sintoma é um erro ao salvar que ninguém vai entender.

### B. Separar "erro" de "vazio" *(recomendo)*

Três mudanças em uma função:

- no `catch`, **manter a última configuração conhecida** em vez de esvaziar;
- **registrar em log** — hoje o problema é totalmente silencioso;
- **não guardar o resultado do erro no cache**, para a próxima leitura tentar de novo.

**Custo:** contido a `getPermissoesAreasConfig`. **Efeito:** configuração corrompida deixa de abrir
as 155 portas; o sistema segue com a última boa e alguém vê o erro.

**Risco da mudança:** baixo — e é preciso decidir o que fazer quando **nunca** houve configuração
boa em memória (por exemplo, logo após subir o servidor). Minha proposta: nesse caso, manter o
comportamento de hoje, porque negar tudo no boot derrubaria o sistema.

### C. Tirar o teto

`ALTER TABLE configuracoes_sistema MODIFY valor MEDIUMTEXT` — de 64KB para 16MB.

**Custo:** uma migration, numa tabela pequena. **Efeito:** o gatilho mais provável deixa de existir.

**Risco:** baixo, mas é `ALTER TABLE` em tabela usada no boot — pede janela.

### D. B + C *(o que eu faria)*

C remove a causa provável; B protege contra as outras (edição manual, bug no salvamento, linha
apagada). Uma sem a outra deixa metade do problema.

## O que precisa de você

1. **Produção é `sql_mode` estrito?** Um comando resolve, e ele muda o tamanho do risco:
   ```bash
   mysql -e "SELECT @@sql_mode LIKE '%STRICT%' AS estrito"
   ```
2. Qual opção seguir.

---

# Problema 2 — setor gravado por extenso

## O que é, medido

| Onde | Valor gravado | Registros |
|---|---|---|
| `solicitacoes.area_responsavel` | `DEPARTAMENTO PESSOAL` | **14** |
| `solicitacoes.area_responsavel` | `GERENCIA DE PROCESSOS ` (com **espaço no fim**) | **3** |
| `historicos.setor` | `DEPARTAMENTO PESSOAL` | **38** |

O resto do sistema usa o **código** (`DP`, `GEO`). São 224 solicitações com `DP` contra 14 por
extenso.

## A boa notícia: já parou

| | |
|---|---|
| Última por extenso | **16/04/2026** |
| Última com código | 13/08/2026 |
| Última do sistema | 26/08/2026 |
| **Abertas por extenso** | **zero** — todas concluídas, pagas ou atendidas |

**Não é um defeito ativo.** Alguma correção entre abril e agosto fechou a porta — provavelmente o
campo virou lista em vez de texto livre. É resíduo histórico, e ele não cresce.

## O que quebra hoje

| Onde | Efeito |
|---|---|
| Filtro por setor | a lista oferece códigos; essas 17 nunca aparecem no filtro |
| Relatório agrupado por setor | aparecem como um **setor separado**, inflando a contagem de setores e faltando nas do DP |
| Regra de visibilidade | comparação por texto não casa — **mas todas estão fechadas**, então ninguém precisa vê-las |
| Contagem de "quanto o DP atendeu" | fica **14 solicitações menor** do que foi |

O impacto real é **relatório histórico**, e só de fevereiro a abril.

## As opções

### A. Não mexer

**Custo zero.** 17 registros de 5.000 continuam fora dos filtros. Se ninguém consultar aquele
período por setor, ninguém percebe.

### B. Uniformizar por script *(recomendo)*

`UPDATE` trocando `DEPARTAMENTO PESSOAL` → `DP` e `GERENCIA DE PROCESSOS ` → `GEO`, nas duas
tabelas.

Seguindo a regra do projeto: vai em `backend/scripts/dados/`, **fora da cadeia de migrations**, com
`--conferir` que conta sem escrever, e roda com janela escolhida por você.

**Custo:** um script pequeno. **Efeito:** filtro e relatório passam a enxergar os 17.

**Risco:** baixo, mas real — é `UPDATE` em dado de produção. Mitigações:
- o `--conferir` mostra exatamente quantas linhas antes de qualquer escrita;
- só toca em valores que **não existem** na tabela `setores` (não há como acertar um código válido);
- todas as linhas estão **fechadas**, então nenhum fluxo em andamento é afetado.

### C. Uniformizar e impedir que volte

B mais uma **restrição no banco** ou validação que recuse `area_responsavel` fora da lista de
setores.

**Custo:** maior, e mexe num caminho em uso diário. **Benefício:** pequeno, porque **já parou de
acontecer** há quatro meses.

Não recomendo agora: é resolver um problema que o sistema já resolveu sozinho.

## O que precisa de você

Só a escolha entre A e B. Se for B, eu escrevo o script e **não rodo** — você roda com
`--conferir` primeiro, vê o número, e decide.

---

# Resumo para decidir

| | Problema 1 — cache | Problema 2 — setor |
|---|---|---|
| **Ativo hoje?** | sim, latente | **não** — parou em abril |
| **Cresce?** | sim, com o nº de usuários | não |
| **Pior caso** | **155 portas de permissão abertas, em silêncio** | relatório histórico incompleto |
| **Alcance** | sistema inteiro | 17 registros, fev–abr |
| **Urgência** | **alta** se produção não for estrita | baixa |
| **Recomendo** | **B + C** | **B**, sem pressa |

> Se for para fazer uma coisa só: **descobrir o `sql_mode` de produção**. É um comando, e ele diz se
> o Problema 1 é uma armadilha esperando os próximos usuários ou apenas um erro confuso ao salvar.
