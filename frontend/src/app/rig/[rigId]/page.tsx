"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
  last_kernel_log: string;
  current_loop?: number;
  is_hang?: boolean;
  kernel_heartbeat?: string;
  cm55_heartbeat?: string;
  resurrection_gap?: string;
  errors: string[];
  kernel_stream?: string[];
}

interface Rig {
  rig_id: string;
  boards: BoardStatus[];
}

const HeartbeatDot = ({ timestamp, type, gap }: { timestamp?: string, type: string, gap?: string }) => {
  if (!timestamp) return <div className="w-1.5 h-1.5 rounded-full bg-zinc-800" title={`${type}: Offline`} />;
  
  const formatter = new Intl.DateTimeFormat('zh-CN', { 
    timeZone: 'Asia/Shanghai', 
    dateStyle: 'medium', 
    timeStyle: 'medium' 
  });
  const beijingTime = formatter.format(new Date(timestamp));
  const lastUpdate = new Date(timestamp).getTime();
  const now = new Date().getTime();
  const diff = (now - lastUpdate) / 1000;
  
  let color = 'bg-emerald-500';
  if (gap) color = 'bg-amber-400 animate-pulse';
  else if (diff > 300) color = 'bg-rose-500';
  else if (diff > 60) color = 'bg-zinc-500';
  
  return (
    <div 
      className={`w-1.5 h-1.5 rounded-full ${color}`} 
      title={`${type}: ${beijingTime} ${gap ? `(${gap})` : ''}`} 
    />
  );
};

