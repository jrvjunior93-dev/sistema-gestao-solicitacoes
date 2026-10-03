'use strict';

/**
 * Regras de parcelas do novo fluxo de contratos.
 *
 * Funcoes puras, sem banco: o calculo de dinheiro e o ponto onde erro custa caro, entao
 * fica isolado e testavel sem infraestrutura.
 *
 * Todo valor trafega internamente em CENTAVOS (inteiro). Somar frações em ponto
 * flutuante acumula erro — 0.1 + 0.2 nao da 0.3 — e o total das parcelas precisa fechar
 * exatamente com o valor do contrato.
 */

const PERIODICIDADES = {
  MENSAL: { meses: 1 },
  QUINZENAL: { dias: 15 },
  SEMANAL: { dias: 7 },
  BIMESTRAL: { meses: 2 },
  TRIMESTRAL: { meses: 3 }
};

/**
 * Converte para centavos inteiros, com arredondamento half-up DECIMAL.
 *
 * Precisa casar com o DECIMAL(12,2) do MySQL, que arredonda meio para cima sobre os
 * digitos. Em ponto flutuante isso nao acontece: 8333.335 e guardado como
 * 8333.33499999..., entao tanto `Math.round(v * 100)` quanto `Number(v.toFixed(2))`
 * devolvem 8333.33, enquanto o banco grava 8333.34 — o contrato e a soma das parcelas
 * ficavam divergindo um centavo. Medido: 961 de 2.001 valores divergiam.
 *
 * A solucao e nao passar pelo binario: `String(numero)` devolve a forma decimal mais
 * curta que reproduz o valor (o que o usuario digitou), e o arredondamento e feito nos
 * digitos com BigInt.
 */
function paraCentavos(valor) {
  if (valor === null || valor === undefined || valor === '') return NaN;

  const numero = Number(valor);
  if (!Number.isFinite(numero)) return NaN;

  let texto = typeof valor === 'string' ? valor.trim() : String(numero);

  // Notacao cientifica: expande para digitos com toFixed(6) — 6 casas cobrem qualquer
  // entrada monetaria e recuperam a intencao (8.333335e3 -> '8333.335000') sem o ruido
  // binario do toFixed(20), que divergia do ramo normal (F7).
  if (/e/i.test(texto)) texto = numero.toFixed(6);

  const negativo = texto.startsWith('-');
  if (negativo || texto.startsWith('+')) texto = texto.slice(1);

  const [inteiro = '0', fracao = ''] = texto.split('.');
  if (!/^\d*$/.test(inteiro) || !/^\d*$/.test(fracao)) return NaN;

  const centavos = (fracao + '00').slice(0, 2);
  let total = BigInt(inteiro || '0') * 100n + BigInt(centavos);

  // Half-up: a terceira casa decidindo o arredondamento.
  if (fracao.length > 2 && Number(fracao[2]) >= 5) {
    total += 1n;
  }

  const resultado = Number(negativo ? -total : total);
  return Number.isSafeInteger(resultado) ? resultado : NaN;
}

function paraReais(centavos) {
  return Number((centavos / 100).toFixed(2));
}

/**
 * Converte para data local, sem hora.
 *
 * Strings 'AAAA-MM-DD' sao tratadas manualmente porque `new Date('2026-01-31')` e
 * interpretado como meia-noite UTC — em fuso negativo isso volta um dia e o vencimento
 * 31/01 vira 30/01. Vencimento e data de calendario, nao instante no tempo.
 */
function somenteData(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return new Date(valor.getFullYear(), valor.getMonth(), valor.getDate());
  }

  const texto = String(valor || '').trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, ano, mes, dia] = iso;
    const d = new Date(Number(ano), Number(mes) - 1, Number(dia));
    // Rejeita data inexistente (ex.: 2026-02-31 viraria 03/03).
    if (d.getMonth() !== Number(mes) - 1 || d.getDate() !== Number(dia)) return null;
    return d;
  }

  // Sem fallback new Date(texto): ele aceitava '05/09/2026' como mm/dd e gravava
  // 2026-05-09 em silencio (F8). Data em string e ISO estrito ou nada.
  return null;
}

function formatarISO(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/**
 * Avanca a data mantendo o dia do mes quando possivel.
 * Vencimento dia 31 em mes de 30 dias cai para o ultimo dia do mes, e nao vira dia 1
 * do mes seguinte (que e o que o Date faz sozinho).
 */
function avancar(dataBase, periodo, multiplicador) {
  const d = new Date(dataBase.getTime());

  if (periodo.dias) {
    d.setDate(d.getDate() + periodo.dias * multiplicador);
    return d;
  }

  const diaOriginal = dataBase.getDate();
  const alvo = new Date(dataBase.getFullYear(), dataBase.getMonth() + periodo.meses * multiplicador, 1);
  const ultimoDiaDoMes = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(diaOriginal, ultimoDiaDoMes));
  return alvo;
}

