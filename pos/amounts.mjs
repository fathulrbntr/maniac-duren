// Match PostgreSQL decimal arithmetic for quantity × price; no rounding of weight.
function decimal(value) {
  const n=Number(value);
  if(!Number.isFinite(n))throw Error('Angka transaksi tidak valid');
  const [base,exponent='0']=String(n).toLowerCase().split('e');
  const [whole,fraction='']=base.split('.');
  let coefficient=BigInt(whole+fraction),scale=fraction.length-Number(exponent);
  if(scale<0){coefficient*=10n**BigInt(-scale);scale=0;}
  return {coefficient,scale};
}
export function orderTotal(lines) {
  let total=0n,scale=0;
  for(const line of lines){
    const a=decimal(line.qty),b=decimal(line.price),next=a.scale+b.scale;
    if(next>scale){total*=10n**BigInt(next-scale);scale=next;}
    total+=a.coefficient*b.coefficient*10n**BigInt(scale-next);
  }
  return Number(total.toString()+'e-'+scale);
}
