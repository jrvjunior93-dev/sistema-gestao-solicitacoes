# Complemento NSDOCS e lista fiscal - implementacao local

## Autorizacao e escopo

Usuario autorizou implementar e testar a correcao, preparar carga complementar,
preservar46 NF-e/XMLs/historico, evitar duplicidade, manter automatico OFF e nao
alterar PROD/DEV. Tambem pediu opcao paginas/rolagem com consultas sob demanda.
Branch local `codex/nsdocs-complemento-paginacao-20261025`, base 3fc61f14.
Agente unico; ownership em docs/workspace/OWNERSHIP_ATIVO.md.

## Diagnostico e decisao

Sonda do usuario confirmou header=5 tambem em offset5, quatro IDs novos e um
repetido. Nao usar header como total global nem confiar na ordenacao por data
para percorrer offsets. Normalizador ganhou modo de contagem por pagina;
manual/query exige subdivisao quando ha continuacao ou offset nao confiavel.
Planos/observacoes anteriores nao sao editados ou retroativamente corrigidos.

Novo fluxo complementar separado: descobrir ate 100 metadados por consulta,
offset 0, janelas disjuntas de ate 31 dias/ambosstatus. Janela cheia e subdividida
antes de guardar seus documentos; dia cheio pede revisao e nunca anuncia
completude. Snapshot congelado e batches de ate 5 NF-e duraveis. Documento visto
em mais de uma janela/status e unico pela chave; identidade divergente falha.
Nota original ausente no snapshot mantem cobertura pendente, sem apagar dados.

## Arquivos principais

- backend/scripts/nsdocsProdComplement.js: preparar/consultar/descobrir/capturar,
  IDs explicitos, flags para chamadas/persistencia e backup/timer existentes.
- manual/complement/{plan,store,discovery,capture}.js: identidade/manifesto,
  limites, checkpoints compactos, locks/cooldown/progresso, retomada/idempotencia.
  Metadados imutaveis escritos uma vez em arquivo privado com SHA; checkpoint
  atomico separado contem apenas indices e contagens dos lotes concluidos.
- manual/repository.js: ler chaves da origem e reutilizar observacao XML da
  mesma empresa/identidade/bucket/prefixo/hash. Cadastro canonico nao e atualizado;
  eventos/observacoes novos registram o complemento. Sem financeiro ou DeleteS3.
- manual/capture.js expoe recursos existentes; normalizer/query tratam total de
  pagina sem mudar o modo global do core de fixtures. Sem dependencia/migration.
- fiscalDocumentService.js: lista paginada existente exclui JSONs pesados;
  detalhe e arquivos continuam completos. Rotas/ACL inalteradas.
- FiscalDocuments.jsx, novo useDocumentosPaginados.js e fiscalApi.js:50porpagina,
  paginas/scroll, empresas uma vez, consulta unica ativa e filtro pendente mais recente,
  erro/retry, respostas obsoletas descartadas e total do servidor. Sem consultas
  NSDOCS no browser. NavegacaoRolagemConsulta aceita rotulo opcional, preserva
  textos/default da Fila de Pagamentos. Acoes/permissoes/links assinados mantidos.
- QA novo backend/scripts/validarNsdocsComplemento.js, helperSQLite,
  validarFiscalDocumentosPaginacao.js, frontend/scripts/validarDocumentosFiscaisPaginacao.mjs;
  QA de emissao fiscal adaptado para interceptar API do novo hook.
- Roteiro completo: ops/deploy/README-nsdocs-complemento-20261025.md.

## Validacoes e limites

69 testes backend conector/complemento/guardas/plano/parser/lista e 18 regressoes
de vinculos/dossie aprovados; estorno e auditoria granular sem chaves invalidas.
UI: 125 documentos / 3 paginas e rolagem, concorrencia/filtros/erro/retry, XML/detalhes
e mobile aprovada. Emissao/lista/detalhes/historico com hora/XML aprovados em
America/Sao_Paulo, UTC e Pacific/Kiritimati. Build frontend aprovado (avisos usuais
de chunks grandes). Revalidar contagens finais depois de qualquer reparo.

Todos os dados ficticios e SQLite em memoria; rede externa bloqueada no QA.
Nao houve SSH, NSDOCS/AWS/RDS reais, carga, restart, deploy, env ou Node/dumps.
Assinatura digital XML continua nao validada, conforme implementacao anterior.
Snapshot nao trava o provedor: entradas posteriores exigem nova conferencia.
Dia com 100 ou mais documentos, 8 MiB, 10 mil notas ou 20 mil janelas pede revisao/erro,
sem falso completo. Carga complementar real ainda nao foi executada/homologada.

## Estado e proximo passo

Conferencia final: 87/87 testes Node aprovados em
outputs/qa-nsdocs-complemento-final.txt; navegador/datas em
outputs/qa-fiscal-paginacao-final.txt; build19.70s em
outputs/build-nsdocs-complemento-ui.txt; auditoria granular com0chaves invalidas
ou duplicadas em outputs/qa-nsdocs-permissoes.txt. `git diff --check` passou.
Checkpoint compacto/manifesto imutavel e falha de rename tambem cobertos no QA.

Implementacao local sem commit/push. Nao alterar manifestos/aplicadores antigos
para aceitar hashes novos. Antes de publicar, preparar novo inventario/aplicador
com protecao dos peers/env/dumps/Nodes e retorno, backend antes do frontend.
Comandos de complemento so depois do backend atualizado/conferido. Comecar
preparar/descobrir 1 consulta; comparar metadados e source_documents_missing=0;
so entao piloto XML de 1 lote e demais lotes. Novo ID referencia origem 8e0a4179 e deve
ser guardado para retomada. AutomaticoOFF, sem novos bloqueios financeiros.

Arquivos de sonda/QA/handoff de paginacao anteriores continuam locais e fazem
parte das evidencias. outputs/ contem logs e screenshots, nao incluir em Git.
