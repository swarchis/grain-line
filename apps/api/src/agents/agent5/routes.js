const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25*1024*1024 } });
const router  = require('express').Router();
const service = require('./service');

router.get('/status',  (_, res) => res.json({ ok:true, agent:'agent_5_cashpl', status:'active' }));
router.get('/summary', async (req,res,next) => { try { res.json({ ok:true, data: await service.getSummary(req.tenantId, req.query.locationId) }); } catch(e) { next(e); } });

// Plaid Link
router.post('/plaid/update-token/:id', async (req,res,next) => { try { res.json({ ok:true, data: await service.createUpdateLinkToken(req.tenantId, req.params.id, req.userId) }); } catch(e) { next(e); } });
router.post('/plaid/link-token', async (req,res,next) => { try { res.json({ ok:true, data: await service.createLinkToken(req.tenantId, req.userId) }); } catch(e) { next(e); } });
router.post('/plaid/exchange',   async (req,res,next) => { try { res.json({ ok:true, data: await service.exchangePublicToken(req.tenantId, { ...req.body, userId: req.userId }) }); } catch(e) { next(e); } });
router.get('/plaid/items',       async (req,res,next) => { try { res.json({ ok:true, data: await service.getItems(req.tenantId, req.query.locationId) }); } catch(e) { next(e); } });
router.delete('/plaid/items/:id',async (req,res,next) => { try { res.json({ ok:true, data: await service.removeItem(req.tenantId, req.params.id) }); } catch(e) { next(e); } });
router.post('/plaid/sync/:id',         async (req,res,next) => { try {
  // Try transactionsSync, then with reset cursor, then legacy
  let result = await service.syncTransactions(req.tenantId, req.params.id);
  if (result.synced === 0) result = await service.syncTransactions(req.tenantId, req.params.id, true);
  if (result.synced === 0) result = await service.syncTransactionsLegacy(req.tenantId, req.params.id);
  res.json({ ok:true, data: result });
} catch(e) { next(e); } });
router.post('/plaid/sandbox-fire/:id',   async (req,res,next) => { try { res.json({ ok:true, data: await service.syncTransactionsLegacy(req.tenantId, req.params.id) }); } catch(e) { next(e); } });
router.post('/plaid/sync-legacy/:id',    async (req,res,next) => { try { res.json({ ok:true, data: await service.syncTransactionsLegacy(req.tenantId, req.params.id) }); } catch(e) { next(e); } });
router.post('/plaid/sync-reset/:id',     async (req,res,next) => { try { res.json({ ok:true, data: await service.syncTransactions(req.tenantId, req.params.id, true) }); } catch(e) { next(e); } });

// P&L
router.post('/import', upload.single('file'), async(req,res,next)=>{ 
  try {
    if (!req.file) return res.status(400).json({ok:false,error:'No file uploaded'});
    const {locationId} = req.body;
    const result = await service.parseAndImportStatement(
      req.tenantId, locationId,
      req.file.buffer, req.file.originalname, req.file.mimetype
    );
    res.json({ok:true,data:result});
  }catch(e){next(e);}
});
router.get('/monthly', async(req,res,next)=>{ try{ const{locationId,months}=req.query; res.json({ok:true,data:await service.getMonthlyPL(req.tenantId,locationId,parseInt(months)||6)}); }catch(e){next(e);} });
router.get('/pl', async (req,res,next) => { try { const { locationId, periodStart, periodEnd, groupBy } = req.query; res.json({ ok:true, data: await service.getPL(req.tenantId, { locationId, periodStart, periodEnd, groupBy }) }); } catch(e) { next(e); } });

// Transactions
router.get('/transactions', async (req,res,next) => { try { const { locationId, periodStart, periodEnd, plCategory, search, limit } = req.query; res.json({ ok:true, data: await service.getTransactions(req.tenantId, { locationId, periodStart, periodEnd, plCategory, search, limit }) }); } catch(e) { next(e); } });
router.patch('/transactions/:id/category', async (req,res,next) => { try { res.json({ ok:true, data: await service.updateTransactionCategory(req.tenantId, req.params.id, req.body.plCategory) }); } catch(e) { next(e); } });

// Manual entries
router.post('/manual',   async (req,res,next) => { try { res.json({ ok:true, data: await service.createManualEntry(req.tenantId, { ...req.body, userId: req.userId }) }); } catch(e) { next(e); } });
router.delete('/manual/:id', async (req,res,next) => { try { res.json({ ok:true, data: await service.deleteManualEntry(req.tenantId, req.params.id) }); } catch(e) { next(e); } });

// Targets
router.post('/targets', async (req,res,next) => { try { res.json({ ok:true, data: await service.saveTargets(req.tenantId, req.body) }); } catch(e) { next(e); } });


// Custom categories
router.get('/categories',        async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getCustomCategories(req.tenantId)}); }catch(e){next(e);} });
router.post('/categories',       async(req,res,next)=>{ try{ res.json({ok:true,data:await service.saveCustomCategory(req.tenantId,req.body)}); }catch(e){next(e);} });
router.delete('/categories/:key',async(req,res,next)=>{ try{ await service.deleteCustomCategory(req.tenantId,req.params.key); res.json({ok:true}); }catch(e){next(e);} });

// Category rules (learned mappings)
router.get('/rules', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getCategoryRules(req.tenantId)}); }catch(e){next(e);} });

module.exports = router;
