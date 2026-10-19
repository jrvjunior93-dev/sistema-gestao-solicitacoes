# Publicacao DEV: permutas realizadas e mapa de datas

## Autorizacao e limites

Usuario autorizou commitar/publicar o pacote local exclusivamente para
refactor/frontend e fornecer roteiro DEV com validacao MySQL. Sem promover
main, acessar EC2/SSH, banco real, Redis, PM2 real, .env ou producao pelo agente.
Base remota conferida: DEV2e146629, mainff459840. Outputs locais nao incluidos.

Escopo funcional e QA da implementacao:
[Permutas e mapa de datas](2026-10-18-permutas-realizadas-mapa-datas.md).
Operacao registra valores realizados, sem saldo/limite de acordo nesta etapa.
Nao cria acordo/carteira, nao libera permissoes automaticamente, nao corrige
datas/recebimentos antigos nem muda componentes de data globais.

## Atualizacao

Roteiro: ops/deploy/atualizar-dev-permutas-20261018.sh, recebe SHA completo
publicado no remoto. Antes do fast-forward confere checkout, branch, working
tree rastreada limpa, lock exclusivo, PM2 DEV/porta8001/watch, banco/schema,
configuracoes/flags/sessao12h em modo --verificar. Exige ancestralidade tanto
do checkout quanto da versao no remoto; nao reseta, forca ou mescla divergencia.

Executa npm ci --omit=dev, preflight novamente, suites de permuta/fila/cartao/
rotas e verificador MySQL. Nao executa suite SQLite no servidor: ela e local
e depende de Node24. Nao exige instalar frontend/node_modules na EC2.
Nenhuma migration nova; qualquer pendencia interrompe e deve ser analisada.
Reinicia SOMENTE backend-dev, sem --update-env, e confere health8001 e sessao.
Conserva env/processo/flags/PILOT/TLS/sessao e nao altera usuarios/permissoes.

Bootstrap na EC2, substituindo SHA_PUBLICADO pelo hash informado no chat:

```bash
(
  set -euo pipefail
  cd /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(pwd -P)" = /home/ubuntu/sistema-gestao-solicitacoes-dev
  test "$(git branch --show-current)" = refactor/frontend
  test -z "$(git status --porcelain --untracked-files=no)"
  versao_dev=SHA_PUBLICADO
  git fetch origin refactor/frontend
  git merge-base --is-ancestor "$versao_dev" origin/refactor/frontend
  roteiro_dev=$(git show "$versao_dev:ops/deploy/atualizar-dev-permutas-20261018.sh")
  bash -c "$roteiro_dev" -- "$versao_dev"
)
```

## MySQL: verificacao estritamente somente leitura

backend/scripts/verificarPermutasMySqlDev.js --verificar, timeout120s no roteiro:

- Antes de conectar exige diretorio exato DEV, deployment development, porta,
  host staging/banco e configuracao PM2 compativel; nao imprime credenciais.
- Confere UUID60f043e9-4025-11f1-9a61-06d8a063012d e banco na mesma conexao.
- Usa configuracao SSL ja existente, sem habilitar/desabilitar ou alterar CA.
- Isolamento REPEATABLE READ para a proxima transacao e START TRANSACTION READ
  ONLY na conexao privada; ROLLBACK obrigatorio inclusive em erro. Nao modifica
  dados nem configuracoes persistentes. multipleStatements=false.
- Executa relatorio real com adaptador de parametros escapados e barreira que
  aceita apenas SELECT/EXPLAIN. Testa todo periodo, pagar/receber, estornos,
  intervalo/so data final, pagina2, busca e escopo vazio/obra quando ha amostra.
- EXPLAIN FORMAT=JSON das consultas de resumo/detalhe; nao usa ANALYZE, DML,
  migration, chave Redis ou usuario ficticio no banco. Loga somente agregados,
  acesso/indices/estimativas e TLS, nao documentos, nomes, SQL ou segredos.
- A injecao de ACL e apenas para executar SQL/escopo no diagnostico, nao login,
  nao concessao de acesso nem prova das permissoes reais de um usuario.
- Zero movimentos e resultado valido, mas nao prova os casos sem amostra.
  Planos mostram varreduras/estimativas para analise: nao garantem performance
  com volumes futuros nem criam indice automaticamente.

Resultado esperado: PERMUTAS MYSQL DEV APROVADO e Health DEV: HTTP200. Em erro,
parar e compartilhar a saida SEM credenciais; nunca remover as guardas para
prosseguir. Se falhar antes do restart, o processo antigo permanece em execucao
com watch desativado; nao promover producao enquanto houver falha.

## Homologacao manual no DEV

1. Esperar deploy frontend DEV na Vercel, sair/entrar novamente para renovar
   sessao/concessoes e conferir dominio DEV, nunca o dominio de producao.
2. Cadastros Financeiros: cadastrar forma nome/codigo/tipo PERMUTA uma vez,
   sem flags de boleto/fatura/cartao/cheque. Superadmin ou permissao de cadastro
   atual MAIS financeiro.permutas.cadastrar. Nao replicar automaticamente grants.
3. Operador com acessos de baixa atuais e financeiro.permutas.usar: integral
   sem conta, empresa do titulo ou explicitamente escolhida, data e valor.
   Titulos compartilhados sem devedor unico exigem escolher empresa.
4. Mista na fila: TOTAL200, Parte em permuta60, forma PIX e conta correta;
   conferir dois movimentos60+140 e ausencia de debito bancario na permuta.
   Conferir juros/desconto, baixa parcial e justificativa pelas regras atuais.
5. Massa preserva parte/referencia/categoria de cada linha. Troca incompatível
   com cartao/cheque e bloqueada, nao descarta partes silenciosamente. Repetir
   envio nao duplica. Estorno da composicao e do grupo completo, uma vez.
6. Contas a receber/pagar: PERMUTA na baixa e Multiplas fontes para combinacao;
   pagamentos ja feitos protegidos e legado permanece consultavel.
7. Relatorio Financeiro > Permutas: permissao financeiro.permutas.relatorio
   independente de .usar/.cadastrar. Conferir filtros/totais/estornos/legado,
   escopo de obra e negacao para usuario sem acesso. ADMINISTRADOR tambem exige
   concessao explicita; SUPERADMIN conserva excecao existente.
8. Nao deve haver saldo disponivel calculado nem bloqueio por limite de acordo.
   Datas: apenas inventario/plano nesta entrega, sem correcao do ano0226.

## QA da publicacao

Teste isolado validarDeployPermutasDev cobre guardas negativas, escaping,
transacao/rollback em falha, amostra vazia, EXPLAIN e limites do roteiro. Nada
real de EC2/MySQL/PM2 foi executado pelo agente. Repetir suites locais, build,
inventario/navegacao, bash -n, documentacao e diff antes do push.

Validacoes repetidas e aprovadas para publicacao: operacao/relatorio/UI de
permutas, roteiro/guardas, fila/cartoes/rotas/sessao/troca usuario/decisoes,
navegacao/abas, mapa reproduzivel, build, bash -n, documentacao574/19 e diff.
Warnings existentes de Browserslist/chunk grande e catalogo de relatorios
nao impedem o build. Nao confundir estas provas isoladas com MySQL DEV real.

Metricas documentais atualizadas para19grupos/111areas/396permissoes. Validador
documental conserva nomes tecnicos historicos no inventario gerado somente nas
linhas COLUNA_BANCO; prosa de reativacao legada e demais termos seguem bloqueados.
