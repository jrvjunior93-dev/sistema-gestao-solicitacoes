'use strict';

// =====================================================================
// VALIDACAO DAS PREFERENCIAS DE LISTA POR USUARIO E POR TIPO
// ---------------------------------------------------------------------
// Roda SEM banco: exercita o validador puro e faz asserts de fonte sobre
// controller, rotas, model, middleware de auditoria e migration.
//
// Os asserts de fonte existem por um motivo especifico: a regra de
// seguranca destas rotas ("o dono e sempre req.user.id, nunca o caminho
// nem o corpo") nao aparece em teste de unidade — ela some numa linha
// distraida meses depois. Aqui ela quebra o script.
// =====================================================================

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
  ADOCAO_MAX_ITENS,
  LIMITE_BYTES_POR_TIPO,
  LISTA_MAX,
  TIPOS_PREFERENCIA,
  TIPO_PADRAO,
  normalizarLista,
  normalizarTipo,
  serializarPreferencias,
  validarEntradaPreferencia,
  validarLoteAdocao
} = require('../src/validators/listaPreferenciasValidators');

const raizBackend = path.resolve(__dirname, '..');
const ler = (relativo) => fs.readFileSync(path.join(raizBackend, relativo), 'utf8');

// ---------------------------------------------------------------------
// 1. Chave da lista: as chaves de tabela do frontend tem `:`
// ---------------------------------------------------------------------
const CHAVES_REAIS_DO_FRONTEND = [
  'tabela:financeiro-titulos:geral',
  'tabela:auditoria-operacional:produtividade-financeira',
  'tabela:baixa-composta:alocacoes',
  'tabela:arquivos-modelos'
];

CHAVES_REAIS_DO_FRONTEND.forEach((chave) => {
  assert.strictEqual(
    normalizarLista(chave),
    chave,
    `A chave de tabela ${chave} precisa ser aceita: com o padrao antigo (/^[a-z0-9_-]+$/) toda gravacao devolvia 400.`
  );
});

assert.strictEqual(normalizarLista('  Tabela:Financeiro-Titulos:Geral  '), 'tabela:financeiro-titulos:geral');
assert.strictEqual(normalizarLista('solicitacoes'), 'solicitacoes', 'A chave legada sem `:` continua valendo.');
assert.strictEqual(normalizarLista(''), null);
assert.strictEqual(normalizarLista(null), null);
assert.strictEqual(normalizarLista('tabela/financeiro'), null, 'Barra nao entra na chave.');
assert.strictEqual(normalizarLista('tabela financeiro'), null, 'Espaco nao entra na chave.');
assert.strictEqual(normalizarLista('tabela:%00'), null);
assert.strictEqual(normalizarLista('a'.repeat(LISTA_MAX)), 'a'.repeat(LISTA_MAX));
assert.strictEqual(normalizarLista('a'.repeat(LISTA_MAX + 1)), null, `A chave para em ${LISTA_MAX} caracteres.`);
assert.strictEqual(LISTA_MAX, 160, 'O teto da chave e 160 e a coluna do banco acompanha (VARCHAR(160)).');

// ---------------------------------------------------------------------
// 2. Tipos fechados
// ---------------------------------------------------------------------
assert.deepStrictEqual(
  [...TIPOS_PREFERENCIA].sort(),
  ['blocos', 'colunas', 'filtros', 'geral', 'larguras', 'visual'],
  'Os tipos aceitos sao fechados e validados no backend.'
);
assert.strictEqual(normalizarTipo(undefined), TIPO_PADRAO, 'Sem tipo, a rota legada cai em geral.');
assert.strictEqual(normalizarTipo(''), TIPO_PADRAO);
assert.strictEqual(normalizarTipo('  COLUNAS '), 'colunas');
assert.strictEqual(normalizarTipo('inexistente'), null);
assert.strictEqual(normalizarTipo('', null), null, 'Onde o tipo e obrigatorio, vazio nao vira geral.');
assert.strictEqual(normalizarTipo(undefined, null), null);

