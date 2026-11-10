(function(root){
'use strict';
const sum=(rows,fn)=>rows.reduce((a,r)=>a+fn(r),0);
const number=(v,d=0)=>Number(v).toLocaleString('en-IN',{minimumFractionDigits:d,maximumFractionDigits:d});
const actions={
 raw:name=>`Check stock rotation, storage and trimming losses for ${name}. Record the discard reason before changing the next order.`,
 intermediate:name=>`Review the batch yield for ${name}. Try smaller batches with top-ups during service, then compare the waste over the next few services.`,
 finished:name=>`Check how much ${name} remains in the kitchen after service and why it is discarded. Review cooking batch sizes and trial smaller top-up batches where leftovers recur.`
};
function build({rows,priorRows=[],foods,days,start,end,service='all',historyDates=[]}){
 const catalog=new Map(foods.map(f=>[f.id,f]));
 const litres=sum(rows,r=>r.litres),cost=sum(rows,r=>r.litres*catalog.get(r.food).cost_per_litre);
 if(!rows.length||!litres)return [];
 const items=foods.map(f=>{const current=rows.filter(r=>r.food===f.id),previous=priorRows.filter(r=>r.food===f.id);return {...f,current,previous,litres:sum(current,r=>r.litres),cost:sum(current,r=>r.litres)*f.cost_per_litre};}).filter(f=>f.litres>0);
 const candidates=[];
 const add=(id,kind,score,title,evidence,action,food=null)=>candidates.push({id,kind,score,title,evidence,action,food});
 const topCost=[...items].sort((a,b)=>b.cost-a.cost)[0];
  if(topCost.cost/cost>=.18&&topCost.cost/cost>=topCost.litres/litres*1.3){
  add('value-'+topCost.id,'food',topCost.cost*1.35,`Protect ${topCost.name.toLowerCase()}`,`${topCost.name} represents ${number(topCost.litres/litres*100)}% of waste volume but ${number(topCost.cost/cost*100)}% of food cost lost (₹${number(topCost.cost)}).`,actions[topCost.stage](topCost.name.toLowerCase()),topCost.id);
 }
 for(const topVolume of [...items].sort((a,b)=>b.litres-a.litres).slice(0,3)){
 if(topVolume.litres/litres<.12)continue;
  add('volume-'+topVolume.id,'food',topVolume.cost,`Start with ${topVolume.name.toLowerCase()}`,`${number(topVolume.litres,1)} L of ${topVolume.name.toLowerCase()} was discarded, accounting for ${number(topVolume.litres/litres*100)}% of waste and ₹${number(topVolume.cost)} in food cost.`,actions[topVolume.stage](topVolume.name.toLowerCase()),topVolume.id);
 }
 const previousEnd=new Date(Date.parse(start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
 const previousStart=new Date(Date.parse(previousEnd+'T00:00:00Z')-(days-1)*86400000).toISOString().slice(0,10);
 const dates=new Set(historyDates);
 let fullPrevious=true;
 for(let i=0;i<days;i++){const d=new Date(Date.parse(previousStart+'T00:00:00Z')+i*86400000).toISOString().slice(0,10);if(!dates.has(d))fullPrevious=false;}
 if(fullPrevious){
  for(const item of items){
   const before=sum(item.previous,r=>r.litres)/days,now=item.litres/days;
   const growth=before>0?(now-before)/before:0;
   if(growth<.15||item.cost/cost<.08)continue;
   add('rising-'+item.id,'trend',item.cost*(1.5+Math.min(growth,1)),`Review increased ${item.name.toLowerCase()} waste`,`${item.name} waste averages ${number(now,1)} L per day versus ${number(before,1)} L in the previous ${days} days, an increase of ${number(growth*100)}%.`,actions[item.stage](item.name.toLowerCase()),item.id);
  }
 }
 if(service==='all'){
  const ranked=['Breakfast','Lunch','Dinner'].map(name=>{const subset=rows.filter(r=>r.service===name);return {name,rows:subset,litres:sum(subset,r=>r.litres),cost:sum(subset,r=>r.litres*catalog.get(r.food).cost_per_litre)};}).sort((a,b)=>b.cost-a.cost);
  const top=ranked[0];
  if(top.cost/cost>=.4){
   const stageTotals=['raw','intermediate','finished'].map(stage=>({stage,litres:sum(top.rows.filter(r=>catalog.get(r.food).stage===stage),r=>r.litres)})).sort((a,b)=>b.litres-a.litres);
   const main=stageTotals[0],share=main.litres/top.litres;
   const stageNames={raw:'raw material',intermediate:'semi-finished food',finished:'finished food'};
   const action=main.stage==='raw'?`Review ${top.name.toLowerCase()} prep discards and stock issued to the prep team. Separate storage losses from trimming before changing purchasing.`:main.stage==='intermediate'?`Check which prep batches remain after ${top.name.toLowerCase()}. Trial a smaller first batch and top up to demand.`:`For the next three ${top.name.toLowerCase()} services, record covers served and food left at closing. Use that comparison to plan the first replenishment batch, with smaller top-ups available.`;
   add('service-'+top.name,'service',top.cost*.55,`Review ${top.name.toLowerCase()} first`,`${top.name} accounts for ${number(top.cost/cost*100)}% of food cost lost (₹${number(top.cost)}). ${number(share*100)}% of its waste volume is ${stageNames[main.stage]}.`,action);
  }
 }
 const dayGroups=Array.from({length:7},()=>({dates:[],litres:0,cost:0}));
 const dailyTotals=new Map();
 for(let i=0;i<days;i++){
  const date=new Date(Date.parse(start+'T00:00:00Z')+i*86400000);
  const key=date.toISOString().slice(0,10);
  dayGroups[(date.getUTCDay()+6)%7].dates.push(key);
  dailyTotals.set(key,0);
 }
 rows.forEach(r=>{
  const group=dayGroups[(new Date(r.date+'T00:00:00Z').getUTCDay()+6)%7];
  group.litres+=r.litres;group.cost+=r.litres*catalog.get(r.food).cost_per_litre;
  dailyTotals.set(r.date,(dailyTotals.get(r.date)||0)+r.litres);
 });
 const labels=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
 for(let i=0;i<7;i++){
  const group=dayGroups[i],other=dayGroups.filter((_,j)=>j!==i),otherDays=sum(other,g=>g.dates.length);
  if(group.dates.length<3||!otherDays)continue;
  const perDay=group.litres/group.dates.length,restDay=sum(other,g=>g.litres)/otherDays;
  if(!restDay||perDay<restDay*1.25)continue;
  const repeats=group.dates.filter(date=>dailyTotals.get(date)>=restDay*1.15).length;
  if(repeats<Math.ceil(group.dates.length*2/3))continue;
  add('weekday-'+i,'weekday',group.cost*.8,`Review ${labels[i]} waste`,`${labels[i]} averages ${number(perDay,1)} L of kitchen waste, ${number((perDay/restDay-1)*100)}% above other days. Higher waste recurs on ${repeats} of ${group.dates.length} ${labels[i]}s.`,`Compare ${labels[i]} prep quantities, cooking batches and discard reasons with other days. Check demand alongside those quantities before changing the prep plan.`);
 }
 candidates.sort((a,b)=>b.score-a.score);
 const selected=[],usedFoods=new Set(),usedKinds=new Set();
 for(const item of candidates){
  if(item.food!==null&&usedFoods.has(item.food))continue;
  if(usedKinds.has(item.kind)&&item.kind!=='food')continue;
  if(item.kind==='food'&&selected.filter(s=>s.kind==='food').length>=2)continue;
  selected.push(item);if(item.food!==null)usedFoods.add(item.food);usedKinds.add(item.kind);
  if(selected.length===3)break;
 }
 if(!selected.length){
  add('baseline','food',0,`Review ${topCost.name.toLowerCase()}`,`${topCost.name} contributes ₹${number(topCost.cost)} of food cost lost in this selection.`,actions[topCost.stage](topCost.name.toLowerCase()),topCost.id);
  selected.push(candidates[candidates.length-1]);
 }
 return selected.map(({id,kind,title,evidence,action})=>({id,kind,title,evidence,action}));
}
const api={build};
if(typeof module==='object'&&module.exports)module.exports=api;
else root.WasteWiseFocus=api;
})(typeof window==='object'?window:globalThis);
