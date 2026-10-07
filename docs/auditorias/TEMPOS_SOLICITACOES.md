# Auditoria dos tempos de atendimento das solicitacoes

Preparada em 01/10/2026. Esta entrega monta a auditoria para execucao posterior;
nao apresenta resultados reais do banco. Nao foi acessada nenhuma EC2, de
desenvolvimento ou producao, e nenhum dado de conexao foi salvo.

O objetivo e entender onde as solicitacoes esperam, quando ocorre a primeira
resposta e como as interacoes se distribuem entre usuarios e setores, antes de
definir o contador da listagem. Tempo entre registros e uma aproximacao de
latencia operacional, nunca de horas efetivamente trabalhadas.

## Entrega e limites

- Executavel independente: [`auditarTemposSolicitacoes.js`](../../backend/scripts/auditarTemposSolicitacoes.js).
- Motor offline: [`engine.js`](../../backend/scripts/auditoriaTemposSolicitacoes/engine.js).
- Extracao de leitura: [`extracao.js`](../../backend/scripts/auditoriaTemposSolicitacoes/extracao.js).
- Testes sem banco: [`validarAuditoriaTemposSolicitacoes.js`](../../backend/scripts/validarAuditoriaTemposSolicitacoes.js).
- As 76 etapas/rotinas do documento fornecido estao catalogadas em
  [`tempos-solicitacoes-prazos-pop.json`](./tempos-solicitacoes-prazos-pop.json).

Nenhuma rota, tela, permissao, migration ou configuracao funcional foi alterada.
O pacote nao instala dependencias, nao inicia o servidor, nao carrega `.env`, nao
importa models e nao executa SSH. A nova coluna e os bloqueios do POP continuam
fora desta tarefa.

Entrega operacional para o usuario executar e retornar o arquivo:
[`EXTRAIR_TEMPOS_SOLICITACOES.md`](./EXTRAIR_TEMPOS_SOLICITACOES.md).
O modo `--somente-extrair` exporta `historico.json` e a proveniencia antes da
analise. O agente recebe esse arquivo e trabalha offline; nunca abre a conexao.

## Perguntas que os resultados respondem

1. Quanto tempo decorre entre a entrada no setor e a primeira visualizacao registrada?
2. Quanto tempo decorre ate a primeira alteracao bem-sucedida registrada no contexto do setor?
3. Qual usuario fez essa primeira interacao? Quem atribuiu e quem recebeu a responsabilidade?
4. Qual o intervalo entre duas acoes sucessivas do mesmo usuario na mesma passagem?
5. Qual o intervalo entre acoes de pessoas diferentes dentro do setor?
6. Quanto decorre entre a primeira e a ultima acao, e entre a ultima acao e o envio?
7. Quanto dura cada passagem fechada? Qual a idade observada das ainda abertas?
8. Quais solicitacoes retornam a setores anteriores, e quantas vezes?
9. Quais etapas/status sugerem espera por aprovacao ou liberacao sem mudanca de setor?
10. Quanto dos resultados possui evidencia suficiente e quanto depende de inferencia?

As rotas de referencia sao `OBRA > GEO > FINANCEIRO`, `OBRA > COMPRAS > FINANCEIRO`
e `OBRA > GEO > COMPRAS > FINANCEIRO`. Outros caminhos permanecem no relatorio:
nao se descartam Juridico, Diretoria, Administrativo, devolucoes ou contestacoes.
O setor historico do solicitante pode aparecer como origem do fluxo sem que isso
signifique uma passagem mensuravel pela Obra antes do registro no sistema.

## Fontes e significado

