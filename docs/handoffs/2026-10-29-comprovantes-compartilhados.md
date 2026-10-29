# Comprovantes de titulos compartilhados - implementacao local 29/10/2026

## Autorizacao e evidencias
Usuario autorizou implementar apos SELECTs executados por ele confirmarem:
TIT-012333 id12604/lote3/fila883/movimento8542 quitado2183,37 em28/10;
SOL-6453 id6488 participa1191,90 eSOL-6554 id6589 participa991,47.
12333.pdf principal eadicional784 possuem mesmo caminho/hash; nenhum anexo
ativo/removido ou evento depublicacao/remocao nas duas origens.
Codigo/ID interno foram distinguidos; SOL-6418 id6453 nao pertence ao caso.
Somente simulacao offline da regularizacao. Sem EC2,DB,S3,baixa ou upload real.

## Arquivos funcionais
- pagamentoFilaHistoricoService.js: resolve origens por titulo/lote,unique por
  solicitacao; lock do titulo emtransacao serializa filas do mesmo titulo;
  dedupURL/hash pororigem,protecao tombstone/remocao e reuso do arquivoexistente.
  Mesmo eventoCOMPROVANTE_ADICIONADO,metadata inclui lote,datas eautor originais.
  Manualsemorigem nao inventa solicitacao; normal continuaunicaorigem.
- comprovanteCompartilhadoSolicitacaoService.js eController: leitura pororigem;
  valida titulo/lote/origem/fila/documento,canAccessSolicitacaoFile e remocoes
  antes de assinar strict300s. Nenhum caminho/hash/outraorigem sai no DTO.
- routes.js: GETsolicitacoes/:id/titulos-financeiros/:tituloId/comprovantes-fila/:filaId,
  mesmo gateallowSolicitacaoFinanceiro,validacao IDs noservico,querycomprovante_id.
- tituloCompartilhadoConsulta.js/tituloFinanceiroService.js: habilita descritores
  de comprovantes so na leitura do card; calculos de status nao carregam arquivos.
  Valores continuam somente a participacao da origem,sem outrasorigens noDTO.
- ComprovantesTituloSolicitacao.jsx/FinanceiroCard.jsx/financeiro.js:mostra
  comprovante compartilhado eabre pelo endpoint condicionado asolicitacao;
  preserva comprovantes comuns/importados efluxo depreview existente.

## Testes
- validarComprovantesCompartilhados.cjs:8casos (duasorigens,dedup/replay/concor-
  rencia,rollback4escritas,remocao,manual,sembaixa,DTO,ACL,IDtrocado,cardvalores).
- validarFilaComprovantePendente.js:PASS,upload individual/importado/lote,
  tardio,rollback,auditoria eACL com modelos/S3/PDF simulados.
- validarTitulosCompartilhados.js,validarFilaBaixaComposta.js e
  validarFilaBaixaEstorno.js:PASS,sem banco/rede.
- validarComprovantesTituloSolicitacao.mjs:componente eclienteHTTP reais,
  rotaorigem correta,dedupprincipal/adicional/importado,1366/390 PASS.
- Build frontend13,52s PASS;node--check/diff--check PASS.

## Simulacao e limites
backend/scripts/simularComprovanteCompartilhado6453.cjs usa planejador real porVM
com modelos somenteleitura emmemoria;create proibido. Evidencia saneada em
docs/auditorias/comprovante-compartilhado-6453-evidencia-20261029.json eSHAdo
retorno dooperador,semURL/hashS3 reais (referenciassinteticas declaradas).
outputs/simulacao-comprovantes-compartilhados-20261029/{Simulacao.md,simulacao.json}:
2vinculosanexo e2eventos propostos;1arquivo reutilizado,0titulos/baixas/uploads.
Nao existe modo aplicar. Aplicacao real requer novaextracao+hash/caminhoatuais,
revalidacao soblock,backup eautorizacao separada. Evento de regularizacao usa
data real,nao retroage;conserva pagamento/upload original emmetadata.

## Estado e proximo passo
Implementacao local nao commitada/publicada. A atualizacao de codigo nao
regulariza automaticamente o historico existente; card pode ler o documento
ja na fila sem backfill e sem criarAnexo/Historico emGET.
Publicar DEV somente quando solicitado;backend/rota antes de frontend novo.
Depois validar com usuario pororigem eFINANCEIRO. Main ainda nao promovida.
Ajuste de filtrosDP tambem permanece local neste worktree: nao incluir seu hook,
teste ouhandoff em eventual commit dos comprovantes. Ownership ativo registrado.

Publicacao conjunta autorizada em29/10: usuario incluiu expressamente osfiltrosDP.
Novo aplicadorDEV6runtimes e5QA,10+1testes de isolamento/fases/inventariooffline.
Somente codigo/testes emEC2; simulador/evidencia conferidos porblobsGit e nunca
instalados/executados peloaplicador. Sem schema/SQL/backfill. Frontend tambem
inclui hookfiltros,teste16casos e handoffdoDP. Proximo:operador executa backend e
conferir,envia COMPROVANTES_COMPARTILHADOS_BACKEND_DEV_PRONTO,homologaVercelDEV.
