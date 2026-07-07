// Detecteert een verlopen/ingetrokken Google OAuth-token (invalid_grant).
// googleapis gooit een GaxiosError; de marker zit in message of response.data.error.
function isGoogleAuthError(err) {
  if (!err) return false;
  const fromData = err.response?.data?.error || err.response?.data?.error_description;
  const haystack = `${err.message || ''} ${fromData || ''}`.toLowerCase();
  return haystack.includes('invalid_grant')
    || haystack.includes('token has been expired or revoked')
    || haystack.includes('invalid credentials');
}

export function errorHandler(err, req, res, _next) {
  console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);

  // Verlopen Gmail-token → duidelijke 401 + needs_reconnect zodat de UI
  // "Account opnieuw verbinden" toont i.p.v. een kryptische "invalid_grant".
  if (isGoogleAuthError(err)) {
    return res.status(401).json({
      error: 'Account moet opnieuw verbonden worden (token verlopen)',
      code: 'NEEDS_RECONNECT',
      needs_reconnect: true,
    });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
  });
}

export function notFound(req, res) {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
}
