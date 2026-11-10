import type { Metadata } from "next";
import { after } from "next/server";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { FlashToast } from "@/components/layout/flash-toast";
import { TooltipProvider } from "@/components/ui/tooltip";
import { WorkSettingsBridge } from "@/components/layout/work-settings-bridge";
import { loadEffectiveWorkSettingsForCurrentUser } from "@/lib/work-settings-server";
import { ensureFederalHolidaysMarked } from "@/lib/federal-holiday-sync";
import { ensureGoogleTime } from "@/lib/google-time";

export const metadata: Metadata = {
  title: "WorkTrack by Quore",
  description: "Workforce, payroll and security compliance for Quore B2B",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [settings] = await Promise.all([
    loadEffectiveWorkSettingsForCurrentUser(),
    ensureGoogleTime().catch(() => null),
  ]);
  after(() => ensureFederalHolidaysMarked());
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      className="h-full antialiased"
    >
      <body className="flex min-h-full flex-col font-sans">
        <TooltipProvider>
          <WorkSettingsBridge settings={settings}>{children}</WorkSettingsBridge>
          <Toaster />
          <FlashToast />
        </TooltipProvider>
      </body>
    </html>
  );
}
