import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSidepanelBilling} from '../src/sidepanel-billing.js';

const base={available:true,tier:'trial',fullAccess:true,trialEndsAt:Date.now()+604800000,offerEndsAt:Date.now()+604800000,price:{amount:1290,originalAmount:1999},platforms:[],suggestedPlatforms:[],purchaseStatus:'none',hasPurchase:false};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
async function fixture({tier='trial',locale='zh',redeemFails=false,statusFails=false,viewOverrides={}}={}){
 const dom=new JSDOM('<button id="trigger">Pro</button><div id="settings"></div>',{url:'https://extension.test/sidepanel.html',pretendToBeVisual:true});const w=dom.window; w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','')};w.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');this.dispatchEvent(new w.Event('close'))};
 let view={...base,tier,fullAccess:tier==='pro'||tier==='trial',needsPlatformChoice:tier==='free',...viewOverrides};const requests=[],listeners=[];
 const chrome={runtime:{getURL:path=>`https://extension.test/${path}`,onMessage:{addListener:fn=>listeners.push(fn)},async sendMessage(m){requests.push(m);if(m.action==='redeem'){if(redeemFails)return {ok:false};view={...view,tier:'pro',fullAccess:true,hasPurchase:false};return {ok:true,view}}if(m.action==='checkout'){view={...view,hasPurchase:true,purchaseStatus:'pending'}}if(m.action==='purchase-status'&&statusFails)return {ok:false};if(m.action==='purchase-status')view={...view,tier:'pro',fullAccess:true,hasPurchase:false,purchaseStatus:'none'};if(m.action==='platforms')view={...view,platforms:m.platforms,needsPlatformChoice:false};return {ok:true,view}}}};
 const openedPages=[];
 const billing=createSidepanelBilling({document:w.document,chrome,locale,onOpenPage:page=>{openedPages.push('license');w.document.body.append(page)}});await billing.ready;billing.mountSettings(w.document.querySelector('#settings'));
 const click=label=>{const b=[...w.document.querySelectorAll('button')].find(n=>n.textContent===label);assert.ok(b,label);b.click();return b};
 return {dom,w,billing,requests,click,listeners,openedPages};
}

test('upgrade is dismissible and shows authoritative lifetime pricing in both languages',async()=>{
 for(const locale of ['zh','en']){const f=await fixture({locale});try{f.w.document.querySelector('#trigger').focus();f.billing.open();assert.match(f.w.document.querySelector('.billing-page').textContent,/12.90/);assert.match(f.w.document.querySelector('s').textContent,/19.99/);f.click(locale==='zh'?'继续免费使用':'Continue for free');assert.equal(f.w.document.querySelector('dialog'),null);assert.equal(f.w.document.activeElement.id,'trigger')}finally{f.dom.window.close()}}
});

function mountEntry(f) {
 const entry=f.w.document.createElement('section');entry.className='settings-pro-entry';f.w.document.body.append(entry);f.billing.mountSettingsEntry(entry);return entry;
}

test('the localized settings card opens the existing paywall without starting checkout',async()=>{
 for(const locale of ['zh','en'])for(const tier of ['free','trial']){
  const f=await fixture({locale,tier});
  try{
   const entry=mountEntry(f);const action=entry.querySelector('button');
   assert.equal(entry.hidden,false);
   assert.equal(entry.querySelector('.settings-pro-status').hidden,tier!=='trial');
   assert.equal(entry.querySelector('img').src,'https://extension.test/icons/pro-entry-star.svg');
   assert.equal(entry.querySelector('img').alt,'');
   assert.doesNotMatch(entry.textContent,/12\.90|19\.99/);
   assert.equal(action.textContent,locale==='zh'?'了解 Pro':'Explore Pro');
   action.focus();action.click();
   assert.ok(f.w.document.querySelector('.billing-page'));
   assert.match(f.w.document.querySelector('.billing-price').textContent,/12.90/);
   assert.equal(f.requests.some(r=>r.action==='checkout'),false);
   f.w.document.querySelector('.billing-header .window-settings-back').click();
   assert.equal(f.w.document.activeElement,action);
  }finally{f.dom.window.close()}
 }
});

