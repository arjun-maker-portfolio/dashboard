(() => {
'use strict';
const app = document.getElementById('app');
const stages = {raw:{name:'Raw material',color:'#b58242'},intermediate:{name:'Semi-finished',color:'#61a69a'},finished:{name:'Finished',color:'#245b43'}};
const services = ['Breakfast','Lunch','Dinner'];
const state = {tab:'overview',days:30,stage:'all',service:'all',metric:'litres',chart:'bars',search:''};
let records = [], foods = [], latest = '', chartDays = [], doughnutItems = [];
let pageTransition = null;
let exportTimer = null, layoutCompact = window.innerWidth<=760;
window.addEventListener('resize',()=>{const compact=window.innerWidth<=760;if(compact!==layoutCompact){layoutCompact=compact;if(records.length)render();}});
const n = (v,d=0) => Number(v).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d});
const money = v => '₹' + n(v);
const esc = v => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sum = (arr,fn) => arr.reduce((a,r)=>a+fn(r),0);
const shift = (date,days) => new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const fmtDate = date => new Date(date+'T00:00:00Z').toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:'UTC'});
const icon = name => `<img src="assets/${name}.svg" class="icon" alt="">`;
const amount = (v,metric=state.metric) => metric==='cost'?money(v):n(v,1)+' L';
const value = r => state.metric==='cost'?r.litres*foods[r.food].cost_per_litre:r.litres;
const darkMode=()=>document.documentElement.dataset.theme==='dark';
function syncPalette(){
 Object.assign(stages.raw,{color:darkMode()?'#cf9e61':'#b58242'});
 Object.assign(stages.intermediate,{color:darkMode()?'#75b9ae':'#61a69a'});
 Object.assign(stages.finished,{color:darkMode()?'#88c49b':'#245b43'});
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',darkMode()?'#18201c':'#245b43');
}
function themeButton(){
 const label=darkMode()?'Switch to light mode':'Switch to dark mode';
 return `<button type="button" class="theme-toggle" data-theme-toggle aria-label="${label}" title="${label}">${icon(darkMode()?'sun':'moon')}</button>`;
}
function wireTheme(){
 app.querySelectorAll('[data-theme-toggle]').forEach(button=>button.onclick=()=>{
  pageTransition?.skipTransition();
  document.documentElement.dataset.theme=darkMode()?'light':'dark';
  try{localStorage.setItem('wastewise-theme',document.documentElement.dataset.theme);}catch{}
  syncPalette();
  if(records.length)render();
  else{
   button.outerHTML=themeButton();
   wireTheme();
  }
  app.querySelector('[data-theme-toggle]')?.focus({preventScroll:true});
 });
}
function switchPage(tab){
 if(tab===state.tab)return;
 const order=['overview','foods','service'];
 document.documentElement.style.setProperty('--page-distance',order.indexOf(tab)>order.indexOf(state.tab)?'22px':'-22px');
 pageTransition?.skipTransition();
 state.tab=tab;state.search='';
 const reduce=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 if(document.startViewTransition&&!reduce){
  const transition=document.startViewTransition(()=>render());
  pageTransition=transition;
  transition.ready.catch(()=>{});
  transition.finished.then(()=>{if(pageTransition===transition)pageTransition=null;}).catch(()=>{});
 }else{
  render();
  if(!reduce)app.querySelector('#page-content')?.animate?.([{opacity:.4,transform:`translateX(${document.documentElement.style.getPropertyValue('--page-distance')})`},{opacity:1,transform:'translateX(0)'}],{duration:180,easing:'cubic-bezier(.2,.7,.2,1)'});
 }
}
syncPalette();
async function load(){
 app.innerHTML='<div class="loading">Loading dashboard</div>';
 try{
  const response=await fetch('data/demo.json');
  if(!response.ok)throw Error('The dashboard data could not be loaded.');
  const data=await response.json();
  foods=data.foods;records=data.records;
  latest=records.reduce((last,row)=>row.date>last?row.date:last,'');
  if(!latest)throw Error('The data file contains no records.');
  render();
 }catch(error){
  app.innerHTML=`<div class="error-page"><h1>Could not load the dashboard</h1><p>${esc(error.message)}</p><button id="retry">Try again</button></div>`;
  app.querySelector('#retry').onclick=load;
 }
}
function selection(previous=false){
 const end=previous?shift(latest,-state.days):latest;
 const start=shift(end,1-state.days);
 return records.filter(r=>r.date>=start&&r.date<=end&&(state.stage==='all'||foods[r.food].stage===state.stage)&&(state.service==='all'||r.service===state.service));
}
function delta(current,prior){
 if(!prior)return '<span>Across selected period</span>';
 const pct=(current-prior)/prior*100;
 return `<span class="${pct<=0?'good':'bad'}">${n(Math.abs(pct),1)}% ${pct<=0?'less':'more'}</span> than previous ${state.days} days`;
}
function metric(label,main,unit,detail){return `<div class="metric"><div class="metric-label">${label}</div><div class="value">${main}${unit?` <span class="unit">${unit}</span>`:''}</div><div class="delta">${detail}</div></div>`;}
function totals(rows){return {litres:sum(rows,r=>r.litres),cost:sum(rows,r=>r.litres*foods[r.food].cost_per_litre)};}
function summary(rows,prior){
 const now=totals(rows),before=totals(prior),byFood=foods.map(f=>({name:f.name,v:sum(rows.filter(r=>r.food===f.id),r=>r.litres)})).sort((a,b)=>b.v-a.v);
 return `<section class="metrics" aria-label="Kitchen totals">${metric('Total waste',n(now.litres,1),'L',delta(now.litres,before.litres))}${metric('Food cost lost',money(now.cost),'',delta(now.cost,before.cost))}${metric('Daily average',n(now.litres/state.days,1),'L',`Across ${state.days} calendar days`)}${metric('Most wasted food',`<span style="font-size:22px;letter-spacing:-.4px;white-space:normal">${esc(byFood[0]?.v?byFood[0].name:'None')}</span>`,'',`${n(byFood[0]?.v||0,1)} L across this period`)}</section>`;
}
function daily(rows){
 const start=shift(latest,1-state.days);
 return Array.from({length:state.days},(_,i)=>{const date=shift(start,i);const day=rows.filter(r=>r.date===date);return {date,total:sum(day,value),stages:Object.fromEntries(Object.keys(stages).map(s=>[s,sum(day.filter(r=>foods[r.food].stage===s),value)]))};});
}
function dayReadout(day){
 return `<strong>${fmtDate(day.date)}</strong><span class="readout-total">${amount(day.total)}</span>${Object.entries(stages).filter(([id])=>state.stage==='all'||id===state.stage).map(([id,s])=>`<span><i class="swatch" style="background:${s.color}"></i>${s.name} ${amount(day.stages[id])}</span>`).join('')}`;
}
function trend(rows){
 const days=daily(rows);chartDays=days;
 const compact=window.innerWidth<=760;
 const w=compact?360:840,h=compact?230:290,p={l:compact?58:64,r:compact?22:14,t:32,b:40},cw=w-p.l-p.r,ch=h-p.t-p.b;
 const rawMax=Math.max(1,...days.map(d=>d.total))*1.1;
 const unit=10**Math.floor(Math.log10(rawMax/4));
 const max=Math.ceil(rawMax/unit/4)*unit*4;
 const average=sum(days,d=>d.total)/days.length;
 let svg=`<text x="${p.l}" y="15">${state.metric==='cost'?'Food cost in INR':'Volume in litres'}</text>`;
 for(let i=0;i<5;i++){const v=max*i/4,y=p.t+ch-ch*i/4;svg+=`<line class="gridline" x1="${p.l}" y1="${y}" x2="${w-p.r}" y2="${y}"/><text text-anchor="end" x="${p.l-10}" y="${y+4}">${state.metric==='cost'?money(v):n(v)}</text>`;}
 const step=cw/days.length;
 if(state.chart==='bars'){
  days.forEach((d,i)=>{let y=p.t+ch;const x=p.l+i*step+step*.16;Object.entries(stages).forEach(([id,stage])=>{const bh=d.stages[id]/max*ch;y-=bh;svg+=`<rect class="chart-bar" x="${x}" y="${y}" width="${step*.68}" height="${bh}" fill="${stage.color}"/>`;});});
 }else{
  const points=days.map((d,i)=>[p.l+(i+.5)*step,p.t+ch-d.total/max*ch]);
  svg+=`<path d="M ${p.l+step/2},${p.t+ch} L ${points.map(p=>p.join(',')).join(' L ')} L ${points[points.length-1][0]},${p.t+ch} Z" fill="#245b43" fill-opacity=".06"/><path d="M ${points.map(p=>p.join(',')).join(' L ')}" fill="none" stroke="#245b43" stroke-width="2.5"/>`;
  points.forEach(([x,y])=>{svg+=`<circle class="chart-point" cx="${x}" cy="${y}" r="${state.days>30?1.8:3}"/>`;});
 }
 const averageY=p.t+ch-average/max*ch;
 svg+=`<line x1="${p.l}" y1="${averageY}" x2="${w-p.r}" y2="${averageY}" stroke="#727f76" stroke-dasharray="4 5" stroke-width="1"/>`;
 const labels=compact?[0,Math.round((days.length-1)*.5),days.length-1]:[0,Math.round((days.length-1)*.25),Math.round((days.length-1)*.5),Math.round((days.length-1)*.75),days.length-1];
 labels.forEach(i=>{svg+=`<text x="${p.l+(i+.5)*step}" y="${h-10}" text-anchor="middle">${fmtDate(days[i].date)}</text>`;});
 days.forEach((day,i)=>{svg+=`<rect class="day-target" data-day="${i}" tabindex="0" role="button" aria-label="${fmtDate(day.date)}, ${amount(day.total)}. Show daily breakdown." x="${p.l+i*step}" y="${p.t}" width="${step}" height="${ch}" fill="transparent"/>`;});
 return `<section class="panel chart-panel"><div class="panel-head"><h2>Daily waste</h2><div class="chart-toolbar"><select id="metric" aria-label="Chart measurement"><option value="litres" ${state.metric==='litres'?'selected':''}>Volume</option><option value="cost" ${state.metric==='cost'?'selected':''}>Food cost</option></select><select id="chart" aria-label="Chart style"><option value="bars" ${state.chart==='bars'?'selected':''}>Bars</option><option value="line" ${state.chart==='line'?'selected':''}>Line</option></select></div></div><svg class="chart" viewBox="0 0 ${w} ${h}" role="group" aria-label="Daily waste over ${state.days} days">${svg}</svg><div class="chart-readout" id="chart-readout" aria-live="off">${dayReadout(days[days.length-1])}</div><div class="legend">${state.chart==='line'?'<span><i class="swatch" style="background:#245b43"></i>Total waste</span>':Object.entries(stages).filter(([id])=>state.stage==='all'||id===state.stage).map(([,s])=>`<span><i class="swatch" style="background:${s.color}"></i>${s.name}</span>`).join('')}<span class="average-key">Daily average ${amount(average)}</span></div></section>`;
}
function stageBreakdown(rows){
 const total=sum(rows,r=>r.litres),palette=[stages.finished.color,stages.intermediate.color,stages.raw.color,'#8597bb','#b6b49d'];
 const allStages=state.stage==='all';
 let pieces=allStages?Object.entries(stages).map(([id,stage])=>{const subset=rows.filter(r=>foods[r.food].stage===id);return {name:stage.name,stage:id,litres:sum(subset,r=>r.litres),cost:totals(subset).cost,color:stage.color};}):foods.filter(f=>f.stage===state.stage).map(f=>{const subset=rows.filter(r=>r.food===f.id);return {name:f.name,litres:sum(subset,r=>r.litres),cost:totals(subset).cost};}).filter(f=>f.litres>0).sort((a,b)=>b.litres-a.litres);
 if(!allStages&&pieces.length>5){const other=pieces.slice(4);pieces=[...pieces.slice(0,4),{name:'Other food',litres:sum(other,r=>r.litres),cost:sum(other,r=>r.cost)}];}
 pieces=pieces.map((item,i)=>({...item,color:item.color||palette[i],share:total?item.litres/total:0}));
 doughnutItems=pieces;
 const circumference=2*Math.PI*76;let offset=0;
 const circles=pieces.map((item,i)=>{const length=item.share*circumference,gap=pieces.filter(p=>p.share>0).length>1?Math.min(3,length*.15):0;const circle=item.share>0?`<circle class="donut-slice" data-donut="${i}" data-stage-target="${item.stage||''}" tabindex="0" role="button" aria-label="${esc(item.name)}, ${n(item.share*100,1)}%, ${n(item.litres,1)} litres. ${item.stage?'Filter this stage.':'Show food details.'}" cx="110" cy="110" r="76" fill="none" stroke="${item.color}" stroke-width="30" stroke-dasharray="${Math.max(0,length-gap)} ${circumference-Math.max(0,length-gap)}" stroke-dashoffset="${-offset-gap/2}" transform="rotate(-90 110 110)"/>`:'';offset+=length;return circle;}).join('');
 return `<section class="panel chart-panel mix-panel"><div class="panel-head"><h2>${allStages?'Waste by food stage':'Food mix'}</h2></div><div class="donut-wrap"><svg class="donut" viewBox="0 0 220 220" role="group" aria-label="Waste volume composition"><circle cx="110" cy="110" r="76" fill="none" stroke="#e9ede7" stroke-width="30"/>${circles}<text class="donut-value" id="donut-value" x="110" y="108" text-anchor="middle">${n(total,1)}</text><text class="donut-label" id="donut-label" x="110" y="129" text-anchor="middle">litres total</text></svg></div><div class="mix-legend">${pieces.map((item,i)=>`<button class="mix-item" data-donut="${i}" data-stage-target="${item.stage||''}" aria-label="${esc(item.name)}, ${n(item.litres,1)} litres, ${n(item.share*100,1)} percent${item.stage?', filter this stage':''}"><i class="swatch" style="background:${item.color}"></i><span>${esc(item.name)}</span><strong>${n(item.litres,1)} L</strong><span class="mix-percent">${n(item.share*100)}%</span></button>`).join('')}</div><div class="mix-detail" id="mix-detail">${allStages?'Select a stage to explore its food breakdown.':'Select a food to see its cost contribution.'}</div></section>`;
}
function foodRows(rows,prior){
 return foods.map(f=>{const now=rows.filter(r=>r.food===f.id),old=prior.filter(r=>r.food===f.id);return {...f,...totals(now),previous:totals(old).litres};}).filter(f=>f.litres>0&&f.name.toLowerCase().includes(state.search.toLowerCase())).sort((a,b)=>b.litres-a.litres);
}
function foodTable(rows,prior,limit){
 const total=sum(rows,r=>r.litres),items=foodRows(rows,prior).slice(0,limit||100);
 return `<div class="table-wrap"><table><thead><tr><th>Food</th><th>Stage</th><th class="num">Waste</th><th class="num">Food cost</th><th class="num">Share</th><th class="num">Change</th></tr></thead><tbody>${items.map(f=>{const change=f.previous?(f.litres-f.previous)/f.previous*100:null;return `<tr><td class="food-name">${esc(f.name)}</td><td class="stage-tag">${stages[f.stage].name}</td><td class="num">${n(f.litres,1)} L</td><td class="num">${money(f.cost)}</td><td class="num"><span class="share-cell"><span class="share-bar"><i style="width:${f.litres/total*100}%"></i></span><span class="share-value">${n(f.litres/total*100,1)}%</span></span></td><td class="num ${change<=0?'good':'bad'}">${change===null?'New':`${n(Math.abs(change),1)}% ${change<=0?'less':'more'}`}</td></tr>`;}).join('')}</tbody></table>${!items.length?'<div class="empty">No food matches your search.</div>':''}</div>`;
}
function serviceChart(rows){
 const values=services.filter(s=>state.service==='all'||state.service===s).map(s=>({name:s,v:sum(rows.filter(r=>r.service===s),r=>r.litres)/state.days})),max=Math.max(1,...values.map(s=>s.v));
 return `<section class="panel"><div class="panel-head"><h2>Waste by service</h2><span class="filter-label">Daily average</span></div><div class="service-bars">${values.map(s=>`<div class="service-row"><span>${s.name}</span><div class="track"><div class="fill" style="width:${s.v/max*100}%"></div></div><strong>${n(s.v,1)} L</strong></div>`).join('')}</div></section>`;
}
function weekdays(rows){
 const labels=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],start=shift(latest,1-state.days),dates=Array.from({length:state.days},(_,i)=>shift(start,i));
 return labels.map((name,i)=>{const keys=dates.filter(d=>(new Date(d+'T00:00:00Z').getUTCDay()+6)%7===i);return {name,days:keys.length,litres:sum(rows.filter(r=>keys.includes(r.date)),r=>r.litres),services:services.map(s=>sum(rows.filter(r=>keys.includes(r.date)&&r.service===s),r=>r.litres)/(keys.length||1))};});
}
function heatmap(rows){
 const days=weekdays(rows),max=Math.max(1,...days.flatMap(d=>d.services));
 const shown=services.filter(service=>state.service==='all'||state.service===service);
 return `<section class="panel chart-panel"><div class="panel-head"><h2>Weekly service pattern</h2><span class="filter-label">Average litres</span></div><div class="heatmap"><div></div>${days.map(d=>`<div class="day">${d.name}</div>`).join('')}${shown.map(service=>{const i=services.indexOf(service);return `<div class="heat-label">${service}</div>${days.map(d=>{const v=d.services[i],alpha=v/max;return `<div class="cell" style="background:rgba(${darkMode()?'111,178,135':'36,91,67'},${.06+alpha*.9});color:${darkMode()?(alpha>.5?'#102417':'#b7dec1'):alpha>.5?'white':'#245b43'}" title="${d.name} ${service}: ${n(v,1)} L">${n(v,1)}</div>`;}).join('')}`;}).join('')}</div><p class="note-line">${darkMode()?'Brighter':'Darker'} cells mean more waste.</p></section>`;
}
function patternNotes(rows,prior){
 const tips=window.WasteWiseFocus.build({rows,priorRows:prior,foods,days:state.days,start:shift(latest,1-state.days),end:latest,service:state.service,historyDates:[...new Set(records.map(r=>r.date))]});
 return `<section class="panel focus-panel"><div class="panel-head"><h2>Focus</h2><span class="focus-count">${tips.length} ${tips.length===1?'priority':'priorities'}</span></div>${tips.length?`<ol class="focus-list">${tips.map(tip=>`<li data-focus-kind="${tip.kind}" data-focus-id="${tip.id}"><h3>${esc(tip.title)}</h3><p class="focus-evidence">${esc(tip.evidence)}</p><p>${esc(tip.action)}</p></li>`).join('')}</ol>`:'<p class="note-line">Select a period with recorded waste to see priorities.</p>'}</section>`;
}
function content(rows,prior){
 if(state.tab==='foods')return `<section class="section" style="margin-top:0"><div class="panel-head"><h2>Food breakdown</h2><input class="search" id="food-search" type="search" aria-label="Find food" placeholder="Find food" value="${esc(state.search)}"></div><div id="food-table">${foodTable(rows,prior)}</div></section>`;
 if(state.tab==='service')return `<div class="grid">${heatmap(rows)}${patternNotes(rows,prior)}</div><div class="bottom-grid">${serviceChart(rows)}<section class="panel"><h2>Daily averages by weekday</h2><div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Day</th><th class="num">Average waste</th><th class="num">Days in period</th></tr></thead><tbody>${weekdays(rows).map(d=>`<tr><td>${d.name}</td><td class="num">${n(d.litres/(d.days||1),1)} L</td><td class="num">${d.days}</td></tr>`).join('')}</tbody></table></div></section></div>`;
 return `<div class="grid">${trend(rows)}${stageBreakdown(rows)}</div><section class="section"><div class="panel-head"><h2>Largest sources of waste</h2><button class="text-button" data-tab="foods">View all food</button></div>${foodTable(rows,prior,5)}</section><div class="bottom-grid">${serviceChart(rows)}${patternNotes(rows,prior)}</div>`;
}
function render(){
 const focused=document.activeElement;
 const focusSelector=focused?.id?'#'+focused.id:focused?.dataset.stage?'[data-stage="'+focused.dataset.stage+'"]':focused?.dataset.tab?'[data-tab="'+focused.dataset.tab+'"]':null;
 const rows=selection(),prior=selection(true),titles={overview:'Kitchen overview',foods:'Food analysis',service:'Service patterns'};
 app.innerHTML=`<header class="topbar"><a href="./" class="wordmark">WasteWise</a><nav class="nav" aria-label="Main navigation">${[['overview','Overview'],['foods','Food analysis'],['service','Service patterns']].map(([id,label])=>`<button data-tab="${id}" class="${state.tab===id?'active':''}" ${state.tab===id?'aria-current="page"':''}>${label}</button>`).join('')}</nav><div class="appearance-controls">${themeButton()}</div></header><main><div class="title-row"><h1>${titles[state.tab]}</h1><button id="export">${icon('download')}Export report</button></div><section class="filters" aria-label="Report filters"><div class="filter"><label for="days">Period</label><select id="days">${[7,30,90].map(d=>`<option value="${d}" ${state.days===d?'selected':''}>Last ${d} days</option>`).join('')}</select></div><div class="filter stage-filter"><span class="filter-label">Food stage</span><div class="segments" role="group" aria-label="Food stage">${[['all','All food'],...Object.entries(stages).map(([id,s])=>[id,s.name])].map(([id,name])=>`<button data-stage="${id}" class="${state.stage===id?'selected':''}" aria-pressed="${state.stage===id}">${name}</button>`).join('')}</div></div><div class="filter"><label for="service">Service</label><select id="service"><option value="all">All services</option>${services.map(s=>`<option ${state.service===s?'selected':''}>${s}</option>`).join('')}</select></div><span class="period-label">${fmtDate(shift(latest,1-state.days))} to ${fmtDate(latest)} 2026</span></section>${summary(rows,prior)}<div id="page-content">${content(rows,prior)}</div></main>`;
 app.querySelectorAll('[data-tab]').forEach(el=>el.onclick=()=>switchPage(el.dataset.tab));
 app.querySelectorAll('[data-stage]').forEach(el=>el.onclick=()=>{state.stage=el.dataset.stage;render();});
 for(const id of ['days','service','metric','chart']){const el=app.querySelector('#'+id);if(el)el.onchange=()=>{state[id]=id==='days'?Number(el.value):el.value;render();};}
 const search=app.querySelector('#food-search');if(search)search.oninput=()=>{state.search=search.value;app.querySelector('#food-table').innerHTML=foodTable(rows,prior);};
 app.querySelector('#export').onclick=()=>exportReport(rows);
 wireTheme();
 wireCharts();
 if(focusSelector)app.querySelector(focusSelector)?.focus({preventScroll:true});
}
function wireCharts(){
 app.querySelectorAll('[data-day]').forEach(el=>{
  const show=()=>{
   app.querySelectorAll('[data-day]').forEach(other=>other.classList.toggle('highlighted',other===el));
   app.querySelector('#chart-readout').innerHTML=dayReadout(chartDays[Number(el.dataset.day)]);
  };
  el.addEventListener('pointerenter',show);el.addEventListener('focus',show);el.addEventListener('click',show);
  el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();show();}});
 });
 function showPiece(index){
  const item=doughnutItems[index];
  if(!item)return;
  app.querySelectorAll('[data-donut]').forEach(el=>el.classList.toggle('is-highlighted',el.dataset.donut===String(index)));
  app.querySelector('#donut-value').textContent=n(item.share*100,1)+'%';
  app.querySelector('#donut-label').textContent='of waste volume';
  app.querySelector('#mix-detail').textContent=`${item.name}: ${n(item.litres,1)} L and ${money(item.cost)} in food cost.`;
 }
 app.querySelectorAll('[data-donut]').forEach(el=>{
  const show=()=>showPiece(Number(el.dataset.donut));
  el.addEventListener('pointerenter',show);el.addEventListener('focus',show);
  const activate=()=>{if(el.dataset.stageTarget){state.stage=el.dataset.stageTarget;render();}else show();};
  el.addEventListener('click',activate);
  if(el.tagName.toLowerCase()==='circle')el.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();activate();}});
 });
}
function exportReport(rows){
 const headers=['Date','Stage','Food','Service','Waste litres','Food cost INR'];
 const groups=new Map();rows.forEach(r=>{const key=[r.date,r.food,r.service].join('|');if(!groups.has(key))groups.set(key,{...r,litres:0});const g=groups.get(key);g.litres+=r.litres;});
 const lines=[headers,...[...groups.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(r=>[r.date,stages[foods[r.food].stage].name,foods[r.food].name,r.service,r.litres.toFixed(3),(r.litres*foods[r.food].cost_per_litre).toFixed(2)])];
 const csv=lines.map(line=>line.map(cell=>'"'+String(cell).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`WasteWise-${state.days}days-${state.stage}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 const button=app.querySelector('#export');button.textContent='Report downloaded';button.classList.add('export-done');clearTimeout(exportTimer);exportTimer=setTimeout(()=>{if(button.isConnected){button.innerHTML=icon('download')+'Export report';button.classList.remove('export-done');}},2200);
}
load();
})();
