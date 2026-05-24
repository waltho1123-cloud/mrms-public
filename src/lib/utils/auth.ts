/**
 * JWT authentication middleware for admin API routes.
 */

import { AppError } from './errors';

interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  iat: number;
  exp: number;
}

function getJwtSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('[SECURITY] NEXTAUTH_SECRET or JWT_SECRET environment variable must be set.');
  }
  return secret;
}

const JWT_SECRET = getJwtSecret();

/**
 * Base64url encode
 */
function base64urlEncode(data: string): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Base64url decode
 */
function base64urlDecode(str: string): string {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  return Buffer.from(s, 'base64').toString('utf-8');
}

/**
 * HMAC-SHA256 sign
 */
async function hmacSign(data: string, secret: string): Promise<string> {
  const { createHmac } = await import('crypto');
  const hmac = createHmac('sha256', secret);
  hmac.update(data);
  return hmac
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Create a JWT token
 */
export async function createToken(payload: Omit<JWTPayload, 'iat' | 'exp'>): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + 24 * 60 * 60, // 24 hours
  };

  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify(fullPayload));
  const signature = await hmacSign(`${header}.${body}`, JWT_SECRET);

  return `${header}.${body}.${signature}`;
}

/**
 * Verify a JWT token and return the payload
 */
export async function verifyToken(token: string): Promise<JWTPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new AppError('ERR_AUTH', 'Invalid token format', 401);
  }

  const [header, body, signature] = parts;
  const expectedSig = await hmacSign(`${header}.${body}`, JWT_SECRET);

  // Timing-safe comparison to prevent timing attacks
  const { timingSafeEqual } = await import('crypto');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new AppError('ERR_AUTH', 'Invalid token signature', 401);
  }

  const payload: JWTPayload = JSON.parse(base64urlDecode(body));

  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new AppError('ERR_AUTH', 'Token expired', 401);
  }

  return payload;
}

/**
 * Extract and verify the JWT from the Authorization header.
 * Returns the decoded payload or throws AppError.
 */
export async function requireAuth(request: Request): Promise<JWTPayload> {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('ERR_AUTH', 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);
  return verifyToken(token);
}
