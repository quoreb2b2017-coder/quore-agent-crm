"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ClipboardCheck, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
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
import { cn } from "@/lib/utils";
import type { OnboardingListRow } from "@/lib/queries/onboarding";

type Filter = "pending" | "completed" | "all";

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
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, ID or department"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 max-w-sm border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <div className="inline-flex rounded-lg border p-0.5">
            {filters.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setFilter(item.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition",
                  filter === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "tabular-nums",
                    filter === item.id ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}
                >
                  {item.count}
                </span>
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
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Joining</TableHead>
                <TableHead>Next step</TableHead>
                <TableHead className="w-[22%]">Progress</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => {
                const href = `/admin/onboarding/${row.employeeId}`;
                return (
                  <TableRow
                    key={row.employeeId}
                    className="group cursor-pointer hover:bg-muted/40"
                    onClick={() => router.push(href)}
                  >
                    <TableCell className="pl-5">
                      <Link href={href} className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                        <Avatar className="size-9 rounded-xl">
                          <AvatarFallback className="rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                            {initials(row.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate font-medium group-hover:underline">{row.fullName}</span>
                          <span className="truncate text-xs text-muted-foreground">
                            {[row.employeeCode, row.department].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className="block text-sm">{formatDate(row.joiningDate)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {joiningCountdown(row.joiningDate, today)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.status === "COMPLETED" ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        stepLabel(row.currentStep)
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="grid flex-1 grid-cols-5 gap-1">
                          {WORK_STEPS.map((step, index) => (
                            <span
                              key={step.key}
                              title={step.label}
                              className={cn(
                                "h-1.5 rounded-full",
                                row.stepsDone[index] ? "bg-success" : "bg-muted"
                              )}
                            />
                          ))}
                        </div>
                        <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                          {row.done}/{row.total}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={cn("font-medium", ONBOARDING_STATUS_TONE[row.status])}>
                        {ONBOARDING_STATUS_LABEL[row.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <ArrowRight className="ml-auto size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
