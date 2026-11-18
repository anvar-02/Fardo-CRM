const TZ='Asia/Dushanbe',$=s=>document.querySelector(s);
const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:TZ});
const r2=n=>Math.round(n*100)/100;
const money=n=>new Intl.NumberFormat('ru-RU',{minimumFractionDigits:2,maximumFractionDigits:2}).format(n)+' TJS';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const addDays=(d,n)=>new Date(Date.parse(d)+n*864e5).toISOString().slice(0,10);
const diff=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/864e5);
let db,view='dash',q='';
const id=()=>++db.seq, cl=i=>db.clients.find(c=>c.id===i)||{};
const log=(action,entity,details='')=>db.audit.unshift({at:new Date().toLocaleString('ru-RU',{timeZone:TZ}),user:'Демо-пользователь',action,entity,details});
const save=()=>window.api.save(db);
const MANAGERS=['Фарход Рахимов','Мадина Саидова'],OPF=['ООО','ОДО','ЗАО','ОАО','ИП'];

// ---- расчёты (долг считается из начислений и оплат) ----
const paidOf=c=>db.payments.filter(p=>p.chargeId===c.id&&p.status==='Проведена').reduce((s,p)=>s+p.applied,0);
const balOf=c=>r2(c.amount-paidOf(c));
const overdue=c=>balOf(c)>0&&today()>c.due?diff(c.due,today()):0;
const chStatus=c=>balOf(c)<=0?'Оплачено':overdue(c)?'Просрочено':paidOf(c)>0?'Частично оплачено':'Ожидает оплаты';
const advanceOf=cid=>r2(db.payments.filter(p=>p.clientId===cid&&p.status==='Проведена').reduce((s,p)=>s+p.advance,0));
const conStatus=c=>c.status==='Активный'&&c.end&&diff(today(),c.end)<=30&&diff(today(),c.end)>=0?'Истекает':c.status;
const cliStatus=c=>db.contracts.some(k=>k.clientId===c.id&&k.status==='Активный')?'Активный':'Потенциальный';

// ---- операции ----
function addClient(f){
  const c={id:id(),type:f.type,name:f.name.trim(),inn:f.inn.trim(),opf:f.type==='legal'?f.opf:'',phone:f.phone,email:f.email,address:f.address,manager:f.manager};
  db.clients.push(c);log('Создание клиента','Клиент: '+c.name);return c;}
function addDeal(f){
  const s=db.services.find(x=>x.id==f.service),price=r2(+f.price);
  if(!(price>0))throw Error('Укажите цену больше нуля');
  const custom=price!==s.price;
  if(custom&&!f.comment.trim())throw Error('Для индивидуальной цены нужен комментарий');
  const d={id:id(),clientId:+f.client,service:s.name,payType:s.payType,price,custom,comment:f.comment,start:f.start,end:f.end,payDay:+f.payDay||1,dueDays:+f.dueDays||10,status:custom?'На согласовании':'Согласована'};
  db.deals.push(d);log('Создание сделки','Сделка №'+d.id+' — '+cl(d.clientId).name,custom?'Индивидуальная цена '+money(price):'');return d;}
function addContract(d){
  const c={id:id(),number:'Д-'+d.start.slice(0,4)+'-'+String(db.seqC++).padStart(4,'0'),dealId:d.id,clientId:d.clientId,service:d.service,payType:d.payType,price:d.price,start:d.start,end:d.end,payDay:d.payDay,dueDays:d.dueDays,status:'На согласовании'};
  db.contracts.push(c);d.contractId=c.id;d.status='Закрыта';log('Создание договора',c.number+' — '+cl(c.clientId).name,'Отправлен на согласование');return c;}
