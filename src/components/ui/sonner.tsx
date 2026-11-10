"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CircleCheckIcon, InfoIcon, TriangleAlertIcon, OctagonXIcon, Loader2Icon } from "lucide-react"

/**
 * One look for every message in the app: top right under the app bar, a coloured bar and icon
 * per kind (success, error, warning, info), a close button, and the same 4.5 second timing.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      offset={{ top: 64, right: 16 }}
      mobileOffset={{ top: 64, left: 12, right: 12 }}
      duration={4500}
      gap={8}
      visibleToasts={4}
      closeButton
      icons={{
        success: <CircleCheckIcon className="size-[18px] text-success" />,
        info: <InfoIcon className="size-[18px] text-info" />,
        warning: <TriangleAlertIcon className="size-[18px] text-warning" />,
        error: <OctagonXIcon className="size-[18px] text-destructive" />,
        loading: <Loader2Icon className="size-[18px] animate-spin text-primary" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "0.5rem",
          "--width": "360px",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            "cn-toast items-start! gap-3! border! border-l-4! border-l-border! px-4! py-3! shadow-lg!",
          title: "text-[13.5px]! font-semibold! leading-5!",
          description: "text-[12.5px]! leading-5! text-muted-foreground!",
          icon: "mt-0.5!",
          closeButton:
            "left-auto! right-1! top-1! translate-x-0! translate-y-0! border-0! bg-transparent! text-muted-foreground! hover:bg-muted! hover:text-foreground!",
          success: "border-l-success!",
          error: "border-l-destructive!",
          warning: "border-l-warning!",
          info: "border-l-info!",
          loading: "border-l-primary!",
          actionButton: "rounded-sm! bg-primary! text-primary-foreground!",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
