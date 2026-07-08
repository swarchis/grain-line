'use strict';
const express = require('express');
const router  = express.Router();
const service = require('./service');

router.get('/monthly-sales',        async(req,res,next)=>{ try{ const{locationName,yearFrom,yearTo}=req.query; res.json({ok:true,data:await service.getMonthlySales(req.tenantId,{locationName,yearFrom,yearTo})}); }catch(e){next(e);} });
router.post('/monthly-sales',       async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertMonthlySales(req.tenantId,req.body)}); }catch(e){next(e);} });
router.delete('/monthly-sales',     async(req,res,next)=>{ try{ await service.deleteMonthlySales(req.tenantId,req.body); res.json({ok:true}); }catch(e){next(e);} });
router.get('/monthly-sales/locations', async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getLocations(req.tenantId)}); }catch(e){next(e);} });

router.get('/payroll',          async(req,res,next)=>{ try{ const{locationName,yearFrom,yearTo}=req.query; res.json({ok:true,data:await service.getWeeklyPayroll(req.tenantId,{locationName,yearFrom,yearTo})}); }catch(e){next(e);} });
router.post('/payroll',         async(req,res,next)=>{ try{ res.json({ok:true,data:await service.upsertWeeklyPayroll(req.tenantId,req.body)}); }catch(e){next(e);} });
router.get('/payroll/locations',async(req,res,next)=>{ try{ res.json({ok:true,data:await service.getPayrollLocations(req.tenantId)}); }catch(e){next(e);} });

module.exports = router;
