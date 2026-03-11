import crypto from 'crypto';

const SIGN_METHOD = 'HMAC-SHA256';

function encrypt(value: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(value, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function normalizePath(path: string): string {
  const [uri, rawQuery] = path.split('?');

  if (!rawQuery) {
    return uri;
  }

  const query = new URLSearchParams(rawQuery);
  const sorted = Array.from(query.keys())
    .sort()
    .map(key => {
      const values = query.getAll(key);
      if (values.length === 0) {
        return key;
      }
      return values.map(value => `${key}=${value}`).join('&');
    })
    .filter(Boolean)
    .join('&');

  return sorted ? `${uri}?${decodeURIComponent(sorted)}` : uri;
}

export function getTokenSignHeaders(
  clientId: string,
  clientSecret: string
): Record<string, string> {
  const path = '/v1.0/token?grant_type=1';
  const t = Date.now().toString();
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const normalizedPath = normalizePath(path);
  const stringToSign = ['GET', contentHash, '', normalizedPath].join('\n');
  const sign = encrypt(`${clientId}${t}${stringToSign}`, clientSecret);

  return {
    t,
    sign_method: SIGN_METHOD,
    client_id: clientId,
    sign,
  };
}

export function getRefreshSignHeaders(
  clientId: string,
  clientSecret: string,
  refreshPath: string
): Record<string, string> {
  const t = Date.now().toString();
  const contentHash = crypto.createHash('sha256').update('').digest('hex');
  const normalizedPath = normalizePath(refreshPath);
  const stringToSign = ['GET', contentHash, '', normalizedPath].join('\n');
  const sign = encrypt(`${clientId}${t}${stringToSign}`, clientSecret);

  return {
    t,
    sign_method: SIGN_METHOD,
    client_id: clientId,
    sign,
  };
}

export function getRequestSign(
  clientId: string,
  clientSecret: string,
  accessToken: string,
  method: string,
  path: string,
  body?: unknown
): { path: string } & Record<string, string> {
  const t = Date.now().toString();
  const normalizedPath = normalizePath(path);

  const upperMethod = method.toUpperCase();
  const content =
    upperMethod === 'GET' || body === undefined ? '' : JSON.stringify(body);
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  const stringToSign = [upperMethod, contentHash, '', normalizedPath].join('\n');
  const sign = encrypt(
    `${clientId}${accessToken}${t}${stringToSign}`,
    clientSecret
  );

  return {
    path: normalizedPath,
    t,
    sign_method: SIGN_METHOD,
    client_id: clientId,
    sign,
    access_token: accessToken,
  };
}
