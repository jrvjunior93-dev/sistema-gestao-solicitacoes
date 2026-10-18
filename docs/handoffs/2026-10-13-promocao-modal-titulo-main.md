# Promocao seletiva: preservar formulario de titulo

## Autorizacao e escopo

Usuario homologou a correcao em dev e autorizou promover para main e fornecer
comandos da EC2 de producao. Backup recente no Drive cifrado e timer ativo
confirmados nesta janela. Sem execucao de comandos na EC2 pelo agente.

- Base main: fe6d9c5cbaf3dee3cc4e11b6a97553ad2659ac26.
- Origem homologada: e5dd4c9f6a0d07a18bf5aa08fd83d30532653fb0.
- Integracao: codex/promocao-modal-titulo-main-20261013, criada da main.
- Delta funcional: somente FinanceiroCard.jsx; teste de regressao e documentos.
- Backend, migrations, dependencias, endpoints e permissoes identicos a main.
- Nao inclui o candidato Ticket/estorno f123f9f0 da PR 4, ainda pendente.

## Comportamento

Atualizacoes SSE/fallback do mesmo registro nao reinicializam o rascunho aberto
nem durante envio. Troca de ID encerra os modais e limpa o formulario.
Cancelamento/sucesso/reabertura mantem o descarte esperado. Se o total atual da
solicitacao mudar, o envio exige reabrir e conferir o novo total. Nao interrompe
as atualizacoes nem altera as validacoes e regras de visibilidade.

## Validacoes da integracao

- validarTituloSolicitacaoAtualizacao: aprovado em 1366px e 390px, SSE/fallback,
  foco, dados, parcelas/data parcial, descarte, falha/retry/sucesso e ACL negativas.
- validarValoresFormasTituloSolicitacao: aprovado para formas/parcelas/frete.
- validarTituloNegociacaoModal: aprovado desktop/mobile e restauracao de abas,
  conflito, negativa, envio unico e retry idempotente.
- validarSegurancaAcessoDireto: aprovado, 2304 comparacoes de visibilidade e
  testes de acesso direto, identidade/token e rotas protegidas.
- Build frontend aprovado; avisos ja existentes de Browserslist/chunk >500 kB.
- Documentacao aprovada antes deste handoff; repetir apos registro final.
- validarPermissoesFinanceiroRota falha na propria main: lista esperada nao
  inclui POST /financeiro/fila-pagamentos/:id/estornar. Backend e script identicos
  a origin/main; falha anterior, nao introduzida pela correcao. Nao ampliar o
  escopo para mudar permissoes nesta promocao.
- Componente anterior na main tem o mesmo blob 5229e63d da origem homologada;
  componente corrigido e teste devem coincidir integralmente com e5dd4c9f.

## Recuperacao e deploy

Tag backup/main-pre-ticket-conta-20261013-fe6d9c5c e bundle completo local
tmp/main-code-backup-20261013-ticket-conta/main-fe6d9c5c.bundle conferidos.
SHA256: 7B48375479EF49113EEEA9C20AE98ADF01C23DFD57CABF1D741E37B19CE1C150.
Snapshot fora da EC2. outputs/ preservado e fora do commit.

Publicar via PR da integracao para main com verificacao do SHA e arvore.
Na EC2: conferir branch/alteracoes rastreadas, fetch, criar referencia de
recuperacao e atualizar somente por fast-forward. Parar se checkout divergir;
nao resetar o candidato Ticket/estorno se ele estiver instalado localmente.
Nao instalar dependencias, aplicar migrations nem reiniciar PM2: delta somente
frontend. A interface depende do deployment Production da main Ready na Vercel.
Rollback: restaurar o artefato frontend anterior na Vercel/reverter este patch;
nao executar down ou alterar dados. Smoke autenticado real fica com o usuario.
