// Service role stays on the server. Every operation must pass the owner-only target RPC.
const { randomUUID } = require('node:crypto');
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Gunakan POST' });
  const url = process.env.POS_SUPABASE_URL, key = process.env.POS_SUPABASE_PUBLISHABLE_KEY, secret = process.env.POS_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !secret) return res.status(503).json({ error: 'Konfigurasi akun belum lengkap. Hubungi owner.' });
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Login diperlukan' });
  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}; }
  catch { return res.status(400).json({ error: 'Data akun tidak valid' }); }
  const { employeeId, password, action = 'create' } = body;
  if (!['create', 'reset'].includes(action) || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(employeeId || '') || typeof password !== 'string' || password.length < 6 || password.length > 128) return res.status(400).json({ error: 'ID karyawan dan password 6–128 karakter wajib diisi.' });
  const api = async (path, payload, admin = false, method = 'POST') => {
    const response = await fetch(url + path, {
      method, headers: { apikey: admin ? secret : key, Authorization: admin ? 'Bearer ' + secret : auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.message || data.msg || data.error_description || 'Permintaan akun gagal');
    return data;
  };
  try {
    const target = await api('/rest/v1/rpc/pos_account_target', { employee_id: employeeId });
    if (action === 'reset') {
      if (!target.linked || !target.userId) throw Error('Karyawan belum memiliki akun login. Buat akun terlebih dahulu.');
      await api('/auth/v1/admin/users/' + target.userId, { password }, true, 'PUT');
      return res.status(200).json({ ok: true });
    }
    if (target.linked) return res.status(200).json({ ok: true });
    if (!target.active) throw Error('Aktifkan karyawan sebelum membuat akun.');
    if (target.existingUnrelated) throw Error('Email sudah digunakan akun lain. Gunakan email berbeda.');
    let userId = target.userId;
    if (!userId) {
      const user = await api('/auth/v1/admin/users', { email: target.email, password, email_confirm: true, user_metadata: { employee_id: employeeId } }, true);
      userId = user.id || user.user?.id;
      if (!userId) throw Error('Respons pembuatan akun tidak valid');
    }
    await api('/rest/v1/rpc/pos_mutate', { action: 'employee_link', payload: { id: randomUUID(), employeeId, userId } });
    return res.status(200).json({ ok: true });
  } catch (error) { return res.status(400).json({ error: error.message }); }
};
