"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function ExcelDownloadButton({ href, className }: { href: string; className?: string }) {
  const [isExporting, setIsExporting] = useState(false);

  async function download() {
    setIsExporting(true);
    try {
      const response = await fetch(href);
      if (!response.ok) throw new Error("Download failed");
      const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") ?? "")?.[1];
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name ?? "activity.xlsx";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Could not download the Excel file. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Button type="button" size="sm" variant="outline" className={className} disabled={isExporting} onClick={download}>
      {isExporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      {isExporting ? "Preparing..." : "Download Excel"}
    </Button>
  );
}