| Fonte | Uso na auditoria | Cuidados |
| --- | --- | --- |
| `solicitacoes` | Identificacao, abertura, tipo/obra e fotografia atual | `updatedAt` nao e data de entrada no setor nem encerramento |
| `historicos` | Encaminhamentos, comentarios, alteracoes, atribuicoes e status | `setor` muda de significado conforme a acao |
| `security_event_logs` | Somente `SOLICITACAO_CREATED / SUCCESS`, com destino inicial | Extrai apenas identificadores, horario e `metadata.area_responsavel`; nenhum acesso, IP, sessao ou credencial |
| `status_area` | Evidencia de setor inicial quando gravada junto da abertura | Nao e usada como trilha completa de movimentacao |
| `governanca_eventos_operacionais` | Leitura da pagina, operacoes HTTP, resultado e setor no instante | Trilha tem inicio de implantacao e retencao; falha de registro nao bloqueia o negocio |
| `anexos` | Horario, autor e setor de origem de uploads | Nenhum nome, URL ou conteudo do arquivo e extraido |
| `solicitacao_compra_logs` | Interacoes de compra vinculada a solicitacao principal | Sem lotacao historica, setor do ator fica desconhecido |
| `solicitacao_compras`, `pedido_compras` | Vinculo de recursos de Compras com a solicitacao principal | IDs numericamente iguais em tabelas diferentes nao significam o mesmo recurso |
| `titulos_financeiros`, `movimentos_financeiros` | Marcos de criacao/registro financeiro e vinculos | Usa `createdAt`, nunca data retroativa do pagamento como horario da acao |
| `pagamentos_manuais_fila`, `contratos` | Resolver eventos HTTP de recursos ligados explicitamente a solicitacao | Lotes coletivos e vinculos ambiguos nao sao distribuidos artificialmente |
| `setores`, `users`, `tipo_solicitacao` | Resolver codigo/nome/ID e rotulos atuais | Cadastro atual do usuario nao e usado para inventar lotacao historica |

O extrator verifica tabelas/colunas por `information_schema`, respeitando nomes
fisicos. Ausencia de fonte opcional aparece no manifesto. Ausencia do nucleo
obrigatorio interrompe a extracao. Nao usa `SELECT *`.

## Reconstrucao das passagens

Cada entrada em um setor abre uma passagem numerada. Um encaminhamento para outro
setor fecha a passagem anterior e abre a seguinte. Voltar ao GEO depois de passar
por Compras cria uma nova passagem do GEO; os tempos nao sao misturados.

Em `ENVIADA_SETOR`, `historicos.setor` indica o destino. A origem vem primeiro do
metadata estruturado e depois do formato legado `De X para Y`. O autor desse envio
atua no setor remetente; ele nao e a primeira resposta do setor que recebeu.
`SOLICITACAO_APROVADA_ENCAMINHADA` tambem usa origem/destino explicitos do metadata.
Mudanca de status dentro do mesmo setor nao reinicia a passagem.

No fluxo novo de contratos, medicoes podem compartilhar a solicitacao principal.
O identificador de medicao permanece na evidencia quando existe. Permanencia longa
do contrato inteiro nao equivale a atraso de uma medicao; esse recorte precisa ser
separado na analise antes de escolher um contador unico para a linha.

Para a entrada inicial, a preferencia e:

1. destino no evento auditado de criacao;
2. `status_area` inicial, dentro de 60 segundos da abertura;
3. historico `CRIADA` do fluxo de Compras, que grava o destino;
4. origem do primeiro envio, **identificada como inferencia**;
5. setor desconhecido, quando faltam evidencias.

O setor atual da solicitacao nunca preenche automaticamente o passado. O historico
`SOLICITACAO_CRIADA` do formulario comum registra o setor do criador, portanto nao
comprova o destino inicial. Eventos proximos da criacao usam a abertura do registro
como inicio aproximado e mantem a fonte dessa escolha.

Uma finalizacao/cancelamento com data explicita encerra a passagem. O conjunto
tecnico inicial reconhece FINALIZADA/O, CONCLUIDA/O, ENCERRADA/O e CANCELADA/O.
`PAGA`, `PAGO` e pagamento parcial nao sao encerramento: existe conferencia na
Obra e podem ocorrer contestacoes. Status customizados devem ser revisados no
catalogo do resultado antes de confiar no fechamento automatico. Reaberturas
sem evento inequivoco permanecem apontadas como lacuna; nao sao inventadas.

