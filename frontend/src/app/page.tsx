"use client";

import React, { useEffect, useState } from 'react';
import { CONFIG } from '@/config';

interface BoardStatus {
  board_id: string;
  status: 'Running' | 'Warning' | 'Error' | 'Finished';
  temperature: number;
  temp_min: number;
  temp_ddr: number;
  remaining_hours: number;
  elapsed_hours: number;
  task_type: string;
  start_time?: string;
  last_kernel_log?: string;
  current_loop?: number;
  is_hang?: boolean;
  kernel_heartbeat?: string;
  cm55_heartbeat?: string;
  resurrection_gap?: string;
  kernel_stream?: string[];
}

interface Rig {
  rig_id: string;
  boards: BoardStatus[];
  last_report_at?: string;
  seconds_since_report?: number;
}

const StatusIndicator = ({ status }: { status: string }) => {
  const colors = {
    Running: 'bg-emerald-500 shadow-emerald-500/20',
    Warning: 'bg-amber-500 shadow-amber-500/20',
    Error: 'bg-rose-500 shadow-rose-500/20 animate-pulse',
    Finished: 'bg-indigo-500 shadow-indigo-500/20',
  };
  
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${colors[status as keyof typeof colors] || 'bg-zinc-600'} shadow-[0_0_8px_rgba(var(--tw-shadow-color))]`} />
      <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">{status}</span>
    </div>
  );
};

const HeartbeatDot = ({ timestamp, type, gap, logStream }: { timestamp?: string, type: string, gap?: string, logStream?: string[] }) => {
  const [isHovered, setIsHovered] = useState(false);
  
  if (!timestamp) return (
    <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" />
  );
  
  const lastUpdate = new Date(timestamp).getTime();
  const now = new Date().getTime();
  const formatter = new Intl.DateTimeFormat('zh-CN', { 
    timeZone: 'Asia/Shanghai', 
    dateStyle: 'medium', 
    timeStyle: 'medium' 
  });
  const beijingTime = formatter.format(new Date(timestamp));
  const diff = (now - lastUpdate) / 1000;
  
  let color = 'bg-emerald-500';
  if (gap) color = 'bg-amber-400 animate-pulse'; 
  else if (diff > 300) color = 'bg-rose-500'; 
  else if (diff > 60) color = 'bg-zinc-500'; 
  
  const isHealthy = diff <= 300;

  return (
    <div 
      className="relative flex items-center justify-center p-0.5"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className={`w-[8px] h-[8px] min-w-[8px] min-h-[8px] rounded-full ${color} transition-all duration-300 ${isHovered ? 'scale-125' : ''}`} />
      
      {isHovered && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 z-[1000] w-64 p-3 bg-zinc-900/95 backdrop-blur-md border border-zinc-500/20 rounded-xl shadow-2xl pointer-events-none">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">{type} System</span>
            <div className={`px-2 py-0.5 rounded-full text-[8px] font-bold ${isHealthy ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
              {isHealthy ? 'ONLINE' : 'TIMEOUT'}
            </div>
          </div>
          
          <div className="space-y-1.5">
             <div className="flex justify-between text-[9px]">
               <span className="text-zinc-500">Last Pulse (BJ)</span>
               <span className="text-zinc-300 font-mono">{beijingTime}</span>
             </div>
             {gap && (
               <div className="flex justify-between text-[9px]">
                 <span className="text-amber-500">Recovery Gap</span>
                 <span className="text-amber-400 font-bold">{gap}</span>
               </div>
             )}
          </div>

          {logStream && logStream.length > 0 && (
            <div className="mt-3 pt-2 border-t border-zinc-800">
               <p className="text-[8px] font-black text-zinc-600 uppercase mb-1 tracking-tighter">Live Stream Preview</p>
               <div className="space-y-1 max-h-24 overflow-hidden">
                 {logStream.slice(-3).map((log, idx) => (
                   <p key={idx} className="text-[9px] text-zinc-400 font-mono truncate leading-none">
                     <span className="text-zinc-600 mr-1">›</span>{log}
                   </p>
                 ))}
               </div>
            </div>
          )}
          
          {/* Arrow */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent border-t-zinc-900/95" />
        </div>
      )}
    </div>
  );
};

