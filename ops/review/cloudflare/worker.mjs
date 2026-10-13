// A stable owner-review address; authentication stays at the isolated gateway.
export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    const fail = status => new Response('検証版に接続できません', { status, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } });
    if (!/^https:\/\/tuat-review\.[a-z0-9-]+\.workers\.dev$/.test(env.REVIEW_PUBLIC_ORIGIN ?? '') ||
        !/^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/.test(env.REVIEW_UPSTREAM_ORIGIN ?? '')) return fail(503);
    if (incoming.origin !== env.REVIEW_PUBLIC_ORIGIN) return fail(421);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && request.headers.get('origin') !== incoming.origin) return fail(403);
    const target = new URL(incoming.pathname + incoming.search, env.REVIEW_UPSTREAM_ORIGIN);
    const headers = new Headers(request.headers);
    for (const name of ['host', 'x-tuat-review-internal', 'x-tuat-review-public-origin', 'x-forwarded-host', 'x-forwarded-proto']) headers.delete(name);
    headers.set('x-tuat-review-public-origin', incoming.origin);
    try {
      const upstream = await fetch(new Request(target, { method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual', duplex: 'half' }));
      const response = new Response(upstream.body, upstream);
      const location = response.headers.get('location');
      if (location) {
        const destination = new URL(location, target);
        if (destination.origin !== env.REVIEW_UPSTREAM_ORIGIN && destination.origin !== incoming.origin) return fail(502);
        response.headers.set('location', destination.pathname + destination.search + destination.hash);
      }
      response.headers.set('cache-control', 'no-store, private');
      response.headers.set('x-robots-tag', 'noindex, nofollow');
      return response;
    } catch { return fail(503); }
  },
};
