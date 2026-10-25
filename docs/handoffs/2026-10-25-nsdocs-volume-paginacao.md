# Divergencia entre volume NSDOCS e carga manual PROD

## Estado e evidencias

Usuario confirmou abertura correta das notas/XMLs. Informou que o acervo NSDOCS
e maior que o carregado. As duas janelas SSH mostraram `Connection reset`.
Nao atribuir a queda da conexao a perda de documentos: progresso duravel foi
conferido diretamente no servidor, sem captura ativa nem locks.

Plano `8e0a4179-506a-4670-88a2-d9079728e263`: 20 completos / zero pendentes,
46 NF-e distintas, 46 observacoes/XMLs registrados e referencias coerentes,
4 outros modelos (3 CT-e, 1 MDF-e). Acervo canonico: 47 documentos. Automatico
desligado. Essa conclusao do plano NAO comprova cobertura integral do provedor.

Auditoria somente leitura no RDS, com TLS/UUID/transacao READ ONLY existentes:
dez janelas Pendente receberam exatamente 5 linhas, header total=5, offset=0,
next_offset=null e window_complete=true. As dez janelas Importado estao vazias.
Nenhuma pagina adicional foi criada. Foram lidas apenas primeiras paginas;
header como tamanho da pagina e a principal hipotese para encerramento precoce.

Documentacao oficial v2 https://developer.nsdocs.com.br/ conferida em 25/10/2026:
quantidade/deslocamento sao paginacao; X-Total-Registros e descrito como total,
mas a redacao 'registros retornados' pode ser ambigua. Nao assumir a semantica
real antes de sondar offset5 com os mesmos filtros e comparar IDs da pagina0.

## Preparacao local

Sonda `ops/deploy/sondar-nsdocs-paginacao-prod-20261025.cjs` e QA separado.
Executada por stdin sob Node PROD, raiz backend. Somente apos flag explicita:
--plano-id fixo e --confirmar-consulta-real. UM GET de lista de janeiro/2026,
Pendente, quantidade5, deslocamento5. Usa transporte existente com TLS fixo,
sem redirect, timeout, limite de corpo, chave somente backend. Sem XML,
captura, escrita RDS/S3, deploy/restart/env ou alteracao do plano.

Valida empresa e pagina anterior no banco em leitura; bloqueia plano/query,
respeita cooldown e registra dois eventos sanitizados no journal privado.
Resultado somente com contagens/periodo/status/totais/sobreposicao de IDs.
Nao exibe documentos, IDs do provedor, chave, XML ou headers livres.
Tambem detecta pagina repetida caso o offset seja ignorado. QA com mocks,
sem rede/banco reais. Nenhuma chamada NSDOCS real foi feita pelo agente.

Oito testes passaram: confirmacao obrigatoria, um GET sob locks, pagina cheia/
vazia/repetida, segredo refletido/empresa/status/ID/limite, plano ocupado,
falha de rede, plano concorrente e plano incompleto. `git diff --check` passou.
SHA256 da sonda:
`b562315b8bed60b8fa35e328f73195e5561be397ed61abbcefd640d0c45b78e3`.

## Proximo passo

### Sonda real executada pelo usuario: falha de paginacao confirmada

- Janeiro/2026, Pendente, offset5/limit5 retornou 5 linhas com header total5.
- Quatro IDs novos em relacao a pagina0 e um ID em sobreposicao. Logo, a
  conclusao anterior baseada em total5 era prematura. Isso nao comprova que
  existam exatamente quatro notas faltantes, nem que a pagina seja toda NF-e.
- A sobreposicao nao prova isoladamente sua causa: pode refletir ordenacao por
  data com empates ou alteracoes do acervo entre consultas. Nao prometer
  cobertura apenas incrementando offsets ou deduplicando as repetidas.
- Documentacao oficial Consultar Campos indica `id` e `chave_acesso` com
  ordenacao=false. Campos numero/data/hora/valor sao ordenaveis, mas nao sao
  unicos globalmente. Nao inventar ordenacao unica suportada pelo provedor.
- Reproducao local com metadados ficticios: pagina0 cheia/header5 retorna
  window_complete=true; pagina offset5/header5 e final vazia/header0 sao
  rejeitadas com NSDOCS_TOTAL_INVALIDO. Apenas mudar max-lotes nao resolve.
- Nenhuma nova chamada real pelo agente. Sonda do usuario preservou plano,
  banco, XML/S3; fez um GET e dois eventos de auditoria local.

### Correcao a preparar, separada da captura ja concluida

Exigir enumeracao completa antes de anunciar cobertura: tratar header conforme
semantica observada e nao encerrar em pagina cheia; lidar com pagina final vazia
em offset positivo. Evitar depender de offsets sobre ordenacao instavel: avaliar
descoberta limitada a 100 metadados por janela, subdividindo datas se cheia, e
persistir manifesto duravel antes de capturar XMLs em lotes de ate5. Se atingir
limite de um unico dia sem enumeracao confiavel, parar como cobertura pendente
para reconciliacao, nunca declarar completo automaticamente. Aumentar limit
sem subdivisao e verificacao de cobertura nao basta.

Plano complementar deve referenciar o plano original, preservar IDs/eventos e
NF-e canonicas, registrar omissoes e nao duplicar XMLs ou registros existentes.
Desacoplar quantidade de lotes de cobertura fiscal comprovada. Sem deploy,
captura real, financeiro, permissoes ou DEV nesta analise. Implementacao e
homologacao da correcao/reconciliacao ainda nao realizadas.

Fornecer hash e comando de sonda ao usuario, explicitando UM GET e dois eventos
locais de auditoria. Receber resposta antes de corrigir e publicar a paginacao.
Se houver novos IDs no offset5, confirmar carga parcial e preparar reparo sem
editar plano concluido, IDs, observacoes, XMLs ou historico. Preservar unicidade
global de NF-e e limitar reconcilacao a cobertura efetivamente comprovada.
Nao aumentar quantidade como unico conserto, nao presumir ausencia de paginas
quando total coincide com limite, nao repetir captura inteira agora.

Estado: apenas sonda/QA/docs locais, sem commit/push ou alteracao de producao/DEV.
