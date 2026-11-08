const {createHash} = require('node:crypto');
// Read-only customer-display capabilities. Staff authentication never reaches tablets.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const reply = (status, data) => res.status(status).json(data);
  if (req.method !== 'POST') { res.setHeader('Allow','POST'); return reply(405,{error:'Gunakan POST.'}); }
  if (req.headers['x-pos-display'] !== '1' || req.headers['sec-fetch-site'] === 'cross-site') return reply(403,{error:'Permintaan tidak diizinkan.'});
  if (req.headers.origin) {
    try { if (new URL(req.headers.origin).host !== req.headers.host) return reply(403,{error:'Asal permintaan tidak sesuai.'}); }
    catch { return reply(403,{error:'Asal permintaan tidak valid.'}); }
  }
  const url = process.env.POS_SUPABASE_URL || '', key = process.env.POS_SUPABASE_SERVICE_ROLE_KEY || '';
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !key) return reply(503,{error:'Sambungan tablet belum dikonfigurasi di server.'});
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch { return reply(400,{error:'Permintaan tidak valid.'}); }
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 2048) return reply(400,{error:'Permintaan tidak valid.'});
  const args = {p_action:body.action, p_code:null, p_token:null, p_bucket:null};
  if (body.action === 'pair') {
    args.p_code = String(body.code || '').replace(/[\s-]/g,'').toUpperCase();
    if (!/^[A-F0-9]{10}$/.test(args.p_code)) return reply(400,{error:'Masukkan 10 karakter kode dari kasir.'});
    const ip = String(req.headers['x-vercel-forwarded-for'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
    args.p_bucket = createHash('sha256').update(ip).digest('hex');
  } else if (body.action === 'poll' || body.action === 'leave') {
    args.p_token = String(req.headers.authorization || '').replace(/^Bearer /,'');
    if (!/^[a-f0-9]{64}$/.test(args.p_token)) return reply(401,{error:'Pasangkan tablet kembali.',status:'gone'});
  } else return reply(400,{error:'Aksi tidak tersedia.'});
  try {
    const response = await fetch(url+'/rest/v1/rpc/pos_customer_display_viewer',{
      method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify(args),signal:AbortSignal.timeout(8000),
    });
    if (!response.ok) return reply(503,{error:'Sambungan layar pelanggan belum tersedia. Coba lagi.'});
    const data = await response.json();
    if (data.status === 'rate_limited') { res.setHeader('Retry-After','60'); return reply(429,{status:data.status,error:'Terlalu banyak percobaan. Tunggu satu menit.'}); }
    if (data.status === 'unavailable') return reply(404,{status:data.status,error:'Kode tidak tersedia, sudah dipakai, atau kedaluwarsa.'});
    return reply(data.status === 'gone'?410:200,data);
  } catch { return reply(503,{error:'Koneksi terputus. Mencoba menghubungkan kembali.'}); }
};
