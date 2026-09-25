export const RH_DP_PERMISSION_GROUPS = [
  {
    key: 'rh_dp',
    label: 'RH/DP',
    permissions: [
      {
        key: 'rh_dp_dashboard_view',
        label: 'Ver dashboard RH/DP',
        description: 'Permite abrir a visao inicial do modulo.'
      },
      {
        key: 'rh_dp_colaboradores_view',
        label: 'Ver colaboradores',
        description: 'Permite listar e detalhar colaboradores.'
      },
      {
        key: 'rh_dp_colaboradores_edit',
        label: 'Editar colaboradores',
        description: 'Permite cadastrar, editar e importar colaboradores.'
      },
      {
        key: 'rh_dp_documentos_view',
        label: 'Ver documentos',
        description: 'Permite consultar documentos, pendencias e links assinados.'
      },
      {
        key: 'rh_dp_documentos_manage',
        label: 'Gerir documentos',
        description: 'Permite enviar, substituir e atualizar documentos.'
      },
      {
        key: 'rh_dp_importacoes_execute',
        label: 'Executar importações',
        description: 'Permite subir planilhas, gerar preview e confirmar lotes.'
      },
      {
        key: 'rh_dp_apuracao_view',
        label: 'Ver apurações',
        description: 'Permite listar e detalhar apuracoes.'
      },
      {
        key: 'rh_dp_apuracao_edit',
        label: 'Ajustar apurações',
        description: 'Permite gerar apuracao, ajustar itens e concluir conferencia.'
      },
      {
        key: 'rh_dp_fechamento_execute',
        label: 'Fechar competência',
        description: 'Permite fechar a competencia e gerar titulos no financeiro.'
      },
      {
        key: 'rh_dp_ticket_generate',
        label: 'Gerar lote de ticket',
        description: 'Permite selecionar colaboradores e gerar o pagamento rateado do beneficio.'
      },
      {
        key: 'rh_dp_obrigacoes_view',
        label: 'Ver obrigações geradas',
        description: 'Permite acessar fechamentos e titulos gerados no financeiro.'
      }
    ]
  }
];

export const RH_DP_PERMISSION_KEYS = RH_DP_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.key)
);

export function normalizeRhDpPermission(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function normalizeRhDpPermissionList(list = []) {
  const allowed = new Set(RH_DP_PERMISSION_KEYS.map(normalizeRhDpPermission));
  return [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map(normalizeRhDpPermission)
        .filter((item) => allowed.has(item))
    )
  ];
}
