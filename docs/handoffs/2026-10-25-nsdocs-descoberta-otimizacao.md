# Agilizar descoberta NSDOCS sem perda/duplicidade

## Pedido e limites

Usuario pediu agilizar descoberta preservando46NF-e/XMLs, sem duplicar e com
automaticoOFF. Em paralelo enviou log da rodada681672 encerrada codigo0:
150NF-e identificadas,33janelas pendentes/12enumeradas,37das46originais ainda
nao reencontradas,43documentos nao suportados, zeroXML/RDS/S3writes.
Portanto9das46ja constam no novo levantamento;150nao sao150novas no banco.

## Investigacao realizada

Codigo divide toda janela cheia por metade e processa fila por insercao,
reconsultando niveis de datas ate obter menos100resultados. Isso custa chamadas
intermediarias e demora a fechar recortes menores. Espera60s e guarda local,
sem limite de frequencia confirmado na documentacao publica consultada.
Nao reduzir espera, paralelizar, reusar offset com ordenacao nao unica nem
considerar amostra/pagina cheia como cobertura confirmada.

Alternativa local em avaliacao: divisao guiada pela distribuicao de datas com
confirmacao por GET de cada recorte e prioridade de menores. Nao implementada
nem testada ainda; nao afirmar ganho ou modificar plano real por suposicao.

Log mostrou43outros modelos ocupando paginas. API documenta filtro por campo
modelo em https://developer.nsdocs.com.br/, exemplo modelo=nfse. Parametro
modelo=nfe requer confirmacao pratica antes de incorporar ao contrato/runtime.
Nenhuma chamada real executada pelo agente; somente pagina publica de docs.

## Sonda pronta local, sem commit/push ou mudanca de runtime

- ops/deploy/sondar-nsdocs-modelo-complemento-prod-20261025.cjs
- respectivo .test.cjs e reserva em docs/workspace/OWNERSHIP_ATIVO.md.

Um GET da primeira janela ja enumerada que contenha NF-e e outros modelos e
raw_count<100. Usa mesmo CNPJ/status/datas/quantidade100/offset0 e acrescenta
modelo=nfe. Compara conjunto de chaves e identidade das NF-e com a janela salva;
nao imprime dados, nomes, numeros ou chaves. Confirmacao exige pagina completa,
sem duplicatas/outros modelos, nenhuma NF-e ausente/nova/identidade alterada.
Se nova nota entrou nesse periodo desde a consulta anterior, confirmacao falsa
impede presumir conjunto estavel; analisar saida, nao sobrescrever o plano.

Runtime PROD/Node/empresa/TLS/UUID e controles existentes conferidos. Locks
plano/query e cooldown respeitados. Plano relido e comparado antes/depois.
Unicas escritas: locks temporarios e2eventos no journal privado. Sem XML,
escrita RDS/S3, migration, restart ou alteracao de plano, ambiente ou credencial.

10 testes Node com fixtures/transportes simulados aprovados: conjunto exato,
identidade/omissao/registro novo, filtro ignorado, empresa/status divergente,
segredo refletido, corpo grande, duplicatas/pagina cheia, confirmacao/ID,
locks/cooldown, progresso preservado, rede e concorrencia. Sem chamadas reais.

## Proximo passo exato

Usuario sair do tail encerrado comCtrl+C, conferir hash e executar a sonda por
SSH/stdin com --plano-id c456781c-4393-468b-858f-dbf220d8f215 e
--confirmar-consulta-real, aguardando60s antes da chamada. Enviar JSON sanitizado.
Nao iniciar outra rodada enquanto validamos a otimizacao. Nenhum plano novo,
captura deXML, remocao de locks ou mudanca de producao/DEV pelo agente.
Depois da evidencia, implementar/testar ganho real e compatibilidade com
janelas ja fechadas; manter150metadados,46canonicas/XMLs e controles de cobertura.

## Condicao nao satisfeita e proxima sonda

Usuario condicionou implementar/testar otimizacao a filtro confirmado e enviou
resultado da sonda:06/08/2026a21/08/2026, Pendente, modelo=nfe,0retornadas,
70NF-e esperadas/ausentes, model_filter_confirmed=false,1GET,zeroXML/RDS/S3writes,
plan_changed=false. Nao implementamos filtro no runtime, nao ativamos automatico.
Zero aqui nao significa que as notas foram apagadas; pode ser valor de filtro
ou mudanca na listagem. Os150metadados continuam privados no mesmo plano.

Nova sonda local, sem commit/push:
sondar-nsdocs-modelo-comparado-prod-20261025.cjs e respectivo .test.cjs.
Exige --confirmar-duas-consultas-reais eIDexato. Primeiro controle SEMfiltro na
mesma janela, comparando70NF-e/chaves/identidade e cobertura. Se nao corresponder,
para com1GET, nao tenta corrigir nem sobrescreve checkpoint. Se conferir,
aguarda60s e consulta literalNF-e. Somente conjunto exato e sem outros modelos
confirma. Ate2GETs,2eventos porGET, locks temporarios, nenhuma mudanca de plano,
banco/S3/XML/env/processos. SIGINT/SIGTERM/SIGHUP abortam de forma controlada.