## Autoria e tipo de interacao

- Atribuicao usa `metadata.ator_id`; `usuario_responsavel_id` nessa acao e o
  destinatario. Sem ator registrado, a auditoria nao culpa o destinatario pela acao.
- A primeira visualizacao e separada da primeira operacao bem-sucedida. Acessar
  uma pagina nao comprova leitura de todo o conteudo.
- Acoes automatizadas conhecidas, efeitos de envio, falhas, negacoes, operacoes
  auxiliares e troca de usuario em desenvolvimento nao compoem a primeira resposta humana.
- Uma automacao nao identificada no historico pode permanecer indistinguivel de
  uma acao manual. Conferir o catalogo de acoes e amostras e parte da homologacao.
- O setor do ator vem do snapshot da auditoria, do contexto historico ou da origem
  do anexo/envio. O contexto historico pode representar o setor da solicitacao;
  nao comprova sozinho a lotacao formal do usuario. O CSV conserva a base utilizada.
- Eventos de usuario com setor desconhecido continuam na linha do tempo e nas
  metricas individuais, mas nao viram primeira resposta comprovada do setor.
- Operacao e seu possivel espelho HTTP, com mesmo ator/familia/status em ate dois
  segundos, sao correlacionados. Ambas as evidencias permanecem em `eventos.csv`;
  `replica_de` e `correlacao_espelho=HEURISTICA_2S` tornam a deduplicacao revisavel.
  A proximidade temporal nao e prova absoluta de uma unica operacao.
- IDs de URLs com dois recursos numericos sao ambiguos, porque a auditoria HTTP
  armazena o ultimo ID. Esses eventos sao sinalizados, sem associacao adivinhada.

## Periodo e calendario

Escopo definido pelo usuario em 01/10/2026: **todas as solicitacoes, da primeira
ate a ultima disponivel no inicio da extracao**, incluindo encerradas, canceladas
e abertas, sem filtro por ano, tipo ou setor. O comando desse escopo usa
`--historico-completo --fuso-banco=servidor`, sem `--de`, `--ate` ou `--ids`.
Os limites de volume continuam sendo protecoes que abortam a execucao; nao geram
amostra nem cortam a lista. Se forem insuficientes, ampliar explicitamente para
obter uma unica auditoria integral. Registros apagados ou historicos que deixaram
de existir nao podem ser recuperados por essa consulta.

O corte e lido por `CURRENT_TIMESTAMP(3)` do proprio banco no inicio do snapshot
somente leitura. A sessao conserva seu fuso; `DATETIME`/`TIMESTAMP` sao recebidos
como texto e as datas dos eventos sao exportadas **sem sufixo UTC e sem conversao
para Brasilia**. O manifesto registra fuso da sessao/sistema e os tipos temporais
encontrados, sem dados de acesso. O timestamp administrativo `gerado_em` continua
em UTC e nao participa dos calculos. A precisao de calculo e de milissegundos.

As diferencas entre horarios usam um eixo numerico neutro. Isso pressupoe que as
fontes tenham a mesma referencia historica; misturas de convencoes de armazenamento,
mudancas de fuso/relogio e horario de verao precisam ser verificadas na homologacao.
Um deslocamento constante aplicado a todos os eventos nao muda os intervalos.
O relogio do computador do operador nao define a idade das pendencias. Para uma
entrada offline, o JSON deve informar `corte_servidor` como `YYYY-MM-DD HH:mm:ss.SSS`
(horario registrado na extracao), junto dos arrays de todo o historico. Nao usar a
ultima interacao como corte, pois isso esconderia a espera posterior a ela.

Nesse modo, `horas_calendario_sem_fds` fica nulo: so se medem diferencas corridas.
Nao e necessario definir feriados ou expediente para esta auditoria. Datas de
abertura ausentes/invalidas sao apontadas em `qualidade.csv`, sem inventar duracao.

### Recorte opcional para outras analises

