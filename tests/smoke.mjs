import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const curriculum=JSON.parse(read('data/curriculum.json')), baseLessons=JSON.parse(read('data/lessons.json')), smeLessons=JSON.parse(read('data/lessons-sme.json')), lessons={...baseLessons,...smeLessons};
assert(!Object.keys(smeLessons).some(id=>Object.hasOwn(baseLessons,id)),'duplicate split lesson ID');
const cases=JSON.parse(read('data/cases.json'));
const topics=curriculum.subjects.flatMap(s=>s.topics), questions=Object.values(lessons).flatMap(l=>l.questions);
assert.equal(curriculum.subjects.filter(s=>s.stage===1).length,7);
assert.equal(curriculum.subjects.filter(s=>s.stage===2).length,4);
assert.equal(new Set(topics.map(t=>t.id)).size,topics.length);
assert.equal(new Set(questions.map(q=>q.id)).size,questions.length);
for(const [id,l] of Object.entries(lessons)){assert(topics.some(t=>t.id===id));assert(Number.isInteger(l.revision)&&l.revision>0);assert(l.sections.length&&l.questions.length);for(const q of l.questions){assert(q.answer>=0&&q.answer<q.options.length&&Number.isInteger(q.answer));assert.equal(q.options.length,q.explanations.length)}}
for(const [id,l] of Object.entries(lessons)){
assert(l.goals.length>=2,id+' objectives');
assert(l.sections.length>=6,id+' chapter depth');
assert(l.questions.length>=4,id+' question depth');
assert(l.questions.some(q=>q.level==='基礎')&&l.questions.some(q=>q.level==='応用'),id+' question levels');
assert(l.table.headers.length>1&&l.table.rows.every(r=>r.length===l.table.headers.length),id+' table');
for(const p of l.prerequisites)assert(p!==id&&topics.some(t=>t.id===p),id+' prerequisite '+p);
assert(l.takeaway.length>0,id+' summary');
}
for(const [id,l] of Object.entries(lessons))for(const source of l.sources??[]){assert(source.url.startsWith('https://'));assert(/^\d{4}-\d{2}-\d{2}$/.test(source.checked));assert(source.name.length>0)}
const visit=(id,path=[])=>{assert(!path.includes(id),'cyclic prerequisite '+[...path,id].join(' -> '));for(const p of lessons[id]?.prerequisites??[])if(lessons[p])visit(p,[...path,id])};
for(const id of Object.keys(lessons))visit(id);
assert.equal(cases.length,4);
assert.equal(new Set(cases.map(c=>c.subject)).size,4);
for(const c of cases){assert(curriculum.subjects.some(s=>s.id===c.subject&&s.stage===2));assert.equal(c.questions.reduce((n,q)=>n+q.points,0),100);for(const q of c.questions){assert(Array.from(q.model).length<=q.limit);assert.equal(q.rubric.reduce((n,r)=>n+r[1],0),q.points);assert(q.topics.every(id=>topics.some(t=>t.id===id)))}}
const dom={innerHTML:'',textContent:''}, store=new Map(), events={};
const context=vm.createContext({document:{querySelector:()=>dom,querySelectorAll:()=>[],addEventListener:(n,fn)=>events[n]=fn},localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},navigator:{},window:{scrollTo(){}},fetch:async p=>({ok:true,json:async()=>p.includes('curriculum')?curriculum:p.includes('cases')?cases:p.includes('lessons-sme')?smeLessons:baseLessons}),alert:()=>{},console});
await vm.runInContext(read('app.js').replace(/init\(\);\s*$/,'init();'),context);
const run=s=>vm.runInContext(s,context);
assert(dom.innerHTML.includes('学習ダッシュボード'));
assert.equal(run('metrics(subject("fin")).read'),0);
assert.equal(run('metrics(subject("fin")).available'),Object.keys(lessons).filter(id=>id.startsWith('fin-')).length);
assert.equal(run('metrics(subject("fin")).total'),curriculum.subjects.find(s=>s.id==='fin').topics.length);
run('state.read["fin-cvp"]={date:day(),revision:lessons["fin-cvp"].revision}');
assert.equal(run('metrics(subject("fin")).read'),1);
run('state.read["fin-cvp"].revision=lessons["fin-cvp"].revision-1');
assert.equal(run('metrics(subject("fin")).read'),0);
run('delete state.read["fin-cvp"]');
run('state.attempts.push({q:"fin-cvp-q1",correct:false,date:day()})');
assert.equal(run('dueQuestions().length'),1);
run('state.attempts.push({q:"fin-cvp-q1",correct:true,date:day()})');
assert.equal(run('dueQuestions().length'),0);
run('state.attempts.push({q:"fin-cvp-q1",correct:true,date:day()})');
assert.equal(run('reviewInfo(questions.find(q=>q.id==="fin-cvp-q1")).due'),run('plusDays(day(),1)'));
run('state.attempts.pop()');
assert.equal(run('metrics(subject("fin")).attempted'),1);
assert.equal(run('metrics(subject("fin")).accuracy'),50);
run('state.attempts=[{q:"fin-cvp-q1",correct:true,date:plusDays(day(),-4)},{q:"fin-cvp-q1",correct:true,date:day()}]');
assert.equal(run('metrics(subject("fin")).retained'),1);
assert.throws(()=>run('validate({...blank(),weekly:-1})'));
assert.throws(()=>run('validate({...blank(),scores:[{score:101}]})'));
run('save()');
assert.equal(JSON.parse(store.get('smec-study-v1')).attempts.length,2);
assert.equal(run('learningStatus(topic("fin-cvp"))'),'未読・要再読');
run('state.read["fin-cvp"]={date:day(),revision:lessons["fin-cvp"].revision}');
assert.equal(run('learningStatus(topic("fin-cvp"))'),'未挑戦問題あり');
run('state.passes.fin=2026');
assert.equal(run('Boolean(eligible(subject("fin"),2027))'),true);
assert.equal(run('Boolean(eligible(subject("fin"),2026))'),false);
assert.equal(run('Boolean(eligible(subject("fin"),2029))'),false);
run('state.stagePass.first=2026');
assert.equal(run('Boolean(eligible(subject("fin"),2027))'),false);
assert.equal(run('validDate("2027-02-30")'),false);
assert.equal(run('officialFinance.labels.length'),25);
assert.equal(run('officialFinance.answers.length'),25);
assert.equal(run('gradeOfficial({}).reduce((n,x)=>n+x.points,0)'),0);
assert.equal(run('gradeOfficial(Object.fromEntries(officialFinance.answers.map((v,i)=>["q"+i,v]))).reduce((n,x)=>n+x.points,0)'),100);
assert.equal(run('gradeOfficial({q0:"エ"}).reduce((n,x)=>n+x.points,0)'),4);
assert.equal(run('orderedTopics(subject("fin"))[0].id'),'fin-bookkeeping');
assert(run('orderedTopics(subject("fin")).findIndex(t=>t.id==="fin-cost")<orderedTopics(subject("fin")).findIndex(t=>t.id==="fin-cvp")'));
assert.equal(run('new Set(orderedTopics(subject("fin")).map(t=>t.id)).size'),curriculum.subjects.find(s=>s.id==='fin').topics.length);
run('selected="fin-cvp";page="study";render()');
assert(dom.innerHTML.includes('この単元の学習目標'));
assert(dom.innerHTML.includes('前提知識'));
assert(dom.innerHTML.includes('整理・計算表'));
assert(dom.innerHTML.includes('安全余裕率'));
assert(dom.innerHTML.includes('応用'));
assert.equal(run('cvpValues(40,60).be'),100);
assert.equal(run('cvpValues(40,60).profit'),40);
assert.equal(run('marketValues(15).q'),30);
assert.equal(run('marketValues(15).pc'),35);
assert.equal(run('marketValues(15).pp'),20);
assert.equal(run('marketValues(15).loss'),75);
assert.equal(run('marketValues(15).revenue'),450);
assert(Math.abs(run('npvValues(10).npv')-4.1322314)<0.0001);
assert(run('npvValues(25).npv')<0);
assert(dom.innerHTML.includes('数値を動かして理解する'));
assert(dom.innerHTML.includes('損益分岐点：100万円'));
run('selected="fin-standards";page="study";render()');
assert(dom.innerHTML.includes('参照資料・年度確認'));
assert(dom.innerHTML.includes('2027年4月1日'));
assert.equal(run('metrics(subject("fin")).available'),curriculum.subjects.find(s=>s.id==='fin').topics.length);
run('state=blank()');
assert.equal(run('metrics(subject("fin")).mastered'),0);
assert.equal(run('metrics(subject("fin")).latestCorrect'),0);
assert(run('recommended().every(t=>(lessons[t.id].prerequisites??[]).every(p=>!lessons[p]||state.read[p]?.revision===lessons[p].revision))'));
assert.equal(run('officialExams.length'),7);
assert.equal(run('officialExams.reduce((n,e)=>n+e.labels.length,0)'),227);
for(const subjectId of ['econ','fin','mgmt','ops','law','it','sme']){
 const prefix='officialExams.find(e=>e.subject==='+JSON.stringify(subjectId)+')';
 assert.equal(run(prefix+'.weights.reduce((n,w)=>n+w,0)'),100);
 assert(run(prefix+'.answers.every(a=>["ア","イ","ウ","エ","オ"].includes(a))'));
 assert.equal(run('gradeOfficial({},'+prefix+').reduce((n,x)=>n+x.points,0)'),0);
 assert.equal(run('gradeOfficial(Object.fromEntries('+prefix+'.answers.map((v,i)=>["q"+i,v])),'+prefix+').reduce((n,x)=>n+x.points,0)'),100);
}
assert.equal(run('gradeOfficial({q0:"ア"},officialExams.find(e=>e.subject==="mgmt"))[0].points'),3);
assert.equal(run('gradeOfficial({q1:"エ"},officialExams.find(e=>e.subject==="ops"))[1].points'),2);
assert.equal(run('officialExams.find(e=>e.subject==="sme").labels.filter(x=>x.startsWith("27-")).length'),3);
assert.equal(run('charCount("あ\\n𠮷")'),2);
assert.equal(run('selfGrade(cases[0],{},["0-0"])'),0);
assert.equal(run('selfGrade(cases[0],{[cases[0].questions[0].id]:"回答"},["0-0"])'),8);
assert.equal(run('selfGrade(cases[0],{[cases[0].questions[0].id]:"字".repeat(61)},["0-0"])'),0);
run('state=blank();page="cases";activeCase=cases[0].id;caseResult=null;render()');
assert(dom.innerHTML.includes('答案を書く'));
assert(!dom.innerHTML.includes(cases[0].questions[0].model));
run('state.caseHistory.push({caseId:cases[0].id,date:day(),answers:{[cases[0].questions[0].id]:"<script>bad</script>"},score:null,checked:[]});caseResult=0;render()');
assert(dom.innerHTML.includes('解答例・自己採点'));
assert(dom.innerHTML.includes('&lt;script&gt;bad&lt;/script&gt;'));
assert(!dom.innerHTML.includes('<script>bad</script>'));
assert.throws(()=>run('validate({...blank(),caseHistory:[{caseId:"x",score:101}]})'));
assert.throws(()=>run('validate({...blank(),examDrafts:{x:{q0:"bad"}}})'));
assert.equal(run('Object.keys(validate((()=>{const s=blank();delete s.examDrafts;delete s.caseDrafts;delete s.caseHistory;return s})()).caseDrafts).length'),0);
assert.equal(curriculum.subjects.find(s=>s.id==='econ').officialGroups.length,8);
assert.equal(curriculum.subjects.find(s=>s.id==='fin').officialGroups.length,11);
assert.equal(curriculum.subjects.find(s=>s.id==='mgmt').officialGroups.length,26);
const mgmtTopics=curriculum.subjects.find(s=>s.id==='mgmt').topics;
assert(mgmtTopics.every(t=>lessons[t.id]),'management topic missing lesson');
const mgmtQs=mgmtTopics.flatMap(t=>lessons[t.id].questions);
const positions=[0,1,2,3].map(i=>mgmtQs.filter(q=>q.answer===i).length);
assert(Math.max(...positions)-Math.min(...positions)<=1,'management answers biased');
for(const t of mgmtTopics){const l=lessons[t.id];assert(l.sections.reduce((n,[h,p])=>n+p.length,0)>=600,t.id+' explanation depth floor');for(const q of l.questions){assert.equal(new Set(q.options).size,q.options.length,t.id+' duplicate option');assert(q.explanations.every(x=>typeof x==='string'&&x.trim().length>0),q.id+' empty rationale')}}
for(const id of ['mgmt-08','mgmt-labor-employment','mgmt-labor-care','mgmt-labor-safety'])assert(lessons[id].sources.length>=3,id+' primary sources');
for(const id of ['mgmt-learning','mgmt-03','mgmt-international','mgmt-11']){
 run('page="study";selected='+JSON.stringify(id)+';render()');
 assert(dom.innerHTML.includes('data-concept="'+id+'"'),id+' concept diagram missing')
}
run('page="study";selected="mgmt-pricing";render()');
assert(dom.innerHTML.includes('1,334個'));
assert(dom.innerHTML.includes('100,000円'));
assert(run('diagramContent("mgmt-pricing",0,1000)').includes('1,000個'));
assert(run('diagramContent("mgmt-pricing",200,2000)').includes('2,000個'));

