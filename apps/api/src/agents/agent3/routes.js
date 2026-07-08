const recipeService = require('./recipeService');
const router  = require('express').Router();
const service = require('./service');

router.get('/status', (_,res) => res.json({ok:true,agent:'agent_3_inventory',status:'active'}));
router.get('/summary', async(req,res,next) => { try{res.json({ok:true,data:await service.getSummary(req.tenantId,req.locationIds)});}catch(e){next(e);} });

// Invoices
router.get('/invoices', async(req,res,next) => { try{const{locationId,status,category,limit}=req.query;res.json({ok:true,data:await service.getInvoices(req.tenantId,{locationId,status,category,limit})});}catch(e){next(e);} });
router.get('/invoices/:id', async(req,res,next) => { try{res.json({ok:true,data:await service.getInvoiceDetail(req.tenantId,req.params.id)});}catch(e){next(e);} });
router.post('/invoices/scan', async(req,res,next) => { try{res.json({ok:true,data:await service.scanInvoice(req.tenantId,{...req.body,userId:req.userId})});}catch(e){next(e);} });
router.post('/invoices/scan-bulk', async(req,res,next) => { try{res.json({ok:true,data:await service.scanBulkInvoices(req.tenantId,{...req.body,userId:req.userId})});}catch(e){next(e);} });
router.post('/invoices/:id/approve', async(req,res,next) => { try{res.json({ok:true,data:await service.approveInvoice(req.tenantId,req.params.id,req.userId)});}catch(e){next(e);} });
router.patch('/invoices/lines/:lineId', async(req,res,next) => { try{res.json({ok:true,data:await service.updateLineItem(req.tenantId,req.params.lineId,req.body)});}catch(e){next(e);} });

// Catalog items
router.get('/items', async(req,res,next) => { try{const{locationId,category,storageArea,search}=req.query;res.json({ok:true,data:await service.getItems(req.tenantId,{locationId,category,storageArea,search})});}catch(e){next(e);} });
router.post('/items', async(req,res,next) => { try{res.json({ok:true,data:await service.upsertItem(req.tenantId,req.body,req.userId)});}catch(e){next(e);} });
router.patch('/items/:id', async(req,res,next) => { try{res.json({ok:true,data:await service.upsertItem(req.tenantId,{...req.body,id:req.params.id},req.userId)});}catch(e){next(e);} });

// Physical counts
router.get('/counts', async(req,res,next) => { try{const{locationId,category,status}=req.query;res.json({ok:true,data:await service.getCounts(req.tenantId,{locationId,category,status})});}catch(e){next(e);} });
router.post('/counts', async(req,res,next) => { try{res.json({ok:true,data:await service.createCount(req.tenantId,{...req.body,userId:req.userId})});}catch(e){next(e);} });
router.get('/counts/:id', async(req,res,next) => { try{res.json({ok:true,data:await service.getCountDetail(req.tenantId,req.params.id)});}catch(e){next(e);} });
router.patch('/counts/lines/:lineId', async(req,res,next) => { try{res.json({ok:true,data:await service.updateCountLine(req.tenantId,req.params.lineId,req.body)});}catch(e){next(e);} });
router.post('/counts/:id/submit', async(req,res,next) => { try{res.json({ok:true,data:await service.submitCount(req.tenantId,req.params.id,req.userId)});}catch(e){next(e);} });

