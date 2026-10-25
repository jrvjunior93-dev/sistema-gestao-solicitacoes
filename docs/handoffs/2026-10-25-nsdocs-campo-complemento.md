# Diagnostico do campo rejeitado no complemento NSDOCS

## Estado recebido do usuario

Complemento c456781c-4393-468b-858f-dbf220d8f215, origem
8e0a4179-506a-4670-88a2-d9079728e263. A descoberta enumerou uma janela vazia;
20 janelas ainda pendentes. A consulta seguinte falhou com NSDOCS_CAMPO_INVALIDO.
Nenhum XML baixado nem lote persistido nessa rodada. As 46 notas originais
permanecem na base; source_documents_missing compara apenas a nova enumeracao.

Backend 03c91cfe aplicado/conferido pelo usuario; frontend main 953b6a3a publicado,
Vercel e bundle publico conferidos. Refactor a26c1760 preservada. Automatico OFF.

## Arquivos locais novos, ainda sem commit/push

- ops/deploy/sondar-nsdocs-campos-complemento-prod-20261025.cjs
- ops/deploy/sondar-nsdocs-campos-complemento-prod-20261025.test.cjs
- Este handoff e registro de ownership em docs/workspace/OWNERSHIP_ATIVO.md.

Sonda exige ID exato e --confirmar-consulta-real; runtime PROD confere Node,
checkout, flags, TLS/UUID RDS e empresa em transacao somente leitura. Sob os locks
existentes de plano/query e cooldown, faz um GET da primeira janela pendente,
quantidade100/offset0, e executa o normalizador vigente sem alteracao.
Exibe nomes fixos dos campos invalidos, tipos/motivos e comprimento quando texto,
ate20 ocorrencias. Nunca grava/exibe corpo, valores, IDs de documentos, chave ou
XML. Confere o plano antes/depois. Dois eventos no journal privado, locks
temporarios; nenhuma escrita RDS/S3, migration, alteracao do plano ou restart.

## Validacao e riscos

11 testes Node aprovados com fixtures e transporte simulado: tipos, vazio,
limites/controle, nao vazamento, modelos nao implementados, output limitado,
segredo refletido/empresa divergente/corpo grande, confirmacao/ID, locks/cooldown,
plano preservado, rede e concorrencia. Nenhuma chamada real executada pelo agente.
Nao ha evidencia ainda de qual campo real falhou; nao afrouxar o normalizador,
ignorar documentos ou atribuir status fiscal por suposicao.
Uma resposta diferente na nova consulta pode nao reproduzir a falha. Nesse caso
comparar o erro e as contagens sem concluir que os dados foram corrigidos.

## Proximo passo exato

Usuario executar a sonda por SSH/stdin no backend PROD com Node isolado e enviar
somente a saida sanitizada. Nao repetir --preparar, --descobrir ou --capturar
enquanto investigamos. Nao apagar locks nem recriar o plano. Depois do diagnostico,
avaliar a especificacao do campo real, preparar correcao pontual e fixtures de
regressao; preservar as 46 NF-e, XMLs, historico, Nodes, DEV e automatico OFF.
