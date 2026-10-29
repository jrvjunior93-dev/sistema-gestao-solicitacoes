# Diagnostico somente leitura dos modos PROD

Operador confirmou hashc28b4da503c1caf5cb0d72a21d8a8e8270501ccc5491100b504c604d74a24fe3
e recebeu novamente RETOMADA_MODO_NAO_REVISADO. A correcao restritiva0600/0640
nao foi suficiente. Nao presumir modo efetivo; nao ampliar a regra novamente
antes da evidencia. Erro ocorre na guarda antes de QA/restart dessa invocacao.

Reservados somente diagnostico/testes locais em outputs/diagnostico-titulos-
adicionais-prod-20261028/conferir-modos* e documentacao de controle. Novo script
le somente estado privado conhecido e lstat dos23 caminhos fixos do pacote.
Exibe caminho relativo, tipo/modo registrado, modo atual, regularidade e dono
ubuntu; nao imprime backups/conteudos, nao le env/XML/credenciais ou fontes,
nao executa Git/PM2/comandos, nao cria locks, nao altera estado/permissoes.

Oito testes/sintaxe/diff PASS: modos0644/0600/0664/0755, valores malformados
sanitizados, novo arquivo ausente, symlinks finais e de diretorio, release
divergente, caminho de env recusado e inventario exato23 do aplicador. Nenhum
acesso remoto/SQL/restart pelo agente. Codigo de funcionamento e retomador
publicado permanecem intactos neste turno. Diagnostico nao foi executado na EC2.

Proximo passo: operador confere SHA256 e envia script por node - na raiz PROD;
revisar modo_registrado/modo_atual dos arquivos recusados e estado_preservado.
Nao repetir aplicar/preparar/restart nem chmod/apagar locks/estado. Somente
depois da evidencia definir tratamento minimo para permissoes efetivas.
