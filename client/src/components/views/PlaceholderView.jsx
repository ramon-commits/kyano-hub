export default function PlaceholderView({ title, hint }) {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-3xl">
          🛠️
        </div>
        <h2 className="mb-2 text-xl font-semibold text-gray-900">{title}</h2>
        <p className="text-sm text-gray-500">
          {hint || 'Komt in een volgende stap. Het fundament staat — content volgt.'}
        </p>
      </div>
    </div>
  );
}
