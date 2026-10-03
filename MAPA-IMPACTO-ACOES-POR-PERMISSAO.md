# Mapa de impacto — as ações do contrato passam a respeitar a permissão de quem olha

Data: 20/08/2026. Escrito antes da primeira linha de código (regra §6).

Relatado: `joao@teste.com`, do setor **OBRA**, recebeu o contrato devolvido, reenviou ao Jurídico
(correto) e passou a ver o bloco **"Minuta pronta — enviar para assinatura"**, que é de quem tramita
no Jurídico.

---

## 1. São dois problemas independentes, e o mais grave é o de dados

### 1.1 João realmente TEM a permissão do Jurídico

Medido no banco, na configuração vigente (`PERMISSOES_AREAS_USUARIOS`, id 310):

| Usuário | Setor | `contratos.juridico.tramitar` | `contratos.aprovacao.aprovar` |
|---|---|---|---|
| 5 — João | OBRA | **sim** | **sim** |
| 35 — Breno Lopes | Gerência de Processos | não | sim |
| 62 — TESTE | Jurídico | sim | sim |

Ou seja: **não é só a tela que está mostrando demais.** Se ele anexasse a minuta e clicasse, o
backend aceitaria — `tramitarNoJuridico` confere `contratos.juridico.tramitar`, e ele tem. O usuário
da obra pode hoje aprovar o contrato dele mesmo e tramitá-lo no Jurídico.