`--de` e inclusivo; `--ate` e exclusivo, ambos a meia-noite de Brasilia. Para
setembro inteiro, use `--de=2026-09-01 --ate=2026-10-01`, sem historico completo.

O universo lido inclui todas as solicitacoes criadas antes do corte, com toda a
trilha disponivel anterior ao corte. O relatorio seleciona passagens que intersectam
o periodo, preservando a entrada anterior de um backlog. Nao filtra somente
solicitacoes novas e nao corta a trilha em `--de`.

As metricas de passagem incluem sua historia anterior ao inicio quando necessario.
Para contar apenas acoes ocorridas no intervalo, use `atividade_no_periodo.csv` ou
`eventos.dentro_periodo`. Dados atuais de cadastros e status sao fotografias da
extracao; nao sao uma restauracao do banco na data final escolhida.

Somente no modo de recorte, datas exportadas sao ISO UTC. `--fuso-banco` precisa ser confirmado pelo operador
para interpretar DATETIME: aceita UTC ou UTC-03, sem padrao implicito na CLI.
O horario configurado na sessao tambem governa conversao de TIMESTAMP. Nao basta
olhar o fuso do Windows; confira como o ambiente persiste os horarios.

A metrica principal e em **horas corridas**. O campo auxiliar
`horas_calendario_sem_fds` integra horas em dias de segunda a sexta e desconta
somente feriados fornecidos. Considera dias de 24 horas; nao representa jornada
de oito horas, expediente ou SLA aprovado. O calendario suporta 2020 em diante,
apos o fim do horario de verao brasileiro. Sem feriados informados, a contagem
auxiliar e explicitamente provisoria.

## Indicadores e arquivos

| Arquivo | Conteudo |
| --- | --- |
| `relatorio.html` | Resumo local, cobertura, tempos por setor, backlog e links aos CSV |
| `manifesto.json` | Recorte, fuso, fontes, limites, calendario, cobertura e ressalvas |
| `passagens.csv` | Entrada/saida, primeira leitura/acao, ultima acao, duracoes, censura e confianca |
| `usuarios_passagens.csv` | Ator, acoes, primeira/ultima, intervalo desde atribuicao e atribuicoes sem resposta |
| `intervalos.csv` | Cada par consecutivo de acoes do setor ou do mesmo usuario, dentro da passagem |
| `etapas_status.csv` | Intervalos entre status explicitamente registrados; sinaliza possivel espera por aprovacao |
| `eventos.csv` | Evidencias com fonte/ID, horario, autor, setor, acao, campo tecnico, resultado e espelho |
| `fluxos.csv` | Caminho completo, retornos, origem historica e tempo ate primeiro Financeiro |
| `resumo_setor.csv`, `resumo_setor_tipo.csv` | Amostras, media, P50, P75, P90, P95 e maximo |
| `resumo_usuario.csv`, `resumo_intervalos.csv` | Distribuicoes individuais/contextuais e de intervalos |
| `resumo_fluxos.csv` | Comparacao das rotas de referencia |
| `atividade_no_periodo.csv` | Operacoes humanas no recorte, sem contar o contexto anterior |
| `catalogo_eventos.csv` | Vocabulario de acoes, fontes, resultados e automatismos encontrados |
| `pendencias.csv` | Passagens sem saida observada, ordenadas pela idade |
| `qualidade.csv` | Lacunas, origem divergente, datas invalidas e recursos ambiguos |
| `consultas.json` | SELECTs e parametros efetivamente usados, sem dados de conexao |
| `relatorio.json`, `SHA256SUMS.txt`, `CONCLUIDO.txt` | Resultado estruturado, integridade e sinal de conclusao |

Os percentis usam o metodo do posto mais proximo. Nulo significa nao observado,
nao zero. A permanencia de passagens abertas fica nula e sua idade aparece em
coluna distinta. Nao se mistura a idade das abertas com duracao das concluidas.
Medianas de resposta consideram quem teve resposta; sempre ler junto a quantidade
sem resposta para nao produzir uma impressao artificialmente favoravel.

