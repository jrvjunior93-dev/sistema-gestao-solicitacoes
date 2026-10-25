# CNPJ rejeitado na descoberta complementar

## Estado recebido do usuario

Patch3f5506fc aplicado/conferido sem restart. Piloto seguinte passou com pagina
cheia e subdivisao. Lancador nohup manual iniciou PID680067 e log privado
descoberta-c456781c-4393-468b-858f-dbf220d8f215-d2QLzxsq.log. Na rodada10,
tres consultas terminaram,20janelas pendentes/3enumeradas,0documentos descobertos,
46originais ainda nao reencontradas. Consulta seguinte falhou NSDOCS_CNPJ_INVALIDO.
Rodape codigo1 confirma fim da rodada; nao disparar outro executor.
Nenhuma captura/XML nesta fase. Automatico OFF, origem46notas preservada.

## Sonda local nova, ainda sem commit/push

- ops/deploy/sondar-nsdocs-cnpj-complemento-prod-20261025.cjs
- ops/deploy/sondar-nsdocs-cnpj-complemento-prod-20261025.test.cjs
- Este handoff e reserva em docs/workspace/OWNERSHIP_ATIVO.md.

Somente um GET da primeira janela pendente do mesmo complemento
c456781c-4393-468b-858f-dbf220d8f215, origem8e0a4179. Confere runtime/empresa
por transacao RDS somente leitura/TLS/UUID existentes. Usa locks plano/query,
cooldown, credencial privada e transporte existente, sem alterar filtros.
Exibe campos fixos empresa_cnpj/emitente_cnpj/destinatario_cnpj, tipo/formato,
quantidade de digitos, flags de DV CNPJ/CPF e indice da linha, ate20ocorrencias.
Validadores sao os utilitarios existentes; reconhecer CPF no diagnostico nao
significa que foi aceito/importado. CNPJ divergente da empresa nao e aceito.
Nao imprime numeros, valores, nomes, IDs de documentos, chave, XML ou corpo.
Normalizador vigente e executado sem alteracao e informa so codigo seguro.

## Verificacoes

13 testes Node com fixtures/transporte simulado aprovados: tipos/vazio/mascaras,
DV invalido/CPF, nomes vazios ja aceitos, empresa divergente/ausente, recorte de
modelos, limite de saida, segredo refletido/corpo grande, confirmacao, locks,
cooldown, um GET somente, progresso preservado, rede e concorrencia.
Nenhuma chamada real executada pelo agente. Sonda cria apenas locks temporarios
e dois eventos no journal privado; zeroXML/RDS/S3writes, migrations ou restart.

## Proximo passo

Usuario Ctrl+C apenas no tail que ainda acompanha log encerrado; conferir hash
local e enviar sonda por SSH/stdin com --plano-id e --confirmar-consulta-real.
Aguardar60s antes do GET para cooldown. Enviar JSON sanitizado. Nao repetir
--descobrir/--capturar/launcher nem recriar plano/remover locks. So depois da
evidencia avaliar correcao especifica ou tratamento de registro inconsistente,
preservando conferencia obrigatoria da empresa/CNPJ, XMLs e dados existentes.
