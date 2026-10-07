# Fornecedor opcional e planilha de colaboradores

## Objetivo e estado

Representante legal opcional no cadastro de fornecedor de Compras. Exportacao XLSX do cadastro de colaboradores e modelo para atualizar mensalista/diarista pela reimportacao. Implementacao concluida e validada no checkout `C:/Fluxy-refactor-frontend`, branch `refactor/frontend`, sobre `38c771fb19a93b5ccea0b44aaf05e625a6760b97`. Ainda sem commit, push ou deploy desta tarefa.

## Regras aplicadas

Regra esclarecida posteriormente pelo usuario: nome/CPF do representante sao opcionais em todo cadastro geral, nao somente em Compras. Nome fantasia continua obrigatorio para nova PJ no cadastro completo, e CPF preenchido e validado. Qualificacao contratual acima do limite configurado permanece obrigatoria. Ver `2026-10-07-representante-legal-somente-contratos.md` para o ajuste complementar. Contato comercial, ID do fornecedor e cotacoes sao preservados.

O Excel exporta todos os colaboradores no escopo autorizado, sem filtros de tela, inclusive inativos/afastados. A pedido do usuario, `Baixar modelo (Excel)` tambem vem preenchido com os cadastros existentes, e nao vazio. Acesso global inclui colaboradores sem obra; escopo limitado nao vaza outras obras. CPF, matricula e dados bancarios sao texto; valores sao numericos. O modelo e a exportacao possuem orientacoes e lista de selecao em `Tipo_Pagamento` (MENSALISTA/DIARISTA). A exportacao exige leitura e registra evento de seguranca sem dados pessoais. Modelo/importacao exigem edicao.

Na reimportacao, CPF identifica o cadastro e conflitos com matricula sao rejeitados. Para existentes, somente regime, diaria e automatico 40/60 sao enviados ao servico transacional de atualizacao. Campos vazios preservam valores; salario, empresa, obra, identidade e banco nao sao atualizados por esse caminho. Novo diarista exige diaria positiva e nao usa automatico 40/60. O historico por vigencia existente exige data efetiva quando `RH_JORNADA_40_60_ETAPAS=ON`; erro reverte a linha. Linhas validas sao processadas mesmo quando outras falham. Resultado inclui `atualizados`, alem dos campos anteriores.

## Arquivos

- Backend: `src/services/parceiroService.js`, `comprasFornecedorService.js`, `rhService.js`, novo `rhColaboradoresPlanilhaService.js`, `src/controllers/RhColaboradorController.js` e `src/routes.js`.
- Frontend: `src/utils/dadosEmpresaParceiro.js`, `src/components/parceiros/DadosEmpresaParceiro.jsx`, `src/modules/solicitacao-compra/pages/GestaoFornecedores.jsx`, `src/pages/RhDpColaboradores.jsx` e `src/services/rhDp.js`.
- Testes: `backend/scripts/validarEmpresaFornecedorCompra.js`, novo `backend/scripts/validarRhColaboradoresPlanilha.js`, `frontend/scripts/validarEmpresaFornecedorCompra.mjs` e novo `frontend/scripts/validarRhColaboradoresPlanilha.mjs`.
- Guias canonicos: `docs/modulos/compras/README.md` e `docs/modulos/rh-dp/README.md`.

## Validacoes

- Backend sem banco/rede: fornecedor com/sem representante; cadastro geral com representante opcional; CPF invalido; rollback; XLSX real; zeros iniciais; numericos; exportacao scoped sem filtros; preservacao de salario/banco/vinculo; reimportacao identica; vigencia; CPF/matricula conflitantes; duplicidade no arquivo; novo colaborador e obras nao autorizadas.
- Frontend: handlers reais com permissoes, protecao sincrona antes de confirmar importacao, duplo download, cancelamento/falha e contadores. Telas reais em navegador local com APIs simuladas: salvar fornecedor sem representante; downloads de cadastro/modelo; temas claro/escuro; celular; sem rede externa.
- Excel sintetico inspecionado e renderizado com Artifact Tool somente para QA em `outputs/rh-colaboradores-planilha/`. Nao contem dados de producao e nao deve ser publicado como relacao real.
- `npm run build` frontend passou; avisos preexistentes de Browserslist desatualizado e bundle maior que 500 kB.
- `npm run test:docs` backend e `git diff --check` passaram.
- Modelo preenchido: controller real gera XLSX com cadastros atuais,
  ignora filtros e respeita escopo. Reimportacao do modelo inalterado nao
  duplica colaboradores nem altera calculos; teste isolado sem banco/rede.

## Riscos e proximo passo

Sem migration, dependencia nova ou variavel nova. Requer publicar backend e frontend juntos, pois os downloads XLSX sao endpoints novos. Publicacao depende de autorizacao do usuario. Depois, em RH/DP > Colaboradores, usar `Exportar todos (Excel)` para obter a relacao real; nenhuma consulta/exportacao de producao foi executada nesta tarefa.

Antes de importar dados reais, revisar as colunas de calculo e vigencia. O fluxo pode atualizar calculos futuros e nao substitui pedidos formais de salario ou transferencia. Nao inserir dados diretamente no banco de producao.

Preservar as auditorias e os artefatos preexistentes nao rastreados. `docs/workspace/OWNERSHIP_ATIVO.md` possui alteracoes anteriores desta conversa: nao incluir o arquivo inteiro indiscriminadamente ao commitar.
