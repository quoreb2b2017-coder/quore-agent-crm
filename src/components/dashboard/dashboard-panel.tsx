import type { ReactNode } from "react";

export function DashboardPanel({
  hero,
  left,
  right,
  footer,
}: {
  hero: ReactNode;
  left: ReactNode;
  right: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="dash-stage">
      {hero}
      <section className="dash-stage-split">
        <div className="dash-stage-pane">{left}</div>
        <div className="dash-stage-pane dash-stage-pane-end">{right}</div>
      </section>
      {footer ? <div className="dash-stage-footer">{footer}</div> : null}
    </div>
  );
}
