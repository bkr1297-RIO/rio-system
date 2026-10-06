/** Native form driver. No private dispatch, fixed status strings or authority mocks. */
import assert from 'node:assert/strict';
export async function formClient(host){
 const entry=await fetch(`${host.url}/enter?key=${host.access_token}`,{redirect:'manual'});
 assert.equal(entry.status,303);const cookie=entry.headers.get('set-cookie').split(';')[0];
 let html='';
 async function open(){const r=await fetch(host.url,{headers:{cookie}});assert.equal(r.status,200);html=await r.text();return html;}
 async function click(action){
  const form=html.match(new RegExp(`<form[^>]*data-command="${action}"[^>]*>([\\s\\S]*?)</form>`))?.[1];
  assert.ok(form,`Visible ${action} form must exist`);
  const fields=new URLSearchParams([...form.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"/g)].map(m=>[m[1],m[2]]));
  const r=await fetch(`${host.url}/command`,{method:'POST',headers:{cookie,origin:host.url,'content-type':'application/x-www-form-urlencoded'},body:fields,redirect:'manual'});
  assert.equal(r.status,303,await r.text());return open();
 }
 async function account(){const r=await fetch(`${host.url}/account.json`,{headers:{cookie}});assert.equal(r.status,200);return r.json();}
 await open();return {open,click,account,cookie,get html(){return html;}};
}
