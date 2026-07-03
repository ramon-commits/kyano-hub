// Info-scherm voor een Asana-taak: toont eerst alle klantinfo + wat er moet gebeuren,
// en pas na een kanaalkeuze opent het typ-scherm (het echte gesprek met de klant).

function formatValue(value) {
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

function Field({ label, value, mono, span }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className={`mt-0.5 text-sm font-medium text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

export default function AsanaInfoScreen({ message, onStartCompose, onBack }) {
  const m = message;
  let cf = {};
  try { cf = m.asana_custom_fields ? JSON.parse(m.asana_custom_fields) : {}; } catch { cf = {}; }

  const customerName = cf['Account name'] || cf['Customer'] || cf['Klant'] || cf['Company'] || null;
  const country = cf['Country'];
  const status = cf['Account Status'];
  const lastOrder = cf['Last Order Date'] || cf['Last Order'];
  const customerSince = cf['Customer since'];
  const contact = cf['Contact'];
  const totalOrders = cf['Total Orders'];
  const avgOrderValue = cf['Average order value'];
  const lastTwoOrders = cf['Last two order amounts'];
  const accountId = cf['Account ID'];
  const isActive = status && /actief|active/i.test(status);
  const asanaUrl = m.deep_link || `https://app.asana.com/0/0/${m.external_id}`;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="mx-auto max-w-3xl space-y-5 p-6">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="rounded-lg p-2 text-gray-600 transition-colors hover:bg-gray-100" title="Terug naar inbox">
            <i className="fa-solid fa-arrow-left" />
          </button>
          <span className="inline-flex items-center gap-1 rounded-md bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            <i className="fa-brands fa-asana text-[10px]" /> Asana taak
          </span>
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{m.subject}</h1>
          {m.asana_assignee_email ? (
            <p className="mt-1 text-sm text-gray-500">Toegewezen aan {m.asana_assignee_email.split('@')[0]}</p>
          ) : null}
        </div>

        {customerName ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="mb-4 flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-lg font-bold text-purple-700">
                {customerName.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{customerName}</h2>
                <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                  {country ? <span className="flex items-center gap-1"><i className="fa-solid fa-globe" />{country}</span> : null}
                  {status ? (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {status}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 border-t border-gray-100 pt-4">
              {customerSince ? <Field label="Klant sinds" value={formatValue(customerSince)} /> : null}
              {lastOrder ? <Field label="Laatste bestelling" value={formatValue(lastOrder)} /> : null}
              {totalOrders ? <Field label="Totaal bestellingen" value={formatValue(totalOrders)} /> : null}
              {avgOrderValue ? <Field label="Gem. bestelwaarde" value={`€${formatValue(avgOrderValue)}`} /> : null}
              {lastTwoOrders ? <Field label="Laatste 2 orders" value={formatValue(lastTwoOrders)} span={2} /> : null}
              {contact ? <Field label="Contact" value={formatValue(contact)} span={2} /> : null}
              {accountId ? <Field label="Account ID" value={formatValue(accountId)} mono /> : null}
            </div>
          </div>
        ) : null}

        {m.body_text ? (
          <div className="rounded-2xl border border-orange-200 bg-orange-50/50 p-5">
            <div className="mb-3 flex items-center gap-2">
              <i className="fa-solid fa-bullhorn text-orange-600" />
              <h3 className="font-semibold text-orange-900">Wat moet er gebeuren</h3>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{m.body_text}</p>
          </div>
        ) : null}

        {m.asana_contact_email || m.asana_contact_phone ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 font-semibold text-gray-900">Contactgegevens</h3>
            <div className="space-y-2">
              {m.asana_contact_email ? (
                <div className="flex items-center gap-3 text-sm">
                  <i className="fa-solid fa-envelope w-4 text-gray-400" />
                  <span className="text-gray-700">{m.asana_contact_email}</span>
                </div>
              ) : null}
              {m.asana_contact_phone ? (
                <div className="flex items-center gap-3 text-sm">
                  <i className="fa-solid fa-phone w-4 text-gray-400" />
                  <span className="text-gray-700">{m.asana_contact_phone}</span>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className="rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-5">
          <h3 className="font-semibold text-gray-900">Kies hoe je contact opneemt</h3>
          <p className="mb-4 text-xs text-gray-500">Bij versturen wordt de Asana taak automatisch afgevinkt.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {m.asana_contact_email ? (
              <button onClick={() => onStartCompose('email')} className="group flex items-center justify-between rounded-xl bg-red-600 p-4 text-white transition-colors hover:bg-red-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-solid fa-envelope text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Stuur Email</span>
                    <span className="block text-xs opacity-75">{m.asana_contact_email}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}

            {m.asana_contact_phone ? (
              <button onClick={() => onStartCompose('whatsapp')} className="group flex items-center justify-between rounded-xl bg-green-600 p-4 text-white transition-colors hover:bg-green-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-brands fa-whatsapp text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Stuur WhatsApp</span>
                    <span className="block text-xs opacity-75">{m.asana_contact_phone}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}

            {m.asana_contact_phone ? (
              <a href={`tel:${m.asana_contact_phone}`} className="group flex items-center justify-between rounded-xl bg-blue-600 p-4 text-white transition-colors hover:bg-blue-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-solid fa-phone text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Bel direct</span>
                    <span className="block text-xs opacity-75">{m.asana_contact_phone}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ) : null}
          </div>

          <a href={asanaUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
            <i className="fa-brands fa-asana" /> Open taak in Asana
          </a>
        </div>
      </div>
    </div>
  );
}
