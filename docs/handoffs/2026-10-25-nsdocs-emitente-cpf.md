# Emitente CPF no historico NSDOCS

## Evidencia e escopo

Usuario executou sonda na primeira janela pendente 04/04/2026 a04/05/2026,
Pendente100/offset0. Um emitente era CPF11 com DV valido; empresa nao divergente.
Sonda nao exibiu valor nem gravou plano/banco/XML. Rodada nohup anterior acabou
codigo1;21/1 passou a20pendentes/3enumeradas antes da falha. O plano continua
c456781c-4393-468b-858f-dbf220d8f215 e origem8e0a4179-506a-4670-88a2-d9079728e263.
Fonte46notas/XMLs/historico preservada; automatico OFF, sem carga pelo agente.

Referencia tecnica primaria: MOC7,2.2.6.1 (pagina19),
https://www.confaz.fazenda.gov.br/legislacao/arquivo-manuais/moc7-visao-geral.pdf.
Identificador CPF tem11digitos; somente sua posicao na chave usa14com zeros.
O suporte nao afirma autorizacao fiscal, assinatura/XSD ou situacao tributaria.

## Implementacao e compatibilidade

Quatro runtimefiles: nsdocsHistorical/contract.js, normalize.js, manual/query.js
e manual/xml.js. cpf() exige string11 e DV valido. Query admite CPF sem mascara
ou mascara exata apenas no emitente. Empresa e destinatario continuam CNPJ.
Documento normalizado preserva11digitos e issuer_document_type=CPF, inclusive
zeros iniciais. Coluna legada issuer_cnpj ja e usada paraCPF/CNPJ pelo parser
fiscal e comporta20caracteres; snapshot explicita o tipo sem migration.
ParaCNPJ, nao adiciona campos nem altera documento normalizado anterior.

XML exige emit/CPF para CPF e emit/CNPJ para CNPJ, rejeitando ambas as tags,
duplicacao, namespace falso e tipo divergente. Destinatario continua dest/CNPJ,
sem CPF ambiguo. CPF do metadado e conferido com XML, DV/numero/data/valor/modelo
e trecho da chave preenchido a14apenas nessa comparacao. XML original nao muda.
Entidades/DOCTYPE/segredo refletido continuam proibidos. Assinatura permanece
identity_checked_signature_unverified. Nenhuma permissao, baixa, vinculo,
manifestacao, dossie, URL assinada ou fluxo financeiro alterado.

## Validacoes

14novos testes: CPF valido/zero inicial/mascara, invalido/numerico/ausente,
empresa/destinatarioCPF negados, CNPJ antigo sem campos novos, pagina100continua
particionando, duplicidade/conflito, XML/tag/tipo/namespace/chave/protocolo/XXE,
parser de detalhes/DANFE e46notas/XMLs/historico anteriores preservados em SQLite.
60notas com2novasCPF:46XMLs reutilizados,14novos, replay sem duplicar.
Totais:105main(fiscal/historico/vinculos/dossie),152DEV(inclui65especificos),
20operador/sonda. Todas fixtures/transportes simulados, sem rede real.

## Publicacao e implantacao

Delta comum em refactor/frontend; main recebe operador novo e inventario fechado.
Base main3f5506fc; sem frontend/deps/schema. Operador
atualizar-prod-nsdocs-cpf-20261025.cjs suporta preparar/aplicar/conferir/voltar.
Confere hashes/checkout/main/Node/PM2/env/dumps/health e guarda backup privado
dos quatro arquivos. Sob locks, QA sem rede e hashes dos planos original e
complemento/journal/credencial antes/depois. Nenhum restart, migration, install,
API NSDOCS, banco ou S3. Retorno retoma interrupcao entre arquivos e nao altera
HEAD/planos/dados; tracked antigo esperado apos voltar, novos testes permanecem.

Lancador anterior fixado em HEAD3f5506fc e local, nao usar apos este patch;
novo launcher so depois de prova de aplicacao e piloto. Nenhum ambiente foi
implantado pelo agente. Reserva de implementacao liberada no commit.

## Proximo passo exato

Usuario preparar/aplicar/conferir e enviar a saida antes de continuar descoberta.
Mesmo complemento, um GET piloto primeiro; nao --preparar-plano nem novoUUID,
nao --capturar ou remover locks. Cobertura so liberada quando enumeracao completa,
sem needs_review, zero originais ausentes e volume conferido no mesmo recorte.
Operador/manifestos antigos permanecem imutaveis. Outputs/ fora do Git.
