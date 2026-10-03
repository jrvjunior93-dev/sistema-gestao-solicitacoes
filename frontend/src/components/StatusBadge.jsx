import { useTheme } from '../contexts/ThemeContext';
import {
  HiOutlineExclamationTriangle,
  HiOutlineClock,
  HiOutlineCheckCircle,
  HiOutlineInformationCircle,
  HiOutlineMinusCircle
} from 'react-icons/hi2';

// =====================================================================
// ETIQUETA DE STATUS — formato único em todo o sistema.
// Pílula com fundo suave da família semântica, texto na cor semântica
// escura e ÍCONE junto (cor sozinha não comunica para daltônicos).
//   danger  = erro, falha, bloqueio, vencido, rejeitado, cancelamento
//   warning = atenção, pendência, aguardando ação, prazo próximo
//   success = sucesso, aprovado, pago, concluído
//   info    = informação, em andamento
//   neutral = inativo, cancelado, arquivado
// Cores customizadas por setor (Configurações → Cores do Sistema)
// continuam sendo respeitadas: entram no mesmo formato suave.
// =====================================================================

const FAMILIA_ICONE = {
  danger: HiOutlineExclamationTriangle,
  warning: HiOutlineClock,
  success: HiOutlineCheckCircle,
  info: HiOutlineInformationCircle,
  neutral: HiOutlineMinusCircle
};

function normalizarChaveStatus(valor) {
  return String(valor || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

// Classifica um texto de status em uma família semântica.
export function familiaSemanticaDoStatus(status) {
  const s = normalizarChaveStatus(status);
  if (!s) return 'neutral';
  if (/(VENCID|REJEITAD|RECUSAD|REPROVAD|NEGAD|ERRO|FALHA|BLOQUEAD|ESTORNAD|ESTOURAD|INADIMPLEN|ATRASAD)/.test(s)) return 'danger';
  if (/(CANCELAD|ARQUIVAD|INATIV|OCULT|EXCLUID|ENCERRAD|SUSPENS)/.test(s)) return 'neutral';
  if (/(PENDENT|AGUARDAND|AJUSTE|PARCIAL|PREVISA|PROVISORI|A_VENCER|EM_ABERTO|ABERTO|DEVOLVID|RETORNAD)/.test(s)) return 'warning';
  if (/(APROVAD|PAG[AO]|QUITAD|CONCLUID|FINALIZAD|AUTORIZAD|CONFIRMAD|BAIXAD|ATIV[AO]|LIBERAD|ASSINAD|VIGENTE)/.test(s)) return 'success';
  return 'info';
}

function buscarCorPorStatus(mapa = {}, status) {
  if (!mapa || typeof mapa !== 'object') return null;

  const originalUpper = String(status || '').trim().toUpperCase();
  const normalizado = normalizarChaveStatus(status);
  const variantes = new Set([
    originalUpper,
    normalizado,
    normalizado.replace(/_/g, ' '),
    normalizado.replace(/_/g, ''),
    originalUpper.replace(/\s+/g, '_')
  ]);

  for (const chave of variantes) {
    if (mapa[chave]) return mapa[chave];
  }

  for (const [chave, cor] of Object.entries(mapa)) {
    if (normalizarChaveStatus(chave) === normalizado) {
      return cor;
    }
  }

  return null;
}

export default function StatusBadge({ status, setor, kind }) {
  const { tema } = useTheme();
  const setorKey = String(setor || '').trim().toUpperCase();

  // Cor explicitamente configurada pelo administrador para o setor
  // tem precedência (funcionalidade Cores do Sistema).
  const mapaSetor = tema?.status?.setores?.[setorKey] || null;
  const corSetor = buscarCorPorStatus(mapaSetor, status);

  const familia = kind || familiaSemanticaDoStatus(status);
  const Icone = FAMILIA_ICONE[familia] || HiOutlineInformationCircle;

  if (corSetor) {
    return (
      <span
        className="fx-badge"
        style={{
          backgroundColor: `${corSetor}16`,
          border: `1px solid ${corSetor}3d`,
          color: corSetor
        }}
      >
        <Icone aria-hidden="true" />
        {status}
      </span>
    );
  }

  return (
    <span className={`fx-badge fx-badge--${familia}`}>
      <Icone aria-hidden="true" />
      {status}
    </span>
  );
}
