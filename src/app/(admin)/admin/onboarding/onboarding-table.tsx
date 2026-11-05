"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Search } from "lucide-react";
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
import { formatDate, initials } from "@/lib/format";
import {
  ONBOARDING_STATUS_LABEL,
  ONBOARDING_STATUS_TONE,
  WORK_STEPS,
  joiningCountdown,
  stepLabel,
} from "@/lib/onboarding";
import { sheetCellClassName, sheetHeadClassName, sheetRowClassName } from "@/lib/sheet-styles";
import { cn } from "@/lib/utils";
import type { OnboardingListRow } from "@/lib/queries/onboarding";

type Filter = "pending" | "completed" | "all";

const frozenNumberClassName = "sticky left-0 w-11 min-w-11 px-1 text-center";
const frozenNameClassName = "sm:sticky sm:left-11";

export function OnboardingTable({ rows, today }: { rows: OnboardingListRow[]; today: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("pending");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        row.fullName.toLowerCase().includes(q) ||
        row.email.toLowerCase().includes(q) ||
        row.employeeCode.toLowerCase().includes(q) ||
        row.department.toLowerCase().includes(q);
      const matchesFilter =
        filter === "all" ||
        (filter === "completed" ? row.status === "COMPLETED" : row.status !== "COMPLETED");
      return matchesQuery && matchesFilter;
    });
  }, [rows, query, filter]);

  const filters: { id: Filter; label: string; count: number }[] = [
    { id: "pending", label: "Pending", count: rows.filter((r) => r.status !== "COMPLETED").length },
    { id: "completed", label: "Completed", count: rows.filter((r) => r.status === "COMPLETED").length },
    { id: "all", label: "All", count: rows.length },
  ];

  return (
    <div className="border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted px-3 py-2">
        <div className="relative w-full sm:w-72 lg:w-96">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search name, email, ID or department"
            aria-label="Search joiners"
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
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "inline-flex h-[calc(2rem-2px)] items-center gap-1.5 px-3 text-xs font-semibold transition-colors",
                filter === item.id
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {item.label}
              <span className="tabular-nums">{item.count}</span>
            </button>
          ))}
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="p-6">
          <EmptyState
            icon={ClipboardCheck}
            title={filter === "pending" ? "Everyone is onboarded" : "No one here yet"}
            description="Add a new joiner to start their onboarding."
          />
        </div>
      ) : (
        <div className="[&>[data-slot=table-container]]:max-h-[calc(100svh-19rem)] [&>[data-slot=table-container]]:min-h-64">
          <Table className="border-separate border-spacing-0">
            <TableHeader className="sticky top-0 z-10">
              <TableRow className="hover:bg-transparent">
                <TableHead className={cn(sheetHeadClassName, frozenNumberClassName, "z-[2]")}>#</TableHead>
                <TableHead className={sheetHeadClassName}>Employee ID</TableHead>
                <TableHead className={cn(sheetHeadClassName, frozenNameClassName, "z-[2]")}>Name</TableHead>
                <TableHead className={sheetHeadClassName}>Department</TableHead>
                <TableHead className={sheetHeadClassName}>Joining date</TableHead>
                <TableHead className={sheetHeadClassName}>Joining status</TableHead>
                <TableHead className={sheetHeadClassName}>Next step</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-[18%] min-w-44")}>Progress</TableHead>
                <TableHead className={sheetHeadClassName}>Status</TableHead>
                <TableHead className={cn(sheetHeadClassName, "w-11 border-r-0 px-1")}>
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row, index) => {
                const href = `/admin/onboarding/${row.employeeId}`;
                return (
                  <TableRow
                    key={row.employeeId}
                    className={cn(sheetRowClassName, "group cursor-pointer")}
                    onClick={() => router.push(href)}
                  >
                    <TableCell
                      className={cn(
                        sheetCellClassName,
                        frozenNumberClassName,
                        "z-[1] bg-muted font-mono text-xs text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "font-mono text-xs font-semibold")}>
                      {row.employeeCode}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, frozenNameClassName, "z-[1] bg-inherit")}>
                      <Link
                        href={href}
                        className="flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Avatar className="size-7 rounded-md">
                          <AvatarFallback className="rounded-md bg-primary/10 text-[10px] font-bold text-primary">
                            {initials(row.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          title={row.fullName}
                          className="max-w-44 truncate font-semibold transition-colors group-hover:text-primary"
                        >
                          {row.fullName}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      {row.department || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "font-medium")}>
                      {formatDate(row.joiningDate)}
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "text-muted-foreground")}>
                      {joiningCountdown(row.joiningDate, today)}
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      {row.status === "COMPLETED" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        stepLabel(row.currentStep)
                      )}
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      <div className="flex items-center gap-2">
                        <div className="grid flex-1 grid-cols-5 gap-px border bg-border">
                          {WORK_STEPS.map((step, stepIndex) => (
                            <span
                              key={step.key}
                              title={`${step.label}: ${row.stepsDone[stepIndex] ? "done" : "not done"}`}
                              className={cn("h-3", row.stepsDone[stepIndex] ? "bg-success" : "bg-card")}
                            />
                          ))}
                        </div>
                        <span className="w-8 text-right text-xs font-semibold">
                          {row.done}/{row.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className={sheetCellClassName}>
                      <Badge
                        variant="outline"
                        className={cn("rounded-sm font-semibold", ONBOARDING_STATUS_TONE[row.status])}
                      >
                        {ONBOARDING_STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className={cn(sheetCellClassName, "border-r-0 px-1")}>
                      <ArrowRight
                        aria-hidden="true"
                        className="mx-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
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
        <span className="font-semibold text-foreground">{rows.length}</span> joiners
      </p>
    </div>
  );
}
