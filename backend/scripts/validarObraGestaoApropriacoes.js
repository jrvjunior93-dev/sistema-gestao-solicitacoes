const assert = require('assert');
const {
  FONTE_RATEIO_TITULO,
  FONTE_RATEIO_SOLICITACAO,
  FONTE_APROPRIACAO_TITULO,
  FONTE_SEM_APROPRIACAO,
  distribuirPorApropriacao,
  selecionarFonteApropriacao,
  somarOrcamentoAnalitico,
  resolverPlanilhaGeralEfetiva
} = require('../src/services/obraGestaoApropriacaoService');

function total(distribuicoes) {
  return Number(distribuicoes.reduce((soma, item) => soma + item.valor, 0).toFixed(2));
}

{
  const titulo = { origem_titulo: 'RECARGA_CARTAO', obra_id: 3, considera_dre: false, possui_rateio: false, rateios: [] };
  const solicitacao = { obra_id: 3, apropriacao_id: 99, apropriacoes: [{ obra_id: 3, apropriacao_id: 99, valor_rateio: 100 }] };
  assert.deepStrictEqual(distribuirPorApropriacao({ valor: 100, titulo, solicitacao }), []);
  titulo.considera_dre = true;
  assert.deepStrictEqual(distribuirPorApropriacao({ valor: 100, titulo, solicitacao }), [], 'DRE sozinho nao substitui prestacao.');
  titulo.possui_rateio = true; titulo.rateios = [{ obra_id: 4, apropriacao_id: 1, valor_rateio: 100 }];
  const distribuicoes = distribuirPorApropriacao({ valor: 100, titulo, solicitacao });
  assert.strictEqual(total(distribuicoes), 100);
  assert.strictEqual(distribuicoes[0].obra_id, 4, 'Custo na obra do rateio, nao na origem.');
}

{
  const titulo = {
    obra_id: 3,
    apropriacao_id: 99,
    rateios: [
      { obra_id: 3, apropriacao_id: 1, valor_rateio: 70 },
      { obra_id: 3, apropriacao_id: 2, valor_rateio: 30 }
    ]
  };
  const solicitacao = {
    obra_id: 3,
    apropriacao_id: 88,
    apropriacoes: [
      { apropriacao_id: 3, percentual: 50 },
      { apropriacao_id: 4, percentual: 50 }
    ]
  };
  const fonte = selecionarFonteApropriacao({ titulo, solicitacao });
  assert.strictEqual(fonte.fonte, FONTE_RATEIO_TITULO);
  assert.deepStrictEqual(
    distribuirPorApropriacao({ valor: 100, titulo, solicitacao }).map((item) => [item.apropriacao_id, item.valor]),
    [[1, 70], [2, 30]]
  );
}

{
  const titulo = { obra_id: 3, apropriacao_id: 1, rateios: [] };
  const solicitacao = {
    obra_id: 3,
    apropriacao_id: 1,
    apropriacoes: [
      { apropriacao_id: 1, valor_rateio: 60 },
      { apropriacao_id: 2, valor_rateio: 40 }
    ]
  };
  const fonte = selecionarFonteApropriacao({ titulo, solicitacao });
  assert.strictEqual(fonte.fonte, FONTE_RATEIO_SOLICITACAO);
  const distribuicoes = distribuirPorApropriacao({ valor: 100.01, titulo, solicitacao });
  assert.deepStrictEqual(
    distribuicoes.map((item) => [item.apropriacao_id, item.valor]),
    [[1, 60.01], [2, 40]]
  );
  assert.strictEqual(total(distribuicoes), 100.01);
}

{
  // Uma Despesa Eventual (ou outro tipo sem contrato) nasce com rateio na solicitacao.
  // O titulo ainda pode guardar uma apropriacao principal, mas o custo por obra deve
  // respeitar a divisao registrada e conservar todos os centavos.
  const distribuicoes = distribuirPorApropriacao({
    valor: 500,
    titulo: { obra_id: 3, apropriacao_id: 11, rateios: [] },
    solicitacao: {
      obra_id: 3,
      apropriacao_id: 11,
      apropriacoes: [
        { apropriacao_id: 11, percentual: 35, contrato_id: null },
        { apropriacao_id: 12, percentual: 65, contrato_id: null }
      ]
    }
  });
  assert.deepStrictEqual(
    distribuicoes.map((item) => [item.apropriacao_id, item.valor, item.fonte]),
    [[11, 175, FONTE_RATEIO_SOLICITACAO], [12, 325, FONTE_RATEIO_SOLICITACAO]]
  );
  assert.strictEqual(total(distribuicoes), 500);
}

