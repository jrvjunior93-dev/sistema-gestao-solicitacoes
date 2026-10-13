# Ticket por conta bancaria cadastrada - 2026-10-13

## Pedido e escopo

Adicionar Conta na forma de pagamento do lote de ticket, carregando a conta
cadastrada. Interpretacao anunciada ao usuario: conta de recebimento de cada
colaborador, nao a conta pagadora da empresa. Implementacao local sobre
a9b0c908, sem migration, deploy, EC2 ou banco real nesta tarefa.

## Mapa de dependencias e alteracoes

- RhDpColaboradores / RhTicketPagamentoCampos: nova opcao TRANSFERENCIA,
  rotulada Conta bancaria por colaborador. Carrega banco, agencia, conta com
  digito e tipo; mostra titular/documento. Revisao obrigatoria antes do envio.
  Edicao ou troca de forma invalida a conferencia. Edicoes valem somente para
  este lote; dados bancarios do cadastro nao sao sobrescritos.
- Prioridade integral de pagamento.banco/agencia/conta/tipo_conta. Somente
  quando nenhum desses campos existe, usa banco/agencia/conta/conta_tipo do
  colaborador e seu proprio nome/CPF. Cadastro parcial nunca combina campos de
  outra conta, nem usa titular de um Pix de terceiro na conta do colaborador.
- rhDp.js / RhTicketController: multipart pagamentos_conta e contas_revisadas.
  JSON malformado e lista nao-array rejeitados; trava de obra preservada.
- rhTicketService: valida todos os colaboradores, campos permitidos, revisao,
  contas completas e limites sem truncar digitos. Usa a forma financeira ativa
  de tipo TRANSFERENCIA. Boleto continua obrigatorio somente na opcao BOLETO.
- Mesmo caminho individual do Pix: titulo em PREVISAO por colaborador, lotacao,
  empresa, valores em centavos e liberacao GEO preservados. Beneficiario bancario
  isolado via helper financeiro existente; snapshot no favorecido da solicitacao,
  observacoes do titulo e metadata do historico. Item do lote aponta ao seu titulo.
- Estrutura existente suficiente; nenhuma nova migration, seed ou backfill.
  Hashes Boleto/Pix continuam byte-identicos para replays anteriores. Transferencia
  inclui contas normalizadas no hash. Mutex, transacao, locks, chave de idempotencia
  e restricao de ticket duplicado por competencia permanecem.
- POST /rh/tickets permanece protegido por requireEnabledModule(FINANCEIRO),
  allowRhDpTicketManage, limitadores e trava de obra. Escopo RH/DP por obra,
  titular do replay e permissoes de consulta/geracao nao alterados.
- Nenhuma nova chamada ao carregar o modal; usa dados da listagem existente.
  Busca das contas por Map evita busca quadratica na renderizacao da revisao.
- Skill frontend-design aplicada aos controles rotulados e layout responsivo
  compacto existente, sem redesenhar o shell ou introduzir dependencias.

## Arquivos

- frontend/src/components/rh/RhTicketPagamentoCampos.jsx
- frontend/src/pages/RhDpColaboradores.jsx
- frontend/src/services/rhDp.js
- backend/src/controllers/RhTicketController.js
- backend/src/services/rhTicketService.js
- backend/scripts/validarRhTicketPix.js
- frontend/scripts/validarRhTicketPix.mjs
- docs/workspace/OWNERSHIP_ATIVO.md e este handoff

## Validacoes aprovadas

- node backend/scripts/validarRhTicketPix.js: Boleto/Pix/Conta, helper bancario
  real isolado, limites/tipos/contas incompletas, campos e colaboradores estranhos,
  snapshots, centavos, lotacao, GEO, cancelamento, ACL, replay/hash legado e rollback.
- node frontend/scripts/validarRhTicketPix.mjs: pagina/componentes reais com APIs
  isoladas; autoload e fallback integral, revisao obrigatoria, edicao e mudanca de
  forma, conta incompleta, cadastro intacto, mutex, falha/retry, multipart,
  permissao negativa e desktop 1366 / celular 390. Formatador real da fila confirma
  exibicao de banco/agencia/conta, nao Pix.
- validarRhDpRegrasPagamento.js e validarEscopoRhDpUsuarioObra.js: aprovados com
  NODE_ENV=test e getConnection bloqueado explicitamente contra banco real.
- npm run build no frontend: aprovado. Avisos existentes de Browserslist
  desatualizado e chunk principal acima de 500 kB; nenhuma dependencia atualizada.
- node --check nos arquivos JS do backend; git diff --check: aprovados.
- Screenshots outputs/rh-ticket/ticket-conta-1366.png e ticket-conta-390.png
  inspecionados. outputs/ permanece fora do commit.

## Limites e proximo passo

Banco financeiro suporta codigo de ate 10 caracteres, agencia ate 20, conta
ate 30, tipos CORRENTE/POUPANCA/SALARIO. Dados cadastrados sao carregados sem
corte; se o banco estiver por nome longo, o usuario precisa conferir/informar
o codigo bancario. Conta/agencia fora dos limites sao rejeitadas, nunca truncadas.

Sem validacao em MySQL real ou envio/pagamento bancario: testes locais usam
fronteiras simuladas e impedem conexoes reais. Usuario autorizou commit e push
na refactor/frontend e comandos de atualizacao somente para EC2 dev.
Proximo passo apos publicar: validar em dev um lote por Conta, seguindo para conferencia GEO,
titulos individuais e fila antes de eventual promocao. Forma financeira
TRANSFERENCIA precisa estar ativa no ambiente (ja prevista no catalogo existente).

## Publicacao e atualizacao dev

Publicar somente os nove arquivos desta tarefa, mantendo outputs/ fora do Git
e sem promover main. Checkout de homologacao na EC2:
/home/ubuntu/sistema-gestao-solicitacoes-dev, branch refactor/frontend. Conferir
checkout limpo, HEAD remoto esperado e caminho do processo backend-dev antes de
pull fast-forward. Criar branch de backup local do HEAD anterior. Sem novas
dependencias; nao executar npm install, migrations ou seeds neste incremento.
Rodar validarRhTicketPix.js e npm run preflight:schema (somente leitura) antes
de reiniciar exclusivamente backend-dev --update-env. Conferir health local
8001 e api-dev.jrfluxy.com.br. Frontend depende do deploy Vercel da branch dev.

Testar Boleto ainda exigindo anexo; Pix com revisao; Conta carregada do cadastro,
revisao, titulos individuais em previsao e liberacao GEO. Conta incompleta deve
bloquear geracao, e alteracoes locais nao devem sobrescrever o cadastro.
