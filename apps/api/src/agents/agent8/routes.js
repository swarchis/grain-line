const router  = require('express').Router();
const service = require('./service');

// ── PUBLIC routes (no auth — loyalty portal) ──────────────────────────────────
router.get('/portal/:code',   async (req,res,next) => { try { res.json({ ok:true, data: await service.getMemberPortal(req.params.code) }); } catch(e) { next(e); } });
router.post('/enroll',        async (req,res,next) => { try { const { tenantId, name, email, phone, referralCode } = req.body; if (!tenantId) return res.status(400).json({ ok:false, error:'tenantId required' }); res.json({ ok:true, data: await service.enrollMember(tenantId, { name, email, phone, referralCode }) }); } catch(e) { next(e); } });

// ── Authenticated routes ──────────────────────────────────────────────────────
router.get('/status',  (_,res) => res.json({ ok:true, agent:'agent_8_loyalty', status:'active' }));
router.get('/summary', async (req,res,next) => { try { res.json({ ok:true, data: await service.getSummary(req.tenantId, req.query.locationId) }); } catch(e) { next(e); } });
router.get('/config',  async (req,res,next) => { try { res.json({ ok:true, data: await service.getLoyaltyConfig(req.tenantId) }); } catch(e) { next(e); } });
router.post('/config', async (req,res,next) => { try { res.json({ ok:true, data: await service.saveLoyaltyConfig(req.tenantId, req.body) }); } catch(e) { next(e); } });

// Members
router.get('/members',         async (req,res,next) => { try { const {locationId,tier,search,limit,offset}=req.query; res.json({ok:true,data:await service.getMembers(req.tenantId,{locationId,tier,search,limit,offset})}); } catch(e){next(e);} });
router.post('/members',        async (req,res,next) => { try { res.json({ok:true,data:await service.createMember(req.tenantId,{...req.body,userId:req.userId})}); } catch(e){next(e);} });
router.get('/members/:id',     async (req,res,next) => { try { res.json({ok:true,data:await service.getMember(req.tenantId,req.params.id)}); } catch(e){next(e);} });
router.patch('/members/:id',   async (req,res,next) => { try { res.json({ok:true,data:await service.updateMember(req.tenantId,req.params.id,req.body)}); } catch(e){next(e);} });

// Points
router.post('/members/:id/visit',  async (req,res,next) => { try { res.json({ok:true,data:await service.recordVisit(req.tenantId,req.params.id,{...req.body,userId:req.userId})}); } catch(e){next(e);} });
router.post('/members/:id/award',  async (req,res,next) => { try { const{points,rule,reason,locationId}=req.body; res.json({ok:true,data:await service.awardPoints(req.tenantId,req.params.id,points,rule,reason,locationId,req.userId)}); } catch(e){next(e);} });
router.post('/members/:id/redeem', async (req,res,next) => { try { res.json({ok:true,data:await service.redeemPoints(req.tenantId,req.params.id,req.body.rewardId,req.body.locationId,req.userId)}); } catch(e){next(e);} });
router.post('/members/:id/adjust', async (req,res,next) => { try { res.json({ok:true,data:await service.adjustPoints(req.tenantId,req.params.id,req.body.points,req.body.reason,req.userId)}); } catch(e){next(e);} });

// Challenges
router.get('/challenges',          async (req,res,next) => { try { res.json({ok:true,data:await service.getChallenges(req.tenantId)}); } catch(e){next(e);} });
router.post('/challenges',         async (req,res,next) => { try { res.json({ok:true,data:await service.createChallenge(req.tenantId,req.body)}); } catch(e){next(e);} });
router.patch('/challenges/:id',    async (req,res,next) => { try { res.json({ok:true,data:await service.updateChallenge(req.tenantId,req.params.id,req.body)}); } catch(e){next(e);} });
router.delete('/challenges/:id',   async (req,res,next) => { try { res.json({ok:true,data:await service.deleteChallenge(req.tenantId,req.params.id)}); } catch(e){next(e);} });

// Campaigns
router.get('/campaigns',           async (req,res,next) => { try { res.json({ok:true,data:await service.getCampaigns(req.tenantId)}); } catch(e){next(e);} });
router.post('/campaigns',          async (req,res,next) => { try { res.json({ok:true,data:await service.createCampaign(req.tenantId,req.body,req.userId)}); } catch(e){next(e);} });
router.patch('/campaigns/:id',     async (req,res,next) => { try { res.json({ok:true,data:await service.updateCampaign(req.tenantId,req.params.id,req.body)}); } catch(e){next(e);} });
router.delete('/campaigns/:id',    async (req,res,next) => { try { res.json({ok:true,data:await service.deleteCampaign(req.tenantId,req.params.id)}); } catch(e){next(e);} });
router.post('/campaigns/:id/copy', async (req,res,next) => { try { res.json({ok:true,data:await service.generateCampaignCopy(req.tenantId,req.params.id)}); } catch(e){next(e);} });

// Leaderboard
router.get('/leaderboard', async (req,res,next) => { try { res.json({ok:true,data:await service.getLeaderboard(req.tenantId,req.query.metric,req.query.limit)}); } catch(e){next(e);} });

module.exports = router;