/**
 * Gera as parcelas de previsao de um contrato.
 *
 * O valor e dividido igualmente; a sobra em centavos vai para a ULTIMA parcela, para o
 * somatorio bater exatamente com o valor do contrato.
 */
function gerarParcelas({ valorTotal, quantidade, primeiroVencimento, periodicidade = 'MENSAL' }) {
  const total = paraCentavos(valorTotal);
  const qtde = Number(quantidade);

  if (!Number.isInteger(qtde) || qtde < 1) {
    throw Object.assign(new Error('Quantidade de parcelas invalida.'), { code: 'PARCELAS_QUANTIDADE_INVALIDA' });
  }

  if (!Number.isFinite(total) || total <= 0) {
    throw Object.assign(new Error('Valor do contrato invalido.'), { code: 'PARCELAS_VALOR_INVALIDO' });
  }

  if (total < qtde) {
    throw Object.assign(
      new Error('Valor insuficiente para o numero de parcelas: cada parcela ficaria abaixo de um centavo.'),
      { code: 'PARCELAS_VALOR_INSUFICIENTE' }
    );
  }

  const periodo = PERIODICIDADES[String(periodicidade).toUpperCase()];
  if (!periodo) {
    throw Object.assign(new Error('Periodicidade invalida.'), { code: 'PARCELAS_PERIODICIDADE_INVALIDA' });
  }

  const base = somenteData(primeiroVencimento);
  if (!base) {
    throw Object.assign(new Error('Data do primeiro vencimento invalida.'), { code: 'PARCELAS_DATA_INVALIDA' });
  }

  const valorBase = Math.floor(total / qtde);
  const sobra = total - valorBase * qtde;

  return Array.from({ length: qtde }, (_, i) => ({
    numero: i + 1,
    valor: paraReais(i === qtde - 1 ? valorBase + sobra : valorBase),
    vencimento: formatarISO(i === 0 ? base : avancar(base, periodo, i))
  }));
}

/**
 * Redistribui a diferenca quando o solicitante altera o valor de uma parcela.
 *
 * Regra do cliente: o valor total do contrato NAO muda. Solicitar menos que o previsto
 * aumenta as ultimas parcelas; solicitar mais, diminui. O ajuste concentra na ULTIMA
 * parcela ainda disponivel e, se consumi-la por inteiro, retrocede para a anterior.
 *
 * Parcelas ja usadas (`travada: true`) nao entram no ajuste — uma parcela ja paga ou em
 * solicitacao aberta nao pode ser alterada por conta de outra.
 */
function redistribuir({ parcelas, numeroAlterado, novoValor }) {
  const lista = parcelas.map((p) => ({ ...p, valorCent: paraCentavos(p.valor) }));
  const alvo = lista.find((p) => p.numero === Number(numeroAlterado));

  if (!alvo) {
    throw Object.assign(new Error('Parcela nao encontrada.'), { code: 'PARCELA_NAO_ENCONTRADA' });
  }

  // Parcela travada nao muda nem quando e ela a alterada: ja esta paga ou comprometida
  // em solicitacao aberta.
  if (alvo.travada) {
    throw Object.assign(
      new Error('Parcela ja utilizada nao pode ser alterada.'),
      { code: 'PARCELA_TRAVADA' }
    );
  }

  const novoCent = paraCentavos(novoValor);
  if (!Number.isFinite(novoCent) || novoCent <= 0) {
    throw Object.assign(new Error('Valor da parcela invalido.'), { code: 'PARCELA_VALOR_INVALIDO' });
  }

  // Diferenca positiva = solicitou MAIS que o previsto, precisa tirar das ultimas.
  let diferenca = novoCent - alvo.valorCent;
  if (diferenca === 0) {
    return { parcelas: lista.map(({ valorCent, ...p }) => p), ajustadas: [] };
  }

  alvo.valorCent = novoCent;

  // Candidatas: da ultima para tras, sem contar a alterada nem as travadas.
  const candidatas = lista
    .filter((p) => p.numero !== alvo.numero && !p.travada)
    .sort((a, b) => b.numero - a.numero);

  const ajustadas = [];

  for (const parcela of candidatas) {
    if (diferenca === 0) break;

    if (diferenca > 0) {
      // Consome desta parcela ate zerar a diferenca ou zerar a parcela.
      const disponivel = parcela.valorCent;
      const consumir = Math.min(disponivel, diferenca);
      parcela.valorCent -= consumir;
      diferenca -= consumir;
      ajustadas.push({ numero: parcela.numero, valor: paraReais(parcela.valorCent) });
    } else {
      // Sobrou saldo: devolve tudo para a ultima parcela disponivel.
      parcela.valorCent += -diferenca;
      ajustadas.push({ numero: parcela.numero, valor: paraReais(parcela.valorCent) });
      diferenca = 0;
    }
  }

  // Qualquer sobra nao absorvida altera o total do contrato, e o total nao pode mudar.
  //
  // Checar so `diferenca > 0` protegia apenas um lado: sem parcela livre para receber
  // (parcela unica, ou todas as demais travadas), pedir MENOS reduzia o valor do
  // contrato em silencio — dinheiro sumindo sem erro.
  if (diferenca !== 0) {
    if (diferenca > 0) {
      throw Object.assign(
        new Error('Valor excede o saldo disponivel do contrato.'),
        { code: 'PARCELA_EXCEDE_SALDO' }
      );
    }

    throw Object.assign(
      new Error('Nao ha parcela disponivel para absorver a diferenca sem alterar o valor do contrato.'),
      { code: 'PARCELA_SEM_DESTINO_PARA_SOBRA' }
    );
  }

  return {
    parcelas: lista
      .sort((a, b) => a.numero - b.numero)
      .map(({ valorCent, ...p }) => ({ ...p, valor: paraReais(valorCent) })),
    ajustadas
  };
}

