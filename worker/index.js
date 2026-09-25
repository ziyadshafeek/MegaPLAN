/** Lightweight Cloudflare Worker adapter.
 * Use for cacheable public metadata APIs, rate-limits and routing.
 * Keep heavy PDF/audio/ML execution out of Workers Free: current free CPU is 10ms/invocation.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ok:true, service:'freetoolforge-edge'});
    if (url.pathname === '/api/proxy') {
      const target = url.searchParams.get('url');
      if (!target || !/^https?:\/\//i.test(target)) return Response.json({error:'invalid url'}, {status:400});
      const u = new URL(target);
      const key = new Request(u.toString(), {method:'GET',headers:{'user-agent':'FreeToolForge-Edge/0.2'}});
      const cached = await caches.default.match(key);
      if (cached) return cached;
      const resp = await fetch(key);
      const out = new Response(resp.body, resp);
      out.headers.set('cache-control','public,max-age=3600');
      ctx.waitUntil(caches.default.put(key,out.clone()));
      return out;
    }
    return new Response('Not found',{status:404});
  }
};
