# Mapa de impacto — cadastro do credor e anexo da negociação, acima do limite

Data: 20/08/2026. Escrito antes da primeira linha de código, conforme a regra §6.

Decisões do cliente nesta rodada:

1. Exigir **endereço completo + CPF/CNPJ**, com consulta a uma **API gratuita de CNPJ**
2. Correção pelo modal via **rota estreita**, só desses campos
3. Detalhes da contratação: **só anexo**, o campo de texto sai da tela

---

## 1. O problema

Acima do limite (hoje R$ 50.000) o contrato vai ao Jurídico, que precisa dos dados do contratado
para montar a minuta. Os cadastros já existem e estão incompletos. Medido no banco:

| Fornecedores ativos | 2.454 |
|---|---|
| Com endereço **completo** | **26** (1,1%) |
| Sem logradouro | 2.423 |
| Sem número | 2.426 |
| Sem bairro | 2.424 |
| Sem CEP | 2.423 |
| Sem município | 2.419 |
| Sem UF | 2.418 |

**A validação não é exceção, é o caminho normal.** Isso decide o desenho: o modal precisa corrigir
ali mesmo, sem mandar a pessoa para outra tela e de volta.

## 2. Três coisas que o levantamento revelou

### 2.1 Quem vai corrigir não pode

`PATCH /parceiros/:id` exige `configuracoes.cadastros.gerenciar`. O usuário da obra não tem — e o
usuário do GEO também não (conferido nas 79 permissões do Breno Lopes). Sem rota nova, o modal
abriria e o salvar daria 403.

### 2.2 O limite do frontend está solto do backend

O backend lê `CONTRATO_LIMITE_JURIDICO` da configuração (padrão 50.000, a Diretoria muda por tela).
O frontend tem `LIMITE_DETALHES_CONTRATO = 50000` **fixo no código**. Mudado o limite, a tela cobra
num valor e o backend roteia noutro. Como o modal e o anexo penduram nesse mesmo corte, isso entra
no escopo.

### 2.3 A proteção de upload já existe, com duas lacunas

`uploadComprovantes` → `createSecureUpload` → `uploadFileSecurity` já faz extensão + MIME na lista,
**validação de binário** (assinatura ZIP e conferência de `[Content_Types].xml` e `word/` no
`.docx`), limite de 50 MB, rate limit e evento de segurança em cada bloqueio.

Falta:

- **ClamAV desligado** (`CLAMAV_ENABLED=false`). O código existe; a varredura não roda.
- **Nenhum bloqueio de macro.** `.docx` é um ZIP: nada impede um `vbaProject.bin` dentro dele, nem
  um `.docm` renomeado — a estrutura passa nas duas checagens atuais.

## 3. O que muda

### 3.1 Limite único (pré-requisito de tudo)

`GET /contratos/fluxo-novo/opcoes` passa a devolver `limite_juridico`. O frontend consome de lá.
`LIMITE_DETALHES_CONTRATO` deixa de ser a fonte e vira apenas fallback, para a tela não quebrar se
a rota falhar.

### 3.2 Rota estreita para completar o cadastro do credor

`PATCH /parceiros/:id/cadastro-contrato` (nova).

- Altera **somente**: `cpf_cnpj`, `endereco`, `numero`, `complemento`, `bairro`, `cep`, `municipio`,
  `estado`. Qualquer outro campo no corpo é ignorado — não é filtro de conveniência, é a razão de a
  rota existir: quem abre contrato conserta o endereço sem ganhar acesso ao cadastro inteiro.
- Permissão nova: `contratos.credor.completar_cadastro`.
- Valida CPF/CNPJ (dígito verificador), CEP com 8 dígitos, UF nas 27 siglas.
- Grava evento `PARTNER_CONTRACT_DATA_UPDATED` com antes e depois.

### 3.3 Consulta de CNPJ — desligada por padrão

`GET /integracoes/cnpj/:cnpj` (nova), proxy no backend. **Nunca** chamada direto do navegador: o
endereço do serviço externo fica no servidor, e assim a saída para a internet tem um ponto único
para auditar e bloquear.