`confiavel_para_resumo` separa entradas explicitas sem anomalias detectadas das
inferidas/incompletas. Isso nao certifica completude do historico ou verdade da
lotacao. Compare tipos/obras/complexidade e volume antes de comparar pessoas.
Percentis com poucas amostras nao estabelecem automaticamente um prazo.

## Execucao posterior

Decisao do usuario em 01/10/2026: **receber uma extracao completa e analisar
offline**. Nao abrir conexao direta com o banco. O procedimento de conexao abaixo
documenta a capacidade opcional do pacote para um operador autorizado; nao e o
modo escolhido para esta sessao. A proxima entrada e o arquivo completo, sem
credenciais, com as fontes descritas e o horario de corte do servidor.

Confirmacao posterior: o proprio usuario executara os comandos na EC2 e fara a
extracao. O pacote portatil permite isso sem modificar o checkout ou reiniciar
servicos; o agente continua proibido de acessar a EC2 ou consultar o banco.

Primeiro testar sem banco, a partir de `backend/`:

```powershell
node scripts/validarAuditoriaTemposSolicitacoes.js
node scripts/auditarTemposSolicitacoes.js --help
```

Para uma extracao completa ja preparada em JSON (arrays com os campos projetados
pelas fontes e `corte_servidor`, sem credenciais), executar offline:

```powershell
node scripts/auditarTemposSolicitacoes.js --entrada=historico.json --historico-completo --fuso-banco=servidor
```

A execucao real ainda precisa de base identificada e autorizada; o universo completo
e o uso do horario do servidor ja foram definidos pelo usuario. O operador
configura as variaveis `AUDIT_DB_*` listadas no `--help` apenas na sessao. Nao
armazenar em arquivo, codigo, documentacao, historico de comandos ou conversa.
O pacote nao recupera acessos de documentos anteriores. O operador pode executa-lo
no terminal da EC2, usando conexao direta com o MySQL autorizado. O agente nao
acessa esse terminal e o pacote nao abre tunel SSH.

```powershell
node scripts/auditarTemposSolicitacoes.js --consultar-banco --confirmar-banco=NOME_AUTORIZADO --historico-completo --fuso-banco=servidor --somente-extrair
```

O comando acima corresponde ao escopo solicitado. Usar usuario SELECT-only e TLS
com validacao de certificado. A extracao exige snapshot InnoDB em transacao
`READ ONLY` e encerra com `ROLLBACK`; nao existe modo de escrita. Ha limite de
30 segundos por SELECT e limites de linhas/solicitacoes. Ultrapassar um limite
interrompe a entrega, sem truncar resultados. Replica/copia autorizada e preferivel
para volume grande; mesmo SELECT pode consumir recursos do banco.

Com `--somente-extrair`, o arquivo `historico.json` conserva os arrays projetados,
`corte_servidor` e `manifesto_extracao`. O manifesto original acompanha a analise
offline para nao perder avisos de fontes ausentes e a cobertura da extracao.
O relatorio ainda nao e gerado nesse passo. `CONCLUIDO.txt` so e criado apos gravar
todos os arquivos e hashes; uma pasta parcial nao e uma extracao concluida.

`--ids=...` permite um piloto pequeno somente no modo de recorte, separado da
entrega completa; nao pode ser combinado com `--historico-completo`. A saida padrao
fica em diretorio novo de `outputs/`; pastas existentes nunca sao sobrescritas.
Relatorios contem nomes de colaboradores e identificadores internos; devem ser
mantidos sob acesso restrito e nao commitados. Nenhum segredo, endereco de banco,
conteudo de comentario/anexo ou dado bancario e incluido.

## Leitura do POP antes do contador

O anexo recebido, versao 1.0 de 30/09/2026, contem 76 etapas/rotinas em 16 grupos.
A transcricao estruturada preserva responsavel e prazo original. E referencia
para desenho de produto, nao uma verificacao juridica de prazos de pessoal.

O documento determina, entre outros pontos:

