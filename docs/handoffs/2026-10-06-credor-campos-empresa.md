# Credor PJ: nome fantasia e representante no formulario

## Causa e alcance

Relato: cadastro de credor na Nova Solicitacao exige nome fantasia, mas nao
oferece entrada para ele. `criarParceiro` exige nome fantasia, nome e CPF do
representante quando o documento identifica PJ e o cadastro e completo.
O modal da Nova Solicitacao e a tela Pessoas/Parceiros nao tinham esses campos.
Os detalhes da solicitacao (`FinanceiroCard`) ja os exibem para CNPJ e os enviam.
Compra Direta possui excecao explicita no backend: cadastro completo desligado.

## Alteracoes

- Componente `frontend/src/components/parceiros/DadosEmpresaParceiro.jsx`:
  secao compacta com nome fantasia, nome/CPF/cargo do representante. Aparece
  somente para documento com 14 digitos; campos editaveis e rotulados, usando
  FormSecao/CampoForm e tokens existentes. Cargo continua opcional.
- Helper `frontend/src/utils/dadosEmpresaParceiro.js`: validacao alinhada a
  criacao completa de PJ; CPF de pessoa fisica nao exige campos de empresa.
- NovaSolicitacao: estado, secao e validacao antes do envio; representante_cpf
  enviado so com digitos. Preserva endereco unico, PIX adicionais opcionais,
  trava sincrona de envio, obra/tipo/destino e vinculo/credor avulso com contrato.
- Pessoas/Parceiros: estado inicial e hidratacao da edicao preservam dados de
  empresa; campos habilitados; criacao exige os dados de PJ, edicao nao exige
  completar campos ausentes de registros legados. CPF informado e validado.
- Compra Direta: campos disponiveis, mas opcionais como no endpoint existente.
  Nao altera sua obrigatoriedade; CPF de representante preenchido e validado.

## Dependencias preservadas

- Nova: POST /solicitacoes/credores, configuracao `cadastro_credor` por tipo,
  validacao de endereco/primeira PIX, selecao e vinculo a contrato existentes.
- Pessoas: POST /parceiros e PATCH /parceiros/:id, controle de cadastros atual.
- Compra Direta: POST /compras/solicitacoes-diretas/credores, controles atuais,
  `exigirCadastroCompleto: false` mantido sem alterar backend.
- Detalhes: cadastro de credor financeiro existente inspecionado; ja funcional
  para os campos de PJ. Teste de regressao verifica entradas e payload.
- Nenhuma permissao, endpoint, schema, dado existente ou variavel de ambiente
  alterada. Cadastros de favorecido simplificado e de clientes do Comercial/
  cheques nao sao redesenhados por esta correcao de credor.

## Validacoes locais

- `node scripts/validarCredorNovaSolicitacao.mjs --ui --capturas` (frontend):
  passou. Handler real em VM, controller/normalizador reais com persistencia
  substituida. Normalizador agora testa `exigirCadastroCompleto: true` para
  reproduzir a regra real de criacao. PF, PJ completa, campos ausentes, CPF
  invalido, PIX, endereco, permissao negada, falha e clique simultaneo.
- Fixture local no Edge: JSX real do modal/componentes e CSS do sistema, API
  substituida, 1280/390px nos temas claro/escuro. Campo habilitado, entrada,
  mensagem de pendencia, envio normalizado e ausencia de overflow validados.
  Capturas em outputs/credor-pj (fora da publicacao) inspecionadas visualmente.
- `node scripts/validarDadosEmpresaCredor.mjs`: passou. Funcoes reais de
  salvar/hidratar Pessoas e de salvar Compra Direta isoladas; criacao, edicao
  legada, preservacao dos dados, normalizacao e dados opcionais validados.
- `npm run build` (frontend): passou, 530 modulos. Avisos existentes de
  Browserslist desatualizado e chunk grande, sem instalar/atualizar dependencias.
- `git diff --check`: passou.
- Regressoes `validarPayloadSolicitacaoCompra.mjs` e
  `validarPagamentoMedicaoLegada.mjs`: passaram (frontend).

## Estado e proximo passo

Implementacao local concluida, sem commit/push/deploy. Publicar somente apos
autorizacao. Este ajuste requer apenas frontend atualizado; nenhuma migration,
variavel ou reinicio de backend. Apos deploy, validar com usuario da Obra o
cadastro de um credor real PJ no fluxo operacional (nao criar dados ficticios
em producao). Testes nao acessaram banco, EC2, Redis, S3 ou API de producao.
Skill frontend-design usada para evoluir componente reutilizavel com identidade
utilitaria existente, sem novo padrao visual ou mudanca de navegacao.

## Publicacao autorizada - 06/10/2026

No pedido seguinte, proprietario autorizou commit/push e retorno a main.
Worktree ja em main, sem merge adicional. Publicar apenas os arquivos deste
ajuste, preservando outputs/ e outros checkouts. Testes focados reexecutados
antes do commit. Deploy da Vercel permanece por confirmar; nao houve operacao
na EC2 nem alteracao de ambiente ou dados de producao.
