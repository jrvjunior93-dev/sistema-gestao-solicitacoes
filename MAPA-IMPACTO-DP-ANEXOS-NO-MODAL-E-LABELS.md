# Mapa de impacto — anexos no modal e labels visíveis

Escrito em 27/08/2026, **antes da primeira linha de código**. Pedido do cliente:

> "Tem movimentação que precisa anexar arquivo como Atestado por exemplo então precisa ter o campo
> no modal para anexar o arquivo e permitir anexar múltiplos arquivos. E nos modais precisa ter a
> label do campo — pelo que vi a maioria carrega o que seria a label dentro do próprio campo ou na
> lista de seleção. Isso em todos os modais."

---

## Parte 1 — anexar no modal

### A dependência que precisa ser resolvida

`anexarNoPedido(solicitacaoId, ...)` exige um pedido **já gravado** — o anexo é uma linha de
`rh_solicitacao_anexos` com FK para a solicitação. No momento em que o modal está aberto, o pedido
ainda não existe.

Isso já tinha aparecido na Fase 9 e foi o que motivou o RASCUNHO. **Agora ele resolve este pedido
também**, e sem estado novo:

```
usuário preenche o modal e escolhe N arquivos
        |
        v
  submeter  ->  cria o RASCUNHO  ->  sobe os N arquivos  ->  o modal mostra o que falta
```

O rascunho existe justamente para segurar trabalho incompleto. Sem ele, seria preciso guardar
arquivos em memória e torcer para nada falhar no meio.

### Falha parcial — a parte que não pode ser varrida para baixo do tapete

Se o pedido é criado e o arquivo 3 de 5 falha, **não dá para dizer que deu certo**. O comportamento:

- o rascunho **permanece**, com os arquivos que subiram;
- a mensagem diz **quais** falharam, pelo nome;
- o usuário reenvia só esses, porque o rascunho ainda está lá.

O oposto — apagar o rascunho ao primeiro erro — perderia os arquivos que já subiram e o formulário
inteiro que a pessoa preencheu.

### O tipo do documento vem do checklist

Cada arquivo precisa de `documento_tipo_id`, senão ele entra como anexo avulso e **não conta para o
checklist nem vai para a pasta do colaborador** (regra da Fase 3).

A lista de tipos vem de `GET /rh/solicitacoes/checklist?tipo=&subtipo=`, que já existe. Efeito
colateral bom: escolher "Atestado" faz o campo oferecer *Atestado médico*, *Declaração de
comparecimento*, *Comunicação de afastamento* e *ASO* — exatamente o checklist do subtipo.

### Múltiplos arquivos

Cada linha é **um tipo + um arquivo**, e o usuário acrescenta quantas quiser. Um `<input multiple>`
puro não serve: os arquivos ficariam sem tipo, e todos com o mesmo tipo seria pior — a certidão do
dependente e o comprovante de escolaridade viriam etiquetados igual.

A rota aceita **um arquivo por chamada** (`upload.single('file')`). Os envios são sequenciais, e não
em paralelo: o `multer` grava em disco e o S3 recebe um por vez; disparar cinco juntos multiplicaria
a chance de meio caminho.

## Parte 2 — labels visíveis

### O problema

Hoje o rótulo mora **dentro** do campo: `placeholder="Nome"` nos inputs, e a primeira `<option>`
fazendo as vezes de título nos selects. Isso quebra de três formas:

1. **o rótulo some quando se digita** — quem for conferir o formulário preenchido não sabe mais o
   que cada campo é;
2. **leitor de tela não lê placeholder como rótulo** — o campo fica mudo;
3. **campo obrigatório não tem como se anunciar**, porque não há onde pôr o asterisco.

### A convenção já existe no sistema

Não vou inventar uma:

```jsx
<label className="form-field">
  <span className="form-label form-label--required">Nome completo</span>
  <input className="form-control" ... />
</label>
```

`.form-field`, `.form-label` e `.form-label--required` já estão no `index.css` e são usados em
`AutomacaoStatusSetor`, `AprovacaoDiretoria` e `FinanceiroConciliacao`.

### Alcance medido

| Página | Campos |
|---|---|
| `RhDpPessoal` | 38 |
| `RhDpApuracao` | 6 |
| `RhDpJornada` | 5 |
| `RhDpPessoalSolicitacoes` | 4 |
| **Total** | **53** |

**Escopo: os modais**, como pedido. Os filtros de página têm o mesmo defeito e ficam de fora desta
rodada — fica registrado aqui para decisão.

### O que muda em cada select

