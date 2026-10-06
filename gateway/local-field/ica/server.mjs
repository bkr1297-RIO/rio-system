import { createServer } from 'node:http';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { renderICA } from './surface.mjs';
const secret=()=>randomBytes(32).toString('hex');
const same=(a,b)=>{
 if(typeof a!=='string')return false;
 const left=Buffer.from(a),right=Buffer.from(b);
 return left.length===right.length&&timingSafeEqual(left,right);
};
export async function startICAHost({reference,port=0}){
 if(!reference?.journey||!Number.isInteger(port)||port<0||port>65535)throw new Error('REFERENCE_HOST_OPTIONS');
 const access_token=secret(),session=secret(),csrf=secret();let url;
 const server=createServer(async(req,res)=>{
  let authenticated=false;
  const send=(status,body='',type='text/plain; charset=utf-8',headers={})=>{res.writeHead(status,{'content-type':type,'cache-control':'no-store',
   'content-security-policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'x-content-type-options':'nosniff',
   'referrer-policy':'no-referrer',...headers});res.end(body);};
  try{
   if(req.headers.host!==new URL(url).host)return send(403,'This reference host accepts its loopback address only.');
   const requestURL=new URL(req.url,url);
   if(req.method==='GET'&&requestURL.pathname==='/enter'){
    if(!same(requestURL.searchParams.get('key'),access_token))return send(401,'The local reference access key is required.');
    return send(303,'','text/plain',{'location':'/','set-cookie':`ica_session=${session}; HttpOnly; SameSite=Strict; Path=/`});
   }
   const cookie=(req.headers.cookie??'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ica_session='))?.slice(12);
   if(!same(cookie,session))return send(401,'Open the private local reference entry link printed by the launcher.');
   authenticated=true;
   if(req.method==='GET'&&requestURL.pathname==='/')return send(200,renderICA(reference.journey.view(),csrf),'text/html; charset=utf-8');
   if(req.method==='GET'&&requestURL.pathname==='/account.json')return send(200,JSON.stringify(reference.journey.view(),null,2),'application/json; charset=utf-8');
   if(req.method!=='POST'||requestURL.pathname!=='/command')return send(404,'No such reference control.');
   if(req.headers.origin!==url||req.headers['sec-fetch-site']==='cross-site')return send(403,'Use this reference session’s own controls.');
   if(!/^application\/x-www-form-urlencoded(?:;.*)?$/.test(req.headers['content-type']??''))return send(400,'A native bounded form is required.');
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>4096)return send(413,'The bounded form is too large.');chunks.push(chunk);}
   const data=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
   if([...data.keys()].sort().join(',')!=='action,csrf,expected_revision,request_id')return send(400,'Only the declared control fields are accepted.');
   if(!same(data.get('csrf'),csrf))return send(403,'The control belongs to another session.');
   if(!/^(0|[1-9]\d*)$/.test(data.get('expected_revision')??''))return send(400,'A current journey revision is required.');
   try{reference.journey.dispatch({action:data.get('action'),request_id:data.get('request_id'),expected_revision:Number(data.get('expected_revision'))});}
   catch(error){if(/REPLAYED_COMMAND|STALE_JOURNEY|COMMAND_NOT_AVAILABLE/.test(error.message))return send(409,renderICA(reference.journey.view(),csrf,{message:'That choice is no longer current. It was not repeated. Use the available controls in this account.'}),'text/html; charset=utf-8');throw error;}
   return send(303,'','text/plain',{'location':'/'});
  }catch(error){
   if(!authenticated)return send(400,'The reference request is malformed. Open the private local entry link.');
   let html;try{html=renderICA(reference.journey.view(),csrf,{message:'This reference step could not be completed. The current attributable account is shown; no result is inferred from this error.'});}
   catch{return send(500,'The current account could not be reconstructed. This error establishes no outcome.');}
   return send(500,html,'text/html; charset=utf-8');
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 url=`http://127.0.0.1:${server.address().port}`;
 return {url,access_token,close:()=>new Promise((resolve,reject)=>{server.close(error=>error?reject(error):resolve());server.closeIdleConnections();})};
}