test('an unfinished order opens pricing directly without automatic payment confirmation',async()=>{
 const f=await fixture({statusFails:true,viewOverrides:{hasPurchase:true,purchaseStatus:'pending'}});
 try{
  const entry=mountEntry(f); const action=entry.querySelector('button'); action.focus(); action.click(); await tick();
  assert.equal(f.w.document.querySelector('.billing-page').dataset.screen,'upgrade');
  assert.equal(f.requests.some(r=>r.action==='purchase-status'),false);
  assert.equal(f.requests.some(r=>r.action==='checkout'),false);
  assert.equal(f.w.document.querySelector('[role=alert]'),null);
  f.w.document.querySelector('.billing-plan-pro .billing-action').click();await tick();
  assert.equal(f.requests.filter(r=>r.action==='checkout').length,1);
  assert.equal(f.requests.some(r=>r.action==='purchase-status'),false);
  assert.equal(f.w.document.querySelector('.billing-page').dataset.screen,'upgrade');
 }finally{f.dom.window.close()}
});

test('license updates keep the settings card visible and switch between member details and purchase',async()=>{
 const f=await fixture({tier:'pro'});
 try{
  const entry=mountEntry(f);const action=entry.querySelector('button');
  assert.equal(entry.hidden,false);
  assert.equal(entry.querySelector('.settings-pro-title').textContent,'Polaris Pro');
  assert.equal(action.textContent,'查看会员信息');
  action.click();
  assert.ok(f.openedPages.length >= 1);assert.ok(f.w.document.querySelector('.billing-page'));
  assert.equal(f.w.document.querySelector('dialog'),null);
  for(const update of [
   {...base,tier:'trial'},
   {...base,tier:'free',hasPurchase:true,purchaseStatus:'failed'},
   {...base,tier:'unavailable',available:false,unavailable:true,price:null}
  ]){
   for(const listener of f.listeners)listener({type:'POLARIS_BILLING_UPDATED',view:update});
   assert.equal(entry.hidden,false);
   assert.equal(entry.querySelector('button'),action);
   assert.equal(action.textContent,'了解 Pro');
  }
  action.click();
  assert.ok(f.w.document.querySelector('.billing-page'));
  assert.equal(f.w.document.querySelector('.billing-plan-pro .billing-price'),null);
  assert.equal(f.requests.some(r=>r.action==='checkout'),false);
 }finally{f.dom.window.close()}
});

test('purchase opens through the background, and confirmed activation is required for success',async()=>{
 const f=await fixture();try{f.billing.open();f.click('以 $12.90 买断');await tick();assert.equal(f.requests.filter(r=>r.action==='checkout').length,1);assert.equal(f.w.document.querySelector('.billing-page').dataset.screen,'upgrade');assert.doesNotMatch(f.w.document.querySelector('.billing-title').textContent,/已激活/);f.click('我已付款，查看进度');await tick();assert.match(f.w.document.querySelector('.billing-title').textContent,/Pro 已激活/)}finally{f.dom.window.close()}
});

