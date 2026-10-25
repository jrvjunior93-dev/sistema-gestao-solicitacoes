# Proposta: notas novas em paralelo ao historico NSDOCS

Status: planejamento solicitado pelo usuario; nenhuma ativacao autorizada ou
executada nesta etapa. Automatico permanece OFF, DEV e producao sem mudanca.

## Situacao atual

Historico por emissao01/01/2026a23/10/2026, empresa1/CNPJ27123008000100.
46NF-e e seusXMLs ja salvos; complemento privado identificou150NF-e,
33janelas pendentes/12enumeradas,43outros modelos e37originais ainda ausentes
da nova enumeracao. Captura de XMLs do complemento ainda nao iniciada.
Mainf8d32ac1 tem CLI administrativa NSDOCS; o job fiscal de sincronizacao
existente chama SEFAZ, nao pode ser tomado como worker NSDOCS pronto.
policy.validateFlags exigeNSDOCS_V2_ENABLED/fixtures OFF. Ligar apenas essa
flag bloquearia CLIs de historico; coexistencia precisa ser projetada/testada.

## Fluxo proposto

- Historico mantem plano/ID e janela de emissao; nao reiniciar nem descartar
 150metadados/janelas completas. Otimizar somente depois de evidencia validada.
- Incremental usa data de recebimento na NSDOCS, checkpoint independente por
 empresa/modelo e sobreposicao configuravel para revisitar dias recentes.
 Assim uma nota emitida antes do corte mas recebida depois tambem e considerada.
 Partida sugerida24/10/2026com recuo de seguranca; confirmar cobertura inicial
 antes da ativacao, sem supor equivalencia entre emissao e recebimento.
- Periodicidade inicial proposta30min, ajustavel apos medir duracao/volume/limite
 contratual do provedor. Nao e um agendamento criado nesta conversa.
- Uma fila tecnica compartilhada atende somente uma chamada por vez, prioriza
 recortes recentes sem impedir progresso do historico. Historico precisa ceder
 a fila entre unidades pequenas; nao lancar dois processos HTTP concorrentes.
 Preservar cooldown e bloqueios; se ocupado, registrar adiamento controlado.
- Consultar Pendente e Importado, quantidade100, manter recortes ate comprovar
 cobertura. Dia cheio/ambiguidade/erro impede avancar checkpoint; nunca truncar
 a lista nem usar offset nao deterministico como prova de completude.
- Capturar dados/XMLs com mesma identidade/chave de acesso e empresa, CNPJ/CPF
 conforme tipo, hashes e referencias S3privadas. Reutilizar arquivos existentes;
 observacoes de capturas diferentes podem registrar o mesmo documento sem criar
 novo cadastro ou repetir gravacao/download. Fonte canonical e financeiro ficam
 preservados, com auditoria do ator tecnico/captura/cursor.
- Conferir semantica de status utilizado no download XML com a NSDOCS, preservar
 integracoes externas e nao marcar documentos globalmente como importados por
 conveniencia. Nao presumir que status de uso seja autorizacao/cancelamento.
- Sem vinculo automatico a pedido/titulo, aprovacao ou baixa. Compras faz vinculo
 manual com permissoes existentes; financeiro nao recebe novos bloqueios.

## Ativacao gradual futura

1. Implementar/testar localmente e em DEV com fixtures, transporte eS3simulados,
   sem reutilizar credenciais/bucket/provedor real de producao.
2. Separar controles explicitos e visiveis do historico/incremental, adaptando
   guardas para coexistencia autorizada. Nao contornar a exigencia OFF atual
   criando um job oculto com a flag de aplicacao falsamente desligada.
3. Avaliar schema/ledger de cursor e execucoes, credencial somente backend,
   papel IAM restrito e reuso do bucketfiscalPROD/prefixo correto. Nenhuma
   migration, chave, politica IAM, .env, PM2 ou timer alterado nesta proposta.
4. Piloto PROD manual e pequeno, apos backup/timer e autorizacao da etapa, com
   indicador de acompanhamento e retornos claros. Observar cadencia/cota,
   cancelamento, retentativas, autenticacao, duplicidade e notas tardias.
5. Somente com homologacao e autorizacao explicita, ativar execucao periodica
   com supervisao, pausa/retorno e auditoria. Operacao viaHTTPSde saida;
   sem webhook ou novas portas de entrada para esta proposta.

## Criterios de aceite

MesmaNF-e presente em historico/incremental gera um cadastro e umXMLvalido;
replay ou falha depois de commit nao duplicam. Cursor so avanca depois de
enumeracao/captura conferidas; revisita sobreposicao sem omitir notas tardias.
46canonicas/XMLs e150metadados mantidos. Pedidos/titulos/baixas/permissoes/links
assinados/historico continuam funcionando. Falha fiscal sinalizada para revisao,
sem bloqueio financeiro. DEV/Experience/Nodes/daemon/dumps preservados.

Referencia de contrato publico: https://developer.nsdocs.com.br/.
Filtro confirmado depois da comparacao real: nfe retornou0vs70conhecidas;
literalNF-e retornou exatamente70sem outras categorias/omissoes/duplicatas
ou identidade divergente, enquanto controle sem filtro99incluiu29outros modelos.
Otimizar complemento com literalNF-e nao autoriza ativar o incremental ou
alterar flags/guardas de convivio. Automatico continua apenas em planejamento.
