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
  ACTIVE: "border-success/20 bg-success/10 text-success",
  ON_LEAVE: "border-warning/20 bg-warning/10 text-warning-foreground",
  SUSPENDED: "border-destructive/20 bg-destructive/10 text-destructive",
  TERMINATED: "bg-muted text-muted-foreground",
};

function Field({ row }: { row: ProfileRow }) {
  const empty = !row.value;
  const value = empty ? "Not set" : row.value;

  return (
    <div className="flex items-start justify-between gap-3 py-3.5">
      <div className="min-w-0">
        <p className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          {row.label}
        </p>
        {row.href && !empty ? (
          <a
            href={row.href}
            className="mt-1 block truncate text-sm font-medium text-foreground hover:underline"
          >
            {value}
          </a>
        ) : (
          <p
            className={cn(
              "mt-1 truncate text-sm font-medium",
              empty && "text-muted-foreground"
            )}
          >
            {value}
          </p>
        )}
      </div>
      {!empty && row.copy ? <CopyValue value={row.value} /> : null}
    </div>
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
  contact: ProfileRow[];
  work: ProfileRow[];
  children?: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      {tabs}
      <div className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-primary-foreground">
            {initials(name)}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{name}</h1>
              {status ? (
                <Badge
                  variant="outline"
                  className={cn(
                    "h-6 capitalize",
                    statusClass[status] ?? "text-muted-foreground"
                  )}
                >
                  {formatEmploymentStatus(status)}
                </Badge>
              ) : null}
            </div>
            <p className="mt-1 truncate text-sm text-muted-foreground">
              {[role, employeeCode].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>

      <div className="grid border-t lg:grid-cols-2">
        <div className="px-6 py-5 sm:px-8">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Contact
          </p>
          <div className="mt-1 divide-y">
            {contact.map((row) => (
              <Field key={row.label} row={row} />
            ))}
          </div>
        </div>
        <div className="border-t px-6 py-5 sm:px-8 lg:border-t-0 lg:border-l">
          <p className="text-xs font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Employment
          </p>
          <div className="mt-1 divide-y">
            {work.map((row) => (
              <Field key={row.label} row={row} />
            ))}
          </div>
        </div>
      </div>

      {children ? <div className="border-t px-6 py-6 sm:px-8">{children}</div> : null}
    </section>
  );
}