// ---------------------------------------------------------------------
// 3. Tetos em bytes UTF-8, por tipo — e nunca truncar
// ---------------------------------------------------------------------
assert.deepStrictEqual(
  { ...LIMITE_BYTES_POR_TIPO },
  {
    colunas: 8 * 1024,
    larguras: 8 * 1024,
    visual: 8 * 1024,
    blocos: 16 * 1024,
    filtros: 32 * 1024,
    geral: 32 * 1024
  },
  'Tetos por tipo: 8KB colunas/larguras/visual, 16KB blocos, 32KB filtros (e geral, o balde legado).'
);

function cargaComBytes(bytes) {
  // JSON.stringify({ v: 'x'.repeat(n) }) tem 8 + n bytes.
  return { v: 'x'.repeat(Math.max(0, bytes - 8)) };
}

TIPOS_PREFERENCIA.forEach((tipo) => {
  const limite = LIMITE_BYTES_POR_TIPO[tipo];

  const noLimite = serializarPreferencias(cargaComBytes(limite), tipo);
  assert.strictEqual(noLimite.erro, undefined, `Exatamente ${limite} bytes ainda cabe no tipo ${tipo}.`);
  assert.strictEqual(noLimite.bytes, limite);

  const estourado = serializarPreferencias(cargaComBytes(limite + 1), tipo);
  assert.ok(estourado.erro, `${limite + 1} bytes precisa ser recusado no tipo ${tipo}.`);
  assert.ok(estourado.erro.includes(tipo), 'A mensagem de estouro diz de qual tipo se trata.');
  assert.ok(
    /preferencia anterior foi mantida/i.test(estourado.erro),
    'A mensagem precisa deixar claro que a preferencia anterior permanece intacta.'
  );
  assert.strictEqual(
    estourado.texto,
    undefined,
    'Estourou o teto, nada e devolvido para gravar: o servidor NUNCA trunca o JSON (JSON truncado e JSON invalido).'
  );
});

// Um acento ocupa 2 bytes: o teto e medido em bytes, nao em caracteres.
const limiteVisual = LIMITE_BYTES_POR_TIPO.visual;
const soAcentos = { v: 'á'.repeat(Math.floor((limiteVisual - 8) / 2) + 1) };
assert.ok(
  serializarPreferencias(soAcentos, 'visual').erro,
  'O teto e contado com Buffer.byteLength: caractere multibyte conta o que ocupa.'
);

assert.ok(serializarPreferencias(null, 'colunas').erro, 'null nao e preferencia.');
assert.ok(serializarPreferencias([1, 2], 'colunas').erro, 'Array nao e preferencia: o contrato e objeto.');
assert.ok(serializarPreferencias('texto', 'colunas').erro, 'String nao e preferencia.');

// ---------------------------------------------------------------------
// 4. Entrada unitaria
// ---------------------------------------------------------------------
const unitario = validarEntradaPreferencia({
  lista: 'TABELA:Financeiro-Titulos:Geral',
  tipo: 'larguras',
  preferencias: { coluna_valor: 180 }
});
assert.strictEqual(unitario.lista, 'tabela:financeiro-titulos:geral');
assert.strictEqual(unitario.tipo, 'larguras');
assert.ok(unitario.texto);

assert.ok(validarEntradaPreferencia({ lista: 'x y', tipo: 'colunas', preferencias: {} }).erro);
assert.ok(validarEntradaPreferencia({ lista: 'lista', tipo: 'nao-existe', preferencias: {} }).erro);
assert.strictEqual(
  validarEntradaPreferencia({ lista: 'lista', preferencias: {} }).tipo,
  TIPO_PADRAO,
  'Sem tipo informado, o caminho unitario continua gravando em geral (compatibilidade com a rota legada).'
);

// ---------------------------------------------------------------------
// 5. Lote de adocao — mesma validacao, tudo ou nada
// ---------------------------------------------------------------------
const loteBom = validarLoteAdocao({
  itens: [
    { lista: 'tabela:financeiro-titulos:geral', tipo: 'colunas', preferencias: { visiveis: ['a'] } },
    { lista: 'tabela:financeiro-titulos:geral', tipo: 'larguras', preferencias: { a: 120 } }
  ]
});
assert.strictEqual(loteBom.erro, undefined);
assert.strictEqual(loteBom.itens.length, 2);

