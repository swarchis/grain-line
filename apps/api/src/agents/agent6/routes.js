const gamService = require('./gamificationService');
const router  = require('express').Router();
const service = require('./service');

router.get('/status',            (_,res) => res.json({ ok:true, agent:'agent_6_training', status:'active' }));
router.get('/summary',           async (req,res,next) => { try { res.json({ ok:true, data: await service.getSummary(req.tenantId, req.query.locationId) }); } catch(e) { next(e); } });
router.get('/requirements',      (_,res) => res.json({ ok:true, data: { certifications: service.CA_CERTIFICATIONS, checklists: service.CHECKLIST_TEMPLATES, categories: service.DOC_CATEGORIES } }));

// Certifications
router.get('/certifications',    async (req,res,next) => { try { const {locationId,certKey,expiringSoon}=req.query; res.json({ ok:true, data: await service.getCertifications(req.tenantId,{locationId,certKey,expiringSoon:expiringSoon==='true'}) }); } catch(e) { next(e); } });
router.post('/certifications',   async (req,res,next) => { try { res.json({ ok:true, data: await service.addCertification(req.tenantId,{...req.body,createdBy:req.userId}) }); } catch(e) { next(e); } });
router.patch('/certifications/:id', async (req,res,next) => { try { res.json({ ok:true, data: await service.updateCertification(req.tenantId,req.params.id,req.body) }); } catch(e) { next(e); } });

// Checklists
router.get('/checklists',        async (req,res,next) => { try { const {locationId,checklistKey,limit}=req.query; res.json({ ok:true, data: await service.getChecklists(req.tenantId,{locationId,checklistKey,limit}) }); } catch(e) { next(e); } });
router.post('/checklists',       async (req,res,next) => { try { res.json({ ok:true, data: await service.submitChecklist(req.tenantId,{...req.body,completedBy:req.userId}) }); } catch(e) { next(e); } });

// Documents
router.get('/documents',         async (req,res,next) => { try { const {locationId,category,status}=req.query; res.json({ ok:true, data: await service.getDocuments(req.tenantId,{locationId,category,status}) }); } catch(e) { next(e); } });
router.post('/documents',        async (req,res,next) => { try { res.json({ ok:true, data: await service.addDocument(req.tenantId,{...req.body,createdBy:req.userId}) }); } catch(e) { next(e); } });
router.patch('/documents/:id',   async (req,res,next) => { try { res.json({ ok:true, data: await service.updateDocument(req.tenantId,req.params.id,req.body,req.user?.name) }); } catch(e) { next(e); } });
router.get('/documents/:id/versions', async (req,res,next) => { try { res.json({ ok:true, data: await service.getDocumentVersions(req.tenantId,req.params.id) }); } catch(e) { next(e); } });

// Alerts
router.get('/alerts',            async (req,res,next) => { try { const {locationId,resolved,severity}=req.query; res.json({ ok:true, data: await service.getAlerts(req.tenantId,{locationId,resolved:resolved==='true',severity}) }); } catch(e) { next(e); } });
router.post('/alerts/:id/resolve', async (req,res,next) => { try { res.json({ ok:true, data: await service.resolveAlert(req.tenantId,req.params.id,req.userId) }); } catch(e) { next(e); } });

// ── Gamification summary
router.get('/gamification/summary',          async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.getGamificationSummary(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });

// ── Learning modules
router.get('/modules',                       async(req,res,next)=>{ try{ const{locationId,category}=req.query; res.json({ok:true,data:await gamService.getModules(req.tenantId,{locationId,category})}); }catch(e){next(e);} });
router.post('/modules',                      async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.upsertModule(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/modules/:id',                 async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.upsertModule(req.tenantId,{...req.body,id:req.params.id})}); }catch(e){next(e);} });
router.delete('/modules/:id',                async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.deleteModule(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/modules/:id/complete',         async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.completeModule(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.get('/completions',                   async(req,res,next)=>{ try{ const{employeeId,moduleId}=req.query; res.json({ok:true,data:await gamService.getCompletions(req.tenantId,{employeeId,moduleId})}); }catch(e){next(e);} });

// ── Leaderboard & profiles
router.get('/leaderboard',                   async(req,res,next)=>{ try{ const{locationId,period,limit}=req.query; res.json({ok:true,data:await gamService.getLeaderboard(req.tenantId,{locationId,period,limit})}); }catch(e){next(e);} });
router.get('/profile/:employeeId',           async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.getEmployeeProfile(req.tenantId,req.params.employeeId)}); }catch(e){next(e);} });
router.post('/points',                       async(req,res,next)=>{ try{ const{employeeId,employeeName,pointType,points,referenceId}=req.body; res.json({ok:true,data:await gamService.awardPoints(req.tenantId,employeeId,employeeName,pointType,points,referenceId)}); }catch(e){next(e);} });

// ── Challenges
router.get('/challenges',                    async(req,res,next)=>{ try{ const{locationId,status}=req.query; res.json({ok:true,data:await gamService.getChallenges(req.tenantId,{locationId,status})}); }catch(e){next(e);} });
router.post('/challenges',                   async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.createChallenge(req.tenantId,{...req.body,createdBy:req.userId})}); }catch(e){next(e);} });
router.post('/challenges/:id/progress',      async(req,res,next)=>{ try{ const{employeeId,employeeName,progress}=req.body; res.json({ok:true,data:await gamService.updateChallengeProgress(req.tenantId,req.params.id,employeeId,employeeName,progress)}); }catch(e){next(e);} });

// ── Rewards
router.get('/rewards',                       async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.getRewards(req.tenantId)}); }catch(e){next(e);} });
router.post('/rewards',                      async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.upsertReward(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/rewards/:id',                 async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.upsertReward(req.tenantId,{...req.body,id:req.params.id})}); }catch(e){next(e);} });
router.post('/rewards/:id/claim',            async(req,res,next)=>{ try{ const{employeeId,employeeName}=req.body; res.json({ok:true,data:await gamService.claimReward(req.tenantId,req.params.id,employeeId,employeeName)}); }catch(e){next(e);} });
router.get('/reward-claims',                 async(req,res,next)=>{ try{ const{status,employeeId}=req.query; res.json({ok:true,data:await gamService.getRewardClaims(req.tenantId,{status,employeeId})}); }catch(e){next(e);} });
router.post('/reward-claims/:id/review',     async(req,res,next)=>{ try{ res.json({ok:true,data:await gamService.reviewRewardClaim(req.tenantId,req.params.id,{...req.body,reviewedBy:req.userId})}); }catch(e){next(e);} });

// ── AI Coaching
router.post('/coaching',                     async(req,res,next)=>{ try{ const{employeeId,employeeName}=req.body; res.json({ok:true,data:await gamService.getAICoaching(req.tenantId,employeeId,employeeName)}); }catch(e){next(e);} });

module.exports = router;
