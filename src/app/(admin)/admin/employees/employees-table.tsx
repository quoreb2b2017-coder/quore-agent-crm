"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CopyValue } from "@/components/profile/copy-value";
import { formatEmploymentStatus, initials, isEmploymentActive } from "@/lib/format";
import {
  sheetCellClassName as cellClassName,
  sheetHeadClassName as headClassName,
  sheetRowClassName as rowClassName,
} from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import { EmployeeRowActions } from "./employee-row-actions";

export type EmployeeRow = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  employmentStatus: string;
  departmentName: string;
  /** Login – logout label for this person. */
  shiftLabel: string;
  /** True when this person has their own schedule instead of the company shift. */
  hasCustomShift: boolean;
};

const statusTone: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success border-success/30",
  ON_LEAVE: "bg-warning/10 text-warning border-warning/30",
  SUSPENDED: "bg-destructive/10 text-destructive border-destructive/30",
  TERMINATED: "bg-muted text-muted-foreground border-border",
};

const statusDot: Record<string, string> = {
  ACTIVE: "bg-success",
  ON_LEAVE: "bg-warning",
  SUSPENDED: "bg-destructive",
  TERMINATED: "bg-muted-foreground",
};

/** Inactive people lose their department colour so they stand out in the list. */
const inactiveAvatarTone: Record<string, string> = {
  SUSPENDED: "bg-destructive/10 text-destructive",
  TERMINATED: "bg-muted text-muted-foreground",
};

const inactiveRowAccent: Record<string, string> = {
  SUSPENDED: "shadow-[inset_3px_0_0_0_var(--destructive)]",
  TERMINATED: "shadow-[inset_3px_0_0_0_var(--muted-foreground)]",
};

const departmentTones = [
  { avatar: "bg-chart-1/15", dot: "bg-chart-1" },
  { avatar: "bg-chart-2/15", dot: "bg-chart-2" },
  { avatar: "bg-chart-3/20", dot: "bg-chart-3" },
  { avatar: "bg-chart-4/15", dot: "bg-chart-4" },
  { avatar: "bg-chart-5/15", dot: "bg-chart-5" },
];

const blockedRowClassName =
  "bg-[color-mix(in_oklch,var(--destructive)_7%,var(--card))] even:bg-[color-mix(in_oklch,var(--destructive)_7%,var(--card))] hover:bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))] has-aria-expanded:bg-[color-mix(in_oklch,var(--destructive)_12%,var(--card))]";

const frozenNumberClassName = "sticky left-0 w-11 min-w-11 px-1 text-center";
const frozenNameClassName = "sm:sticky sm:left-11";

type StatusFilter = "all" | "active" | "inactive";
type SortKey = "fullName" | "email" | "employeeCode" | "departmentName" | "phone" | "employmentStatus";
type SortState = { key: SortKey; direction: "asc" | "desc" } | null;

function SortableHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const direction = sort?.key === sortKey ? sort.direction : null;
  const Icon = direction === "asc" ? ArrowUp : direction === "desc" ? ArrowDown : ChevronsUpDown;
  return (
    <TableHead
      className={cn(headClassName, className)}
      aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1.5 uppercase transition-colors hover:text-white"
      >
        {label}
        <Icon className={cn("size-3.5", direction ? "text-mint" : "opacity-60")} />
      </button>
    </TableHead>
  );
}