const RigCard = ({ rig }: { rig: Rig }) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPulsing, setIsPulsing] = useState(false);
  const [lastTsRecord, setLastTsRecord] = useState(0);

  const errorCount = rig.boards.filter(b => b.status === 'Error').length;

  const latestTs = rig.boards.reduce((max: number, b: BoardStatus) => {
    const ts = Math.max(
      b.kernel_heartbeat ? new Date(b.kernel_heartbeat).getTime() : 0,
      b.cm55_heartbeat ? new Date(b.cm55_heartbeat).getTime() : 0
    );
    return Math.max(max, ts);
  }, 0);

  useEffect(() => {
    if (latestTs > lastTsRecord) {
      setIsPulsing(true);
      setLastTsRecord(latestTs);
      const timer = setTimeout(() => setIsPulsing(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [latestTs, lastTsRecord]);

  const allFinished = rig.boards.length > 0 && rig.boards.every(b => b.status === 'Finished');
  const isAgentActiveOnBackend = rig.seconds_since_report !== undefined && rig.seconds_since_report < 60;
  const heartbeatDiff = latestTs > 0 ? (Date.now() - latestTs) / 1000 : 9999;
  const isAgentAlive = !allFinished && (isAgentActiveOnBackend || heartbeatDiff < 300);

  // 汇总统计仪表盘
  const activeTask = rig.boards[0]?.task_type || 'Unknown';
  const startTimes = rig.boards
    .map(b => b.start_time)
    .filter(t => t && t !== 'Unknown')
    .map(t => new Date(t!).getTime());
  const earliestStart = startTimes.length > 0 ? Math.min(...startTimes) : null;
  const startTimeStr = earliestStart ? new Date(earliestStart).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/-- --:--';
  const expectedEnd = earliestStart ? new Date(earliestStart + 48 * 3600 * 1000) : null;
  const endTimeStr = expectedEnd ? expectedEnd.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/-- --:--';
  const successRate = rig.boards.length > 0 ? ((rig.boards.filter(b => b.status !== 'Error').length / rig.boards.length) * 100).toFixed(0) : '0';
  const reportDelay = rig.seconds_since_report ? `${rig.seconds_since_report.toFixed(0)}s` : '--s';

  return (
    <div 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`group relative bg-[#0a0a0b] border border-zinc-800/50 rounded-2xl p-6 transition-all duration-500 hover:border-emerald-500/30 hover:shadow-[0_0_40px_-12px_rgba(16,185,129,0.15)] ${isHovered ? 'z-50' : 'z-10'}`}
    >
      <div className="absolute -top-24 -right-24 w-48 h-48 bg-emerald-500/5 blur-[100px] pointer-events-none transition-opacity duration-700 opacity-0 group-hover:opacity-100" />
      
      <div className="flex justify-between items-start mb-6 relative z-10">
        <div>
          <h2 className="text-2xl font-bold bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent italic tracking-tighter">
            {rig.rig_id}
          </h2>
          <div className="flex items-center gap-3 mt-2">
              <div className="flex items-center" title={isAgentAlive ? "Online" : "Offline"}>
                 <div className="relative flex items-center justify-center w-4 h-4 mr-1">
                    {isAgentAlive && (
                      <>
                        <div className="absolute w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                        <div className="relative w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                      </>
                    )}
                    {!isAgentAlive && (
                      <div className="relative w-1.5 h-1.5 bg-rose-500 rounded-full shadow-[0_0_8px_rgba(244,63,94,0.3)]" />
                    )}
                 </div>
                 <span className={`text-[9px] font-black uppercase tracking-widest ${isAgentAlive ? 'text-emerald-500' : 'text-zinc-500'}`}>
                   {reportDelay} Lag
                 </span>
              </div>
          </div>
        </div>
        <div className="text-right">
           <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter border ${
            errorCount > 0 ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 
            'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
          }`}>
            {successRate}% Success
          </div>
          <p className="text-[9px] text-zinc-600 font-bold mt-1.5 uppercase tracking-tighter">{rig.boards.length} Boards</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-6 p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/50 relative z-10">
          <div>
            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-tighter mb-0.5">Start</p>
            <p className="text-[10px] font-mono text-zinc-400">{startTimeStr}</p>
          </div>
          <div>
            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-tighter mb-0.5">ETD</p>
            <p className="text-[10px] font-mono text-zinc-400">{endTimeStr}</p>
          </div>
          <div className="col-span-2 border-t border-zinc-800/50 pt-2 mt-1">
            <p className="text-[8px] font-black text-zinc-600 uppercase tracking-tighter mb-0.5">Task</p>
            <p className="text-[10px] font-bold text-emerald-500/70 truncate italic">{activeTask}</p>
          </div>
      </div>

      <div className="space-y-5 relative z-10">
        {rig.boards.map((board) => {
          const progress = Math.min(100, (board.elapsed_hours / 48) * 100);
          return (
            <div key={board.board_id} className="group/item">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black italic text-emerald-500 tracking-tighter">{board.board_id}</span>
                  <span className="text-[10px] font-bold text-zinc-500 bg-zinc-900/50 px-1.5 rounded">{board.elapsed_hours}h</span>
                </div>
                <div className="flex items-center gap-3">
                  <a 
                    href={`/rig/${rig.rig_id}/board/${board.board_id}`} 
                    className="opacity-0 group-hover/item:opacity-100 transition-all bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-black px-2 py-0.5 rounded text-[8px] font-black uppercase border border-emerald-500/20"
                  >
                    Detail ↗
                  </a>
                  <span className="text-[10px] font-mono text-emerald-400">{progress.toFixed(0)}%</span>
                </div>
              </div>
              
              <div className="flex items-center gap-3 mb-2">
                  <div className="flex gap-1 bg-zinc-900/40 px-1 py-0.5 rounded border border-zinc-800/50">
                    <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} logStream={board.kernel_stream} />
                    <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                  </div>
                  <div className="flex gap-2 text-[9px] font-bold uppercase tracking-tighter">
                     <span className="text-rose-400/90">Min: {board.temp_min?.toFixed(0) || 0}°</span>
                     <span className="text-sky-400/90">DDR: {board.temp_ddr?.toFixed(0) || 0}°</span>
                  </div>
              </div>

              <div className="relative h-[4px] w-full bg-zinc-900/50 rounded-full overflow-hidden">
                <div 
                  className={`absolute top-0 left-0 h-full rounded-full transition-all duration-1000 ease-out ${
                    board.status === 'Error' ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      
      <div className="mt-8 pt-6 border-t border-zinc-900 relative z-10">
        <a 
          href={`/rig/${rig.rig_id}`}
          className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-900/50 hover:bg-zinc-800 border border-zinc-800/50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all group/btn"
        >
          View Entire Rig Cluster <span className="text-emerald-500 group-hover/btn:translate-x-1 transition-transform">↗</span>
        </a>
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [rigs, setRigs] = useState<Rig[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/status`);
      const data = await res.json();
      setRigs(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, CONFIG.POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  // 分组逻辑
  const groups = [
    { id: 'SIP', label: 'SIP Series', pattern: /^SIP/i },
    { id: 'COB', label: 'COB Series', pattern: /^COB/i },
    { id: 'CX', label: 'CX Series', pattern: /^CX/i },
    { id: 'OTHER', label: 'Other Rigs', pattern: /.*/ }, // 保底项
  ];

  const groupedRigs = groups.map(group => ({
    ...group,
    items: rigs.filter(rig => {
      // 如果属于前面的组，就不再出现在后面的组
      const belongsToPrevious = groups
        .slice(0, groups.indexOf(group))
        .some(pre => pre.pattern.test(rig.rig_id));
      return !belongsToPrevious && group.pattern.test(rig.rig_id);
    })
  })).filter(g => g.items.length > 0);

  return (
    <div className="bg-transparent text-zinc-100 font-sans selection:bg-emerald-500/30">
      <main className="max-w-7xl mx-auto p-12 relative z-10">
        <header className="mb-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="h-px bg-zinc-800 flex-grow" />
            <div className="px-4 py-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500">Node Matrix v2.4</span>
            </div>
            <div className="h-px bg-zinc-800 flex-grow" />
          </div>
          
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h2 className="text-gray-500 text-xs font-black uppercase tracking-[0.4em] mb-4">Cluster Intelligence</h2>
              <h3 className="text-5xl font-bold tracking-tighter italic">Active <span className="text-emerald-500">Deployments</span></h3>
            </div>
            <div className="flex items-center gap-10 bg-[#0a0a0b] border border-zinc-800/50 p-6 rounded-3xl">
              <div className="text-center">
                 <span className="text-emerald-500 font-mono text-3xl font-black block leading-none mb-2">{rigs.length}</span>
                 <p className="text-[9px] text-zinc-500 uppercase tracking-widest font-black">Rigs Online</p>
              </div>
              <div className="w-px h-10 bg-zinc-800" />
              <div className="flex flex-col gap-1.5">
                <StatusIndicator status="Running" />
                <StatusIndicator status="Error" />
              </div>
            </div>
          </div>
        </header>

        <div className="space-y-20">
          {groupedRigs.map((group) => (
            <section key={group.id} className="animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="flex items-baseline gap-4 mb-8">
                <h4 className="text-xl font-black uppercase italic tracking-tighter text-zinc-200">{group.label}</h4>
                <div className="h-1 w-1 rounded-full bg-emerald-500 opacity-50" />
                <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">{group.items.length} Units Connected</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {group.items.map((rig) => (
                  <RigCard key={rig.rig_id} rig={rig} />
                ))}
              </div>
            </section>
          ))}

          {loading && rigs.length === 0 && (
            <div className="col-span-full h-80 flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-3xl bg-[#0a0a0b]">
               <div className="w-12 h-12 relative mb-6">
                 <div className="absolute inset-0 border-4 border-emerald-500/20 rounded-full" />
                 <div className="absolute inset-0 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
               </div>
               <p className="text-zinc-500 text-xs font-bold uppercase tracking-widest">Awaiting Initial Uplink...</p>
            </div>
          )}
          
          {!loading && rigs.length === 0 && (
            <div className="h-64 flex flex-col items-center justify-center border border-zinc-800/50 rounded-3xl bg-[#0a0a0b]/30">
              <p className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">No Active Telemetry Detected</p>
            </div>
          )}
        </div>
      </main>

      <footer className="max-w-7xl mx-auto p-12 border-t border-zinc-800/30 mt-20 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4 text-zinc-600 text-[10px] font-black uppercase tracking-widest">
           <span>Privacy</span>
           <span>Protocols</span>
           <span>Infrastructure</span>
        </div>
        <p className="text-zinc-700 text-[10px] font-bold uppercase tracking-[0.2em]">&copy; 2026 TITAN NODE • Advanced Distributed Monitoring</p>
      </footer>
    </div>
  );
}
