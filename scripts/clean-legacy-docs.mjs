// Only superseded patch instructions are removed. No app/SQL/data/Git files.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(!fs.existsSync(path.join(root,'pos/app.js')))throw Error('Jalankan dari proyek Maniac Duren.');
for(let version=18;version<=27;version++){
 const file='PATCH-'+String(version).padStart(3,'0')+'.md';
 if(fs.existsSync(path.join(root,file))){fs.unlinkSync(path.join(root,file));console.log('Dihapus: '+file);}
}
