'use strict';
const router  = require('express').Router();
const service = require('./service');

router.get('/monday-brief',       async (req,res,next)=>{ try{ res.json({ok:true,data:await service.generateMondayBrief(req.tenantId)}); }catch(e){ res.status(400).json({ok:false,error:e.message}); } });
router.post('/monday-brief/send', async (req,res,next)=>{ try{ res.json({ok:true,data:await service.sendMondayBrief(req.tenantId)}); }catch(e){ res.status(400).json({ok:false,error:e.message}); } });
router.get('/marketing-roi',      async (req,res,next)=>{ try{ res.json({ok:true,data:await service.marketingRoi(req.tenantId,{locationId:req.query.locationId})}); }catch(e){next(e);} });
router.get('/labor-vs-demand',    async (req,res,next)=>{ try{ res.json({ok:true,data:await service.laborVsDemand(req.tenantId,{weeks:parseInt(req.query.weeks)||12})}); }catch(e){next(e);} });

module.exports = router;
