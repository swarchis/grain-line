const router      = require('express').Router();
const service     = require('./service');
const mediaRoutes = require('./mediaRoutes');
const bulkRoutes  = require('./bulkRoutes');

router.get('/status', (_, res) => res.json({ ok:true, agent:'agent_1_marketing', status:'active' }));
router.get('/summary', async (req,res,next) => { try { res.json({ok:true,data:await service.getSummary(req.tenantId,req.locationIds)}); } catch(e){next(e);} });

// Media library
router.use('/media', mediaRoutes);
// Bulk calendar
router.use('/bulk', bulkRoutes);

// Posts
router.get('/posts', async (req,res,next) => { try { const{locationId,platform,status,from,to}=req.query; res.json({ok:true,data:await service.getPosts(req.tenantId,{locationId,platform,status,from,to})}); } catch(e){next(e);} });
router.post('/posts', async (req,res,next) => { try { res.json({ok:true,data:await service.createPost(req.tenantId,req.body,req.userId)}); } catch(e){next(e);} });
router.patch('/posts/:id', async (req,res,next) => { try { res.json({ok:true,data:await service.updatePost(req.tenantId,req.params.id,req.body)}); } catch(e){next(e);} });
router.delete('/posts/:id', async (req,res,next) => { try { await service.deletePost(req.tenantId,req.params.id); res.json({ok:true}); } catch(e){next(e);} });
router.post('/posts/generate', async (req,res,next) => { try { res.json({ok:true,data:await service.generateContent(req.tenantId,req.body)}); } catch(e){next(e);} });
router.post('/posts/:id/approve', async (req,res,next) => { try { res.json({ok:true,data:await service.approvePost(req.tenantId,req.params.id,req.body.scheduledAt)}); } catch(e){next(e);} });
router.post('/posts/:id/publish', async (req,res,next) => { try { res.json({ok:true,data:await service.publishPost(req.tenantId,req.params.id,req.userId)}); } catch(e){next(e);} });

// Trends
router.get('/trends', async (req,res,next) => { try { const{restaurantConcept,location}=req.query; res.json({ok:true,data:await service.getTrends(req.tenantId,{restaurantConcept,location})}); } catch(e){next(e);} });

// Ads
router.get('/ads', async (req,res,next) => { try { res.json({ok:true,data:await service.getAdBoosts(req.tenantId,{locationId:req.query.locationId})}); } catch(e){next(e);} });
router.post('/ads', async (req,res,next) => { try { res.json({ok:true,data:await service.createAdBoost(req.tenantId,req.body,req.userId)}); } catch(e){next(e);} });
router.get('/ads/insights', async (req,res,next) => { try { res.json({ok:true,data:await service.getAdInsights(req.tenantId,req.query.locationId,parseInt(req.query.days||30))}); } catch(e){next(e);} });

// Calendar & insights
router.get('/calendar', async (req,res,next) => { try { res.json({ok:true,data:await service.getCalendar(req.tenantId,req.query.locationId,req.query.month)}); } catch(e){next(e);} });
router.get('/insights', async (req,res,next) => { try { res.json({ok:true,data:await service.getInsights(req.tenantId,req.query.locationId,parseInt(req.query.days||30))}); } catch(e){next(e);} });


// ── Newsletter routes ─────────────────────────────────────────────────────────
router.get('/newsletter/contacts',       async(req,res,next)=>{ try{ const{locationId,subscribed,tag,search}=req.query; res.json({ok:true,data:await service.getContacts(req.tenantId,{locationId,subscribed:subscribed!==undefined?subscribed==='true':undefined,tag,search})}); }catch(e){next(e);} });
router.post('/newsletter/contacts',      async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertContact(req.tenantId,req.body.locationId,req.body)}); }catch(e){next(e);} });
router.delete('/newsletter/contacts/:id',async(req,res,next)=>{ try{ await service.deleteContact(req.tenantId,req.params.id); res.json({ok:true}); }catch(e){next(e);} });
router.post('/newsletter/import',        async(req,res,next)=>{ try{ const{locationId,csvText,source}=req.body; res.json({ok:true,data:await service.importContacts(req.tenantId,locationId,csvText,source)}); }catch(e){next(e);} });
router.get('/newsletter/unsubscribe',    async(req,res,next)=>{ try{ const{tid,email}=req.query; await service.unsubscribeContact(tid,email); res.send('<html><body style="font-family:sans-serif;padding:40px;text-align:center"><h2>You have been unsubscribed</h2><p>You will no longer receive emails from us.</p></body></html>'); }catch(e){next(e);} });

router.get('/newsletter/list',           async(req,res,next)=>{ try{ const{locationId,status}=req.query; res.json({ok:true,data:await service.getNewsletters(req.tenantId,{locationId,status})}); }catch(e){next(e);} });
router.post('/newsletter/save',          async(req,res,next)=>{ try{ res.json({ok:true,data:await service.saveNewsletter(req.tenantId,req.body.locationId,req.body,req.userId)}); }catch(e){next(e);} });
router.delete('/newsletter/:id',         async(req,res,next)=>{ try{ await service.deleteNewsletter(req.tenantId,req.params.id); res.json({ok:true}); }catch(e){next(e);} });
router.post('/newsletter/generate',      async(req,res,next)=>{ try{ res.json({ok:true,data:await service.generateNewsletter(req.tenantId,req.body)}); }catch(e){next(e);} });
router.post('/newsletter/send',          async(req,res,next)=>{ try{ const{newsletterId,locationId,testEmail,tags,contactIds}=req.body; res.json({ok:true,data:await service.sendNewsletter(req.tenantId,newsletterId,{locationId,testEmail,tags,contactIds})}); }catch(e){next(e);} });


// ── Text / WhatsApp campaign routes ──────────────────────────────────────────
router.get('/text/campaigns',      async(req,res,next)=>{ try{ const{locationId,status}=req.query; res.json({ok:true,data:await service.getTextCampaigns(req.tenantId,{locationId,status})}); }catch(e){next(e);} });
router.post('/text/campaigns',     async(req,res,next)=>{ try{ res.json({ok:true,data:await service.saveTextCampaign(req.tenantId,req.body.locationId,req.body,req.userId)}); }catch(e){next(e);} });
router.delete('/text/campaigns/:id',async(req,res,next)=>{ try{ await service.deleteTextCampaign(req.tenantId,req.params.id); res.json({ok:true}); }catch(e){next(e);} });
router.post('/text/generate',      async(req,res,next)=>{ try{ res.json({ok:true,data:await service.generateTextMessage(req.tenantId,req.body)}); }catch(e){next(e);} });
router.post('/text/send',          async(req,res,next)=>{ try{ const{campaignId,locationId,testPhone,tags}=req.body; res.json({ok:true,data:await service.sendTextCampaign(req.tenantId,campaignId,{locationId,testPhone,tags})}); }catch(e){next(e);} });
router.get('/text/stats',          async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getTextStats(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });
// Twilio opt-out webhook (STOP reply)
router.post('/text/optout',        async(req,res,next)=>{ try{
  const { From, To, Body } = req.body;
  // Only act on STOP-family keywords; resolve tenant by the number it was sent TO
  const stopWords = ['stop','stopall','unsubscribe','cancel','end','quit'];
  if (From && stopWords.includes(String(Body||'').trim().toLowerCase())) {
    await service.handleOptOutByNumber(From, To);
  }
  res.set('Content-Type','text/xml').send('<?xml version="1.0"?><Response><Message>You have been unsubscribed. Reply START to resubscribe.</Message></Response>');
}catch(e){next(e);} });

module.exports = router;
