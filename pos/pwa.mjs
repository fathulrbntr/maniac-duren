let installPrompt;
export function installButton() { return '<button type="button" id="install-pos" hidden>Install POS</button>'; }
export function bindInstall() {
  const b=document.querySelector('#install-pos');if(!b)return;
  b.hidden=!installPrompt;
  b.onclick=async()=>{if(!installPrompt)return;await installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;bindInstall();};
}
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;bindInstall();});
window.addEventListener('appinstalled',()=>{installPrompt=null;bindInstall();});
export async function startPWA() {
  if(!('serviceWorker' in navigator))return false;
  try {await navigator.serviceWorker.register('/pos/sw.js',{scope:'/pos/',updateViaCache:'none'});return true;}
  catch {return false;}
}