- Env nova `CNPJ_LOOKUP_URL` (ex.: `https://brasilapi.com.br/api/cnpj/v1/{cnpj}`). **Vazia por
  padrão** → a rota responde `501` e a tela não mostra o botão. É o que mantém o ambiente local
  100% offline.
- Env nova `CNPJ_LOOKUP_TIMEOUT_MS` (padrão 8000).
- Timeout curto e falha silenciosa na tela: a consulta é conveniência; digitar à mão continua sendo
  o caminho garantido.
- As duas vão para `MIGRACAO-PARA-PRODUCAO.md`.
- **O que sai daqui:** só o CNPJ consultado. É dado público de empresa, mas é tráfego de saída — e
  por isso a decisão de ligar é de produção, não do código.

### 3.4 Modal de conferência antes de criar a solicitação

Acima do limite, o botão de criar abre primeiro um modal com os contratados e o favorecido:

- lista, por parceiro, o que está completo e o que falta
- **bloqueia** a criação enquanto faltar campo obrigatório
- botão **Editar** por parceiro → formulário com os campos, `Consultar CNPJ` quando a integração
  estiver ligada, e salvar pela rota estreita
- depois de tudo verde, o botão confirma e cria

Abaixo do limite nada muda: o contrato é criado direto, como hoje.

### 3.5 Detalhes da contratação vira anexo

- O `<textarea>` sai da tela de Nova Solicitação e da tela de Contrato do fluxo novo.
- No lugar, ícone de anexo. Aceita **`.docx` e `.pdf`** — a negociação costuma circular nos dois.
- A coluna `contratos.detalhes_contratacao` **fica no banco** e continua exibida (somente leitura)
  no detalhe, quando houver valor. Contrato antigo não perde o que já foi escrito.
- **Onde o backend cobra:** na **aprovação**, não na criação. A criação é JSON e o anexo sobe num
  segundo passo (`POST /contratos/:id/anexos`) — o servidor não tem o arquivo em mãos na criação. A
  tela cobra no submit para a pessoa não descobrir depois; `aprovarContrato` recusa acima do limite
  sem o documento. É onde a exigência não pode ser contornada, e é coerente com PI-16: a checagem
  vive onde o compromisso se materializa.

### 3.6 Proteção do arquivo

Perfil de upload novo `contrato_negociacao`, só `.docx` e `.pdf`, e três reforços que valem para
**todo** Office Open XML do sistema:

- rejeitar `vbaProject.bin` e `word/vbaData.xml` dentro do pacote → macro bloqueada
- rejeitar os content-types de macro (`...document.macroEnabled...`) declarados no
  `[Content_Types].xml` → `.docm` renomeado não passa
- rejeitar `oleObject` / objeto embutido no pacote → o vetor de "clique aqui para abrir"

Todos com `UploadSecurityError` e evento de segurança, como o resto.

E `MIGRACAO-PARA-PRODUCAO.md` ganha o aviso: **ligar `CLAMAV_ENABLED` em produção**. Sem isso a
varredura antivírus não roda, e a validação de estrutura sozinha não pega malware.

## 4. O que NÃO muda

- Contratos abaixo do limite: nenhum passo novo.
- `PATCH /parceiros/:id` continua existindo, com a permissão de sempre.
- A tela de Parceiros, a importação por planilha e os demais uploads seguem iguais.
- Nenhum cadastro é alterado sozinho: a consulta de CNPJ **preenche o formulário**, quem salva é a
  pessoa.

## 5. O que pode quebrar (e como cada um é verificado)

