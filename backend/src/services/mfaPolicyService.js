function normalizeProfile(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const MFA_REQUIRED_PROFILES = new Set(['SUPERADMIN', 'ADMINISTRADOR', 'ADMIN']);

// Permite desligar a exigencia de MFA em ambientes locais/offline, onde o fluxo
// de TOTP so atrapalha o desenvolvimento. O padrao continua sendo EXIGIR: a
// politica so cai com MFA_POLICY_ENABLED=false explicito no .env.
function isMfaPolicyEnabled() {
  return String(process.env.MFA_POLICY_ENABLED ?? 'true').trim().toLowerCase() !== 'false';
}

function isMfaRequiredProfile(profileOrUser) {
  if (!isMfaPolicyEnabled()) {
    return false;
  }

  const profile = typeof profileOrUser === 'string'
    ? profileOrUser
    : profileOrUser?.perfil;

  return MFA_REQUIRED_PROFILES.has(normalizeProfile(profile));
}

module.exports = {
  isMfaRequiredProfile,
  isMfaPolicyEnabled,
  normalizeProfile
};
