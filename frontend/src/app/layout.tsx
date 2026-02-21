import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Titan Node | Monitor",
  description: "Real-time Rig Monitoring Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-[#050505]`}>
        <div className="flex flex-col lg:flex-row">
          <Sidebar />
          <main className="flex-grow pt-16 lg:pt-0 lg:ml-64 min-h-screen">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
