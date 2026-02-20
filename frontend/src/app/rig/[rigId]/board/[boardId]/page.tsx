"use client";

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { CONFIG } from '@/config';
import * as echarts from 'echarts';

const TemperatureChart = ({ dataPoints }: { dataPoints: Array<{ts: number, name: string, val: number}> | undefined }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (chartRef.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark');
    }
    const handleResize = () => chartInstance.current?.resize();
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (!chartInstance.current || !dataPoints || dataPoints.length === 0) return;

    const sensorDataMap = new Map();
    dataPoints.forEach(pt => {
        if (!pt || !pt.name) return;
        if (!sensorDataMap.has(pt.name)) {
            sensorDataMap.set(pt.name, []);
        }
        const arr = sensorDataMap.get(pt.name);
        if (arr) arr.push([pt.ts, pt.val]);
    });

    const series: any[] = [];
    const selected: Record<string, boolean> = {};
    const sensorNames = Array.from(sensorDataMap.keys());
    
    sensorNames.forEach((name) => {
      const data = sensorDataMap.get(name);
      data.sort((a: any, b: any) => a[0] - b[0]);
      const isDefaultVisible = name.toUpperCase().includes("CPU") || name.toUpperCase().includes("DDR") || name.toUpperCase().includes("MIN");
      
      series.push({
        name: name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        emphasis: { focus: 'series' },
        data: data,
      });
      selected[name] = isDefaultVisible;
    });

    // 完整的状态更新
    chartInstance.current.setOption({ 
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(16, 20, 30, 0.95)',
        borderWidth: 0,
        textStyle: { color: '#fff', fontSize: 13 },
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(255,255,255,0.2)' } },
        formatter: function (params: any) {
          const date = new Date(params[0].value[0]);
          const timeStr = date.getHours().toString().padStart(2, '0') + ':' + 
                        date.getMinutes().toString().padStart(2, '0') + ':' + 
                        date.getSeconds().toString().padStart(2, '0');
          let res = `<div style="color: #888; font-size: 11px; margin-bottom: 6px;">${timeStr}</div>`;
          params.forEach((item: any) => {
            res += `<div style="margin-bottom: 2px;">
                      <span style="color:${item.color}; font-weight:bold;">${item.value[1]}°C</span> 
                      <span style="font-size:11px; color:#aaa; margin-left:10px;">${item.seriesName}</span>
                    </div>`;
          });
          return res;
        },
      },
      legend: { 
        data: sensorNames, 
        selected: (() => {
          // 记忆功能逻辑
          const savedSelection = localStorage.getItem(`legend_selection`);
          if (savedSelection) {
            try {
              const parsed = JSON.parse(savedSelection);
              // 只有当传感器名在当前列表中时才合并，否则用默认
              const merged = { ...selected };
              Object.keys(parsed).forEach(k => {
                if (sensorNames.includes(k)) merged[k] = parsed[k];
              });
              return merged;
            } catch(e) { return selected; }
          }
          return selected;
        })(),
        type: 'scroll',
        orient: 'horizontal',
        bottom: 0,
        left: 'center',
        padding: [0, 50],
        textStyle: { color: '#ccc', fontSize: 10 },
        pageTextStyle: { color: '#fff' }
      },
      grid: { 
        left: '2%', 
        right: '40px', 
        bottom: '60px', 
        top: '30px', 
        containLabel: true 
      },
      xAxis: { 
        type: 'time', 
        axisLabel: { color: '#888', fontSize: 10 }, 
        splitLine: { show: false },
        axisLine: { lineStyle: { color: '#333' } }
      },
      yAxis: { 
        type: 'value', 
        min: function(value: any) { return Math.floor(value.min - 5); },
        max: function(value: any) { return Math.ceil(value.max + 5); },
        axisLabel: { color: '#888', fontSize: 10, formatter: '{value}°' }, 
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
        axisLine: { show: false }
      },
      dataZoom: [
        { type: 'inside', start: 0, end: 100 },
        {
          show: true,
          type: 'slider',
          bottom: 40,
          height: 10,
          backgroundColor: 'rgba(255,255,255,0.02)',
          fillerColor: 'rgba(16, 185, 129, 0.2)',
          borderColor: 'transparent',
          handleSize: '80%',
          textStyle: { color: '#888' },
        },
      ],
      series: series 
    }, { notMerge: true });

    // 监听图例点击，保存选择状态实现记忆
    chartInstance.current.on('legendselectchanged', (params: any) => {
       const savedSelection = localStorage.getItem(`legend_selection`);
       let current = {};
       try { current = savedSelection ? JSON.parse(savedSelection) : {}; } catch(e){}
       localStorage.setItem(`legend_selection`, JSON.stringify({ ...current, ...params.selected }));
    });
  }, [dataPoints]);

  return <div ref={chartRef} className="w-full h-full" />;
};

