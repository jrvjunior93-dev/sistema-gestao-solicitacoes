import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  Pagina,
  PageHeader,
  BlocoConteudo,
  CamposComVazios,
  FormSecao,
  CampoForm,
  Avisos,
  useAvisos,
  useConfirmacao
} from '../components/padrao';
import StatusBadge from '../components/StatusBadge';
import {
  disableMfaRequest,
  enableMfaRequest,
  startMfaSetupRequest
} from '../services/auth';
import { alterarSenhaAtual } from '../services/usuarios';
import { definirTelaInicial, getTelaInicial, limparTelaInicial } from '../services/telaInicial';
import Alert from '../components/ui/Alert';

// =====================================================================
// MEU PERFIL — a tela do próprio usuário
// ---------------------------------------------------------------------
// R25 — a tela tinha CINCO cores cruas, todas em elementos de segurança:
// a pílula do perfil (`bg-sky-100 text-sky-700`) e o selo local de MFA
// (`bg-emerald-50 text-emerald-700 border-emerald-200` /
// `bg-amber-50 text-amber-700 border-amber-200`), mais o `bg-white/70` do
// quadro do QR Code. Paleta crua não tem par no tema escuro e não passa
// pelo piso de contraste do ThemeContext (R24) — e o pior lugar para um
// texto no limite da legibilidade é justamente o aviso de que a conta
// está ou não protegida. O selo local virou o StatusBadge do sistema.
//
// B3 — o mesmo dado aparecia DUAS vezes com o MESMO papel: os três
// cartões do topo (Conta / Setor / Segurança) mostravam nome, e-mail e
// setor, e logo abaixo os mesmos nome, e-mail, perfil e setor apareciam
// como <input readOnly>. Nenhum dos dois era campo editável — eram os
// dois referência. Pelo teste da B3 ("apagar a segunda aparição piora
// algum trabalho?"), não piora: viraram UM bloco de identificação, com o
// alternador de vazios (B4). Nenhum dado saiu da tela.
// =====================================================================

