# Correcao da data de emissao fiscal no DEV

## Escopo autorizado

Implementar e testar o ajuste na lista e nos detalhes fiscais, destinado a
refactor/frontend. Preservar horarios do historico, banco, XML, permissoes e
producao. Agente unico, mudanca local no checkout codex/retirada-envios-dev-20261023,
baseado em7d3a29a5. Nenhum commit, push, deploy ou operacao remota nesta etapa.

## Causa conferida

Usuario executou diagnosticos somente leitura: captura e MySQL registram o dia
2026-10-16, canonico criado pela captura e XML correspondente. API retorna
2026-10-16T00:00:00.000Z; navegador America/Sao_Paulo exibe15/10 via new Date.
Nao ha evidencia de data errada no banco. A emissao NSDOCS e dia civil, nao um
instante, pois o provedor fornece issued_on sem hora.

Mapeamento previo: GET /fiscal/documents e /:id, guarda canViewFiscalDocuments;
XML/PDF usam endpoints assinados. Uploads, DANFE, vinculos e demais operacoes
possuem handlers proprios e nao participam do ajuste. Importadores XML legados
podem gravar instantes reais (inclusive emissao noturna que cruza o dia UTC).

## Arquivos alterados

- frontend/src/modules/fiscal/utils/dataEmissaoFiscal.js: formatador compartilhado.
  Origem nsdocs_v2_manual conserva o dia recebido sem converter fuso. Strings
  YYYY-MM-DD tambem sao dias civis; valida calendario e sintaxe dos horarios.
  Outras origens com timestamp conservam a conversao anterior para o navegador.
  Ausencia/invalido retorna null, preservando contagem do CamposComVazios.
- FiscalDocuments.jsx: somente import e render da coluna Emissao.
- FiscalDocumentDetail.jsx: somente import/formatacao da Emissao e remocao da
  antiga funcao formatDate sem outros consumidores. formatDateTime permanece
  identica para Criado em e eventos do historico.
- frontend/scripts/validarEmissaoFiscal.mjs e package.json: comando
  npm run test:fiscal-emissao, sem dependencias novas ou mudanca do lock.

## Validacoes executadas

- QA de comportamento aprovado em America/Sao_Paulo, UTC e Pacific/Kiritimati:
  dia NSDOCS, anos bissextos, datas invalidas/vazias, hora malformada,
  imutabilidade e emissao legada com instante real. Testes em processos separados.
- Chrome headless com paginas reais (lista/detalhe) e dados ficticios nos tres
  fusos: dia16 nas duas telas, data legada preservada, ausencia de data,
  Criado em e historico com horario local, navegacao Detalhes e acionamento XML.
- Layout/preferencias e camada fiscalApi foram adaptadores locais no harness;
  isto nao substitui homologacao real de ACL/URL assinada. Handlers das paginas
  permanecem reais e imutados. Nenhuma chamada de mutacao ou pedido externo.
- Build Vite completo aprovado (649 modulos). Artefatos apenas em
  outputs/qa-emissao-fiscal-build. Avisos de chunks grandes/Browserslist antigo,
  sem falha. Nenhuma instalacao ou atualizacao de dependencias.
- git diff --check aprovado. Backend, schema, XML, rotas/ACL e config intactos.

## Proximo passo e cuidados

Usuario autorizou posteriormente commit/push exclusivamente em refactor/frontend
e roteiro de atualizacao/teste DEV. Pacote restrito aos5 arquivos frontend desta
correcao, este handoff e README-emissao-fiscal-dev-20261024.md. SHA definitivo
sera informado na resposta da publicacao, evitando referencia circular no commit.
A publicacao e frontend apenas;
nao precisa migration, mudanca de Node, restart ou update-env.
Homologar na nota testada:16/10 na lista e detalhe, XML acessivel e historico com
hora. Nao alterar banco nem somar um dia aos dados. Demais emissoes com timestamp
de origem legada mantiveram sua semantica; nao interpretar este ajuste como
uma mudanca global de timezone do modulo.

Preservar arquivos locais anteriores de diagnostico/Node/outputs. Ownership ja
possuia deltas misturados antes da tarefa: nunca incluir o arquivo inteiro num
commit desta correcao. Nenhum segredo ou XML real foi lido ou salvo pelo agente.
