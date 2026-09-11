'use strict';
(() => {
  const input = document.querySelector('#photo');
  const dialog = document.querySelector('#photo-editor');
  const canvas = document.querySelector('#photo-crop-canvas');
  const ctx = canvas.getContext('2d');
  const ratio = document.querySelector('#photo-ratio');
  const zoom = document.querySelector('#photo-zoom');
  const horizontal = document.querySelector('#photo-x');
  const vertical = document.querySelector('#photo-y');
  const apply = document.querySelector('#photo-apply');
  const message = document.querySelector('#photo-editor-status');
  let picture = null, objectURL = null, generation = 0, drag = null;

  // All crop coordinates remain within the source image; never stretch it.
  function cropRect() {
    const aspect = ratio.value === 'original' ? picture.naturalWidth / picture.naturalHeight : Number(ratio.value);
    let width = picture.naturalWidth;
    let height = width / aspect;
    if (height > picture.naturalHeight) { height = picture.naturalHeight; width = height * aspect; }
    width /= Number(zoom.value); height /= Number(zoom.value);
    return {width, height, x:(picture.naturalWidth-width)*(Number(horizontal.value)+1)/2, y:(picture.naturalHeight-height)*(Number(vertical.value)+1)/2};
  }
  function draw() {
    if (!picture) return;
    const r = cropRect();
    canvas.width = Math.max(1, Math.round(800 * Math.min(1, r.width/r.height)));
    canvas.height = Math.max(1, Math.round(800 * Math.min(1, r.height/r.width)));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(picture,r.x,r.y,r.width,r.height,0,0,canvas.width,canvas.height);
    document.querySelector('#photo-zoom-value').textContent = `${Math.round(Number(zoom.value)*100)}%`;
    horizontal.disabled = picture.naturalWidth-r.width < 0.01;
    vertical.disabled = picture.naturalHeight-r.height < 0.01;
  }
  function reset() { zoom.value='1'; horizontal.value=vertical.value='0'; draw(); }
  function release() {
    generation++; picture=null; drag=null;
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL=null; input.value=''; apply.disabled=true;
  }
  dialog.addEventListener('close',release);
  document.querySelector('#photo-editor-close').onclick=()=>dialog.close();
  document.querySelector('#photo-reset').onclick=reset;
  ratio.onchange=reset;
  [zoom,horizontal,vertical].forEach(control=>control.addEventListener('input',draw));

  input.addEventListener('change',async()=>{
    const file=input.files[0]; if(!file)return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size>2*1024*1024) {
      say('Gunakan PNG, JPG, atau WebP maksimal 2 MB.'); input.value=''; return;
    }
    release(); const ticket=generation;
    objectURL=URL.createObjectURL(file);
    message.textContent='Memuat gambar…'; ratio.value='1'; reset();
    apply.textContent='Gunakan gambar'; dialog.showModal();
    ctx.clearRect(0,0,canvas.width,canvas.height);
    const image=new Image(); image.src=objectURL;
    try {
      await image.decode(); if(ticket!==generation||!dialog.open)return;
      picture=image; reset(); apply.disabled=false;
      message.textContent='Pratinjau menunjukkan hasil potongan. File asli tetap utuh.';
    } catch {
      if(ticket===generation) message.textContent='Gambar gagal dibaca. Tutup dan pilih file gambar lain.';
    }
  });
  canvas.addEventListener('pointerdown',event=>{
    if(!picture)return;
    const r=cropRect();
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,h:Number(horizontal.value),v:Number(vertical.value),r};
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove',event=>{
    if(!drag||drag.id!==event.pointerId)return;
    const bounds=canvas.getBoundingClientRect(),r=drag.r;
    const dx=picture.naturalWidth-r.width,dy=picture.naturalHeight-r.height;
    const clamp=n=>Math.min(1,Math.max(-1,n));
    if(dx>0) horizontal.value=String(clamp(drag.h-2*(event.clientX-drag.x)*r.width/bounds.width/dx));
    if(dy>0) vertical.value=String(clamp(drag.v-2*(event.clientY-drag.y)*r.height/bounds.height/dy));
    draw();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>canvas.addEventListener(name,()=>{drag=null;}));
  apply.onclick=async()=>{
    if(!picture||apply.disabled)return;
    const ticket=generation, r=cropRect();
    apply.disabled=true; apply.textContent='Memproses…';
    try {
      const output=document.createElement('canvas'),scale=Math.min(1,1200/Math.max(r.width,r.height));
      output.width=Math.max(1,Math.round(r.width*scale)); output.height=Math.max(1,Math.round(r.height*scale));
      const context=output.getContext('2d');context.imageSmoothingQuality='high';
      context.drawImage(picture,r.x,r.y,r.width,r.height,0,0,output.width,output.height);
      let blob;
      for(const quality of [0.94,0.86,0.76,0.65]){
        blob=await new Promise(resolve=>output.toBlob(resolve,'image/webp',quality));
        if(blob&&blob.size<=2000000)break;
      }
      if(!blob||blob.size>2000000)throw Error('Hasil gambar terlalu besar. Pilih potongan atau gambar lain.');
      const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
      if(ticket!==generation||!dialog.open)return;
      form.elements.image.value=data; preview(); dialog.close();
      say('Foto sudah disesuaikan. Klik Tambah menu atau Simpan perubahan untuk menyimpan produk.');
    } catch(error) {
      if(ticket===generation)message.textContent=error.message||'Foto gagal diproses. Silakan coba lagi.';
    } finally {
      if(ticket===generation){apply.disabled=false;apply.textContent='Gunakan gambar';}
    }
  };
})();
