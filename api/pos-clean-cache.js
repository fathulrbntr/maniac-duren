// Browser cache only: no database, cookies or storage reset.
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({error: 'Gunakan tombol pada halaman pembersihan POS.'});
  }
  // Custom header blocks cross-origin HTML forms. Do not enable CORS.
  if (req.headers['x-pos-cache-reset'] !== '1' ||
      (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) {
    return res.status(403).json({error: 'Buka pembersihan dari domain POS yang sama.'});
  }
  res.setHeader('Clear-Site-Data', '"cache"');
  return res.status(200).json({ok: true});
};
