# Promocao MAIN RH, centros de custo e pedidos - 2026-10-21

## Autorizacao e bases

Usuario homologou o RH no DEV: erro400 eliminado e colaborador inativo visivel
ate conclusao DP. Pediu promocao e acrescentou todos os commits pendentes.
Confirmou backup recente conferido no Drive cifrado e timer ativo para esta
promocao. Agente unico; nenhuma operacao EC2/DB/S3/Redis/financeira real.

Base main80df65347b2a9d4a491f9516c087e0767dd2ecb1, DEV congelado em
a00a15f6fdd573fcff18e87c3d1e7d411dcb181a. Branch de integracao
codex/promocao-rh-pedidos-centros-main-20261021 criada da main.

Tres commits incorporados com historico completo:

- 2d161b85: demissoes novas e RH-000235 com conclusao DP, colaboracao/anexos,
  ateste e inativo na lista operacional ate concluir; centros ativos como
  destinos da distribuicao gerencial, sem gerar custo real nos destinos.
- ba4a41b2: loaders de pedidos com colecoes separadas, reabertura transacional,
  acao Fechar com o fornecedor, recibo202/reconciliacao GET e logs seguros.
- a00a15f6: whitelist/validacao0/1 da query incluir_demissoes_pendentes,
  preservada pelo middleware ate controller/servico, eliminando400.

Nao se afirmou homologacao manual dos centros/pedidos pelo usuario nesta
promocao; foram autorizados expressamente como pendentes e validados em testes
isolados. Demais riscos/cenarios constam nos handoffs originais dos pacotes.

## Integracao e preservacao

Sem conflitos runtime. Seis conflitos documentais resolvidos mantendo main e
DEV. Runtime backend/src e frontend/src final identico ao DEV congelado.
Scripts/documentos exclusivos da main e historicos anteriores preservados.
Package.json adiciona somente tres comandos de QA em cada runtime; dependencias,
lockfiles e migrations identicos a main anterior. Nao altera calculos financeiros,
permissoes/vinculos/configuracoes, .env, flags, memoria ou dados na promocao.
Arquivos privados outputs fora do commit; main anterior continua ancestral.

Mantidos: fluxo GEO/financeiro/entrega na reabertura e novo fechamento;
APROVADA/data/autor na demissao, com conclusao em metadados e historico separado;
apenas a excecao legada RH-000235, sem reativar ou incluir demitidos antigos;
distribuicao gerencial nao amplia adiantamento nem altera custos reais.

## Roteiro EC2 exclusivo PROD

ops/deploy/atualizar-producao-rh-pedidos-centros-20261021.sh recebe SHA completo,
exige backup/timer confirmados e timer ativo. Caminho/main/clean/lock,
PM2 backend-solicitacoes online8000/sem watch/migration automatica, SQLite Node,
alvo publicado main e ff-only desde main80df6534. Requer que a atualizacao
anterior esteja instalada; se a guarda de ancestralidade falhar, parar e
informar a saida, nao ignorar a verificacao nem usar reset.

Pacotes comparados semanticamente antes do merge; migrations/lockfiles
intactos e allowlist restrita aos14 arquivos backend/nove frontend do pacote.
Verificadores JA instalados verificarFinanceiroProducao20261019 e
verificarReenvioAutorizacaoProducao --verificar antes/depois do merge e
apos restart: identidade UUID/TLS/schema/sessao12h/flags/push em leitura.

Depois do merge, sintaxe e testes com modelos/controller isolados antes do
restart. Sem testes browser/build na EC2 e sem npm install/ci, DDL/backfill,
conclusao RH ou escrita financeira real. Hash .env conferido tres vezes,
somente backend-solicitacoes reiniciado, health8000, pos-check em leitura.
Sem update-env, reiniciar DEV, heap ou swap. Timer conferido tambem ao reiniciar.

## Validacao local e limites

Backend: RH query real pelo middleware/controller/servico, opt-in/invalidos/
escopo403/vazio/DP, novas e RH-000235, colaboracao/ateste/checklist/conclusao,
replay/rollback; regressoes admissao/contatos/salario/documentos/movimentacoes/
pagamento/fila. Distribuicao centros/obras/ACL/configuracao/TODAS/centavos/
persistencia/rollback/relatorio, adiantamento sem ampliacao. Pedidos reabrir/
fechar/GEO/entrega/ACL/historico/replay/rollback/lockUPDATE, leitura202 e
commit incerto, privacidade/falha do logger e SQL MySQL gerado offline sem
produto cartesiano. Regressao passkey, cartao/PIX/desconto, permutas e periodo.

UI real com API interceptada: demissao DP/obra/ateste/anexos/comentarios/
conclusao e lista inativa ate releitura; Administrativo origem e centros
destinos/percentual/valor/TODAS/relatorio; pedido26 itens reabrir/fechar,
duplo clique, entrega400/retry,202/rede perdida soGET, rascunhos/ACL/GEO.
Resolucao390/1366. Build631 modulos em10,99s, avisos preexistentes de
Browserslist/chunk grande. Nenhum delta no catalogo de navegacao gerado.

Guardas PROD com negativas de backup/timer/lock/flag/pacotes/teste ausentes e
processo errado, sem executar PM2/EC2. Guardas DEV herdadas preservadas.
Sintaxe Node/Bash, documentacao609 arquivos/19 canonicos e diff aprovados.
Bundle privado outputs/promocao-rh-pedidos-centros-main-20261021/main-80df6534.bundle
verificado com historico completo da main anterior. Nao substitui backup MySQL.
Limites preexistentes de testes gerais descritos no handoff de pedidos
(menu RH) e RH; nao afirmar suite inteira verde ou fim de todos os OOM.

## Operacao e recuperacao

Atualizar backend/health primeiro e conferir frontend main na Vercel do SHA
entregue. Nao executar roteiro DEV em producao ou concluir RH/reabrir pedido
apenas para smoke em dados reais. Conferir consultas/lista/acoes por permissao;
proxima operacao legitima permite conferir historico e anexos. Concluir DP
apenas quando o processo estiver finalizado de fato.

Logs: pm2 logs backend-solicitacoes --lines 150 --nostream; localizar
[PEDIDO_OPERACAO] e correlacionar operacao_id/pedido_id/PID/etapa/causa.
Nao compartilhar logs brutos com dados pessoais/credenciais. OOM fatal pode
nao emitir FIM e ainda exige correlacao; aumento de memoria continua separado.

Se falhar uma guarda/teste/health, parar e enviar saida sem segredos; nao
repetir mutacoes nem estornar/recriar registros. Sem restauracao automatica de
DB, migration down ou reset. Reversao de codigo para base80df precisa ser
coordenada com frontend/backend e estado de pedidos/demissoes ja concluido.
Metadados/historico nao devem ser apagados. EC2 executada so pelo operador.