| Risco | Verificação |
|---|---|
| Rota estreita aceitar campo fora da lista | Suíte envia `nome` e `pix_chave_fixa_1` e exige que não mudem |
| Salvar sem a permissão nova | Suíte tenta com usuário sem ela e exige 403 |
| CPF/CNPJ ou UF inválidos passarem | Suíte envia dígito verificador errado e UF inexistente, exige 400 |
| Consulta de CNPJ vazar para fora com a env vazia | Suíte confere 501 e **zero** tentativa de saída |
| Aprovar acima do limite sem o documento | Suíte aprova sem anexo e exige recusa |
| `.docm` renomeado para `.docx` passar | Suíte monta um ZIP com content-type de macro e exige 400 |
| Macro dentro de `.docx` passar | Suíte monta um ZIP com `vbaProject.bin` e exige 400 |
| Quebrar upload legítimo | Suíte envia um `.docx` real e um `.pdf` real e exige 200 |
| Quebrar contratos abaixo do limite | Suítes 17, 18, 20, 22 e 23 seguem passando |

## 6. Suítes

- `qa/medicao/24-cadastro-credor-contrato.js` — modal, rota estreita, permissão e validações
- `qa/medicao/25-anexo-negociacao.js` — anexo obrigatório acima do limite e as proteções do arquivo

---

## 7. Resultado (20/08)

Implementado conforme o plano, com três desvios registrados abaixo.

### Backend
- `credorContratoService` — conferência, validação (CPF/CNPJ por dígito verificador, CEP, UF,
  duplicidade) e a gravação com **lista fixa de campos**. Não há espalhamento de objeto em lugar
  nenhum: é isso que mantém a rota estreita.
- `cnpjLookupService` — consulta externa, desligada por padrão, com timeout e normalização de campos
  de vários provedores.
- Rotas: `GET /contratos/fluxo-novo/limite-juridico`, `GET /contratos/credores/conferencia`,
  `PATCH /contratos/credores/:id/cadastro`, `GET /contratos/credores/cnpj/:cnpj`,
  `POST /contratos/:id/negociacao`.
- `aprovarContrato` recusa acima do limite sem anexo `NEGOCIACAO_DETALHADA`.
- `uploadNegociacaoContrato` (perfil `.docx`/`.pdf`) + proteção contra macro e objeto embutido.
- Migration `202608200001_contrato_anexo_tipo.js`, aplicada.

### Frontend
- `ModalConferenciaCredores` — lista, acusa campo a campo, corrige e libera a criação.
- O `<textarea>` de detalhes virou ícone de anexo em `BlocoContratoFluxoNovo`.
- `NovaSolicitacao` lê o limite do backend, abre a conferência antes de criar e sobe o documento
  logo depois.
- `ContratoFluxoNovo` (tela `/contratos/novo`) troca o textarea por um aviso: ela não tem campo de
  anexo, e deixar o texto faria a pessoa achar que cumpriu a exigência.

### Três desvios do plano

1. **A detecção de macro é por NOME DE ENTRADA do ZIP, não por content-type.** O plano dizia
   rejeitar os content-types de macro declarados no `[Content_Types].xml` — só que o **conteúdo** das
   entradas está comprimido com DEFLATE, então procurar `macroEnabled` não acharia nada num arquivo
   real. Os nomes de entrada, sim, ficam em claro. E resolve o mesmo caso: todo `.docm` carrega
   `word/vbaProject.bin`. A busca usa `Buffer.includes` no buffer inteiro — a checagem de estrutura
   olha só os primeiros 512 KB, e limitar a detecção ao mesmo trecho bastaria empurrar o
   `vbaProject.bin` para depois dele.
2. **`cpf_cnpj` é NOT NULL sem default.** Documento ausente não existe no banco; o que existe é
   documento de fachada (`000...`). Por isso a validação confere dígito verificador, e a suíte testa
   esse caso, e não o campo vazio.
3. **Recusa de extensão saía como 500.** Descoberto pela própria suíte: o `fileFilter` do multer
   lançava `Error` puro, sem `statusCode`, e "Erro interno do servidor" faz quem escolheu o arquivo
   errado achar que o sistema quebrou. Trocado por `UploadSecurityError` (400). Os outros quatro
   uploads do sistema têm o mesmo defeito e ficaram registrados em `MIGRACAO-PARA-PRODUCAO.md`.

### Suítes

