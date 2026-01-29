export default function StatsCard({ title, value }) {
  return (
    <div style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8 }}>
      <h3>{title}</h3>
      <strong>{value}</strong>
    </div>
  );
}