export default function RigDetailPage() {
  const params = useParams();
  const rigId = params.rigId as string;
  const [rig, setRig] = useState<Rig | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState("");

  useEffect(() => {
    const formatter = new Intl.DateTimeFormat('zh-CN', { 
      timeZone: 'Asia/Shanghai', 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
    const timer = setInterval(() => {
      setCurrentTime(formatter.format(new Date()));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchDetail = async () => {
    try {
      const res = await fetch(`${CONFIG.API_BASE_URL}/api/status/${rigId}`);
      if (res.ok) {
        const data = await res.json();
        setRig(data);
      }
    } catch (error) {
      console.error('Failed to fetch detail:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    const interval = setInterval(fetchDetail, CONFIG.POLLING_INTERVAL);
    return () => clearInterval(interval);
  }, [rigId]);

  if (loading) return <div className="min-h-screen bg-black flex items-center justify-center text-emerald-500 font-mono italic animate-pulse">Establishing Secure Connection...</div>;
  if (!rig) return <div className="min-h-screen bg-black flex items-center justify-center text-rose-500 font-mono font-bold tracking-tighter text-2xl uppercase">Critical Error: Node Not Found</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 p-6 lg:p-12 font-sans selection:bg-emerald-500/30">
      <header className="max-w-7xl mx-auto mb-8 lg:mb-16 flex justify-between items-end">
        <div>
           <a href="/" className="group flex items-center gap-2 text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] hover:text-emerald-500 transition-all">
             <span className="group-hover:-translate-x-1 transition-transform">←</span> Return to Command Center
           </a>
           <h1 className="text-5xl font-black mt-4 uppercase italic tracking-tighter leading-none">
             Rig Metadata: <span className="text-emerald-500">{rig.rig_id}</span>
           </h1>
        </div>
        <div className="text-right pb-1">
           <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1 opacity-50">Local Precision Clocks (CST)</div>
           <div className="font-mono text-xl font-black text-zinc-400 tabular-nums">{currentTime}</div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto space-y-8">
        {rig.boards.map((board) => (
          <div key={board.board_id} className="bg-[#0a0a0b] border border-zinc-800/50 rounded-3xl overflow-hidden shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-4 min-h-[400px]">
              {/* Board Info Sidebar */}
              <div className="p-8 border-b lg:border-b-0 lg:border-r border-zinc-800/50 bg-zinc-900/40">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col">
                    <span className="text-3xl font-black italic text-emerald-400 tracking-tighter leading-none">{board.board_id}</span>
                    <div className="flex gap-2 mt-3 bg-black/40 p-1.5 rounded-lg border border-white/5 w-fit">
                      <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} />
                      <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                    </div>
                  </div>
                  <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter ${
                    board.status === 'Error' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' : 
                    board.resurrection_gap ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse' :
                    board.status === 'Running' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/30 text-zinc-500'
                  }`}>
                    {board.resurrection_gap ? 'Recovered' : board.status}
                  </span>
                </div>

                <div className="space-y-5">
                  <div>
                    <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">Operational Task</p>
                    <p className="text-xs font-bold text-zinc-300">{board.task_type}</p>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">SoC Min</p>
                      <p className="text-lg font-black text-rose-400 tabular-nums">{board.temp_min.toFixed(1)}°</p>
                    </div>
                    <div>
                      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">DDR TS6</p>
                      <p className="text-lg font-black text-sky-400 tabular-nums">{board.temp_ddr.toFixed(1)}°</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-800/50">
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-[9px] text-zinc-500 uppercase font-black">Lifecycle Progress</span>
                       <span className="text-lg font-black text-emerald-500 tabular-nums">{Math.min(100, (board.elapsed_hours / 48) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000"
                        style={{ width: `${Math.min(100, (board.elapsed_hours / 48) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-[9px] font-bold text-zinc-600">
                       <span>{board.elapsed_hours.toFixed(1)}H ELAPSED</span>
                       <span>LOOP {board.current_loop || 0}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Log Terminal */}
              <div className="p-8 lg:col-span-3 flex flex-col bg-black/20">
                <div className="flex justify-between items-center mb-6">
                   <div className="flex items-center gap-3">
                     <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Kernel Activity Stream</h3>
                     <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[9px] font-black rounded uppercase border border-emerald-500/20">Live Payload</span>
                   </div>
                   {board.errors.length > 0 && <span className="text-[10px] text-rose-400 font-bold uppercase tracking-tighter">⚠️ Sequence Interrupted</span>}
                </div>

                {/* Failure Reason Alert */}
                {board.status === 'Error' && board.errors.length > 0 && (
                  <div className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500">
                    <div className="bg-rose-500/5 border-l-4 border-rose-500 p-4 rounded-r-xl">
                      <p className="text-[10px] text-rose-500 uppercase font-black tracking-widest mb-1">Root Cause of Failure</p>
                      <ul className="space-y-1">
                        {board.errors.map((err, i) => (
                          <li key={i} className="text-sm font-bold text-rose-200">
                            <span className="opacity-50 mr-2">/</span> {err}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <div className="flex-1 bg-black/60 border border-zinc-800/80 rounded-2xl p-6 font-mono text-[12px] leading-relaxed text-zinc-400 overflow-hidden relative">
                   <div className="absolute top-0 right-8 text-[10px] font-black text-zinc-800 uppercase tracking-widest py-2">Last 50 Segments</div>
                   <div className="h-full overflow-y-auto custom-scrollbar space-y-1">
                      {board.kernel_stream && board.kernel_stream.length > 0 ? (
                        board.kernel_stream.slice(-50).map((log, idx) => (
                          <div key={idx} className="flex gap-4 group">
                             <span className="text-zinc-800 text-[10px] select-none text-right w-6 shrink-0 font-black">{idx + 1}</span>
                             <p className={`truncate transition-colors ${idx === (board.kernel_stream?.length || 0) - 1 || idx === 49 ? 'text-emerald-400 font-bold' : 'group-hover:text-zinc-200'}`}>
                               <span className="text-zinc-700 mr-2">›</span>{log}
                             </p>
                          </div>
                        ))
                      ) : (
                        <div className="flex items-center justify-center h-full text-zinc-600 italic uppercase tracking-widest text-[10px]">
                           No stream data detected in current frame
                        </div>
                      )}
                   </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