`24-cadastro-credor-contrato.js` — 22 provas. A central: a rota recebe `nome`,
`pix_chave_fixa_1`, `cliente`, `fornecedor` e `ativo` junto com o endereço, e prova que **nenhum
deles muda**. Mais: 403 sem a permissão, 400 por dígito/CEP/UF, 409 por CNPJ de outro parceiro,
nada alterado em nenhuma recusa, e a consulta externa respondendo 501.

`25-anexo-negociacao.js` — 15 provas, com arquivos montados byte a byte via `jszip`: `.docx` com
macro, `.docm` renomeado, `.docx` com `oleObject`, executável disfarçado, extensão fora do perfil —
todos recusados; `.docx` e `.pdf` legítimos aceitos; reenviar troca em vez de acumular; e a
aprovação passando só depois do documento.

### Bateria

Suítes 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25 e
o baseline 01 — todas passando.

Cinco suítes (10, 17, 18, 20) precisaram do documento como **fixture**: elas criam contratos acima do
limite para provar outra coisa. O helper `qa/lib/negociacao.js` grava a linha direto no banco e diz,
no próprio comentário, que o caminho do upload é provado na suíte 25 — para ninguém ler o atalho como
cobertura.

---

## 8. Ajustes depois do primeiro uso (20/08)

Três correções vindas de uso real da tela.

### 8.1 A permissão travava o próprio fluxo

O modal abria, acusava o que faltava e **não deixava salvar**: `Acesso negado: completar o cadastro
do credor exige permissão específica`. A permissão nova não é de ninguém por padrão — e quem abre a
solicitação era exatamente quem precisava corrigir.

Decisão do cliente: **quem cria a solicitação corrige; a Gerência de Processos revisa depois**, já
que ela precisa aprovar o contrato de qualquer forma.

A rota passou a aceitar `contratos.credor.completar_cadastro` **ou** `contratos.geral.criar` **ou**
`solicitacoes.acoes.criar`. A permissão granular continua existindo, para conceder a quem não cria
contrato (o próprio GEO, ao revisar).

O que sustenta essa abertura é o par que já estava no desenho: **escopo curto** (endereço e
CPF/CNPJ, nada mais) e **trilha** (evento `PARTNER_CONTRACT_DATA_UPDATED` com antes e depois em toda
alteração). Sem os dois, soltar a permissão seria entregar o cadastro de parceiros a quem abre
solicitação — e vale dizer com todas as letras: **a rota agora alcança qualquer parceiro, não apenas
o do contrato em aberto.** A revisão da GEO é o controle compensatório.

### 8.2 O botão de cadastrar credor já existia — faltavam os campos

Não foi preciso criar rota nova. `POST /solicitacoes/credores` já existe, já é usada pelo botão
"Cadastrar credor" da busca, e já persiste endereço — os campos simplesmente **não eram
renderizados** no modal, embora estivessem no estado do formulário. É essa lacuna que produz os
2.428 fornecedores sem endereço.

Cheguei a escrever um `POST /contratos/credores` paralelo e **removi**: duas portas de cadastro
divergiriam na primeira mudança de regra.

O que mudou: os campos de endereço entraram no modal, obrigatórios, e a validação passou a rodar
também no backend — reusando `pendenciasDoCadastro` do mesmo serviço da conferência, para não
existirem duas versões da regra.

Efeito: credor cadastrado por esse botão **nasce pronto** para um contrato acima do limite.

### 8.3 "Saldo a distribuir: R$ 0,00"

O campo mostra o valor do contrato menos a soma das parcelas — quanto ainda falta distribuir. Zero é
o estado **certo**, mas o número sozinho não diz isso, e lido como "saldo" parecia campo vazio.

Agora a tela diz o que o número significa: `As parcelas fecham o valor do contrato` quando zero, e
`Falta distribuir R$ X — ajuste as parcelas até fechar o total` (ou `Passou do valor...`) quando não.

### 8.4 Um defeito da própria suíte, que valia por dois