- 24/48 horas correspondem a um/dois dias uteis, com excecoes explicitadas;
- aprovacoes de Diretoria nao possuem prazo;
- algumas contagens comecam na liberacao, entrega ou assinatura, nao na entrada no setor;
- recarga pode vencer no mesmo dia e prestacao depende da proxima recarga;
- ha prazos de antecedencia, janelas mensais e dias corridos;
- ha proposta de bloqueio por etapa vencida, alem da regra especifica de Custos e Recebiveis.

Portanto, apenas contar desde o ultimo envio ao GEO cobraria indevidamente o
periodo de espera por Diretoria. Antes de implementar a coluna, precisamos
homologar: tipo + etapa + marco inicial, calendario/feriados, pausas e retomadas,
responsabilidade da pendencia, retornos, estados terminais e escopo de bloqueio.
A auditoria evidencia essas lacunas; nao aplica o POP retroativamente nem cria
um bloqueio geral de setores.

## Roteiro de analise dos resultados reais

1. Conferir manifesto, fontes ausentes, cobertura e catalogo de eventos.
2. Validar manualmente no historico 5 a 10 solicitacoes por rota, incluindo retorno,
   troca de responsavel, pagamento parcial, encerramento e pendencia aberta.
3. Confirmar a correlacao de espelhos e a consistencia dos horarios entre fontes.
4. Comparar primeira resposta e permanencia por setor/tipo, com P50/P90 e sem resposta.
5. Examinar atribuicoes e intervalos por usuario como investigacao de fluxo, sem
   inferir jornada ou produtividade individual a partir desses tempos.
6. Isolar esperas por aprovacao, fornecedor, entrega e documentos da Obra.
7. Confrontar os tempos observados com as etapas do POP e decidir os marcos do contador.

Sem execucao e revisao de amostras reais, a entrega esta validada como ferramenta
offline e extrator simulado, nao como auditoria homologada dos dados de producao.

## Validacao offline da extracao recebida em 01/10/2026

O usuario executou a extracao e forneceu o pacote completo. O agente conferiu o
hash externo e os tres hashes internos e analisou exclusivamente os arquivos
locais, sem EC2 ou banco. O corte e `2026-10-01 15:03:14.440`; existem 6.091
solicitacoes, com primeira abertura em 09/02/2026. Dados e relatorios pessoais
permanecem somente em `outputs/auditoria-real-20261001/`, fora de commits.

A validacao encontrou diferencas entre o driver real e os fixtures: flags SQL
vieram como texto `0`/`1`. O motor passou a interpretar valores booleanos
explicitamente. Tambem prioriza codigo/ID sobre nome de setor, reconhece o envio
estruturado da revisao GEO de Compras, identifica automacao pelo nome da acao e
impede que encerramento/reabertura de pedido/cotacao seja aplicado a raiz.
Quarenta cenarios offline passaram. Nenhum arquivo de runtime foi alterado.

Resultado validado: 116.426 evidencias vinculadas, 15.624 passagens, 4.980 na base
estrita e 63.503 intervalos. Todos os intervalos foram recalculados por diferenca
dos horarios de seus eventos. Quinze amostras rastreaveis cobrem duas rotas
tecnicas e excecoes. Isso valida os calculos disponiveis, sem substituir a
homologacao operacional dos marcos e das convencoes historicas pelos responsaveis.

Limites materiais: visualizacoes vinculadas comecam em 15/08/2026; fontes de
contratos/fila indisponiveis no esquema projetado; `medicao_id` ausente;
codigos/nomes de Compras historicamente ambiguos. Das 5.503 passagens sem saida,
3.498 estao em solicitacoes PAGA e 285 possuem encerramento atual sem data
historica suficiente. A lista nao equivale a backlog nem a atraso de SLA.

Entrega final em `outputs/auditoria-real-20261001/entrega/`: `RELATORIO.html`,
planilha consolidada e CSV/JSON detalhados. A pasta `analise/` e seus resultados
anteriores a correcao sao diagnosticos invalidados; usar `analise-validada/`.