for(const sub of curriculum.subjects)for(const g of sub.officialGroups??[]){assert(g.topics.every(id=>sub.topics.some(t=>t.id===id)));assert(g.gaps.length>0);assert(g.sourcePage)}
run('state=blank();state.read["fin-cvp"]={date:day(),revision:lessons["fin-cvp"].revision};state.attempts=[{q:"fin-cvp-q1",correct:true,date:plusDays(day(),-5)},{q:"fin-cvp-q1",correct:false,date:day()}]');
assert.equal(run('learningStatus(topic("fin-cvp"))'),'理解不足');
run('state.attempts.push({q:"fin-cvp-q1",correct:true,date:day()})');
assert.equal(run('spacedRetention(questions.find(q=>q.id==="fin-cvp-q1"))'),false);
run('page="study";selected="fin";render()');
assert(dom.innerHTML.includes('公式出題項目との対応'));
assert(dom.innerHTML.includes('金融派生商品・リスク管理'));
assert(dom.innerHTML.includes('不足・要検証'));
run('state=blank();state.passes.fin=2026');
assert.equal(run('approvedExemption(subject("fin"))'),false);
run('state.exemptions["2027-fin"]="applied-prior"');
assert.equal(run('approvedExemption(subject("fin"))'),false);
run('state.exemptions["2027-fin"]="confirmed-prior"');
assert.equal(run('approvedExemption(subject("fin"))'),true);
assert.equal(run('approvedExemption(subject("fin"),2028)'),false);
run('state.stagePass.first=2026');
assert.equal(run('approvedExemption(subject("fin"))'),false);
run('state.exemptions["2027-it"]="confirmed-other"');
assert.equal(run('approvedExemption(subject("it"))'),true);
assert.throws(()=>run('validate({...blank(),exemptions:{"2027-fin":"bad"}})'));
assert.equal(run('Object.keys(validate((()=>{const s=blank();delete s.exemptions;return s})()).exemptions).length'),0);
const opsSubject=curriculum.subjects.find(s=>s.id==='ops');
assert.equal(opsSubject.officialGroups.length,11);
assert(opsSubject.topics.every(t=>lessons[t.id]),'missing operations lesson');
const opsQuestions=opsSubject.topics.flatMap(t=>lessons[t.id].questions);
const opsPositions=[0,1,2,3].map(i=>opsQuestions.filter(q=>q.answer===i).length);
assert(Math.max(...opsPositions)-Math.min(...opsPositions)<=1,'operations answer position bias');
for(const t of opsSubject.topics){const l=lessons[t.id];assert(l.sections.length>=8,t.id+' explanation depth');assert(l.questions.length>=6,t.id+' exercise depth');for(const q of l.questions){assert.equal(new Set(q.options).size,q.options.length,q.id+' duplicate options');assert(q.explanations.every(e=>e.trim()),q.id+' missing rationale')}}
for(const id of ['ops-retail-law','ops-logistics','ops-codes','ops-04'])assert(lessons[id].sources.length,id+' sources');
for(const [id,a,b,expected] of [['ops-04',1200,200,'経済的発注量（EOQ）：200個'],['ops-04',2400,400,'経済的発注量（EOQ）：400個'],['ops-forecast',0,0,'第6期の予測：100個'],['ops-forecast',100,0,'第6期の予測：130個'],['ops-pert',4,2,'最短工期：12日'],['ops-pert',4,4,'A–B–D と A–C–D'],['ops-pert',4,7,'最短工期：15日'],['ops-qc',54,2,'Cp：1.67｜Cpk：1'],['ops-qc',50,2,'Cp：1.67｜Cpk：1.67']]){
 assert(run('diagramContent('+JSON.stringify(id)+','+a+','+b+')').includes(expected),id+' '+expected);
}
run('state=blank();page="study";selected="ops";render()');
assert(dom.innerHTML.includes('公式出題項目との対応'));
assert(dom.innerHTML.includes('商品補充・物流'));
for(const id of ['ops-04','ops-forecast','ops-pert','ops-qc']){run('selected='+JSON.stringify(id)+';render()');assert(dom.innerHTML.includes('data-diagram="'+id+'"'))}
const lawSubject=curriculum.subjects.find(s=>s.id==='law');
assert.equal(lawSubject.officialGroups.length,6);
assert.equal(lawSubject.topics.length,18);
assert(lawSubject.topics.every(t=>lessons[t.id]),'missing law lesson');
const lawQuestions=lawSubject.topics.flatMap(t=>lessons[t.id].questions);
const lawPositions=[0,1,2,3].map(i=>lawQuestions.filter(q=>q.answer===i).length);
assert(Math.max(...lawPositions)-Math.min(...lawPositions)<=1,'law answer position bias');
for(const t of lawSubject.topics){const l=lessons[t.id];assert(l.sections.length>=8,t.id+' explanation depth');assert(l.questions.length>=6,t.id+' exercise depth');assert(l.sources.length>0,t.id+' reference missing');for(const q of l.questions){assert.equal(new Set(q.options).size,q.options.length,q.id+' duplicate options');assert(q.explanations.every(e=>e.trim()),q.id+' missing rationale')}}
for(const [id,a,b,expected] of [['law-03',60,67,'出席定足数：充足'],['law-03',50,100,'出席定足数：不足'],['law-03',60,67,'特別決議 40個'],['law-03',60,50,'普通決議の必要賛成数 31個'],['law-04',60,50,'増資後の創業者比率：40%'],['law-04',100,0,'増資後の創業者比率：100%'],['law-04',60,100,'増資後の創業者比率：30%']]){
 assert(run('diagramContent('+JSON.stringify(id)+','+a+','+b+')').includes(expected),id+' '+expected)
}
run('state=blank();page="study";selected="law";render()');
assert(dom.innerHTML.includes('資本市場へのアクセスと手続'));
for(const id of ['law-03','law-04']){run('selected='+JSON.stringify(id)+';render()');assert(dom.innerHTML.includes('data-diagram="'+id+'"'));assert(dom.innerHTML.includes('参照資料・年度確認'))}
const itSubject=curriculum.subjects.find(s=>s.id==='it');
assert.equal(itSubject.officialGroups.length,12);
assert.equal(itSubject.topics.length,16);
assert(itSubject.topics.every(t=>lessons[t.id]),'missing IT lesson');
const itQs=itSubject.topics.flatMap(t=>lessons[t.id].questions);
assert.equal(itQs.length,104);
const itPositions=[0,1,2,3].map(i=>itQs.filter(q=>q.answer===i).length);
assert(Math.max(...itPositions)-Math.min(...itPositions)<=1,'IT answer position bias');
for(const t of itSubject.topics){const l=lessons[t.id];assert(l.sections.length>=8,t.id+' depth');assert(l.questions.length>=6,t.id+' exercises');for(const q of l.questions){assert.equal(new Set(q.options).size,q.options.length,q.id+' duplicate options');assert(q.explanations.every(e=>e.trim()),q.id+' missing rationale')}}
for(const id of ['it-07','it-08'])assert(lessons[id].sources.length>0,id+' sources');
for(const [id,a,b,expected] of [['it-performance',90,90,'81%'],['it-performance',90,90,'99%'],['it-performance',0,100,'0%'],['it-performance',0,100,'100%'],['it-project',50,65,'-10万円'],['it-project',50,65,'-15万円'],['it-project',60,60,'0万円'],['it-07',30,10,'75%'],['it-07',30,10,'60%'],['it-07',0,0,'未定義'],['it-07',50,0,'100%']]){
 assert(run('diagramContent('+JSON.stringify(id)+','+a+','+b+')').includes(expected),id+' '+expected);
}
run('state=blank();page="study";selected="it";render()');
assert(dom.innerHTML.includes('意思決定支援'));
for(const id of ['it-performance','it-project','it-07']){run('selected='+JSON.stringify(id)+';render()');assert(dom.innerHTML.includes('data-diagram="'+id+'"'))}
console.log('PASS: curriculum, lesson links, question integrity, read revisions, review, unique attempts, retention, backup validation and persistence.');

