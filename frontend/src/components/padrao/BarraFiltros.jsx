import { createPortal } from 'react-dom';
import { HiOutlineMagnifyingGlass, HiOutlineXMark } from 'react-icons/hi2';
import DateInputBR from '../DateInputBR';
import { FiltroRapido } from '../lista-avancada/ListaAvancada';
import { useControlesDoBloco } from './BlocoConteudo';
import PainelFiltrosVisiveis from './PainelFiltrosVisiveis';

/**
 * BARRA DE FILTROS PADRÃO — o padrão das Solicitações para QUALQUER tela
 * (regra do cliente, 02/09): nada de select de escolha única para filtrar.
 * - Busca única em cima, ocupando a largura da faixa;
 * - abaixo, a linha de filtros por MARCAÇÃO (botão + menu de checkbox,
 *   múltipla seleção) — o FiltroRapido da ListaAvancada, reaproveitado;
 * - valores escolhidos visíveis como etiquetas removíveis + "Limpar tudo".
 * Motivo: com select o usuário não vê o que está filtrado sem abrir cada
 * um; com marcação o estado do filtro é legível de imediato e combinável.
 *
 * A tela guarda o estado: `ativos` = { dimensaoId: Set(valores) } e trata
 * `aoAlternar(dimensaoId, valor, opcoes)`. Conjunto vazio = sem filtro.
 *
 * Uma dimensão curta pode declarar `inline: true`: suas opções ficam
 * expostas na própria faixa, sem o botão que abre menu. É o formato para
 * dois ou três recortes frequentes cuja abertura só acrescentaria clique
 * e esconderia escolhas que cabem integralmente na tela.
 *
 * ## `unico` na dimensão — quando o serviço só aceita UM valor (02/09)
 *
 * Achado na leva do RH/DP: telas mapeiam a dimensão para um parâmetro
 * único (`empresa_grupo_id=1`). Com marcação múltipla, marcar dois valores
 * fazia a tela mandar NENHUM — o usuário via duas etiquetas e a lista não
 * estreitava. Capacidade aparente sem efeito: a mesma família da R15.
 *
 * Então a dimensão declara `unico: true`, e aí: a marca é REDONDA (a forma
 * diz que só cabe uma), marcar outra substitui, e a etiqueta sempre reflete
 * o que está filtrando de verdade. `aoAlternar` recebe `{ unico }` no
 * terceiro argumento — repasse para `alternarValorFiltro`.
 *
 * ## `campos` — o recorte que NÃO é enumerável (R16b, 02/09)
 *
 * Marcação pressupõe lista fechada de opções. Competência (`month`) e
 * período (`date` inicial/final) não têm lista: são contínuos. Na leva do
 * RH/DP seis telas precisavam disso, e sem lugar no componente elas
 * voltariam à grade crua de `select`/`input` — vinte exceções não é regra
 * (R16b: o padrão cresce, a exceção não se acumula).
 *
 * Então `campos` é um espaço declarado, na MESMA faixa, antes da linha de
 * marcação: `[{ id, rotulo, tipo: 'month'|'date'|'number'|'select', valor, aoMudar }]`.
 * O `select` fica reservado a requisito operacional de escolha única, como
 * a obra sem a qual uma jornada não pode ser montada. Recortes opcionais —
 * status, vínculo e empresa — continuam em `filtros`, com etiquetas.
 *
 * ## `visibilidade` — QUAIS filtros aparecem (05/09, fechamento do N53)
 *
 * Medido: três telas ofereciam essa escolha, cada uma com uma interface
 * própria (modal de marcação na Consulta de títulos, menu de marcação nas
 * Solicitações, bloco recolhível que não gravava nada nos
 * Provisionamentos). A superfície única mora em `PainelFiltrosVisiveis`;
 * esta prop é só o LUGAR dela — na própria faixa de filtros, junto do que
 * ela governa, e não numa barra de ações ou num bloco à parte, onde a
 * pessoa tinha de adivinhar a ligação entre o painel e a faixa.
 *
 * Recebe o objeto devolvido por `useFiltrosVisiveis(chave, filtros, …)`.
 * A tela continua dona de QUAIS campos e dimensões monta — o painel só
 * diz quais ids estão à vista.
 *
 * ## O painel SOBE para a faixa do título quando ela está vazia (06/09)
 *
 * Regra do cliente, dita na Consulta de títulos e declarada maior que
 * aquela tela: espaço horizontal vago ao lado do título é dos controles
 * do bloco, em vez de empurrar tudo para baixo.
 *
 * MEDIDO: 83 faixas de `BarraFiltros` no sistema, 75 delas dentro de um
 * `BlocoConteudo`; 48 passam `visibilidade`, e em 24 o bloco em volta tem
 * título e NENHUMA ação declarada — cabeçalho com o lado direito inteiro
 * vazio, e o botão "Filtros visíveis" desenhado uma linha abaixo. Nessas
 * 24 o painel passa a ser desenhado no slot do cabeçalho, por portal, sem
 * que nenhuma das 24 telas precise mudar uma linha.
 *
 * O CRITÉRIO É O VAZIO MEDIDO, não o gosto: só sobe onde `temAcoes` é
 * falso. Onde o cabeçalho já declara ações, a faixa da direita já tem
 * dono e quem decide o arranjo é a tela, pela prop `controles` do bloco.
 *
 * O QUE NÃO SOBE: as marcas de filtro (`FiltroRapido`) e as etiquetas.
 * Elas são o recorte, não o controle do bloco — o cliente pediu os campos
 * de filtro logo abaixo do título, e é onde eles ficam.
 */
