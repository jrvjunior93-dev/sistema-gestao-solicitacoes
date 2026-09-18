# Diretório global paginado de colaboradores

## Escopo

- `frontend/src/pages/RhDpTransferencias.jsx`: a aba consulta a primeira
  página ao abrir, sem exigir pesquisa. A busca continua opcional e a
  navegação usa o último filtro aplicado. A tabela padrão mantém a versão
  responsiva e exibe o total de páginas.
- `frontend/scripts/validarRhPessoalTransferencias.mjs`: cobre carregamento
  inicial, páginas 1 e 2, pesquisa e solicitação de transferência.
- O endpoint existente `GET /rh/transferencias/diretorio` já limita a consulta
  a 50 colaboradores ativos por página e projeta somente identificação
  profissional e obra atual. Nenhum backend, permissão ou dado financeiro foi
  alterado.

## Validações

- `npm run build` no frontend: passou.
- Teste de interface de transferências: passou, sem API externa; executado
  sem sobrescrever imagens preexistentes em `outputs/`.
- `node scripts/validarRhPessoalFluxo.js` no backend: passou com mocks,
  inclusive as negativas de permissão esperadas; sem banco.
- `git diff --check`: passou.

## Próximo passo

Homologar no ambiente dev com um usuário vinculado a obra para conferir a
contagem real de colaboradores e as permissões. Alteração local ainda sem
commit ou deploy; não houve acesso a EC2, RDS ou Vercel. As alterações
anteriores do aviso de UN nas compras e `outputs/` não fazem parte deste
escopo.