const sme=curriculum.subjects.find(s=>s.id==='sme');
assert.equal(sme.officialGroups.length,5);
assert(sme.topics.every(t=>lessons[t.id]));
assert(curriculum.subjects.filter(s=>s.stage===1).every(s=>s.topics.every(t=>lessons[t.id])));
const smeQs=sme.topics.flatMap(t=>lessons[t.id].questions);
assert.equal(smeQs.length,76);
for(const i of [0,1,2,3])assert.equal(smeQs.filter(q=>q.answer===i).length,19);
assert(new Set(sme.topics.map(t=>lessons[t.id].questions.slice(0,4).map(q=>q.answer).join(','))).size>=8,'predictable correct positions');
for(const t of sme.topics){const l=lessons[t.id];assert(l.sections.length>=8);assert(l.sources.length>=1);assert(l.questions.length>=4);for(const q of l.questions){assert.equal(new Set(q.options).size,4);assert(q.explanations.every(e=>e.trim()))}}
run('state=blank();page="study";selected="sme";render()');
assert(dom.innerHTML.includes('公式出題項目との対応'));
assert.equal(run('metrics(subject("sme")).available'),17);
run('selected="sme-01";render()');
assert(dom.innerHTML.includes('参照資料・年度確認'));
console.log('PASS: all primary subject draft topics, SME sources, scope and split data integration');
