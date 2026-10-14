import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DashboardPanel({
  hero,
  left,
  right,
  footer,
  activityFirst = false,
}: {
  hero: ReactNode;
  left: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
  /** On a narrow screen, show the right pane under the greeting so it is on screen. */
  activityFirst?: boolean;
}) {
  return (
    <div className="dash-stage">
      {hero}
      <section className={cn("dash-stage-split", activityFirst && "dash-stage-split-log")}>
        <div className="dash-stage-pane dash-stage-pane-session">{left}</div>
        <div className={cn("dash-stage-pane dash-stage-pane-end", activityFirst && "max-lg:order-first")}>
          {right}
        </div>
      </section>
      {footer ? <div className="dash-stage-footer">{footer}</div> : null}
    </div>
  );
}
