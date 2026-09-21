import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiEye } from 'react-icons/hi2';
import { getContratoParcelas } from '../../services/contratos';
import { BlocoConteudo, StatGrid, StatTile, TabelaPadrao } from '../../components/padrao';

/**
 * As PREVISOES do contrato dentro do card do Financeiro (PI-16).
 *
 * O cliente pediu que, ao abrir o contrato, as previsoes de parcela ja aparecessem aqui — e que o
 * botao Aprovar as transformasse em titulos. Antes da aprovacao nao existe titulo nenhum
 * (PI-1/PI-5: o compromisso financeiro so nasce quando alguem aprova), entao esta tabela e a
 * unica leitura possivel do que esta por vir.
 *
 * Depois da aprovacao a mesma tabela continua valendo: cada titulo permanece em PREVISAO ate a
 * medicao correspondente ser aprovada, quando passa a ABERTO. E daqui que sai o botao que abre os
 * anexos e comentarios daquela medicao.
 *
 * Le a MESMA rota que a barra de acoes (`/contratos/:id/parcelas`): dois pedacos da tela lendo
 * fontes diferentes acabariam mostrando saldos diferentes para o mesmo contrato.
 *
 * Migrada para os componentes padrao em 05/09: `BlocoConteudo` (superficie e apoio ancorado ao
 * titulo, R5), `StatGrid`/`StatTile` (saldo e comprometido) e as classes de COMPARACAO da R8 —
 * `texto-previsto` (azul) x `texto-realizado` (vermelho) — onde a medicao muda o valor da parcela.
 * A distincao ali e de SIGNIFICADO, nao de intensidade: sem cor de serie, "previsto 12.000" e
 * "12.400" sao dois numeros cinzentos e a pessoa tem de adivinhar qual e qual.
 */

const moeda = (v) => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const data = (v) => (v ? String(v).slice(0, 10).split('-').reverse().join('/') : '-');
const ROTULOS_SITUACAO = {
  PREVISAO: 'Previsão',
  ABERTO: 'Aberto',
  LIBERADA: 'Liberada',
  PARCIAL: 'Parcial',
  QUITADO: 'Quitado',
  CANCELADO: 'Cancelado',
  ESTORNADO: 'Estornado'
};

const rotuloSituacao = (valor) => ROTULOS_SITUACAO[String(valor || '').toUpperCase()] || valor || '-';

