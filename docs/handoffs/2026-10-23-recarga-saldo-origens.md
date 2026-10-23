# Recarga de cartao: rotulos, origem das prestacoes e aviso de pagamento

## Autoridade e escopo

Usuario autorizou implementar/testar na base refactor/frontend os novos rotulos,
link da solicitacao com prestacao pendente e aviso de recarga nao paga, mantendo
permissoes e calculos financeiros. Agente unico; branch
codex/recarga-saldo-origens-20261023 sobre c44b1add, mesmo SHA remoto da
refactor/frontend conferido no inicio. Mainfe663151 fora do escopo.
Publicacao direta na refactor/frontend agora autorizada pelo usuario, incluindo
comandos de atualizacao DEV. Sem deploy, banco/EC2/rede externa de negocio ou
migration aplicada pelo agente; nenhuma autorizacao de promocao para main.
Capturas/artefatos privados em outputs/, fora do Git.

## Evidencia e decisao

Print SOL-6721: recarga1227,65 nao paga. Print SOL-6399: anterior2000 paga,
prestacao REJEITADA1227,65, sobra772,35. A coincidencia dos valores nao identifica
a origem. Motor existente contabiliza somente baixas nao canceladas/estornadas;
gastos enviados/rejeitados continuam descontados. Nada foi corrigido em dados
reais; IDs/valores nos testes sao fixtures locais.

Manter as tres informacoes e o ajuste GEO/extrato (nao remover/realocar), apenas
esclarecer rotulos, origens e que a recarga nova ainda nao e credito.

## Arquivos e contratos

- SaldoCartaoRecarga.jsx: novos rotulos, lista compacta das origens com codigo,
  link normal /solicitacoes/:id, status por prestacao e valor. Aviso generico
  quando origens indisponiveis/incompletas. No detalhe, titulo aberto/previsao
  com baixa zero avisa recarga nao paga; parcial com saldo avisa apenas parte
  paga. Sem valor_baixado no DTO nao presume estado financeiro. Sem aviso para
  cancelado/estornado; nao mostra recarga anterior como pedido novo no formulario.
- Novo recargaCartaoSaldoLeituraService.js: projecao exclusivamente de leitura.
  Consulta prestações ENVIADA/REJEITADA/VALIDANDO/ENVIANDO dos cartoes autorizados
  no contexto; rateios inteiros em centavos como no saldo existente. Uma consulta
  para todos os cartoes da resposta, limite101/processamento100 e ACL com cache
  por solicitacao. Nao muda calculo/revisao nem substitui agregado por origens.
- assertPodeVisualizarSolicitacao REAL antes de expor origem. Vem do mesmo fluxo
  do detalhe, incluindo exclusao e regras GEO. Cartao/obra/validacao nao concedem
  leitura por si. 403/404/erro omitem completamente a origem; erro de consulta
  nao impede consultar o saldo ja autorizado. Nenhuma identidade negada no DTO.
- RecargaCartaoController.js: integra projecao depois das guardas existentes nos
  dois GETs de contexto. Retorno historico_restrito continua sem novas origens.
  Nenhuma rota/permissao nova, mudanca nas escritas ou consultas do motor.
- validarRecargasMultiplosCartoes.js: carrega a projecao real na fixture do
  controller e adapta dependencias compartilhadas do status financeiro em
  memoria. Fixture declara/valida que so possui titulos diretos de recarga;
  nenhuma assercao de comportamento foi removida ou relaxada.
- Novos QAs backend/UI e README Financeiro. Nenhuma dependencia/flag/.env alterada.

## Validacoes concluidas

- Backend dedicado aprovado: caso2000/1227,65/772,35, origem correta distinta do
  pedido atual, multiplas origens/cartoes, agregados/revisao intactos, status,
  ACL real OBRA/GEO/SUPERADMIN e exclusao, falhas fechadas, limite/cache e ambos
  controllers. Motor de saldo original testado antes/depois da validacao.
- Regressao multicartoes/saldo/ajuste/rollback/estorno aprovada apos adaptar a
  fixture financeira. Falha de dependencia compartilhada reproduzida tambem
  com teste/controller da base HEAD; nao foi causada pelo ajuste da recarga.
