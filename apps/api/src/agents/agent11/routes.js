const router  = require('express').Router();
const service = require('./service');

router.get('/status',  (_,res) => res.json({ ok:true, agent:'agent_11_menu' }));
router.get('/summary', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getSummary(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });

// Sections
router.get('/sections',     async(req,res,next)=>{ try{ const{locationId,menuType}=req.query; res.json({ok:true,data:await service.getSections(req.tenantId,{locationId,menuType})}); }catch(e){next(e);} });
router.post('/sections',    async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertSection(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/sections/:id', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertSection(req.tenantId,{...req.body,id:req.params.id})}); }catch(e){next(e);} });
router.delete('/sections/:id', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deleteSection(req.tenantId,req.params.id)}); }catch(e){next(e);} });

// Menu items
router.get('/items',         async(req,res,next)=>{ try{ const{locationId,sectionId,available}=req.query; res.json({ok:true,data:await service.getMenuItems(req.tenantId,{locationId,sectionId,available:available==='true'?true:available==='false'?false:undefined})}); }catch(e){next(e);} });
router.post('/items',        async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertMenuItem(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/items/:id',   async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertMenuItem(req.tenantId,{...req.body,id:req.params.id})}); }catch(e){next(e);} });
router.delete('/items/:id',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deleteMenuItem(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/items/:id/sales', async(req,res,next)=>{ try{ const{locationId,weekStart,unitsSold,revenue}=req.body; res.json({ok:true,data:await service.upsertSales(req.tenantId,req.params.id,locationId,weekStart,unitsSold,revenue)}); }catch(e){next(e);} });

// Matrix & analysis
router.get('/matrix',        async(req,res,next)=>{ try{ const{locationId,menuType}=req.query; res.json({ok:true,data:await service.getMatrix(req.tenantId,{locationId,menuType})}); }catch(e){next(e);} });

// Pricing
router.get('/pricing/suggestions',         async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getPriceSuggestions(req.tenantId,{status:req.query.status})}); }catch(e){next(e);} });
router.post('/pricing/generate',           async(req,res,next)=>{ try{ res.json({ok:true,data:await service.generatePricingSuggestions(req.tenantId,req.body.locationId)}); }catch(e){next(e);} });
router.post('/pricing/suggestions/:id/apply',   async(req,res,next)=>{ try{ res.json({ok:true,data:await service.applyPriceSuggestion(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/pricing/suggestions/:id/dismiss', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.dismissPriceSuggestion(req.tenantId,req.params.id)}); }catch(e){next(e);} });

// Optimizations & simulations
router.post('/optimize',     async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getMenuOptimizations(req.tenantId,req.body.locationId)}); }catch(e){next(e);} });
router.post('/simulate',     async(req,res,next)=>{ try{ res.json({ok:true,data:await service.simulatePriceChange(req.tenantId,req.body)}); }catch(e){next(e);} });
router.post('/scan',           async(req,res,next)=>{ try{ const{fileBase64,mimeType,locationId}=req.body; if(!fileBase64||!mimeType) return res.status(400).json({ok:false,error:'fileBase64 and mimeType required'}); res.json({ok:true,data:await service.scanMenu(req.tenantId,{fileBase64,mimeType,locationId})}); }catch(e){next(e);} });
router.post('/import-recipes', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.importFromRecipes(req.tenantId,req.body.locationId)}); }catch(e){next(e);} });

module.exports = router;
