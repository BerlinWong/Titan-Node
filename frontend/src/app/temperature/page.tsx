"use client";

import React, { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts';

export default function TemperaturePage() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);
  const [fileInfo, setFileInfo] = useState<string>('');
  const [stats, setStats] = useState({ max: '--', min: '--', sensors: '--', points: '--' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (chartRef.current) {
      chartInstance.current = echarts.init(chartRef.current, 'dark');
      
      const option = {
        backgroundColor: 'transparent',
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(16, 20, 30, 0.95)',
          borderWidth: 0,
          textStyle: { color: '#fff', fontSize: 13 },
          axisPointer: {
            type: 'cross',
            lineStyle: { color: 'rgba(255,255,255,0.2)' },
          },
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
          type: 'scroll',
          orient: 'vertical',
          left: 10,
          top: 40,
          bottom: 40,
          textStyle: { color: '#ccc', fontSize: 11 },
          pageTextStyle: { color: '#fff' },
          inactiveColor: '#444',
          itemGap: 12,
          width: 180,
        },
        grid: {
          left: 230,
          right: 80,
          bottom: 80,
          top: 40,
          containLabel: true,
        },
        xAxis: {
          type: 'time',
          axisLine: { lineStyle: { color: '#444' } },
          axisLabel: {
            color: '#888',
            hideOverlap: true,
            margin: 15,
          },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          axisLine: { show: false },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
          axisLabel: { color: '#888', formatter: '{value} °C' },
        },
        dataZoom: [
          { type: 'inside', start: 0, end: 100 },
          {
            show: true,
            type: 'slider',
            bottom: 10,
            height: 20,
            backgroundColor: 'rgba(255,255,255,0.02)',
            fillerColor: 'rgba(16, 185, 129, 0.2)',
            borderColor: 'transparent',
            handleSize: '80%',
            textStyle: { color: '#888' },
          },
        ],
        series: [],
      };

      chartInstance.current.setOption(option);
    }

    const handleResize = () => {
      chartInstance.current?.resize();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      chartInstance.current?.dispose();
    };
  }, []);

  const processData = (text: string) => {
    const regex = /\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\].*?thm log handler: \[(.*?)\] ([-+]?\d*\.?\d+) C/g;
    
    const sensorDataMap = new Map();
    let match;
    let globalMaxV = -Infinity;
    let globalMinV = Infinity;
    let count = 0;

    while ((match = regex.exec(text)) !== null) {
      const timeStr = match[1];
      const sensorName = match[2];
      const val = parseFloat(match[3]);
      
      if (!sensorDataMap.has(sensorName)) {
        sensorDataMap.set(sensorName, []);
      }
      
      const dateObj = new Date(timeStr.replace(/-/g, "/"));
      sensorDataMap.get(sensorName).push([dateObj, val]);
      
      if (val > globalMaxV) globalMaxV = val;
      if (val < globalMinV) globalMinV = val;
      count++;
    }

    if (sensorDataMap.size === 0) {
      alert("未能识别有效的温度数据（CM55 格式），请检查日志内容。");
      setLoading(false);
      return;
    }

    const series: any[] = [];
    const selected: Record<string, boolean> = {};
    const sensorNames = Array.from(sensorDataMap.keys());

    sensorNames.forEach((name) => {
      const data = sensorDataMap.get(name);
      data.sort((a: any, b: any) => a[0] - b[0]);

      const isDefaultVisible = name.toUpperCase().includes("CPU") || name.toUpperCase().includes("DDR");
      series.push({
        name: name,
        type: 'line',
        smooth: true,
        symbol: 'none',
        emphasis: { focus: 'series', lineStyle: { width: 4 } },
        data: data,
      });
      selected[name] = isDefaultVisible;
    });

    setStats({
      max: globalMaxV.toFixed(2),
      min: globalMinV.toFixed(2),
      sensors: sensorDataMap.size.toString(),
      points: count.toString()
    });

    chartInstance.current?.setOption({
      legend: { data: sensorNames, selected: selected },
      series: series
    });

    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setFileInfo(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      processData(content);
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-6 lg:p-12 space-y-8 bg-[#050505] min-h-screen text-zinc-100">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-zinc-500 text-xs font-black uppercase tracking-[0.3em] mb-2">Diagnostic Tools</h2>
          <h1 className="text-3xl font-bold tracking-tight italic uppercase">Temperature <span className="text-emerald-500">Analyzer</span></h1>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">{fileInfo || 'Awaiting Data Source'}</p>
        </div>
      </header>

      <div className="relative group overflow-hidden">
        <input 
          type="file" 
          onChange={handleFileUpload}
          className="absolute inset-0 opacity-0 cursor-pointer z-20" 
          accept=".log,.txt"
        />
        <div className="bg-[#0a0a0b] border-2 border-dashed border-zinc-800 rounded-3xl p-10 text-center transition-all duration-500 group-hover:border-emerald-500/50 group-hover:bg-emerald-500/[0.02]">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform">
            <span className="text-2xl">📁</span>
          </div>
          <p className="text-sm font-bold text-zinc-400 uppercase tracking-widest">
            Drop <span className="text-emerald-500">temperature.log</span> or click to browse
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Max Peak', value: stats.max, unit: '°C', color: 'text-rose-500' },
          { label: 'Min Floor', value: stats.min, unit: '°C', color: 'text-sky-500' },
          { label: 'Sample Nodes', value: stats.sensors, unit: 'UNIT', color: 'text-emerald-500' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#0a0a0b] border border-zinc-800/50 rounded-2xl p-6 shadow-xl transition-transform hover:-translate-y-1">
            <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mb-3">{stat.label}</p>
            <div className={`text-3xl font-black ${stat.color}`}>
              {stat.value}
              <span className="text-xs ml-2 opacity-50">{stat.unit}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#0a0a0b] border border-zinc-800/50 rounded-3xl p-6 shadow-2xl relative min-h-[600px] flex flex-col">
        <div className="flex justify-between items-center mb-6 px-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-breath shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Time-Series Render</span>
          </div>
          <span className="text-[10px] font-mono text-zinc-600">{stats.points} Data Points Loaded</span>
        </div>
        
        <div className="flex-grow relative">
          <div ref={chartRef} className="absolute inset-0 w-full h-full" />
          {loading && (
            <div className="absolute inset-0 bg-[#0a0a0b]/80 backdrop-blur-sm flex items-center justify-center z-10 rounded-2xl">
              <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em]">Processing Stream...</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="pt-8 pb-4 text-center">
        <p className="text-[9px] text-zinc-700 font-bold uppercase tracking-[0.2em]">
          Powered by Titan Analysis Engine v2.4 · ECharts Time-Series Platform
        </p>
      </footer>
    </div>
  );
}