11testes aprovados com transporte ficticio: controle/filtro corretos, zero,
missing/extra/identidade diferente, filtro ignorado, segredo/empresa/pagina cheia,
confirmacao especifica, locks/cooldown, cancelamento, rede/concorrencia e handlers.
Nenhuma chamada real pelo agente. Usuario executar porSSH/stdin e enviar JSON.

Pedido de pensar em automatico tratado como planejamento, nao ativacao. Plano
em docs/fiscal/PLANO_NSDOCS_INCREMENTAL_PARALELO_20261025.md. Guardas manuais
atuais exigemNSDOCS_V2_ENABLED=false; ligar somente flag bloquearia historico.
Projeto futuro precisa coexistencia explicita, checkpoint por recebimento com
sobreposicao, fila/locks e dedup compartilhados, piloto e autorizacao separados.
Nenhum worker/agenda/flag/captura real foi criado ou ligado. DEV intacto.

## Filtro confirmado e implementacao local concluida

Usuario enviou sonda comparada: controle sem filtro99=70NF-e+29outros;
literalNF-e retornou exatamente70, sem omissoes/novas/chaves ou identidade
divergente/duplicatas. model_filter_confirmed=true,2GET,4eventos, plano intacto,
zeroXML/RDS/S3writes. Condicao para implementar/testar satisfeita.

Escopo final de runtime: somente manual/complement/discovery.js e plan.js.
Filtro literalNF-e e acrescentado internamente ao descritor do complemento;
contract.js permaneceu identico ao HEAD, sem ampliar argumentos ou alterar
hashes de idempotencia de outras CLIs. Discovery escolhe menor intervalo pendente,
mantendo ordem nos empates e sem tocar em janelas prontas. Regra binaria de
divisao/confirmacao porGET foi mantida; nao houve inferencia de cobertura a
partir de amostras, datas retornadas ou densidade estimada.

Resposta com modelo diferente deNF-e interrompe antes de salvar progresso;
nao ha fallback silencioso. Janelas efetivamente consultadas recebem query_model
NF-e; antigas nao recebem marcador nem sao reescritas. Validador suporta janelas
legadas mistas e nega atribuir filtroNF-e a uma janela que contem outros modelos.
Os43outros ja observados ficam preservados, assim como150NF-e e IDs/checkpoints.
Nao usar valor nfe que retornouzero. Espera60s, max10, quantidade100/offset0,
statusPendente+Importado, scopeCNPJ/CPF, locks e dia cheio/revisao mantidos.

Arquivos de QA: novo backend/scripts/validarNsdocsDescobertaOtimizada.js e mock
de provedor em validarNsdocsComplemento.js, que agora respeita filtroNF-e.
120testes aprovados, incluindo15novos; fixtures/SQLite/transporte simulado.
Benchmark reproduz estado150NF-e/43outros/37originais ausentes: mesmo conjunto
final217NF-e com4GETs no codigo anterior versus2GETs no novo. Ganho50% apenas
nesse cenario ficticio, nao promessa de tempo/quantidade em producao.
Capture de teste conserva46cadastros/XMLs/historico, reutiliza46 e grava171novos,
sem repetir no replay. Testes cobrem falha/ACKperdido, origem ausente,
modelo ignorado, ordem/duplicidade/status, manifesto legado, datas recebimento,
paginas/dia cheio, codigoCPF, limites/cancelamento/locks/cooldown e baixas parciais.

Evidencia local: outputs/qa-nsdocs-otimizacao-final-20261025.txt. Nenhuma chamada
real ou execucao de codigo novo na EC2/DEV pelo agente. DEV checkout/branch nao
foram editados. Sem frontend, schema/deps, env, PM2/Node, cron ou automatico.
Alteracoes locais ainda sem commit/push. A publicacao/aplicador deve ser etapa
posterior, preservar codigo/plano com backup e recusar captura concorrente;
nao aplicar so um dos dois arquivos, pois discovery depende de nextPending.
Continuar MESMO ID c456781c-4393-468b-858f-dbf220d8f215, sem --preparar-plano.
Antes da eventual aplicacao aguardar fim de rodada ativa; depois1GETpiloto,
conferir preservacao e so entao continuar lotes. XMLs so apos cobertura completa,
sem revisao e zero originais ausentes, respeitando aprovacao da etapa.


## Publicacao main autorizada e pacote de operacao preparado

Usuario autorizou commit/push somente main e comandos EC2/retomada. Nao editar
nem publicar DEV. Novos operador, manifesto, launcher e README otimizacao-prod.
Operador valida minimo150metadados,46chavesorigem/IDs e automaticoOFF em PM2/env;
guarda plano privado para auditoria e hashes de checkpoint/manifesto/journal/
credencial durante update. Nenhuma escrita em RDS/S3 ou chamada real pelo agente.
Retorno somentecodigo protege progresso posterior. Norestart, nomigration/install.
13testes de operador/launcher passaram, alem de120fiscais e21das sondas.
Proximo: commit/push FF para main e conferir remotoDEV inalterado. Publicar SHA,
hashes dos scripts e comandos do README. Usuario aplica preparando antes, faz
1GETpiloto, depois launcher novo --commit SHA (nohup60s/ate10GET). Codigo nao
foi executado na EC2. CargaXML posterior depende enumeracao completa e cobertura.