interface BoardStatus {
  board_id: string;
  status: 'Running' | 'Warning' | 'Error' | 'Finished';
  temperature: number;
  temp_min: number;
  temp_max: number;
  temp_ddr: number;
  remaining_hours: number;
  elapsed_hours: number;
  task_type: string;
  start_time?: string;
  last_kernel_log: string;
  current_loop?: number;
  is_hang?: boolean;
  kernel_heartbeat?: string;
  cm55_heartbeat?: string;
  resurrection_gap?: string;
  errors: string[];
  kernel_stream?: string[];
  ddr_details?: Record<string, number>;
  temp_points?: Array<{ts: number, name: string, val: number}>;
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

export default function BoardDetailPage() {
  const params = useParams();
  const rigId = params.rigId as string;
  const boardId = params.boardId as string;
  
  const [rig, setRig] = useState<Rig | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

  const board = rig.boards.find(b => b.board_id === boardId);
  if (!board) return <div className="min-h-screen bg-black flex items-center justify-center text-rose-500 font-mono font-bold tracking-tighter text-2xl uppercase">Critical Error: Board Not Found</div>;

  return (
    <div className="min-h-screen bg-[#050505] text-zinc-100 p-4 md:p-8 font-sans selection:bg-emerald-500/30 flex flex-col lg:h-screen lg:overflow-hidden">
      <header className="max-w-[1500px] w-full mx-auto mb-6 md:mb-8 flex flex-col md:flex-row justify-between items-start md:items-end flex-shrink-0 gap-4">
        <div>
           <a href="/" className="group flex items-center gap-2 text-zinc-500 text-[10px] font-black uppercase tracking-[0.3em] hover:text-emerald-500 transition-all">
             <span className="group-hover:-translate-x-1 transition-transform">←</span> Command Center
           </a>
            <h1 className="text-3xl md:text-5xl font-black mt-4 uppercase italic tracking-tighter leading-none break-all">
             Board Detail: <span className="text-emerald-500">{board.board_id}</span>
           </h1>
           <p className="text-[10px] text-zinc-600 font-bold mt-2 tracking-widest uppercase truncate max-w-full">
             Associated with Rig: {rig.rig_id} | Build: 20260221_0140
           </p>
        </div>
        <div className="text-right pb-1">
           <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-black mb-1 opacity-50">Local Precision Clocks (CST)</div>
           <div className="font-mono text-xl font-black text-zinc-400 tabular-nums">{currentTime}</div>
        </div>
      </header>

      <main className="max-w-[1500px] w-full mx-auto flex-1 flex flex-col min-h-0">
        <div className="bg-[#0a0a0b] border border-zinc-800/50 rounded-2xl md:rounded-3xl overflow-hidden shadow-2xl flex-1 flex flex-col min-h-0 relative">
          <div className="flex h-full flex-1 min-h-0 transition-all duration-300">
            {/* Sidebar - Precision Dock */}
            <div className={`relative border-r border-zinc-800/50 bg-[#0c0c0d] flex-shrink-0 transition-all duration-500 overflow-hidden flex flex-col ${sidebarCollapsed ? 'w-16' : 'w-72 md:w-80'}`}>
              
              {/* Collapse Toggle Button */}
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-[100] w-6 h-12 bg-zinc-800 border border-zinc-700 rounded-full items-center justify-center text-zinc-400 hover:text-emerald-500 hover:bg-zinc-700 transition-all shadow-xl font-bold"
              >
                {sidebarCollapsed ? '→' : '←'}
              </button>

              <div className="flex-1 flex flex-col min-h-0 custom-scrollbar">
                {sidebarCollapsed ? (
                  /* --- ICON ONLY MODE --- */
                  <div className="flex flex-col items-center py-10 gap-12 animate-in fade-in zoom-in-95 duration-500">
                    <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black italic text-sm shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                      {board.board_id.substring(0, 1).toUpperCase()}
                    </div>
                    
                    <div className="flex flex-col items-center gap-8">
                       <div className="group relative p-2.5 rounded-xl bg-zinc-900/50 border border-white/5 text-zinc-500 hover:text-emerald-400 transition-all">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 2.6-2 3.5 0 1 1 2 2 2h15c1 0 2-1 2-2 0-.9-.5-2.24-2-3.5"/><path d="M12 15c3.31 0 6-2.69 6-6s-2.69-6-6-6-6 2.69-6 6 2.69 6 6 6Z"/><path d="m12 15-3.92 4.08a1 1 0 0 1-1.42 0l-1.08-1.08"/><path d="m12 15 3.92 4.08a1 1 0 0 0 1.42 0l1.08-1.08"/></svg>
                          <div className="flex flex-col gap-2 mt-4 items-center">
                            <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} />
                            <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                          </div>
                       </div>

                       <div className="p-2.5 rounded-xl bg-zinc-900/50 border border-white/5 text-zinc-600">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                       </div>
                    </div>
                  </div>
                ) : (
                  /* --- FULL CONTENT MODE --- */
                  <div className="p-8 space-y-10 animate-in fade-in slide-in-from-left-4 duration-500">
                    <div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-4xl font-black italic text-emerald-400 tracking-tighter leading-none truncate mb-6">{board.board_id}</span>
                        <div className="flex gap-3 bg-black/40 p-3 rounded-2xl border border-white/5 w-fit">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[7px] font-black text-zinc-600 uppercase">Kernel</span>
                            <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} />
                          </div>
                          <div className="w-px h-6 bg-zinc-800 self-center" />
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[7px] font-black text-zinc-600 uppercase">CM55</span>
                            <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="bg-black/20 p-4 rounded-2xl border border-white/5">
                        <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-2 flex items-center gap-2">
                           <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> Operational Task
                        </p>
                        <p className="text-sm font-bold text-zinc-300 leading-tight">{board.task_type}</p>
                        {board.start_time && (
                          <div className="mt-3 text-[10px] font-mono text-zinc-600 bg-black/30 px-2 py-1 rounded w-fit italic">
                            Started: {new Date(board.start_time).toLocaleString('zh-CN')}
                          </div>
                        )}
                      </div>

                      <div className="pt-8 border-t border-zinc-800/50">
                        <div className="flex justify-between items-end mb-4">
                           <span className="text-[9px] text-zinc-500 uppercase font-black tracking-widest">Progress</span>
                           <span className="text-2xl font-black text-emerald-500 tracking-tighter tabular-nums leading-none">
                             {Math.min(100, (board.elapsed_hours / 48) * 100).toFixed(1)}<span className="text-xs ml-0.5">%</span>
                           </span>
                        </div>
                        <div className="h-4 w-full bg-black/50 rounded-full overflow-hidden border border-white/5 p-1">
                          <div 
                            className="h-full bg-gradient-to-r from-emerald-600 via-emerald-400 to-emerald-300 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)] transition-all duration-1000"
                            style={{ width: `${Math.min(100, (board.elapsed_hours / 48) * 100)}%` }}
                          />
                        </div>
                        <div className="flex justify-between mt-6 text-[10px] font-black uppercase text-zinc-600 tracking-widest">
                           <div className="flex flex-col">
                             <span className="text-[8px] opacity-50 mb-1">Time Elapsed</span>
                             <span className="text-zinc-400">{board.elapsed_hours.toFixed(1)}h</span>
                           </div>
                           <div className="flex flex-col items-end">
                             <span className="text-[8px] opacity-50 mb-1">Current Loop</span>
                             <span className="text-emerald-500/80">{board.current_loop || 0}</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* --- MAIN FLUID PANEL --- */}
            <div className="flex-1 flex flex-col min-h-0 bg-[#080809] overflow-hidden">
               
               {/* Header Info Banner - Dynamic Relocation */}
               <div className="px-6 py-5 md:px-10 md:py-8 bg-[#0c0c0d] border-b border-zinc-800/60 shadow-xl z-20 flex flex-wrap items-center gap-8 md:gap-12">
                  <div className="flex items-center gap-5">
                     <div className="w-1.5 h-10 bg-gradient-to-b from-emerald-500 to-emerald-800 rounded-full" />
                     <div className="flex flex-col">
                        <p className="text-[10px] text-zinc-500 uppercase font-black tracking-[0.2em] mb-1">SoC Thermals (Min/Max)</p>
                        <div className="flex items-end gap-3">
                           <p className="text-3xl md:text-4xl font-black text-zinc-100 tabular-nums tracking-tighter leading-none">
                             <span className="text-emerald-400 group-hover:scale-110 transition-transform inline-block">{board.temp_min?.toFixed(0)}</span>
                             <span className="mx-2 text-zinc-800 font-light">/</span>
                             <span className={`${board.status === 'Warning' ? 'text-amber-400' : 'text-rose-500'} inline-block`}>
                               {board.temp_max?.toFixed(0)}
                             </span>
                           </p>
                           <span className="text-sm font-black text-zinc-600 mb-1">°C</span>
                        </div>
                     </div>
                  </div>

                  <div className="flex items-center gap-6 bg-zinc-900/30 px-6 py-3 rounded-2xl border border-white/5 hover:border-sky-500/30 transition-all">
                     <div className="flex flex-col">
                        <p className="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">DDR TS6 Edge</p>
                        <p className="text-2xl md:text-3xl font-black text-sky-400 tabular-nums leading-none tracking-tight">
                          {board.temp_ddr?.toFixed(0)}<span className="text-sm ml-0.5 text-zinc-600 font-bold">°</span>
                        </p>
                     </div>
                  </div>

                  {board.ddr_details && Object.keys(board.ddr_details).length > 0 && (
                    <div className="flex flex-col gap-1.5 border-l border-zinc-800/50 pl-8">
                       <p className="text-[8px] text-zinc-600 uppercase font-black tracking-[0.2em]">DDR CLUSTER (TS1-6)</p>
                       <div className="flex flex-wrap gap-2">
                          {Object.entries(board.ddr_details)
                            .sort((a, b) => a[0].localeCompare(b[0]))
                            .map(([name, val]) => (
                               <div key={name} className="flex items-center gap-2 bg-zinc-900/80 px-2 py-1 rounded-md border border-white/5">
                                  <span className="text-[9px] font-black text-zinc-500">{name}</span>
                                  <span className="text-xs font-black text-sky-500 tabular-nums">{val.toFixed(0)}°</span>
                               </div>
                            ))
                          }
                       </div>
                    </div>
                  )}

                  {/* Nodes Legend Summary (Compact) */}
                  <div className="ml-auto flex items-center gap-6">
                    <div className="hidden sm:flex flex-col items-end">
                      <p className="text-[9px] text-zinc-600 uppercase font-black tracking-widest mb-1">System Status</p>
                      <div className="flex items-center gap-3">
                         <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase border ${
                            board.status === 'Running' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
                            board.status === 'Warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
                            'bg-rose-500/10 border-rose-500/20 text-rose-400'
                         }`}>
                           {board.status}
                         </span>
                         <div className="flex items-center gap-2 px-2 py-0.5 bg-black/40 rounded border border-white/5">
                            <div className="relative w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]">
                               <div className="absolute inset-0 bg-emerald-400 rounded-full animate-ping opacity-75" />
                            </div>
                            <span className="text-[8px] font-bold text-zinc-500 uppercase tracking-tighter">Live Relay</span>
                         </div>
                      </div>
                    </div>
                  </div>
               </div>

               <div className="flex-1 flex flex-col p-4 md:p-8 space-y-8 overflow-hidden">
                 <div className="flex justify-between items-center flex-shrink-0">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-emerald-500 rotate-45" />
                      <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.4em]">Integrated Waveform Analytics</h3>
                    </div>
                 </div>

                 {board.status === 'Error' && board.errors.length > 0 && (
                    <div className="flex-shrink-0 bg-rose-500/5 border border-rose-500/20 p-6 rounded-3xl backdrop-blur-sm shadow-2xl animate-in slide-in-from-top-4 duration-500">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-8 h-8 rounded-full bg-rose-500/20 flex items-center justify-center text-rose-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        </div>
                        <p className="text-xs text-rose-400 uppercase font-black tracking-widest underline decoration-rose-500/30 underline-offset-4">Critical Fault Detection</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {board.errors.map((err, i) => (
                          <div key={i} className="flex gap-3 bg-black/40 p-3 rounded-xl border border-rose-500/10 hover:border-rose-500/30 transition-all">
                             <span className="text-rose-500 font-black italic">#0{i+1}</span>
                             <p className="text-sm font-bold text-rose-100/90 leading-snug">{err}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                 )}

                  <div className="flex-1 bg-black/60 border border-zinc-800/80 rounded-[2.5rem] p-6 md:p-10 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.8)] flex flex-col min-h-[400px] group transition-all duration-700 hover:border-emerald-500/20">
                    <div className="flex-1 min-h-0 relative">
                       {board.temp_points && board.temp_points.length > 0 ? (
                         <TemperatureChart dataPoints={board.temp_points} />
                       ) : (
                         <div className="absolute inset-0 flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 animate-pulse">
                               <div className="w-12 h-12 border-2 border-zinc-800 border-t-emerald-500 rounded-full animate-spin" />
                               <span className="text-zinc-700 italic text-[10px] uppercase font-black tracking-[0.3em]">Synchronizing Telemetry Flux...</span>
                            </div>
                         </div>
                       )}
                    </div>
                 </div>
               </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
