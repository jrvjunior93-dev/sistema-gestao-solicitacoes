# Mapa de impacto — parcela já medida não volta para a fila de medição

Data: 21/08/2026. Escrito antes da primeira linha de código (regra §6).

Relatado: depois de solicitar a medição, a parcela medida continua com o checkbox disponível na
tela de Nova Solicitação — dá para medi-la de novo.

---

## 1. Não é só a tela: o backend aceita

`aplicarMedicaoNasParcelas` já monta o conjunto `jaSolicitadas` (parcelas com vínculo de medição
ativo), **mas usa só para a ordem de vencimento** — para não travar as parcelas seguintes atrás de
uma que já foi pedida.

A validação item a item confere outra coisa:

```js
if (!alvo.editavel) throw erro(`A parcela ${n} esta ${status} e nao pode ser alterada.`);
```

`editavel` vem de `statusEfetivo`, que olha o **status do título** (`ABERTO`) ou da parcela. Uma
parcela medida continua com o título `ABERTO` até o pagamento — então ela passa. **Medir a mesma
parcela duas vezes é aceito hoje**, e o resultado é o contrato comprometido duas vezes pela mesma
linha, com dois vínculos em `medicao_parcelas` apontando para ela.

O que segura parcialmente é o saldo: a segunda medição consome saldo de novo e cedo ou tarde estoura.
Mas antes de estourar ela grava.

## 2. O que muda

### 2.1 A resposta da rota diz se a parcela pode ser medida

`GET /contratos/:id/parcelas` passa a devolver, por parcela, `medivel`:

```
medivel = editavel && não tem vínculo de medição ativo
```

Campo **novo**, ao lado de `editavel` — e não uma mudança em `editavel`. Os dois querem dizer coisas
diferentes e são usados em lugares diferentes:

| Campo | Pergunta | Quem usa |
|---|---|---|
| `editavel` | a parcela ainda aceita alteração de valor/vencimento? | edição da medição, destino da redistribuição |
| `medivel` | esta parcela pode entrar numa medição NOVA? | checkbox da Nova Solicitação |

Mexer em `editavel` para resolver isto quebraria a edição da própria medição — que precisa,
justamente, alterar uma parcela já medida.

### 2.2 O backend recusa a segunda medição

Na validação item a item de `aplicarMedicaoNasParcelas`, parcela com vínculo ativo passa a ser
recusada com o número da medição que já a consumiu, para a pessoa saber onde procurar.

A guarda entra no **serviço**, não na rota: `validarMedicaoParcelas` (o ensaio que a criação de
solicitação roda antes de gravar) chama a mesma função, então a recusa aparece antes de qualquer
gravação, sem código repetido.

### 2.3 A tela desabilita o checkbox e diz por quê

`BlocoMedicaoContrato` passa a usar `medivel` no `disabled` e no `title`, com o texto dizendo que a
parcela já foi medida. Hoje o `title` só sabe falar de status.

## 3. O efeito colateral que apareceu junto: o destino da redistribuição

Quando a medição vale menos que o previsto, a diferença vai para **a última parcela editável**. Como
"editável" não olha medição, essa última pode ser uma parcela **já medida** — e aí o valor dela muda
sem que o `valor_medido` da medição que a consumiu mude junto. A medição passaria a dizer um número e
a parcela outro.

É o mesmo princípio que já apliquei na edição da medição (`atualizarMedicaoDoContrato` exclui as
parcelas da própria medição): **parcela já medida é trabalho já pedido, e não serve de destino.**

Por ordem de vencimento, as medidas costumam ser as primeiras e a última costuma estar livre — por
isso o problema só aparece no fim do contrato. Mas quando aparece, corrompe em silêncio.

### O que fica pendente de decisão sua

Fechando os destinos, sobra um caso sem saída: **medir a ÚLTIMA parcela livre por menos que o
previsto.** Não há para onde mandar a diferença — todas as outras já foram medidas.

Hoje isso "funciona" porque o sistema joga a sobra numa parcela já medida, corrompendo-a. Com a
correção, passa a ser um **erro explícito**, dizendo que não há parcela em aberto para receber.

As saídas possíveis, e a escolha é sua:

1. **Erro explícito** (o que estou implementando). O total do contrato continua invariante (MD-7), e
   quem precisa medir menos no fim tem de encerrar o contrato — que é a operação que trata sobra,
   com devolução de saldo.
2. **Deixar a sobra como saldo do contrato**, reduzindo o total medido sem redistribuir. Mais
   cômodo, mas quebra a invariante de que a soma das parcelas é o valor contratado.

Vou de 1 porque ela não inventa regra nova: o caminho para "sobrou dinheiro no contrato" já existe e
se chama encerramento. Se preferir a 2, é uma rodada curta.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Parcela legítima ficar bloqueada | Suíte mede a parcela 1 e exige a 2 ainda medível |
| Edição da medição parar de funcionar | Suíte edita a medição depois do bloqueio (a 33 já cobre) |
| Ordem de vencimento travar atrás da parcela medida | Suíte mede 1, depois 2, e exige que passe |
| Tela bloquear sem explicar | Suíte confere o `title` do checkbox desabilitado |
| Redistribuição mudar parcela de outra medição | Suíte mede 1, mede 2 por menos, e confere que a 1 não mudou |
| Devolução de título excluído deixar de funcionar | Suítes 07 e 08 seguem passando |

## 5. Suíte

`qa/medicao/34-parcela-medida-nao-remede.js`

---

## 6. Resultado

`qa/medicao/34-parcela-medida-nao-remede.js` — **19 provas, passou.**

| Prova | Resultado |
|---|---|
| Antes de medir, todas as parcelas | `medivel: true` |
| Depois de medir a parcela 1 | `medivel: false` só nela; as outras três seguem medíveis |
| A parcela medida continua `editavel` | sim — a edição da medição depende disso |
| Medir a mesma parcela de novo | 409, dizendo em qual medição ela já está |
| A recusa deixou medição pendurada | não — a transação volta inteira |
| Medir a parcela 2 por menos | diferença foi para a 4 (livre); a 1 ficou intacta |
| `valor_medido` da medição 1 x valor da parcela | continuam batendo |
| Editar a medição 1 na parcela bloqueada | funciona |
| Total do contrato | R$ 10.000, invariante (MD-7) |
| **Na tela**, checkbox da parcela medida | desabilitado, com "Já medida na medição 1" |
| **Na tela**, parcela livre | continua liberada |

Regressão: **04, 06, 07, 08, 09, 19, 21 e 33** seguem passando.

### O que a suíte custou para ficar de pé

Quatro tentativas, e nenhuma delas foi defeito do produto — foi a suíte medindo a coisa errada:

1. rota `/solicitacoes/nova` em vez de `/nova-solicitacao`;
2. `networkidle2` depois do login nunca chega: a página mantém a conexão de atualizações ao vivo
   aberta;
3. **`alert` nativo bloqueia a thread da página** — sem um `page.on('dialog')` para fechá-lo, todo
   `evaluate` seguinte trava até o tempo do protocolo estourar, e o erro que aparece
   (`Runtime.callFunctionOn timed out`) não diz nada sobre a caixa aberta;
4. a obra digitada não era a do contrato (23 é `ED. PEDRA MENINA`), então a busca por referência não
   achava nada — e era justamente ela que abria o alerta do item 3.

Os quatro estão anotados nas armadilhas.
