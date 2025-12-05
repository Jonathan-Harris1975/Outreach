import express from 'express';
import { serpOutreach } from '../services/serp-OutreachService.js';
import { extractGoodLeads } from '../utils/filters.js';
import { appendLeadRows } from '../services/sheetService.js';
import { runSequentialSerpSearches } from '../services/batchService.js';
const router=express.Router();
router.get('/health',(req,res)=>res.json({status:'ok'}));
router.post('/keyword',async(req,res)=>{
 const {keyword}=req.body;
 if(!keyword)return res.status(400).json({error:'keyword required'});
 try{
  const result=await serpOutreach(keyword);
  const good=extractGoodLeads(result,keyword);
  if(good.length){
    const rows=good.map(r=>[r.timestamp,r.keyword,r.domain,r.da,r.serpPosition,r.email,r.emailScore,r.leadScore]);
    await appendLeadRows(rows);
  }
  res.json({keyword,savedLeads:good.length});
 }catch(e){res.status(500).json({error:e.message});}
});
router.post('/batch',async(req,res)=>{
 try{
   const out=await runSequentialSerpSearches('keywords.txt');
   res.json(out);
 }catch(e){res.status(500).json({error:e.message});}
});
export default router;
