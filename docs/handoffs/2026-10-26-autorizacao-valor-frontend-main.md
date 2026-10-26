# Frontend da autorizacao parcial — aguardando backend

Backend publicado: 1ee8f8522c3b4baa43e9aa7af13802fb83f62f59. Aplicador SHA256: ff0db29de5bcdfc5a15a0f4943c34103e340fc36cb24c21beecde604d78724e2.

Este commit frontend fica local ate o usuario executar preparar/aplicar/conferir em producao e retornar AUTORIZACAO_VALOR_BACKEND_PROD_PRONTO. So entao publicar este commit por fast-forward na main, sem force, e conferir o build servido na Vercel. O push de backend mantem a interface anterior ate essa etapa.

QA aprovado: 16 scripts backend, 11 testes doctor/aplicador, build frontend, validarMoedaAutorizacao, validarAutorizacoesPorObra, validarAutorizacaoPwa e validarFilaInstrumentosUI. APIs/passkeys simuladas; nenhuma escrita remota ou restart por este agente.

Inclui autorizacao parcial individual/coletiva/por obra, observacao na fila, filtro por solicitacao e BRL durante a digitacao com cursor/Backspace/Delete/colagem. Preserva saldo original, permissoes, biometria e baixas parciais. Nao muda configuracao S3/NSDOCS, nao retoma carga e nao habilita automatico.

Candidato frontend reaplicado sobre a correcao 1ee8f852. A tentativa inicial parou sem schema/restart. Usuario deve executar corrigir-preflight com esse SHA e depois aplicar/conferir antes desta publicacao. Nenhuma diferenca funcional de frontend em relacao ao candidato c946eabc ja testado.
