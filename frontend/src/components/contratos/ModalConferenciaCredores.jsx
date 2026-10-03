import { useEffect, useState } from 'react';
import OverlayModal from '../ui/OverlayModal';
import {
  completarCadastroCredor,
  conferirCredoresContrato,
  consultarCnpjCredor
} from '../../services/contratos';
import { getCpfCnpjError, maskCpfCnpj } from '../../utils/formatters';

/**
 * Conferência do cadastro dos contratados antes de criar o contrato acima do limite (20/08).
 *
 * Acima do limite o contrato vai ao Jurídico, que monta a minuta — e minuta precisa identificar e
 * localizar a parte. O motivo de isto existir está no número: dos 2.454 fornecedores ativos do
 * banco, **26** têm endereço completo. Exigir sem deixar corrigir aqui pararia o fluxo em 99% das
 * aberturas.
 *
 * Por isso o modal não só acusa: ele **conserta**. A edição usa uma rota estreita que altera apenas
 * endereço e CPF/CNPJ — quem abre contrato não ganha acesso ao cadastro de parceiros.
 *
 * A consulta de CNPJ é conveniência e pode não existir: em ambiente sem a integração ligada, o
 * botão simplesmente não aparece e a digitação segue sendo o caminho. E ela **preenche o
 * formulário**, nunca salva sozinha — quem confirma é a pessoa.
 */

const CAMPOS = [
  { chave: 'cpf_cnpj', rotulo: 'CPF/CNPJ', obrigatorio: true, largura: 'md:col-span-2' },
  { chave: 'endereco', rotulo: 'Logradouro', obrigatorio: true, largura: 'md:col-span-4' },
  { chave: 'numero', rotulo: 'Número', obrigatorio: true, largura: 'md:col-span-1' },
  { chave: 'complemento', rotulo: 'Complemento', obrigatorio: false, largura: 'md:col-span-2' },
  { chave: 'bairro', rotulo: 'Bairro', obrigatorio: true, largura: 'md:col-span-3' },
  { chave: 'cep', rotulo: 'CEP', obrigatorio: true, largura: 'md:col-span-2' },
  { chave: 'municipio', rotulo: 'Municipio', obrigatorio: true, largura: 'md:col-span-3' },
  { chave: 'estado', rotulo: 'UF', obrigatorio: true, largura: 'md:col-span-1' }
];

const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');

function documentoFormatado(valor) {
  const d = soDigitos(valor);
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return String(valor || '-');
}

function cepFormatado(valor) {
  const d = soDigitos(valor);
  return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : String(valor || '');
}

function enderecoEmUmaLinha(p) {
  const partes = [
    [p.endereco, p.numero].filter(Boolean).join(', '),
    p.complemento,
    p.bairro,
    [p.municipio, p.estado].filter(Boolean).join('/'),
    p.cep ? `CEP ${cepFormatado(p.cep)}` : ''
  ].filter((parte) => String(parte || '').trim());
  return partes.length ? partes.join(' · ') : 'Sem endereco cadastrado';
}