O teste que prova "quem cria solicitação consegue salvar" reprovava. A causa não era o código: a
suíte passava `{ id: 3 }` como usuário, e boa parte das permissões vem dos **padrões de setor e
perfil**, que precisam do registro completo. Um stub só com o id perde tudo o que não for concessão
individual.

Corrigido para carregar o `User` de verdade. Fica anotado: **teste de permissão com usuário de
mentira mede a coisa errada** — e neste caso mediria a favor de uma regressão.

### 8.5 Bateria

Suítes 01, 13, 17, 18, 20, 22, 23, 24 e 25 passando. A 24 subiu para 27 provas, com duas novas:
quem cria solicitação consegue salvar sem permissão extra, e cadastro de credor sem endereço é
recusado dizendo o que falta.

---

## 9. A regra antiga que ficou para trás (20/08)

**Sintoma:** com o documento anexado, criar contrato acima do limite dava
`Detalhes da contratacao sao obrigatorios para contratos acima de R$ 50.000.`

**Causa:** eu movi a exigência para o documento (cobrado na aprovação) e **não removi a regra
antiga** — o texto continuava obrigatório em `criarContrato`. Como o campo saiu da tela,
`detalhes_contratacao` chega sempre vazio: na prática, **nenhum contrato acima do limite podia ser
criado pela tela nova**.

Corrigido: a cobrança do texto saiu de `criarContrato`. O campo continua sendo aceito e gravado —
os contratos antigos guardam o texto.

### Por que a bateria inteira deixou passar

Todas as suítes que criavam contrato acima do limite **mandavam `detalhes_contratacao` por conta
própria**:

| Suíte | Mandava |
|---|---|
| 05, 10, 18, 20, 25 | `detalhes_contratacao: '...'` no payload |
| 17 | criava no valor **exato** do limite, e a guarda era `>` |

Ou seja: elas montavam um payload que a tela não monta mais. **Suíte que constrói o payload no lugar
da tela testa o que ela mesma inventou** — e foi assim que a mesma classe de defeito passou duas
vezes seguidas (antes, o modal que não deixava salvar: nenhuma suíte clicava nele).

Está anotado nas armadilhas do `LEIA-PRIMEIRO.md`.

### O que mudou no QA

- As cinco suítes pararam de mandar `detalhes_contratacao` — passam a reproduzir o formulário atual.
- A suíte 25 ganhou a prova explícita: **contrato acima do limite é criado sem o texto**.
- Nasceu `qa/medicao/26-tela-abertura-acima-do-limite.js`, que faz o caminho **inteiro pela tela**,
  sem montar payload nenhum: preenche obra, tipo, subtipo, credor, valor, apropriação, condição,
  parcelas; tenta criar sem o documento e é barrada; anexa o `.docx`; o botão abre a **conferência**
  em vez de criar; o confirmar começa **bloqueado**; completa o cadastro pelo modal; o botão libera;
  confirma; e então verifica no banco que o contrato nasceu **sem texto de detalhes**, com o anexo
  `NEGOCIACAO_DETALHADA`, e que a aprovação segue ao Jurídico. **17 provas.**

Três campos do bloco de contrato (`forma_pagamento_id`, `qtde_parcelas`, `primeiro_vencimento`)
ganharam `name` para poderem ser mirados — a regra do projeto já era mirar por `name`, e eles não
tinham.

A seleção da apropriação na suíte é feita **pelo teclado** (seta + Enter): o autocomplete seleciona
no `onMouseDown` e a lista vive num portal, então clicar por seletor seria adivinhação.

### Bateria

05, 10, 17, 18, 20, 22, 23, 24, 25 e 26 — todas passando.

---

## 10. A terceira guarda errada, pela mesma razão (20/08)

**Sintoma:** contrato criado, e o upload logo em seguida devolvendo
`O contrato CT-0001 foi criado, mas a negociacao detalhada NAO foi enviada (Acesso negado)`.

