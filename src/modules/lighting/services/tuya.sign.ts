import crypto from 'crypto';

const SIGN_METHOD = 'HMAC-SHA256';

function encrypt(value: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(value, 'utf8')
    .digest('hex')
    .toUpperCase();
}

function buildSignedPath(path: string): string {
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
  const requestPath = buildSignedPath(path);
  const stringToSign = ['GET', contentHash, '', requestPath].join('\n');
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
  const requestPath = buildSignedPath(refreshPath);
  const stringToSign = ['GET', contentHash, '', requestPath].join('\n');
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
  path: string,
  method: string,
  body: unknown = {}
): { path: string } & Record<string, string> {
  const t = Date.now().toString();
  const upperMethod = method.toUpperCase();
  const requestPath = buildSignedPath(path);
  const hasBody =
    upperMethod !== 'GET' &&
    body !== null &&
    typeof body === 'object' &&
    Object.keys(body as Record<string, unknown>).length > 0;
  const content = hasBody ? JSON.stringify(body) : '';
  const contentHash = crypto.createHash('sha256').update(content).digest('hex');

  const stringToSign = [upperMethod, contentHash, '', requestPath].join('\n');
  const sign = encrypt(
    `${clientId}${accessToken}${t}${stringToSign}`,
    clientSecret
  );

  return {
    path: requestPath,
    t,
    sign_method: SIGN_METHOD,
    client_id: clientId,
    sign,
    access_token: accessToken,
  };
}
