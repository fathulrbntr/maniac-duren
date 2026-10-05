// Server only. The service-role key is never returned by /api/pos-config.
module.exports = async (req,res) => {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'Gunakan POST'});
 const url=process.env.POS_SUPABASE_URL,publicKey=process.env.POS_SUPABASE_PUBLISHABLE_KEY,secret=process.env.POS_SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!publicKey||!secret)return res.status(503).json({error:'Owner perlu memasang POS_SUPABASE_SERVICE_ROLE_KEY di environment Vercel untuk membuat akun.'});
 const auth=req.headers.authorization||'';
 if(!auth.startsWith('Bearer '))return res.status(401).json({error:'Login diperlukan'});
 const {employeeId,password,action='create'}=typeof req.body==='string'?JSON.parse(req.body):req.body||{};
 if(!/^[0-9a-f-]{36}$/i.test(employeeId||'')||typeof password!=='string'||password.length<12||password.length>128)return res.status(400).json({error:'ID karyawan dan password minimal 12 karakter wajib'});
 const api=async(path,body,admin=false)=>{
  const r=await fetch(url+path,{method:'POST',headers:{apikey:admin?secret:publicKey,Authorization:admin?'Bearer '+secret:auth,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  const data=await r.json();if(!r.ok)throw Error(data.message||data.msg||data.error_description||'Permintaan akun gagal');return data;
 };
 try{
  const target=await api('/rest/v1/rpc/pos_account_target',{employee_id:employeeId});
  if(target.linked && action==='reset'){const r=await fetch(url+'/auth/v1/admin/users/'+target.userId,{method:'PUT',headers:{apikey:secret,Authorization:'Bearer '+secret,'Content-Type':'application/json'},body:JSON.stringify({password})});const d=await r.json();if(!r.ok)throw Error(d.message||'Gagal mengubah password');return res.status(200).json({ok:true});}
  if(target.linked)return res.status(200).json({ok:true});
  // Auth lookup uses the owner-only RPC, so a retry after creation can finish linking.
  let userId=target.userId;
  if(!userId){const user=await api('/auth/v1/admin/users',{email:target.email,password,email_confirm:true,user_metadata:{employee_id:employeeId}},true);userId=user.id||user.user?.id;if(!userId)throw Error('Respons pembuatan akun tidak valid');}
  await api('/rest/v1/rpc/pos_mutate',{action:'employee_link',payload:{id:require('node:crypto').randomUUID(),employeeId,userId}});
  return res.status(200).json({ok:true});
 }catch(err){return res.status(400).json({error:err.message});}
};
