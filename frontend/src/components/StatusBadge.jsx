import { useTheme } from '../contexts/ThemeContext';

export default function StatusBadge({ status, setor }) {
  const { tema } = useTheme();
  const statusKey = String(status || '').toUpperCase();
  const setorKey = String(setor || '').toUpperCase();
  const corSetor =
    tema?.status?.setores?.[setorKey]?.[statusKey] || null;
  const corGlobal =
    tema?.status?.global?.[statusKey] || null;
  const cor = corSetor || corGlobal || '#9ca3af';
  return (
    <span
      className="text-white px-2 py-1 rounded text-xs"
      style={{ backgroundColor: cor }}
    >
      {status}
    </span>
  );
}