{
  const fonte = selecionarFonteApropriacao({
    titulo: { obra_id: 3, apropriacao_id: 7 },
    solicitacao: { obra_id: 3, apropriacao_id: 8, apropriacoes: [] }
  });
  assert.strictEqual(fonte.fonte, FONTE_APROPRIACAO_TITULO);
  assert.strictEqual(fonte.rateios[0].apropriacao_id, 7);
}

{
  const distribuicoes = distribuirPorApropriacao({
    valor: 0.01,
    solicitacao: {
      obra_id: 3,
      apropriacoes: [
        { apropriacao_id: 1, percentual: 1 },
        { apropriacao_id: 2, percentual: 1 },
        { apropriacao_id: 3, percentual: 1 }
      ]
    }
  });
  assert.strictEqual(total(distribuicoes), 0.01);
  assert.deepStrictEqual(distribuicoes.map((item) => item.valor), [0.01, 0, 0]);
}

{
  const distribuicoes = distribuirPorApropriacao({
    valor: 50,
    titulo: {
      obra_id: 3,
      rateios: [
        { obra_id: 3, apropriacao_id: 10, valor_rateio: 20 },
        { obra_id: 3, apropriacao_id: 10, valor_rateio: 30 }
      ]
    }
  });
  assert.deepStrictEqual(distribuicoes.map((item) => [item.apropriacao_id, item.valor]), [[10, 50]]);
}

{
  const fonte = selecionarFonteApropriacao({ titulo: { obra_id: 3 }, solicitacao: null });
  assert.strictEqual(fonte.fonte, FONTE_SEM_APROPRIACAO);
  const distribuicoes = distribuirPorApropriacao({ valor: 25.45, titulo: { obra_id: 3 } });
  assert.strictEqual(distribuicoes[0].apropriacao_id, null);
  assert.strictEqual(total(distribuicoes), 25.45);
}

{
  const totalAnalitico = somarOrcamentoAnalitico([
    { codigo: '01', valor_orcado: 1323110.21, somadora: true },
    { codigo: '02', valor_orcado: 1267488.23, somadora: 1 },
    { codigo: '03', valor_orcado: 2899401.56, somadora: true },
    { codigo: '01.001', valor_orcado: 1323110.21, somadora: false },
    { codigo: '02.001', valor_orcado: 1267488.23, somadora: 0 },
    { codigo: '03.001', valor_orcado: 2899401.56, somadora: false }
  ]);

  assert.strictEqual(totalAnalitico, 5490000);
}

{
  const totalAnalitico = somarOrcamentoAnalitico([
    { codigo: '1', valor_orcado: 27000000, somadora: true },
    { codigo: '1.1', valor_orcado: 51305889.63, somadora: true },
    { codigo: '1.1.1', valor_orcado: 12000000, somadora: false },
    { codigo: '1.1.2', valor_orcado: 15000000, somadora: false }
  ]);

  assert.strictEqual(totalAnalitico, 27000000);
}

{
  const linhas = [
    { valor_orcado: '400000.10', somadora: true },
    { valor_orcado: '150000.05', somadora: false },
    { valor_orcado: '250000.05', somadora: 0 }
  ];
  assert.deepStrictEqual(
    resolverPlanilhaGeralEfetiva({ planilha_geral: '750000.00' }, linhas),
    { valor: 750000, origem: 'CADASTRO' },
    'O valor cadastrado tem prioridade sobre as apropriações'
  );
  assert.deepStrictEqual(
    resolverPlanilhaGeralEfetiva({ planilha_geral: null }, linhas),
    { valor: 400000.10, origem: 'APROPRIACOES' },
    'Linhas somadoras não podem duplicar a planilha efetiva'
  );
  assert.deepStrictEqual(
    resolverPlanilhaGeralEfetiva({ planilha_geral: 0 }, linhas),
    { valor: 400000.10, origem: 'APROPRIACOES' }
  );
  assert.deepStrictEqual(
    resolverPlanilhaGeralEfetiva({ planilha_geral: null }, []),
    { valor: 0, origem: null },
    'Sem valor informado nem apropriações, a referência permanece ausente'
  );
}

console.log('Validacao do rateio de apropriacoes na gestao de obras concluida com sucesso.');