**Causa:** `uploadNegociacao` era protegida por `canManageContratos`, que exige
`contratos.geral.editar`. Quem abre contrato pela obra tem `contratos.geral.criar`. O contrato
nascia **sem o documento** — e portanto **impossível de aprovar**. Encalhado.

É a terceira vez nesta implantação que a guarda escolhida não é a de quem usa a tela: primeiro o
modal do credor, depois a rota de cadastro, agora o upload. O padrão é sempre o mesmo — **a
permissão foi escolhida pelo que a rota FAZ ("mexe em contrato" → gestão de contratos), e não por
quem PRECISA usá-la.**

### A correção, com um limite

`contratos.geral.criar` passa a valer para anexar a negociação — **apenas enquanto o contrato está
`AGUARDANDO_APROVACAO`**, que é a janela em que ele ainda está sendo montado. Depois disso
(Jurídico, ativo, encerrado), trocar o documento volta a exigir `contratos.geral.editar`.

O limite não é decoração: sem ele, quem abre solicitação poderia substituir a negociação detalhada
de um contrato **já em análise no Jurídico** — trocar a peça enquanto ela está sendo avaliada.

O escopo por obra continua valendo em qualquer caso: `requireContratoAccess` roda antes.

### Suíte nova

`qa/medicao/27-anexo-negociacao-por-quem-abre.js`. Nenhum usuário do banco serve — não existe quem
crie sem editar contratos —, então a suíte **cria um usuário descartável** com senha conhecida,
concede a permissão, espera o cache de 30s do servidor, faz login de verdade por HTTP e exerce a
rota real. Devolve tudo no `finally`.

11 provas, entre elas: a premissa conferida (`canManageContratos` é `false` para ele), o upload
aceito com o contrato aguardando aprovação, a aprovação seguindo ao Jurídico (o desfecho que o
defeito impedia), e a recusa depois que o contrato saiu da janela.

### E de novo uma prova que media a coisa errada

O teste "quem não pode criar nem editar é recusado" passava com
`403 Acesso negado para esta obra` — vindo da guarda de **obra**, não da permissão. Ao remover
`contratos.geral.visualizar` eu também tirava o acesso global a contratos, e o 403 mudava de dono.

Corrigido: o usuário mantém `visualizar` e a asserção agora exige a **mensagem da permissão**. Sem
isso, a suíte diria "recusado" enquanto a guarda que interessa poderia estar aberta.

### Gap residual, assumido

Se o upload falhar por outro motivo (rede), o contrato fica criado sem documento. A mensagem já
orienta a anexar pela Gestão de Contratos, e a permissão agora permite — mas o usuário da obra pode
não ter a tela. Não há recuperação dentro do próprio fluxo de abertura.

### Bateria

20, 24, 25, 26 e 27 passando.

---

## 11. O 500 que o QA causou (20/08)

**Sintoma:** `Erro ao criar contrato do fluxo novo`, com 500 em `POST /contratos/fluxo-novo`.

**Causa:** `Duplicate entry 'CT-0001-15' for key 'idx_contratos_codigo_obra'`. A sequência de código
estava em **zero**, e `CT-0001` (obra 15) já existia — um contrato criado à mão pelo cliente.

Quem zerou foi a **limpeza das minhas suítes**. Vinte e três arquivos de QA terminavam com
`UPDATE contrato_codigo_sequencias SET ultimo_numero=0`. Funciona enquanto o banco só tem o que a
própria suíte criou e apagou. **Não é o caso deste banco:** ele é cópia da produção e o cliente
abre contratos manualmente enquanto testa.

Ou seja: um defeito de teste vazou para a tela de quem usa o sistema.

### A regra que ficou

**Limpeza de QA devolve o estado; não impõe um.** Zerar é impor.

`qa/lib/sequenciaContrato.js` devolve a sequência ao **maior código que realmente existe**. Se a
suíte apagou tudo o que criou, dá no mesmo que zerar; se sobrou qualquer contrato — do cliente ou de
outra suíte — a numeração continua de onde ele parou. Aplicado nos 23 arquivos.

### O que escondeu o problema por horas