function accrue(c){ // не более одного начисления на договор и период
  const t=today(),once=c.payType==='once';let y=+c.start.slice(0,4),m=+c.start.slice(5,7);
  for(let k=0;k<36;k++,m>11?(m=1,y++):m++){
    const per=once?c.start.slice(0,7):y+'-'+String(m).padStart(2,'0');
    const acc=once?c.start:per+'-'+String(Math.min(c.payDay,28)).padStart(2,'0');
    if(acc>t||(c.end&&acc>c.end))break;
    if(acc>=c.start&&!db.charges.some(x=>x.contractId===c.id&&x.period===per)){
      const ch={id:id(),contractId:c.id,clientId:c.clientId,period:per,amount:c.price,due:addDays(acc,c.dueDays),invoice:'С-'+acc.slice(0,4)+'-'+String(db.seqI++).padStart(4,'0')};
      db.charges.push(ch);log('Начисление и счёт',c.number+', период '+per,ch.invoice+', '+money(ch.amount));}
    if(once)break;}}
function addPayment(f){
  const ch=db.charges.find(x=>x.id==f.charge),amt=r2(+f.amount);
  if(!(amt>0))throw Error('Сумма должна быть больше нуля');
  const applied=Math.min(amt,balOf(ch));
  db.payments.push({id:id(),chargeId:ch.id,clientId:ch.clientId,amount:amt,applied,advance:r2(amt-applied),date:f.date,method:f.method,comment:f.comment,status:'Проведена'});
  log('Регистрация оплаты',ch.invoice+' — '+cl(ch.clientId).name,money(amt)+(amt>applied?' (аванс '+money(amt-applied)+')':''));}

// ---- демо-данные ----
function seed(){
  db={seq:0,seqC:1,seqI:1,clients:[],services:[],deals:[],contracts:[],charges:[],payments:[],audit:[]};
  const t=today();
  [['Бухгалтерское сопровождение','monthly',1500],['Регистрация ООО','once',3000],['Юридическая консультация','monthly',800]].forEach(([name,payType,price])=>db.services.push({id:id(),name,payType,price}));
  const mk=(type,name,inn,opf,phone,mg)=>addClient({type,name,inn,opf,phone,email:'',address:'г. Душанбе',manager:mg});
  const a=mk('legal','Сомон Трейд','020012345','ООО','+992 900 11 22 33',MANAGERS[0]);
  const b=mk('legal','Нур Групп','020067890','ОДО','+992 901 22 33 44',MANAGERS[1]);
  const c=mk('person','Каримов Рустам Ахмадович','010055566','','+992 902 33 44 55',MANAGERS[0]);
  const d=mk('person','Назарова Зарина Хасановна','010077788','','+992 903 44 55 66',MANAGERS[1]);
  const run=(client,s,start,end,price)=>{const dl=addDeal({client:client.id,service:db.services[s].id,price:price??db.services[s].price,comment:price?'Скидка постоянному клиенту':'',start,end,payDay:Math.min(28,+start.slice(8,10)),dueDays:10});
    dl.status='Согласована';const k=addContract(dl);k.status='Активный';log('Утверждение договора',k.number,'Руководитель');accrue(k);return k;};
  const chs=k=>db.charges.filter(x=>x.contractId===k.id);
  const k1=run(a,0,addDays(t,-80),addDays(t,285));
  if(chs(k1)[0])addPayment({charge:chs(k1)[0].id,amount:1500,date:addDays(t,-60),method:'Банковский перевод',comment:''});
  if(chs(k1)[1])addPayment({charge:chs(k1)[1].id,amount:700,date:addDays(t,-25),method:'Наличные',comment:'Частичная оплата'});
  run(b,1,addDays(t,-40),addDays(t,320));
  const k3=run(c,2,addDays(t,-20),addDays(t,25),700);
  if(chs(k3)[0])addPayment({charge:chs(k3)[0].id,amount:1000,date:addDays(t,-8),method:'Наличные',comment:'Переплата'});
  run(d,1,addDays(t,-3),addDays(t,360));
  return db;}

