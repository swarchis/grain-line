'use strict';
const router  = require('express').Router();
const service = require('./service');

router.get('/status',  (_, res) => res.json({ ok:true, agent:'agent_7_seo' }));
router.get('/summary', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getSummary(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });

// Keywords
router.get('/keywords',       async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getKeywords(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });
router.post('/keywords',      async(req,res,next)=>{ try{ const{locationId,keyword,...meta}=req.body; res.json({ok:true,data:await service.addKeyword(req.tenantId,locationId,keyword,meta)}); }catch(e){next(e);} });
router.delete('/keywords/:id',async(req,res,next)=>{ try{ await service.deleteKeyword(req.tenantId,req.params.id); res.json({ok:true}); }catch(e){next(e);} });
router.post('/keywords/generate',async(req,res,next)=>{ try{ res.json({ok:true,data:await service.generateKeywords(req.tenantId,req.body.locationId)}); }catch(e){next(e);} });

// Citations
router.get('/citations',       async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getCitations(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });
router.patch('/citations',     async(req,res,next)=>{ try{ const{locationId,platform,...data}=req.body; res.json({ok:true,data:await service.updateCitation(req.tenantId,locationId,platform,data)}); }catch(e){next(e);} });

// Website SEO
router.get('/website',        async(req,res,next)=>{ try{ const{locationId}=req.query; const [url,audit]=await Promise.all([service.getWebsiteUrl(req.tenantId,locationId),service.getLastAudit(req.tenantId,locationId)]); res.json({ok:true,data:{...url,lastAudit:audit}}); }catch(e){next(e);} });
router.post('/website/url',   async(req,res,next)=>{ try{ const{locationId,url}=req.body; if(!url) return res.status(400).json({ok:false,error:'url required'}); res.json({ok:true,data:await service.saveWebsiteUrl(req.tenantId,locationId,url)}); }catch(e){next(e);} });
router.post('/website/audit', async(req,res,next)=>{ try{ const{locationId,url}=req.body; if(!url) return res.status(400).json({ok:false,error:'url required'}); res.json({ok:true,data:await service.runWebsiteAudit(req.tenantId,locationId,url)}); }catch(e){next(e);} });

// Recommendations
router.post('/recommendations',async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getRecommendations(req.tenantId,req.body.locationId)}); }catch(e){next(e);} });

module.exports = router;
