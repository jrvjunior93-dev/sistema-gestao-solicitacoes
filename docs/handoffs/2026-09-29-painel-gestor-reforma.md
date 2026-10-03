# Handoff — Reforma do Painel do Gestor (29/09/2026)

Branch `refactor/frontend`. Sem EC2, RDS, migration ou deploy.

## Escopo entregue (vale para as três abas)
1. **Modo TV** — botão no topo; classe `pg-modo-tv` redefine os tokens de fonte do painel
   (números crescem mais que rótulos). Preferência por usuário no banco
   (`usePreferenciaDeLista('painel-gestor', TIPO_GERAL)` → `{ modoTv }`).
2. **Ordenação** — arrasto e critério por aba; preferência por usuário e aba
   (`painel-gestor:ordem:<resultado-obras|custos-recebiveis|saldos>`, TIPO_BLOCOS,
   `{ criterio, ordemManual }`). Ordem manual manda até escolher critério; há volta ao manual.
3. **Olho** — `backend/src/services/painelGestorOlhoService.js`:
   - senha única de 4 dígitos (hash bcrypt em `configuracoes_sistema`, chave `PAINEL_GESTOR_PIN`),
     definida em `/configuracoes-painel-gestor` (critério `status_vinculos`);
   - estado por usuário (`PAINEL_GESTOR_OLHO_FECHADO:<userId>`), sobrevive a recarregar, sair e
     outro dispositivo;
   - fechado: GETs do painel devolvem valores `null`, cabeçalho `X-Painel-Valores-Ocultos: 1`,
     `Cache-Control: no-store`; `POST /painel-gestor/saldos` → 423;
   - abrir: 403 PIN_INVALIDO / 429 PIN_BLOQUEADO (5 por usuário, 20 por IP, 15 min, em memória) /
     409 PIN_NAO_CONFIGURADO; auditoria por `registrarEventoSeguranca`.
   - A aba Custos e Recebíveis do painel não chama mais rotas do módulo com valores
     (`buscarPrazos={false}`, `buscarObrasRemotas={false}`).
4. **Polimento** — Consolidado do período com número principal e secundários; card de obra
   único para pública/privada (`CardObraPainel`); textos de apoio enxugados.

## Commits
`e75fb48c` (tela da senha), `4e5cc7c0` (backend do olho), `ac376be4` (props do Dashboard CR),
`8aab756e` (tela do painel e registro de saldos).

## Validações
- `node backend/scripts/validarPainelGestorOlho.js`, `validarPainelGestor.js`, 12 testes do módulo CR: ok.
- Frontend: build ok; `validarLayout` 19 (linha de base 58, nenhuma nova); demais validadores
  com as mesmas falhas antigas.
- Prova E2E local e matriz do preview: ver relatório da sessão.

## Riscos / pendências
- O preview (`backend-dev`) só terá o olho depois do deploy do backend desta branch; sem a rota,
  o botão do olho não aparece (404 tratado) e o painel funciona como antes.
- Contador de tentativas em memória: reinício do processo zera.
- Após o deploy, o administrador deve cadastrar a senha; sem ela, quem ocultar não consegue
  mostrar (409 PIN_NAO_CONFIGURADO, mensagem na tela).
