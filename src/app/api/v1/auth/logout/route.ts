/**
 * POST /api/v1/auth/logout — stateless logout.
 *
 * Since session is currently JWT-in-localStorage, the server has no state
 * to clear; the client drops the token. When Phase 6 moves to httpOnly
 * cookies, this endpoint will clear the cookie via Set-Cookie.
 */

export async function POST() {
  return Response.json({ data: { ok: true } });
}
