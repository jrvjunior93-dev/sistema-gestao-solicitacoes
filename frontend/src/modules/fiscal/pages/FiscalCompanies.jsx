import { useEffect, useRef, useState } from 'react';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  TabelaPadrao,
  CelulaDupla,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos
} from '../../../components/padrao';
import StatusBadge from '../../../components/StatusBadge';
import {
  createFiscalCertificate,
  createFiscalCompany,
  getFiscalCertificates,
  getFiscalCompanies,
  updateFiscalCompany,
  validateFiscalCertificate
} from '../services/fiscalApi';
import { getCpfCnpjError, maskCpfCnpj, onlyDigits } from '../../../utils/formatters';
import DateInputBR from '../../../components/DateInputBR';

const EMPTY_FORM = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  uf: 'ES',
  inscricao_estadual: '',
  ambiente_sefaz: 'homologacao',
  ativo: true,
  modulo_fiscal_habilitado: false,
  observacoes: ''
};

const EMPTY_CERTIFICATE_FORM = {
  fiscal_company_id: '',
  certificate_alias: '',
  storage_type: 'local_secure_path',
  certificate_path: '',
  certificate_s3_key: '',
  password: '',
  valid_from: '',
  valid_until: '',
  serial_number: '',
  issuer: '',
  subject: '',
  is_active: true
};

const ARMAZENAMENTO_LABEL = {
  local_secure_path: 'Caminho local seguro',
  s3_private: 'S3 privado',
  secrets_manager: 'Secrets Manager futuro'
};

function formatDateOnly(value) {
  if (!value) return 'nao informada';
  const datePart = String(value).slice(0, 10);
  const match = datePart.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 'nao informada';
  return `${match[3]}/${match[2]}/${match[1]}`;
}

