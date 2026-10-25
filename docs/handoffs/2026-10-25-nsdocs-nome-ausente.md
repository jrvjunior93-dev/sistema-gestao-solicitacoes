# Nome do destinatario ausente na listagem NSDOCS

Sonda executada pelo usuario em PROD encontrou string vazia em destinatario_nome
em dois registros da janela de 01/02/2026 a 03/03/2026, pagina cheia com100linhas.
Este pacote aceita somente a string exatamente vazia nesse nome de listagem e
preserva a ausencia como ''. Nao inventa razao social nem substitui CNPJ. Valores
null, ausentes, nao textuais, caracteres de controle ou nomes longos continuam
recusados. Emitente, situacao, empresa, participantes, chave, datas, numero e
valor mantem as conferencias anteriores, assim como identidade/DV do XML.

Arquivos: normalize.js em nsdocsHistorical e validarNsdocsDestinatarioNome.js.
Testes:73 fiscais/complemento/historico incluindo7 novos cenarios e65 especificos
do DEV, total138. Cenario60notas com2nomes ausentes preserva46notas/XMLs/historico,
reutiliza46XMLs e baixa apenas14novos; replay nao duplica. SQLite em memoria e
transportes ficticios, sem rede/DB/S3 reais. Sem frontend ou permissoes alterados.

Publicacao autorizada como continuidade da correcao de paginacao/complemento.
Nenhuma implantacao EC2 DEV, chamada real, migration, alteracao de env/Node/PM2
ou carga executada pelo agente. Atualizacao operacional DEV deve continuar
separada e explicitamente solicitada. Ownership desta correcao liberado no commit.
