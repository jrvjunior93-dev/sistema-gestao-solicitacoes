import { Link } from 'react-router-dom';

export default function Configuracoes() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Configuracoes</h1>

      <section className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-lg font-semibold mb-3">Cadastros</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ConfigItem
            title="Obras"
            description="Cadastro e manutencao de obras."
            to="/obras"
          />
          <ConfigItem
            title="Setores"
            description="Cadastro e manutencao de setores."
            to="/setores"
          />
          <ConfigItem
            title="Cargos"
            description="Cadastro e manutencao de cargos."
            to="/cargos"
          />
          <ConfigItem
            title="Tipos (Macro)"
            description="Cadastro dos tipos macro."
            to="/tipos-solicitacao"
          />
          <ConfigItem
            title="Subtipos de Contrato"
            description="Cadastro de subtipos."
            to="/tipos-sub-contrato"
          />
          <ConfigItem
            title="Contratos"
            description="Cadastro e manutencao de contratos."
            to="/gestao-contratos"
          />
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-lg font-semibold mb-3">Usuarios</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ConfigItem
            title="Cadastro de Usuarios"
            description="Cadastrar e gerenciar usuarios."
            to="/usuarios"
          />
        </div>
      </section>

      <section className="bg-white p-6 rounded-xl shadow">
        <h2 className="text-lg font-semibold mb-3">Status e Vinculacoes</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ConfigItem
            title="Status por Setor"
            description="Cadastro de status permitidos por setor."
            to="/status-setor"
          />
          <ConfigItem
            title="Permissoes por Setor"
            description="Defina se usuarios podem assumir/atribuir."
            to="/permissoes-setor"
          />
          <ConfigItem
            title="Cores do Sistema"
            description="Defina cores de botoes e status."
            to="/cores-sistema"
          />
          <ConfigItem
            title="Areas visiveis para OBRA"
            description="Controle as areas visiveis na nova solicitacao."
            to="/areas-obra"
          />
          <ConfigItem
            title="Areas por Setor de Origem"
            description="Defina quais setores cada setor pode selecionar na nova solicitacao."
            to="/areas-por-setor-origem"
          />
          <ConfigItem
            title="Setores visiveis por Usuario"
            description="Defina setores extras que cada usuario pode visualizar quando atribuido."
            to="/setores-visiveis-usuario"
          />
          <ConfigItem
            title="Recebimento por Setor"
            description="Defina se as solicitacoes chegam primeiro ao admin ou se ficam visiveis para todos."
            to="/comportamento-recebimento-setor"
          />
          <ConfigItem
            title="Tipos por Setor (Recebimento)"
            description="Defina quais tipos cada setor pode usar e se cada tipo cai no admin primeiro ou para todos."
            to="/tipos-solicitacao-por-setor"
          />
          <ConfigItem
            title="Tempo de Inatividade"
            description="Define o tempo para logout automatico por inatividade."
            to="/timeout-inatividade"
          />
        </div>
      </section>
    </div>
  );
}

function ConfigItem({ title, description, to, disabled }) {
  if (disabled) {
    return (
      <div className="border rounded p-3 text-gray-400">
        <div className="font-medium">{title}</div>
        <div className="text-sm">{description}</div>
      </div>
    );
  }

  return (
    <Link to={to} className="border rounded p-3 hover:bg-gray-50">
      <div className="font-medium">{title}</div>
      <div className="text-sm text-gray-600">{description}</div>
    </Link>
  );
}
