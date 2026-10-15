# Pagamento RH: cadastro atual no modal

## Escopo e causa

Usuario pediu corrigir salario e conta salario antigos na solicitacao individual,
todos/selecionados e conferencia DP. O servico carregava dados apenas na criacao;
GET retornava o snapshot e save calculava sobre ele. Nao havia reconsulta cadastral.

Worktree reutilizado: C:/Users/Ricardo/.codex/worktrees/promocao-dp-main-20261014/Fluxy.
Branch local codex/rh-pagamento-cadastro-atual-20261015, base origin/refactor/frontend
8cb03a02. Demais checkouts sujos e outputs/ preservados. Sem delegacao.

## Implementacao

- Novo dominio puro rhPagamentoCadastroDomain: projeta base corrente e conta
  salario; hash do cadastro relevante, invalidacao das conferencias quando muda.
- rhPagamentoSolicitacaoService: hidrata em previa/GET/save/envio apos ACL da
  solicitacao, por IDs existentes e mesma obra. GET nao grava. Save e envio
  comparam hash e usam lock do cadastro na transacao. Body nao decide salario
  ou conta salario. Cadastro mudou durante modal aberto: erro 409 orienta
  Atualizar cadastro e nova conferencia, sem gerar titulos parciais.
- RhDpPagamentoModal: Atualizar cadastro preserva inputs locais, nao salva/envia
  automaticamente; revalidacao apos save conserva digitacao concorrente. Aviso
  compacto sobre linhas atualizadas. Editor usa conta salario atual e opcao
  Usar Pix do cadastro, sem mudar visualizacao das demais telas.
- rhPagamentoWorkspaceDraft: assinatura nao e sobrescrita pelo draft; conta
  salario atual prevalece; conferencia antiga nao volta apos troca de abas.
- Outra conta, PIX manual/legado, dias/faltas, percentuais 40/50/60/100,
  acrescimos/descontos, observacoes e reembolso preservados. PIX explicitamente
  de cadastro acompanha atualizacoes; legado e considerado escolha manual por
  seguranca, com acao explicita para usar cadastro.
- Linhas ENVIADO/CANCELADO nao sao hidratadas nem recalculadas. EM_EDICAO usa
  mecanismo existente de revisao financeira, sem alterar titulos na leitura.
- Nao muda regra temporal salarial: usa base corrente do cadastro, cujo servico
  ja respeita vigencia. Nao recalcula folha historica por competencia nem
  antecipa salarios futuros. Nao move colaborador/empresa/local do pagamento.

## Arquivos e validacoes

Runtime: backend/src/services/rhPagamentoCadastroDomain.js,
rhPagamentoSolicitacaoService.js; frontend/src/components/rh/RhDpPagamentoModal.jsx;
frontend/src/navigation/rhPagamentoWorkspaceDraft.js. Testes/documentacao anexos.

Aprovados:
- node backend/scripts/validarRhPagamentoSolicitacao.js: autor/DP, GET sem escrita,
  corpo forjado, save/envio obsoletos, nova conferencia, salarios reais na fila,
  snapshot de titulos, demais calculos/escopo/rascunho/privacidade/replay/rollback.
- node backend/scripts/validarRhPagamentoEnvioParcial.js.
- node backend/scripts/validarRhPessoalPorSolicitacao.js.
- node backend/scripts/validarRhConferenciaGuiada.js.
- node backend/scripts/validarEscopoRhDpUsuarioObra.js (query bloqueada/mocks).
- node backend/scripts/validarRhConsultaSalario.js.
- node frontend/scripts/validarRhPagamentoCadastro.mjs: dominio e workspace reais,
  diario/mensal, conta salario, PIX manual/legado/automatico, historico parcial.
- node frontend/scripts/validarRhPagamentoSolicitacaoUI.mjs --cadastro:
  modal real/API em memoria, autor/DP desktop/mobile, refresh sem perda de inputs,
  sem save automatico, regressao completa de moeda/conta/reembolso/workspace/envio.
- node frontend/scripts/validarRhPagamento50UI.mjs: individual/todos/selecionados,
  previa sem escrita, salvar/conferido, retry, clique duplo e exclusao.
- npm run build (frontend): 589 modulos; avisos preexistentes de Browserslist e
  tamanho de chunks. Sintaxe e git diff --check aprovados.

Evidencias locais ignoradas em outputs/rh-pagamento-solicitacao/cadastro-autor.png
e cadastro-dp-mobile.png; imagem mobile inspecionada. Skill frontend-design usada
para feedback/acao compactos, preservando componentes e estilo corporativo atual.

## Limites e proximo passo

Nenhuma migration/dependencia/permissao nova; sem banco real, EC2, reinicio,
commit/push ou deploy. Testes financeiros com modelos transacionais em memoria;
homologacao MySQL/usuarios reais somente em dev apos publicacao autorizada.
Ownership de edicao liberado, alteracoes locais ainda nao commitadas.

Proximo passo: com autorizacao do usuario, commitar somente este escopo e publicar
em refactor/frontend; atualizar backend e frontend dev e testar salario/diaria e
conta salario alterados antes/depois de abrir o modal, conferencia DP, PIX manual,
rascunho/selecionados, retorno entre abas e solicitacao com envio parcial.

## Publicacao dev autorizada

Usuario autorizou commit/push exclusivamente deste ajuste em refactor/frontend e
comandos para homologacao EC2 dev. Conferencia contra origin/refactor/frontend
8cb03a02, sem incluir outputs/, main ou alteracoes de outros checkouts.

Script ops/deploy/atualizar-dev-rh-cadastro-20261015.sh: checkout/branch limpos,
dependencias fixadas no lockfile, testes financeiros em memoria, preflight de
processo backend-dev/caminho, porta8100, endpoint/UUID/banco staging e schema
totalmente atualizado. Nao aplica migrations, seeds/backfills nem altera flags.
Reinicia exclusivamente backend-dev e verifica health. Operador executa na EC2;
agente nao acessa a maquina nem banco externo.

validarDeployRhCadastroDev.js testa o preflight real em VM com mocks, inclusive
recusa de processo/porta/instancia/schema/flags divergentes. Sintaxe Bash,
testes de pagamento/cadastro/workspace e documentacao revalidados para publicacao.
Validacao desktop/mobile/build da implementacao acima permanece aplicavel,
pois o runtime nao mudou nesta etapa. Ownership de edicao/staging liberado.

Depois da publicacao: operador atualiza EC2 dev pelo SHA fornecido e confirma
deployment frontend dev na Vercel antes da homologacao. Sem promocao para main.
