const router  = require('express').Router();
const service = require('./service');

router.get('/status',  (_,res) => res.json({ ok:true, agent:'agent_9_labor', status:'active' }));
router.get('/summary', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getSummary(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });

// Employees
router.get('/employees',     async(req,res,next)=>{ try{ const{locationId,status,position,department,archived}=req.query; res.json({ok:true,data:await service.getEmployees(req.tenantId,{locationId,status,position,department,archived:archived==='true'})}); }catch(e){next(e);} });
router.post('/employees',    async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertEmployee(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/employees/:id', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertEmployee(req.tenantId,{...req.body,id:req.params.id})}); }catch(e){next(e);} });
router.post('/employees/:id/archive',   async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertEmployee(req.tenantId,{id:req.params.id,archived:true,status:'inactive'})}); }catch(e){next(e);} });
router.post('/employees/:id/unarchive', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertEmployee(req.tenantId,{id:req.params.id,archived:false,status:'active'})}); }catch(e){next(e);} });
router.delete('/employees/:id', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deleteEmployee(req.tenantId,req.params.id)}); }catch(e){next(e);} });

// Time off requests
router.get('/time-off',              async(req,res,next)=>{ try{ const{locationId,status,employeeId}=req.query; res.json({ok:true,data:await service.getTimeOffRequests(req.tenantId,{locationId,status,employeeId})}); }catch(e){next(e);} });
router.post('/time-off',             async(req,res,next)=>{ try{ res.json({ok:true,data:await service.createTimeOffRequest(req.tenantId,{...req.body})}); }catch(e){next(e);} });
router.post('/time-off/:id/review',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.reviewTimeOffRequest(req.tenantId,req.params.id,{...req.body,reviewedBy:req.userId})}); }catch(e){next(e);} });

// Availability
router.get('/employees/:id/availability',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getAvailability(req.tenantId,req.params.id)}); }catch(e){next(e);} });
router.post('/employees/:id/availability', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.setAvailability(req.tenantId,req.params.id,req.body.entries||[])}); }catch(e){next(e);} });

// Schedule
router.get('/schedule',      async(req,res,next)=>{ try{ const{locationId,weekStart}=req.query; if(!locationId||!weekStart) return res.status(400).json({ok:false,error:'locationId and weekStart required'}); res.json({ok:true,data:await service.getScheduleWithShifts(req.tenantId,locationId,weekStart)}); }catch(e){ console.error('[agent9/schedule] error:', e.message, e.detail||'', e.code||''); next(e); } });
router.post('/schedule/copy', async(req,res,next)=>{ try{ const{locationId,fromWeekStart,toWeekStart}=req.body; res.json({ok:true,data:await service.copySchedule(req.tenantId,locationId,fromWeekStart,toWeekStart)}); }catch(e){next(e);} });
router.post('/schedule/:id/publish', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.publishSchedule(req.tenantId,req.params.id,req.userId)}); }catch(e){next(e);} });

// Shifts
router.post('/shifts',        async(req,res,next)=>{ try{ res.json({ok:true,data:await service.createShift(req.tenantId,req.body)}); }catch(e){next(e);} });
router.patch('/shifts/:id',   async(req,res,next)=>{ try{ res.json({ok:true,data:await service.updateShift(req.tenantId,req.params.id,req.body)}); }catch(e){next(e);} });
router.delete('/shifts/:id',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.deleteShift(req.tenantId,req.params.id)}); }catch(e){next(e);} });

// Requests
router.get('/requests',       async(req,res,next)=>{ try{ const{locationId,status}=req.query; res.json({ok:true,data:await service.getRequests(req.tenantId,{locationId,status})}); }catch(e){next(e);} });
router.post('/requests',      async(req,res,next)=>{ try{ res.json({ok:true,data:await service.createRequest(req.tenantId,req.body)}); }catch(e){next(e);} });
router.post('/requests/:id/review', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.reviewRequest(req.tenantId,req.params.id,{...req.body,reviewedBy:req.userId})}); }catch(e){next(e);} });