O que segurou na tela dele foi a validação do próprio formulário ("Anexe a minuta ou informe o link
de assinatura antes de enviar."), que é do navegador — a requisição nem chegou ao servidor.

**De onde veio:** não foi da aplicação que fiz em 20/08. Comparando a configuração anterior (id 37,
de 22/06) com a vigente, o que entrei para o João foram cinco chaves: `contratos.geral.visualizar`,
`solicitacoes.acoes.criar`, `solicitacoes.acoes.ver_aba_financeiro`,
`solicitacoes.lista.visualizar_minhas`, `solicitacoes.lista.visualizar_setor`. As duas do Jurídico e
da aprovação já estavam lá desde junho.

Mas a falha é minha assim mesmo: eu propus a união e relatei "joão 27 → 32" **sem auditar o que as 27
já continham**. União só acrescenta — e por isso mesmo ela preserva um erro que já existia. Quando o
pedido é "quais permissões preciso dar a cada um", conferir o que a pessoa já tem faz parte da
resposta.

### 1.2 A tela oferece ação por STATUS, sem olhar permissão nenhuma

`AcoesContrato.jsx` decide o que mostrar só pelo `status_contrato`. Não há uma checagem de permissão
no arquivo inteiro. Todo mundo que enxerga a solicitação vê:

| Status | Botões oferecidos hoje a qualquer um |
|---|---|
| `AGUARDANDO_APROVACAO` | Aprovar · Rejeitar · Cancelar |
| `EM_ANALISE_JURIDICA` | Anexar minuta · Minuta pronta · Rejeitar · Cancelar |
| `AGUARDANDO_ASSINATURA` | Solicitar revisão · Cancelar |
| `EM_REVISAO_JURIDICA` | Conferido — aprovar contrato · Rejeitar · Cancelar |
| `REJEITADO` | Reenviar para aprovação |

O backend recusa cada uma delas com 403 para quem não tem a chave — a proteção existe e não é essa
que está furada. O defeito é a tela **prometer o que a pessoa não pode fazer**: ela descobre por um
"Acesso negado" depois de anexar arquivo e clicar.

É a mesma família de defeito que já apareceu quatro vezes nesta implantação, do outro lado: lá a tela
escondia o que a pessoa podia fazer; aqui ela mostra o que a pessoa não pode.

### 1.3 Achado ao montar a trava: a etapa da assinatura não tinha dono

`tramitarNoJuridico` exigia `contratos.juridico.tramitar` nas **três** etapas. Só que a etapa do
meio (`assinado`, o botão "Solicitar revisão") não é do Jurídico: quando a minuta sai, a solicitação
volta ao setor de **origem** justamente para colher a assinatura — e é a origem que aciona a
revisão. Ela não tem, nem deve ter, a permissão do Jurídico.

Enquanto a barra aparecia para todo mundo, ninguém tinha esbarrado nisso na tela. Fechar a tela pela
permissão certa **exporia** o defeito: o bloco simplesmente sumiria para quem tem o contrato em mãos,
e o contrato pararia ali.

É a quinta vez nesta implantação que a permissão foi escolhida pelo que a rota **faz** (tramita no
Jurídico) e não por quem **precisa** usá-la.

Corrigido: a permissão passa a ser conferida depois de saber a etapa. `minuta` e `conferido`
continuam do Jurídico; `assinado` é de quem abriu o contrato ou de quem o gerencia — o Jurídico
também passa, para não travar o caso em que ele mesmo recebe o assinado em mãos. Na resposta, isso
vira o campo `confirmar_assinatura`.

## 2. O que muda

### 2.1 O backend diz o que ESTE usuário pode fazer neste contrato

`listarParcelasDoContrato` — a rota que a tela de detalhe já chama para montar o bloco do contrato —
passa a devolver `contrato.permissoes`:

```
{ aprovar, tramitar_juridico, confirmar_assinatura, rejeitar, reenviar, cancelar }
```

Calculado com **as mesmas funções que as rotas usam para recusar**, não com uma regra paralela:

| Campo | Regra | Igual a |
|---|---|---|
| `aprovar` | estrita `contratos.aprovacao.aprovar` | `aprovarContrato` |
| `tramitar_juridico` | estrita `contratos.juridico.tramitar` (`minuta` e `conferido`) | `tramitarNoJuridico` |
| `confirmar_assinatura` | é o autor / gerencia contratos, ou o Jurídico (`assinado`) | `tramitarNoJuridico`, etapa `assinado` |
| `rejeitar` | estrita da permissão **da etapa atual** (`ETAPAS_QUE_REJEITAM`) | `rejeitarContrato` |
| `reenviar` | é o autor da solicitação, ou `contratos.geral.criar`/`editar` | `reenviarContratoParaAprovacao` |
| `cancelar` | estrita `contratos.solicitacao.cancelar` | `cancelarSolicitacaoDoContrato` |

Duplicar as regras aqui seria criar uma segunda verdade que diverge da primeira no dia em que uma
das duas mudar. Por isso a resposta **chama as mesmas funções**.

A rota é `GET /contratos/:id/parcelas`, já protegida por `requireContratoAccess` (escopo de obra).
`permissoes` é informação sobre o próprio solicitante, e não expõe nada de terceiros.

### 2.2 A tela passa a esconder o que não pode

Cada bloco de `AcoesContrato` só aparece se a permissão correspondente vier verdadeira. Quando o
contrato está num estado que exige ação e o usuário não tem nenhuma delas, no lugar dos botões entra
uma linha dizendo de quem é a vez — para não virar um card vazio e sem explicação.

**Ausência de `permissoes` na resposta não libera nada.** Um campo que falta é tratado como negado,
para que uma resposta antiga ou truncada não reabra os botões em silêncio.

### 2.3 As permissões do João

Proposta de remoção — chaves de outros setores que ele carrega desde junho:

| Chave | Por quê sai |
|---|---|
| `contratos.juridico.tramitar` | é do Jurídico; foi o que você viu na tela |
| `contratos.aprovacao.aprovar` | é da Gerência de Processos; ele aprovaria o próprio contrato |
| `contratos.geral.encerrar` | encerrar contrato devolve saldo e mexe em títulos |
| `contratos.solicitacao.cancelar` | cancelar é terminal: a solicitação não volta |

Ficam: `contratos.geral.criar`, `contratos.geral.editar`, `contratos.geral.visualizar`,
`contratos.credor.completar_cadastro`, `contratos.relatorios.visualizar` — abrir o contrato, corrigir
o cadastro do contratado, acompanhar e reenviar depois de uma devolução.

Como a configuração é **versionada** (inserir substitui a de todos), a alteração é feita copiando a
vigente e removendo só essas quatro chaves do usuário 5 — os outros 26 usuários vão idênticos, e isso
é conferido depois de gravar.

## 3. O que fica pendente de decisão sua

O usuário 62 (Jurídico) também tem `contratos.aprovacao.aprovar`, ou seja, ele pode aprovar o
contrato na etapa da **Gerência de Processos**, antes de ele chegar ao Jurídico. Pode ser
intencional; como não é o que você relatou, não mexo sem você dizer.

## 4. O que pode quebrar

| Risco | Verificação |
|---|---|
| Bloco sumir para quem TEM a permissão | Suíte abre a tela com o Jurídico e exige o bloco da minuta |
| Bloco continuar para quem não tem | Suíte abre a mesma tela com o usuário da obra e exige a ausência |
| Reenvio do autor sumir | O autor não tem `contratos.geral.*` no teste e o botão precisa continuar |
| Resposta sem `permissoes` liberar tudo | A tela compara com `=== true`: campo ausente é negado |
| Etapa `assinado` ficar sem dono | Suíte confirma a assinatura como a autora, sem permissão de Jurídico |
| Remoção mexer em outro usuário | Confere as 27 listas antes e depois, uma a uma |
| Custo por requisição | As checagens usam o cache de 30s do serviço de permissões |

## 5. Suíte

`qa/medicao/32-acoes-por-permissao.js`

---

## 6. Resultado

`qa/medicao/32-acoes-por-permissao.js` — **20 provas, passou.** Três usuários reais, um por papel,
logando de verdade; as permissões vêm da rota real e as ações são exercidas por HTTP.

| Prova | Resultado |
|---|---|
| A rota responde `permissoes` diferentes para cada pessoa | sim |
| Obra: não aprova, não devolve, não tramita — mas reenvia (é a autora) | confere |
| Gerência: aprova e devolve na etapa da aprovação | confere |
| Jurídico: **não** devolve na etapa da aprovação | confere — a permissão segue a etapa |
| Jurídico em `EM_ANALISE_JURIDICA`: tramita e devolve | confere |
| Obra tentando a minuta **pela rota** | 403 — não é só a tela escondendo |
| Obra, autora, confirmando a assinatura | aceito, contrato foi a `EM_REVISAO_JURIDICA` |
| Obra tentando conferir o assinado | 403 — quem aprova o contrato é o Jurídico |
| **Na tela**, a obra vê "Minuta pronta" | não vê, e lê de quem é a vez |
| **Na tela**, o Jurídico vê "Minuta pronta" | vê |
| Navegador falou com algo fora de 127.0.0.1 | não |

Regressão: **09, 10, 20, 21, 28, 30 e 31** seguem passando.

### Permissões do João

Aplicado (você escolheu tirar as quatro). Usuário 5: 32 → 28 chaves. Saíram
`contratos.juridico.tramitar`, `contratos.aprovacao.aprovar`, `contratos.geral.encerrar` e
`contratos.solicitacao.cancelar`. Os outros 26 usuários da configuração foram conferidos um a um
antes de gravar e estão idênticos. Configuração efetiva: id 332 (era 310).

Conferido depois do cache: João sem Jurídico e sem aprovação, Breno e o usuário do Jurídico
inalterados.

### Correção de ferramenta, de passagem

`qa/lib/sessao.js` contava `data:` URI como "requisição externa" — o ícone do seletor de data do
Chrome reprovava a prova de isolamento. A checagem segue exata para host de verdade; o que mudou é
que esquemas sem host (`data:`, `blob:`, `about:`) não entram na conta. O risco de deixar como
estava era pior do que o falso positivo: um alerta que grita à toa é um alerta que se aprende a
ignorar.