export default function BarraFiltros({
  busca,               // { valor, aoMudar, placeholder }
  campos = [],         // [{ id, rotulo, tipo, valor, aoMudar, min, max, step, placeholder, sugestoes, opcoes }]
  filtros = [],        // [{ id, rotulo, unico?, opcoes: [{ valor, rotulo }] }]
  ativos = {},         // { [id]: Set<string> }
  visibilidade = null, // retorno de `useFiltrosVisiveis` — ver acima
  aoAlternar,
  aoLimpar
}) {
  /* O slot de controles do bloco em volta — `null` quando não há bloco, ou
     quando ele não tem título (e portanto não tem cabeçalho). O hook é
     chamado SEMPRE, antes de qualquer condição (R29). */
  const slotDoBloco = useControlesDoBloco();
  const painel = visibilidade ? <PainelFiltrosVisiveis visibilidade={visibilidade} /> : null;
  /* Sobe só onde o vazio foi medido: bloco com cabeçalho e sem ações. */
  const painelPromovido = Boolean(painel && slotDoBloco?.no && !slotDoBloco.temAcoes);

  const etiquetas = [];
  filtros.forEach((dim) => {
    const selecionados = ativos[dim.id] || new Set();
    (dim.opcoes || []).forEach((opcao) => {
      if (!dim.inline && selecionados.has(String(opcao.valor))) {
        etiquetas.push({
          dimensao: dim.id,
          dimensaoRotulo: dim.rotulo,
          unico: Boolean(dim.unico),
          obrigatorio: Boolean(dim.obrigatorio),
          valor: String(opcao.valor),
          rotulo: opcao.rotulo
        });
      }
    });
  });

  return (
    <div className="app-filtros">
      {/* O painel desenhado LÁ EM CIMA, no cabeçalho do bloco. Portal, e
          não uma prop nova em 24 telas: o componente que sabe onde há
          vazio é o bloco, e ele publica o lugar por contexto. */}
      {painelPromovido ? createPortal(painel, slotDoBloco.no) : null}
      {busca ? (
        <div className="la-busca app-filtros-busca">
          <HiOutlineMagnifyingGlass aria-hidden="true" />
          <input
            type="text"
            value={busca.valor}
            onChange={(event) => busca.aoMudar(event.target.value)}
            placeholder={busca.placeholder || 'Buscar…'}
            aria-label={busca.placeholder || 'Buscar na lista'}
          />
          {busca.valor && (
            <button type="button" onClick={() => busca.aoMudar('')} aria-label="Limpar busca">
              <HiOutlineXMark aria-hidden="true" />
            </button>
          )}
        </div>
      ) : null}

      {campos.length > 0 && (
        <div className="app-filtros-campos">
          {/*
              `placeholder`, `step` e `sugestoes` (05/09) — o componente estava
              engolindo capacidade das telas.

              Achado em duas migrações no mesmo dia: os filtros de Solicitações
              tinham um DATALIST de responsáveis que sumiu na migração, e os de
              Compras perderam `step="0.01"` nos campos de valor e os
              placeholders de exemplo ("Ex: SOL-12345"). Nada disso era enfeite
              — o datalist era a única sugestão que a pessoa tinha para um campo
              que aceita nome livre.

              Componente compartilhado que não repassa o que a tela precisa não
              padroniza: ele apaga. Quem migra fica entre perder a capacidade
              ou não usar o padrão, e as duas saídas são ruins.
          */}
          {/*
              `data-tipo` (05/09) — a MEDIDA do campo vem do TIPO, e o tipo
              já estava aqui.

              `campo.tipo` chegava do JSX, virava o `type` do input e parava
              aí: o CSS não tinha como saber se aquele campo era uma data de
              10 caracteres ou um nome livre, então todos ficavam na largura
              intrínseca do input e a faixa sobrava vazia (medido: 24 das 31
              telas com `campos` declaram um ou dois). Emitindo o tipo no
              `<label>`, o piso e o teto saem dos tokens --campo-filtro-*,
              como a largura de coluna sai do `tipo` na TabelaPadrao — a tela
              declara o que o campo É, nunca quanto ele mede (R10).
          */}
          {campos.map((campo) => (
            <label key={campo.id} className="app-filtros-campo" data-tipo={campo.tipo || 'text'}>
              <span className="app-filtros-campo-rotulo">{campo.rotulo}</span>
              {/*
                  `tipo: 'date'` NAO vira mais campo nativo de data (06/09).

                  MEDIDO no Chromium com o mesmo HTML: a ordem dos campos do
                  campo nativo sai do idioma da INTERFACE do navegador, e nao
                  do `lang="pt-BR"` da pagina nem do `Accept-Language` —
                  contexto pt-BR deu `Month/Day/Year`, e so um processo com
                  `LANG=pt_BR.UTF-8` deu `Dia/Mes/Ano`. Quer dizer: a MESMA
                  faixa de filtro aparece `mm/dd/yyyy` para um usuario e
                  `dd/mm/aaaa` para outro, e a tela nao tem como decidir. Foi
                  assim que as seis telas do relatorio apareceram em
                  `mm/dd/yyyy` nas capturas do preview, nas tres larguras.

                  Como o formato nao e escolha do HTML, o conserto nao e um
                  atributo: e trocar o campo. O `DateInputBR` ja existia no
                  sistema desde a leva de medicao (texto com mascara
                  DD/MM/AAAA, estado externo em ISO) e era usado em 5 lugares
                  — isto e unificacao, nao componente novo.

                  O `data-tipo` do label continua `date`: a LARGURA do campo
                  sai dos tokens --campo-filtro-data-*, e ela nao mudou.
              */}
              {campo.tipo === 'select' ? (
                <select
                  name={campo.id}
                  value={campo.valor ?? ''}
                  required={campo.required}
                  disabled={campo.disabled}
                  onChange={(event) => campo.aoMudar(event.target.value)}
                >
                  <option value="">{campo.placeholder || 'Selecione'}</option>
                  {(campo.opcoes || []).map((opcao) => (
                    <option key={String(opcao.valor)} value={String(opcao.valor)}>
                      {opcao.rotulo}
                    </option>
                  ))}
                </select>
              ) : campo.tipo === 'date' ? (
                <DateInputBR
                  name={campo.id}
                  value={campo.valor ?? ''}
                  min={campo.min}
                  max={campo.max}
                  required={campo.required}
                  disabled={campo.disabled}
                  placeholder={campo.placeholder}
                  onChange={(event) => campo.aoMudar(event.target.value)}
                />
              ) : (
                <input
                  type={campo.tipo || 'text'}
                  value={campo.valor ?? ''}
                  min={campo.min}
                  max={campo.max}
                  step={campo.step}
                  required={campo.required}
                  disabled={campo.disabled}
                  placeholder={campo.placeholder}
                  list={campo.sugestoes?.length ? `sugestoes-${campo.id}` : undefined}
                  onChange={(event) => campo.aoMudar(event.target.value)}
                />
              )}
              {campo.sugestoes?.length ? (
                <datalist id={`sugestoes-${campo.id}`}>
                  {campo.sugestoes.map((sugestao) => (
                    <option key={String(sugestao)} value={String(sugestao)} />
                  ))}
                </datalist>
              ) : null}
            </label>
          ))}
        </div>
      )}

      {(filtros.length > 0 || (painel && !painelPromovido)) && (
        <div className="la-filtros-linha">
          {filtros.length > 0 ? <span className="la-filtros-rotulo">Filtrar:</span> : null}
          {filtros.map((dim) => {
            const selecionados = ativos[dim.id] || new Set();
            if (dim.inline) {
              return (
                <div
                  key={dim.id}
                  className="app-filtro-opcoes-inline"
                  role="group"
                  aria-label={`Filtrar por ${String(dim.rotulo).toLowerCase()}`}
                >
                  <span className="app-filtro-opcoes-inline-rotulo">{dim.rotulo}:</span>
                  {(dim.opcoes || []).map((opcao) => {
                    const valor = String(opcao.valor);
                    const ativo = selecionados.has(valor);
                    return (
                      <button
                        key={valor}
                        type="button"
                        className={`la-filtro-btn ${ativo ? 'ativo' : ''}`}
                        aria-pressed={ativo}
                        onClick={() => aoAlternar(dim.id, valor, { unico: Boolean(dim.unico) })}
                      >
                        {opcao.rotulo}
                      </button>
                    );
                  })}
                </div>
              );
            }
            return (
              <FiltroRapido
                key={dim.id}
                dim={dim}
                selecionados={selecionados}
                onToggle={(valor) => aoAlternar(dim.id, valor, { unico: Boolean(dim.unico) })}
              />
            );
          })}
          {aoLimpar && filtros.some((dim) => dim.inline && (ativos[dim.id]?.size || 0) > 0) ? (
            <button type="button" className="la-link" onClick={aoLimpar}>Limpar filtros</button>
          ) : null}
          {painelPromovido ? null : painel}
        </div>
      )}

      {etiquetas.length > 0 && (
        <div className="la-etiquetas" aria-label="Filtros ativos">
          <span className="la-filtros-rotulo">Filtrando:</span>
          {etiquetas.map((etiqueta) => (
            <span
              key={`${etiqueta.dimensao}:${etiqueta.valor}`}
              className="la-etiqueta"
              data-obrigatorio={etiqueta.obrigatorio ? 'sim' : undefined}
            >
              <span className="la-etiqueta-dim">{etiqueta.dimensaoRotulo}:</span>
              {etiqueta.rotulo}
              {/*
                `obrigatorio`: dimensão que a tela NÃO consegue não ter (05/09).

                Achado na matriz do CRM: o período de um relatório é sempre
                algum período. A etiqueta trazia um "×" que, ao ser clicado,
                voltava ao padrão — e o padrão gera OUTRA etiqueta na hora.
                O botão prometia remover e trocava. Capacidade aparente sem
                efeito, que é a família da R15.

                Sem o "×", a etiqueta volta a ser o que é: o estado atual do
                recorte, mudado pelo menu de marcação, não removível.
              */}
              {etiqueta.obrigatorio ? null : (
                <button
                  type="button"
                  onClick={() => aoAlternar(etiqueta.dimensao, etiqueta.valor, { unico: Boolean(etiqueta.unico) })}
                  aria-label={`Remover filtro ${etiqueta.dimensaoRotulo} ${etiqueta.rotulo}`}
                >
                  <HiOutlineXMark aria-hidden="true" />
                </button>
              )}
            </span>
          ))}
          {/* "Limpar tudo" só aparece se houver algo que de fato sai. Numa
              faixa só de recortes obrigatórios ele seria a mesma promessa
              vazia do "×" que voltava ao padrão. */}
          {aoLimpar && etiquetas.some((e) => !e.obrigatorio) ? (
            <button type="button" className="la-link" onClick={aoLimpar}>Limpar tudo</button>
          ) : null}
        </div>
      )}
    </div>
  );
}

/*
 * Alterna um valor numa dimensão de filtro — utilitário para as telas.
 * `opcoes.unico`: dimensão de valor único (o serviço só aceita um) — marcar
 * outro SUBSTITUI em vez de somar, e marcar o mesmo desmarca. Sem isso a
 * tela mostrava duas etiquetas e mandava filtro nenhum.
 */
export function alternarValorFiltro(ativos, dimensao, valor, opcoes = {}) {
  const proximo = { ...ativos };
  const conjunto = new Set(proximo[dimensao] || []);
  const chave = String(valor);
  if (conjunto.has(chave)) {
    conjunto.delete(chave);
  } else if (opcoes.unico) {
    conjunto.clear();
    conjunto.add(chave);
  } else {
    conjunto.add(chave);
  }
  proximo[dimensao] = conjunto;
  return proximo;
}
