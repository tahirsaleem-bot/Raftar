const path=require('path');require('dotenv').config({path:'C:/Raftar/ai-agent-starter/.env'});
const puppeteer=require('C:/Raftar/ai-agent-starter/node_modules/puppeteer');
(async()=>{const b=await puppeteer.launch({headless:'new',userDataDir:'C:/Raftar/ai-agent-starter/.markaz_session',args:['--no-sandbox']});
const p=await b.newPage();await p.goto('https://markaz.taleemabad.com/my-profile',{waitUntil:'networkidle2'});
const s=await p.evaluate(()=>[...document.scripts].map(s=>s.src).filter(s=>s.includes('markaz.taleemabad.com')));
for(const u of s){let t='';try{t=await p.evaluate(async u=>(await fetch(u)).text(),u)}catch{continue}
for(const re of [/auth\/login/g,/api\/resume\//g,/config\/endpoints/g]){let m;let n=0;while((m=re.exec(t))&&n<2){n++;console.log('---',re.source,'\n',t.slice(Math.max(0,m.index-400),m.index+300).replace(/\s+/g,' '))}}}
await b.close()})();