O `finally` de todas as suítes terminava em
`catch (e) { console.error('limpeza falhou:', e.message); }` — **aviso, e a suíte seguia dizendo
PASSOU**. Foi assim que a suíte 26 rodou sem o `require` do helper novo, falhou na limpeza, deixou a
sequência fora de lugar e ainda assim se declarou aprovada.

Corrigido em 30 arquivos: limpeza que falha agora imprime `LIMPEZA FALHOU` e **reprova a suíte**
(`process.exitCode = 1`). Estado sujo que sobra é problema de quem roda a próxima coisa — inclusive
de quem está usando o sistema.

### Estado devolvido

Sequência realinhada com a realidade: `ultimo_numero = 2`, os dois contratos do cliente intactos
(`CT-0001` e `CT-0002`), próximo código `CT-0003`.

Conferido depois de rodar a bateria: a sequência **volta para 2** ao fim, em vez de zerar.

### Bateria

03, 05, 10, 13, 17, 18, 20, 25 e 26 passando, com a sequência preservada.

---

## 12. A guarda certa era autoria, não permissão (20/08)

O cliente foi direto ao ponto: *"a negociação detalhada não pode depender do usuário poder criar ou
editar contratos para ser anexada"*. Está certo, e o meu conserto anterior ainda estava errado.

Foram **três** tentativas, todas com a mesma causa — escolher a permissão pelo que a rota FAZ, e não
por quem PRECISA usá-la:

| Tentativa | Guarda | Por que falhou |
|---|---|---|
| 1ª | `canManageContratos` (`contratos.geral.editar`) | barra o usuário da obra |
| 2ª | + `contratos.geral.criar` | ainda barra: quem abre pela **Nova Solicitação** pode não ter permissão nenhuma de contrato |
| 3ª | **autoria** | o vínculo real |

Na tela de Nova Solicitação o usuário tem `solicitacoes.acoes.criar`, e o contrato nasce por conta
dele. Não há permissão de contrato para exigir — e não deveria haver.

**A guarda agora é:** anexa quem **criou aquele contrato** (`solicitacoes.criado_por` da solicitação
dele), ou quem gerencia contratos. `contratos.geral.criar` continua valendo para a tela de Contratos,
onde não há solicitação a que atribuir autoria.

Autoria não vira passe livre: vale para **o contrato dele**, e só **enquanto ele aguarda aprovação**.
Depois disso nem o autor troca o documento — senão substituiria a peça que o Jurídico está avaliando.

A suíte 27 foi reescrita em cima disso: o usuário de teste agora tem **zero permissão de contrato**,
e prova que anexa o dele (201), não anexa o de outra pessoa (403 pela mensagem de autoria) e não
troca depois que o contrato saiu da janela.

---

## 13. O QA apagou as permissões de 26 usuários (20/08)

Descoberto ao investigar uma prova da suíte 24 que passou a dar o resultado errado.

`PERMISSOES_AREAS_USUARIOS` é uma configuração **versionada**: o sistema lê a linha de maior `id`.
Inserir uma linha não acrescenta permissões — **substitui a configuração inteira de todos**.

Uma linha de teste da suíte 20 (163 caracteres, um único usuário) ficou para trás e virou a
configuração efetiva do banco. A linha real (22/06, 27.869 caracteres, **26 usuários**) deixou de
valer. Resultado medido: Breno com **0** permissões em vez de 79; Luiza, 0 em vez de 29.

E pior que perder permissão: `userHasAreaPermission` trata "nenhuma permissão configurada" como
**liberado**. Ou seja, o vazamento não só tirou acessos — **afrouxou** checagens.

### Por que ficou invisível

A limpeza apagava por `id > (máximo de antes)`. Com uma linha já vazada de uma execução anterior, o
"máximo de antes" **já era a linha vazada**: a suíte apagava a sua, relatava
`permissoes QA restantes = 0`, e a linha errada seguia mandando no sistema.

### Corrigido