export default function PrevisoesContrato({
  contratoId,
  solicitacaoId,
  atualizarEm,
  onAbrirMedicao,
  onDados,
  somenteLeitura = false,
  permitirAbrirMedicaoSomenteLeitura = false
}) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!contratoId) { setDados(null); return undefined; }
    let cancelado = false;
    setErro('');
    getContratoParcelas(contratoId)
      .then((r) => {
        if (cancelado) return;
        setDados(r);
        // O modal da medicao precisa das MESMAS parcelas que esta tabela mostra. Entregar as daqui,
        // em vez de o modal buscar por conta propria, evita as duas partes da tela discordarem
        // sobre o valor de uma parcela logo depois de uma edicao.
        onDados?.(r);
      })
      .catch((e) => { if (!cancelado) { setDados(null); setErro(e.message || 'Erro ao carregar as parcelas do contrato.'); } });
    return () => { cancelado = true; };
  }, [contratoId, atualizarEm]);

  // Erro primeiro: o `return null` abaixo tambem engolia a falha de carregamento, e o card do
  // Financeiro ficava sem as previsoes e sem dizer por que. Um 403 de escopo de obra e a causa
  // mais comum — precisa estar escrito na tela.
  //
  // Isto NAO passa pelo `useAvisos`: nao e evento, e CONDICAO derivada do conteudo (fecha e o
  // problema continua — as parcelas seguem sem carregar). A fronteira esta escrita no proprio
  // `Avisos.jsx`.
  if (erro) {
    return (
      <div className="app-alert app-alert--warning" data-testid="previsoes-contrato-erro">{erro}</div>
    );
  }

  const contrato = dados?.contrato;
  // Só na solicitacao DONA do contrato. Uma solicitacao de medicao ou de aditivo do fluxo antigo
  // tambem aponta para um contrato, e mostraria aqui parcelas que nao sao dela.
  if (!contrato?.fluxo_novo || String(contrato.solicitacao_id) !== String(solicitacaoId)) return null;

  const parcelas = dados?.parcelas || [];
  const totais = dados?.totais || {};
  const temTitulos = parcelas.some((p) => p.titulo_financeiro_id);
  const aindaPrevisao = parcelas.length > 0
    && parcelas.every((p) => String(p.situacao || p.status).toUpperCase() === 'PREVISAO');

  // A contagem fala do conjunto INTEIRO devolvido pela rota — esta tabela nao pagina, entao o
  // rotulo e a lista descrevem o mesmo conjunto. Se um dia a rota paginar, este rotulo passa a
  // mentir e tem de mudar junto.
  const contagem = `${parcelas.length} parcela(s) · ${moeda(totais.valor_contrato)}`;
  const apoio = aindaPrevisao
    ? (temTitulos
      ? `${contrato.codigo} · os titulos permanecem em previsao e passam a Aberto somente quando a medicao correspondente for aprovada.`
      : `${contrato.codigo} · nenhum titulo existe antes da aprovacao do contrato.`)
    : contrato.codigo;

  return (
    <BlocoConteudo
      variante="secundario"
      titulo={aindaPrevisao ? 'Previsao de parcelas do contrato' : 'Parcelas do contrato'}
      contagem={contagem}
      descricao={apoio}
      data-testid="previsoes-contrato"
      recolhivel
      recolhidoPadrao
      alternarAoClicar
    >
      <TabelaPadrao
        colunas={[
          {
            id: 'numero',
            titulo: '#',
            tipo: 'identidade',
            noCard: 'titulo',
            // A sobra da largura vai para a coluna de medicao, que carrega o
            // botao: o numero da parcela nao cresce com o espaco disponivel.
            flex: false,
            render: (p) => p.numero
          },
          {
            id: 'vencimento',
            titulo: 'Vencimento',
            tipo: 'data',
            render: (p) => data(p.vencimento)
          },
          {
            id: 'valor',
            titulo: 'Valor',
            tipo: 'valor',
            render: (p) => {
              // Previsto x atual: a medicao reduz a parcela e joga a diferenca na ultima.
              // Mostrar os dois evita a pergunta "por que mudou?" (PI-5).
              //
              // R8: quando os dois numeros aparecem juntos eles sao uma COMPARACAO, e a cor e da
              // SERIE — previsto azul (`texto-previsto`), realizado/medido vermelho
              // (`texto-realizado`). Sem divergencia nao ha comparacao nenhuma: o valor fica na
              // cor de texto normal, porque pintar de vermelho toda parcela do sistema esvaziaria
              // o sinal justamente onde ele importa.
              const divergente = p.valor_previsto !== null
                && Number(p.valor_previsto) !== Number(p.valor);
              if (!divergente) return moeda(p.valor);
              return (
                <>
                  <span className="texto-realizado" title="Valor medido">{moeda(p.valor)}</span>
                  <span className="block text-xs texto-previsto" title="Valor previsto no contrato">
                    previsto {moeda(p.valor_previsto)}
                  </span>
                </>
              );
            }
          },
          {
            id: 'situacao',
            titulo: 'Situação',
            tipo: 'status',
            render: (p) => (
              <span data-testid={`situacao-parcela-${p.numero}`}>{rotuloSituacao(p.situacao || p.status)}</span>
            )
          },
          {
            id: 'medicao',
            titulo: 'Medição',
            tipo: 'texto',
            render: (p) => (
              p.medicao ? (
                somenteLeitura && !permitirAbrirMedicaoSomenteLeitura ? (
                  <span className="text-sm text-[var(--c-text)]">Medicao {p.medicao.numero}</span>
                ) : (
                  // O botao por titulo que o cliente pediu: abre os anexos e comentarios
                  // DAQUELA medicao. Com uma solicitacao por contrato, sem isto os documentos
                  // de todas as medicoes viram uma pilha unica sem dono.
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    data-testid={`abrir-medicao-${p.medicao.numero}`}
                    onClick={() => onAbrirMedicao?.(p.medicao)}
                  >
                    Medicao {p.medicao.numero}
                  </button>
                )
              ) : (
                <span className="text-xs text-[var(--c-muted)]">-</span>
              )
            )
          }
        ]}
        itens={parcelas}
        vazio="Nenhuma parcela prevista para este contrato."
        storageKey="tabela:solicitacao-detalhe-previsoes-contrato"
        rotuloRolagem="Parcelas do contrato"
        larguraAcoes={140}
        acoesLinha={(p) => (
          p.titulo_financeiro_id ? (
            <Link
              to={`/financeiro/titulos/${p.titulo_financeiro_id}`}
              className="btn btn-outline btn-sm !px-2"
              title={`Ver título da parcela ${p.numero}`}
              aria-label={`Ver título financeiro da parcela ${p.numero}`}
              data-testid={`ver-titulo-parcela-${p.numero}`}
            >
              <HiEye className="h-4 w-4" aria-hidden="true" />
            </Link>
          ) : (
            <span className="text-xs text-[var(--c-muted)]">-</span>
          )
        )}
      />

      {/* ITEM 17 (23/08): o bloco de apropriacoes do contrato saiu daqui.

          Ele foi posto aqui em 20/08 para resolver um problema real — o card "Apropriacoes da
          solicitacao" aparecia vazio num contrato cujo rateio vive em `contrato_apropriacoes`. Esse
          problema foi resolvido de outro jeito, com o card "Apropriacoes do contrato", e este bloco
          virou a TERCEIRA copia da mesma informacao na mesma tela. O cliente pediu para ficar so a
          do card, que e a unica que tambem edita. */}

      {/* ITEM 21 (23/08): a cor do texto do SALDO muda em tres niveis — Saudavel, Normal, Critico.
          O cliente delimitou: "o alerta e so a cor do texto do saldo do contrato. Nao e tela nova
          para exibir alerta."

          O nivel e a cor vem RESOLVIDOS do backend (`saldo.alerta`). A tela nao refaz a conta: duas
          versoes da mesma regra divergem no dia em que uma das duas muda. `title` guarda o nome do
          nivel, para quem nao distingue as cores.

          Esta cor NAO e cor de comparacao (R8) nem cor escrita a mao (R25): e um DADO que chega
          resolvido da rota, como o hexadecimal da etapa do CRM ja registrado no manifesto. */}
      <StatGrid colunas={2}>
        <StatTile
          label="Saldo do contrato"
          title={dados?.saldo?.alerta ? `Saldo ${dados.saldo.alerta.rotulo.toLowerCase()}` : undefined}
          valor={(
            <strong
              data-testid="saldo-do-contrato"
              data-nivel={dados?.saldo?.alerta?.nivel || ''}
              style={dados?.saldo?.alerta?.cor ? { color: dados.saldo.alerta.cor } : undefined}
            >
              {moeda(dados?.saldo?.saldo)}
            </strong>
          )}
        />
        <StatTile label="Já comprometido" valor={moeda(dados?.saldo?.comprometido)} />
      </StatGrid>
    </BlocoConteudo>
  );
}
