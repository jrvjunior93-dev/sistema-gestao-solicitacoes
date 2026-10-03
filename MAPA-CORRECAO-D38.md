# Mapa de impacto — rodada de correção da auditoria D38

Escrito **antes de codar** (regra do projeto), com base no relatório
`qa/relatorios/integracao-d38-v1.md` — veredito REPROVADO por 1 ALTA.

## A1 (ALTA) — anexos descartados em silêncio

**O que acontece:** o branch do fluxo novo em `NovaSolicitacao.jsx` retorna antes do trecho
que envia anexos (exclusivo do fluxo padrão). O campo continua visível, o usuário anexa, o
contrato é criado e o arquivo some — sem requisição, sem registro, sem aviso.

**Correção escolhida: enviar o anexo para o contrato.** O auditor sugeriu ocultar o campo,
mas o sistema **já sabe anexar em contrato**: existe `POST /contratos/:id/anexos` (auditado,
evento `CONTRACT_FILE_UPLOADED`, upload S3 + `contrato_anexos`) e o serviço de frontend
`uploadContratoAnexos(id, files)`. Ocultar o campo esconderia o sintoma e tiraria do usuário
uma capacidade que o sistema tem — anexar o documento do contrato é justamente o caso de uso.
Reusar o que existe elimina a classe do problema: nada é aceito na tela e descartado depois.

**Onde mexe:** `NovaSolicitacao.jsx`, dentro do branch D38, depois da criação bem-sucedida —
espelhando o fluxo padrão, inclusive no aviso quando o upload falha ("contrato criado, mas os
anexos não foram enviados"), para que a falha de upload **nunca** seja silenciosa.

**Impacto/risco:** nenhum no fluxo padrão (trecho novo isolado dentro do `if`). O endpoint
exige `requireContratoAccess` + `canAccessContratos`: se o criador não tiver acesso a
contratos, o upload falha — e aí o usuário **é avisado** (o contrato já está criado). É o
mesmo contrato de erro do fluxo padrão.

**Como provar:** criar contrato pela tela com anexo real → `contrato_anexos` com 1 linha
apontando para o contrato criado + requisição de upload observada na rede.

## M1 (MÉDIA) — "Data de vencimento" obrigatória e descartada

O vencimento real do contrato é o **1º vencimento** do bloco (as parcelas derivam dele). O
campo do formulário principal não vai no payload: exigir preenchimento de dado ignorado
induz o usuário ao erro.

**Correção:** ocultar `data_vencimento` quando `usaFluxoContratoNovo` — mesma derivação por
flag já usada na tela (`exibirDataVencimento && !usaFluxoContratoNovo`). Feito em código, e
não por regra em `nova-solicitacao-campos`, porque é consequência direta do modo de tela (o
bloco assume o vencimento), não uma preferência configurável por tipo — e assim produção não
ganha mais um passo de dados para o fluxo funcionar direito.

**Impacto:** ao ocultar, o efeito colateral existente (`if (!exibirDataVencimento)` limpa o
campo, linha ~502) precisa continuar valendo; o `dataVencimentoObrigatoria` da validação
(linha ~808) só é checado com o campo visível — conferir os dois pontos.

## M2 (MÉDIA) — sem teto de parcelas (1000 aceitas, vencimento em 2109)

**Correção:** teto no **backend** (borda que vale) + `max` no input do bloco.
**Valor adotado: 120 parcelas (10 anos mensais)** — é uma **regra de negócio provisória,
escolhida por mim**, a confirmar com o cliente; registrada em `LEIA-PRIMEIRO.md` como decisão
pendente. Sem teto, um erro de digitação gera contrato-lixo com milhares de linhas que na
aprovação viraria milhares de títulos.

**Impacto:** contratos existentes não são afetados (validação só na criação). Nenhum contrato
real do banco tem mais de 120 parcelas — **conferir antes de aplicar**.

## M3 (MÉDIA) — submit do contrato sem chave de idempotência

O submit padrão da mesma tela envia `Idempotency-Key`; o do contrato não. O duplo clique está
protegido só por ref de frontend — retry de rede pode duplicar contrato.

**Correção:** extrair a mecânica de idempotência para um serviço reusável
(`idempotenciaCriacaoService.js`) e usá-la no controller do fluxo novo; o frontend passa a
enviar a chave, como o fluxo padrão. **Não altero `SolicitacaoController`** nesta rodada: ele
está auditado e é o caminho de maior tráfego do sistema; migrá-lo para o serviço comum é uma
mudança própria, com auditoria própria. Fica registrado como pendência.

**Impacto:** requisição sem a chave continua funcionando (comportamento atual preservado);
chave inválida responde 400; repetição da mesma chave devolve a resposta anterior em vez de
criar de novo.

## M4 (MÉDIA) — vínculo tipo_macro/tipo_sub sem validação de consistência

A API aceita `tipo_macro_id=1` (ADM) com `tipo_sub_id=26` (subtipo do CONTRATO). A tela sempre
manda coerente; a borda HTTP, não. Fere a semântica D38-a (fluxo deriva do subtipo por **id
vinculado**).

**Correção:** no serviço, quando `tipo_sub_id` vier, exigir que exista em `tipos_sub_contrato`
com `tipo_macro_id` igual ao informado (e ativo) — senão 400.

**Impacto:** a tela já manda coerente (provado: 33/26), então nada muda para o usuário. Risco
é rejeitar vínculo legítimo — **conferir antes** se há contrato no banco com combinação hoje
inconsistente (a validação é só na criação, não retroativa).

## B1/B2 (BAIXAS) — prévia aceita 0; qtde 0/-3 barrada só pelo navegador

Correção barata e no mesmo arquivo do bloco: mínimo de R$ 0,01 na edição da prévia e mensagem
do próprio sistema para quantidade fora da faixa, em vez de depender do `min` nativo.

## B3 — não é do D38

"Failed to fetch" atribuído a `ThemeContext.jsx` (aborto de fetch em navegação), pré-existente.
Fica registrado como pendência fora do escopo desta entrega.

## O que NÃO muda

- Serviço de aprovação/rejeição, tabela de parcelas, regras de centavos — auditados, intactos
- Fluxo padrão da Nova Solicitação (todos os outros tipos) — o diff fica dentro do `if` do
  fluxo novo, exceto o teto de parcelas e a validação de vínculo, que são do serviço de
  contrato do fluxo novo
- `SolicitacaoController` (idempotência do fluxo padrão) — ver M3