assert.ok(validarLoteAdocao({}).erro, 'Sem itens, 400.');
assert.ok(validarLoteAdocao({ itens: [] }).erro, 'Lista vazia, 400.');
assert.ok(validarLoteAdocao({ itens: 'x' }).erro);

const loteGrande = validarLoteAdocao({
  itens: Array.from({ length: ADOCAO_MAX_ITENS + 1 }, (unused, indice) => ({
    lista: `tabela:lista-${indice}`,
    tipo: 'colunas',
    preferencias: { i: indice }
  }))
});
assert.ok(loteGrande.erro, `O lote para em ${ADOCAO_MAX_ITENS} entradas.`);

const loteSemTipo = validarLoteAdocao({
  itens: [{ lista: 'tabela:x', preferencias: {} }]
});
assert.ok(loteSemTipo.erro, 'No lote o tipo e obrigatorio: sem ele tudo cairia em geral e o reset por tipo perderia sentido.');

const loteMisto = validarLoteAdocao({
  itens: [
    { lista: 'tabela:boa', tipo: 'colunas', preferencias: { a: 1 } },
    { lista: 'tabela:ruim', tipo: 'colunas', preferencias: cargaComBytes(LIMITE_BYTES_POR_TIPO.colunas + 1) }
  ]
});
assert.ok(loteMisto.erro, 'Uma entrada invalida reprova o lote inteiro.');
assert.strictEqual(loteMisto.itens, undefined, 'Reprovado o lote, nenhuma entrada segue para gravacao.');
assert.strictEqual(loteMisto.rejeitadas.length, 1);
assert.strictEqual(loteMisto.rejeitadas[0].indice, 1, 'O erro aponta qual entrada reprovou.');

const loteDuplicado = validarLoteAdocao({
  itens: [
    { lista: 'tabela:x', tipo: 'colunas', preferencias: { a: 1 } },
    { lista: 'tabela:x', tipo: 'colunas', preferencias: { a: 2 } }
  ]
});
assert.ok(loteDuplicado.erro, 'lista + tipo repetidos no mesmo lote sao recusados: nao ha ordem definida entre eles.');

const loteComUsuarioNoCorpo = validarLoteAdocao({
  usuario_id: 999,
  itens: [{ lista: 'tabela:x', tipo: 'colunas', usuario_id: 999, preferencias: { a: 1 } }]
});
assert.strictEqual(loteComUsuarioNoCorpo.erro, undefined);
assert.ok(
  !Object.prototype.hasOwnProperty.call(loteComUsuarioNoCorpo.itens[0], 'usuario_id'),
  'usuario_id vindo do corpo e descartado pelo validador: o dono sai de req.user.id.'
);

// ---------------------------------------------------------------------
// 6. Controller: dono sempre req.user.id, where sempre com usuario_id
// ---------------------------------------------------------------------
const controllerFonte = ler('src/controllers/ListaPreferenciasController.js');

// Os asserts de fonte olham o CODIGO, sem os comentarios: um comentario
// que cita `usuario_id` nao pode fazer as vezes de um `where` que o
// perdeu.
const controllerCodigo = controllerFonte
  .split('\n')
  .filter((linha) => !linha.trim().startsWith('//'))
  .join('\n');

assert.ok(
  !/req\.(?:body|params|query)[^\n]*usuario_id/.test(controllerFonte),
  'Nenhuma rota de preferencia pode ler usuario_id do corpo, do caminho ou da query.'
);
assert.ok(
  controllerFonte.includes('function usuarioAutenticadoId(req)')
    && controllerFonte.includes('Number(req?.user?.id)'),
  'O dono do registro sai de req.user.id, por uma funcao unica.'
);

