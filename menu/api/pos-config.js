module.exports = (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const url = process.env.POS_SUPABASE_URL || "",
    key = process.env.POS_SUPABASE_PUBLISHABLE_KEY || "";
  let publicKey = key.startsWith("sb_publishable_");
  if (!publicKey) {
    try {
      publicKey =
        JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString())
          .role === "anon";
    } catch {
      publicKey = false;
    }
  }
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url) || !publicKey)
    return res.status(200).json({ configured: false });
  return res.status(200).json({ configured: true, url, key });
};
