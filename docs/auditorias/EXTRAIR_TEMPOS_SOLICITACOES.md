# Extracao completa para auditoria de tempos

O operador executa os comandos no ambiente autorizado e envia o arquivo resultante.
O agente nao acessa EC2 nem banco. Este pacote e independente do runtime: nao requer
git pull, commit, migration, npm install ou reinicio de PM2. Nao le o .env.

## Conteudo

- `backend/scripts/auditarTemposSolicitacoes.js`: CLI de extracao/analise.
- `backend/scripts/auditoriaTemposSolicitacoes/extracao.js`: consultas projetadas.
- `backend/scripts/auditoriaTemposSolicitacoes/engine.js`: analise offline.
- `backend/scripts/extrairTemposSolicitacoes.sh`: comando interativo de extracao.
- `backend/scripts/validarAuditoriaTemposSolicitacoes.js`: teste sintetico sem banco.

O pacote inclui apenas codigo e documentacao. Nao inclui acessos nem dados reais.

## Executar no Ubuntu

1. Transfira o arquivo `auditoria-tempos-fluxy.tar.gz` para a pasta pessoal do
   usuario da EC2, usando a conexao que voce ja utiliza.
2. Execute o bloco abaixo. Ele cria uma pasta nova fora do checkout da aplicacao.

```bash
(
  set -e
  umask 077
  FLUXY_AUDITORIA_DIR=$(mktemp -d "$HOME/fluxy-auditoria-tempos.XXXXXX")
  tar -xzf "$HOME/auditoria-tempos-fluxy.tar.gz" -C "$FLUXY_AUDITORIA_DIR"
  cd "$FLUXY_AUDITORIA_DIR"
  sha256sum -c PACOTE_SHA256SUMS.txt
  node backend/scripts/validarAuditoriaTemposSolicitacoes.js
  bash backend/scripts/extrairTemposSolicitacoes.sh
)
```

O script solicita host, nome do banco, usuario, senha, porta e caminho opcional do
certificado CA. Os campos de acesso ficam ocultos; informe-os somente no terminal,
nunca no chat. Sao mantidos apenas no processo, sem criar arquivo de credenciais.
Para usar um backend em outro diretorio, passe seu caminho como primeiro argumento:
`bash backend/scripts/extrairTemposSolicitacoes.sh /caminho/do/backend`.

A conexao valida TLS e exige snapshot consistente em tabelas InnoDB. O pacote envia
comandos de sessao, START TRANSACTION READ ONLY, SELECTs e ROLLBACK. Nao possui modo
de escrita. Nao desative a validacao TLS para contornar erro de certificado.

## O que retornar

Ao terminar, sera mostrado o caminho de
`outputs/extracao-completa-DATA-PID.tar.gz`. Baixe **esse arquivo** e envie para
analise offline. Ele contem `historico.json`, `manifesto.json`, `consultas.json`,
`SHA256SUMS.txt` e `CONCLUIDO.txt`. Nao envie o checkout, .env, certificado,
node_modules ou as pastas de testes sinteticos `auditoria-extracao-qa-*`.

O `historico.json` inclui todas as solicitacoes disponiveis antes do corte,
encerradas/canceladas/abertas, e suas evidencias de interacao. Nao e um dump de
todo o banco: somente campos necessarios para o estudo, sem conteudo de comentarios,
arquivos, senhas, tokens, emails, dados bancarios ou URLs de anexos.
Nomes de colaboradores e IDs fazem parte da auditoria por usuario solicitada.

O horario de corte vem do banco; os horarios sao preservados sem converter o fuso.
O manifesto guarda fontes ausentes, tipos temporais, cobertura e codigo executado.
Limites padrao: 20.000 solicitacoes e 500.000 linhas lidas, inclusive metadados.
Se excedidos, a execucao aborta sem arquivo de sucesso; nao entrega uma amostra.
Nesse caso, envie a mensagem para dimensionarmos o limite integral, sem recortar datas.
SELECTs podem consumir recursos: executar em janela apropriada ao ambiente.

## Analise apos receber

Verificar hashes e manifesto antes de gerar os indicadores. Executar no computador
de analise, na pasta do pacote:

```bash
node backend/scripts/auditarTemposSolicitacoes.js --entrada=/caminho/historico.json --historico-completo --fuso-banco=servidor
```

Estudar entrada no setor, primeira leitura/acao, intervalos do mesmo usuario,
permanencia por passagem, retornos, esperas e cobertura. Nenhum prazo, contador
ou bloqueio do POP sera implantado por esse procedimento.
