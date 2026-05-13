export default function EmptyState({ icon = '✨', title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-4 text-5xl text-gray-300 leading-none">{icon}</div>
      <h3 className="mb-1 text-base font-semibold text-gray-900">{title}</h3>
      {description ? <p className="max-w-md text-sm text-gray-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
