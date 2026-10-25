# Correcao de destinatario_nome vazio na listagem

## Evidencia recebida

Usuario executou a sonda local por SSH/stdin em PROD. Na primeira janela pendente
01/02/2026 a 03/03/2026, Pendente, quantidade100/offset0, duas linhas tinham
destinatario_nome string vazia. Normalizacao retornou NSDOCS_CAMPO_INVALIDO.
Sonda:1GET, zeroXML/RDS/S3writes, plano inalterado. Nao foi queda de SSH.

## Correcao

Somente normalize.js aceita o valor exatamente '' em destinatario_nome da
listagem e mantem recipient_name=''. Nao deduz nome a partir da empresa, XML,
outro documento ou fornecedor e nao atribui status/validade fiscal. Null, campo
ausente, valores nao textuais, nomes longos ou de controle continuam recusados.
Chave, CNPJs/participantes, datas, numero, valor, emitente e situacao permanecem
obrigatorios. Validacao estrutural/identidade/DV do XML permanece inalterada;
assinatura digital ainda nao e validada. Modelo/API e automatico OFF preservados.

## Validacoes

- Main:91 testes fiscais/complemento/historico/vinculos/dossie, incluindo7 novos.
- DEV:138 testes (73 fiscais/historico incluindo novos e65 especificosDEV).
- Operador e sonda:17 testes. Permissoes granulares:0invalidas/duplicadas.
- Pagina cheia100 com nomes vazios e subdividida, nunca anunciada completa.
- SQLite com60notas/2nomes ausentes conserva as46notas/XMLs/historico, reutiliza46,
  baixa14novos e replay nao duplica; XML com identidade divergente continua negado.
- Nenhuma chamada real, escrita RDS/S3, migration ou restart executado pelo agente.

## Publicacao e implantacao

Delta comum normalize.js/QA publicado primeiro em refactor/frontend, depois main
com sonda, operador novo, manifesto de hashes e este registro. Nenhum merge geral
de branches; nenhum frontend ou arquivo de dependencia alterado nesta correcao.
Base main953b6a3a, EC2 aceita tambem03c91cfe com backend equivalente. Aplicador
novo atualizar-prod-nsdocs-nome-20261025.cjs: preparar/aplicar/conferir/voltar.
Nao reutilizar ou alterar operadores/manifestos antigos.

Preparar confere origem/main exata, hashes, backend equivalente, checkout limpo,
runtime, PM2/Nodes/env/dumps, health, bloqueios e arquivos privados. Salva backup
privado do unico runtimefile. Aplicar exige backup/timer e flag especifica, faz
FF e QA offline, compara planos original/complemento, journal e credencial antes
e depois. Nao reinicia nenhum processo, nao faz API/NSDOCS/S3/DBwrites/migration.
Retorno restaura apenas normalize.js, mantem HEAD e tracked alterado esperado;
nao reverte banco, planos ou historico. Lock de outra operacao nunca e removido.

## Retomada

Depois de usuario enviar NSDOCS_NOME_PROD_APLICADO e CONFERIDO, continuar
--descobrir com MESMO ID c456781c-4393-468b-858f-dbf220d8f215. Nao --preparar
novamente, nao criar plano nem apagar locks. Primeiro1consulta e conferencias;
somente depois ampliar rodadas. Enumere toda a cobertura antes de XMLs. Primeiro
XML apenas apos enumeration_complete=true, needs_review=false,
source_documents_missing=0 e totais conferidos no mesmo CNPJ/periodo/modelo.
Ownership de implementacao liberado no commit; implantacao/carga real pendente
da execucao manual do usuario. Outputs/ e checkout auxiliar fora do Git.
