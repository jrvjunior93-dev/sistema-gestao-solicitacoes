export default function StatusArea({ solicitacao }) {
  return (
    <div
      style={{
        padding: 16,
        background: '#f5f5f5',
        borderRadius: 6,
        marginBottom: 24
      }}
    >
      <strong>Status:</strong> {solicitacao.status}<br />
      <strong>Área responsável:</strong> {solicitacao.area}
    </div>
  );
}