export default function ModalConferenciaCredores({
  aberto,
  parceiroIds = [],
  onConfirmar,
  onFechar,
  criando = false
}) {
  const [parceiros, setParceiros] = useState([]);
  const [consultaHabilitada, setConsultaHabilitada] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const [editandoId, setEditandoId] = useState(null);
  const [formulario, setFormulario] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [consultando, setConsultando] = useState(false);
  const [avisoConsulta, setAvisoConsulta] = useState('');

  const chaveIds = parceiroIds.join(',');

  useEffect(() => {
    if (!aberto || !chaveIds) return undefined;
    let cancelado = false;
    setCarregando(true);
    setErro('');
    conferirCredoresContrato(chaveIds.split(','))
      .then((r) => {
        if (cancelado) return;
        setParceiros(Array.isArray(r?.parceiros) ? r.parceiros : []);
        setConsultaHabilitada(Boolean(r?.consulta_cnpj_habilitada));
      })
      .catch((e) => { if (!cancelado) setErro(e.message || 'Erro ao conferir os cadastros.'); })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [aberto, chaveIds]);

  const tudoCompleto = parceiros.length > 0 && parceiros.every((p) => p.completo);

  function abrirEdicao(parceiro) {
    setEditandoId(parceiro.id);
    setAvisoConsulta('');
    setErro('');
    setFormulario(Object.fromEntries(CAMPOS.map((c) => [c.chave, parceiro[c.chave] || ''])));
  }

  async function consultar() {
    setAvisoConsulta('');
    setConsultando(true);
    try {
      const dados = await consultarCnpjCredor(formulario.cpf_cnpj);
      // Só preenche o que está VAZIO: sobrescrever um endereço que alguém digitou à mão, com o da
      // Receita, apagaria correção deliberada sem avisar.
      setFormulario((atual) => {
        const novo = { ...atual };
        for (const campo of ['endereco', 'numero', 'complemento', 'bairro', 'cep', 'municipio', 'estado']) {
          if (!String(novo[campo] || '').trim() && dados[campo]) novo[campo] = dados[campo];
        }
        return novo;
      });
      setAvisoConsulta(dados.situacao ? `Consulta concluida. Situacao cadastral: ${dados.situacao}.` : 'Consulta concluida.');
    } catch (e) {
      setAvisoConsulta(e.message || 'Nao foi possivel consultar. Preencha manualmente.');
    } finally {
      setConsultando(false);
    }
  }

  async function salvar() {
    setErro('');
    const documentoErro = getCpfCnpjError(formulario.cpf_cnpj, { required: true });
    if (documentoErro) {
      setErro(documentoErro);
      return;
    }
    setSalvando(true);
    try {
      const atualizado = await completarCadastroCredor(editandoId, formulario);
      setParceiros((atuais) => atuais.map((p) => (p.id === atualizado.id ? { ...p, ...atualizado } : p)));
      setEditandoId(null);
    } catch (e) {
      setErro(e.message || 'Nao foi possivel salvar o cadastro.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <OverlayModal aberto={aberto} rotulo="Conferir cadastro dos contratados" largura="960px">
      <div className="flex items-center justify-between border-b border-[var(--c-border)] px-4 py-3">
        <div>
          <h3 className="text-lg font-semibold text-[var(--c-text)]">Conferir dados do contratado</h3>
          <p className="text-xs text-[var(--c-muted)]">
            Acima do limite o contrato vai ao Jurídico. Confira endereço e CPF/CNPJ antes de criar.
          </p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={onFechar} disabled={criando || salvando}>
          Fechar
        </button>
      </div>

      <div className="space-y-3 overflow-y-auto px-4 py-3" data-testid="conferencia-credores">
        {erro && <div className="app-alert app-alert--error">{erro}</div>}
        {carregando && <p className="text-sm text-[var(--c-muted)]">Carregando cadastros...</p>}

        {!carregando && parceiros.map((p) => (
          <div key={p.id} className="rounded-xl border border-[var(--c-border)] p-3 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--c-text)]">{p.nome}</p>
                <p className="text-xs text-[var(--c-muted)]">
                  {documentoFormatado(p.cpf_cnpj)} · {enderecoEmUmaLinha(p)}
                </p>
              </div>
              <span
                className={`text-xs font-semibold ${p.completo ? 'text-[var(--c-success,#15803d)]' : 'text-[var(--c-danger,#b91c1c)]'}`}
                data-testid={`credor-status-${p.id}`}
              >
                {p.completo ? 'Cadastro completo' : 'Faltam dados'}
              </span>
            </div>

            {!p.completo && (
              <p className="text-xs text-[var(--c-danger,#b91c1c)]">
                Pendente: {p.pendencias.join(', ')}
              </p>
            )}

            {editandoId !== p.id && (
              <button type="button" className="btn btn-outline btn-sm" onClick={() => abrirEdicao(p)}
                data-testid={`editar-credor-${p.id}`}>
                {p.completo ? 'Revisar cadastro' : 'Completar cadastro'}
              </button>
            )}

            {editandoId === p.id && (
              <div className="space-y-2 border-t border-[var(--c-border)] pt-2">
                <div className="grid gap-2 md:grid-cols-6">
                  {CAMPOS.map((campo) => (
                    <label key={campo.chave} className={`grid gap-1 text-sm ${campo.largura}`}>
                      {campo.rotulo}{campo.obrigatorio ? ' *' : ''}
                      <input
                        className="input input-sm"
                        name={`credor_${campo.chave}`}
                        value={formulario[campo.chave] ?? ''}
                        maxLength={campo.chave === 'estado' ? 2 : undefined}
                        onChange={(e) => setFormulario((a) => ({
                          ...a,
                          [campo.chave]: campo.chave === 'cpf_cnpj' ? maskCpfCnpj(e.target.value) : e.target.value
                        }))}
                        disabled={salvando}
                      />
                    </label>
                  ))}
                </div>

                {avisoConsulta && <p className="text-xs text-[var(--c-muted)]">{avisoConsulta}</p>}

                <div className="flex flex-wrap justify-end gap-2">
                  {/* So aparece quando o servidor diz que a integracao esta ligada. Botao que
                      sempre falha e pior do que botao que nao existe. */}
                  {consultaHabilitada && soDigitos(formulario.cpf_cnpj).length === 14 && (
                    <button type="button" className="btn btn-outline btn-sm" onClick={consultar} disabled={consultando || salvando}
                      data-testid="consultar-cnpj">
                      {consultando ? 'Consultando...' : 'Consultar CNPJ'}
                    </button>
                  )}
                  <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditandoId(null)} disabled={salvando}>
                    Cancelar
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={salvar} disabled={salvando}
                    data-testid={`salvar-credor-${p.id}`}>
                    {salvando ? 'Salvando...' : 'Salvar cadastro'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {!carregando && parceiros.length === 0 && (
          <p className="text-sm text-[var(--c-muted)]">Nenhum contratado para conferir.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--c-border)] px-4 py-3">
        <span className="text-xs text-[var(--c-muted)]">
          {tudoCompleto
            ? 'Tudo conferido. Pode criar a solicitacao.'
            : 'Complete os cadastros pendentes para liberar a criacao.'}
        </span>
        <div className="flex gap-2">
          <button type="button" className="btn btn-outline btn-sm" onClick={onFechar} disabled={criando || salvando}>
            Voltar
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onConfirmar}
            disabled={!tudoCompleto || criando || salvando || carregando}
            data-testid="confirmar-conferencia-credores"
          >
            {criando ? 'Criando...' : 'Confirmar e criar solicitacao'}
          </button>
        </div>
      </div>
    </OverlayModal>
  );
}