export default function FiscalCompanies() {
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [certificates, setCertificates] = useState([]);
  const [certificateForm, setCertificateForm] = useState(EMPTY_CERTIFICATE_FORM);
  const [savingCertificate, setSavingCertificate] = useState(false);
  const [validatingCertificateId, setValidatingCertificateId] = useState(null);
  const [certificateValidation, setCertificateValidation] = useState(null);
  // R22: hook usado é hook importado. A referência leva o foco ao formulário
  // (que fica ACIMA da lista) — sem ela, clicar em "Editar" no fim de uma
  // lista longa não muda nada no que a pessoa está vendo (R15).
  const campoRazaoSocialRef = useRef(null);
  // R3/R19: as duas faixas pintadas à mão (red-50 / emerald-50) viram o
  // aviso do sistema, com tom semântico e um dono só (R16).
  const { avisos, avisar, fechar } = useAvisos();

  const load = async () => {
    setLoading(true);
    try {
      const [companiesResult, certificatesResult] = await Promise.all([
        getFiscalCompanies(),
        getFiscalCertificates()
      ]);
      setCompanies(companiesResult?.data || []);
      setCertificates(certificatesResult?.data || []);
    } catch (err) {
      avisar.erro(err.message || 'Erro ao buscar empresas fiscais');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const updateCertificateField = (field, value) => {
    setCertificateForm((current) => ({ ...current, [field]: value }));
  };

  function focarFormulario() {
    campoRazaoSocialRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // preventScroll: quem rola é o scrollIntoView suave.
    campoRazaoSocialRef.current?.focus({ preventScroll: true });
  }

  const editCompany = (company) => {
    setEditingId(company.id);
    setForm({
      razao_social: company.razao_social || '',
      nome_fantasia: company.nome_fantasia || '',
      cnpj: company.cnpj || '',
      uf: company.uf || 'ES',
      inscricao_estadual: company.inscricao_estadual || '',
      ambiente_sefaz: company.ambiente_sefaz || 'homologacao',
      ativo: Boolean(company.ativo),
      modulo_fiscal_habilitado: Boolean(company.modulo_fiscal_habilitado),
      observacoes: company.observacoes || ''
    });
    focarFormulario();
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const novaEmpresa = () => {
    resetForm();
    focarFormulario();
  };

  const submit = async (event) => {
    event.preventDefault();
    const documentoErro = getCpfCnpjError(form.cnpj, { required: true, type: 'cnpj' });
    if (documentoErro) {
      avisar.erro(documentoErro);
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateFiscalCompany(editingId, { ...form, cnpj: onlyDigits(form.cnpj) });
        avisar.sucesso('Empresa fiscal atualizada.');
      } else {
        await createFiscalCompany({ ...form, cnpj: onlyDigits(form.cnpj) });
        avisar.sucesso('Empresa fiscal cadastrada.');
      }
      resetForm();
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar empresa fiscal');
    } finally {
      setSaving(false);
    }
  };

  const submitCertificate = async (event) => {
    event.preventDefault();
    setSavingCertificate(true);
    try {
      await createFiscalCertificate(certificateForm);
      avisar.sucesso('Certificado fiscal cadastrado sem expor segredo no frontend.');
      setCertificateForm(EMPTY_CERTIFICATE_FORM);
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao salvar certificado fiscal');
    } finally {
      setSavingCertificate(false);
    }
  };

  const validateCertificate = async (certificate) => {
    // R26: o certificado é fixado numa const ANTES do await — a lista pode
    // recarregar no meio (o `load()` abaixo troca o array inteiro) e ler o
    // estado depois faria a validação relatar outro alias.
    const alvo = certificate;
    setValidatingCertificateId(alvo.id);
    setCertificateValidation(null);
    try {
      const result = await validateFiscalCertificate(alvo.id);
      const hasError = (result?.checks || []).some((check) => check.status === 'ERROR');
      setCertificateValidation({
        certificateId: alvo.id,
        alias: alvo.certificate_alias,
        checks: result?.checks || []
      });
      // Validação com pendência não é sucesso: o tom acompanha o resultado.
      if (hasError) avisar.alerta('Validação concluída com pendências. Revise os checks.');
      else avisar.sucesso('Certificado validado administrativamente.');
      await load();
    } catch (err) {
      avisar.erro(err.message || 'Erro ao validar certificado fiscal');
    } finally {
      setValidatingCertificateId(null);
    }
  };

  return (
    <Pagina>
      {/*
        R13/C1/C2 — cabeçalho na faixa fixa, com a contagem TOTAL de empresas
        cadastradas (o número que responde "quanto existe"); os recortes
        ficam nos blocos.
      */}
      <PageHeader
        titulo="Empresas fiscais"
        contagem={loading ? null : `${companies.length} empresa(s)`}
        descricao="Cadastro inicial dos CNPJs que serão monitorados pelo módulo fiscal."
        acaoPrincipal={{ rotulo: 'Nova empresa', onClick: novaEmpresa }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      {/*
        R9 (revista em 04/09) — FORMULÁRIO INLINE, E NÃO EM MODAL.

        Esta tela existe PARA cadastrar as empresas monitoradas: pelo teste
        da regra, tirando o formulário sobra uma lista que ninguém abriria
        por si só. Modal aqui obrigaria a abrir e fechar para fazer
        exatamente aquilo que a pessoa veio fazer. Molde: ComercialUnidades
        (painel de formulário ACIMA da lista, mesma rota, mesmos handlers).
      */}
      <BlocoConteudo titulo={editingId ? 'Editar empresa fiscal' : 'Nova empresa fiscal'}>
        <form onSubmit={submit}>
          <FormSecao legenda="Identificação" colunas={2}>
            <CampoForm label="Razão social" obrigatorio span={2}>
              <input
                ref={campoRazaoSocialRef}
                className="input w-full"
                value={form.razao_social}
                onChange={(e) => updateField('razao_social', e.target.value)}
                required
              />
            </CampoForm>

            <CampoForm label="CNPJ" obrigatorio>
              <input
                className="input w-full"
                value={form.cnpj}
                onChange={(e) => updateField('cnpj', maskCpfCnpj(e.target.value))}
                inputMode="numeric"
                maxLength={18}
                required
              />
            </CampoForm>

            <CampoForm label="UF" obrigatorio>
              <input
                className="input w-full uppercase"
                value={form.uf}
                onChange={(e) => updateField('uf', e.target.value.toUpperCase())}
                maxLength={2}
                required
              />
            </CampoForm>

            <CampoForm label="Nome fantasia">
              <input
                className="input w-full"
                value={form.nome_fantasia}
                onChange={(e) => updateField('nome_fantasia', e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Inscrição estadual">
              <input
                className="input w-full"
                value={form.inscricao_estadual}
                onChange={(e) => updateField('inscricao_estadual', e.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Monitoramento" colunas={2}>
            <CampoForm label="Ambiente SEFAZ">
              {/* Select de FORMULÁRIO (entrada de dado do registro) —
                  legítimo pela própria R12; o que ela proíbe é select de
                  recorte de lista. */}
              <select
                className="input w-full"
                value={form.ambiente_sefaz}
                onChange={(e) => updateField('ambiente_sefaz', e.target.value)}
              >
                <option value="homologacao">Homologação</option>
                <option value="producao">Produção</option>
              </select>
            </CampoForm>

            <div className="form-group">
              <span className="form-label">Situação</span>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.ativo}
                    onChange={(e) => updateField('ativo', e.target.checked)}
                  />
                  Ativa
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.modulo_fiscal_habilitado}
                    onChange={(e) => updateField('modulo_fiscal_habilitado', e.target.checked)}
                  />
                  Monitorar
                </label>
              </div>
            </div>

            <CampoForm label="Observações" tipo="texto-longo" span={2}>
              {/* R10: a altura do textarea vem da folha do sistema
                  (textarea.input), não do `min-h-[80px]` que estava aqui. */}
              <textarea
                className="input w-full"
                value={form.observacoes}
                onChange={(e) => updateField('observacoes', e.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Cadastrar'}
            </button>
            {editingId ? (
              <button className="btn btn-outline" type="button" onClick={resetForm}>
                Cancelar edição
              </button>
            ) : null}
          </div>
        </form>
      </BlocoConteudo>

      {/*
        R18 — o card que embrulhava a tabela tinha `overflow-hidden`, que
        cria scrollport e mata o sticky do cabeçalho e da coluna fixa em
        silêncio. O BlocoConteudo não recorta.
      */}
      <BlocoConteudo
        titulo="Empresas cadastradas"
        variante="primario"
        cor="var(--module-fiscal)"
        descricao="Base para captura de DFe, certificados e sincronização com a SEFAZ."
      >
        <TabelaPadrao
          colunas={[
            {
              id: 'empresa',
              titulo: 'Empresa',
              // R17/T5: identidade é o nome próprio do registro — razão
              // social (com o fantasia como sub da mesma célula).
              tipo: 'identidade',
              noCard: 'titulo',
              render: (company) => (
                <CelulaDupla
                  principal={company.razao_social}
                  sub={company.nome_fantasia || null}
                />
              )
            },
            {
              id: 'cnpj',
              titulo: 'CNPJ',
              tipo: 'codigo',
              render: (company) => company.cnpj
            },
            {
              id: 'uf',
              titulo: 'UF',
              tipo: 'codigo',
              render: (company) => company.uf
            },
            {
              id: 'inscricao_estadual',
              titulo: 'Inscrição estadual',
              tipo: 'codigo',
              render: (company) => company.inscricao_estadual || '-'
            },
            {
              id: 'ambiente',
              titulo: 'Ambiente',
              tipo: 'texto',
              render: (company) => company.ambiente_sefaz
            },
            {
              id: 'status',
              titulo: 'Status',
              tipo: 'status',
              // R25: o StatusPill local pintava emerald/amber crus — sem par
              // no tema escuro e fora do piso de contraste do ThemeContext.
              // O StatusBadge resolve cor, ícone e contraste por token.
              render: (company) => (
                <StatusBadge status={company.ativo ? 'Ativa' : 'Inativa'} kind={company.ativo ? 'success' : 'neutral'} />
              )
            },
            {
              id: 'fiscal',
              titulo: 'Fiscal',
              tipo: 'status',
              render: (company) => (
                <StatusBadge
                  status={company.modulo_fiscal_habilitado ? 'Monitorando' : 'Desligado'}
                  kind={company.modulo_fiscal_habilitado ? 'success' : 'warning'}
                />
              )
            },
            {
              id: 'observacoes',
              titulo: 'Observações',
              tipo: 'texto',
              // T6: texto longo trunca com o conteúdo completo no tooltip.
              render: (company) => (
                <span title={company.observacoes || undefined}>{company.observacoes || '-'}</span>
              )
            }
          ]}
          itens={companies}
          carregando={loading}
          vazio="Nenhuma empresa fiscal cadastrada."
          storageKey="tabela:empresas-fiscais"
          rotuloRolagem="Empresas fiscais"
          larguraAcoes={110}
          colunasConfiguraveis
          // A1: a linha inteira é acionável por teclado (o TabelaPadrao dá
          // tabIndex + Enter/Espaço) e a ação também é um <button> focável.
          aoClicarLinha={editCompany}
          acoesLinha={(company) => (
            <button className="btn btn-outline btn-sm" type="button" onClick={() => editCompany(company)}>
              Editar
            </button>
          )}
        />
      </BlocoConteudo>

      {/*
        `id="certificados"`: o menu do módulo aponta para
        `/fiscal/empresas#certificados` (entrada "Certificados" do
        navigationConfig) — a âncora tem de continuar existindo, senão o
        item do menu leva ao topo da tela.
      */}
      <BlocoConteudo
        id="certificados"
        titulo="Certificado A1"
        descricao="Cadastro seguro de metadados. O arquivo e a senha não são exibidos depois de salvar."
      >
        <form onSubmit={submitCertificate}>
          <FormSecao legenda="Vínculo e armazenamento" colunas={2}>
            <CampoForm label="Empresa fiscal" obrigatorio span={2}>
              {/* Seletor de CONTEXTO/entrada de dado: define a QUAL empresa o
                  certificado pertence. Legítimo pela R12. */}
              <select
                className="input w-full"
                value={certificateForm.fiscal_company_id}
                onChange={(e) => updateCertificateField('fiscal_company_id', e.target.value)}
                required
              >
                <option value="">Selecione</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.razao_social} - {company.cnpj}</option>
                ))}
              </select>
            </CampoForm>

            <CampoForm label="Alias" obrigatorio>
              <input
                className="input w-full"
                value={certificateForm.certificate_alias}
                onChange={(e) => updateCertificateField('certificate_alias', e.target.value)}
                required
              />
            </CampoForm>

            <CampoForm label="Armazenamento">
              <select
                className="input w-full"
                value={certificateForm.storage_type}
                onChange={(e) => updateCertificateField('storage_type', e.target.value)}
              >
                <option value="local_secure_path">Caminho local seguro</option>
                <option value="s3_private">S3 privado</option>
                <option value="secrets_manager">Secrets Manager futuro</option>
              </select>
            </CampoForm>

            {certificateForm.storage_type === 'local_secure_path' ? (
              <CampoForm label="Caminho local na EC2" obrigatorio span={2}>
                <input
                  className="input w-full"
                  placeholder="/opt/fluxy/certs/fiscal/certificado.pfx"
                  value={certificateForm.certificate_path}
                  onChange={(e) => updateCertificateField('certificate_path', e.target.value)}
                  required
                />
              </CampoForm>
            ) : null}

            {certificateForm.storage_type === 's3_private' ? (
              <CampoForm label="Chave S3 privada" obrigatorio span={2}>
                <input
                  className="input w-full"
                  value={certificateForm.certificate_s3_key}
                  onChange={(e) => updateCertificateField('certificate_s3_key', e.target.value)}
                  required
                />
              </CampoForm>
            ) : null}

            <CampoForm label="Senha A1" hint="Gravada criptografada; nao retorna pela API.">
              <input
                className="input w-full"
                type="password"
                value={certificateForm.password}
                onChange={(e) => updateCertificateField('password', e.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <FormSecao legenda="Dados do certificado" colunas={2}>
            <CampoForm label="Valido desde">
              <DateInputBR
                className="input w-full"
                value={certificateForm.valid_from}
                onChange={(e) => updateCertificateField('valid_from', e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Valido até">
              <DateInputBR
                className="input w-full"
                value={certificateForm.valid_until}
                onChange={(e) => updateCertificateField('valid_until', e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Número de série">
              <input
                className="input w-full"
                value={certificateForm.serial_number}
                onChange={(e) => updateCertificateField('serial_number', e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Emissor">
              <input
                className="input w-full"
                value={certificateForm.issuer}
                onChange={(e) => updateCertificateField('issuer', e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Titular" span={2}>
              <input
                className="input w-full"
                value={certificateForm.subject}
                onChange={(e) => updateCertificateField('subject', e.target.value)}
              />
            </CampoForm>

            <div className="form-group">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={certificateForm.is_active}
                  onChange={(e) => updateCertificateField('is_active', e.target.checked)}
                />
                Definir como ativo
              </label>
            </div>
          </FormSecao>

          <div className="app-actionbar">
            <button className="btn btn-primary" type="submit" disabled={savingCertificate}>
              {savingCertificate ? 'Salvando...' : 'Cadastrar certificado'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      {certificateValidation ? (
        <BlocoConteudo
          variante="secundario"
          titulo={`Validação: ${certificateValidation.alias}`}
          descricao="Resultado da última validação administrativa deste certificado."
          acoes={(
            <button className="btn btn-outline btn-sm" type="button" onClick={() => setCertificateValidation(null)}>
              Fechar
            </button>
          )}
        >
          <TabelaPadrao
            semIdentidade
            colunas={[
              {
                id: 'check',
                titulo: 'Verificacao',
                tipo: 'texto',
                noCard: 'titulo',
                render: (check) => check.name
              },
              {
                id: 'status',
                titulo: 'Resultado',
                tipo: 'status',
                /*
                  O StatusPill antigo só tinha dois estados (verde para OK,
                  âmbar para todo o resto) e apagava a diferença entre
                  "pendência" e "erro" — que é justamente o que o próprio
                  handler distingue para decidir o tom do aviso.
                */
                render: (check) => (
                  <StatusBadge
                    status={check.status}
                    kind={check.status === 'OK' ? 'success' : check.status === 'ERROR' ? 'danger' : 'warning'}
                  />
                )
              },
              {
                id: 'mensagem',
                titulo: 'Mensagem',
                tipo: 'texto',
                render: (check) => (
                  <span title={check.message || undefined}>{check.message || '-'}</span>
                )
              }
            ]}
            itens={certificateValidation.checks}
            getId={(check) => check.name}
            storageKey="tabela:certificados-fiscais:validacao"
            rotuloRolagem="Checks da validacao"
            vazio="Nenhum check retornado."
          />
        </BlocoConteudo>
      ) : null}

      <BlocoConteudo
        titulo="Certificados cadastrados"
        descricao="Segredos criptografados não retornam pela API."
      >
        {/*
          R1/R17 — a lista era um <div> por certificado com seis campos
          soltos: sem coluna declarada, sem redimensionamento e sem largura
          salva por usuário. Nenhum dado saiu — alias, empresa, tipo de
          armazenamento, situação da validação, ativo/inativo e validade
          continuam, agora cada um com o papel declarado.
        */}
        <TabelaPadrao
          colunas={[
            {
              id: 'alias',
              titulo: 'Alias',
              tipo: 'identidade',
              noCard: 'titulo',
              render: (certificate) => (
                <CelulaDupla
                  principal={certificate.certificate_alias}
                  sub={certificate.company?.razao_social || 'Empresa nao vinculada'}
                />
              )
            },
            {
              id: 'armazenamento',
              titulo: 'Armazenamento',
              tipo: 'texto',
              render: (certificate) => ARMAZENAMENTO_LABEL[certificate.storage_type] || certificate.storage_type
            },
            {
              id: 'validacao',
              titulo: 'Validação',
              tipo: 'status',
              render: (certificate) => <StatusBadge status={certificate.validation_status || 'pending'} />
            },
            {
              id: 'ativo',
              titulo: 'Situação',
              tipo: 'status',
              render: (certificate) => (
                <StatusBadge
                  status={certificate.is_active ? 'Ativo' : 'Inativo'}
                  kind={certificate.is_active ? 'success' : 'neutral'}
                />
              )
            },
            {
              id: 'validade',
              titulo: 'Validade',
              tipo: 'data',
              render: (certificate) => formatDateOnly(certificate.valid_until)
            }
          ]}
          itens={certificates}
          carregando={loading}
          vazio="Nenhum certificado cadastrado."
          storageKey="tabela:certificados-fiscais"
          rotuloRolagem="Certificados fiscais"
          larguraAcoes={120}
          acoesLinha={(certificate) => (
            <button
              className="btn btn-outline btn-sm"
              type="button"
              onClick={() => validateCertificate(certificate)}
              disabled={validatingCertificateId === certificate.id}
            >
              {validatingCertificateId === certificate.id ? 'Validando...' : 'Validar'}
            </button>
          )}
        />
      </BlocoConteudo>
    </Pagina>
  );
}