- Linha vazada removida (com backup), configuração real de volta. Conferido: Breno 80, Luiza 29,
  Liz 89, Nathanael 4.
- `qa/lib/permissoesConfig.js`: apaga **o id que ela mesma inseriu** e **confere** que a
  configuração efetiva voltou a ser a de antes. Se não voltou, lança — e limpeza que lança reprova a
  suíte (mudança da rodada anterior).
- Suítes 20 e 27 passaram a usá-lo.

Conferido rodando as duas: configuração efetiva `37` antes e `37` depois.

### Bateria

18, 20, 24, 25, 26 e 27 passando, com permissões e sequência de código preservadas ao fim.

---

## 14. Plano de contas inteiro no campo de categoria (20/08)

Pedido: listar todos os planos do tipo **contas a pagar**, com busca e autocomplete.

### O campo estava vazio, e pela quarta vez pelo mesmo motivo

A tela lia `GET /configuracoes/contrato-obra-categorias`, protegida por `allowConfiguracoesGeral`.
Quem aprova contrato não tem permissão de Configurações — o 403 caía num `.catch(() => setCategorias([]))`
e o campo aparecia com "Selecione" e nada mais. Nem erro, nem explicação.

É a **quarta** vez nesta implantação que um `catch` mudo esconde um 403.

### O que mudou

- Rota nova `GET /contratos/fluxo-novo/categorias`, só autenticação: é leitura de plano de contas.
  A autoridade continua sendo conferida na aprovação, com permissão estrita.
- O `<select>` virou **autocomplete** (o mesmo da apropriação: busca por código ou nome, lista em
  portal). São 160 categorias — rolar uma lista desse tamanho para achar `2.01.01.05` é pior do que
  digitar.
- O erro **não é mais engolido**: falha ao carregar aparece embaixo do campo.

### Mudança de regra, registrada

`garantirCategoriaLiberada` deixou de exigir a lista curada
(`CONTRATO_OBRA_CATEGORIAS_PERMITIDAS`, três categorias). O que restringe agora é o **tipo**:
categoria precisa existir, estar **ativa** e ser de **contas a pagar**.

Não é afrouxamento gratuito — contrato gera conta a pagar, e uma categoria de RECEBER classificaria
o título do lado errado da DRE, erro que só apareceria no relatório muito depois. A tela de
Categorias do Contrato de Obra continua existindo e a configuração segue gravada; ela apenas deixou
de ser o gargalo desta escolha.

### Suíte

A 20 dirige esse campo pela tela. O seletor de `<select>` foi trocado por um helper de **teclado**
(digita, seta, Enter) — o autocomplete seleciona no `onMouseDown` e a lista vive num portal. O
helper devolve o **id escolhido**, e a suíte confere que a categoria gravada no contrato é
exatamente essa (`ATIVO|46|APROVADA|2`).

### Bateria

18, 20, 25 e 26 passando.

---

## 15. Migration de outro módulo derrubando o boot (20/08)

Ao reiniciar o backend, ele **não subiu**:
`ER_TOO_LONG_IDENT: Identifier name 'solicitacao_compra_itens_manuais_insumo_catalogado_id_foreign_idx' is too long`.

A migration é `202608200002_catalogacao_itens_manuais.js`, do módulo de **Compras** — **não é deste
bloco de trabalho**. Com `references` dentro do `addColumn`, o Sequelize gera o nome da constraint
concatenando tabela + coluna: **65 caracteres**, contra o limite de 64 do MySQL. Como `server.js`
roda as migrations antes de abrir a porta, o backend inteiro ficava fora do ar.

Corrigido com o mínimo: a coluna é criada sem `references` e a FK entra em seguida via
`addConstraint`, com nome explícito `sc_itens_manuais_insumo_catalogado_fk`. Mesmo comportamento
(`SET NULL` / `CASCADE`), nome que cabe. Nada mais da migration foi tocado.

Nada havia sido aplicado antes da falha (a coluna não existia e a migration não estava registrada),
então não houve estado parcial. Depois da correção: `Migration aplicada` e backend de volta.
