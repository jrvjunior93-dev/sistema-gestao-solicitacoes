# DP - selecao de colaboradores para solicitar pagamento

## Pedido e estado

Implementado localmente na refactor/frontend. Botao da linha abre somente
aquele colaborador; coluna de selecao no inicio da lista define o grupo do
botao geral; sem marcacao abre todos do local. Sem commit, push, main, EC2,
migration ou acesso ao banco real. outputs/ permanece fora do Git.

## Arquivos e comportamento

- RhDpPessoal.jsx: capacidade `selecao` do TabelaPadrao, incluindo celular;
  somente ativos com local sao elegiveis e so quem pode abrir solicitacoes
  recebe a marcacao. Busca conserva selecionados ocultos; releitura atualiza
  vinculos/remove inativos; trocar usuario/local/filtro de obra limpa marcacao.
  Selecao global do DP nao mistura obras/centros: solicita grupo do mesmo local.
- RhDpPagamentoModal.jsx: POST envia colaborador_id ou colaborador_ids.
  Modal existente, calculos, moeda, conferencia e autosave preservados.
- rhPagamentoSolicitacaoService.js: valida IDs, quantidade (1..100), duplicados,
  escopo e ativos. Snapshot inicial possui somente os escolhidos, marcados.
  Sem selecao conserva roster geral. Lock da obra serializa criacao e busca
  rascunho do mesmo usuario/local/grupo (IDs ordenados), sem duplicacao.
  Grupos diferentes nao reutilizam rascunho geral ou edicoes de outro grupo.
  Escopo fica em dados_json e PUT nao pode altera-lo nem acrescentar linhas.
- Rascunhos individuais legados com roster inteiro nao sao cortados nem
  sobrescritos: continuam consultaveis pelo ID; novo botao cria outro restrito.
  Geral legado e individual legado ja restrito podem ser reabertos normalmente.
  Pedidos enviados/gerados e titulos existentes nao sao modificados.
- validarRhPagamentoSolicitacao.js e validarRhPessoalPorLocal.mjs: novos casos
  reais do servico em memoria e da interface; README RH/DP atualizado.

## Validacoes

- Backend: validarRhPagamentoSolicitacao.js, test:rhdp-pessoal-solicitacao,
  test:rhdp-regras-pagamento e sintaxe do servico aprovados, sem banco/rede.
- UI real: validarRhPessoalPorLocal.mjs nos modos legado, etapas e gerencial;
  individual ignora outra marcacao, coletivo restrito, fallback todos, marcar
  todos, busca, troca de local, centros, inativos, permissoes e celular.
- validarRhPagamentoSolicitacaoUI.mjs: regressao moeda/vazios, dias, diaria,
  reembolso manual, conferencia, autosave/rede lenta, Obra/DP aprovada.
- Servico: grupo conserva snapshot no DP e gera somente seus titulos/fila;
  adulterar IDs/escopo, inativos, local sem acesso e conflitos sao rejeitados;
  reabrir mesmo grupo/dupla criacao nao duplica; legado preservado.
- Capturas individual desktop e grupo celular inspecionadas em outputs/.
- Build frontend e documentacao aprovados. Diff final conferido.

## Impacto e proximo passo

Frontend e backend devem ser atualizados juntos para restringir o roster.
Sem nova migration ou flag. Homologar na EC2 dev com usuario OBRA e DP,
incluindo reabertura de rascunho e envio real apos conferencia. Publicar somente
apos autorizacao do usuario. Pacote Pessoal/DP continua fora da main ate pedido
explicito de promocao. Nao executar deploy nem escrita no banco automaticamente.

Skill frontend-design usada para manter controles compactos e reutilizar a
capacidade de selecao corporativa existente, sem novo layout ou mensagens fixas.

## Publicacao autorizada

Usuario autorizou commit e push das pendencias na refactor/frontend em
10/10/2026. Publicacao restrita aos oito arquivos deste ajuste; outputs/
permanece fora do Git. Nao inclui main, deploy EC2, migration ou banco real.
Testes e build da implementacao acima aprovados; revalidacao do servico e
conferencia documental/diff antes do commit. Homologacao real em dev continua
pendente; frontend e backend precisam ser atualizados juntos.
