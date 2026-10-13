# Balao sem anexos da criacao

## Escopo e estado

Pedido: a criacao e os arquivos anexados no mesmo ato nao devem gerar balao
de nova interacao. Implementacao local, sem commit/push/deploy, banco real,
migrations, limpeza de avisos ou mudanca de visibilidade. Preservadas as
alteracoes locais anteriores de Solicitacoes e Fila de Pagamentos.

## Causa e correcao

SOLICITACAO_CRIADA ja nao participava de tipoInteracao. Arquivos selecionados
na abertura sao enviados por outro POST, cujo ANEXO_ADICIONADO era capturado
como nova interacao. Token assinado existente passa a carregar solicitacao_nova
explicitamente para criacao efetiva. O mesmo token usado para medicoes em
solicitacao existente nao recebe essa marca.

AnexoController preserva validacao de acesso e permissoes: apenas com token
valido para solicitacao/usuario/tipo e claim de criacao nova registra origem
CRIACAO_SOLICITACAO no historico. O classificador de interacoes ignora esse
evento de abertura, sem remover arquivo/historico ou modificar notificacao
geral. Nao aceita flag arbitraria de origem no corpo do cliente. Nenhuma
heuristica de minutos e usada; anexos posteriores continuam gerando destaque.

## Arquivos

- backend/src/services/solicitacaoCriacaoUploadTokenService.js
- backend/src/controllers/SolicitacaoController.js (somente geracao do token)
- backend/src/controllers/AnexoController.js (origem auditada)
- backend/src/services/solicitacaoInteracoesService.js (classificacao)
- backend/scripts/validarAnexosCriacaoInteracoes.js (novo, transportes isolados)
- backend/scripts/validarInteracoesSolicitacao.js (criacao sem fan-out)
- README Solicitacoes e ownership.

## Validacoes e limites

Testes isolados de controller/token/interacoes passaram para multiplos
boletos iniciais, historico preservado, anexo posterior, medicao existente,
token antigo, token adulterado/expirado/usuario/solicitacao/tipo incorretos,
origem enviada no corpo e escopo negado mesmo com token valido. Testes de
interacoes/leitura/prioridade SQL, remocao de anexos, seguranca de acesso
direto, acesso por setor e sintaxe tambem passaram. UI de interacoes testada
com APIs isoladas; nenhum teste alterou S3, banco ou EC2.

Nao existe identificacao confiavel para todos os avisos iniciais antigos:
sem origem assinada registrada, eles nao sao apagados/classificados por
proximidade temporal. Tokens emitidos pelo backend anterior mantem acesso,
mas nao sao presumidos de criacao nova; expiracao existente de 10 minutos.

## Proximo passo

Publicar somente mediante autorizacao. Depois de atualizar backend-dev,
homologar nova solicitacao com varios boletos/anexos: historico completo,
nenhum balao de arquivo inicial para outro usuario autorizado. Adicionar
arquivo posterior e conferir balao/contagem/prioridade; repetir com medicao
nova em contrato existente e usuario fora do escopo (403). Nao executar
limpeza retroativa no banco sem recorte/consulta e autorizacao especifica.