- Regularizacao GEO sem ampliar leitura, medicao/recarga, seguranca2304casos,
  acesso a anexos e schema/limites DP aprovados; tudo isolado sem MySQL real.
- UI dedicada real1366/390 aprovada: tres valores preservados, origem distinta
  da nova recarga, link por teclado/destino correto, varias origens e status,
  origem restrita sem identidade, avisos nao paga/parcial/cancelada/estornada/
  dado ausente, ajuste GEO preservado e saldo negativo. HTTP interceptado,
  nenhum POST de negocio. Capturas desktop/mobile inspecionadas.
- Na fixture, clique no centro do cabecalho em390 nao expandiu o bloco ja
  existente; teste usa o controle explicito de expandir (seta). Nenhuma mudanca
  no BlocoConteudo ou CSS global, nenhum bypass de valores/links/permissoes.
- UI regressiva SaldoCartoes, RecargasMultiplas e ContextoExcluido aprovadas:
  comprovantes, gastos reais/sobra, envio/mutex, ajuste GEO/extrato/historico,
  varios cartoes/anexos, erro/retry/criacao e contexto excluido preservados.
- Build13,44s, Node, navegacao223rotas/221destinos, documentacao604/19 e diff
  aprovados. Apenas avisos preexistentes de Browserslist/chunks e trinco de
  ModuloRelatorios. Catalogo gerado/dependencias sem delta.
- Comparacao Git confirma motores de saldo/recarga, autorizacao/retorno,
  formulario de prestacao, migrations e dependencias INALTERADOS. Nenhuma prova
  de SQL/concorrencia MySQL real nesta etapa; testes em memoria/HTTP isolado.

## Proximo passo

Implementacao/testes concluidos; publicacao autorizada na refactor/frontend.
Nenhuma alteracao em producao. Sem migration nova. Publicar delta e confirmar
ref remota/main inalterada; EC2 real continua sendo atualizada pelo usuario.
Homologar no DEV:
abrir recarga nao paga com prestacao rejeitada anterior; conferir2000/1227,65/
772,35, link da anterior e aviso da atual. Conferir leitor sem acesso a origem
(sem numero/link), parcial e varias origens/cartoes. Nao executar ajuste de
saldo ou validar prestacao real apenas para testar rotulos.

## Publicacao e roteiro DEV

- Base remota c44b1adda96a76c544ca51d8669726a8fd8dc7d1 e mainfe663151 conferidas.
  Somente os arquivos desta tarefa sao incluidos; outputs/ privado excluido.
- ops/deploy/atualizar-dev-recarga-saldo-20261023.sh recebe SHA completo publicado,
  confere caminho/branch/checkout, flock, PM2 backend-dev online/8001/watch
  desligado e migrations automaticas desabilitadas. Verificador existente de
  sessao DEV somente em --verificar confere flags, UUID MySQL DEV/schema/sessao,
  antes da atualizacao, antes do reinicio e depois. Nenhuma configuracao aplicada.
- Atualiza ff-only para o SHA publicado; exige ancestralidade da base e ausencia
  de mudanca nas dependencias, migrations, motores financeiros e permissoes.
  Executa QAs isolados, compara hash .env antes/depois, reinicia so backend-dev
  sem --update-env nem propagacao de autorizacao DDL e confere health8001.
- Se migration anterior estiver pendente ou ambiente divergente, interrompe.
  Nao usar migrate geral ou remover protecoes para continuar. Roteiro nao aplica
  nem mesmo migrations de pacotes anteriores; encaminhar a saida sem segredos.
- validarDeployRecargaSaldoDev.js executa blocos reais em VM e guardas textuais/
  negativas (processo/path/porta/watch/flag/ff-only/escopo/testes/restart), sem
  processo/arquivo/banco real. Validacao existente de sessao/UUID tambem repetida.
- Backend dedicado/regressoes, UI dedicada1366/390 e SaldoCartoes UI repetidos
  para publicacao. Build13,80s aprovado; apenas avisos antigos de Browserslist/
  chunks. Node/Bash/diff/documentacao604/19/navegacao conferidos. Sem SQL real.
  Ownership de publicacao liberado, pronto para commit/push autorizado.
