const RH_DP_PERMISSION_GROUPS = [
  {
    key: 'rh_dp',
    label: 'RH/DP',
    permissions: [
      'rh_dp_dashboard_view',
      'rh_dp_colaboradores_view',
      'rh_dp_colaboradores_edit',
      'rh_dp_documentos_view',
      'rh_dp_documentos_manage',
      'rh_dp_importacoes_execute',
      'rh_dp_apuracao_view',
      'rh_dp_apuracao_edit',
      'rh_dp_fechamento_execute',
      'rh_dp_fechamento_reopen',
      'rh_dp_ticket_generate',
      'rh_dp_obrigacoes_view'
    ]
  }
];

const RH_DP_PERMISSION_SET = new Set(
  RH_DP_PERMISSION_GROUPS.flatMap((group) => group.permissions)
);

function normalizePermission(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isKnownRhDpPermission(value) {
  return RH_DP_PERMISSION_SET.has(normalizePermission(value));
}

function normalizeRhDpPermissionList(list = []) {
  return [
    ...new Set(
      (Array.isArray(list) ? list : [])
        .map(normalizePermission)
        .filter((item) => RH_DP_PERMISSION_SET.has(item))
    )
  ];
}

module.exports = {
  RH_DP_PERMISSION_GROUPS,
  RH_DP_PERMISSION_SET,
  isKnownRhDpPermission,
  normalizePermission,
  normalizeRhDpPermissionList
};