// COGS
// Vendor directory
router.get('/vendors', async (req,res,next)=>{ try{ res.json({ok:true,data:await service.getVendors(req.tenantId,{search:req.query.search,category:req.query.category,includeInactive:req.query.includeInactive==='true'})}); }catch(e){next(e);} });
router.post('/vendors', async (req,res,next)=>{ try{ res.json({ok:true,data:await service.addVendor(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/vendors/:id', async (req,res,next)=>{ try{ res.json({ok:true,data:await service.updateVendor(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.delete('/vendors/:id', async (req,res,next)=>{ try{ res.json({ok:true,data:await service.deleteVendor(req.tenantId,req.params.id)}); }catch(e){next(e);} });

router.get('/price-watch', async(req,res,next) => { try{const{locationId,thresholdPct}=req.query;res.json({ok:true,data:await service.getPriceWatch(req.tenantId,{locationId,thresholdPct:thresholdPct?parseFloat(thresholdPct):5})});}catch(e){next(e);} });
router.get('/food-cost-trend', async(req,res,next) => { try{const{locationId,weeks}=req.query;res.json({ok:true,data:await service.getFoodCostTrend(req.tenantId,{locationId,weeks:weeks?parseInt(weeks):12})});}catch(e){next(e);} });

router.get('/cogs', async(req,res,next) => { try{const{locationId,periodStart,periodEnd,category}=req.query;res.json({ok:true,data:await service.calculateCOGS(req.tenantId,{locationId,periodStart,periodEnd,category})});}catch(e){next(e);} });

// Delete invoice
router.delete('/invoices/:id', async(req,res,next) => { try{res.json({ok:true,data:await service.deleteInvoice(req.tenantId,req.params.id)});}catch(e){next(e);} });
// Delete item (soft delete)
router.delete('/items/:id', async(req,res,next) => { try{res.json({ok:true,data:await service.deleteItem(req.tenantId,req.params.id)});}catch(e){next(e);} });

// Email queue
router.get('/email-queue', async(req,res,next) => { try{res.json({ok:true,data:await service.getEmailQueue(req.tenantId,req.query.status)});}catch(e){next(e);} });
router.post('/email-queue/process', async(req,res,next) => { try{res.json({ok:true,data:await service.processEmailQueue(req.tenantId)});}catch(e){next(e);} });

// ── Purchase Orders / Order Lists
router.get('/orders/generate',        async(req,res,next)=>{ try{ const{locationId,category}=req.query; res.json({ok:true,data:await service.generateOrderList(req.tenantId,{locationId,category})}); }catch(e){next(e);} });
router.get('/orders',                 async(req,res,next)=>{ try{ const{locationId,status}=req.query; res.json({ok:true,data:await service.getPurchaseOrders(req.tenantId,{locationId,status})}); }catch(e){next(e);} });
router.get('/orders/:id',             async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getPurchaseOrder(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/orders',                async(req,res,next)=>{ try{ res.json({ok:true,data:await service.createPurchaseOrder(req.tenantId,{...req.body,createdBy:req.userId})}); }catch(e){next(e);} });
router.patch('/orders/:id/status',    async(req,res,next)=>{ try{ res.json({ok:true,data:await service.updatePurchaseOrderStatus(req.tenantId,req.params.id,req.body.status)}); }catch(e){next(e);} });
router.delete('/orders/:id',          async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deletePurchaseOrder(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/orders/:id/lines',      async(req,res,next)=>{ try{ res.json({ok:true,data:await service.addPurchaseOrderLine(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.patch('/orders/lines/:lineId', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.updatePurchaseOrderLine(req.tenantId,req.params.lineId,req.body)}); }catch(e){next(e);} });
router.delete('/orders/lines/:lineId',async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deletePurchaseOrderLine(req.tenantId,req.params.lineId)}); }catch(e){next(e);} });

// ── Recipes ──────────────────────────────────────────────────────────────────
router.get('/recipes',                     async(req,res,next)=>{ try{ const{locationId,category,type,search}=req.query; res.json({ok:true,data:await recipeService.getRecipes(req.tenantId,{locationId,category,type,search})}); }catch(e){next(e);} });
router.get('/recipes/costing',             async(req,res,next)=>{ try{ const{locationId,category}=req.query; res.json({ok:true,data:await recipeService.getCostingReport(req.tenantId,{locationId,category})}); }catch(e){next(e);} });
router.get('/recipes/:id',                 async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.getRecipeWithCost(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/recipes',                    async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.createRecipe(req.tenantId,{...req.body,createdBy:req.userId})}); }catch(e){next(e);} });
router.patch('/recipes/:id',               async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.updateRecipe(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.delete('/recipes/:id',              async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.deleteRecipe(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/recipes/:id/ingredients',    async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.addIngredientLine(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.patch('/recipes/ingredients/:lineId', async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.updateIngredientLine(req.tenantId,req.params.lineId,req.body)}); }catch(e){next(e);} });
router.delete('/recipes/ingredients/:lineId', async(req,res,next)=>{ try{ res.json({ok:true,data:await recipeService.deleteIngredientLine(req.tenantId,req.params.lineId)}); }catch(e){next(e);} });

module.exports = router;
