# Promocao MAIN de todos os pendentes DEV: OFX e Contas a Receber

## Autorizacao e bases

Usuario homologou OFX/codigo TIT no DEV, pediu promocao MAIN e confirmou backup
recente conferido no Drive cifrado e timer ativo. Em seguida ampliou expressamente
o pedido para TODOS os pendentes. Dois commits DEV estavam fora da MAIN:
bc2c69ed84259e7e97914180b37b7855ec2eb1ab e
41219c3af7846006c3b8575d842ebdd76dbd1804. Base MAIN fixada por fetch:
b6546229e3bbec9db2b01162ebfd21808a33481e. Agente unico, branch de integracao
codex/promocao-ofx-main-20261022 no checkout gerenciado existente.

Escopo inicial OFX foi preparado sobre main e validado; apos ampliacao, merge
com historico completo do DEV412 integra tambem a forma prevista. Nenhum commit
pendente do DEV deve ficar fora da ancestralidade final. Sem alterar DEV remoto.
Usuario nao afirmou teste manual separado de forma prevista nesta promocao;
esse ajuste foi autorizado como pendente e recebe QAs isolados locais.

## Pacotes e preservacao

- OFX: grupos por conta/data/valor com sinal, contagem correta para2/1 e3/2,
  reservas locais exclusivas por movimento, remanescente em apenas uma outra
  linha e excedente vazio. Reserva nao e confirmacao. Movimentos parciais distintos
  do mesmo titulo seguem validos; consulta manual filtra reservas de outras linhas.
  Revalidacao sob locks ordenados/transacao antes de confirmar impede reutilizacao.
  Mantem ACL, escopo, soma multipla, principal do payload e auditoria original.
- Codigo real TIT em sugestoes/opcoes/preparacoes/confirmados, sem inventar por ID
  ou duplicar codigo ao selecionar varios movimentos do mesmo titulo. Card usa
  mesmos botoes e padrao, empilhado no celular para nao cortar as acoes.
- Receber: leitura de formas previstas em parcelas comerciais, em lotes500 dos
  titulos ja autorizados/paginados. Apenas fallback RECEBER COMERCIAL sem forma
  explicita. Coluna/CSV identificam previsao; nao preenche FK nem forma da baixa.
  Nao altera filtro/ordenacao por cadastro explicito, calculos, saldo ou status.
- Oito arquivos runtime (quatro backend/quatro frontend) e QAs dos dois pacotes
  devem permanecer identicos ao DEV412. Demais arquivos runtime MAIN preservados.
  validacao do relatorio selecionado recebe so o ajuste de harness ja testado DEV.
- Sete conflitos de integracao: dois packages (somente novo QA de forma prevista)
  e cinco documentos. Resolvidos conservando os dois lados, inclusive historicos
  produtivos e comando QA exclusivo MAIN. Sem conflitos ou reinterpretacao runtime.
- Guardas/roteiros/documentos exclusivos MAIN mantidos. Dependencias, lockfiles,
  migrations, .env, flags, memoria e regras financeiras permanecem inalterados.
  outputs privados fora do commit; sem EC2/DB/S3/Redis/operacao financeira real.

## Roteiro EC2 PROD

ops/deploy/atualizar-producao-ofx-receber-20261022.sh recebe SHA completo fixado.
Exige backup/timer confirmados e timer ativo, caminho fisico MAIN/branch limpa,
flock, PM2 backend-solicitacoes online8000 sem watch/migrations automaticas,
SQLite Node, alvo publicado MAIN e ff-only desde baseb654 ja instalada.
Se EC2 estiver anterior, parar e conferir pacote anterior; nunca usar reset
ou remover a guarda para avancar. Preserva ambiente PM2 sem update-env.

Compara packages semanticamente (apenas dois comandos QA exatos novos), limita
delta runtime aos oito arquivos e rejeita qualquer mudanca de migration/lockfiles.
Verificadores preexistentes verificarFinanceiroProducao20261019 e
verificarReenvioAutorizacaoProducao --verificar rodam antes/depois do merge e
apos restart: UUID/TLS/schema/sessao12h/flags/push somente leitura. Nao envia push,
autoriza pagamento, importa OFX, concilia, gera baixa ou altera cadastro real.

Apos merge executa sintaxe/guardas/QAs backend em memoria/offline. So depois
reinicia backend-solicitacoes, verifica health8000 e repete pos-checks readonly.
Hash .env conferido tres vezes e timer verificado antes do restart. Sem instalar
dependencias, migration/backfill, heap/swap, restart DEV, browser/build na EC2.
Nova guarda pura backend/scripts/validarDeployOfxReceberProducao.js valida roteiro,
ordem/negativas de backup/timer/lock/flags/ancestralidade/pacotes/processo/testes.

## Validacao e limites

QAs OFX exercitam service real em memoria, grupos2/1 e3/2, pool>20, paginacao
global, movimentos parciais por titulo, replay, concorrencia por banco/movimento,
ordem de locks/principal, rollback tardio, escopo403/vazio, conta/data/sinal e
codigo nos SELECTs/DTOs. UI real1366/390 usa API interceptada, preparacao/liberar/
alocar sem POST, modal manual/soma60+40, duplo clique,409 e rede perdida sem retry.
Preparacoes sao locais; entre abas/usuarios, protecao definitiva ocorre no POST.

Receber exercita listagem/controller/validacao/modelos e SQL MySQL offline, IDs
autorizados/paginados, lote500/sem N+1, multiplas/ausentes/explicita, parcial/quitado,
PAGAR/manual/403 e serializacao. UI real1366/390 cobre coluna/CSV/403/retry e
exportacao/relatorio com selecao, sem novas chamadas ou escrita financeira.
Regressoes financeiros/comerciais, guardas antigas MAIN e guardas DEV repetidas.
Nao afirmar teste MySQL em rede ou suite inteira executada pelo agente.

Fechamento local aprovado: 18 QAs backend (pacotes/regressoes/guardas PROD e DEV),
quatro QAs UI (OFX, prevista, obras e relatorio selecionado), build633 modulos
em11,32s. Avisos preexistentes Browserslist/chunk grande; catalogo gerado sem delta.
QA do relatorio usa Chrome instalado via PLAYWRIGHT_EXECUTABLE_PATH somente no
processo do teste, sem download ou mudanca no harness. Sintaxe Node/Bash,
packages exatos, identidade runtime DEV, ausencia de delecoes e docs612/19/diff
conferidos. Ownership liberado para merge/push MAIN autorizado; EC2 so operador.

## Operacao e recuperacao

Aguardar o SHA da publicacao MAIN e atualizar backend/health pela EC2; conferir
frontend MAIN na Vercel no mesmo SHA e atualizar navegador com Ctrl+Shift+R.
Em producao, preferir consultas de conciliacoes existentes e Contas a Receber.
Nao importar extrato, repetir baixa, estornar/recriar ou editar forma financeira
apenas para testar a tela. Confirmar nova conciliacao somente em operacao legitima.

Se uma guarda/teste/health falhar, parar e enviar saida sem segredos; nao contornar
checagens nem repetir mutacoes. Reversao de codigo exige coordenar frontend e
backend; baseb654 permanece no historico, sem reset ou restauracao automatica DB.
Reservas locais desaparecem ao recarregar; vinculos/historicos confirmados devem
ser preservados. Aumento de memoria continua separado deste pacote.
