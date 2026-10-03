# Handoff — ADM Local e Locação com apropriação automática

Atualizado em: 2026-08-25 10:59:58 -03:00

## Escopo concluído

- `ADM_LOCAL_DE_OBRA` usa `1 — ADM LOCAL DE OBRA`.
- `LOCACAO_DE_MAQ_EQ` usa `2 — LOCAÇÃO DE MAQ. e EQ.`.
- As apropriações são distintas e a regra é validada no serviço, na API administrativa e na criação da obra.
- A regra vale para novas obras e novas solicitações. Nenhuma solicitação ou título legado foi saneado.
- Contrato, rateio contratual e apropriação editável ficam ocultos e não obrigatórios nesses dois tipos.
- A Nova Solicitação consulta e exibe a apropriação automática, mas o backend resolve novamente o vínculo e é a autoridade final.
- Novas obras `OBRA` criam as duas apropriações e os dois vínculos na mesma transação. `CENTRO_CUSTO` não recebe os padrões.
- Solicitações novas persistem a apropriação e metadados de origem no histórico; títulos derivados herdam o campo pelo serviço financeiro existente.
- A tela de vínculos lista obras ativas, aceita somente apropriações ativas e analíticas, mostra pendências e informa os padrões das novas obras.
- O salvamento administrativo usa lock transacional por obra para proteger requisições concorrentes.

## Arquivos do escopo

### Backend

- `backend/src/services/obraTipoApropriacaoPadraoService.js`
- `backend/src/controllers/ObraTipoApropriacaoController.js`
- `backend/src/controllers/ObraController.js`
- `backend/src/controllers/SolicitacaoController.js`
- `backend/src/services/novaSolicitacaoCamposConfig.js`
- `backend/src/services/tipoSolicitacaoBehaviorService.js`
- `backend/src/routes.js`

### Frontend

- `frontend/src/services/solicitacoes.js`
- `frontend/src/services/configuracoesSistema.js`
- `frontend/src/utils/novaSolicitacaoCampos.js`
- `frontend/src/utils/tipoSolicitacao.js`
- `frontend/src/pages/NovaSolicitacao.jsx`
- `frontend/src/pages/NovaSolicitacaoCamposConfig.jsx`
- `frontend/src/pages/ObraTipoApropriacao.jsx`

### QA e documentação

- `qa/obra-tipo-apropriacao-automatica/01-fluxo-seguro.js`
- `docs/regras_negocio/PLANO_FLUXO_ADM_LOCAL_LOCACAO_APROPRIACAO_AUTOMATICA.md`
- este handoff

## Validações executadas

- migrations locais conferidas: 188 arquivos e 188 registros aplicados; nenhuma pendente;
- nenhuma migration nova foi necessária;
- `node --check` aprovado nos arquivos backend alterados e na suíte nova;
- `npm run build` do frontend aprovado: 363 módulos transformados;
- `git diff --check` do escopo sem erro de whitespace (somente avisos de normalização CRLF em arquivos preexistentes);
- `node qa/obra-tipo-apropriacao-automatica/01-fluxo-seguro.js` aprovado;
- a suíte criou uma obra temporária dentro de transação, gerou/resolveu os dois vínculos, fez rollback e confirmou que a obra não permaneceu no banco;
- as suítes antigas `qa/obra-tipo-apropriacao` não foram executadas por terem limpeza insegura para o banco compartilhado;
- o backend existente na porta 8100 não foi reiniciado; uma tentativa de iniciar outra instância foi recusada pelo próprio servidor ao detectar a porta ocupada;
- frontend local iniciado em `127.0.0.1:5273` para inspeção; as duas abas disponíveis estavam em `/login`, portanto não houve navegação autenticada nem gravação por interface.

## Riscos e limites conhecidos

- obras antigas precisam receber manualmente os dois vínculos antes de abrir novas solicitações desses tipos;
- retirar um vínculo bloqueia somente novas solicitações; registros antigos permanecem imutáveis;
- o legado ainda possui solicitações e títulos sem apropriação e será tratado apenas na auditoria separada autorizada pelo proprietário;
- a árvore de apropriações de uma obra pode ser grande; a busca administrativa continua limitada a 200 resultados por consulta;
- o build informa apenas que a base `caniuse-lite` está desatualizada; não é falha da entrega.

## Próximo passo exato

Com uma sessão administrativa autenticada no navegador local, validar sem salvar dados:

1. abrir `/obra-tipo-apropriacao` e conferir padrões, pendências e filtro;
2. abrir `/nova-solicitacao`, selecionar uma obra já vinculada e cada um dos dois tipos;
3. confirmar que contrato e apropriação editável não aparecem e que a faixa somente leitura mostra o vínculo correto;
4. selecionar uma obra sem vínculo e confirmar o bloqueio explicativo;
5. depois, em janela de manutenção, criar uma obra de teste real somente se for desejado validar a transação também pela interface.
