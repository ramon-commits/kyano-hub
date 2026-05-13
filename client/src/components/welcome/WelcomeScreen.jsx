export default function WelcomeScreen({ onGoToSettings }) {
  return (
    <div className="flex h-full flex-col items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-50 p-12">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl bg-blue-600 text-4xl font-bold text-white shadow-lg">
          K
        </div>
        <h1 className="mb-2 text-2xl font-bold text-gray-900">Welkom bij Kyano Comm Hub</h1>
        <p className="mb-8 text-sm text-gray-500">
          Eén dashboard voor al je communicatie. Email, WhatsApp, LinkedIn, Calendar — alles op één plek.
        </p>

        <div className="mb-8 space-y-2.5 text-left">
          <Step n={1} done>
            <strong className="text-sm text-gray-900">Open de hub</strong>
            <div className="text-xs text-gray-500">Je staat hier nu ✨</div>
          </Step>
          <Step n={2}>
            <strong className="text-sm text-gray-900">Verbind je eerste email account</strong>
            <div className="text-xs text-gray-500">Klik hieronder om naar Instellingen te gaan</div>
          </Step>
          <Step n={3}>
            <strong className="text-sm text-gray-900">Berichten worden opgehaald</strong>
            <div className="text-xs text-gray-500">Initiële sync haalt je 100 ongelezen mails op</div>
          </Step>
          <Step n={4}>
            <strong className="text-sm text-gray-900">Klaar!</strong>
            <div className="text-xs text-gray-500">Lezen, beantwoorden, snoozen — vanuit één hub</div>
          </Step>
        </div>

        <button
          onClick={onGoToSettings}
          className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
        >
          🔐 Verbind je eerste account
        </button>
      </div>
    </div>
  );
}

function Step({ n, children, done }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
      <div
        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
          done ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'
        }`}
      >
        {done ? '✓' : n}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}
