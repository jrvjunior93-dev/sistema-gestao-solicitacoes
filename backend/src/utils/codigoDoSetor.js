'use strict';

/**
 * O CÓDIGO do setor de um usuário — seja qual for a forma em que ele chegou (24/08/2026).
 *
 * Existe por causa de um defeito encontrado rodando a matriz de teste **pela tela**: o histórico das
 * solicitações estava gravando `setor = "[object Object]"`. Vinte e três registros no banco, em seis
 * ações diferentes.
 *
 * A causa é uma diferença de forma que passou despercebida por semanas:
 *
 * - as suítes chamam os serviços com `{ id: 1, setor: 'GEO' }` — `setor` é uma **string**;
 * - a tela chama com `req.user`, que é o usuário completo do banco — e ali `setor` é o **objeto da
 *   associação** (`{ id, codigo, nome }`). O código fica em `req.user.area`.
 *
 * `String(usuario.setor || '')` funciona no primeiro caso e produz `"[object Object]"` no segundo.
 * Nenhuma suíte via o problema porque nenhuma passava o objeto real.
 *
 * `historicos.setor` não é decorativo: a regra de visibilidade compara esse campo com o setor do
 * usuário. Um valor que não é código de setor nenhum nunca casa com ninguém.
 *
 * Por isso esta função aceita as três formas e devolve sempre o código, em texto.
 */
function codigoDoSetor(usuario) {
  if (!usuario) return '';

  // `area` é o que o middleware de autenticação já resolve (`user.setor?.codigo`). Vem primeiro
  // porque é a forma canônica de quem entrou pela tela.
  const candidatos = [
    usuario.area,
    // Objeto da associação.
    usuario.setor && typeof usuario.setor === 'object' ? usuario.setor.codigo : null,
    // String simples — como as suítes e as chamadas internas passam.
    typeof usuario.setor === 'string' ? usuario.setor : null,
    usuario.setor_codigo
  ];

  for (const candidato of candidatos) {
    const texto = String(candidato ?? '').trim();
    // `[object Object]` só apareceria se alguém voltasse a concatenar o objeto: barrado aqui de
    // propósito, para o defeito não poder renascer por outro caminho.
    if (texto && texto !== '[object Object]') return texto;
  }

  return '';
}

/**
 * O mesmo saneamento para um valor de setor SOLTO — o que chega como parametro `setor`, e nao dentro
 * de um usuario.
 *
 * Existe porque a primeira varredura do defeito procurou por `usuario.setor` e nao viu os caminhos
 * em que o objeto e passado ADIANTE como parametro: `sincronizarStatusDaSolicitacaoDoContrato({
 * setor: usuario.setor })`. O `[object Object]` reapareceu no `STATUS_ALTERADO`, ja depois de eu
 * ter dado o defeito por corrigido.
 *
 * Por isso o saneamento passou a viver tambem no PONTO DE ESCRITA: quem grava historico chama isto,
 * e nenhum caminho novo consegue reintroduzir o problema por descuido.
 */
function setorParaHistorico(valor) {
  if (valor && typeof valor === 'object') {
    return String(valor.codigo || valor.nome || '').trim();
  }
  const texto = String(valor ?? '').trim();
  return texto === '[object Object]' ? '' : texto;
}

module.exports = { codigoDoSetor, setorParaHistorico };
