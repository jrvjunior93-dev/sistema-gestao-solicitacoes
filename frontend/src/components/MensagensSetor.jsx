export default function MensagensSetor({ mensagens }) {
  return (
    <div className="space-y-3">
      {mensagens.map(m => (
        <div key={m.id} className="bg-gray-100 p-2 rounded">
          <strong>{m.usuario?.nome}</strong>
          <p>{m.descricao}</p>
        </div>
      ))}
    </div>
  );
}
