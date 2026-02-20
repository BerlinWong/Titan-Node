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
          <div className={`grid grid-cols-1 ${sidebarCollapsed ? 'lg:grid-cols-[80px_1fr]' : 'lg:grid-cols-5'} h-full flex-1 min-h-0 transition-all duration-300`}>
            {/* Sidebar */}
            <div className={`relative border-b lg:border-b-0 lg:border-r border-zinc-800/50 bg-zinc-900/40 custom-scrollbar flex-shrink-0 lg:flex-shrink transition-all duration-300 ${sidebarCollapsed ? 'p-2 overflow-hidden' : 'p-4 md:p-8 overflow-y-auto'}`}>
              
              {/* Collapse Toggle Button */}
              <button 
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-[100] w-6 h-12 bg-zinc-800 border border-zinc-700 rounded-full items-center justify-center text-zinc-400 hover:text-emerald-500 hover:bg-zinc-700 transition-all shadow-xl font-bold"
              >
                {sidebarCollapsed ? '→' : '←'}
              </button>

              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-8 mt-6">
                  <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-black italic text-sm">
                    {board.board_id.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex flex-col gap-4">
                    <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} />
                    <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                  </div>
                  <div className="flex flex-col gap-3 mt-4 text-[10px] font-black text-zinc-500 tabular-nums">
                    <div className="rotate-90 origin-center whitespace-nowrap">{board.temp_min?.toFixed(0)}°</div>
                    <div className="rotate-90 origin-center whitespace-nowrap text-rose-500">{board.temp_max?.toFixed(0)}°</div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 md:space-y-6">
                  <div className="flex justify-between items-start mb-4 md:mb-8">
                    <div className="flex flex-col min-w-0">
                      <span className="text-4xl font-black italic text-emerald-400 tracking-tighter leading-none truncate">{board.board_id}</span>
                      <div className="flex gap-2 mt-4 bg-black/40 p-2 rounded-xl border border-white/5 w-fit">
                        <HeartbeatDot timestamp={board.kernel_heartbeat} type="Kernel" gap={board.resurrection_gap} />
                        <HeartbeatDot timestamp={board.cm55_heartbeat} type="CM55" />
                      </div>
                    </div>
                    <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-tighter h-fit shrink-0 ${
                      board.status === 'Error' ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400' : 
                      board.resurrection_gap ? 'bg-amber-500/10 border border-amber-500/30 text-amber-400 animate-pulse' :
                      board.status === 'Running' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' : 'bg-zinc-800/30 text-zinc-500'
                    }`}>
                      {board.resurrection_gap ? 'Recovered' : board.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
                    <div className="min-w-0 overflow-hidden">
                      <p className="text-[9px] text-zinc-500 uppercase font-black tracking-widest mb-1">Operational Task</p>
                      <p className="text-sm font-bold text-zinc-300 leading-tight truncate">{board.task_type}</p>
                      {board.start_time && (
                        <div className="mt-2 text-[10px] font-mono text-zinc-500">
                          {new Date(board.start_time).toLocaleString('zh-CN')}
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className={`p-3 md:p-4 rounded-2xl border ${board.status === 'Warning' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20 border-zinc-800/30'}`}>
                        <p className={`text-[9px] uppercase font-black tracking-widest mb-1 ${board.status === 'Warning' ? 'text-amber-500/70' : 'text-zinc-500'}`}>SoC Range</p>
                        <p className={`text-lg md:text-xl font-black tabular-nums ${board.status === 'Warning' ? 'text-amber-400' : 'text-rose-500'}`}>
                          {board.temp_min?.toFixed(0)} - {board.temp_max?.toFixed(0)}°
                        </p>
                      </div>
                      <div className={`p-3 md:p-4 rounded-2xl border ${board.status === 'Warning' ? 'bg-amber-500/10 border-amber-500/30' : 'bg-black/20 border-zinc-800/30'}`}>
                        <p className={`text-[9px] uppercase font-black tracking-widest mb-1 ${board.status === 'Warning' ? 'text-amber-500/70' : 'text-zinc-500'}`}>DDR TS6</p>
                        <p className={`text-lg md:text-xl font-black tabular-nums ${board.status === 'Warning' ? 'text-amber-400' : 'text-sky-500'}`}>{board.temp_ddr?.toFixed(0)}°</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 md:pt-6 border-t border-zinc-800/50">
                    <div className="flex justify-between items-end mb-3">
                       <span className="text-[9px] text-zinc-500 uppercase font-black">Lifecycle Progress</span>
                       <span className="text-xl font-black text-emerald-500 tracking-tighter tabular-nums">{Math.min(100, (board.elapsed_hours / 48) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-3 w-full bg-black/50 rounded-full overflow-hidden border border-white/5">
                      <div 
                        className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-1000"
                        style={{ width: `${Math.min(100, (board.elapsed_hours / 48) * 100)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-4 text-[10px] font-black uppercase text-zinc-600">
                       <span>{board.elapsed_hours.toFixed(1)}h elapsed</span>
                       <span>Loop {board.current_loop || 0}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Temperature Module */}
            <div className={`p-4 md:p-8 flex flex-col bg-black/20 min-h-0 transition-all duration-300 ${sidebarCollapsed ? 'lg:col-span-1' : 'lg:col-span-4'}`}>
               <div className="flex justify-between items-center mb-6 flex-shrink-0">
                 <h3 className="text-xs font-black text-zinc-500 uppercase tracking-[0.2em]">Temperature Analytics</h3>
                 <div className="flex gap-4 items-center">
                    {board.status === 'Error' && <span className="text-[9px] bg-rose-500/20 text-rose-500 px-2 py-0.5 rounded border border-rose-500/30 font-black">STRESS CEILING / ERROR</span>}
                    {board.status === 'Warning' && <span className="text-[9px] bg-amber-500/20 text-amber-500 px-2 py-0.5 rounded border border-amber-500/30 font-black">THERMAL WARNING</span>}
                    <span className="text-emerald-500 text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                       <div className="relative flex items-center justify-center">
                          <div className="absolute w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                          <div className="relative w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                       </div>
                       Telemetry Active
                    </span>
                 </div>
               </div>

               {board.status === 'Error' && board.errors.length > 0 && (
                  <div className="mb-6 bg-rose-500/5 border-l-4 border-rose-500 p-5 rounded-r-2xl flex-shrink-0">
                    <p className="text-[10px] text-rose-500 uppercase font-black mb-2">Failure Reason</p>
                    <div className="space-y-1 overflow-hidden">
                      {board.errors.map((err, i) => (
                        <p key={i} className="text-sm font-bold text-rose-200 break-words leading-relaxed"># {err}</p>
                      ))}
                    </div>
                  </div>
               )}

                <div className="flex-1 bg-[#020202] border border-zinc-800/80 rounded-2xl p-4 md:p-6 overflow-hidden relative shadow-inner flex flex-col min-h-[350px] md:min-h-0">
                  <div className="flex-1 min-h-0 h-[300px] md:h-full">
                     {board.temp_points && board.temp_points.length > 0 ? (
                       <TemperatureChart dataPoints={board.temp_points} />
                     ) : (
                       <div className="h-full flex items-center justify-center text-zinc-700 italic text-[10px] uppercase tracking-widest">
                          Awaiting temperature telemetry...
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
