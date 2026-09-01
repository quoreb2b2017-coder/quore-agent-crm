"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Users } from "lucide-react";
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
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/dashboard/empty-state";
import { CopyValue } from "@/components/profile/copy-value";
import { formatEmploymentStatus, initials, isEmploymentActive } from "@/lib/format";
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
};

const statusTone: Record<string, string> = {
  ACTIVE: "bg-success/10 text-success border-success/20",
  ON_LEAVE: "bg-warning/10 text-warning border-warning/20",
  SUSPENDED: "bg-destructive/10 text-destructive border-destructive/20",
  TERMINATED: "bg-muted text-muted-foreground border-transparent",
};

const avatarTone: Record<string, string> = {
  ACTIVE: "bg-success/12 text-success",
  ON_LEAVE: "bg-warning/15 text-warning-foreground",
  SUSPENDED: "bg-destructive/10 text-destructive",
  TERMINATED: "bg-muted text-muted-foreground",
};

type StatusFilter = "all" | "active" | "inactive";

export function EmployeesTable({
  rows,
  currentEmployeeId,
}: {
  rows: EmployeeRow[];
  currentEmployeeId: string;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, ID, or department"
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
                onClick={() => setStatusFilter(item.id)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition",
                  statusFilter === item.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {item.label}
                <span
                  className={cn(
                    "tabular-nums",
                    statusFilter === item.id ? "text-primary-foreground/80" : "text-muted-foreground"
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
              icon={Users}
              title="No employees found"
              description="Try another search or status filter, or add a new employee."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Employee ID</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12 pr-4">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  <TableCell className="pl-5">
                    <Link href={`/admin/employees/${row.id}`} className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-xl">
                        <AvatarFallback
                          className={cn(
                            "rounded-xl text-[11px] font-semibold",
                            avatarTone[row.employmentStatus] ?? "bg-muted"
                          )}
                        >
                          {initials(row.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium hover:underline">{row.fullName}</span>
                        <span className="flex min-w-0 items-center gap-1">
                          <span className="truncate text-xs text-muted-foreground">{row.email}</span>
                          <CopyValue value={row.email} />
                        </span>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-[11px] font-medium">
                      {row.employeeCode}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{row.departmentName}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{row.phone || "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={cn("font-medium capitalize", statusTone[row.employmentStatus])}
                    >
                      {formatEmploymentStatus(row.employmentStatus)}
                    </Badge>
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <EmployeeRowActions
                      employeeId={row.id}
                      fullName={row.fullName}
                      isBlocked={row.employmentStatus === "SUSPENDED"}
                      isSelf={row.id === currentEmployeeId}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
