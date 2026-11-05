const encoder = new TextEncoder();
export const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), n => n.toString(16).padStart(2, '0')).join('');
export async function hash(secret, value) {
 const key = await crypto.subtle.importKey('raw', encoder.encode(secret), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
 return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))), n=>n.toString(16).padStart(2,'0')).join('');
}
export function equal(a,b) { if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0; }
async function cipherKey(secret) {
 const digest=await crypto.subtle.digest('SHA-256',encoder.encode(secret));
 return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);
}
export async function seal(secret,value) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},await cipherKey(secret),encoder.encode(JSON.stringify(value))));
 return btoa(String.fromCharCode(...iv,...encrypted));
}
export async function unseal(secret,value) {
 const bytes=Uint8Array.from(atob(value),c=>c.charCodeAt(0));
 return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await cipherKey(secret),bytes.slice(12))));
}
export async function verifyWebhook(body,header,secret,now=Date.now()) {
 const pairs=(header||'').split(',').map(v=>v.split('='));const timestamp=Number(pairs.find(([k])=>k==='t')?.[1]);
 if(!Number.isSafeInteger(timestamp)||Math.abs(now/1000-timestamp)>300)return false;
 const expected=await hash(secret,`${timestamp}.${body}`);
 return pairs.some(([k,v])=>k==='v1'&&equal(v,expected));
}
