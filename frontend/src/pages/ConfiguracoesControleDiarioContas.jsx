import { useEffect, useMemo, useState } from 'react';
import { getUsuarios } from '../services/usuarios';
import {
  getControleDiarioContasConfig,
  salvarControleDiarioContasConfig
} from '../services/configuracoesSistema';
import {
  Avisos,
  BlocoConteudo,
  CelulaDupla,
  PageHeader,
  Pagina,
  StatGrid,
  StatTile,
  TabelaPadrao,
  useAvisos
} from '../components/padrao';

const CONFIG_INICIAL = {
  bloqueio_ativo: false,
  responsaveis_usuario_ids: [],
  aprovadores_usuario_ids: []
};

function toggle(lista, id) {
  const ids = new Set((Array.isArray(lista) ? lista : []).map(Number));
  if (ids.has(Number(id))) ids.delete(Number(id));
  else ids.add(Number(id));
  return [...ids];
}

export default function ConfiguracoesControleDiarioContas() {
  const [config, setConfig] = useState(CONFIG_INICIAL);
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const { avisos, avisar, fechar } = useAvisos();

  useEffect(() => {
    let ativo = true;
    Promise.all([getControleDiarioContasConfig(), getUsuarios()])
      .then(([cfg, lista]) => {
        if (!ativo) return;
        setConfig({ ...CONFIG_INICIAL, ...(cfg || {}) });
        setUsuarios((Array.isArray(lista) ? lista : [])
          .filter((usuario) => usuario?.ativo !== false)
          .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR')));
      })
      .catch((error) => avisar.erro(error?.message || 'Erro ao carregar a configuracao.'))
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const responsaveis = useMemo(
    () => new Set((config.responsaveis_usuario_ids || []).map(Number)),
    [config.responsaveis_usuario_ids]
  );
  const aprovadores = useMemo(
    () => new Set((config.aprovadores_usuario_ids || []).map(Number)),
    [config.aprovadores_usuario_ids]
  );

  async function salvar() {
    try {
      setSalvando(true);
      const resultado = await salvarControleDiarioContasConfig(config);
      setConfig({ ...CONFIG_INICIAL, ...resultado });
      avisar.sucesso('Controle diario de contas configurado com sucesso.');
    } catch (error) {
      avisar.erro(error?.message || 'Erro ao salvar a configuracao.');
    } finally {
      setSalvando(false);
    }
  }

  const colunas = [
    {
      id: 'usuario',
      titulo: 'Usuario',
      tipo: 'identidade',
      sempreVisivel: true,
      noCard: 'titulo',
      render: (usuario) => <CelulaDupla principal={usuario.nome} sub={usuario.email || 'Sem e-mail'} />
    },
    {
      id: 'setor',
      titulo: 'Setor',
      tipo: 'texto',
      render: (usuario) => usuario?.setor?.nome || '-'
    },
    {
      id: 'responsavel',
      titulo: 'Opera e fica sujeito ao bloqueio',
      tipo: 'status',
      render: (usuario) => (
        <input
          type="checkbox"
          checked={responsaveis.has(Number(usuario.id))}
          onChange={() => setConfig((atual) => ({
            ...atual,
            responsaveis_usuario_ids: toggle(atual.responsaveis_usuario_ids, usuario.id)
          }))}
          aria-label={`Definir ${usuario.nome} como responsavel pelo controle diario`}
        />
      )
    },
    {
      id: 'aprovador',
      titulo: 'Aprova divergencias',
      tipo: 'status',
      render: (usuario) => (
        <input
          type="checkbox"
          checked={aprovadores.has(Number(usuario.id))}
          onChange={() => setConfig((atual) => ({
            ...atual,
            aprovadores_usuario_ids: toggle(atual.aprovadores_usuario_ids, usuario.id)
          }))}
          aria-label={`Definir ${usuario.nome} como aprovador de divergencias`}
        />
      )
    }
  ];

  return (
    <Pagina>
      <PageHeader
        titulo="Controle diario de contas e caixa"
        descricao="Defina quem confere as contas diariamente e se a pendencia deve bloquear novas acoes financeiras desses responsaveis."
        acaoPrincipal={{
          rotulo: salvando ? 'Salvando...' : 'Salvar configuracao',
          onClick: salvar,
          desabilitada: carregando || salvando
        }}
      />

      <Avisos avisos={avisos} aoFechar={fechar} />

      <BlocoConteudo
        titulo="Regra de bloqueio"
        descricao="A flag nasce desligada. Consultas e a tela de conciliacao permanecem acessiveis mesmo quando o bloqueio estiver ativo."
        variante="primario"
        cor="var(--module-financeiro)"
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)] lg:items-start">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--c-border)] bg-[var(--ui-surface-soft)] p-4">
            <input
              type="checkbox"
              className="mt-1"
              checked={config.bloqueio_ativo === true}
              onChange={(event) => setConfig((atual) => ({ ...atual, bloqueio_ativo: event.target.checked }))}
            />
            <span>
              <strong className="block text-[var(--c-text)]">Bloquear acoes financeiras enquanto houver contas pendentes</strong>
              <span className="mt-1 block text-sm text-[var(--c-muted)]">
                A regra vale somente para os usuarios marcados como responsaveis. O superadmin continua com acesso administrativo.
              </span>
            </span>
          </label>

          <StatGrid colunas={2}>
            <StatTile label="Responsaveis" valor={responsaveis.size} sub="operam a rotina diaria" />
            <StatTile label="Aprovadores" valor={aprovadores.size} sub="decidem divergencias" />
          </StatGrid>
        </div>
      </BlocoConteudo>

      <BlocoConteudo
        titulo="Usuarios da rotina"
        descricao="O fechamento com diferenca exige decisao de outro usuario: quem informou a divergencia nao pode decidir a propria solicitacao."
        contagem={`${usuarios.length} usuario(s) ativo(s)`}
      >
        <TabelaPadrao
          colunas={colunas}
          itens={usuarios}
          storageKey="tabela:configuracoes-controle-diario-contas"
          vazio="Nenhum usuario ativo encontrado."
        />
      </BlocoConteudo>
    </Pagina>
  );
}
