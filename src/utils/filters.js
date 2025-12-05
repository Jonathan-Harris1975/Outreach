export function extractGoodLeads(outreachResult, keyword){
 const MIN_LEAD_SCORE=60,MIN_EMAIL_SCORE=0.85;
 const out=[];
 outreachResult.leads.forEach(l=>{
  if(l.score<MIN_LEAD_SCORE)return;
  const da=l?.da?.da||0;
  l.emails.forEach(e=>{
   if(!e.valid)return;
   if(typeof e.score!=='number')return;
   if(e.score<MIN_EMAIL_SCORE)return;
   out.push({
     timestamp:new Date().toISOString(),
     keyword,domain:l.domain,da,
     serpPosition:l.serpPosition,
     email:e.email,emailScore:e.score,leadScore:l.score
   });
  });
 });
 return out;
}