export default function Perfil() {
  const { user, updateUser, login } = useAuth();

  const [senhaAtual, setSenhaAtual] = useState('');
  const [senhaNova, setSenhaNova] = useState('');
  const [confirmacao, setConfirmacao] = useState('');
  const [loading, setLoading] = useState(false);

  const [mfaSetup, setMfaSetup] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const mfaEnabled = Boolean(user?.mfa_totp_enabled);
  const mfaRequiredByPolicy = Boolean(user?.mfa_required_by_policy);
  const mfaSetupPending = Boolean(user?.mfa_setup_pending);

  // ----- Tela inicial (onde o login entra) -----
  const [telasDisponiveis, setTelasDisponiveis] = useState([]);
  const [telaInicialEscolhida, setTelaInicialEscolhida] = useState('');
  const [telaInicialSalvando, setTelaInicialSalvando] = useState(false);

  /*
    R16 — UM dono para os avisos da tela.

    Eram SEIS pares de estado de mensagem (`mensagem`/`erro`,
    `mfaMensagem`/`mfaErro`, `telaInicialMensagem`/`telaInicialErro`) com
    seis <Alert> espalhados pelos blocos. Todos descrevem EVENTO — salvou,
    falhou —, que é exatamente o que o `useAvisos` existe para mostrar, na
    faixa única abaixo do cabeçalho.

    O que NÃO veio para cá, de propósito: os dois avisos de POLÍTICA de
    MFA (perfil com configuração pendente / perfil obrigado a manter MFA).
    Eles não são evento: são CONDIÇÃO derivada do estado da conta. Fechar
    não resolve, e voltariam a cada carga — a fronteira que o próprio
    `useAvisos` declara. Continuam como faixa fixa no bloco de MFA, ao
    lado do que descrevem.
  */
  const { avisos, avisar, fechar } = useAvisos();
  const { confirmar, elementoConfirmacao } = useConfirmacao();

  useEffect(() => {
    let ativo = true;
    getTelaInicial()
      .then((data) => {
        if (!ativo) return;
        setTelasDisponiveis(Array.isArray(data?.telas) ? data.telas : []);
        setTelaInicialEscolhida(data?.tela_inicial?.id || '');
      })
      .catch(() => {
        // sem catálogo (falha de rede): a seção fica só com a Home
        if (ativo) setTelasDisponiveis([]);
      });
    return () => { ativo = false; };
  }, []);

  const telasPorModulo = useMemo(() => {
    const grupos = new Map();
    for (const tela of telasDisponiveis) {
      const chave = tela.moduleLabel || 'Outros';
      if (!grupos.has(chave)) grupos.set(chave, []);
      grupos.get(chave).push(tela);
    }
    return Array.from(grupos.entries());
  }, [telasDisponiveis]);

  async function salvarTelaInicialPerfil() {
    // R26: a escolha é fixada antes de sair para a rede — o select segue
    // clicável enquanto a gravação corre.
    const escolhida = telaInicialEscolhida;
    try {
      setTelaInicialSalvando(true);
      if (!escolhida) {
        await limparTelaInicial();
        updateUser({ tela_inicial: null });
        avisar.sucesso('Você voltará a entrar na Home.');
      } else {
        const data = await definirTelaInicial(escolhida);
        updateUser({ tela_inicial: data?.tela_inicial || null });
        avisar.sucesso(`Você passará a entrar em "${data?.tela_inicial?.label}".`);
      }
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao salvar tela inicial');
    } finally {
      setTelaInicialSalvando(false);
    }
  }

  async function salvarSenha() {
    if (!senhaAtual || !senhaNova) {
      avisar.alerta('Preencha a senha atual e a nova senha.');
      return;
    }

    if (senhaNova !== confirmacao) {
      avisar.alerta('A confirmação da nova senha não confere.');
      return;
    }

    /*
      R21 + R26 — trocar a senha é a ação mais sensível desta tela: ela
      invalida o que a pessoa usa para entrar. Ganhou confirmação do
      sistema, e as duas armadilhas conhecidas estão fechadas aqui:

      - R21: `confirmar()` devolve `{ ok, texto }` e OBJETO É SEMPRE
        TRUTHY. `const ok = await confirmar(...)` faria o botão "Cancelar"
        TROCAR A SENHA. Por isso o retorno é desestruturado.
      - R26: os três campos são fixados em `const` ANTES do `await`. O
        modal do sistema NÃO congela a página — os inputs seguem
        editáveis atrás dele —, então ler `senhaNova` depois da
        confirmação gravaria uma senha diferente da que a pessoa
        autorizou. É a classe CONSENTIMENTO da DoD.
    */
    const atual = senhaAtual;
    const nova = senhaNova;

    const { ok } = await confirmar({
      titulo: 'Alterar senha',
      mensagem: 'Trocar a senha desta conta agora? Você passará a entrar com a nova senha; a atual deixa de valer.',
      rotuloConfirmar: 'Alterar senha'
    });
    if (!ok) return;

    try {
      setLoading(true);
      await alterarSenhaAtual({
        senha_atual: atual,
        senha_nova: nova
      });

      setSenhaAtual('');
      setSenhaNova('');
      setConfirmacao('');
      avisar.sucesso('Senha atualizada com sucesso.');
    } catch (e) {
      avisar.erro(e?.message || 'Erro ao alterar senha.');
    } finally {
      setLoading(false);
    }
  }

  async function iniciarMfa() {
    setMfaCode('');

    try {
      setMfaLoading(true);
      const data = await startMfaSetupRequest();
      setMfaSetup(data);
    } catch (e) {
      avisar.erro(e?.message || 'Nao foi possivel iniciar a configuracao do MFA.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function habilitarMfa() {
    if (!mfaSetup) {
      avisar.alerta('Inicie a configuração antes de validar o código.');
      return;
    }

    if (!String(mfaCode || '').trim()) {
      avisar.alerta('Informe o código do aplicativo autenticador.');
      return;
    }

    // R26: o código é fixado antes do await — o campo segue editável.
    const codigo = mfaCode;
    try {
      setMfaLoading(true);
      const nextSession = await enableMfaRequest(codigo);
      await login(nextSession);
      setMfaSetup(null);
      setMfaCode('');
      avisar.sucesso('Autenticacao em duas etapas habilitada com sucesso.');
    } catch (e) {
      avisar.erro(e?.message || 'Nao foi possivel habilitar o MFA.');
    } finally {
      setMfaLoading(false);
    }
  }

  async function desabilitarMfa() {
    if (!String(mfaCode || '').trim()) {
      avisar.alerta('Informe o código atual do autenticador para desabilitar o MFA.');
      return;
    }

    // R26: o código é fixado antes do await.
    const codigo = mfaCode;
    try {
      setMfaLoading(true);
      await disableMfaRequest(codigo);
      updateUser({ mfa_totp_enabled: false });
      setMfaSetup(null);
      setMfaCode('');
      avisar.sucesso('Autenticacao em duas etapas desabilitada com sucesso.');
    } catch (e) {
      avisar.erro(e?.message || 'Nao foi possivel desabilitar o MFA.');
    } finally {
      setMfaLoading(false);
    }
  }

  function cancelarMfa() {
    setMfaSetup(null);
    setMfaCode('');
  }

  const setorLabel = user?.setor?.nome || user?.setor?.codigo || user?.setor_id || '';

  /*
    B4 — campo vazio some, com contador. Os quatro <input readOnly> e os
    três cartões do topo viraram esta lista única: a contagem de vazios
    sai dela, não de condições espelhadas à mão.
  */
  const camposIdentificacao = [
    { label: 'Nome', valor: user?.nome || '' },
    { label: 'E-mail cadastrado', valor: user?.email || '' },
    { label: 'Perfil', valor: user?.perfil || '' },
    { label: 'Setor', valor: setorLabel, sub: 'Escopo operacional atual' },
    {
      label: 'Autenticacao em duas etapas',
      // R25: o selo local pintado com emerald/amber virou o StatusBadge do
      // sistema, que resolve cor, ícone e contraste por token.
      valor: <StatusBadge status={mfaEnabled ? 'ATIVO' : 'PENDENTE'} kind={mfaEnabled ? 'success' : 'warning'} />,
      sub: mfaRequiredByPolicy ? 'Obrigatorio pela politica atual' : 'Protecao complementar da conta'
    },
    {
      label: 'Tela inicial',
      valor: user?.tela_inicial?.label || '',
      sub: 'Onde o login entra'
    }
  ];

  return (
    <Pagina>
      {/* C4/R13: o cabeçalho identifica o REGISTRO — aqui, a própria
          pessoa. O `page-title` + `page-subtitle` soltos e a barra de
          pílulas à direita saíram; o perfil e o estado do MFA passaram a
          ser campos do bloco de identificação, sem perder nenhum dado. */}
      <PageHeader
        titulo="Meu perfil"
        contagem={user?.nome || null}
        descricao="Confira seus dados, altere sua senha e mantenha sua conta protegida."
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Identificação e acesso"
        variante="primario"
        cor="var(--c-primary)"
        descricao="Dados da sua conta. Nome, e-mail, perfil e setor são mantidos pela administração do sistema."
      >
        <CamposComVazios campos={camposIdentificacao} colunas={3} />
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Tela inicial"
        descricao="Em qual tela você quer entrar ao abrir o sistema. Também da para marcar direto na tela, pela casinha ao lado da estrela de atalho. Vale em qualquer navegador e no celular."
      >
        <FormSecao legenda="Onde o login entra" colunas={2}>
          <CampoForm
            label="Entrar em"
            span={2}
            hint="Se voce perder o acesso a tela escolhida, o sistema volta a abrir na Home automaticamente."
          >
            {/* R12: seletor de CONTEXTO/entrada de dado (qual tela fica
                gravada no perfil) — não é filtro de lista, então o select
                segue legítimo pela própria regra. */}
            <select
              className="input w-full"
              value={telaInicialEscolhida}
              onChange={(e) => setTelaInicialEscolhida(e.target.value)}
              disabled={telaInicialSalvando}
            >
              <option value="">Home (padrão)</option>
              {telasPorModulo.map(([moduloLabel, telas]) => (
                <optgroup key={moduloLabel} label={moduloLabel}>
                  {telas.map((tela) => (
                    <option key={tela.id} value={tela.id}>{tela.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </CampoForm>
        </FormSecao>

        <div className="app-actionbar">
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvarTelaInicialPerfil}
            disabled={telaInicialSalvando || (telaInicialEscolhida === (user?.tela_inicial?.id || ''))}
          >
            {telaInicialSalvando ? 'Salvando…' : 'Salvar tela inicial'}
          </button>
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Alteração de senha"
        descricao="Use uma senha forte e diferente das credenciais antigas."
      >
        <form onSubmit={(event) => { event.preventDefault(); salvarSenha(); }}>
          <FormSecao legenda="Trocar senha" colunas={3}>
            <CampoForm label="Senha atual" obrigatorio>
              <input
                type="password"
                autoComplete="current-password"
                className="input w-full"
                value={senhaAtual}
                onChange={(e) => setSenhaAtual(e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Nova senha" obrigatorio>
              <input
                type="password"
                autoComplete="new-password"
                className="input w-full"
                value={senhaNova}
                onChange={(e) => setSenhaNova(e.target.value)}
              />
            </CampoForm>

            <CampoForm label="Confirmar nova senha" obrigatorio>
              <input
                type="password"
                autoComplete="new-password"
                className="input w-full"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
              />
            </CampoForm>
          </FormSecao>

          <div className="app-actionbar">
            <button type="submit" disabled={loading} className="btn btn-primary">
              {loading ? 'Salvando...' : 'Alterar senha'}
            </button>
          </div>
        </form>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Autenticacao em duas etapas"
        descricao="Proteja o acesso com código TOTP no autenticador do celular."
      >
        {/* CONDIÇÃO, não evento: estas duas faixas descrevem o estado da
            conta (política de segurança do perfil). Fechá-las não muda
            nada e elas voltariam a cada carga — por isso ficam aqui, ao
            lado do que descrevem, e não no `useAvisos`. */}
        {mfaSetupPending ? (
          <Alert
            type="warning"
            message="Este perfil exige autenticacao em duas etapas. Conclua a configuracao do MFA para liberar o uso normal do sistema."
          />
        ) : null}

        {mfaRequiredByPolicy && !mfaSetupPending ? (
          <Alert
            type="info"
            message="Este perfil esta enquadrado na politica de seguranca do produto e deve manter MFA ativo continuamente."
          />
        ) : null}

        {!mfaEnabled && !mfaSetup ? (
          <div className="app-actionbar">
            <button
              type="button"
              onClick={iniciarMfa}
              disabled={mfaLoading}
              className="btn btn-primary"
            >
              {mfaLoading ? 'Preparando...' : 'Iniciar configuracao do MFA'}
            </button>
          </div>
        ) : null}

        {!mfaEnabled && mfaSetup ? (
          <FormSecao legenda="Configurar o autenticador" colunas={2}>
            <CampoForm label="QR Code" span={2}>
              {/* R10: a moldura tinha `bg-white/70` e a imagem
                  `max-w-[180px]` — cor fora do token e medida em px. A
                  largura agora vem de uma classe nomeada (sem número de
                  px) e o fundo, do token de superfície. */}
              <div className="rounded-2xl border border-[var(--c-border)] bg-[var(--ui-surface-2)] p-4">
                <img
                  src={mfaSetup.qr_code_data_url}
                  alt="QR Code para configurar autenticador"
                  className="mx-auto block h-auto w-full max-w-xs"
                />
              </div>
            </CampoForm>

            <CampoForm
              label="Chave manual"
              span={2}
              hint="Use esta chave se o aplicativo nao conseguir ler o QR Code. Ela vale uma vez, para este cadastro."
            >
              {/* Campo de SEGREDO: continua somente leitura, como estava, e
                  o valor não é copiado para log, mensagem, título ou
                  qualquer outro lugar da tela. */}
              <input
                type="text"
                className="input font-mono w-full"
                value={mfaSetup.secret || ''}
                readOnly
              />
            </CampoForm>

            <CampoForm label="Código do autenticador" obrigatorio>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input w-full"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
              />
            </CampoForm>

            <CampoForm label="Como ativar" linha>
              <p className="text-sm text-[var(--c-muted)]">
                Abra o aplicativo autenticador, escaneie o QR Code e informe o código de 6 dígitos para ativar o MFA.
              </p>
            </CampoForm>

            <div className="form-campo--linha">
              <div className="app-actionbar">
                <button
                  type="button"
                  onClick={habilitarMfa}
                  disabled={mfaLoading}
                  className="btn btn-primary"
                >
                  {mfaLoading ? 'Validando...' : 'Ativar MFA'}
                </button>
                <button
                  type="button"
                  onClick={cancelarMfa}
                  disabled={mfaLoading}
                  className="btn btn-outline"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </FormSecao>
        ) : null}

        {mfaEnabled ? (
          <FormSecao legenda="MFA ativo" colunas={2}>
            <CampoForm label="Sobre este MFA" linha>
              <p className="text-sm text-[var(--c-muted)]">
                {mfaRequiredByPolicy
                  ? 'Este perfil exige MFA obrigatorio. Se houver troca de dispositivo, trate o reset com suporte administrativo interno.'
                  : 'Para desabilitar o MFA, confirme com um codigo valido do seu aplicativo autenticador.'}
              </p>
            </CampoForm>

            <CampoForm label="Código atual do autenticador">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input w-full"
                placeholder="000000"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
              />
            </CampoForm>

            {!mfaRequiredByPolicy ? (
              <div className="form-campo--linha">
                <div className="app-actionbar app-actionbar-apartada">
                  {/* C5/R25: ação que reduz a proteção da conta é
                      destrutiva e vem em vermelho suave e apartada — era
                      um `btn-secondary` indistinguível de "Cancelar". */}
                  <button
                    type="button"
                    onClick={desabilitarMfa}
                    disabled={mfaLoading}
                    className="btn btn-outline btn-perigo-suave"
                  >
                    {mfaLoading ? 'Processando...' : 'Desabilitar MFA'}
                  </button>
                </div>
              </div>
            ) : null}
          </FormSecao>
        ) : null}
      </BlocoConteudo>

      {elementoConfirmacao}
    </Pagina>
  );
}
