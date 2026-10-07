// Credential exchange runs on the server; identity lookup is never exposed to browsers.
const { createHash } = require('node:crypto');
const hash = value => createHash('sha256').update(value).digest('hex');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
  const url = process.env.POS_SUPABASE_URL;
  const key = process.env.POS_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.POS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) return res.status(503).json({ error: 'Konfigurasi login belum lengkap. Hubungi owner.' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return res.status(400).json({ error: 'Data login tidak valid' }); }
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const password = body?.password;
  const invalid = () => res.status(401).json({ error: 'Email, username, nomor telepon, atau password salah.' });
  if (identifier.length < 3 || identifier.length > 150 || typeof password !== 'string' || !password.length || password.length > 128) return invalid();
  const rpc = async (name, payload) => {
    const response = await fetch(url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: { apikey: secret, Authorization: 'Bearer ' + secret, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('Login service unavailable');
    return response.json();
  };
  const metrics = [];
  const timed = async (name, task) => {
    const started = performance.now();
    try { return await task(); } finally {
      metrics.push(name + ';dur=' + (performance.now()-started).toFixed(1));
      res.setHeader('Server-Timing',metrics.join(', '));
    }
  };
  try {
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    const normalized = /^[+\d\s().-]+$/.test(identifier) ? identifier.replace(/\D/g, '').replace(/^0/, '62') : identifier;
    const prepared = await timed('identity', () => rpc('pos_login_prepare', {
      identifier, ip_bucket: 'ip:' + hash(ip), login_bucket: 'login:' + hash(normalized),
    }));
    if (!prepared?.allowed) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' });
    const target = prepared.target;
    if (!target?.email || !target.userId) return invalid();
    const response = await timed('auth', () => fetch(url + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: target.email, password }), signal: AbortSignal.timeout(15000),
    }));
    const session = await response.json();
    if (!response.ok || session.user?.id !== target.userId || !session.access_token) return invalid();
    return res.status(200).json({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, user: { id: session.user.id } });
  } catch {
    return res.status(503).json({ error: 'Layanan login belum tersedia. Pastikan fungsi pos_login_prepare dan konfigurasi server sudah diterapkan.' });
  }
};
