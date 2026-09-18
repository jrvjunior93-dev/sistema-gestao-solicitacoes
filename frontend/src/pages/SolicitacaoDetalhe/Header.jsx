import { useEffect, useMemo, useState } from 'react';
import { HiOutlineInformationCircle } from 'react-icons/hi2';
import {
  Avisos,
  BlocoConteudo,
  CampoForm,
  CamposComVazios,
  FormSecao,
  useAvisos
} from '../../components/padrao';
import { corrigirTextoCorrompido } from '../../utils/texto';
import { extrairParesDescricao } from '../../utils/formatarTexto';
import { formatarDataLocalPtBr } from '../../utils/dateLocal';
import { maskCpfCnpj } from '../../utils/formatters';
import { formaPagamentoEhPix } from '../../utils/formaPagamento';

const ESTADO_CIVIL_REPRESENTANTE = {
  SOLTEIRO: 'Solteiro(a)',
  CASADO: 'Casado(a)',
  DIVORCIADO: 'Divorciado(a)',
  VIUVO: 'Viúvo(a)',
  SEPARADO: 'Separado(a)',
  UNIAO_ESTAVEL: 'União estável'
};

/*
  DADOS DO REGISTRO — o bloco principal do detalhe (migração de 05/09).

  O que mudou, e por quê:

  - A IDENTIDADE e as AÇÕES saíram daqui e foram para a faixa fixa
    (`PageHeader` no index.jsx). Tela de detalhe tem seta de voltar, título
    com a identificação do registro e barra de ações na faixa que ACOMPANHA
    A ROLAGEM (C3/C4/C5/R13). O cabeçalho próprio desta tela não grudava:
    era uma `div.sol-detail-header` comum, e a ação principal sumia ao rolar
    numa tela que tem quinze blocos abaixo.

  - O menu "⋯" escrito à mão (estado, `useEffect` de clique fora e de
    Escape, `role="menu"`) virou o `MenuMais` do `PageHeader`. Eram ~60
    linhas replicando um componente padrão. Em 07/09 o menu saiu da faixa
    inteira, por decisão do cliente: o item que ele guardava aqui
    ("Personalizar layout") é botão visível do `PageHeader`.

  - A grade de ladrilhos virou `CamposComVazios`. A contagem de campos
    vazios era uma LISTA MANUAL de 14 pares `[contexto, temValor]`
    espelhando, ladrilho a ladrilho, as condições do grid logo abaixo — duas
    verdades sobre a mesma coisa, que só continuavam iguais por disciplina.
    Agora a lista é UMA e a contagem sai dela (B4).

  - `alert()` do navegador (falha ao gravar a ref. do contrato) virou faixa
    `Avisos` dentro do bloco, ao lado do campo que a causou (R19).

  Nenhum campo saiu da tela. Três mudaram de lugar, e o lugar novo é mais
  visível que o antigo (B3 — informação aparece uma vez):
    Valor      → contagem da faixa fixa (o total acompanha a rolagem);
    Setor      → ladrilho de situação, no topo do corpo;
    Vencimento → ladrilho de situação ("Data Resposta/Pagamento").
  Os três continuam no index.jsx, que é quem os desenha agora.
*/

function formatarData(valor) {
  // Vazio devolve `null`, NUNCA '-': a contagem de vazios do
  // `CamposComVazios` sai da lista de campos, e formatador que devolve
  // travessão faz todo campo parecer preenchido — o alternador "Ver todos
  // os campos (N vazios)" mostraria zero para sempre.
  const texto = formatarDataLocalPtBr(valor);
  return !texto || texto === '-' ? null : texto;
}

function formatarDataHora(valor) {
  if (!valor) return null;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return null;
  return data.toLocaleString('pt-BR');
}

