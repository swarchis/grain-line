import React, { useState, useEffect, useCallback, useRef } from 'react';
import { agent9, locations as locationsApi } from '../../lib/api.js';

function getTenantId() {
  try {
    const token = localStorage.getItem('ros_token');
    if (!token) return '';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.tenantId || '';
  } catch { return ''; }
}

const DAY_NAMES = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const DAY_FULL  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const POSITIONS = {
  management: ['General Manager','Assistant Manager','Bar Manager','Kitchen Manager','Shift Lead'],
  foh: ['Server','Host/Hostess','Bartender','Barback','Busser','Food Runner','Cashier'],
  boh: ['Executive Chef','Sous Chef','Line Cook','Prep Cook','Dishwasher','Expeditor'],
};
const ALL_POSITIONS = [...POSITIONS.management, ...POSITIONS.foh, ...POSITIONS.boh];
const DEPT_LABELS = { management:'Management', foh:'Front of House', boh:'Back of House' };
const POS_COLORS = {
  'Server':'#4A90D9','Host/Hostess':'#7B68EE','Bartender':'#E8A020','Barback':'#F0A060',
  'Busser':'#5BA85B','Food Runner':'#20A080','Cashier':'#A060D0',
  'Executive Chef':'#E24B4A','Sous Chef':'#C03030','Line Cook':'#D05030',
  'Prep Cook':'#C06040','Dishwasher':'#8090A0','Expeditor':'#708060',
  'General Manager':'#2060A0','Assistant Manager':'#3070B0','Bar Manager':'#C07820',
  'Kitchen Manager':'#A03020','Shift Lead':'#6080C0',
};
const posColor = p => POS_COLORS[p] || '#666';
const fmtTime = t => { if (!t) return ''; const [h,m]=t.split(':'); const hr=parseInt(h); return `${hr>12?hr-12:hr||12}:${m}${hr>=12?'pm':'am'}`; };
const fmtCurrency = v => v!=null ? `$${parseFloat(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}` : '—';
const fmtDate = d => d ? new Date(d+'T12:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—';
const empName = e => e ? `${e.first_name||''} ${e.last_name||''}`.trim() || e.name || '—' : '—';
function getWeekStart(date=new Date()) { const d=new Date(date); const dow=d.getDay(); d.setDate(d.getDate()-(dow===0?6:dow-1)); return d.toISOString().slice(0,10); }
function getWeekDates(ws) { return Array.from({length:7},(_,i)=>{ const d=new Date(ws+'T12:00'); d.setDate(d.getDate()+i); return d.toISOString().slice(0,10); }); }
function addWeeks(ws,n) { const d=new Date(ws+'T12:00'); d.setDate(d.getDate()+n*7); return d.toISOString().slice(0,10); }

const CHANNELS = [
  { id:'all_staff',   label:'📢 All Staff',   desc:'Announcements to everyone' },
  { id:'management',  label:'👔 Management',  desc:'Managers only' },
  { id:'foh',         label:'🍽 Front of House', desc:'FOH team' },
  { id:'boh',         label:'🍳 Back of House',  desc:'BOH team' },
  { id:'general',     label:'💬 General',     desc:'Open discussion' },
];

export default function Agent9Labor_Scheduling() {
  const [tab, setTab]               = useState('schedule');
  const [locations, setLocations]   = useState([]);
  const [loc, setLoc]               = useState(null);
  const [weekStart, setWeekStart]   = useState(getWeekStart());
  const [schedData, setSchedData]   = useState(null);
  const [employees, setEmployees]   = useState([]);
  const [archived, setArchived]     = useState([]);
  const [requests, setRequests]     = useState([]);
  const [timeOff, setTimeOff]       = useState([]);
  const [forecast, setForecast]     = useState([]);
  const [payroll, setPayroll]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState(null);
  const [deptFilter, setDeptFilter] = useState('all');
  const [schedView, setSchedView]   = useState('role');
  const [showAddShift, setShowAddShift]         = useState(null);
  const [showAddEmployee, setShowAddEmployee]   = useState(null);
  const [showAvailability, setShowAvailability] = useState(null);
  const [showTimeOffForm, setShowTimeOffForm]   = useState(null);
  const [showArchived, setShowArchived]         = useState(false);
  const [generating, setGenerating] = useState(false);
  const [copying, setCopying]       = useState(false);
  const [showStaffLink, setShowStaffLink] = useState(false);
  // Messaging
  const [msgChannel, setMsgChannel] = useState('all_staff');
  const [messages, setMessages]     = useState([]);
  const [msgInput, setMsgInput]     = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [senderName, setSenderName] = useState('Manager');
  const msgEndRef = useRef(null);

  const showToast = (msg,err=false) => { setToast({msg,err}); setTimeout(()=>setToast(null),3500); };

  useEffect(() => {
    locationsApi.list().then(locs=>{ setLocations(locs||[]); if(locs?.length) setLoc(locs[0]); }).catch(()=>{});
  }, []);

  const loadSchedule = useCallback(async () => {
    if (!loc?.id) return;
    setLoading(true);
    try {
      const [sched, emps] = await Promise.all([
        agent9.schedule(loc.id, weekStart),
        agent9.employees({ locationId: loc.id }),
      ]);
      setSchedData(sched);
      setEmployees(Array.isArray(emps) ? emps : []);
    } catch(e) { showToast('Failed to load schedule: '+(e.message||e), true); }
    finally { setLoading(false); }
  }, [loc, weekStart]);

  useEffect(() => { loadSchedule(); }, [loadSchedule]);

  useEffect(() => {
    if (!loc?.id) return;
    if (tab==='requests') {
      agent9.requests({locationId:loc.id,status:'pending'}).then(r=>setRequests(Array.isArray(r)?r:[])).catch(()=>{});
      agent9.timeOff({locationId:loc.id,status:'pending'}).then(r=>setTimeOff(Array.isArray(r)?r:[])).catch(()=>{});
    }
    if (tab==='forecast') agent9.forecast(loc.id,weekStart).then(r=>setForecast(Array.isArray(r)?r:[])).catch(()=>{});
    if (tab==='payroll')  agent9.payroll(loc.id,weekStart).then(r=>setPayroll(Array.isArray(r)?r:[])).catch(()=>{});
    if (tab==='employees'&&showArchived) agent9.employees({archived:true}).then(r=>setArchived(Array.isArray(r)?r:[])).catch(()=>{});
    if (tab==='messages') loadMessages(msgChannel);
  }, [tab, loc, weekStart, showArchived]);

  const loadMessages = async (channel) => {
    if (!loc?.id) return;
    try {
      const msgs = await agent9.messages({ locationId: loc.id, channel, limit: 100 });
      setMessages(Array.isArray(msgs) ? msgs : []);
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 100);
    } catch(e) {}
  };

  useEffect(() => {
    if (tab==='messages') loadMessages(msgChannel);
  }, [msgChannel, tab, loc]);

  const handleSendMessage = async () => {
    if (!msgInput.trim()) return;
    setMsgSending(true);
    try {
      const msg = await agent9.sendMessage({
        locationId: loc.id,
        channel: msgChannel,
        senderName,
        senderRole: 'manager',
        content: msgInput.trim(),
      });
      setMessages(m => [...m, msg]);
      setMsgInput('');
      setTimeout(() => msgEndRef.current?.scrollIntoView({ behavior:'smooth' }), 50);
    } catch(e) { showToast(e.message, true); }
    finally { setMsgSending(false); }
  };

  const handlePublish = async () => {
    if (!schedData?.schedule?.id) return;
    try {
      const result = await agent9.publishSchedule(schedData.schedule.id);
      setSchedData(sd=>({...sd,schedule:{...sd.schedule,status:'published'}}));
      const {emailResults} = result || {};
      if (emailResults) {
        const parts = [`Schedule published for ${result.weekLabel||''}`];
        if (emailResults.sent > 0)    parts.push(`📧 ${emailResults.sent} email${emailResults.sent!==1?'s':''} sent`);
        if (emailResults.noEmail > 0) parts.push(`${emailResults.noEmail} staff have no email on file`);
        showToast(parts.join(' · '));
      } else {
        showToast('Schedule published — staff notified in All Staff channel');
      }
    }
    catch(e) { showToast(e.message,true); }
  };

  const handleCopyWeek = async () => {
    setCopying(true);
    try { const to=addWeeks(weekStart,1); await agent9.copySchedule({locationId:loc.id,fromWeekStart:weekStart,toWeekStart:to}); setWeekStart(to); showToast('Copied to next week'); }
    catch(e) { showToast(e.message,true); }
    finally { setCopying(false); }
  };

  const handleDeleteShift = async id => {
    await agent9.deleteShift(id);
    setSchedData(sd=>({...sd,shifts:sd.shifts.filter(s=>s.id!==id)}));
  };

  const handleArchive = async (emp) => {
    if (!confirm(`Archive ${empName(emp)}?`)) return;
    await agent9.archiveEmployee(emp.id);
    setEmployees(e=>e.filter(x=>x.id!==emp.id));
    showToast(`${empName(emp)} archived`);
  };

  const handleReview = async (type,id,approved) => {
    if (type==='swap') await agent9.reviewRequest(id,{approved});
    else await agent9.reviewTimeOff(id,{approved});
    if (type==='swap') setRequests(r=>r.filter(x=>x.id!==id));
    else setTimeOff(r=>r.filter(x=>x.id!==id));
    showToast(approved?'Approved':'Declined');
    if (approved&&type==='swap') loadSchedule();
  };

  const weekDates    = getWeekDates(weekStart);
  const shifts       = schedData?.shifts || [];
  const schedule     = schedData?.schedule;
  const otAlerts     = schedData?.overtimeAlerts || [];
  const totalHours   = schedData?.totalHours || 0;
  const totalCost    = schedData?.totalCost || 0;
  const pendingCount = requests.length + timeOff.length;

  const filteredShifts = deptFilter==='all' ? shifts : shifts.filter(s => {
    const pos = s.position||s.employee_position||'';
    return POSITIONS[deptFilter]?.includes(pos);
  });
  const filteredEmps = deptFilter==='all' ? employees : employees.filter(e =>
    e.department===deptFilter || POSITIONS[deptFilter]?.includes(e.position)
  );

  const tabs = [
    { id:'schedule',   label:'📅 Schedule' },
    { id:'employees',  label:`👥 Team (${employees.length})` },
    { id:'requests',   label:`📋 Requests${pendingCount>0?` (${pendingCount})`:''}` },
    { id:'violations', label:`⚠ Violations${otAlerts.length>0?` (${otAlerts.length})`:''}` },
    { id:'forecast',   label:'🤖 Forecast' },
    { id:'payroll',    label:'💰 Payroll' },
    { id:'messages',   label:'💬 Messages' },
  ];

  return (
    <div>
      <div className="topbar">
        <div className="topbar-left">
          <h1 className="page-title">Labor & Scheduling</h1>
          <div className="page-sub">{loc?.name||'Select location'}</div>
        </div>
        <div className="topbar-right" style={{flexWrap:'wrap',gap:6}}>
          <select className="form-select" style={{fontSize:12}} value={loc?.id||''} onChange={e=>setLoc(locations.find(l=>l.id===e.target.value)||null)}>
            {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          {tab==='schedule' && (
            <>
              <button className="btn btn-sm" onClick={()=>setWeekStart(w=>addWeeks(w,-1))}>←</button>
              <span style={{fontSize:12,fontWeight:500,whiteSpace:'nowrap',minWidth:160,textAlign:'center'}}>{fmtDate(weekStart)} – {fmtDate(weekDates[6])}</span>
              <button className="btn btn-sm" onClick={()=>setWeekStart(w=>addWeeks(w,1))}>→</button>
              <button className="btn btn-sm" onClick={()=>setWeekStart(getWeekStart())}>Today</button>
              <button className="btn btn-sm" onClick={handleCopyWeek} disabled={copying} title="Copy this week's schedule to next week">{copying?'Copying…':'Copy week →'}</button>
              {schedule?.status!=='published'
                ? <button className="btn btn-primary" onClick={handlePublish} style={{minWidth:120,justifyContent:'center'}}>
                    📢 Publish schedule
                  </button>
                : <button className="btn" onClick={handlePublish} style={{background:'#0A2A1A',color:'#3ECF8E',border:'1px solid #3ECF8E30',minWidth:120,justifyContent:'center'}}>
                    ✓ Published
                  </button>
              }
            </>
          )}
          <button className="btn btn-sm" onClick={()=>setShowStaffLink(true)} title="Open or share staff PWA">📱 Staff app</button>
          {tab==='employees' && <button className="btn btn-primary btn-sm" onClick={()=>setShowAddEmployee({})}>+ Add employee</button>}
        </div>
      </div>

      <div className="content">
        <div style={{display:'flex',gap:2,marginBottom:16,borderBottom:'1px solid var(--border)',overflowX:'auto'}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:'7px 14px',background:'none',border:'none',borderBottom:`2px solid ${tab===t.id?'var(--gold)':'transparent'}`,color:tab===t.id?'var(--gold)':'var(--ink-3)',fontSize:13,cursor:'pointer',fontWeight:tab===t.id?600:400,whiteSpace:'nowrap'}}>
              {t.label}
            </button>
          ))}
        </div>

        {/* ── SCHEDULE ───────────────────────────────────────────────────────── */}
        {tab==='schedule' && (
          <div style={{display:'flex',flexDirection:'column',height:'calc(100vh - 200px)',minHeight:600}}>
            {/* Topbar controls */}
            <div style={{display:'flex',gap:8,marginBottom:10,alignItems:'center',flexWrap:'wrap'}}>
              <div style={{display:'flex',gap:4}}>
                {['all','management','foh','boh'].map(d=>(
                  <button key={d} onClick={()=>setDeptFilter(d)} style={{padding:'4px 10px',fontSize:11,borderRadius:6,cursor:'pointer',border:`1px solid ${deptFilter===d?'var(--gold)':'var(--border)'}`,background:deptFilter===d?'var(--gold-bg)':'transparent',color:deptFilter===d?'var(--gold)':'var(--ink-3)',fontWeight:deptFilter===d?600:400}}>
                    {d==='all'?'All':DEPT_LABELS[d]}
                  </button>
                ))}
              </div>
              <div style={{display:'flex',gap:4,borderLeft:'1px solid var(--border)',paddingLeft:8}}>
                {['role','employee'].map(v=>(
                  <button key={v} onClick={()=>setSchedView(v)} style={{padding:'4px 10px',fontSize:11,borderRadius:6,cursor:'pointer',border:`1px solid ${schedView===v?'var(--gold)':'var(--border)'}`,background:schedView===v?'var(--gold-bg)':'transparent',color:schedView===v?'var(--gold)':'var(--ink-3)'}}>
                    By {v}
                  </button>
                ))}
              </div>
              <div style={{flex:1}}/>
              {otAlerts.length>0 && (
                <button onClick={()=>setTab('violations')} style={{padding:'4px 12px',fontSize:11,borderRadius:6,background:'#2A1010',border:'1px solid #F26C6C30',color:'#F26C6C',cursor:'pointer',fontWeight:600}}>
                  🚨 {otAlerts.length} OT alert{otAlerts.length!==1?'s':''}
                </button>
              )}
              <div style={{fontSize:12,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>
                <span style={{color:'var(--gold)',fontWeight:700}}>{fmtCurrency(totalCost)}</span>
                <span style={{marginLeft:8}}>{parseFloat(totalHours).toFixed(1)}h total</span>
              </div>
            </div>

            {loading ? <div className="spinner" style={{margin:'60px auto'}}/> : (
              <div style={{display:'flex',flex:1,overflow:'hidden',border:'1px solid var(--border)',borderRadius:10}}>
                {/* Main grid */}
                <div style={{flex:1,overflowX:'auto',overflowY:'auto'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:800}}>
                    {/* Day header */}
                    <thead style={{position:'sticky',top:0,zIndex:3}}>
                      <tr style={{background:'var(--bg-2)',borderBottom:'2px solid var(--border)'}}>
                        <th style={{padding:'8px 14px',textAlign:'left',fontSize:11,color:'var(--ink-3)',fontWeight:600,minWidth:180,position:'sticky',left:0,background:'var(--bg-2)',zIndex:4,borderRight:'1px solid var(--border)'}}>
                          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                            <span>Employee</span>
                            <button onClick={()=>setShowAddEmployee({})} style={{fontSize:10,padding:'2px 7px',borderRadius:5,border:'1px solid var(--border)',background:'transparent',color:'var(--ink-3)',cursor:'pointer'}}>+ Add</button>
                          </div>
                        </th>
                        {weekDates.map((date,i)=>{
                          const dayShifts = filteredShifts.filter(s=>s.shift_date===date);
                          const dayHours = dayShifts.reduce((s,sh)=>s+parseFloat(sh.shift_hours||0),0);
                          const dayCost  = dayShifts.reduce((s,sh)=>{ const h=parseFloat(sh.shift_hours||0),r=parseFloat(sh.wage_rate||0); return s+(sh.wage_type==='hourly'?h*r:r/52/40*h*40); },0);
                          const isToday  = date===new Date().toISOString().slice(0,10);
                          return (
                            <th key={date} style={{padding:'6px 8px',textAlign:'center',fontSize:11,minWidth:120,background:isToday?'rgba(184,116,26,.08)':'var(--bg-2)',borderLeft:'1px solid var(--border)',borderRight:'1px solid var(--border)'}}>
                              <div style={{fontWeight:700,fontSize:13,color:isToday?'var(--gold)':'var(--ink)'}}>{DAY_NAMES[i]}</div>
                              <div style={{fontSize:10,color:'var(--ink-3)'}}>{fmtDate(date)}</div>
                              <div style={{display:'flex',justifyContent:'center',gap:6,marginTop:3,fontSize:10,color:'var(--ink-3)'}}>
                                <span>👤 {dayShifts.filter(s=>s.employee_id).length}</span>
                                <span style={{color:isToday?'var(--gold)':'var(--ink-3)',fontFamily:'var(--mono)'}}>{dayHours.toFixed(1)}h</span>
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {schedView==='employee' ? (
                        <>
                          {filteredEmps.length===0&&!loading&&(
                            <tr><td colSpan={8} style={{padding:'48px',textAlign:'center',color:'var(--ink-3)'}}>
                              <div style={{fontSize:16,marginBottom:8}}>👥</div>
                              <div style={{fontWeight:600,marginBottom:4}}>No employees yet</div>
                              <div style={{fontSize:12}}>Add employees to start scheduling</div>
                            </td></tr>
                          )}
                          {filteredEmps.map(emp=>{
                            const empShifts = filteredShifts.filter(s=>s.employee_id===emp.id);
                            const weekHrs   = empShifts.reduce((s,sh)=>s+parseFloat(sh.shift_hours||0),0);
                            const weekCost  = empShifts.reduce((s,sh)=>{ const h=parseFloat(sh.shift_hours||0),r=parseFloat(sh.wage_rate||0); return s+(sh.wage_type==='hourly'?h*r:r/52/40*h*40); },0);
                            const isOT      = otAlerts.some(a=>a.employeeId===emp.id);
                            return (
                              <tr key={emp.id} style={{borderBottom:'1px solid var(--border)'}}>
                                <td style={{padding:'8px 14px',position:'sticky',left:0,background:'var(--bg)',zIndex:2,borderRight:'1px solid var(--border)',verticalAlign:'top'}}>
                                  <div style={{display:'flex',alignItems:'center',gap:10}}>
                                    <div style={{width:32,height:32,borderRadius:'50%',background:posColor(emp.position),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>
                                      {(emp.first_name||'?')[0].toUpperCase()}
                                    </div>
                                    <div style={{minWidth:0}}>
                                      <div style={{fontWeight:600,fontSize:12,display:'flex',alignItems:'center',gap:5}}>
                                        {empName(emp)}
                                        {isOT&&<span style={{fontSize:9,padding:'1px 5px',borderRadius:10,background:'#2A1010',color:'#F26C6C',fontWeight:700}}>OT</span>}
                                      </div>
                                      <div style={{fontSize:10,color:posColor(emp.position)}}>{emp.position}</div>
                                      <div style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--mono)',marginTop:1}}>
                                        {weekHrs.toFixed(1)}h · {fmtCurrency(weekCost)}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                {weekDates.map(date=>{
                                  const dayShifts = empShifts.filter(s=>s.shift_date===date);
                                  return (
                                    <td key={date} style={{padding:'4px',verticalAlign:'top',borderLeft:'1px solid var(--border)',minHeight:60,cursor:'pointer'}}
                                      onClick={()=>{ if(!showAddShift) setShowAddShift({date,employeeId:emp.id,position:emp.position,scheduleId:schedule?.id,locationId:loc?.id}); }}>
                                      {dayShifts.map(sh=>(
                                        <ShiftBlock key={sh.id} shift={sh}
                                          onEdit={e=>{e.stopPropagation();setShowAddShift({shift:sh,scheduleId:schedule?.id,locationId:loc?.id});}}
                                          onDelete={e=>{e.stopPropagation();handleDeleteShift(sh.id);}}/>
                                      ))}
                                      {dayShifts.length===0&&(
                                        <div style={{height:52,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--border)',fontSize:18,borderRadius:6,transition:'background .15s'}}
                                          onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                                          onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                                          +
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                          {/* Open shifts row */}
                          {filteredShifts.filter(s=>!s.employee_id).length>0&&(
                            <tr style={{borderBottom:'1px solid var(--border)',background:'var(--bg-2)'}}>
                              <td style={{padding:'8px 14px',position:'sticky',left:0,background:'var(--bg-2)',zIndex:2,borderRight:'1px solid var(--border)',fontSize:12,color:'var(--ink-3)',fontStyle:'italic',fontWeight:500}}>Open shifts</td>
                              {weekDates.map(date=>{
                                const dayShifts = filteredShifts.filter(s=>s.shift_date===date&&!s.employee_id);
                                return (
                                  <td key={date} style={{padding:'4px',verticalAlign:'top',borderLeft:'1px solid var(--border)'}}>
                                    {dayShifts.map(sh=><ShiftBlock key={sh.id} shift={sh} onEdit={e=>{e.stopPropagation();setShowAddShift({shift:sh,scheduleId:schedule?.id,locationId:loc?.id});}} onDelete={e=>{e.stopPropagation();handleDeleteShift(sh.id);}}/>)}
                                  </td>
                                );
                              })}
                            </tr>
                          )}
                        </>
                      ) : (
                        // By role view
                        Object.entries(POSITIONS).filter(([dept])=>deptFilter==='all'||dept===deptFilter).map(([dept,positions])=>{
                          const deptShifts = filteredShifts.filter(s=>positions.includes(s.position||s.employee_position||''));
                          const activePos  = positions.filter(pos=>deptShifts.some(s=>(s.position||s.employee_position)===pos));
                          if (activePos.length===0&&deptFilter!=='all') return null;
                          return (
                            <React.Fragment key={dept}>
                              <tr style={{background:'var(--bg-2)'}}>
                                <td colSpan={8} style={{padding:'5px 14px',fontSize:10,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.1em',position:'sticky',left:0}}>{DEPT_LABELS[dept]}</td>
                              </tr>
                              {positions.map(pos=>{
                                const posShifts = filteredShifts.filter(s=>(s.position||s.employee_position)===pos);
                                if (posShifts.length===0&&deptFilter!=='all') return null;
                                return (
                                  <tr key={pos} style={{borderBottom:'1px solid var(--border)'}}>
                                    <td style={{padding:'8px 14px',position:'sticky',left:0,background:'var(--bg)',zIndex:2,borderRight:'1px solid var(--border)',verticalAlign:'top'}}>
                                      <div style={{display:'flex',alignItems:'center',gap:7}}>
                                        <span style={{width:10,height:10,borderRadius:'50%',background:posColor(pos),flexShrink:0}}/>
                                        <div>
                                          <div style={{fontSize:12,fontWeight:600}}>{pos}</div>
                                          <div style={{fontSize:10,color:'var(--ink-3)'}}>{posShifts.length} shift{posShifts.length!==1?'s':''}</div>
                                        </div>
                                      </div>
                                    </td>
                                    {weekDates.map(date=>{
                                      const dayShifts = posShifts.filter(s=>s.shift_date===date);
                                      return (
                                        <td key={date} style={{padding:'4px',verticalAlign:'top',borderLeft:'1px solid var(--border)',cursor:'pointer'}}
                                          onClick={()=>{ if(!showAddShift) setShowAddShift({date,position:pos,scheduleId:schedule?.id,locationId:loc?.id}); }}>
                                          {dayShifts.map(sh=><ShiftBlock key={sh.id} shift={sh} showEmployee onEdit={e=>{e.stopPropagation();setShowAddShift({shift:sh,scheduleId:schedule?.id,locationId:loc?.id});}} onDelete={e=>{e.stopPropagation();handleDeleteShift(sh.id);}}/>)}
                                          {dayShifts.length===0&&(
                                            <div style={{height:44,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--border)',fontSize:18,borderRadius:6}}
                                              onMouseEnter={e=>e.currentTarget.style.background='var(--bg-2)'}
                                              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>+</div>
                                          )}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Side panel for adding/editing shifts */}
                {showAddShift && (
                  <div style={{width:320,borderLeft:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',flexDirection:'column',flexShrink:0}}>
                    <ShiftPanel
                      data={showAddShift}
                      employees={employees}
                      weekDates={weekDates}
                      schedule={schedule}
                      loc={loc}
                      onClose={()=>setShowAddShift(null)}
                      onSaved={sh=>{
                        setSchedData(sd=>({...sd,shifts:showAddShift.shift?sd.shifts.map(s=>s.id===sh.id?{...s,...sh}:s):[...sd.shifts,sh]}));
                        setShowAddShift(null);
                        showToast('Shift saved');
                        loadSchedule();
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Bottom actuals bar — like 7shifts */}
            {!loading&&shifts.length>0&&(
              <div style={{display:'flex',marginTop:8,border:'1px solid var(--border)',borderRadius:8,overflow:'hidden',fontSize:11,background:'var(--bg-2)'}}>
                <div style={{padding:'8px 14px',minWidth:180,borderRight:'1px solid var(--border)',display:'flex',alignItems:'center',gap:6,background:'var(--bg-2)'}}>
                  <span style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em'}}>Weekly totals</span>
                </div>
                {weekDates.map(date=>{
                  const dayShifts = filteredShifts.filter(s=>s.shift_date===date);
                  const dayHrs  = dayShifts.reduce((s,sh)=>s+parseFloat(sh.shift_hours||0),0);
                  const dayCost = dayShifts.reduce((s,sh)=>{ const h=parseFloat(sh.shift_hours||0),r=parseFloat(sh.wage_rate||0); return s+(sh.wage_type==='hourly'?h*r:r/52/40*h*40); },0);
                  return (
                    <div key={date} style={{flex:1,padding:'6px 8px',textAlign:'center',borderRight:'1px solid var(--border)'}}>
                      <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:12,color:'var(--gold)'}}>{dayHrs.toFixed(1)}h</div>
                      <div style={{fontSize:10,color:'var(--ink-3)'}}>{fmtCurrency(dayCost)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── VIOLATIONS ─────────────────────────────────────────────────────── */}
        {tab==='violations' && (
          <div>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>Labor violations & alerts</div>
              <div style={{fontSize:12,color:'var(--ink-3)'}}>Overtime warnings, compliance issues, and scheduling conflicts for the current week.</div>
            </div>
            {otAlerts.length===0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">✅</div>
                <div className="empty-state-title">No violations this week</div>
                <div className="empty-state-sub">All staff are within scheduled hours and no compliance issues detected.</div>
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:8}}>
                {otAlerts.map((a,i)=>(
                  <div key={i} style={{display:'flex',gap:12,alignItems:'flex-start',padding:'14px 16px',background:a.severity==='critical'?'#2A1010':'#2A2010',borderRadius:10,border:`1px solid ${a.severity==='critical'?'#F26C6C30':'#E8A02030'}`}}>
                    <span style={{fontSize:20,flexShrink:0}}>{a.severity==='critical'?'🚨':'⚠️'}</span>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:13,color:a.severity==='critical'?'#F26C6C':'#E8A020',marginBottom:3}}>{a.name}</div>
                      <div style={{fontSize:12,color:'var(--ink-2)'}}>{a.message}</div>
                      {a.hours && <div style={{fontSize:11,color:'var(--ink-3)',marginTop:4,fontFamily:'var(--mono)'}}>Scheduled: {parseFloat(a.hours).toFixed(1)}h this week</div>}
                    </div>
                    <span style={{fontSize:10,padding:'3px 10px',borderRadius:20,background:a.severity==='critical'?'rgba(242,108,108,.15)':'rgba(232,160,32,.15)',color:a.severity==='critical'?'#F26C6C':'#E8A020',fontWeight:700,textTransform:'uppercase',flexShrink:0}}>
                      {a.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div style={{marginTop:24,padding:'16px',background:'var(--bg-2)',borderRadius:10,border:'1px solid var(--border)'}}>
              <div style={{fontSize:11,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>CA Labor Law Reference</div>
              {[
                ['Overtime','Over 8h/day or 40h/week = 1.5×; over 12h/day = 2×'],
                ['Double time','Over 12 hours in a day or 8+ hours on 7th consecutive day'],
                ['Meal break','30 min unpaid meal break if shift > 5 hours'],
                ['Rest break','10 min paid rest break for every 4 hours worked'],
                ['Split shift','Premium pay if two distinct work periods in a day'],
              ].map(([rule,detail])=>(
                <div key={rule} style={{display:'flex',gap:10,padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:12}}>
                  <span style={{fontWeight:600,minWidth:100,color:'var(--ink-2)'}}>{rule}</span>
                  <span style={{color:'var(--ink-3)'}}>{detail}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── EMPLOYEES ──────────────────────────────────────────────────────── */}
        {tab==='employees' && (
          <div>
            <div style={{display:'flex',gap:8,marginBottom:16,alignItems:'center'}}>
              {['all','management','foh','boh'].map(d=>(
                <button key={d} onClick={()=>setDeptFilter(d)} style={{padding:'5px 12px',fontSize:11,borderRadius:20,cursor:'pointer',border:`1px solid ${deptFilter===d?'var(--gold)':'var(--border)'}`,background:deptFilter===d?'var(--gold-bg)':'transparent',color:deptFilter===d?'var(--gold)':'var(--ink-3)',fontWeight:deptFilter===d?600:400}}>
                  {d==='all'?'All':DEPT_LABELS[d]}
                </button>
              ))}
              <div style={{flex:1}}/>
              <button onClick={()=>setShowArchived(a=>!a)} style={{padding:'5px 12px',fontSize:11,borderRadius:20,cursor:'pointer',border:'1px solid var(--border)',background:'transparent',color:'var(--ink-3)'}}>
                {showArchived?'← Active':'View archived'}
              </button>
            </div>
            {showArchived ? (
              <div>
                <div style={{fontSize:13,color:'var(--ink-3)',marginBottom:12}}>Archived employees</div>
                {archived.length===0 ? <div className="empty-state"><div className="empty-state-title">No archived employees</div></div> : (
                  <div className="card">
                    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                      <thead><tr style={{borderBottom:'1px solid var(--border)'}}>{['Name','Position',''].map(h=><th key={h} style={{padding:'8px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase'}}>{h}</th>)}</tr></thead>
                      <tbody>
                        {archived.map(emp=>(
                          <tr key={emp.id} style={{borderBottom:'1px solid var(--border)'}}>
                            <td style={{padding:'10px 16px',fontWeight:500}}>{empName(emp)}</td>
                            <td style={{padding:'10px 16px',fontSize:12,color:'var(--ink-3)'}}>{emp.position||'—'}</td>
                            <td style={{padding:'10px 16px'}}><button className="btn btn-sm" onClick={async()=>{ await agent9.unarchiveEmployee(emp.id); setArchived(a=>a.filter(x=>x.id!==emp.id)); showToast(`${empName(emp)} restored`); }}>Restore</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ) : (
              Object.entries(POSITIONS).filter(([d])=>deptFilter==='all'||d===deptFilter).map(([dept,positions])=>{
                const deptEmps = employees.filter(e=>e.department===dept||positions.includes(e.position||''));
                if (deptEmps.length===0) return null;
                return (
                  <div key={dept} style={{marginBottom:20}}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>{DEPT_LABELS[dept]} ({deptEmps.length})</div>
                    <div className="card">
                      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                        <thead><tr style={{borderBottom:'1px solid var(--border)'}}>{['Name','Position','Wage','Hire date','Status',''].map(h=><th key={h} style={{padding:'8px 16px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                        <tbody>
                          {deptEmps.map(emp=>(
                            <tr key={emp.id} style={{borderBottom:'1px solid var(--border)'}}>
                              <td style={{padding:'10px 16px'}}>
                                <div style={{fontWeight:500}}>{empName(emp)}</div>
                                {emp.email&&<div style={{fontSize:11,color:'var(--ink-3)'}}>{emp.email}</div>}
                              </td>
                              <td style={{padding:'10px 16px'}}><span style={{fontSize:11,padding:'2px 8px',borderRadius:4,background:posColor(emp.position)+'20',color:posColor(emp.position),fontWeight:500}}>{emp.position||'—'}</span></td>
                              <td style={{padding:'10px 16px',fontFamily:'var(--mono)',fontSize:12}}>{emp.wage_rate?`$${parseFloat(emp.wage_rate).toFixed(2)}/${emp.wage_type==='hourly'?'hr':'yr'}`:'—'}</td>
                              <td style={{padding:'10px 16px',fontSize:12,color:'var(--ink-3)'}}>{fmtDate(emp.hire_date)}</td>
                              <td style={{padding:'10px 16px'}}><span style={{fontSize:10,fontWeight:600,padding:'2px 8px',borderRadius:20,background:emp.status==='active'?'#0A2A1A':'#2A2A2A',color:emp.status==='active'?'#3ECF8E':'#666'}}>{emp.status}</span></td>
                              <td style={{padding:'10px 16px'}}>
                                <div style={{display:'flex',gap:6}}>
                                  <button className="btn btn-sm" onClick={()=>setShowAddEmployee(emp)}>Edit</button>
                                  <button className="btn btn-sm" onClick={()=>setShowAvailability(emp)}>Availability</button>
                                  <button className="btn btn-sm" onClick={()=>handleArchive(emp)} style={{color:'var(--ink-3)'}}>Archive</button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })
            )}
            {employees.length===0&&!showArchived&&<div className="empty-state"><div className="empty-state-title">No employees yet</div><div className="empty-state-sub">Add your team to start scheduling</div></div>}
          </div>
        )}

        {/* ── REQUESTS ───────────────────────────────────────────────────────── */}
        {tab==='requests' && (
          <div>
            {requests.length===0&&timeOff.length===0 ? (
              <div className="empty-state"><div className="empty-state-title">No pending requests</div><div className="empty-state-sub">Swap and time-off requests will appear here</div></div>
            ) : (
              <>
                {requests.length>0&&<><div style={{fontSize:11,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Shift swaps</div><div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>{requests.map(req=><RequestCard key={req.id} req={req} type="swap" onApprove={()=>handleReview('swap',req.id,true)} onDecline={()=>handleReview('swap',req.id,false)}/>)}</div></>}
                {timeOff.length>0&&<><div style={{fontSize:11,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:10}}>Time off</div><div style={{display:'flex',flexDirection:'column',gap:8}}>{timeOff.map(req=><RequestCard key={req.id} req={req} type="time_off" onApprove={()=>handleReview('time_off',req.id,true)} onDecline={()=>handleReview('time_off',req.id,false)}/>)}</div></>}
              </>
            )}
            <div style={{marginTop:20}}><button className="btn btn-sm" onClick={()=>setShowTimeOffForm({})}>+ Submit time off request</button></div>
          </div>
        )}

        {/* ── FORECAST ───────────────────────────────────────────────────────── */}
        {tab==='forecast' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20}}>
              <div>
                <div style={{fontSize:14,fontWeight:600,marginBottom:4}}>AI Labor Forecast</div>
                <div style={{fontSize:12,color:'var(--ink-3)'}}>AI-generated staffing recommendations based on historical sales patterns.</div>
              </div>
              <button className="btn btn-primary btn-sm" onClick={async()=>{ setGenerating(true); try{ const r=await agent9.generateForecast(loc.id,weekStart); setForecast(Array.isArray(r)?r:[]); showToast('Forecast generated'); }catch(e){showToast(e.message,true);}finally{setGenerating(false);} }} disabled={generating}>
                {generating?'🤖 Generating…':'🤖 Generate forecast'}
              </button>
            </div>
            {forecast.length===0 ? <div className="empty-state"><div className="empty-state-title">No forecast yet</div><div className="empty-state-sub">Click Generate to get AI staffing recommendations for this week</div></div> : (
              <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10}}>
                {forecast.map((d,i)=>(
                  <div key={i} className="card" style={{padding:'14px'}}>
                    <div style={{fontWeight:700,fontSize:12,marginBottom:1}}>{DAY_FULL[new Date(d.forecast_date+'T12:00').getDay()]}</div>
                    <div style={{fontSize:10,color:'var(--ink-3)',marginBottom:10}}>{fmtDate(d.forecast_date)}</div>
                    {[{label:'Sales',val:`$${Math.round(d.projected_sales||0).toLocaleString()}`,color:'var(--gold)'},{label:'Hours',val:`${d.recommended_hours||0}h`,color:'var(--ink)'},{label:'FOH',val:`${d.foh_staff||0} staff`,color:'#4A90D9'},{label:'BOH',val:`${d.boh_staff||0} staff`,color:'#E24B4A'},{label:'Labor %',val:`${d.labor_pct_target||30}%`,color:'var(--ink-3)'}].map((s,j)=>(
                      <div key={j} style={{marginBottom:6}}>
                        <div style={{fontSize:9,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:1}}>{s.label}</div>
                        <div style={{fontFamily:'var(--mono)',fontSize:12,fontWeight:600,color:s.color}}>{s.val}</div>
                      </div>
                    ))}
                    {d.notes&&<div style={{fontSize:10,color:'var(--ink-3)',marginTop:6,lineHeight:1.4}}>{d.notes}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── PAYROLL ────────────────────────────────────────────────────────── */}
        {tab==='payroll' && (
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:600}}>Payroll — week of {weekStart}</div>
              <button className="btn btn-sm" onClick={()=>{ const csv=['Name,Position,Type,Rate,Shifts,Hours,OT,Total',...payroll.map(r=>`${r.first_name} ${r.last_name},${r.position||''},${r.wage_type},$${r.wage_rate||0},${r.shift_count},${parseFloat(r.total_hours||0).toFixed(2)},${parseFloat(r.ot_hours||0).toFixed(2)},$${parseFloat(r.total_pay||0).toFixed(2)}`)].join('\n'); const a=document.createElement('a'); a.href=`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`; a.download=`payroll_${loc?.name||''}_${weekStart}.csv`; a.click(); }}>Export CSV</button>
            </div>
            {payroll.length===0 ? <div className="empty-state"><div className="empty-state-title">No payroll data</div></div> : (
              <div className="card"><div style={{overflowX:'auto'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead><tr style={{borderBottom:'1px solid var(--border)'}}>{['Employee','Position','Type','Rate','Shifts','Hours','OT','Total'].map(h=><th key={h} style={{padding:'8px 14px',textAlign:'left',fontSize:10,fontWeight:600,color:'var(--ink-3)',textTransform:'uppercase',whiteSpace:'nowrap'}}>{h}</th>)}</tr></thead>
                  <tbody>
                    {payroll.map((row,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--border)'}}>
                        <td style={{padding:'10px 14px',fontWeight:500}}>{row.first_name} {row.last_name}</td>
                        <td style={{padding:'10px 14px',fontSize:12,color:'var(--ink-3)'}}>{row.position||'—'}</td>
                        <td style={{padding:'10px 14px',fontSize:11,textTransform:'capitalize',color:'var(--ink-3)'}}>{row.wage_type}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontSize:12}}>${parseFloat(row.wage_rate||0).toFixed(2)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)',textAlign:'center'}}>{row.shift_count}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)'}}>{parseFloat(row.total_hours||0).toFixed(2)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)',color:parseFloat(row.ot_hours||0)>0?'#F26C6C':'var(--ink-3)'}}>{parseFloat(row.ot_hours||0).toFixed(2)}</td>
                        <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontWeight:700,color:'var(--gold)'}}>{fmtCurrency(row.total_pay)}</td>
                      </tr>
                    ))}
                    <tr style={{borderTop:'2px solid var(--border)'}}>
                      <td colSpan={5} style={{padding:'10px 14px',fontWeight:600,color:'var(--ink-3)',textAlign:'right'}}>Totals</td>
                      <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontWeight:700}}>{payroll.reduce((s,r)=>s+parseFloat(r.total_hours||0),0).toFixed(2)}</td>
                      <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontWeight:700,color:'#F26C6C'}}>{payroll.reduce((s,r)=>s+parseFloat(r.ot_hours||0),0).toFixed(2)}</td>
                      <td style={{padding:'10px 14px',fontFamily:'var(--mono)',fontWeight:700,color:'var(--gold)',fontSize:14}}>{fmtCurrency(payroll.reduce((s,r)=>s+parseFloat(r.total_pay||0),0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div></div>
            )}
          </div>
        )}

        {/* ── MESSAGES ───────────────────────────────────────────────────────── */}
        {tab==='messages' && (
          <div style={{display:'grid',gridTemplateColumns:'220px 1fr',gap:0,height:'calc(100vh - 240px)',minHeight:500,border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
            {/* Channel sidebar */}
            <div style={{borderRight:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',flexDirection:'column'}}>
              <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',fontSize:12,fontWeight:700,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.08em'}}>
                Channels
              </div>
              <div style={{flex:1,overflowY:'auto',padding:'8px 8px'}}>
                {CHANNELS.map(ch=>(
                  <button key={ch.id} onClick={()=>setMsgChannel(ch.id)} style={{width:'100%',textAlign:'left',padding:'9px 12px',borderRadius:8,border:'none',background:msgChannel===ch.id?'var(--gold-bg)':'transparent',color:msgChannel===ch.id?'var(--gold)':'var(--ink-2)',cursor:'pointer',fontSize:13,fontWeight:msgChannel===ch.id?600:400,marginBottom:2}}>
                    <div>{ch.label}</div>
                    <div style={{fontSize:10,color:msgChannel===ch.id?'var(--gold)':'var(--ink-3)',fontWeight:400,marginTop:1}}>{ch.desc}</div>
                  </button>
                ))}
              </div>
              <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)'}}>
                <div style={{fontSize:10,color:'var(--ink-3)',marginBottom:4,textTransform:'uppercase',letterSpacing:'.06em'}}>Sending as</div>
                <input className="form-input" value={senderName} onChange={e=>setSenderName(e.target.value)} style={{fontSize:12}} placeholder="Your name"/>
              </div>
            </div>

            {/* Message area */}
            <div style={{display:'flex',flexDirection:'column',background:'var(--bg)'}}>
              {/* Channel header */}
              <div style={{padding:'12px 20px',borderBottom:'1px solid var(--border)',background:'var(--bg-2)',display:'flex',alignItems:'center',gap:10}}>
                <div>
                  <div style={{fontWeight:700,fontSize:14}}>{CHANNELS.find(c=>c.id===msgChannel)?.label}</div>
                  <div style={{fontSize:11,color:'var(--ink-3)'}}>{CHANNELS.find(c=>c.id===msgChannel)?.desc}</div>
                </div>
              </div>

              {/* Messages list */}
              <div style={{flex:1,overflowY:'auto',padding:'16px 20px',display:'flex',flexDirection:'column',gap:2}}>
                {messages.length===0 ? (
                  <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--ink-3)',flexDirection:'column',gap:8}}>
                    <span style={{fontSize:32}}>💬</span>
                    <span style={{fontSize:14,fontWeight:500}}>No messages yet</span>
                    <span style={{fontSize:12}}>Be the first to post in {CHANNELS.find(c=>c.id===msgChannel)?.label}</span>
                  </div>
                ) : (
                  messages.map((msg,i)=>{
                    const isAnnouncement = msg.msg_type==='announcement';
                    const showDate = i===0 || new Date(messages[i-1].created_at).toDateString()!==new Date(msg.created_at).toDateString();
                    return (
                      <React.Fragment key={msg.id}>
                        {showDate && (
                          <div style={{textAlign:'center',margin:'12px 0 8px',fontSize:11,color:'var(--ink-3)'}}>
                            {new Date(msg.created_at).toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})}
                          </div>
                        )}
                        <div style={{display:'flex',gap:10,alignItems:'flex-start',padding:'6px 8px',borderRadius:8,background:isAnnouncement?'rgba(184,116,26,.06)':msg.pinned?'rgba(74,144,217,.06)':'transparent',border:isAnnouncement?'1px solid var(--gold-border)':msg.pinned?'1px solid rgba(74,144,217,.2)':'1px solid transparent'}}>
                          <div style={{width:32,height:32,borderRadius:'50%',background:posColor(msg.sender_role||'staff'),display:'flex',alignItems:'center',justifyContent:'center',fontSize:13,fontWeight:700,color:'#fff',flexShrink:0}}>
                            {(msg.sender_name||'?')[0].toUpperCase()}
                          </div>
                          <div style={{flex:1,minWidth:0}}>
                            <div style={{display:'flex',gap:8,alignItems:'baseline',marginBottom:2}}>
                              <span style={{fontWeight:600,fontSize:13}}>{msg.sender_name}</span>
                              <span style={{fontSize:10,color:'var(--ink-3)'}}>{new Date(msg.created_at).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</span>
                              {isAnnouncement&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:10,background:'var(--gold-bg)',color:'var(--gold)',fontWeight:700}}>ANNOUNCEMENT</span>}
                              {msg.pinned&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:10,background:'rgba(74,144,217,.12)',color:'#4A90D9',fontWeight:700}}>📌 PINNED</span>}
                            </div>
                            <div style={{fontSize:13,color:'var(--ink)',lineHeight:1.5,wordBreak:'break-word'}}>{msg.content}</div>
                          </div>
                          <button onClick={async()=>{ await agent9.deleteMessage(msg.id); setMessages(m=>m.filter(x=>x.id!==msg.id)); }} style={{background:'none',border:'none',color:'var(--ink-4)',cursor:'pointer',fontSize:14,opacity:.5,flexShrink:0}}>✕</button>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={msgEndRef}/>
              </div>

              {/* Message input */}
              <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',background:'var(--bg-2)'}}>
                <div style={{display:'flex',gap:8,alignItems:'flex-end'}}>
                  <div style={{flex:1}}>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={msgInput}
                      onChange={e=>setMsgInput(e.target.value)}
                      onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSendMessage();} }}
                      placeholder={`Message ${CHANNELS.find(c=>c.id===msgChannel)?.label}… (Enter to send, Shift+Enter for newline)`}
                      style={{fontSize:13,resize:'none'}}
                    />
                  </div>
                  <div style={{display:'flex',flexDirection:'column',gap:4}}>
                    <button className="btn btn-primary btn-sm" onClick={handleSendMessage} disabled={msgSending||!msgInput.trim()} style={{justifyContent:'center'}}>
                      {msgSending?'…':'Send'}
                    </button>
                    <button className="btn btn-sm" title="Send as announcement" onClick={async()=>{
                      if(!msgInput.trim()) return;
                      setMsgSending(true);
                      try {
                        const msg = await agent9.sendMessage({locationId:loc.id,channel:msgChannel,senderName,senderRole:'manager',content:msgInput.trim(),msgType:'announcement'});
                        setMessages(m=>[...m,msg]); setMsgInput('');
                        setTimeout(()=>msgEndRef.current?.scrollIntoView({behavior:'smooth'}),50);
                      }catch(e){showToast(e.message,true);}
                      finally{setMsgSending(false);}
                    }} disabled={msgSending||!msgInput.trim()} style={{justifyContent:'center',fontSize:11}}>
                      📢
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ShiftPanel is inline in schedule tab */}
      {showAddEmployee&&<EmployeeModal employee={showAddEmployee} locations={locations} locationId={loc?.id} onClose={()=>setShowAddEmployee(null)} onSaved={emp=>{ setEmployees(e=>{ const idx=e.findIndex(x=>x.id===emp.id); if(idx>=0){const n=[...e];n[idx]=emp;return n;} return [emp,...e]; }); setShowAddEmployee(null); showToast(`${empName(emp)} saved`); }}/>}
      {showAvailability&&<AvailabilityModal employee={showAvailability} onClose={()=>setShowAvailability(null)} onSaved={()=>{ setShowAvailability(null); showToast('Availability updated'); }}/>}
      {showTimeOffForm&&<TimeOffModal employees={employees} locationId={loc?.id} onClose={()=>setShowTimeOffForm(null)} onSaved={()=>{ setShowTimeOffForm(null); showToast('Time off request submitted'); }}/>}
      {showStaffLink && (
        <StaffLinkModal
          url={`${window.location.origin}/staff?t=${getTenantId()}&l=${loc?.id||''}`}
          onClose={()=>setShowStaffLink(false)}
        />
      )}
      {toast&&<div className="toast" style={{background:toast.err?'#E24B4A':'var(--ink)'}}>{toast.err?'⚠':'✓'} {toast.msg}</div>}
    </div>
  );
}


function ShiftBlock({shift, showEmployee, onEdit, onDelete}) {
  const color = posColor(shift.position||shift.employee_position);
  const name  = shift.first_name ? `${shift.first_name} ${shift.last_name||''}`.trim() : null;
  const hrs   = parseFloat(shift.shift_hours||0).toFixed(1);
  return (
    <div onClick={onEdit} style={{background:`${color}18`,border:`1px solid ${color}40`,borderLeft:`3px solid ${color}`,borderRadius:6,padding:'5px 8px',marginBottom:3,cursor:'pointer',transition:'background .15s'}}
      onMouseEnter={e=>e.currentTarget.style.background=`${color}28`}
      onMouseLeave={e=>e.currentTarget.style.background=`${color}18`}>
      {showEmployee && name && <div style={{fontSize:10,fontWeight:700,color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>}
      {!showEmployee && <div style={{fontSize:10,fontWeight:700,color,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{shift.position||'Open'}</div>}
      <div style={{fontSize:11,color:'var(--ink-2)',fontWeight:500}}>{fmtTime(shift.start_time)}–{fmtTime(shift.end_time)}</div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:2}}>
        <span style={{fontSize:10,color:'var(--ink-3)',fontFamily:'var(--mono)'}}>{hrs}h</span>
        <button onClick={onDelete} style={{background:'none',border:'none',cursor:'pointer',color:'var(--ink-4)',fontSize:12,padding:'0 2px',lineHeight:1}}>✕</button>
      </div>
    </div>
  );
}

function ShiftPanel({data, employees, weekDates, schedule, loc, onClose, onSaved}) {
  const isEdit = !!data.shift;
  const COMMON = [
    {label:'AM  7–3',  s:'07:00',e:'15:00'},
    {label:'10–4',     s:'10:00',e:'16:00'},
    {label:'Dinner 4–12',s:'16:00',e:'00:00'},
    {label:'10–10',    s:'10:00',e:'22:00'},
    {label:'AM 8–2',   s:'08:00',e:'14:00'},
    {label:'PM 2–10',  s:'14:00',e:'22:00'},
  ];
  const [form,setForm] = useState({
    scheduleId:   schedule?.id||'',
    locationId:   loc?.id||'',
    employeeId:   data.shift?.employee_id||data.employeeId||'',
    position:     data.shift?.position||data.position||'',
    shiftDate:    data.shift?.shift_date||data.date||'',
    startTime:    data.shift?.start_time?.slice(0,5)||'09:00',
    endTime:      data.shift?.end_time?.slice(0,5)||'17:00',
    breakMinutes: data.shift?.break_minutes??30,
    notes:        data.shift?.notes||'',
    applyDays:    [data.shift?.shift_date||data.date||''],
  });
  const [saving,setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));

  const hrs = form.startTime&&form.endTime
    ? Math.max(0,(new Date(`2000-01-01T${form.endTime}`)-new Date(`2000-01-01T${form.startTime}`))/3600000-form.breakMinutes/60)
    : 0;

  const onEmpChange = id => {
    f('employeeId',id);
    const e = employees.find(x=>x.id===id);
    if (e?.position&&!form.position) f('position',e.position);
  };

  const toggleDay = (date) => {
    setForm(p=>({...p,applyDays:p.applyDays.includes(date)?p.applyDays.filter(d=>d!==date):[...p.applyDays,date]}));
  };

  const handleSave = async () => {
    if (!form.shiftDate||!form.startTime||!form.endTime) return;
    setSaving(true);
    try {
      if (isEdit) {
        const s = await agent9.updateShift(data.shift.id, form);
        onSaved(s);
      } else {
        // Create one shift per selected day
        let last;
        for (const date of form.applyDays) {
          last = await agent9.createShift({...form, shiftDate:date});
        }
        onSaved(last);
      }
    } catch(e) { alert(e.message); setSaving(false); }
  };

  return (
    <div style={{display:'flex',flexDirection:'column',height:'100%'}}>
      <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div style={{fontWeight:700,fontSize:15}}>{isEdit?'Edit shift':'New shift'}</div>
        <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
      </div>

      <div style={{flex:1,overflowY:'auto',padding:'14px 16px'}}>
        {/* Employee */}
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Employee</label>
          <select className="form-select" value={form.employeeId} onChange={e=>onEmpChange(e.target.value)}>
            <option value="">Open shift</option>
            {employees.map(e=><option key={e.id} value={e.id}>{empName(e)}{e.position?` · ${e.position}`:''}</option>)}
          </select>
        </div>

        {/* Position */}
        <div className="form-group" style={{marginBottom:12}}>
          <label className="form-label">Position / Role</label>
          <select className="form-select" value={form.position} onChange={e=>f('position',e.target.value)}>
            <option value="">Select…</option>
            {Object.entries(POSITIONS).map(([grp,pos])=>(<optgroup key={grp} label={DEPT_LABELS[grp]}>{pos.map(p=><option key={p} value={p}>{p}</option>)}</optgroup>))}
          </select>
        </div>

        {/* Quick time select */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>Quick select</div>
          <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
            {COMMON.map(t=>(
              <button key={t.label} onClick={()=>{f('startTime',t.s);f('endTime',t.e);}} style={{padding:'4px 9px',fontSize:11,borderRadius:6,cursor:'pointer',border:`1px solid ${form.startTime===t.s&&form.endTime===t.e?'var(--gold)':'var(--border)'}`,background:form.startTime===t.s&&form.endTime===t.e?'var(--gold-bg)':'transparent',color:form.startTime===t.s&&form.endTime===t.e?'var(--gold)':'var(--ink-3)',fontWeight:form.startTime===t.s&&form.endTime===t.e?600:400}}>
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Time inputs */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Start</label>
            <input className="form-input" type="time" value={form.startTime} onChange={e=>f('startTime',e.target.value)}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">End</label>
            <input className="form-input" type="time" value={form.endTime} onChange={e=>f('endTime',e.target.value)}/>
          </div>
        </div>

        {/* Hours display */}
        <div style={{display:'flex',gap:12,alignItems:'center',padding:'8px 12px',background:'var(--bg)',borderRadius:8,marginBottom:12}}>
          <div>
            <div style={{fontSize:9,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em'}}>Paid hours</div>
            <div style={{fontFamily:'var(--mono)',fontSize:20,fontWeight:700,color:'var(--gold)'}}>{hrs.toFixed(1)}h</div>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:9,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:4}}>Break</div>
            <div style={{display:'flex',gap:4}}>
              {[0,15,30,45,60].map(m=>(
                <button key={m} onClick={()=>f('breakMinutes',m)} style={{padding:'2px 7px',fontSize:11,borderRadius:5,cursor:'pointer',border:`1px solid ${form.breakMinutes===m?'var(--gold)':'var(--border)'}`,background:form.breakMinutes===m?'var(--gold-bg)':'transparent',color:form.breakMinutes===m?'var(--gold)':'var(--ink-3)'}}>
                  {m===0?'None':`${m}m`}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Apply to days (only for new shifts) */}
        {!isEdit && (
          <div style={{marginBottom:12}}>
            <div style={{fontSize:10,color:'var(--ink-3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:6}}>Apply to days</div>
            <div style={{display:'flex',gap:4}}>
              {weekDates.map((date,i)=>(
                <button key={date} onClick={()=>toggleDay(date)} style={{flex:1,padding:'6px 4px',fontSize:11,fontWeight:600,borderRadius:6,cursor:'pointer',border:`1px solid ${form.applyDays.includes(date)?'var(--gold)':'var(--border)'}`,background:form.applyDays.includes(date)?'var(--gold-bg)':'transparent',color:form.applyDays.includes(date)?'var(--gold)':'var(--ink-3)',textAlign:'center'}}>
                  <div>{DAY_NAMES[i]}</div>
                  <div style={{fontSize:9,fontWeight:400,marginTop:1}}>{date.slice(5).replace('-','/')}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Notes */}
        <div className="form-group" style={{marginBottom:0}}>
          <label className="form-label">Notes for employee</label>
          <textarea className="form-textarea" rows={2} value={form.notes} onChange={e=>f('notes',e.target.value)} placeholder="Optional — e.g. Please arrive 10 min early" style={{fontSize:12,resize:'none'}}/>
        </div>
      </div>

      <div style={{padding:'12px 16px',borderTop:'1px solid var(--border)',display:'flex',gap:8}}>
        <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={handleSave} disabled={saving}>
          {saving?'Saving…':isEdit?'Save changes':`Add${form.applyDays.length>1?` (${form.applyDays.length} days)`:''}`}
        </button>
      </div>
    </div>
  );
}


function RequestCard({req,type,onApprove,onDecline}) {
  return (
    <div className="card" style={{padding:'14px 18px',borderLeft:'3px solid #E8A020'}}>
      <div style={{display:'flex',gap:12,alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:20,background:'#2A2010',color:'#E8A020',textTransform:'uppercase'}}>{type==='swap'?'Swap':'Time off'}</span>
            <span style={{fontSize:13,fontWeight:500}}>{req.from_first} {req.from_last}</span>
            {req.to_first&&<span style={{fontSize:12,color:'var(--ink-3)'}}>→ {req.to_first} {req.to_last}</span>}
          </div>
          {type==='swap'&&req.shift_date&&<div style={{fontSize:12,color:'var(--ink-3)',marginBottom:3}}>{new Date(req.shift_date+'T12:00').toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric'})} · {fmtTime(req.start_time)}–{fmtTime(req.end_time)}</div>}
          {type==='time_off'&&<div style={{fontSize:12,color:'var(--ink-3)',marginBottom:3}}>{fmtDate(req.date_start)} – {fmtDate(req.date_end)} · {req.request_type?.replace('_',' ')}</div>}
          {req.reason&&<div style={{fontSize:12,color:'var(--ink-3)',fontStyle:'italic'}}>"{req.reason}"</div>}
        </div>
        <div style={{display:'flex',gap:6}}>
          <button className="btn btn-primary btn-sm" onClick={onApprove}>Approve</button>
          <button className="btn btn-sm" onClick={onDecline} style={{color:'#F26C6C'}}>Decline</button>
        </div>
      </div>
    </div>
  );
}

function EmployeeModal({employee,locations,locationId,onClose,onSaved}) {
  const isNew = !employee.id;
  const [form,setForm] = useState({
    firstName:employee.first_name||'', lastName:employee.last_name||'',
    email:employee.email||'', phone:employee.phone||'',
    role:employee.role||'staff', position:employee.position||'', department:employee.department||'foh',
    wageType:employee.wage_type||'hourly', wageRate:employee.wage_rate||'',
    hireDate:employee.hire_date||'', locationId:employee.location_id||locationId||'',
    status:employee.status||'active', notes:employee.notes||'',
    emergencyContact:employee.emergency_contact||'',
  });
  const [saving,setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  const onPositionChange = pos => { f('position',pos); if(POSITIONS.foh.includes(pos))f('department','foh'); else if(POSITIONS.boh.includes(pos))f('department','boh'); else if(POSITIONS.management.includes(pos))f('department','management'); };
  const handleSave = async () => {
    if (!form.firstName||!form.lastName) return alert('First and last name required');
    setSaving(true);
    try {
      const saved = isNew ? await agent9.addEmployee(form) : await agent9.updateEmployee(employee.id,form);
      if (form.staffPin && form.staffPin.length >= 4) {
        await agent9.setStaffPin(saved.id, form.staffPin).catch(e => alert('Saved employee but PIN failed: '+e.message));
      }
      onSaved(saved);
    }
    catch(e) { alert(e.message); setSaving(false); }
  };
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'flex-start',justifyContent:'center',zIndex:60,paddingTop:20,overflowY:'auto'}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:540,maxWidth:'95vw',border:'1px solid var(--border)',margin:'0 16px 60px'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
          <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:700}}>{isNew?'Add employee':'Edit employee'}</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{padding:'16px 20px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
          {[['firstName','First name *',''],['lastName','Last name *',''],['email','Email','email'],['phone','Phone','']].map(([k,label,type])=>(
            <div key={k} className="form-group" style={{marginBottom:0}}>
              <label className="form-label">{label}</label>
              <input className="form-input" type={type||'text'} value={form[k]} onChange={e=>f(k,e.target.value)}/>
            </div>
          ))}
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Position</label>
            <select className="form-select" value={form.position} onChange={e=>onPositionChange(e.target.value)}>
              <option value="">Select…</option>
              {Object.entries(POSITIONS).map(([grp,pos])=>(<optgroup key={grp} label={DEPT_LABELS[grp]}>{pos.map(p=><option key={p} value={p}>{p}</option>)}</optgroup>))}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Department</label>
            <select className="form-select" value={form.department} onChange={e=>f('department',e.target.value)}>
              <option value="foh">Front of House</option><option value="boh">Back of House</option><option value="management">Management</option>
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Role</label>
            <select className="form-select" value={form.role} onChange={e=>f('role',e.target.value)}>
              <option value="staff">Staff</option><option value="shift_lead">Shift Lead</option><option value="manager">Manager</option><option value="gm">General Manager</option>
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Wage type</label>
            <select className="form-select" value={form.wageType} onChange={e=>f('wageType',e.target.value)}>
              <option value="hourly">Hourly</option><option value="salary">Salary</option>
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Rate ({form.wageType==='hourly'?'$/hr':'$/yr'})</label>
            <input className="form-input" type="number" min={0} step={0.01} value={form.wageRate} onChange={e=>f('wageRate',e.target.value)}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Hire date</label>
            <input className="form-input" type="date" value={form.hireDate} onChange={e=>f('hireDate',e.target.value)}/>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Location</label>
            <select className="form-select" value={form.locationId} onChange={e=>f('locationId',e.target.value)}>
              <option value="">All locations</option>
              {locations.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          {!isNew&&<div className="form-group" style={{marginBottom:0}}><label className="form-label">Status</label><select className="form-select" value={form.status} onChange={e=>f('status',e.target.value)}><option value="active">Active</option><option value="inactive">Inactive</option><option value="on_leave">On leave</option></select></div>}
          <div className="form-group" style={{gridColumn:'1/-1',marginBottom:0}}><label className="form-label">Emergency contact</label><input className="form-input" value={form.emergencyContact} onChange={e=>f('emergencyContact',e.target.value)} placeholder="Name and phone number"/></div>
          <div className="form-group" style={{gridColumn:'1/-1',marginBottom:0}}><label className="form-label">Notes</label><input className="form-input" value={form.notes} onChange={e=>f('notes',e.target.value)}/></div>
          <div className="form-group" style={{gridColumn:'1/-1',marginBottom:0}}>
            <label className="form-label">Staff app PIN <span style={{fontWeight:400,fontSize:10,color:'var(--ink-3)'}}>4-6 digits · employee uses this to log into the Pulse Staff app</span></label>
            <input className="form-input" type="password" inputMode="numeric" maxLength={6} value={form.staffPin||''} onChange={e=>f('staffPin',e.target.value.replace(/\D/g,''))} placeholder="Set new PIN (leave blank to keep existing)" style={{fontFamily:'monospace',letterSpacing:4}}/>
          </div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',gap:8}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={handleSave} disabled={saving}>{saving?'Saving…':isNew?'Add employee':'Save changes'}</button>
        </div>
      </div>
    </div>
  );
}

function AvailabilityModal({employee,onClose,onSaved}) {
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const [availability,setAvailability] = useState(DAYS.map((_,i)=>({dayOfWeek:i+1===7?0:i+1,availType:'recurring',available:true,startTime:'08:00',endTime:'22:00',notes:''})));
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  useEffect(() => {
    agent9.availability(employee.id).then(data=>{
      if(data?.length) setAvailability(DAYS.map((_,i)=>{ const dow=i+1===7?0:i+1; const ex=data.find(d=>d.day_of_week===dow); return ex?{dayOfWeek:dow,availType:'recurring',available:ex.available,startTime:ex.start_time?.slice(0,5)||'08:00',endTime:ex.end_time?.slice(0,5)||'22:00',notes:ex.notes||''}:{dayOfWeek:dow,availType:'recurring',available:true,startTime:'08:00',endTime:'22:00',notes:''}; }));
      setLoading(false);
    }).catch(()=>setLoading(false));
  }, [employee.id]);
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:560,maxWidth:'95vw',border:'1px solid var(--border)',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
          <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:700}}>Availability — {empName(employee)}</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        {loading ? <div className="spinner" style={{margin:40}}/> : (
          <div style={{padding:'16px 20px'}}>
            {DAYS.map((day,i)=>{ const avail=availability[i]; return (
              <div key={day} style={{display:'grid',gridTemplateColumns:'100px 70px 1fr 1fr',gap:10,alignItems:'center',marginBottom:10,padding:'10px 12px',background:'var(--bg)',borderRadius:8}}>
                <div style={{fontSize:13,fontWeight:500}}>{day}</div>
                <label style={{display:'flex',alignItems:'center',gap:6,cursor:'pointer',fontSize:12}}>
                  <input type="checkbox" checked={avail.available} onChange={e=>setAvailability(a=>a.map((x,j)=>j===i?{...x,available:e.target.checked}:x))}/> Avail
                </label>
                <div><div style={{fontSize:9,color:'var(--ink-3)',marginBottom:3,textTransform:'uppercase'}}>From</div><input className="form-input" type="time" value={avail.startTime} disabled={!avail.available} onChange={e=>setAvailability(a=>a.map((x,j)=>j===i?{...x,startTime:e.target.value}:x))} style={{fontSize:12,opacity:avail.available?1:0.4}}/></div>
                <div><div style={{fontSize:9,color:'var(--ink-3)',marginBottom:3,textTransform:'uppercase'}}>Until</div><input className="form-input" type="time" value={avail.endTime} disabled={!avail.available} onChange={e=>setAvailability(a=>a.map((x,j)=>j===i?{...x,endTime:e.target.value}:x))} style={{fontSize:12,opacity:avail.available?1:0.4}}/></div>
              </div>
            );})}
            <div style={{display:'flex',gap:8,marginTop:16}}>
              <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={async()=>{ setSaving(true); try{await agent9.setAvailability(employee.id,availability);onSaved();}catch(e){alert(e.message);setSaving(false); }}} disabled={saving}>{saving?'Saving…':'Save availability'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TimeOffModal({employees,locationId,onClose,onSaved}) {
  const [form,setForm] = useState({employeeId:'',requestType:'time_off',dateStart:'',dateEnd:'',reason:''});
  const [saving,setSaving] = useState(false);
  const f = (k,v) => setForm(p=>({...p,[k]:v}));
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.65)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:60}}>
      <div onClick={e=>e.stopPropagation()} style={{background:'var(--bg-2)',borderRadius:'var(--r-lg)',width:420,maxWidth:'95vw',border:'1px solid var(--border)'}}>
        <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between'}}>
          <div style={{fontFamily:'var(--serif)',fontSize:17,fontWeight:700}}>Time off request</div>
          <button onClick={onClose} style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'var(--ink-3)'}}>✕</button>
        </div>
        <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:10}}>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Employee</label><select className="form-select" value={form.employeeId} onChange={e=>f('employeeId',e.target.value)}><option value="">Select…</option>{employees.map(e=><option key={e.id} value={e.id}>{empName(e)}</option>)}</select></div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Type</label><select className="form-select" value={form.requestType} onChange={e=>f('requestType',e.target.value)}><option value="time_off">Time off</option><option value="sick">Sick day</option><option value="vacation">Vacation</option><option value="personal">Personal day</option></select></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">From</label><input className="form-input" type="date" value={form.dateStart} onChange={e=>f('dateStart',e.target.value)}/></div>
            <div className="form-group" style={{marginBottom:0}}><label className="form-label">To</label><input className="form-input" type="date" value={form.dateEnd} onChange={e=>f('dateEnd',e.target.value)}/></div>
          </div>
          <div className="form-group" style={{marginBottom:0}}><label className="form-label">Reason</label><textarea className="form-textarea" rows={2} value={form.reason} onChange={e=>f('reason',e.target.value)} placeholder="Optional"/></div>
        </div>
        <div style={{padding:'0 20px 16px',display:'flex',gap:8}}>
          <button className="btn" style={{flex:1,justifyContent:'center'}} onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" style={{flex:2,justifyContent:'center'}} onClick={async()=>{ if(!form.employeeId||!form.dateStart||!form.dateEnd)return alert('Employee and dates required'); setSaving(true); try{await agent9.requestTimeOff({...form,locationId});onSaved();}catch(e){alert(e.message);setSaving(false);} }} disabled={saving}>{saving?'Submitting…':'Submit request'}</button>
        </div>
      </div>
    </div>
  );
}

function getBadgeIcon(key) {
  return {six_months:'🥈',one_year:'🥇',two_years:'🏆',reliable:'💎',team_player:'🤝',top_performer:'⭐',trainer:'🎓'}[key]||'🏅';
}

function StaffLinkModal({ url, onClose }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => fallback());
    } else { fallback(); }
  };

  const fallback = () => {
    const el = document.createElement('textarea');
    el.value = url; el.style.position = 'fixed'; el.style.opacity = '0';
    document.body.appendChild(el); el.focus(); el.select();
    try { document.execCommand('copy'); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch(e) {}
    document.body.removeChild(el);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.65)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:60 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--bg-2)', borderRadius:'var(--r-lg)', width:480, maxWidth:'95vw', border:'1px solid var(--border)', padding:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h2 style={{ fontFamily:'var(--serif)', fontSize:18, fontWeight:700 }}>📱 Staff App</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'var(--ink-3)' }}>✕</button>
        </div>

        <div style={{ fontSize:13, color:'var(--ink-2)', lineHeight:1.7, marginBottom:16 }}>
          Share this link with your staff. They can open it on any phone and add it to their home screen for an app-like experience.
        </div>

        {/* URL display */}
        <div style={{ display:'flex', gap:8, marginBottom:16 }}>
          <div style={{ flex:1, padding:'10px 14px', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, fontSize:12, fontFamily:'var(--mono)', color:'var(--ink-3)', wordBreak:'break-all' }}>
            {url}
          </div>
          <button onClick={copy} className="btn btn-primary" style={{ flexShrink:0, justifyContent:'center', minWidth:80 }}>
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>

        {/* Open link */}
        <a href={url} target="_blank" rel="noopener noreferrer" className="btn" style={{ display:'flex', justifyContent:'center', marginBottom:16, textDecoration:'none' }}>
          Open staff app →
        </a>

        {/* Instructions */}
        <div style={{ background:'var(--bg)', borderRadius:8, padding:'14px 16px', fontSize:12, color:'var(--ink-3)', lineHeight:1.8 }}>
          <div style={{ fontWeight:600, color:'var(--ink-2)', marginBottom:8 }}>How staff sign in:</div>
          <div>1. Open the link on their phone</div>
          <div>2. Enter the PIN you set in their employee profile</div>
          <div>3. Tap <strong>Add to Home Screen</strong> in their browser for an app icon</div>
          <div style={{ marginTop:8, fontSize:11, color:'var(--ink-4)' }}>Set PINs in Team tab → Edit employee → Staff app PIN field</div>
        </div>
      </div>
    </div>
  );
}
