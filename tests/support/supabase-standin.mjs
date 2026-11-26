// テスト専用：Supabase の API（REST / Auth / Storage）のうち、このサイトが使う部分だけを再現するサーバー。
// データベースは本物の PostgreSQL に supabase/migrations を入れたもので、権限（RLS）・関数・制約は本番と同じものが動く。
// 本番では使わない（本番は Supabase そのものに接続する）。
import http from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import pg from 'pg';

export async function startStandin({ port, database, pgHost = process.env.PGHOST || '/tmp', pgPort = Number(process.env.PGPORT || 54329), user = process.env.PGUSER || 'postgres' }) {
  const pool = new pg.Pool({ host: pgHost, port: pgPort, user, database, max: 8 });
  const tokens = new Map(); // access_token → { uid, email }
  const refresh = new Map();
  const passwords = new Map(); // email → { pw, uid }
  const files = new Map(); // path → { type, buf }

  const session = (uid, email) => {
    const access_token = randomBytes(16).toString('hex'), refresh_token = randomBytes(16).toString('hex');
    tokens.set(access_token, { uid, email }); refresh.set(refresh_token, { uid, email });
    return { access_token, refresh_token, expires_in: 3600, token_type: 'bearer', user: { id: uid, email } };
  };
  const who = (req) => { const t = (req.headers.authorization || '').replace(/^Bearer /, ''); return tokens.get(t) || null; };

  // 利用者として SQL を実行する（PostgREST と同じく、ロールと JWT の sub をトランザクションに設定）
  async function asUser(u, sql, params = []) {
    const c = await pool.connect();
    try {
      await c.query('begin');
      await c.query(`set local role ${u ? 'authenticated' : 'anon'}`);
      await c.query("select set_config('request.jwt.claim.sub', $1, true)", [u ? u.uid : '']);
      const r = await c.query(sql, params);
      await c.query('commit');
      return r;
    } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }

  const ident = (s) => { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw Object.assign(new Error(`bad identifier ${s}`), { status: 400 }); return `"${s}"`; };
  // PostgREST のフィルター（eq / neq / gt / gte / lt / lte / in / is / ilike / not.）
  function cond(col, expr, params) {
    let neg = false;
    if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
    const i = expr.indexOf('.');
    const op = expr.slice(0, i), val = expr.slice(i + 1);
    const p = (v) => { params.push(v); return `$${params.length}`; };
    let s;
    if (op === 'in') s = `${ident(col)}::text = any(${p(val.replace(/^\(|\)$/g, '').split(',').filter(Boolean))}::text[])`;
    else if (op === 'is') s = `${ident(col)} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : 'false'}`;
    else if (op === 'ilike') s = `${ident(col)} ilike ${p(val.replace(/\*/g, '%'))}`;
    else { const o = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' }[op]; if (!o) throw Object.assign(new Error(`op ${op}`), { status: 400 }); s = `${ident(col)} ${o} ${p(val)}`; }
    return neg ? `not (${s})` : s;
  }
  // or=(a.lt.X,and(b.eq.Y,c.lt.Z))
  function logic(str, kind, params) {
    const inner = str.replace(/^\(|\)$/g, '');
    const parts = []; let depth = 0, cur = '';
    for (const ch of inner) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch; }
    if (cur) parts.push(cur);
    return `(${parts.map((x) => {
      const m = x.match(/^(and|or)\((.*)\)$/);
      if (m) return logic(`(${m[2]})`, m[1], params);
      const d = x.indexOf('.');
      return cond(x.slice(0, d), x.slice(d + 1), params);
    }).join(kind === 'and' ? ' and ' : ' or ')})`;
  }

  async function rest(req, res, u, path, q, body) {
    if (path.startsWith('rpc/')) {
      const fn = path.slice(4);
      const args = body || {};
      const keys = Object.keys(args);
      const params = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k] === null || args[k] === undefined ? null : String(args[k])));
      const r = await asUser(u, `select to_jsonb(${ident(fn)}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})) as r`, params);
      return send(res, 200, r.rows[0]?.r ?? null);
    }
    if (req.method !== 'GET') return send(res, 405, { message: 'method' });
    const params = [];
    const where = [];
    let cols = '*', order = '', limit = '', offset = '';
    for (const [k, v] of q) {
      if (k === 'select') cols = v === '*' ? '*' : v.split(',').map(ident).join(',');
      else if (k === 'order') order = ' order by ' + v.split(',').map((o) => { const [c, d] = o.split('.'); return `${ident(c)} ${d === 'desc' ? 'desc' : 'asc'}${d === 'desc' ? ' nulls last' : ''}`; }).join(', ');
      else if (k === 'limit') limit = ` limit ${Number(v)}`;
      else if (k === 'offset') offset = ` offset ${Number(v)}`;
      else if (k === 'or') where.push(logic(v, 'or', params));
      else where.push(cond(k, v, params));
    }
    const base = `from public.${ident(path)}${where.length ? ' where ' + where.join(' and ') : ''}`;
    const r = await asUser(u, `select ${cols} ${base}${order}${limit}${offset}`, params);
    const h = {};
    if (/count=exact/.test(req.headers.prefer || '')) { const c = await asUser(u, `select count(*)::int n ${base}`, params); h['content-range'] = `0-${Math.max(0, r.rows.length - 1)}/${c.rows[0].n}`; }
    return send(res, 200, r.rows, h);
  }

  async function authApi(req, res, path, q, body) {
    if (path === 'signup') {
      if (passwords.has(body.email)) return send(res, 422, { msg: 'User already registered' });
      const uid = randomUUID();
      await pool.query('insert into auth.users (id, email) values ($1, $2)', [uid, body.email]);
      passwords.set(body.email, { pw: body.password, uid });
      return send(res, 200, session(uid, body.email));
    }
    if (path === 'token') {
      if (q.get('grant_type') === 'password') { const a = passwords.get(body.email); if (!a || a.pw !== body.password) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' }); return send(res, 200, session(a.uid, body.email)); }
      const r = refresh.get(body.refresh_token); if (!r) return send(res, 400, { error: 'invalid_grant' }); return send(res, 200, session(r.uid, r.email));
    }
    const u = who(req);
    if (path === 'user') return u ? send(res, 200, { id: u.uid, email: u.email }) : send(res, 401, { msg: 'unauthorized' });
    if (path === 'logout') { tokens.delete((req.headers.authorization || '').slice(7)); return send(res, 204, null); }
    if (['otp', 'recover'].includes(path)) return send(res, 200, {});
    return send(res, 404, { msg: 'not found' });
  }

  async function storage(req, res, path, buf) {
    const m = path.match(/^object\/(public\/)?post-media\/(.+)$/);
    if (!m) return send(res, 404, { message: 'not found' });
    if (req.method === 'GET') { const f = files.get(m[2]); if (!f) return send(res, 404, { message: 'not found' }); res.writeHead(200, { 'content-type': f.type, ...CORS }); return res.end(f.buf); }
    const u = who(req);
    if (!u) return send(res, 403, { message: 'Unauthorized' });
    // Storage の RLS（本人のフォルダだけ）を本物の DB で確認する
    try { await asUser(u, "insert into storage.objects (bucket_id, name, owner) values ('post-media', $1, auth.uid())", [m[2]]); }
    catch (e) { return send(res, 403, { message: 'new row violates row-level security policy' }); }
    if (!/^image\/(jpeg|webp)$/.test(req.headers['content-type'] || '') || buf.length > 5242880) return send(res, 400, { message: 'invalid mime type or size' });
    files.set(m[2], { type: req.headers['content-type'], buf });
    return send(res, 200, { Key: `post-media/${m[2]}` });
  }

  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, apikey, content-type, prefer, x-upsert', 'access-control-allow-methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS', 'access-control-expose-headers': 'content-range' };
  function send(res, status, data, headers = {}) {
    res.writeHead(status, { 'content-type': 'application/json', ...CORS, ...headers });
    res.end(data === null || status === 204 ? '' : JSON.stringify(data));
  }
  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
    const chunks = []; for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean); // [rest|auth|storage, v1, ...]
    const svc = parts[0], path = parts.slice(2).join('/');
    try {
      const publicFile = svc === 'storage' && req.method === 'GET' && path.startsWith('object/public/');
      if (!publicFile && req.headers.apikey !== 'test-anon') return send(res, 401, { message: 'Invalid API key' });
      if (svc === 'rest') return await rest(req, res, who(req), decodeURIComponent(path), url.searchParams, buf.length ? JSON.parse(buf) : null);
      if (svc === 'auth') return await authApi(req, res, path, url.searchParams, buf.length ? JSON.parse(buf) : {});
      if (svc === 'storage') return await storage(req, res, decodeURIComponent(path), buf);
      send(res, 404, { message: 'not found' });
    } catch (e) {
      send(res, e.status || (e.code === '42501' ? 403 : 400), { code: e.code, message: e.message, details: e.detail || null });
    }
  }).listen(port);
  return {
    pool,
    sql: (s, p) => pool.query(s, p),
    close: async () => { server.close(); await pool.end(); },
  };
}
