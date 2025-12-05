import express from 'express';
import dotenv from 'dotenv';
import outreachRoutes from './routes/outreachRoutes.js';
dotenv.config();
const app=express();
app.use(express.json());
app.use('/api/outreach',outreachRoutes);
app.get('/health',(req,res)=>res.json({status:'ok'}));
app.listen(process.env.PORT||3000);