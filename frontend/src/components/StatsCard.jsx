export default function StatsCard({ title, value }) {
  return (
    <div className="card">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
