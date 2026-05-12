// Placeholder — wordt stap 8 (Google Calendar integratie)
export async function listEvents(_args) {
  return [];
}

export async function createEvent(_args) {
  throw Object.assign(new Error('Calendar create event komt in stap 8'), { status: 501 });
}