Com rótulo de verdade, a primeira `<option>` deixa de ser o título e vira **"Selecione"**. Manter as
duas coisas ("Obra de destino" no rótulo e "Obra de destino" na primeira opção) faria a lista
parecer que já tem um valor escolhido.

Exceção: onde a primeira opção é uma **escolha válida** (`"Empresa do grupo (opcional)"`), ela
permanece — ali ela não é rótulo, é a opção "nenhuma".

## O que NÃO muda

- Nenhuma migration, nenhuma rota nova, nenhuma permissão.
- O fluxo aprovado continua: uma página, quatro abas, tudo em modal, ícones na coluna de ações.
- O portão do envio continua cobrando os obrigatórios — anexar no modal **facilita** cumpri-lo, não
  o dispensa.

## Como verificar

- Suítes 49 a 59 sem regressão (nenhuma toca no frontend, mas o serviço de anexo é o mesmo).
- Build.
- Conferência na tela: abrir Movimentações → Atestado, anexar dois arquivos, ver os dois no rascunho.

---

# O que foi construído — 27/08

## Anexos no modal

Bloco de anexos comum a todos os tipos: **uma linha por arquivo**, cada uma com seu tipo de
documento, com *Acrescentar arquivo* e *Remover*. Os tipos oferecidos vêm do checklist do tipo e do
subtipo escolhidos, e a lista **recarrega quando o subtipo muda** — o checklist do atestado não é o
das férias.

Ao trocar o subtipo, os anexos já escolhidos são zerados: o tipo deles pode não existir na lista
nova, e um `documento_tipo_id` órfão faria o envio ser recusado com uma mensagem que não explica
nada.

Os uploads são **sequenciais**. Falha parcial mantém o rascunho e diz **quais** arquivos não
subiram, pelo nome.

## Labels

**23 campos** rotulados em `RhDpPessoal` e os do modal de `RhDpPessoalSolicitacoes`, com a
convenção que já existia (`form-field` / `form-label` / `form-label--required`).

Sobraram **dois** `placeholder`, os dois de propósito — porque são **dicas**, não rótulos:

| Campo | Placeholder | Por quê fica |
|---|---|---|
| Competência inicial | `AAAA-MM` | é o formato, e o rótulo já diz o que o campo é |
| Parcelas | `Vazio = sem fim` | explica o que o **vazio** significa, coisa que rótulo nenhum carrega |

Duas primeiras `<option>` também continuam sendo mais que rótulo, e por isso não viraram
"Selecione":

- **Empresa do grupo** — quando não há empresas, ela avisa que o problema é de **permissão**;
- **Tipo do documento** no envio — `Sem classificação (não entra na pasta)` é uma escolha válida
  que anuncia a consequência.

## Dois defeitos que eu mesmo tinha deixado, e que apareceram aqui

**A tela mentia sobre o estado.** A mensagem de sucesso dizia *"Solicitação aberta. O Departamento
Pessoal vai decidir"* e o botão dizia *"Enviar ao Departamento Pessoal"* — os dois de antes do
RASCUNHO existir. O DP não vê rascunho. Quem lesse aquilo acharia que tinha terminado, e o pedido
ficaria parado sem ninguém saber. Agora a mensagem diz o número do rascunho e o que falta fazer, e
o botão diz **"Salvar rascunho"**.

**O rascunho não tinha saída.** A rota `POST /rh/solicitacoes/:id/enviar` existia desde a Fase 9,
mas nada na tela a chamava. Foram acrescentados: o botão **Enviar** na linha do rascunho, o rascunho
no filtro de situação, um chip próprio, o destaque na linha, e permissão de anexar e cancelar no
rascunho.

**Um bug de substring quase passou.** A verificação `'enviarRhSolicitacao' not in s` deu falso
porque `reenviarRhSolicitacao` **contém** essa string — o serviço e o import nunca foram criados. O
build passou mesmo assim (ESBuild não falha em import ausente), e só quebraria no clique. Pego com
uma conferência que compara todos os imports de `rhDp.js` contra os exports reais.

## Também entrou

Os campos do item 8 que ainda não estavam na tela: **cargo pelo catálogo**, carga horária, os cinco
tipos de contratação, contato, filiação, endereço e dados bancários com PIX — em grades separadas
por assunto, porque 22 campos numa grade única viram um paredão.

E o backend passou a **gravar** todos eles na criação do colaborador. Sem isso o formulário
coletaria tudo e jogaria fora na aprovação — o pior tipo de defeito, porque a tela diz que gravou.