/** Stops Excel from running a cell as a formula, then quotes it for CSV. */
function csvCell(value: string) {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function downloadEmployeesCsv(rows: EmployeeRow[]) {
  const header = ["Employee ID", "Name", "Email", "Department", "Shift", "Shift type", "Phone", "Status"];
  const lines = rows.map((row) =>
    [
      row.employeeCode,
      row.fullName,
      row.email,
      row.departmentName,
      row.shiftLabel,
      row.hasCustomShift ? "Custom" : "Company",
      row.phone ?? "",
      formatEmploymentStatus(row.employmentStatus),
    ]
      .map(csvCell)
      .join(",")
  );
  // The BOM makes Excel read the file as UTF-8, so the shift dash stays intact.
  const bom = String.fromCharCode(0xfeff);
  const blob = new Blob([`${bom}${[header.map(csvCell).join(","), ...lines].join("\r\n")}`], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function EmployeesTable({
  rows,
  currentEmployeeId,
  canDelete,
}: {
  rows: EmployeeRow[];
  currentEmployeeId: string;
  canDelete: boolean;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sort, setSort] = useState<SortState>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.employeeCode.toLowerCase().includes(q) ||
        row.departmentName.toLowerCase().includes(q) ||
        (row.phone ?? "").toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && isEmploymentActive(row.employmentStatus)) ||
        (statusFilter === "inactive" && !isEmploymentActive(row.employmentStatus));
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  // Without a chosen column, keep the department order from the server.
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const factor = sort.direction === "asc" ? 1 : -1;
    return [...filtered].sort(
      (a, b) =>
        factor * (a[sort.key] ?? "").localeCompare(b[sort.key] ?? "", undefined, { numeric: true })
    );
  }, [filtered, sort]);

  // Ascending, then descending, then back to the default order.
  function toggleSort(key: SortKey) {
    setSort((current) => {
      if (current?.key !== key) return { key, direction: "asc" };
      return current.direction === "asc" ? { key, direction: "desc" } : null;
    });
  }

  // Built from all rows so a department keeps its colour while filtering.
  const departmentToneByName = useMemo(() => {
    const names = [...new Set(rows.map((row) => row.departmentName))].sort();
    return new Map(
      names.map((name, index) => [name, departmentTones[index % departmentTones.length]])
    );
  }, [rows]);

  const counts = {
    all: rows.length,
    active: rows.filter((row) => isEmploymentActive(row.employmentStatus)).length,
    inactive: rows.filter((row) => !isEmploymentActive(row.employmentStatus)).length,
  };

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "active", label: "Active", count: counts.active },
    { id: "inactive", label: "Inactive", count: counts.inactive },
  ];

  return (
    <div className="border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted px-3 py-2">
        <div className="relative w-full sm:w-72 lg:w-96">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, ID, or department"
            aria-label="Search employees"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="rounded-sm bg-card pl-8"
          />
        </div>
        <div className="inline-flex divide-x rounded-sm border bg-card">
          {filters.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={statusFilter === item.id}
              onClick={() => setStatusFilter(item.id)}
              className={cn(
                "inline-flex h-[calc(2rem-2px)] items-center gap-1.5 px-3 text-xs font-semibold transition-colors",
                statusFilter === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {item.label}
              <span className="tabular-nums">{item.count}</span>
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="rounded-sm bg-card sm:ml-auto"
          disabled={sorted.length === 0}
          onClick={() => downloadEmployeesCsv(sorted)}
        >
          <Download className="size-4" />
          Export to Excel
        </Button>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={Users}
            title="No employees found"
            description="Try another search or status filter, or add a new employee."
          />
        </div>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-15rem)] [&>[data-slot=table-container]]:min-h-64">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(headClassName, frozenNumberClassName, "z-[2]")}>#</TableHead>
                <SortableHead label="Employee ID" sortKey="employeeCode" sort={sort} onSort={toggleSort} />
                <SortableHead
                  label="Name"
                  sortKey="fullName"
                  sort={sort}
                  onSort={toggleSort}
                  className={cn(frozenNameClassName, "z-[2]")}
                />
                <SortableHead label="Email" sortKey="email" sort={sort} onSort={toggleSort} />
                <SortableHead label="Department" sortKey="departmentName" sort={sort} onSort={toggleSort} />
                <TableHead className={headClassName}>Shift</TableHead>
                <SortableHead label="Phone" sortKey="phone" sort={sort} onSort={toggleSort} />
                <SortableHead label="Status" sortKey="employmentStatus" sort={sort} onSort={toggleSort} />
                <TableHead className={cn(headClassName, "w-11 border-r-0 px-1")}>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((row, index) => {
                const departmentTone = departmentToneByName.get(row.departmentName);
                const profileHref = `/admin/employees/${row.id}`;
                return (
                  <TableRow
                    key={row.id}
                    className={row.employmentStatus === "SUSPENDED" ? blockedRowClassName : rowClassName}
                  >
                    <TableCell
                      className={cn(
                        cellClassName,
                        frozenNumberClassName,
                        "z-[1] bg-muted font-mono text-xs text-muted-foreground tabular-nums",
                        inactiveRowAccent[row.employmentStatus]
                      )}
                    >
                      {index + 1}
                    </TableCell>
                    <TableCell className={cn(cellClassName, "font-mono text-xs font-semibold")}>
                      {row.employeeCode}
                    </TableCell>
                    <TableCell className={cn(cellClassName, frozenNameClassName, "z-[1] bg-inherit")}>
                      <div className="flex items-center gap-2">
                        <Link href={profileHref} tabIndex={-1} aria-hidden="true">
                          <Avatar className="size-7 rounded-md">
                            <AvatarFallback
                              className={cn(
                                "rounded-md text-[10px] font-bold text-foreground",
                                inactiveAvatarTone[row.employmentStatus] ?? departmentTone?.avatar
                              )}
                            >
                              {initials(row.fullName)}
                            </AvatarFallback>
                          </Avatar>
                        </Link>
                        <Link
                          href={profileHref}
                          title={row.fullName}
                          className="max-w-44 truncate font-semibold transition-colors hover:text-primary"
                        >
                          {row.fullName}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell className={cn(cellClassName, "text-muted-foreground")}>
                      <div className="flex items-center justify-between gap-1">
                        <span title={row.email} className="max-w-56 truncate">
                          {row.email}
                        </span>
                        <CopyValue value={row.email} className="size-6 rounded-sm" />
                      </div>
                    </TableCell>
                    <TableCell className={cellClassName}>
                      <span className="inline-flex items-center gap-2 font-medium">
                        <span
                          aria-hidden="true"
                          className={cn("size-2 rounded-full", departmentTone?.dot)}
                        />
                        {row.departmentName}
                      </span>
                    </TableCell>
                    <TableCell className={cellClassName}>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums">{row.shiftLabel}</span>
                        {row.hasCustomShift ? (
                          <Badge
                            variant="outline"
                            className="rounded-sm border-info/30 bg-info/10 font-semibold text-info"
                          >
                            Custom
                          </Badge>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className={cn(cellClassName, "tabular-nums")}>
                      {row.phone || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={cellClassName}>
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1.5 rounded-sm font-semibold capitalize",
                          statusTone[row.employmentStatus]
                        )}
                      >
                        <span
                          aria-hidden="true"
                          className={cn("size-1.5 rounded-full", statusDot[row.employmentStatus])}
                        />
                        {formatEmploymentStatus(row.employmentStatus)}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn(cellClassName, "border-r-0 px-1 text-center")}>
                      <EmployeeRowActions
                        employeeId={row.id}
                        fullName={row.fullName}
                        isBlocked={row.employmentStatus === "SUSPENDED"}
                        isSelf={row.id === currentEmployeeId}
                        canDelete={canDelete}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
      <p
        className="border-t bg-muted px-3 py-1.5 text-xs text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        Showing <span className="font-semibold text-foreground">{filtered.length}</span> of{" "}
        <span className="font-semibold text-foreground">{rows.length}</span> employees
      </p>
    </div>
  );
}
