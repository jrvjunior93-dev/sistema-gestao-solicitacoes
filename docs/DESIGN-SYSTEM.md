# Fluxy — Design System (navegação e cores)

Referência da reforma visual/navegacional. **Nenhuma regra de negócio,
rota ou permissão muda por este documento** — ele governa apenas a camada
visual e de navegação.

- Tokens: `frontend/src/styles/design-tokens.css` (novos) e
  `frontend/src/index.css` (`:root` claro / `.dark` escuro).
- Tema customizável pelo admin: `frontend/src/contexts/ThemeContext.jsx`
  (`TEMA_PADRAO`). O ThemeContext só aplica inline o que **difere** do
  padrão — os valores padrão vivem no CSS, para o modo escuro funcionar.
- Fonte única de navegação: `frontend/src/navigation/navigationConfig.jsx`.

---

## 1. Paleta semântica (o significado NUNCA muda de tela para tela)

| Família | Claro (texto) | Escuro (texto) | Significado |
|---|---|---|---|
| `--sem-danger` | `#b32020` (6.7:1) | `#ce6e6e` (4.7:1) | erro, falha, bloqueio, exclusão, vencido, saldo estourado |
| `--sem-warning` | `#9a5b06` (5.4:1) | `#bd945d` (5.8:1) | atenção, pendência, aguardando ação, prazo próximo |
| `--sem-success` | `#116149` (7.4:1) | `#649889` (4.9:1) | sucesso, aprovado, pago, concluído |
| `--sem-info` | `#22447f` (9.5:1) | `#788db1` (4.8:1) | informação, ação primária neutra, em andamento |
| `--sem-neutral` | `#5b6472` (6.0:1) | `#949aa3` (5.7:1) | inativo, cancelado, arquivado |

Cada família tem também `-bg` (fundo suave) e `-border`
(ex.: erro claro = fundo `#fdeceb`, borda `#f3c9c7`). Os contrastes acima
foram validados WCAG AA sobre a superfície de cada tema; o texto da
família sobre o próprio fundo suave também passa de 4.4:1.

**Regras:**

1. Nunca use cor solta em componente — sempre `var(--sem-*)`,
   `var(--status-*)` ou `var(--module-*)`.
2. Cor sozinha não comunica: estado semântico sempre = **cor + ícone +
   texto** (o `StatusBadge` já faz isso).
3. Vermelho é **exclusivo** de erro/exclusão/vencido. Nenhum módulo, botão
   neutro ou decoração usa vermelho.

## 2. Etiquetas de status (todas as listas)

Componente único: `frontend/src/components/StatusBadge.jsx`.

- Formato: pílula com **fundo suave** da família + texto na cor semântica
  escura + ícone. Nunca bloco de cor sólida em lista.
- O componente classifica o texto do status na família certa
  (`familiaSemanticaDoStatus`); force com `kind="danger|warning|success|info|neutral"`
  quando o rótulo não for autoexplicativo.
- Cores por setor configuradas em *Configurações → Cores do Sistema*
  continuam valendo e entram no mesmo formato suave.

```jsx
<StatusBadge status="VENCIDO" />            // família inferida (danger)
<StatusBadge status="Aberto" kind="info" /> // família forçada
```

## 3. Botões

Tokens `--btn-*` (claro e escuro):

1. **Um primário por tela** — ação principal, sólido `--btn-primary-bg`
   (azul da marca).
2. **Secundários** — contorno (`btn-outline` / `btn-secondary`).
3. **Destrutivos** (excluir, cancelar, rescindir) — sempre
   `--btn-danger-bg` (vermelho semântico) e **nunca adjacentes ao botão
   primário**: deixe um botão neutro entre eles ou alinhe o destrutivo no
   canto oposto do rodapé/modal.

## 4. Identidade por módulo (só no ícone)

O card de módulo é **neutro** (superfície e borda padrão). A cor de
identidade aparece **apenas no ícone** — sem barra colorida, sem fundo
colorido. Tokens `--module-<id>` em `design-tokens.css`, agrupados em
famílias para dar coerência:

| Família | Módulos |
|---|---|
| Operação (azuis/azul-esverdeado) | Painel `#2d5c8f` · Solicitações `#3a5f9e` · Comunicação `#256f7a` · Biblioteca `#1d6f66` · Treinamento `#4a5da8` · Provisionamento `#37607d` · SST `#1f5170` |
| Dinheiro (terrosos e verdes) | Compras `#8a5a12` · Financeiro `#146152` · Fiscal `#3f6a5a` · Contratos `#7a5a2e` · RH/DP `#4d6b33` |
| Relacionamento (roxos) | CRM `#5b4a91` · Comercial `#6b4f8f` |
| Estrutura (ardósia) | Cadastros `#4f5a68` · Administração `#3f4650` · Configurações `#59626e` · Conta `#5b6472` |

Nenhum tom avermelhado. Variantes do modo escuro (clareadas até ≥3:1
sobre a superfície escura) estão no bloco `.dark` do mesmo arquivo.
O contador de pendências no card usa o tom de **atenção** ou **neutro**,
nunca a cor de identidade.

## 5. Navegação — como adicionar um item (NUNCA duplique a lista)

Fonte única: `frontend/src/navigation/navigationConfig.jsx`. Hub
principal, hubs de módulo, breadcrumb e busca Ctrl+K leem TODOS desta
árvore.

Para adicionar uma tela nova:

1. Crie a rota no `frontend/src/App.jsx` (com o guard de permissão igual
   às demais).
2. Adicione o nó no módulo certo em `navigationConfig.jsx`:

```jsx
{
  id: 'fin-nova-tela',              // estável e único
  label: 'Nome curto da tela',
  desc: 'Uma linha do que se faz nela.',
  icon: HiOutlineAlgumaCoisa,       // react-icons/hi2, associação literal
  to: '/financeiro/nova-tela',
  can: (user) => canAccessFinanceiro(user) // MESMA função do guard da rota
}
```

3. Rode `node scripts/validarNavegacao.mjs` (em `frontend/`): falha se
   houver link morto ou destino perdido.

Para um módulo novo, adicione a entrada em `NAV_MODULES` com `gate`,
crie `--module-<id>` (claro + escuro) em `design-tokens.css` e em
`TEMA_PADRAO.moduleAccents`.

Regras herdadas da árvore (não reimplemente em outro lugar):

- Card que o usuário não pode acessar **não renderiza**.
- Módulo com todos os subitens bloqueados ou desativado na configuração
  **não aparece** no nível 1 (os predicados `can`/`gate` reutilizam
  `hasEnabledModule` e as funções de `utils/acessoProduto.js`).
- Módulo com um único subitem navega direto para a tela (sem hub
  intermediário).

## 6. Pendências do Hub

Faixa "Suas pendências" acima do grid (some quando vazia) e contadores
discretos nos cards. Origem dos números e SQL de conferência:
`docs/PENDENCIAS-SQL.md`.

## 7. Modo claro e escuro

- O modo escuro é a classe `.dark` no `<html>`.
- Todo token novo precisa de valor nos dois blocos (`:root` e `.dark`).
- Nunca defina cor via estilo inline no `<html>`/`documentElement` — isso
  vence a classe `.dark` e quebra o tema escuro (foi exatamente o bug
  corrigido no ThemeContext).
- Valide contraste nos dois temas; o gerador/validador usado na reforma
  está no histórico do PR (razões de contraste por token).