// Forecasting
router.get('/forecast',        async(req,res,next)=>{ try{ const{locationId,weekStart}=req.query; res.json({ok:true,data:await service.getForecast(req.tenantId,locationId,weekStart)}); }catch(e){next(e);} });
router.post('/forecast/generate', async(req,res,next)=>{ try{ const{locationId,weekStart}=req.body; res.json({ok:true,data:await service.generateForecast(req.tenantId,locationId,weekStart)}); }catch(e){next(e);} });

// Payroll
router.get('/payroll',         async(req,res,next)=>{ try{ const{locationId,weekStart}=req.query; res.json({ok:true,data:await service.getPayrollExport(req.tenantId,locationId,weekStart)}); }catch(e){next(e);} });

// Badges
router.post('/employees/:id/badges', async(req,res,next)=>{ try{ await service.awardBadge(req.tenantId,req.params.id,req.body.badgeKey); res.json({ok:true}); }catch(e){next(e);} });


// ── Messaging ─────────────────────────────────────────────────────────────────
router.get('/messages',        async(req,res,next)=>{ try{ const{locationId,channel,limit,before}=req.query; res.json({ok:true,data:await service.getMessages(req.tenantId,{locationId,channel,limit,before})}); }catch(e){next(e);} });
router.post('/messages',       async(req,res,next)=>{ try{ res.json({ok:true,data:await service.sendMessage(req.tenantId,{...req.body,senderId:req.userId})}); }catch(e){next(e);} });
router.patch('/messages/:id/pin', async(req,res,next)=>{ try{ await service.pinMessage(req.tenantId,req.params.id,req.body.pinned); res.json({ok:true}); }catch(e){next(e);} });
router.delete('/messages/:id', async(req,res,next)=>{ try{ await service.deleteMessage(req.tenantId,req.params.id); res.json({ok:true}); }catch(e){next(e);} });
router.post('/messages/read',  async(req,res,next)=>{ try{ await service.markRead(req.tenantId,req.body.employeeId,req.body.messageIds); res.json({ok:true}); }catch(e){next(e);} });


// ── Staff PWA endpoints ───────────────────────────────────────────────────────
// Public: staff PIN login (no authMiddleware — uses tenantSlug + locationId)
router.post('/staff/login', async(req,res,next)=>{ 
  try {
    const { locationId, pin, tenantId } = req.body;
    if (!locationId || !pin) return res.status(400).json({ok:false,error:'locationId and pin required'});
    const tId = tenantId || req.tenantId;
    if (!tId) return res.status(400).json({ok:false,error:'tenantId required'});
    const emp = await service.staffLogin(tId, locationId, pin);
    const { signToken } = require('../../middleware/auth');
    const token = signToken({ 
      tenantId: tId, userId: emp.id, role: 'staff',
      employeeId: emp.id, locationId: emp.locationId,
      firstName: emp.firstName, lastName: emp.lastName,
    });
    res.json({ ok:true, data:{ token, employee: emp } });
  } catch(e) { res.status(401).json({ok:false,error:e.message}); }
});

router.post('/staff/set-pin', async(req,res,next)=>{ try{ const{employeeId,pin}=req.body; await service.setStaffPin(req.tenantId,employeeId||req.userId,pin); res.json({ok:true}); }catch(e){next(e);} });
router.get('/staff/my-shifts',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getMyShifts(req.tenantId,req.userId,req.query.locationId)}); }catch(e){next(e);} });
router.get('/staff/my-team',    async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getMyTeam(req.tenantId,req.query.locationId)}); }catch(e){next(e);} });
router.get('/staff/messages',   async(req,res,next)=>{ try{ const{channel='all_staff',locationId}=req.query; res.json({ok:true,data:await service.getMessages(req.tenantId,{locationId,channel,limit:50})}); }catch(e){next(e);} });
router.post('/staff/messages',  async(req,res,next)=>{ try{ res.json({ok:true,data:await service.sendMessage(req.tenantId,{...req.body,senderId:req.userId})}); }catch(e){next(e);} });

module.exports = router;
