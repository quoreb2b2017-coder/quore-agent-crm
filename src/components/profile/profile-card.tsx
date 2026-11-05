import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { formatEmploymentStatus, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CopyValue } from "@/components/profile/copy-value";

export type ProfileRow = {
  label: string;
  value: string;
  copy?: boolean;
  href?: string;
};

const statusClass: Record<string, string> = {
  ACTIVE: "border-success/30 bg-success/10 text-success",
  ON_LEAVE: "border-warning/30 bg-warning/10 text-warning",
  SUSPENDED: "border-destructive/30 bg-destructive/10 text-destructive",
  TERMINATED: "bg-muted text-muted-foreground",
};

function Field({ row }: { row: ProfileRow }) {
  const empty = !row.value;
  const value = empty ? "Not set" : row.value;

  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] border-b last:border-b-0 sm:grid-cols-[10rem_minmax(0,1fr)]">
      <dt className="flex items-center border-r bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground">
        {row.label}
      </dt>
      <dd className="flex min-h-10 min-w-0 items-center justify-between gap-2 px-3 py-1 text-[13px]">
        {row.href && !empty ? (
          <a
            href={row.href}
            title={value}
            className="truncate font-medium text-primary underline-offset-2 hover:underline"
          >
            {value}
          </a>
        ) : (
          <span
            title={empty ? undefined : value}
            className={cn("truncate", empty ? "text-muted-foreground" : "font-medium")}
          >
            {value}
          </span>
        )}
        {!empty && row.copy ? <CopyValue value={row.value} className="size-6 rounded-sm" /> : null}
      </dd>
    </div>
  );
}

export function FieldSheet({ title, rows }: { title: string; rows: ProfileRow[] }) {
  return (
    <section className="min-w-0 border bg-card">
      <h2 className="border-b bg-ink px-3 py-2 text-[11px] font-semibold tracking-wider text-ink-foreground uppercase">
        {title}
      </h2>
      <dl>
        {rows.map((row) => (
          <Field key={row.label} row={row} />
        ))}
      </dl>
    </section>
  );
}

export function ProfileCard({
  name,
  role,
  employeeCode,
  status,
  tabs,
  actions,
  contact,
  work,
  children,
}: {
  name: string;
  role: string;
  employeeCode?: string;
  status?: string | null;
  tabs?: ReactNode;
  actions?: ReactNode;
  /** Leave out contact and work on tabs that show only their own sections. */
  contact?: ProfileRow[];
  work?: ProfileRow[];
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <section className="border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-mint-soft text-sm font-bold text-primary">
              {initials(name)}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
                {status ? (
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-sm font-semibold capitalize",
                      statusClass[status] ?? "text-muted-foreground"
                    )}
                  >
                    {formatEmploymentStatus(status)}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[13px] text-muted-foreground">
                {[role, employeeCode].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
        {tabs ? <div className="border-t [&>nav]:border-b-0">{tabs}</div> : null}
      </section>

      {contact && work ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <FieldSheet title="Contact" rows={contact} />
          <FieldSheet title="Employment" rows={work} />
        </div>
      ) : null}

      {children ? <div className="border bg-card px-4 py-4">{children}</div> : null}
    </div>
  );
}