test('redemption errors preserve the license for correction; successful redemption clears it',async()=>{
 const f=await fixture({redeemFails:true});try{f.billing.open('redeem');const input=f.w.document.querySelector('input');input.value='bad-license';f.w.document.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(f.w.document.querySelector('input').value,'bad-license');assert.ok(f.w.document.querySelector('[role=alert]'));}finally{f.dom.window.close()}
 const ok=await fixture();try{ok.billing.open('redeem');ok.w.document.querySelector('input').value='POL-TEST';ok.w.document.querySelector('form').dispatchEvent(new ok.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(ok.w.document.querySelector('.billing-title').textContent,/已激活/);ok.billing.open('redeem');assert.equal(ok.w.document.querySelector('input').value,'')}finally{ok.dom.window.close()}
});

test('recovery shows a generic confirmation and the free plan requires exactly two platforms',async()=>{
 const f=await fixture({tier:'free'});try{f.billing.open('recover');f.w.document.querySelector('input').value='buyer@example.com';f.w.document.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.match(f.w.document.querySelector('.billing-page .billing-copy').textContent,/如果此邮箱/);f.billing.open('platforms');f.click('ChatGPT');f.click('Claude');f.click('Gemini');assert.equal(f.w.document.querySelectorAll('[aria-pressed=true]').length,2);f.click('使用这两个平台');await tick();assert.equal(f.w.document.querySelector('dialog'),null);assert.deepEqual(f.requests.find(r=>r.action==='platforms').platforms,['chatgpt','claude'])}finally{f.dom.window.close()}
});

test('automatic upgrade is skipped for Pro; free platform choice only appears on next open',async()=>{
 const pro=await fixture({tier:'pro'});try{await pro.billing.afterOnboarding();assert.equal(pro.w.document.querySelector('dialog'),null)}finally{pro.dom.window.close()}
 const free=await fixture({tier:'free'});try{assert.equal(free.w.document.querySelector('dialog'),null);await free.billing.initialPrompt();assert.match(free.w.document.querySelector('.billing-title').textContent,/两个平台/)}finally{free.dom.window.close()}
});

test('license settings remain usable immediately after redemption or payment activation',async()=>{
 for(const flow of ['redeem','purchase']){
  const f=await fixture();
  try{
   f.billing.open(flow==='redeem'?'redeem':'upgrade');
   if(flow==='redeem'){
    f.w.document.querySelector('input').value='POL-TEST';
    f.w.document.querySelector('form').dispatchEvent(new f.w.Event('submit',{bubbles:true,cancelable:true}));
   }else{
    f.click('以 $12.90 买断');await tick();f.click('我已付款，查看进度');
   }
   await tick();f.click('返回 Polaris');
   assert.equal(f.w.document.querySelector('dialog'),null);
   const settingsButtons=[...f.w.document.querySelectorAll('#settings button')];
   assert.ok(settingsButtons.length>0);
   assert.ok(settingsButtons.every(button=>!button.disabled),flow);
   f.click('停用本设备');
   assert.match(f.w.document.querySelector('dialog .billing-title').textContent,/停用这台设备/);
  }finally{f.dom.window.close()}
 }
});


test('pending and paid orders remain recoverable without pricing; opening never starts another order', async()=>{
 for(const status of ['pending','paid']) {
  const f=await fixture({viewOverrides:{price:null,hasPurchase:true,purchaseStatus:status}});
  try { f.billing.open(); f.billing.open();
   assert.equal(f.w.document.querySelectorAll('.billing-page').length,1);
   assert.ok([...f.w.document.querySelectorAll('.billing-page button')].some(b=>b.textContent===(status==='paid'?'重试激活':'继续付款')));
   assert.equal(f.requests.some(r=>r.action==='checkout'),false);
   assert.equal(f.w.document.querySelector('dialog'),null);
  }finally{f.dom.window.close()}
 }
});

test('expired offer uses authoritative full price and trial does not end when dismissed',async()=>{
 const f=await fixture({viewOverrides:{price:{amount:1999,originalAmount:1999}}});
 try{f.billing.open(); assert.equal(f.w.document.querySelector('s'),null); assert.equal(f.w.document.querySelector('.billing-offer'),null);
 f.click('继续免费使用');assert.equal(f.billing.getView().tier,'trial');assert.equal(f.w.document.querySelector('.billing-page'),null);
 assert.equal(f.requests.some(r=>r.action==='checkout'),false);
 }finally{f.dom.window.close()}
});

test('background refresh preserves entered license and focus; deactivation stays a separate confirmation',async()=>{
 const f=await fixture();
 try{f.billing.open('redeem'); const input=f.w.document.querySelector('[name=license]');input.value='POL-EDIT';input.focus();input.setSelectionRange(3,5);
 f.listeners.forEach(fn=>fn({type:'POLARIS_BILLING_UPDATED',view:{...base,offerEndsAt:base.offerEndsAt+1}}));
 assert.equal(f.w.document.activeElement.value,'POL-EDIT');assert.equal(f.w.document.activeElement.selectionStart,3);
 f.billing.open('deactivate');assert.ok(f.w.document.querySelector('dialog[open]'));assert.ok(f.w.document.querySelector('.billing-page'));
 f.click('保留激活');assert.equal(f.w.document.querySelector('dialog'),null);
 }finally{f.dom.window.close()}
});

test('closing card buys once and uses server prices in both languages',async()=>{
 for(const locale of ['zh','en']){
  const f=await fixture({locale});
  try{f.billing.open();const card=f.w.document.querySelector('.billing-closing');
   assert.match(card.textContent,/12\.90/);assert.match(card.querySelector('button').textContent,locale==='zh'?/立即购买/:/Buy now/);
   card.querySelector('button').click();card.querySelector('button').click();await tick();
   assert.equal(f.requests.filter(r=>r.action==='checkout').length,1);
  }finally{f.dom.window.close()}
 }
});

test('closing card respects pending purchases, missing pricing and active licenses',async()=>{
 for(const [overrides,label] of [
  [{hasPurchase:true,purchaseStatus:'pending',price:null},'继续付款'],
  [{hasPurchase:true,purchaseStatus:'paid'},'重试激活'],
  [{price:null},'重试连接'],
  [{tier:'pro'},'返回 Polaris']
 ]){const f=await fixture({viewOverrides:overrides});try{
  f.billing.open();assert.equal(f.w.document.querySelector('.billing-closing-buy').textContent,label);
  assert.equal(f.requests.some(r=>r.action==='checkout'),false);
 }finally{f.dom.window.close()}}
});

test('plan selector switches visible cards without starting checkout', async () => {
 const f = await fixture();
 try {
  f.billing.open();
  const d = f.w.document;
  assert.equal(d.querySelector('.billing-plan-pro').hidden, false);
  assert.equal(d.querySelector('.billing-plan-free').hidden, true);
  d.querySelector('input[name="billing-plan"][value="free"]').click();
  assert.equal(d.querySelector('.billing-plan-pro').hidden, true);
  assert.equal(d.querySelector('.billing-plan-free').hidden, false);
  assert.equal(f.requests.some(r => r.action === 'checkout'), false);
  d.querySelector('input[name="billing-plan"][value="pro"]').click();
  assert.equal(d.querySelector('.billing-plan-pro').hidden, false);
 } finally { f.dom.window.close(); }
});

test('trial banner uses server clock offset and updates without resetting plan focus', async t => {
 let now = 1800000000000;
 t.mock.method(Date, 'now', () => now);
 const offset = 3600000;
 const trialEndsAt = now + offset + (2 * 1440 + 3 * 60 + 4) * 60000;
 const f = await fixture({locale:'en', viewOverrides:{clockOffset:offset, trialEndsAt}});
 try {
  f.billing.open();
  const d = f.w.document;
  const banner = d.querySelector('.billing-trial');
  assert.equal(d.querySelector('.billing-header').nextElementSibling, banner);
  assert.match(banner.querySelector('[role=timer]').getAttribute('aria-label'), /2 days, 3 hours, 4 minutes/);
  assert.match(d.querySelector('.billing-trial-details').textContent, /No automatic charge/);
  const choice = d.querySelector('input[name="billing-plan"][value="free"]');
  choice.click(); choice.focus();
  now += 60000;
  f.w.dispatchEvent(new f.w.Event('focus')); await tick();
  assert.match(banner.querySelector('[role=timer]').getAttribute('aria-label'), /2 days, 3 hours, 3 minutes/);
  assert.equal(d.activeElement, choice);
  assert.equal(d.querySelector('.billing-plan-free').hidden, false);
  now = trialEndsAt - offset;
  f.w.dispatchEvent(new f.w.Event('focus')); await tick();
  assert.equal(banner.hidden, true);
  assert.equal(d.querySelector('.billing-trial-details').hidden, true);
  assert.equal(f.requests.some(r => r.action === 'checkout'), false);
 } finally { f.dom.window.close(); }
});

test('trial banner is absent for Free, Pro and license forms; expired or invalid deadlines stay hidden', async () => {
 for (const tier of ['free','pro']) {
  const f = await fixture({tier});
  try { f.billing.open(); assert.equal(f.w.document.querySelector('.billing-trial'),null); }
  finally { f.dom.window.close(); }
 }
 for (const trialEndsAt of [Date.now()-1,'invalid']) {
  const f = await fixture({viewOverrides:{trialEndsAt}});
  try { f.billing.open(); assert.equal(f.w.document.querySelector('.billing-trial').hidden,true); }
  finally { f.dom.window.close(); }
 }
 const f = await fixture();
 try { f.billing.open('redeem'); assert.equal(f.w.document.querySelector('.billing-trial'),null); }
 finally { f.dom.window.close(); }
});
