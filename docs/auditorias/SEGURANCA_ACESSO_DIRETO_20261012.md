# Seguranca de acesso direto por ID - 12/10/2026

## Escopo e limite

Autorizado pelo usuario: corrigir a solicitacao excluida que ainda abre por URL
e revisar seguranca por etapas, preservando visibilidade e estabilidade.
Base: refactor/frontend, 3a75c3f0. Sem acesso a banco/S3/EC2, migrations,
commit/push, deploy ou alteracao de main. Fixtures usam dados ficticios.
Nao ha certificacao de seguranca de todo o sistema ou do ambiente implantado.

## Etapa 1 - exclusao operacional corrigida

Exclusao logica e `cancelada=true`; status de fluxo CANCELADA e arquivamento
por usuario sao conceitos diferentes, sem nova regra para estes ultimos.

- Middleware apos auth/MFA/controles existentes e antes dos handlers:
  `/solicitacoes/:id`, recargas, adiantamentos e compras por ID da principal.
  Recurso inexistente/excluido responde 404, tambem para SUPERADMIN.
  IDs numericos malformados respondem 400 antes de coercao SQL; segmentos
  estaticos continuam nas rotas e validadores anteriores.
- DELETE da principal repetido conserva ACL, lock, transacao e idempotencia.
  DELETE de comentario/anexo nao usa essa excecao. Montagem `/api` testada.
- Verificador compartilhado e contexto de interacao rejeitam a exclusao antes
  de qualquer leitura global, mencao, escopo de obra ou bypass de superadmin.
- Assertivas de leitura/escrita incluem a flag no SELECT; objetos parciais
  releem disponibilidade, evitando confundir atributo ausente com registro ativo.
- Retornos por ID proprio revalidam a principal sob lock antes de alterar.
  Envio interno e arquivamento em massa recusam registros excluidos.
- Upload/remocao de anexo rejeitam excluidas, inclusive com token inicial.
- Consulta financeira de arquivos preservada SOMENTE pela regra preexistente
  de permissao da fila + titulo concretamente vinculado. Nao concede escrita
  na solicitacao. Titulos, saldos, baixas, documentos e LogExclusao preservados.
  Nao se criou um novo endpoint generico para consultar excluidas.
- Nenhum cache global de disponibilidade nem novo endpoint de permissao.
  A guarda de rota faz um SELECT de chave primaria (id/cancelada); service usa
  objeto carregado ou releitura minima se a flag foi omitida. Custo MySQL real
  ainda deve ser medido em DEV, sem confundir benchmark UI com banco real.

## Etapa 2 - identidade e usuarios revisados/testados

Auth real em VM com JWT real e modelos isolados: ID/role de URL, query, body
e perfil no token nao substituem req.user carregado do banco pelo ID assinado.
Adulteracao, usuario inexistente/inativo e versao revogada retornam 401.
DEV switch exige runtime explicito, ator SUPERADMIN ativo e versao valida;
sessao efetiva continua a do alvo. Flag/whitelist de ambiente real nao auditadas.

Gestao de usuarios: middleware real, canManageUsers e controller show testados.
Sem permissao, nenhum lookup do alvo; administrador autorizado nao gerencia
SUPERADMIN. Atribuir SUPERADMIN exige SUPERADMIN. Consulta nao emite sessao
nem devolve senha/segredos MFA/token_version. Demais perfis continuam seguindo
a permissao de gestao existente; nao foi redesenhada essa regra.

## Etapa 3 - escopo de recursos iniciada

66 casos positivos/negativos nos middlewares reais de Compras, Contratos e
Pedidos: ID de obra fora do escopo negado, inexistente 404, query/body nao
substituem obra do recurso, leitura ampla de contrato nao libera escrita.
Regressoes existentes de Financeiro (73 rotas), Contratos, RH/DP, arquivos,
recargas/medicoes e adiantamentos executadas. Isto NAO testa todos os handlers
de fechamento, exclusao, pagamentos, documentos ou seus filhos.

## Inventario para as etapas seguintes

`backend/scripts/mapearRotasSeguranca.js` le declaracoes por AST, sem executar
o servidor. Usa @babel/parser instalado no frontend, apenas QA local.
Saida completa JSON inclui arquivo/linha/metodo/path/cadeia explicita/mounts.
Todos os registros sao PENDENTE_DE_VERIFICACAO_DO_HANDLER_E_ESCOPO por padrao.
Inventario nao mede URLs efetivas, heranca de ACL ou seguranca de um handler.

Contagem atual: 1.126 declaracoes, 516 parametrizadas, 52 mounts, zero caminhos
dinamicos nao resolvidos nas chamadas router/app identificadas.