// ---- интерфейс ----
const VIEWS=[['dash','Дашборд'],['clients','Клиенты'],['deals','Сделки'],['contracts','Договоры'],['pay','Начисления и оплаты'],['debts','Задолженность'],['audit','Журнал действий']];
const tag=(t)=>`<span class="tag ${/Оплачено|Активн|Согласована|Проведена/.test(t)?'ok':/Просроч|Отклон|Отмен/.test(t)?'bad':/согласован|Истекает|Частично/.test(t)?'warn':''}">${esc(t)}</span>`;
const table=(h,rows,num=[])=>rows.length?`<table><tr>${h.map((x,i)=>`<th class="${num.includes(i)?'n':''}">${x}</th>`).join('')}</tr>${rows.map(r=>`<tr>${r.map((x,i)=>`<td class="${num.includes(i)?'n':''}">${x}</td>`).join('')}</tr>`).join('')}</table>`:'<div class="empty">Нет данных</div>';
const btn=(a,i,t,cls='')=>`<button class="sm ${cls}" data-a="${a}" data-i="${i}">${t}</button>`;
const F=(l,n,v='',t='text',x='')=>`<label>${l}<input name="${n}" type="${t}" value="${esc(v)}" ${x}></label>`;
const S=(l,n,o)=>`<label>${l}<select name="${n}">${o.map(([v,t])=>`<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
const cliOpts=()=>db.clients.map(c=>[c.id,c.name]);

function modal(title,html,onOk,setup){
  const m=$('#modal');
  m.innerHTML=`<form class="box"><h3>${esc(title)}</h3>${html}<div class="err"></div><div class="row"><button type="button" class="ghost" id="cx">Отмена</button><button class="btn">Сохранить</button></div></form>`;
  m.hidden=false;$('#cx').onclick=()=>m.hidden=true;setup&&setup(m);
  m.querySelector('form').onsubmit=e=>{e.preventDefault();try{onOk(Object.fromEntries(new FormData(e.target)));m.hidden=true;save();render();}catch(x){m.querySelector('.err').textContent=x.message;}};}

function clientForm(){
  let dup=null;
  modal('Новый клиент',S('Тип клиента','type',[['person','Физическое лицо'],['legal','Юридическое лицо']])+'<div id="opfw" hidden>'+S('ОПФ','opf',OPF.map(o=>[o,o]))+'</div>'+F('ФИО / название','name','','text','required')+F('ИНН','inn','','text','required')+F('Телефон','phone')+F('Email','email')+F('Адрес','address')+S('Ответственный менеджер','manager',MANAGERS.map(o=>[o,o])),
  f=>{const x=db.clients.find(c=>c.inn===f.inn.trim());
    if(x&&dup!==f.inn){dup=f.inn;throw Error('Клиент с таким ИНН уже есть: '+x.name+'. Нажмите «Сохранить» ещё раз, чтобы создать дубликат.');}
    addClient(f);},
  m=>{const t=m.querySelector('[name=type]');t.onchange=()=>$('#opfw').hidden=t.value!=='legal';});}
function dealForm(){
  modal('Новая сделка',S('Клиент','client',cliOpts())+S('Услуга','service',db.services.map(s=>[s.id,s.name+' — '+money(s.price)+(s.payType==='once'?' (разовая)':' (ежемесячная)')]))+F('Цена, TJS','price',db.services[0].price,'number','step="0.01" required')+F('Комментарий (обязателен при индивидуальной цене)','comment')+F('Начало','start',today(),'date','required')+F('Окончание','end',addDays(today(),365),'date','required')+F('День начисления (1–28)','payDay',1,'number','min="1" max="28"')+F('Срок оплаты, дней','dueDays',10,'number','min="0"'),addDeal,
  m=>{const s=m.querySelector('[name=service]');s.onchange=()=>m.querySelector('[name=price]').value=db.services.find(x=>x.id==s.value).price;});}
function payForm(chargeId){
  const open=db.charges.filter(c=>balOf(c)>0);
  if(!open.length)return alert('Нет начислений с остатком');
  modal('Регистрация оплаты',S('Счёт / начисление','charge',open.map(c=>[c.id,c.invoice+' — '+cl(c.clientId).name+' — остаток '+money(balOf(c))]))+F('Сумма, TJS','amount','','number','step="0.01" min="0.01" required')+F('Дата','date',today(),'date','required')+S('Способ оплаты','method',['Наличные','Банковский перевод','Карта'].map(o=>[o,o]))+F('Комментарий','comment'),addPayment,
  m=>{if(chargeId)m.querySelector('[name=charge]').value=chargeId;});}

