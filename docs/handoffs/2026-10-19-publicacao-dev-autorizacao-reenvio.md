# Publicacao DEV: notificacao e reenvio

## Autoridade e bases

Usuario autorizou commit/push do pacote local em refactor/frontend, comandos
EC2 DEV e testes de notificacoes/reenvio. Agente unico, sem EC2/SQL reais.
Base DEV db1d2253; main72e628e8 congelada e intocada nesta publicacao. Roteiro
anterior de producao ja concluido conforme log entregue pelo operador.
Nao incluir outputs/auditorias privadas ou trabalho de outro agente no commit.

## Publicacao e deploy

Pacote funcional em 2026-10-19-autorizacao-alerta-reenvio.md. Novo roteiro
atualizar-dev-autorizacao-reenvio-20261019.sh recebe SHA completo. Exige DEV
exato, branch refactor/frontend, tracked limpos, flock, PM2/porta8001/watchfalse;
usa conferirSessao antigo ANTES do merge (sem dependencia nova antecipada).
Exige base db1 no checkout, alvo remoto descendente de HEAD e migrations sem
delta. Fast-forward, hash.env, npm ci omitdev, schema/12h/flags, testes isolados
e MySQL somente leitura antes do restart exclusivo backend-dev, sem update-env.
Health8001 e nova conferencia depois, com hash.env preservado. Qualquer migration
pendente interrompe sem aplicar; nao executar migrate nem marcar ledger.

Novo verificarReenvioAutorizacaoDev: modo verificar nao envia push nem escreve;
guardas DEV caminho/PM2/env/host/UUID/schema e transacao READ ONLY/ROLLBACK.
Confere tabelas, evento configuravel, VAPID como booleano, contagens de candidatos
nominais/passkeys/push e ate5 IDs de lotes com autorizacao pendente de envio.
Nao exibe endpoint/chaves/nomes/valores financeiros. Contagens nao provam ACL
ou entrega; login real e necessario. Nao altera PILOT/12h/flags/.env.

Teste opcional explicito --testar-push USUARIO_ID LOTE_ID: mesmas guardas DEV,
exige autor nominal ativo e usuario ativo, permissao de decidir e lote ainda
com AUTORIZADO; evento/VAPID/mode prontos. Envia para assinaturas daquele usuario.
Push real abre conferencia sem POST. Nao cria decisao, notificacao interna falsa,
baixa, fila ou evento de autoria ficticia. Assinaturas expiradas podem ser
inativadas pelo servico normal; esse modo nao e somente leitura. Nunca executado
pelo agente nem automaticamente no deploy.

## Validacoes locais

Backend/servicos reais em memoria: analise, falha apos assinatura commitada,
dedup/concorrencia, alertas/rollback/configuracao, granular/nominal/PAUSED/impersonacao,
reenvio individual/replay, snapshot e passkey preservados. Push/SW em VM aprovado.
Validador DEV cobre SQL READ ONLY/rollback, UUID producao negado, schema incompleto,
evento/VAPID/nominal/lote ausente, ids invalidos, caminho/porta/host/producao/flag
de DDL negados, bootstrap antes do merge, hash.env e processo exclusivo.
Reenvio DOM real e build repetidos; 320/390/1366, deep link fora da pagina,
GET sem POST, clique duplo e Escape/navegacao bloqueados no POST. Compras em
centros e permutas operacionais tambem repetidas com sucesso, sem banco/rede.
Sintaxe Node/Bash, test:docs (582 Markdown/19 canonicos), diff-check e revisao
do staging aprovados. Ownership liberado para publicacao exclusiva autorizada.

## Homologacao humana

1. Acessar dominio DEV, atualizar/reabrir PWA e entrar com conta real do
   autorizador (nao Testar usuario). Conferir passkey ativa e Ativar avisos.
2. Verificador lista somente IDs de lotes pendentes e contagens. Se houver um
   lote autorizado de teste, conferir titulo/obra/valores e testar push com
   IDs DEV corretos. Aviso deve abrir conferencia sem efetuar envio.
3. Reenviar pelo detalhe: so aquele item deve mudar para Na fila. Demais itens
   do lote nao sao autorizados ou enviados. Nao exige nova passkey. Atualizar
   antes de repetir; nao pode duplicar fila. Conferir tambem lista e visao por lote.
4. Visualizador sem granular/nominal nao deve ver/usar reenvio; PAUSED bloqueia.
   Cancelar passkey nao e falha de fila, portanto nao deve gerar alerta de envio.
5. Falha de fila apos commit deve manter AUTORIZADO e gerar notificacao interna,
   inclusive ao proprio dono; repeticao nao spamma. Caso completo e simulado
   pelas suites isoladas, sem fabricar falha financeira no banco. Em teste real
   usar apenas caso DEV conhecido, nunca alterar producao para provocar erro.

## Orientacao: compras e permutas ja publicadas

Conferidos ancestrais 39f368be e 4ffdb9ae na main72 e fontes publicadas:
compra normal/direta em Centros de Custo, permutas e multiplas fontes ja estao
no deploy produtivo anterior. Nao sao novidades desta publicacao de reenvio.

Compras: acessar telas proprias Solicitacao de Compra/Compra Direta e selecionar
o Centro de Custo. Nao precisa liberar o campo Tipo nem marcar compra em Tipos
por destino para centros automaticos. Nova Solicitacao conserva tipo fixo.
Tipos devem estar ativos; permissoes de criar e acesso ao destino continuam
obrigatorios. Nao ha configuracao nova nem permissao automatica.

Permutas: liberar granulares cadastrar/usar/relatorio juntamente com acessos
financeiros/cadastros/baixa existentes. Cadastrar forma tipo PERMUTA se ainda
nao existir; nao duplicar antigos. Integral: forma PERMUTA, empresa e valor,
sem conta ficticia. Mista na fila: PIX/transferencia/boleto/dinheiro, conta,
Valor pago TOTAL e Parte em permuta (ex1000total,300permuta,700monetario),
referencia do acordo para pesquisa. Multiplas fontes tambem permite informar
formas e valores; contas pagar/receber selecionam titulo e usam Baixa com
multiplas fontes. Credito segue fluxo proprio de fatura, nao mistura silenciosa.
Relatorio Financeiro>Permutas separa pagamentos, recebimentos e estornos; datas
por baixa. Permutas antigas preservadas. Etapa atual nao registra limite/saldo
inicial de acordo, nao libera consumo com base em recebimento nem bloqueia por
saldo disponivel. Empresa controla teto negociado externamente; nao relancar
historico para criar um saldo ficticio.