/**
 * Vencimento informado na solicitacao nao pode ser anterior a data da solicitacao.
 *
 * Nao e validacao de formulario: e controle de prazo. Permitir data retroativa deixaria
 * o atraso invisivel para o financeiro — o solicitante que perdeu o prazo faria parecer
 * que cumpriu. Por isso precisa valer no backend, nao so na tela.
 */
function validarVencimentoNaSolicitacao({ vencimento, dataSolicitacao = new Date() }) {
  const venc = somenteData(vencimento);
  const hoje = somenteData(dataSolicitacao);

  if (!venc) {
    throw Object.assign(new Error('Data de vencimento invalida.'), { code: 'VENCIMENTO_INVALIDO' });
  }

  // Sem esta checagem a validacao inteira era contornavel: data de solicitacao invalida
  // produzia `hoje = null`, e `venc < null` coage para 0 (false), liberando vencimento
  // retroativo. Um controle de prazo que se desliga com entrada invalida nao controla nada.
  if (!hoje) {
    throw Object.assign(
      new Error('Data da solicitacao invalida.'),
      { code: 'DATA_SOLICITACAO_INVALIDA' }
    );
  }

  if (venc < hoje) {
    throw Object.assign(
      new Error(
        `A data de vencimento (${formatarISO(venc)}) nao pode ser anterior a data da ` +
        `solicitacao (${formatarISO(hoje)}). Informe uma data a partir de hoje.`
      ),
      { code: 'VENCIMENTO_RETROATIVO', vencimentoOriginal: formatarISO(venc) }
    );
  }

  return true;
}

/**
 * Teto de aditivo: a SOMA dos aditivos nao pode passar do percentual sobre o valor
 * original do contrato. O limite e acumulado, nao por aditivo.
 */
function validarAditivo({ valorOriginal, aditivosAplicados = 0, novoAditivo, percentualMaximo = 25 }) {
  const original = paraCentavos(valorOriginal);
  const jaAplicado = paraCentavos(aditivosAplicados);
  const novo = paraCentavos(novoAditivo);

  if (!Number.isFinite(novo) || novo <= 0) {
    throw Object.assign(new Error('Valor do aditivo invalido.'), { code: 'ADITIVO_VALOR_INVALIDO' });
  }

  if (!Number.isFinite(original) || original <= 0) {
    throw Object.assign(new Error('Valor original do contrato invalido.'), { code: 'ADITIVO_ORIGINAL_INVALIDO' });
  }

  // Acumulado negativo aumentaria o espaco disponivel e burlaria o teto.
  if (!Number.isFinite(jaAplicado) || jaAplicado < 0) {
    throw Object.assign(new Error('Aditivos ja aplicados invalidos.'), { code: 'ADITIVO_ACUMULADO_INVALIDO' });
  }

  const teto = Math.floor((original * percentualMaximo) / 100);
  const totalDepois = jaAplicado + novo;

  return {
    permitido: totalDepois <= teto,
    teto: paraReais(teto),
    ja_aplicado: paraReais(jaAplicado),
    total_depois: paraReais(totalDepois),
    disponivel: paraReais(Math.max(teto - jaAplicado, 0))
  };
}

module.exports = {
  // Conversoes canonicas: reimplementa-las ja reintroduziu o bug binario TRES vezes.
  paraCentavos,
  somenteData,
  formatarISO,
  gerarParcelas,
  redistribuir,
  validarVencimentoNaSolicitacao,
  validarAditivo,
  PERIODICIDADES
};
