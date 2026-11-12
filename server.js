"use strict";
const http=require("http"),fs=require("fs"),path=require("path"),crypto=require("crypto"),readline=require("readline");
const DATA=process.env.DATA_DIR||"/data",PORT=+process.env.PORT||8080,SHARED=process.env.SHARED==="true";
const SITE=path.join(__dirname,"site"),DAYS=30,DAY=864e5;
fs.mkdirSync(path.join(DATA,"boxes"),{recursive:true});
const UF=path.join(DATA,"users.json"),SF=path.join(DATA,"secret");
const readJson=(f,d)=>{try{return JSON.parse(fs.readFileSync(f,"utf8"))}catch{return d}};
const writeJson=(f,o)=>{const t=f+".tmp";fs.writeFileSync(t,JSON.stringify(o),{mode:0o600});fs.renameSync(t,f)};
const users=()=>readJson(UF,{});
let SECRET;try{SECRET=fs.readFileSync(SF)}catch{SECRET=crypto.randomBytes(32);fs.writeFileSync(SF,SECRET,{mode:0o600})}
const str=(v,n)=>typeof v==="string"?v.slice(0,n):"";

// ---- Kodeord (scrypt) og sessions (signeret cookie) ----
const hash=(pw,salt=crypto.randomBytes(16).toString("hex"))=>salt+":"+crypto.scryptSync(pw,salt,64).toString("hex");
const DUMMY={hash:hash("dummy")};
function verify(pw,rec){const[s,k]=(rec||DUMMY).hash.split(":");const a=crypto.scryptSync(pw,s,64);return crypto.timingSafeEqual(a,Buffer.from(k,"hex"))&&!!rec}
const sign=s=>crypto.createHmac("sha256",SECRET).update(s).digest("base64url");
const mk=u=>{const p=Buffer.from(JSON.stringify({u,e:Date.now()+DAYS*DAY})).toString("base64url");return p+"."+sign(p)};
function session(req){
  const m=/(?:^|;\s*)pl_session=([^;]+)/.exec(req.headers.cookie||"");if(!m)return null;
  const[p,s]=m[1].split(".");if(!p||!s)return null;
  const a=Buffer.from(sign(p)),b=Buffer.from(s);if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null;
  try{const o=JSON.parse(Buffer.from(p,"base64url"));return o.e>Date.now()&&users()[o.u]?o:null}catch{return null}
}
const sha=s=>crypto.createHash("sha256").update(s).digest("hex");
function bearer(req){
  const m=/^Bearer (\S+)$/.exec(req.headers.authorization||"");if(!m)return null;
  const h=Buffer.from(sha(m[1]));
  for(const[n,r]of Object.entries(users()))if(r.token){const t=Buffer.from(r.token);if(t.length===h.length&&crypto.timingSafeEqual(t,h))return{u:n}}
  return null;
}
const cookie=(req,v,age)=>`pl_session=${v}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}`+(req.headers["x-forwarded-proto"]==="https"?"; Secure":"");

// ---- Begrænsning af loginforsøg ----
const fails=new Map();
const ipOf=r=>r.headers["cf-connecting-ip"]||r.headers["x-real-ip"]||(r.headers["x-forwarded-for"]||"").split(",")[0].trim()||r.socket.remoteAddress;
const limited=(k,m)=>{const f=fails.get(k);return !!f&&f.t>Date.now()&&f.n>=m};
const fail=k=>{const f=fails.get(k);if(f&&f.t>Date.now())f.n++;else fails.set(k,{n:1,t:Date.now()+9e5})};
setInterval(()=>{for(const[k,f]of fails)if(f.t<Date.now())fails.delete(k)},6e5).unref();

// ---- Lager: én JSON-fil pr. bruger i /data/boxes ----
const dfile=u=>path.join(DATA,"boxes",(SHARED?"shared":u)+".json");
function clean(c){
  if(!c||!/^b[0-9a-z]{3,40}$/.test(c.id))return null;
  if(c.deleted)return{id:c.id,deleted:true};
  if(!Array.isArray(c.entries)||c.entries.length!==6)return null;
  const o={id:c.id,name:str(c.name,120),ref:str(c.ref,120),marks:Array.from({length:6},(_,i)=>{const m=Array.isArray(c.marks)&&c.marks[i];return m&&isFinite(m.x)&&isFinite(m.y)?{x:Math.min(1,Math.max(0,+m.x)),y:Math.min(1,Math.max(0,+m.y))}:null}),entries:c.entries.map(e=>({fn:str(e&&e.fn,40),cable:str(e&&e.cable,80),note:str(e&&e.note,200)}))};
  if(typeof c.photo==="string"&&c.photo.startsWith("data:image/jpeg;base64,")&&c.photo.length<2e6)o.photo=c.photo;
  return o;
}
const body=req=>new Promise((res,rej)=>{let n=0;const c=[];
  req.on("data",d=>{n+=d.length;if(n>12e6){rej(new Error("for stor"));req.destroy()}else c.push(d)});
  req.on("end",()=>{try{res(JSON.parse(Buffer.concat(c).toString()||"{}"))}catch(e){rej(e)}});req.on("error",rej)});
