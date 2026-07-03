// Info-scherm voor een Asana-taak: compacte klantinfo (uit de custom fields + de geparste
// "Customer details") bovenaan; pas na een kanaalkeuze opent het typ-scherm.

function formatValue(value) {
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
  }
  return s;
}

// Statische Tailwind-klassen per task-type kleur (dynamische `bg-${x}` sneuvelen in de build).
const TASK_TYPE_COLORS = {
  blue: 'bg-blue-50 text-blue-700',
  green: 'bg-green-50 text-green-700',
  red: 'bg-red-50 text-red-700',
  purple: 'bg-purple-50 text-purple-700',
  orange: 'bg-orange-50 text-orange-700',
  pink: 'bg-pink-50 text-pink-700',
  gray: 'bg-gray-100 text-gray-700',
};

function OrderField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-gray-900">{value}</p>
    </div>
  );
}

export default function AsanaInfoScreen({ message, onStartCompose, onBack, onDone, onSnooze, onArchive, onUrgent }) {
  const m = message;
  let cf = {};
  try { cf = m.asana_custom_fields ? JSON.parse(m.asana_custom_fields) : {}; } catch { cf = {}; }

  const parsedName = `${cf.Firstname || ''} ${cf.Lastname || ''}`.trim();
  const companyName = cf._CompanyName || cf['Account name'] || cf.Company || cf.Bedrijf || null;
  const customerName = companyName || parsedName || cf['Customer'] || cf['Klant'] || null;
  // Persoon als subtitel — alleen als die afwijkt van de titel (voorkomt dubbele naam).
  const subtitle = parsedName && parsedName !== customerName ? parsedName : null;
  const country = cf._Country || (cf.Country ? { code: cf.Country, name: cf.Country, flag: '' } : null);
  const taskType = cf._TaskType || null;
  const status = cf['Account Status'];
  const isActive = status && /actief|active/i.test(status);
  const email = cf.Email || m.asana_contact_email;
  const phone = cf.Tel || cf.Phone || m.asana_contact_phone;
  const magentoUrl = cf['Magento URL'];
  const recentOrders = Array.isArray(cf['Recent orders']) ? cf['Recent orders'] : null;
  const asanaUrl = m.deep_link || `https://app.asana.com/0/0/${m.external_id}`;

  const orderFields = [
    { label: 'Klant sinds', value: cf['Customer since'] },
    { label: 'Laatste bestelling', value: cf['Last order date'] || cf['Last Order Date'] },
    { label: 'Totaal bestellingen', value: cf['Order count'] || cf['Total Orders'] },
    { label: 'Gem. bestelwaarde', value: cf['Average order value'] ? `€${cf['Average order value']}` : null },
  ].filter((f) => f.value).map((f) => ({ ...f, value: formatValue(f.value) }));

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
            <div className="mb-5 flex items-start gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 text-lg font-bold text-purple-700">
                {(customerName || '?').slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-xl font-semibold text-gray-900">{customerName || 'Onbekende klant'}</h2>
                  {country ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs">
                      {country.flag ? <span className="text-base leading-none">{country.flag}</span> : null}
                      <span className="font-medium text-gray-700">{country.code}</span>
                    </span>
                  ) : null}
                </div>
                {subtitle ? <p className="mt-0.5 text-sm text-gray-600">{subtitle}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {status ? (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${isActive ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
                    </span>
                  ) : null}
                  {taskType ? (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TASK_TYPE_COLORS[taskType.color] || TASK_TYPE_COLORS.gray}`}>
                      <i className={`${taskType.icon} text-[10px]`} />{taskType.label}
                    </span>
                  ) : null}
                </div>
              </div>
              {magentoUrl ? (
                <a href={magentoUrl} target="_blank" rel="noopener noreferrer" className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-700 transition-colors hover:bg-gray-50">
                  <i className="fa-solid fa-arrow-up-right-from-square" /> Magento
                </a>
              ) : null}
            </div>

            <div className="mb-4 grid grid-cols-2 gap-3">
              {email ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Email</p>
                  <a href={`mailto:${email}`} className="mt-0.5 block truncate text-sm font-medium text-gray-900 hover:text-blue-600">{email}</a>
                </div>
              ) : null}
              {phone ? (
                <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Telefoon</p>
                  <a href={`tel:${phone}`} className="mt-0.5 block text-sm font-medium text-gray-900 hover:text-blue-600">{phone}</a>
                </div>
              ) : null}
            </div>

            {orderFields.length ? (
              <div className="border-t border-gray-100 pt-4">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Bestelhistorie</p>
                <div className="grid grid-cols-2 gap-3">
                  {orderFields.map((f) => <OrderField key={f.label} label={f.label} value={f.value} />)}
                </div>
              </div>
            ) : null}

            {recentOrders && recentOrders.length ? (
              <div className="mt-4 border-t border-gray-100 pt-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Laatste bestellingen</p>
                <div className="space-y-1">
                  {recentOrders.map((order, i) => {
                    const [date, amount] = order.split('|').map((s) => s.trim());
                    return (
                      <div key={i} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5 text-sm">
                        <span className="text-gray-700">{date}</span>
                        {amount ? <span className="font-medium text-gray-900">€{amount}</span> : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="rounded-2xl border-2 border-blue-100 bg-gradient-to-br from-blue-50/50 to-white p-5">
          <h3 className="font-semibold text-gray-900">Kies hoe je contact opneemt</h3>
          <p className="mb-4 text-xs text-gray-500">Bij versturen wordt de Asana taak automatisch afgevinkt.</p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {email ? (
              <button onClick={() => onStartCompose('email')} className="group flex items-center justify-between rounded-xl bg-red-600 p-4 text-white transition-colors hover:bg-red-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-solid fa-envelope text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Stuur Email</span>
                    <span className="block text-xs opacity-75">{email}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}

            {phone ? (
              <button onClick={() => onStartCompose('whatsapp')} className="group flex items-center justify-between rounded-xl bg-green-600 p-4 text-white transition-colors hover:bg-green-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-brands fa-whatsapp text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Stuur WhatsApp</span>
                    <span className="block text-xs opacity-75">{phone}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ) : null}

            {phone ? (
              <a href={`tel:${phone}`} className="group flex items-center justify-between rounded-xl bg-blue-600 p-4 text-white transition-colors hover:bg-blue-700">
                <span className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20"><i className="fa-solid fa-phone text-lg" /></span>
                  <span className="text-left">
                    <span className="block font-semibold">Bel direct</span>
                    <span className="block text-xs opacity-75">{phone}</span>
                  </span>
                </span>
                <i className="fa-solid fa-arrow-right opacity-0 transition-opacity group-hover:opacity-100" />
              </a>
            ) : null}
          </div>

          <a href={asanaUrl} target="_blank" rel="noopener noreferrer" className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-50">
            <i className="fa-brands fa-asana" /> Open taak in Asana
          </a>

          {/* Direct afhandelen zonder terug naar de inbox — springt door naar het volgende bericht. */}
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-gray-200 pt-4">
            <span className="mr-1 text-xs text-gray-500">Of direct afhandelen:</span>
            {onDone ? (
              <button onClick={() => onDone(m)} className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700">
                <i className="fa-solid fa-check" /> Afgehandeld
              </button>
            ) : null}
            {onSnooze ? (
              <button onClick={() => onSnooze(m)} className="flex items-center gap-2 rounded-lg bg-orange-100 px-3 py-2 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-200">
                <i className="fa-solid fa-clock" /> Snooze
              </button>
            ) : null}
            {onArchive ? (
              <button onClick={() => onArchive(m)} className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200">
                <i className="fa-solid fa-box-archive" /> Archiveer
              </button>
            ) : null}
            {onUrgent ? (
              <button
                onClick={() => onUrgent(m)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  m.priority === 'high' ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-red-50 text-red-700 hover:bg-red-100'
                }`}
              >
                <i className="fa-solid fa-circle-exclamation" />
                {m.priority === 'high' ? 'Urgent' : 'Markeer urgent'}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