export function formatarValorSolicitacao(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return null;
  return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function normalizarTexto(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function limparDescricaoCompra(valor) {
  const texto = String(valor || '').trim();
  if (!texto) return texto;
  if (normalizarTexto(texto).includes('SOLICITACAO DE COMPRA')) {
    return texto
      .replace(/\s+(Itens|Items):[\s\S]*$/i, '')
      .replace(/\s+-\s*$/g, '')
      .trim() || 'Solicitacao de compra';
  }
  if (!texto || !/solicita[cç][aã]o de compra/i.test(texto)) return texto;
  return texto
    .replace(/\s+(Itens|Items):[\s\S]*$/i, '')
    .replace(/\s+-\s*$/g, '')
    .trim() || 'Solicitacao de compra';
}

/**
 * Texto de apoio do registro para a faixa fixa: o que ESTA solicitação é,
 * em uma linha (R5/C2). A regra é a do oficial e não mudou — a descrição
 * só aparece quando DIZ outra coisa que o título; quando os pares
 * "Rótulo: valor" consumiram o texto inteiro, ou quando o que sobrou
 * apenas ecoa o nome do tipo, não há apoio a mostrar.
 */
export function apoioDoRegistro(solicitacao, contratoDoFluxo) {
  const descricaoCorrigida = limparDescricaoCompra(
    corrigirTextoCorrompido(solicitacao?.descricao || '')
  );
  const estruturada = extrairParesDescricao(descricaoCorrigida);
  const exibida = estruturada.pares.length > 0 ? estruturada.textoLivre : descricaoCorrigida;
  const refContrato = solicitacao?.contrato?.ref_contrato || '-';

  if (String(exibida || '').trim() === String(refContrato || '').trim()) return '';
  const eco = normalizarTexto(exibida) === normalizarTexto(solicitacao?.tipo?.nome);
  if (estruturada.pares.length > 0 && (!exibida || eco)) return '';
  if (eco) return '';
  // O contrato do fluxo novo tem título próprio; ele é o melhor apoio.
  if (contratoDoFluxo?.fluxo_novo && String(refContrato || '').trim() !== '-') {
    return String(exibida || '').trim() || refContrato;
  }
  return String(exibida || '').trim();
}

export default function Header({
  solicitacao,
  // PI-16: o contrato do fluxo novo vive nesta solicitacao. O FAVORECIDO e a CHAVE PIX vem dele,
  // nao da solicitacao — quem recebe o pagamento pode ser um terceiro (PI-12).
  contratoDoFluxo = null,
  mostrarContratoInfo = true,
  podeEditarRefContrato = false,
  contratosObra = [],
  onSalvarRefContrato
}) {
  const [contratoSelecionadoId, setContratoSelecionadoId] = useState('');
  const [salvandoRef, setSalvandoRef] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    setContratoSelecionadoId(solicitacao?.contrato_id ? String(solicitacao.contrato_id) : '');
  }, [solicitacao?.contrato_id]);

  const opcoesContrato = useMemo(() => {
    if (!Array.isArray(contratosObra)) return [];
    return contratosObra.map((contrato) => ({
      id: String(contrato.id),
      label: `${contrato.ref_contrato || '-'} (${contrato.codigo || '-'})`
    }));
  }, [contratosObra]);

  const refContratoAtual = solicitacao?.contrato?.ref_contrato || null;
  const codigoContratoAtual = solicitacao?.codigo_contrato || solicitacao?.contrato?.codigo || null;
  const houveAlteracaoRef = contratoSelecionadoId
    && String(contratoSelecionadoId) !== String(solicitacao?.contrato_id || '');

  async function handleSalvarRefContrato() {
    if (!onSalvarRefContrato || !contratoSelecionadoId || !houveAlteracaoRef) return;
    // R26: o contrato escolhido é fixado ANTES do await. A tela recarrega
    // sozinha por evento (LiveUpdates) e o select podia ter mudado no meio.
    const contratoAlvo = Number(contratoSelecionadoId);
    try {
      setSalvandoRef(true);
      await onSalvarRefContrato(contratoAlvo);
      avisar.sucesso('Ref. do contrato atualizada.');
    } catch (error) {
      let mensagem = error?.message || 'Erro ao atualizar ref. do contrato';
      try {
        mensagem = JSON.parse(error.message)?.error || mensagem;
      } catch {
        // mensagem já é o texto do erro
      }
      avisar.erro(mensagem);
    } finally {
      setSalvandoRef(false);
    }
  }

  const subtipoSolicitacao = solicitacao?.tipoSubSolicitacao?.nome || null;
  const descricaoCorrigida = limparDescricaoCompra(
    corrigirTextoCorrompido(solicitacao?.descricao || '')
  );
  // Descrição com pares "Rótulo: valor" vira lista legível abaixo da grade —
  // parágrafo corrido é mais difícil de ler. Só exibição; nada muda no banco.
  const descricaoEstruturada = useMemo(
    () => extrairParesDescricao(descricaoCorrigida),
    [descricaoCorrigida]
  );
  const chavePixContrato = String(
    solicitacao?.favorecido_chave_pix
      || (formaPagamentoEhPix(solicitacao?.formaPagamento) ? contratoDoFluxo?.favorecido?.chave : '')
      || ''
  ).trim();

  // OBJETO, CONTRATADO e RESPONSAVEL existiam no banco e nunca chegavam a tela (esboco do cliente,
  // 23/08). Os tres sao do CONTRATO: numa solicitacao de compra ou reembolso nao ha o que mostrar,
  // e por isso vao com `contexto` FALSO — ficam fora da tela E da contagem de vazios, em vez de
  // aparecerem com um travessao. Ladrilho vazio e ruido que a pessoa aprende a ignorar, e ai para
  // de ler os que importam.
  const contratados = Array.isArray(contratoDoFluxo?.contratados) ? contratoDoFluxo.contratados : [];
  const rotuloContratado = contratados
    // Separador ` · `, o mesmo que o resto do cabecalho usa para lista: dois formatos para a mesma
    // ideia fariam a tela parecer inconsistente sem motivo. PI-12: os contratados podem ser varios.
    //
    // Razao social com o NOME FANTASIA entre parenteses quando houver: o papel identifica a empresa
    // pela razao social, mas quem trabalha na obra a conhece pelo nome de fachada.
    .map((c) => {
      const identificacao = c.nome_fantasia ? `${c.nome} (${c.nome_fantasia})` : c.nome;
      return c.cpf_cnpj ? `${identificacao} — ${c.cpf_cnpj}` : identificacao;
    })
    .join(' · ');

  const temContrato = Boolean(contratoDoFluxo);
  const qualificacaoRepresentante = contratoDoFluxo?.representante_legal_qualificacao;
  const representanteLegal = qualificacaoRepresentante && typeof qualificacaoRepresentante === 'object'
    && !Array.isArray(qualificacaoRepresentante) ? qualificacaoRepresentante : null;
  const qualificacaoConjuge = representanteLegal?.conjuge;
  const conjugeRepresentante = qualificacaoConjuge && typeof qualificacaoConjuge === 'object'
    && !Array.isArray(qualificacaoConjuge) ? qualificacaoConjuge : null;
  const rotuloParceiro = solicitacao?.parceiro
    ? (solicitacao.parceiro.cpf_cnpj
      ? `${solicitacao.parceiro.nome} — ${solicitacao.parceiro.cpf_cnpj}`
      : solicitacao.parceiro.nome)
    : null;
  const rotuloFavorecidoSolicitacao = solicitacao?.favorecido
    ? (solicitacao.favorecido.cpf_cnpj
      ? `${solicitacao.favorecido.nome} — ${solicitacao.favorecido.cpf_cnpj}`
      : solicitacao.favorecido.nome)
    : null;
  const rotuloFavorecidoContrato = contratoDoFluxo?.favorecido
    ? (contratoDoFluxo.favorecido.cpf_cnpj
      ? `${contratoDoFluxo.favorecido.nome} — ${contratoDoFluxo.favorecido.cpf_cnpj}`
      : contratoDoFluxo.favorecido.nome)
    : null;
  const rotuloChavePixContrato = chavePixContrato
    ? `${chavePixContrato}${!solicitacao?.favorecido_chave_pix && contratoDoFluxo?.favorecido?.tipo
      ? ` (${contratoDoFluxo.favorecido.tipo})`
      : ''}`
    : null;

  /*
    A ORDEM é a do esboço do cliente: identidade e partes primeiro (que
    contrato é este, o que se contrata, com quem, quem responde), depois
    datas. `contexto: false` tira o campo da tela E da contagem — é o que
    substitui, sem espelhar condição nenhuma, os 14 pares que a contagem
    manual mantinha à mão.
  */
  const campos = [
    // No tipo CONTRATO o número já compõe o título da página: repetir aqui
    // seria a mesma informação duas vezes (B3).
    {
      label: 'Contrato',
      contexto: mostrarContratoInfo && !temContrato,
      valor: codigoContratoAtual,
      span: 2
    },
    { label: 'Objeto', contexto: temContrato, valor: contratoDoFluxo?.objeto || null, span: 4 },
    // No fluxo novo o título faz parte da identidade da faixa. Contratos
    // legados preservam a antiga Ref. do contrato, que não é um título.
    {
      label: 'Ref. do contrato',
      contexto: mostrarContratoInfo && !contratoDoFluxo?.fluxo_novo,
      valor: refContratoAtual,
      span: 2
    },
    {
      label: 'Contratado',
      contexto: temContrato,
      valor: rotuloContratado || null,
      span: contratados.length > 1 ? 2 : 1
    },
    { label: 'Fornecedor / Credor', contexto: !temContrato, valor: rotuloParceiro, span: 2 },
    { label: 'Favorecido', contexto: !temContrato, valor: rotuloFavorecidoSolicitacao, span: 2 },
    {
      label: 'Forma de pagamento',
      contexto: !temContrato,
      valor: solicitacao?.formaPagamento?.nome || null,
      span: 2
    },
    {
      label: 'Chave PIX informada',
      contexto: !temContrato,
      valor: solicitacao?.favorecido_chave_pix || null,
      span: 2
    },
    { label: 'Responsável', contexto: temContrato, valor: contratoDoFluxo?.responsavel?.nome || null },
    { label: 'Obra', valor: solicitacao?.obra?.nome || null, span: 2 },
    { label: 'Criado em', valor: formatarDataHora(solicitacao?.createdAt) },
    { label: 'Justificativa', contexto: !temContrato, valor: solicitacao?.justificativa || null, span: 4 },
    { label: 'Data de demissão', valor: formatarData(solicitacao?.data_demissao) },
    { label: 'Início da medição', valor: formatarData(solicitacao?.data_inicio_medicao) },
    { label: 'Fim da medição', valor: formatarData(solicitacao?.data_fim_medicao) },
    { label: 'Subtipo', valor: subtipoSolicitacao, span: 2 },
    // Quem recebe o pagamento e a chave para pagar. A chave segue a ordem definida pelo
    // cliente (19/08): fixa 1, senao fixa 2, senao a variavel — a escolha e feita no backend,
    // para a tela nao ter uma segunda versao da mesma regra.
    { label: 'Favorecido do contrato', contexto: temContrato, valor: rotuloFavorecidoContrato, span: 2 },
    { label: 'Chave PIX', contexto: temContrato, valor: rotuloChavePixContrato, span: 2 }
  ];
  const camposRepresentante = representanteLegal ? [
    { label: 'Nome completo', valor: representanteLegal.nome, span: 2 },
    { label: 'CPF', valor: maskCpfCnpj(representanteLegal.cpf) },
    { label: 'RG', valor: representanteLegal.rg },
    { label: 'Cargo ou função', valor: representanteLegal.cargo },
    { label: 'Nacionalidade', valor: representanteLegal.nacionalidade },
    {
      label: 'Estado civil',
      valor: ESTADO_CIVIL_REPRESENTANTE[representanteLegal.estado_civil]
        || representanteLegal.estado_civil
    },
    { label: 'Profissão', valor: representanteLegal.profissao }
  ] : [];
  const camposConjuge = conjugeRepresentante ? [
    { label: 'Nome completo', valor: conjugeRepresentante.nome, span: 2 },
    { label: 'CPF', valor: maskCpfCnpj(conjugeRepresentante.cpf) },
    { label: 'RG', valor: conjugeRepresentante.rg },
    { label: 'Nacionalidade', valor: conjugeRepresentante.nacionalidade },
    { label: 'Profissão', valor: conjugeRepresentante.profissao },
    { label: 'Regime de bens', valor: conjugeRepresentante.regime_bens, span: 2 }
  ] : [];

  return (
    <>
      <BlocoConteudo
        titulo="Dados da solicitação"
        variante="primario"
        cor="var(--module-solicitacoes)"
        recolhivel
      >
        <Avisos avisos={avisos} aoFechar={fechar} />
        <CamposComVazios colunas={4} campos={campos} />

        {representanteLegal && (
          <section className="mt-4 border-t border-[var(--c-border)] pt-3" aria-label="Qualificação do representante legal">
            <h3 className="mb-2 text-sm font-semibold text-[var(--c-text)]">Representante legal</h3>
            <CamposComVazios colunas={4} campos={camposRepresentante} />
          </section>
        )}
        {conjugeRepresentante && (
          <section className="mt-4 border-t border-[var(--c-border)] pt-3" aria-label="Dados do cônjuge">
            <h3 className="mb-2 text-sm font-semibold text-[var(--c-text)]">Cônjuge do representante</h3>
            <CamposComVazios colunas={4} campos={camposConjuge} />
          </section>
        )}

        {/* Pares "Rótulo: valor" da DESCRIÇÃO: leitura do texto livre,
            não são campos do sistema — não alimentam título, previsão
            nem relatório. Ficam abaixo dos oficiais, discretos; se um
            repetir um campo oficial, o oficial é a autoridade. */}
        {descricaoEstruturada.pares.length > 0 && (
          <div className="sol-detail-informados" aria-label="Detalhes informados na descrição">
            <p className="sol-detail-informados-titulo">
              <HiOutlineInformationCircle aria-hidden="true" />
              Detalhes informados
              <span className="sol-detail-informados-nota">lidos da descrição</span>
            </p>
            <dl className="sol-detail-informados-lista">
              {descricaoEstruturada.pares.map((par, indice) => (
                <div key={`${par.rotulo}-${indice}`} className="sol-detail-informados-par">
                  <dt>{par.rotulo}</dt>
                  <dd>{par.valor}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </BlocoConteudo>

      {/* Vincular a solicitação a outro contrato é raro e muda o destino do
          dinheiro: bloco secundário, recolhido, mas sempre à vista. O select
          aqui é ENTRADA DE DADO (escolher o contrato), não filtro — uso que
          a R12 mantém legítimo. */}
      {mostrarContratoInfo && podeEditarRefContrato && (
        <BlocoConteudo
          titulo="Editar ref. do contrato"
          variante="secundario"
          descricao="Troca o contrato a que esta solicitação se refere."
          recolhivel
          recolhidoPadrao
        >
          <FormSecao colunas={2}>
            <CampoForm label="Contrato da obra">
              <select
                className="input"
                value={contratoSelecionadoId}
                onChange={(e) => setContratoSelecionadoId(e.target.value)}
              >
                <option value="">Selecione um contrato</option>
                {opcoesContrato.map((opcao) => (
                  <option key={opcao.id} value={opcao.id}>
                    {opcao.label}
                  </option>
                ))}
              </select>
            </CampoForm>
            <CampoForm label="&nbsp;">
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSalvarRefContrato}
                disabled={!houveAlteracaoRef || salvandoRef}
              >
                {salvandoRef ? 'Salvando...' : 'Salvar ref.'}
              </button>
            </CampoForm>
          </FormSecao>
        </BlocoConteudo>
      )}
    </>
  );
}