const send=(res,code,obj,h={})=>{res.writeHead(code,{"Content-Type":"application/json","Cache-Control":"no-store",...h});res.end(JSON.stringify(obj))};

async function sync(req,res,s){
  const b=await body(req),f=dfile(s.u),db=readJson(f,{rev:0,boxes:{}}),since=+b.since||0,mine=new Set(),bad=[];
  for(const c of(Array.isArray(b.changes)?b.changes:[]).slice(0,200)){const o=clean(c);if(!o){bad.push(String(c&&c.id).slice(0,60));console.log("Afvist dåse fra "+s.u+":",c&&c.id);continue}o.rev=++db.rev;db.boxes[o.id]=o;mine.add(o.id)}
  writeJson(f,db);
  const h={};if(s.e-Date.now()<15*DAY)h["Set-Cookie"]=cookie(req,mk(s.u),DAYS*86400);
  send(res,200,{rev:db.rev,rejected:bad,boxes:Object.values(db.boxes).filter(x=>x.rev>since&&!mine.has(x.id))},h);
}

// ---- Eksport til andre programmer ----
const live=u=>Object.values(readJson(dfile(u),{boxes:{}}).boxes).filter(b=>!b.deleted).sort((a,b)=>(a.name||"").localeCompare(b.name||"","da"));
const csvq=v=>{v=String(v??"");return /[";\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v};
function exportData(req,res,u,url){
  const q=url.searchParams,boxes=live(u),host=(req.headers["x-forwarded-proto"]||"http")+"://"+req.headers.host;
  if(q.get("format")==="csv"){
    const rows=[["daase","op_mod","position","funktion","kabel","note","foto_x","foto_y"]];
    for(const b of boxes)b.entries.forEach((e,i)=>{if(e.fn||e.cable||e.note){const m=b.marks&&b.marks[i];rows.push([b.name,b.ref,i+1,e.fn,e.cable,e.note,m?m.x:"",m?m.y:""])}});
    res.writeHead(200,{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="pl-daase.csv"',"Cache-Control":"no-store"});
    return res.end("\uFEFF"+rows.map(r=>r.map(csvq).join(";")).join("\r\n")+"\r\n");
  }
  const out={exported:new Date().toISOString(),user:u,
    layout:"Positionerne er målt, som man står under dåsen med ansigtet mod ref: 1-3 er indføringerne foran en (venstre mod højre), 4-6 er bag en (venstre mod højre). marker er placeringen på billedet som brøkdel af bredde (x, fra venstre) og højde (y, fra toppen), eller null.",
    boxes:boxes.map(b=>({id:b.id,name:b.name,ref:b.ref,
      entries:b.entries.map((e,i)=>({position:i+1,function:e.fn,cable:e.cable,note:e.note,marker:(b.marks&&b.marks[i])||null})),
      photo_url:b.photo?host+"/api/photo/"+b.id:null,...(q.get("photos")==="1"&&b.photo?{photo:b.photo}:{})}))};
  const h={"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"};
  if(q.get("download")==="1")h["Content-Disposition"]='attachment; filename="pl-daase.json"';
  res.writeHead(200,h);res.end(JSON.stringify(out,null,2));
}
function photo(res,u,id){
  const b=live(u).find(x=>x.id===id);
  if(!b||!b.photo){res.writeHead(404);return res.end()}
  res.writeHead(200,{"Content-Type":"image/jpeg","Cache-Control":"private, max-age=300"});
  res.end(Buffer.from(b.photo.split(",")[1],"base64"));
}

// ---- Statiske filer ----
const MIME={".html":"text/html; charset=utf-8",".js":"text/javascript",".webmanifest":"application/manifest+json",".png":"image/png"};
function serve(req,res){
  let p=decodeURIComponent(new URL(req.url,"http://x").pathname);if(p.endsWith("/"))p+="index.html";
  const f=path.join(SITE,p);
  if(!f.startsWith(SITE+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);return res.end("Ikke fundet")}
  const e=path.extname(f);
  res.writeHead(200,{"Content-Type":MIME[e]||"application/octet-stream","Cache-Control":e===".png"?"public, max-age=86400":"no-cache"});
  fs.createReadStream(f).pipe(res);
}

// ---- Brugeradministration (kommandolinje) ----
function ask(q){return new Promise(r=>{const rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:true});
  rl._writeToOutput=s=>{if(!rl.m)process.stdout.write(s)};rl.question(q,a=>{rl.close();console.log();r(a)});rl.m=true})}
async function cli(cmd,name){
  const us=users();
  if(cmd==="users"){console.log(Object.keys(us).join("\n")||"(ingen brugere)");return}
  name=(name||"").trim().toLowerCase();
  if(!/^[a-z0-9._-]{2,32}$/.test(name)){console.log("Brug: adduser|deluser|token|notoken <navn> | users  (navn: 2-32 tegn, a-z 0-9 . _ -)");return}
  if(cmd==="deluser"){delete us[name];writeJson(UF,us);console.log("Slettet: "+name);return}
  if(cmd==="adduser"){const pw=await ask("Kodeord (min. 10 tegn): ");if(pw.length<10){console.log("For kort.");return}
    us[name]={...us[name],hash:hash(pw)};writeJson(UF,us);console.log("Gemt: "+name);return}
  if(cmd==="token"){if(!us[name]){console.log("Ukendt bruger: "+name);return}
    const t="pl_"+crypto.randomBytes(24).toString("base64url");us[name].token=sha(t);writeJson(UF,us);
    console.log("Token til "+name+" (vises kun nu - gem det et sikkert sted):\n"+t);return}
  if(cmd==="notoken"){if(us[name]){delete us[name].token;writeJson(UF,us)}console.log("Token fjernet for "+name);return}
  console.log("Ukendt kommando");
}

if(process.argv[2]){cli(process.argv[2],process.argv[3]).then(()=>process.exit(0))}
else http.createServer(async(req,res)=>{
  res.setHeader("X-Content-Type-Options","nosniff");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Content-Security-Policy","default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try{
    const u=req.url.split("?")[0];
    if(u.startsWith("/api/")){
      if(req.method==="POST"&&req.headers["x-pl"]!=="1")return send(res,403,{error:"Forbudt"});
      if(u==="/api/login"&&req.method==="POST"){
        const b=await body(req),name=str(b.username,40).trim().toLowerCase(),ip=ipOf(req),ik="ip:"+ip,nk=ik+"|"+name;
        if(limited(ik,15)||limited(nk,6))return send(res,429,{error:"For mange forsøg. Prøv igen om 15 minutter."});
        if(!verify(str(b.password,200),users()[name])){fail(ik);fail(nk);return send(res,401,{error:"Forkert brugernavn eller kodeord"})}
        fails.delete(ik);fails.delete(nk);
        return send(res,200,{user:name},{"Set-Cookie":cookie(req,mk(name),DAYS*86400)});
      }
      if(u==="/api/logout"&&req.method==="POST")return send(res,200,{ok:1},{"Set-Cookie":cookie(req,"",0)});
      if(req.method==="GET"&&(u==="/api/export"||u.startsWith("/api/photo/"))){
        const ik="ip:"+ipOf(req);
        if(limited(ik,15))return send(res,429,{error:"For mange forsøg"});
        const w=session(req)||bearer(req);
        if(!w){if(req.headers.authorization)fail(ik);return send(res,401,{error:"Ikke logget ind"})}
        if(u==="/api/export")return exportData(req,res,w.u,new URL(req.url,"http://x"));
        return photo(res,w.u,u.slice(11));
      }
      const s=session(req);if(!s)return send(res,401,{error:"Ikke logget ind"});
      if(u==="/api/me"&&req.method==="GET")return send(res,200,{user:s.u});
      if(u==="/api/sync"&&req.method==="POST")return await sync(req,res,s);
      return send(res,404,{error:"Ukendt"});
    }
    if(req.method!=="GET"&&req.method!=="HEAD"){res.writeHead(405);return res.end()}
    serve(req,res);
  }catch(e){if(!res.headersSent)send(res,400,{error:"Fejl"})}
}).listen(PORT,()=>console.log("PL-dåse kører på port "+PORT+(Object.keys(users()).length?"":" - ingen brugere endnu, kør: docker compose exec pl-daase node server.js adduser <navn>")));
