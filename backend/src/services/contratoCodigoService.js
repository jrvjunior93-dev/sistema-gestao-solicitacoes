'use strict';

const { sequelize } = require('../models');

const CHAVE_SEQUENCIA = 'CONTRATO_FLUXO_NOVO';
const PREFIXO = 'CT-';
const DIGITOS = 4;

function formatar(numero) {
  return `${PREFIXO}${String(numero).padStart(DIGITOS, '0')}`;
}

/**
 * Garante que a linha da sequencia exista.
 *
 * Fica fora da transacao de reserva de proposito: criar a linha dentro dela fazia
 * 20 solicitantes simultaneos disputarem o mesmo INSERT e cair em deadlock. Aqui o
 * INSERT IGNORE resolve a corrida no proprio banco — quem perde apenas nao insere.
 * A migration ja semeia a linha; isto e rede de seguranca.
 */
async function garantirSequencia() {
  // Semeia com o maior numero ja emitido, nao com zero.
  //
  // Se a linha for perdida, recria-la zerada faria a numeracao recomecar em CT-0001 e
  // reemitir codigos que ja existem — o indice unico barraria a gravacao, mas o servico
  // teria devolvido um codigo invalido. Partir do maior existente mantem a sequencia.
  await sequelize.query(
    `INSERT IGNORE INTO contrato_codigo_sequencias (chave, ultimo_numero, createdAt, updatedAt)
     SELECT :chave,
            COALESCE(MAX(CAST(SUBSTRING(codigo, :tamanhoPrefixo) AS UNSIGNED)), 0),
            NOW(),
            NOW()
     FROM contratos
     WHERE codigo REGEXP :padrao`,
    {
      replacements: {
        chave: CHAVE_SEQUENCIA,
        tamanhoPrefixo: PREFIXO.length + 1,
        padrao: `^${PREFIXO}[0-9]+$`
      }
    }
  );
}

/**
 * Gera o proximo codigo de contrato do fluxo novo (CT-0001, CT-0002, ...).
 *
 * Usa o idioma de sequencia do MySQL: `LAST_INSERT_ID(expr)` guarda o novo valor no
 * escopo da CONEXAO, entao o SELECT seguinte devolve exatamente o numero que este
 * UPDATE reservou, mesmo com varias conexoes incrementando ao mesmo tempo.
 *
 * Ler MAX(numero)+1 nao serve: dois solicitantes simultaneos leriam o mesmo maximo e
 * gerariam o mesmo codigo — que e justamente o conflito a evitar.
 *
 * Aceita transacao externa para que codigo e contrato sejam gravados juntos: se a
 * criacao do contrato falhar, o numero nao fica consumido.
 *
 * ATENCAO ao usar transacao externa: o lock da linha da sequencia so e liberado no
 * commit, entao toda geracao concorrente fica esperando ate la. Transacao longa
 * serializa as criacoes de contrato e, passando de 50s, os concorrentes recebem
 * ER_LOCK_WAIT_TIMEOUT. Mantenha a transacao curta — gere o codigo o mais perto
 * possivel do commit.
 *
 * Sem transacao externa a geracao nao trava ninguem, mas um erro posterior deixa o
 * numero consumido (buraco na sequencia). Buraco e aceitavel; codigo repetido nao.
 */
async function gerarProximoCodigo({ transaction } = {}) {
  const executar = async (t) => {
    const [resultado] = await sequelize.query(
      'UPDATE contrato_codigo_sequencias ' +
      'SET ultimo_numero = LAST_INSERT_ID(ultimo_numero + 1), updatedAt = NOW() ' +
      'WHERE chave = :chave',
      { replacements: { chave: CHAVE_SEQUENCIA }, transaction: t }
    );

    // Nenhuma linha afetada: a sequencia ainda nao existia.
    if (!resultado || resultado.affectedRows === 0) {
      const erro = new Error('Sequencia de codigo de contrato nao inicializada.');
      erro.code = 'SEQUENCIA_AUSENTE';
      throw erro;
    }

    const [[linha]] = await sequelize.query('SELECT LAST_INSERT_ID() AS numero', {
      transaction: t
    });

    return formatar(Number(linha.numero));
  };

  if (transaction) return executar(transaction);

  await garantirSequencia();
  return sequelize.transaction(executar);
}

module.exports = {
  gerarProximoCodigo,
  formatar,
  CHAVE_SEQUENCIA,
  PREFIXO
};