const chargesTable=list=>table(['Счёт','Клиент','Договор','Период','Сумма','Оплачено','Остаток','Срок оплаты','Просрочка','Статус',''],list.map(c=>[esc(c.invoice),esc(cl(c.clientId).name),esc(db.contracts.find(k=>k.id===c.contractId).number),c.period,money(c.amount),money(paidOf(c)),'<b>'+money(balOf(c))+'</b>',c.due,overdue(c)?overdue(c)+' дн.':'—',tag(chStatus(c)),balOf(c)>0?btn('pay',c.id,'Оплата'):'']),[4,5,6]);

const VIEWFN={
  dash(){const ch=db.charges,dc=ch.filter(c=>overdue(c)>0),debt=r2(dc.reduce((s,c)=>s+balOf(c),0));
    const cards=[['Клиенты',db.clients.length,'clients'],['Активные договоры',db.contracts.filter(k=>k.status==='Активный').length,'contracts'],['Начислено',money(ch.reduce((s,c)=>s+c.amount,0)),'pay'],['Оплачено',money(db.payments.filter(p=>p.status==='Проведена').reduce((s,p)=>s+p.amount,0)),'pay'],['Задолженность',money(debt),'debts','red'],['Должники',new Set(dc.map(c=>c.clientId)).size,'debts','red'],['Истекающие договоры',db.contracts.filter(k=>conStatus(k)==='Истекает').length,'contracts']];
    return `<h2>Дашборд</h2><div class="cards">${cards.map(([l,v,t,c])=>`<button class="card ${c||''}" data-a="go" data-i="${t}"><span>${l}</span><b>${v}</b></button>`).join('')}</div><h3>Последние действия</h3>`+table(['Время','Действие','Запись'],db.audit.slice(0,6).map(a=>[a.at,esc(a.action),esc(a.entity)]));},
  clients(){return `<div class="top"><h2>Клиенты</h2><span><input id="q" placeholder="Поиск: название, ИНН, телефон" value="${esc(q)}"> <button class="btn" data-a="newClient">+ Клиент</button></span></div><div id="tbl">${clientsTbl()}</div>`;},
  deals(){return `<div class="top"><h2>Сделки</h2><button class="btn" data-a="newDeal">+ Сделка</button></div>`+table(['№','Клиент','Услуга','Цена','Период','Статус',''],db.deals.map(d=>[d.id,esc(cl(d.clientId).name),esc(d.service),money(d.price)+(d.custom?' *':''),d.start+' — '+d.end,tag(d.status),d.status==='На согласовании'?btn('okDeal',d.id,'Согласовать')+btn('noDeal',d.id,'Отклонить','red'):d.status==='Согласована'?btn('mkContract',d.id,'Создать договор'):'']),[3])+'<p>* индивидуальная цена — требует согласования руководителя</p>';},
  contracts(){return '<h2>Договоры</h2>'+table(['Номер','Клиент','Услуга','Сумма','Срок','Статус',''],db.contracts.map(k=>[k.number,esc(cl(k.clientId).name),esc(k.service)+(k.payType==='monthly'?' (мес.)':''),money(k.price),k.start+' — '+k.end,tag(conStatus(k))+(k.note?'<br><small>'+esc(k.note)+'</small>':''),k.status==='На согласовании'?btn('okCon',k.id,'Утвердить')+btn('backCon',k.id,'Вернуть','red'):k.status==='Черновик'?btn('sendCon',k.id,'На согласование'):k.status==='Активный'&&k.payType==='monthly'?btn('accrue',k.id,'Начислить период'):'']),[3]);},
  pay(){return `<div class="top"><h2>Начисления и оплаты</h2><button class="btn" data-a="pay" data-i="">+ Оплата</button></div>`+chargesTable(db.charges)+'<h3>Оплаты</h3>'+table(['Дата','Клиент','Счёт','Сумма','Аванс','Способ','Статус',''],db.payments.map(p=>[p.date,esc(cl(p.clientId).name),esc(db.charges.find(c=>c.id===p.chargeId).invoice),money(p.amount),p.advance?money(p.advance):'—',esc(p.method),tag(p.status)+(p.reason?'<br><small>'+esc(p.reason)+'</small>':''),p.status==='Проведена'?btn('cancelPay',p.id,'Отменить','red'):'']),[3,4]);},
  debts(){const dc=db.charges.filter(c=>overdue(c)>0);return `<h2>Задолженность: ${money(r2(dc.reduce((s,c)=>s+balOf(c),0)))}</h2>`+chargesTable(dc);},
  audit(){return '<h2>Журнал действий</h2>'+table(['Время','Пользователь','Действие','Запись','Детали'],db.audit.map(a=>[a.at,esc(a.user),esc(a.action),esc(a.entity),esc(a.details)]));}
};
function clientsTbl(){const s=q.toLowerCase(),list=db.clients.filter(c=>!s||[c.name,c.inn,c.phone].join(' ').toLowerCase().includes(s));
  return table(['Клиент','Тип','ИНН','Телефон','Менеджер','Статус','Аванс'],list.map(c=>[esc((c.opf?c.opf+' ':'')+c.name),c.type==='legal'?'Юр. лицо':'Физ. лицо',esc(c.inn),esc(c.phone),esc(c.manager),tag(cliStatus(c)),advanceOf(c.id)?money(advanceOf(c.id)):'—']),[6]);}

