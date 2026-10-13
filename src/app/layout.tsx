import type { Metadata } from "next";
import { after } from "next/server";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkSettingsBridge } from "@/components/layout/work-settings-bridge";
import { loadWorkSettings } from "@/lib/work-settings-server";
import { ensureFederalHolidaysMarked } from "@/lib/federal-holiday-sync";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "WorkTrack — Employee Management",
  description: "Role-based employee management, attendance, and productivity platform",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const settings = await loadWorkSettings();
  after(() => ensureFederalHolidaysMarked());
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>
          <WorkSettingsBridge settings={settings}>{children}</WorkSettingsBridge>
          <Toaster />
        </TooltipProvider>
      </body>
    </html>
  );
}
