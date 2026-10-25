# CPF do emitente na base administrativa NSDOCS

Compatibilidade de NF-e com emitente CPF para historico manual administrativo.
Quatro arquivos comuns alterados: nsdocsHistorical/contract.js e normalize.js,
manual/query.js e xml.js. cpf() estrito11/DV; apenas emitente pode serCPF,
empresa/destinatario continuamCNPJ. Metadata tipoCPF e11digitos preservados;
coluna legada de identificador e usada pelo parser existente para ambos tipos.
XML exige tagCPF correspondente, sem CNPJ/CPF simultaneos/duplicados/namespace
falso; chaveCPFcompleta14somente na comparacao. Identidade/valores/datas/modelo,
XXE e chave permanecem conferidos. Assinatura nao validada, automatico OFF.

14novos testes incluindo SQLite60notas com2CPF:46anteriores e seusXMLs/historico
preservados,46reutilizados/14novos e replay sem duplicar. Total152testes DEV:
87fiscais/historico incluindo novos e65especificosDEV. Sem chamadas reais,
migration, restart, alteracao de ambiente/Node/PM2 ou atualizacao EC2 DEV.
O caminho administrativo PROD continua recusando execucao no DEV; este commit
nao promete ampliar a CLI especifica DEV de captura. Sem frontend/permissoes
ou filtros globais modificados, sem merge geral main/refactor. Reserva liberada.
