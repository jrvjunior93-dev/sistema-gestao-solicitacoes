# Movimentacoes RH: contra-cheque, folha de ponto e CAT - 16/10/2026

## Escopo autorizado

Usuario pediu tres tipos em movimentacoes dos colaboradores: Contra-cheque para
anexar arquivos assinados, Folha de ponto para folhas assinadas e Acidente de
Trabalho - CAT para comunicar a empresa um acidente na obra. Usuario autorizou
agora commit/push junto com sessao 12h e entrega de comandos DEV. Agente nao executa
EC2, banco real ou producao.

Base `c6b91b4ea48b97b772aeede8e76f8a99f77cdb86` publicada em refactor/frontend.
Worktree performance-fila-dp-20261015, branch
`codex/rhdp-movimentacoes-documentos-cat-20261016`. Sem delegacao. Outros checkouts
e outputs/ preservados.

## Alteracoes

- `backend/src/services/rhSolicitacaoService.js`: aceita CONTRA_CHEQUE,
  FOLHA_PONTO e ACIDENTE_TRABALHO_CAT em MOVIMENTACAO. Conclusao retorna registro
  documental, nao metadados de afastamento; nao altera cadastro/folha/financeiro.
  Abertura passa a bloquear a linha do colaborador antes da checagem existente de
  duplicidade, serializando dois cliques/requisicoes concorrentes do mesmo tipo.
- `frontend/src/utils/rhMovimentacoes.js`: catalogo unico das nove movimentacoes,
  rotulos e orientacoes. `RhDpPessoal.jsx` utiliza na selecao, orienta arquivos
  assinados e identifica os tipos na lista de pedidos do colaborador; CAT usa
  Relato do acidente sobre o campo existente justificativa.
- `RhDpPessoalSolicitacoes.jsx`: lista/detalhe mostram subtipo legivel, inclusive
  os tres novos; preserva identificacao especial de primeira lotacao/pagamento.
- `backend/scripts/validarRhMovimentacoesDocumentais.js`: servico real em VM com
  transacoes/modelos/S3 em memoria. `frontend/scripts/validarRhPessoalPorLocal.mjs`
  adiciona modo --movimentacoes sem remover os modos/casos existentes.
  Fixture de validarRhPrimeiraLotacao inclui LOCK.UPDATE e confere o bloqueio;
  assertions anteriores preservadas.
- Scripts package.json e README canonico RH atualizados. Nenhuma migration:
  subtipo ja e VARCHAR(40), e upload/checklist/documentos seguem o modelo atual.

## Regras preservadas / limites

- Rascunho antes de anexar; varios arquivos; envio ao DP; permissoes/obra,
  auditoria, protecao contra duplo clique/concorrencia e conclusao unica atuais.
- Nao torna anexo obrigatorio alem do checklist configurado. Arquivo avulso sem
  classificacao fica na solicitacao, nao entra automaticamente na pasta oficial.
  Classificacao/validacao existentes continuam necessarias para essa pasta.
- CAT e comunicacao interna e nao emite/transmite CAT a nenhum orgao externo;
  nao automatiza afastamento nem gera alerta externo/canal de emergencia.
- Nao verifica assinatura automaticamente. Nao cria documentos-tipo ou exigencias
  por seed/migration. Nao muda regras de acesso a arquivos de colaboradores.

## Validacao

- Novos testes backend aprovados: tres subtipos, concorrencia, colaborador/obra
  obrigatorios, tipo invalido, dois anexos, envio/conclusao, nao repeticao,
  periodo posterior e ausencia de efeitos cadastrais/financeiros. Sem banco/rede.
- UI Chrome local em 1366/390: selecao dos tres, orientacoes/relato CAT, dois PDFs
  por pedido, payload exato, duplo clique, lista/detalhe e somente leitura aprovados.
  Capturas em outputs/rh-pessoal-locais/movimentacao-cat-*.png.
- Regressoes aprovadas: validarEscopoRhDpUsuarioObra, validarRhPrimeiraLotacao,
  validarRhPessoalPorSolicitacao e validarRhConsultaSalario.
- Suite antiga validarRhPessoalFluxo.js interrompe no mock da jornada por
  dependencia crypto nao simulada; este arquivo/servico de jornada nao foram
  alterados aqui. Nao ocultar essa limitacao como suite integral aprovada.
- Regressao UI acoes/icones, build, navegacao (222 rotas), documentacao (530 MD/19
  canonicos), diff/sintaxe aprovados. Somente avisos ja existentes de Browserslist,
  chunk >500KB e catalogo ModuloRelatorios. Captura mobile inspecionada.

## Proximo passo

1. Publicacao autorizada conjunta deste delta e sessao 12h em refactor/frontend,
   sem outros checkouts/outputs/. Validacoes especificas e build reexecutados.
2. Script `ops/deploy/atualizar-dev-rh-sessao-12h-20261016.sh` entrega atualizacao
   DEV sem migrations novas. Preflight/configuracao/testes e limites no handoff
   `2026-10-16-sessao-login-12h.md`; somente backend-dev e alterado pelo operador.
3. Homologar com usuario de Obra e DP: selecionar cada tipo, criar rascunho,
   anexar arquivos, enviar, conferir acesso no DP e concluir sem alterar folha.
4. Main/producao somente com nova autorizacao e homologacao.
