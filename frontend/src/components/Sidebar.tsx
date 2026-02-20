"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const Sidebar = () => {
  const pathname = usePathname();

  const menuItems = [
    { name: "仪表盘", href: "/", icon: "📊" },
    { name: "温度分析", href: "/temperature", icon: "🌡️" },
  ];

  return (
    <aside className="w-64 min-h-screen bg-[#0a0a0b] border-r border-zinc-800/50 flex flex-col fixed left-0 top-0 z-[60]">
      <div className="p-8 border-b border-zinc-800/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-emerald-500 to-emerald-400 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(16,185,129,0.2)]">
            <div className="w-4 h-4 border-2 border-black/20 rounded-sm" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase italic text-white">
              Titan <span className="text-emerald-500 text-xs">Node</span>
            </h1>
          </div>
        </div>
      </div>

      <nav className="flex-grow p-6 space-y-2">
        <p className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-600 mb-4">
          Main Menu
        </p>
        {menuItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center gap-4 px-4 py-3 rounded-xl transition-all duration-300 group ${
              pathname === item.href
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.05)]"
                : "text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent"
            }`}
          >
            <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">
              {item.icon}
            </span>
            <span className="text-xs font-bold uppercase tracking-widest">
              {item.name}
            </span>
            {pathname === item.href && (
              <div className="ml-auto w-1 h-4 bg-emerald-500 rounded-full" />
            )}
          </Link>
        ))}
      </nav>

      <div className="p-8 mt-auto border-t border-zinc-800/50">
        <div className="p-4 bg-zinc-900/50 rounded-2xl border border-zinc-800/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-breath shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
            <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400">
              System Link
            </span>
          </div>
          <p className="text-[8px] text-zinc-600 font-bold leading-tight">
            V2.4.0 ENCRYPTED CONNECTION STABLE
          </p>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
