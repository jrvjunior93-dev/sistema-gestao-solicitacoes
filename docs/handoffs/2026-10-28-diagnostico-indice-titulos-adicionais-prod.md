# Diagnostico manual do indice: titulos adicionais PROD

Operador informou PREPARADO para b4dc99d2194ad7e2e7eccf0f9adca4de275f14e4, seguido de TITULOS_ADICIONAIS_PROD_HEAD_OU_INDEX_MUDOU ao aplicar. O aplicador publicado continua intacto. A guarda compara HEAD e SHA256 dos bytes do indice com o estado privado da preparacao, antes de instalar/QA/reiniciar. Ainda nao existe evidencia que distinga HEAD alterado, staged real e metadados do indice alterados.

## Arquivos locais

- outputs/diagnostico-titulos-adicionais-prod-20261028/conferir-indice.cjs: leitura limitada de estado privado, hashes de fontes/indice e tres consultas Git sem optional locks/fsmonitor. Nao importa app/env/models, nao acessa PM2, rede ou banco. Nao imprime backups, conteudo de fontes, dados de pagamento ou ambientes. Lista somente contagens/flags, fase e SHA de commits.
- outputs/diagnostico-titulos-adicionais-prod-20261028/conferir-indice.test.cjs: VM com filesystem/processo/Git simulados; nenhuma conexao externa.
- docs/workspace/OWNERSHIP_ATIVO.md: reserva deste diagnostico.

## Validacao

11 testes e sintaxe aprovados: estado original, indice bruto diferente sem staged, HEAD diferente, staged real, instalacao parcial, fonte divergente, overlay alterado, caminhos desconhecidos, alvo incorreto, symlink e tentativa de leitura de env. Nenhum script remoto foi executado pelo agente. Nenhuma mudanca no instalador congelado, branch remota, registros, locks, estado ou indice real de producao.

## Proximo passo exato

Usuario executa conferir-indice.cjs via node - no diretorio raiz PROD e envia JSON sanitizado. Nao repetir aplicar/preparar/restart nem remover estado/locks/resetar indice. Conferir phase, head_preservado, indice_bruto_igual_ao_preparado, indice_sem_alteracoes_staged, fontes originais e fora_do_escopo_preservado. Somente depois dessa evidencia definir a correcao minima com guardas e testes. Diferenca no hash bruto sozinha nao comprova metadados nem autoriza ignorar a guarda. Continuam proibidos EC2 direta e SQL/registros reais pelo agente; heap4096, DEV, historico e demais ambientes preservados.