// Toda chamada a um model daqui precisa carregar `usuario_id`. E a
// trava contra o pior erro possivel nestas rotas: um `where` esquecido
// em GET /me/preferencias devolveria as preferencias de todo mundo.
const chamadasModel = [...controllerCodigo.matchAll(
  /UsuarioLista(?:Preferencia|Filtro)\.(?:findOne|findAll|findOrCreate|destroy|count|create)\(/g
)];
assert.ok(
  chamadasModel.length >= 11,
  `A conferencia precisa alcancar as consultas do controller (encontradas ${chamadasModel.length}).`
);
chamadasModel.forEach((ocorrencia) => {
  const trecho = controllerCodigo.slice(ocorrencia.index, ocorrencia.index + 320);
  assert.ok(
    trecho.includes('usuario_id'),
    `Consulta sem usuario_id no controller de preferencias:\n${trecho.split('\n').slice(0, 6).join('\n')}`
  );
});

assert.ok(
  controllerFonte.includes('validarEntradaPreferencia') && controllerFonte.includes('validarLoteAdocao'),
  'Os dois caminhos de escrita usam o mesmo validador.'
);
assert.ok(
  (controllerFonte.match(/async function gravarPreferencia\(/g) || []).length === 1
    && !/UsuarioListaPreferencia\.(?:create|bulkCreate|upsert)\(/.test(controllerFonte),
  'So existe UMA implementacao de gravacao de preferencia; o lote nao pode ter a sua.'
);
assert.ok(
  /sequelize\.transaction\(/.test(controllerFonte),
  'A adocao em lote grava dentro de uma transacao.'
);
// Sem cache de servidor nestas rotas (o comentario do controller explica
// o porque; aqui se confere o codigo, nao o comentario).
assert.ok(
  !/(new Map\(|_CACHE|cacheTtl|TTL_MS)/i.test(controllerCodigo),
  'Preferencia e dado por usuario: cache de servidor teria acerto zero e serviria dado velho logo depois de um reset.'
);

// ---------------------------------------------------------------------
// 7. Rotas
// ---------------------------------------------------------------------
const rotasFonte = ler('src/routes.js');
const ROTAS_ESPERADAS = [
  "router.get('/listas/:lista/preferencias', ListaPreferenciasController.getPreferencias)",
  "router.put('/listas/:lista/preferencias', ListaPreferenciasController.putPreferencias)",
  "router.delete('/listas/:lista/preferencias', ListaPreferenciasController.resetPreferenciasLista)",
  "router.get('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.getPreferencias)",
  "router.put('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.putPreferencias)",
  "router.delete('/listas/:lista/preferencias/:tipo', ListaPreferenciasController.resetPreferenciaTipo)",
  "router.get('/me/preferencias', ListaPreferenciasController.getMinhasPreferencias)",
  "router.delete('/me/preferencias', ListaPreferenciasController.resetMinhasPreferencias)",
  "router.post('/me/preferencias/adotar', ListaPreferenciasController.adotarPreferencias)"
];
ROTAS_ESPERADAS.forEach((rota) => {
  assert.ok(rotasFonte.includes(rota), `Rota ausente ou alterada: ${rota}`);
});
assert.ok(
  !/router\.[a-z]+\('\/(?:listas|me\/preferencias)[^']*:usuario/.test(rotasFonte),
  'Nenhuma rota de preferencia recebe id de usuario no caminho.'
);

// ---------------------------------------------------------------------
// 8. Auditoria operacional nao registra preferencia de tela
// ---------------------------------------------------------------------
const auditoriaFonte = ler('src/middlewares/auditoriaOperacional.js');
["'/listas'", "'/me/preferencias'", "'/auth/heartbeat'"].forEach((caminho) => {
  assert.ok(
    new RegExp(`SKIP_PATHS = \\[[\\s\\S]*?${caminho.replace(/[/]/g, '\\/')}[\\s\\S]*?\\]`).test(auditoriaFonte),
    `${caminho} precisa estar em SKIP_PATHS: redimensionar uma coluna arrastando viraria dezenas de linhas na trilha de negocio.`
  );
});

// ---------------------------------------------------------------------
// 9. Model e migration
// ---------------------------------------------------------------------
const modelFonte = ler('src/models/UsuarioListaPreferencia.js');
assert.ok(/lista:[\s\S]*?DataTypes\.STRING\(160\)/.test(modelFonte), 'O model acompanha VARCHAR(160) em lista.');
assert.ok(/tipo:[\s\S]*?defaultValue: 'geral'/.test(modelFonte), "O model tem tipo com default 'geral'.");

const migracaoNome = '202609050050_lista_preferencias_tipo.js';
const migracaoFonte = ler(path.join('migrations', migracaoNome));
assert.ok(migracaoFonte.includes("defaultValue: 'geral'"), 'A coluna nasce preenchida por DEFAULT, sem backfill.');
assert.ok(
  /addIndex\([\s\S]*?\['usuario_id', 'lista', 'tipo'\][\s\S]*?unique: true/.test(migracaoFonte),
  'O indice unico passa a ser (usuario_id, lista, tipo).'
);
assert.ok(
  migracaoFonte.indexOf('uq_usr_lista_pref_tipo') < migracaoFonte.indexOf('removeIndex'),
  'O indice novo e criado antes de o antigo sair: o antigo sustenta a FK do usuario.'
);
assert.ok(
  ['columnExists', 'indexExists', 'tableExists'].every((guarda) => migracaoFonte.includes(guarda)),
  'A migration e idempotente (Regra 4 de CONVENCAO-MIGRATIONS.md).'
);
assert.ok(/async down\(\) \{/.test(migracaoFonte), 'down() e no-op, como manda a convencao.');
['uq_usr_lista_pref_tipo', 'usuario_lista_preferencias'].forEach((identificador) => {
  assert.ok(identificador.length <= 64, 'Identificador do MySQL cabe em 64 caracteres (Regra 6).');
});

const { assertMigrationSourceIsSchemaOnly } = require('../src/database/runMigrations');
assertMigrationSourceIsSchemaOnly(migracaoNome, migracaoFonte);

// ---------------------------------------------------------------------
// 10. Comportamento das rotas, com os models trocados por memoria
// ---------------------------------------------------------------------
// Os handlers rodam de verdade aqui — so o acesso ao banco e falso. E
// assim que se prova o que nenhum assert de fonte prova: que o estouro
// de teto deixa a preferencia anterior intacta, que o reset e
// idempotente e que usuario_id no corpo nao muda o dono do registro.
const linhasPreferencia = [];
let sequencia = 1;

function casaComWhere(linha, where = {}) {
  return Object.entries(where).every(([campo, valor]) => linha[campo] === valor);
}

function novaLinha(dados) {
  const linha = {
    id: sequencia++,
    ...dados,
    async update(campos) {
      Object.assign(this, campos);
      return this;
    }
  };
  linhasPreferencia.push(linha);
  return linha;
}

const modelsFalso = {
  sequelize: {
    async transaction(callback) {
      return callback({ falso: true });
    }
  },
  UsuarioListaPreferencia: {
    async findOne({ where }) {
      return linhasPreferencia.find((linha) => casaComWhere(linha, where)) || null;
    },
    async findAll({ where }) {
      return linhasPreferencia.filter((linha) => casaComWhere(linha, where));
    },
    async findOrCreate({ where, defaults }) {
      const existente = linhasPreferencia.find((linha) => casaComWhere(linha, where));
      if (existente) return [existente, false];
      return [novaLinha(defaults), true];
    },
    async destroy({ where }) {
      let removidas = 0;
      for (let indice = linhasPreferencia.length - 1; indice >= 0; indice -= 1) {
        if (casaComWhere(linhasPreferencia[indice], where)) {
          linhasPreferencia.splice(indice, 1);
          removidas += 1;
        }
      }
      return removidas;
    }
  },
  UsuarioListaFiltro: {
    async findOne() { return null; },
    async findAll() { return []; },
    async count() { return 0; },
    async create(dados) { return { id: 1, ...dados }; },
    async destroy() { return 0; }
  }
};

const caminhoModels = require.resolve('../src/models');
require.cache[caminhoModels] = {
  id: caminhoModels,
  filename: caminhoModels,
  loaded: true,
  exports: modelsFalso
};
const controller = require('../src/controllers/ListaPreferenciasController');

function criarRes() {
  return {
    statusCode: 200,
    corpo: undefined,
    status(codigo) { this.statusCode = codigo; return this; },
    json(payload) { this.corpo = payload; return this; },
    sendStatus(codigo) { this.statusCode = codigo; this.corpo = null; return this; }
  };
}

async function chamar(handler, req) {
  const res = criarRes();
  await handler({ params: {}, query: {}, body: {}, ...req }, res);
  return res;
}

const USUARIO = { id: 7 };
const OUTRO_USUARIO = { id: 8 };
const LISTA = 'tabela:financeiro-titulos:geral';

(async () => {
  // PUT legado (sem tipo) grava em 'geral'
  let res = await chamar(controller.putPreferencias, {
    user: USUARIO,
    params: { lista: LISTA },
    body: { preferencias: { modo: 'tabela' } }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.corpo.tipo, 'geral', 'A rota legada continua gravando em geral.');

  // PUT por tipo, no caminho
  res = await chamar(controller.putPreferencias, {
    user: USUARIO,
    params: { lista: LISTA, tipo: 'colunas' },
    body: { preferencias: { visiveis: ['numero', 'valor'] } }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.corpo.tipo, 'colunas');
  assert.strictEqual(linhasPreferencia.length, 2, 'geral e colunas convivem: uma linha por tipo.');

  // Chave com `:` que antes devolvia 400
  assert.ok(
    linhasPreferencia.every((linha) => linha.lista === LISTA),
    'A chave hierarquica com `:` grava normalmente.'
  );

  // Estouro de teto: 400 e a preferencia ANTERIOR permanece intacta
  const antes = linhasPreferencia.find((linha) => linha.tipo === 'colunas').preferencias;
  res = await chamar(controller.putPreferencias, {
    user: USUARIO,
    params: { lista: LISTA, tipo: 'colunas' },
    body: { preferencias: cargaComBytes(LIMITE_BYTES_POR_TIPO.colunas + 1) }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.corpo.limite_bytes, LIMITE_BYTES_POR_TIPO.colunas);
  assert.strictEqual(
    linhasPreferencia.find((linha) => linha.tipo === 'colunas').preferencias,
    antes,
    'Estouro de teto nao pode encostar na preferencia ja gravada.'
  );

  // Tipo desconhecido
  res = await chamar(controller.putPreferencias, {
    user: USUARIO,
    params: { lista: LISTA, tipo: 'inventado' },
    body: { preferencias: {} }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.deepStrictEqual(res.corpo.tipos, TIPOS_PREFERENCIA);

  // Outro usuario grava na MESMA lista e no MESMO tipo
  await chamar(controller.putPreferencias, {
    user: OUTRO_USUARIO,
    params: { lista: LISTA, tipo: 'colunas' },
    body: { preferencias: { visiveis: ['outro'] } }
  });

  // Carga unica: uma consulta so, e SO do proprio usuario
  res = await chamar(controller.getMinhasPreferencias, { user: USUARIO });
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(Object.keys(res.corpo.listas), [LISTA]);
  assert.deepStrictEqual(
    Object.keys(res.corpo.listas[LISTA]).sort(),
    ['colunas', 'geral'],
    'A carga unica vem agrupada por lista -> tipo.'
  );
  assert.strictEqual(res.corpo.total, 2, 'A carga unica traz somente as linhas do proprio usuario.');
  assert.deepStrictEqual(res.corpo.listas[LISTA].colunas, { visiveis: ['numero', 'valor'] });

  res = await chamar(controller.getMinhasPreferencias, { user: OUTRO_USUARIO });
  assert.strictEqual(res.corpo.total, 1, 'Cada usuario ve apenas o que e seu.');

  // Sessao sem usuario nao le nada
  res = await chamar(controller.getMinhasPreferencias, { user: null });
  assert.strictEqual(res.statusCode, 401);

  // Reset de UM tipo: os outros sobrevivem
  res = await chamar(controller.resetPreferenciaTipo, {
    user: USUARIO,
    params: { lista: LISTA, tipo: 'colunas' }
  });
  assert.strictEqual(res.statusCode, 204);
  assert.ok(
    linhasPreferencia.some((linha) => linha.usuario_id === USUARIO.id && linha.tipo === 'geral'),
    'Resetar colunas nao pode levar os outros tipos junto.'
  );
  assert.ok(
    linhasPreferencia.some((linha) => linha.usuario_id === OUTRO_USUARIO.id && linha.tipo === 'colunas'),
    'O reset de um usuario nao encosta no registro de outro.'
  );

  // Reset idempotente: 204 tambem quando nao havia linha
  res = await chamar(controller.resetPreferenciaTipo, {
    user: USUARIO,
    params: { lista: LISTA, tipo: 'colunas' }
  });
  assert.strictEqual(res.statusCode, 204, 'Reset e idempotente: 204 mesmo sem linha para apagar.');

  // Adocao em lote: usuario_id do corpo e ignorado
  res = await chamar(controller.adotarPreferencias, {
    user: USUARIO,
    body: {
      usuario_id: OUTRO_USUARIO.id,
      itens: [
        { lista: 'tabela:contratos', tipo: 'larguras', usuario_id: OUTRO_USUARIO.id, preferencias: { a: 90 } },
        { lista: 'tabela:contratos', tipo: 'blocos', preferencias: { ordem: ['resumo'] } }
      ]
    }
  });
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.corpo.gravadas, 2);
  linhasPreferencia
    .filter((linha) => linha.lista === 'tabela:contratos')
    .forEach((linha) => {
      assert.strictEqual(
        linha.usuario_id,
        USUARIO.id,
        'usuario_id do corpo nao pode virar dono do registro: o dono e req.user.id.'
      );
    });

  // Lote com uma entrada invalida: 400 e NADA gravado
  const totalAntesDoLoteRuim = linhasPreferencia.length;
  res = await chamar(controller.adotarPreferencias, {
    user: USUARIO,
    body: {
      itens: [
        { lista: 'tabela:nova', tipo: 'visual', preferencias: { modo: 'cards' } },
        { lista: 'tabela:nova', tipo: 'visual-inexistente', preferencias: {} }
      ]
    }
  });
  assert.strictEqual(res.statusCode, 400);
  assert.strictEqual(res.corpo.rejeitadas.length, 1);
  assert.strictEqual(
    linhasPreferencia.length,
    totalAntesDoLoteRuim,
    'Uma entrada invalida no lote impede a gravacao das outras: validacao antes de qualquer escrita.'
  );

  // Reset da TELA e reset TOTAL
  await chamar(controller.putPreferencias, {
    user: USUARIO,
    params: { lista: 'tabela:outra-tela', tipo: 'visual' },
    body: { preferencias: { modo: 'cards' } }
  });
  res = await chamar(controller.resetPreferenciasLista, {
    user: USUARIO,
    params: { lista: 'tabela:contratos' }
  });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(
    linhasPreferencia.filter((linha) => linha.usuario_id === USUARIO.id && linha.lista === 'tabela:contratos').length,
    0
  );
  assert.ok(
    linhasPreferencia.some((linha) => linha.lista === 'tabela:outra-tela'),
    'Resetar uma tela nao apaga as outras.'
  );

  res = await chamar(controller.resetMinhasPreferencias, { user: USUARIO });
  assert.strictEqual(res.statusCode, 204);
  assert.strictEqual(
    linhasPreferencia.filter((linha) => linha.usuario_id === USUARIO.id).length,
    0,
    'O reset total apaga tudo do proprio usuario...'
  );
  assert.ok(
    linhasPreferencia.some((linha) => linha.usuario_id === OUTRO_USUARIO.id),
    '...e nada de mais ninguem.'
  );

  res = await chamar(controller.resetMinhasPreferencias, { user: USUARIO });
  assert.strictEqual(res.statusCode, 204, 'Reset total tambem e idempotente.');

  console.log('Validacao das preferencias de lista por usuario e por tipo concluida com sucesso.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