function render(){
  $('#nav').innerHTML=VIEWS.map(([k,t])=>`<button data-a="go" data-i="${k}" class="${k===view?'on':''}">${t}</button>`).join('');
  $('#main').innerHTML=VIEWFN[view]();
  const qi=$('#q');if(qi)qi.oninput=()=>{q=qi.value;$('#tbl').innerHTML=clientsTbl();};}

const ask=t=>{const r=prompt(t);if(!r||!r.trim()){alert('Причина обязательна');return null;}return r.trim();};
const A={
  go:i=>view=i,newClient:clientForm,newDeal:dealForm,pay:i=>payForm(+i||undefined),
  okDeal:i=>{const d=db.deals.find(x=>x.id==i);d.status='Согласована';log('Согласование сделки','Сделка №'+i,'Руководитель');},
  noDeal:i=>{const r=ask('Причина отклонения:');if(r){const d=db.deals.find(x=>x.id==i);d.status='Отклонена';log('Отклонение сделки','Сделка №'+i,r);}},
  mkContract:i=>addContract(db.deals.find(x=>x.id==i)),
  okCon:i=>{const k=db.contracts.find(x=>x.id==i);k.status='Активный';k.note='';log('Утверждение договора',k.number,'Руководитель');accrue(k);},
  backCon:i=>{const r=ask('Комментарий для доработки:');if(r){const k=db.contracts.find(x=>x.id==i);k.status='Черновик';k.note=r;log('Возврат договора на доработку',k.number,r);}},
  sendCon:i=>{const k=db.contracts.find(x=>x.id==i);k.status='На согласовании';log('Отправка договора на согласование',k.number);},
  accrue:i=>accrue(db.contracts.find(x=>x.id==i)),
  cancelPay:i=>{const r=ask('Причина отмены оплаты:');if(r){const p=db.payments.find(x=>x.id==i);p.status='Отменена';p.reason=r;log('Отмена оплаты','Оплата №'+i,r);}}
};
document.addEventListener('click',e=>{const b=e.target.closest('[data-a]');if(!b)return;
  const a=b.dataset.a,i=b.dataset.i;if(a==='go'){view=i;render();return;}
  A[a](i);save();if(!$('#modal').hidden)return;render();});
$('#reset').onclick=async()=>{if(confirm('Вернуть исходные демо-данные? Введённые данные будут удалены.')){await window.api.reset();seed();save();view='dash';render();}};
(async()=>{db=await window.api.load();if(!db)seed();render();save();})();