| Arquivo/grupo | Declaracoes | Parametrizadas |
| --- | ---: | ---: |
| routes.js principal | 928 | 443 |
| Custos/Recebiveis | 47 | 33 |
| SST | 65 | 19 |
| Fiscal | 38 | 18 |
| Governanca | 17 | 0 |
| Banking | 9 | 2 |
| Core Gateway | 15 | 1 |
| Experience Sync/Lead | 4 | 0 |
| app.js | 3 | 0 |

### Arquivos locais legados: protecao na EC2 informada pelo usuario

`app.js` monta `/uploads` com express.static fora do router JWT. O middleware
atual bloqueia anexos removidos, mas nao autentica a leitura dos arquivos ativos.
Portanto, caminho conhecido de arquivo local ativo pode ser servido sem JWT,
se houver arquivo no ambiente. Nao foi verificada a existencia desses arquivos
em DEV/producao. Isso NAO permite assumir usuario, mas e uma superficie de dados
no codigo local quando servido sem outra protecao.

O usuario informou nesta etapa que o caminho legado `/uploads` JA FOI CORRIGIDO
na EC2. Nao tratar a exposicao como confirmada no ambiente implantado. Ainda
falta identificar se a protecao esta no Nginx ou backend e reconciliar a regra
com o repositorio/deploy para nao perde-la em uma atualizacao. Nao se tentou
contornar a protecao nem acessar arquivos reais; o achado de codigo local nao
comprova exposicao atual da EC2.

Evidencia posterior fornecida pelo usuario: filtro nginx -T por /uploads sem
linhas e app.js de ambos os processos com express.static e apenas bloqueio de
anexo removido/headers, sem auth nessa montagem. Os trechos nao confirmam a
protecao lembrada. Ainda nao ha inventario de arquivos ativos ou teste de
acesso efetivo; protecoes genericas anteriores nao foram verificadas. Tratar
como pendencia de confirmacao, nao como exposicao comprovada do ambiente.

Nao fechar cegamente o caminho legado: PDFs, boletos, links de fornecedores e
previews podem depender dele. Etapa 4: inventariar arquivos/referencias locais
somente leitura no ambiente, classificar documentos privados versus assets
publicos e tokens de fornecedor; conferir a correcao ja implantada e manter
leitura privada autorizada por objeto/presign sem quebrar vinculos. Nenhuma
politica publica foi alterada aqui.
URLs S3 ja emitidas permanecem validas ate expirar; backend nao apaga objetos.

### Ordem de continuidade

1. Homologar etapa 1 em DEV: excluir registro ficticio, GET/PATCH/POST negativos,
   repetir DELETE, validar usuario comum/SUPERADMIN/impersonacao e financeiro.
2. Etapa 4: reconciliar a protecao de uploads ja informada na EC2 com o codigo
   e deploy; fechar inventario de uploads legados e matriz de presign, RH,
   conversas, contratos e comprovantes. Nao relaxar ACL para resolver previews.
3. Completar etapa 3: Compras/Pedidos/Cotacoes e filhos, inclusive tokens publicos
   ligados a principal excluida; separar consulta historica de mutacao.
4. Etapa 5: titulos/fila/baixas/autorizacoes, propriedade de filhos, IDs no body,
   atomicidade, concorrencia com exclusao, revogacao e replay.
5. Etapa 6: RH/DP, Custos, Fiscal, SST, Comercial/CRM, comunicacao/configuracoes.
6. Etapa 7: APIs publicas/Gateway/Experience/webhooks, limites, segredos e dados
   expostos. Gates locais existem; configuracao implantada permanece pendente.

Para cada lote: confirmar regra vigente; testes positivos + negativos + IDs de
outro recurso; preservar identidade/visibilidade de ativos; teste de replay,
revisao de diff e homologacao em DEV antes de eventual promocao autorizada.

## Validacoes e comandos locais

- `node backend/scripts/validarSegurancaAcessoDireto.js`: 2.304 comparacoes de
  visibilidade, 47 rotas HTTP com guarda real, DELETE real -> GET negado,
  filhos/retorno/anexos, identidade e 66 casos de escopo. Sem banco/S3.
- `node frontend/scripts/validarWorkspacePiloto.mjs`: UI real com transporte
  interceptado; negativas 403/404 eliminam dados/modais antigos. Suite completa
  cobre rascunhos, filtros, origem/abas, compras, comparativo e exclusao.
- Scripts existentes de retorno, superadmin/exclusao, hardening, anexos,
  pedidos, contrato, RH/DP, fila, adiantamento, medicao/recarga e interacoes.
- Hardening: expectativa antiga do link Cadastros foi substituida por verificacao
  da rota e guarda granular existentes; nenhuma permissao do runtime alterada.
- `node backend/scripts/mapearRotasSeguranca.js --resumo` ou sem argumento
  para inventario completo; somente leitura de codigo local.

Limite: testes isolados nao representam homologacao do banco, Nginx, S3 ou
concorrencia real de todos os endpoints. Estado de seguranca global permanece
EM_REVISAO, nunca declarar "100% seguro" a partir deste lote.
