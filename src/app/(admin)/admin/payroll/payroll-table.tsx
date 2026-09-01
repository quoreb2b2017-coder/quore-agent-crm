"use client";

import { useMemo, useState } from "react";
import { Search, Wallet } from "lucide-react";
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
import { formatInr, formatIsoDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PayLine } from "@/lib/payroll";
import { SetupPayrollSheet, type PayrollEmployeeOption } from "./setup-payroll-sheet";

export type PayrollRow = {
  id: string;
  full_name: string;
  employee_code: string;
  base: number | null;
  hra: number;
  allowance: number;
  conveyance: number;
  incomeTax: number;
  providentFund: number;
  professionalTax: number;
  extraEarnings: PayLine[];
  extraDeductions: PayLine[];
  deductions: number;
  gross: number | null;
  pay_frequency: string | null;
  effective_from: string | null;
};

type StatusFilter = "all" | "setup" | "missing";

export function PayrollTable({
  rows,
  employees,
}: {
  rows: PayrollRow[];
  employees: PayrollEmployeeOption[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const counts = {
    all: rows.length,
    setup: rows.filter((row) => row.base != null).length,
    missing: rows.filter((row) => row.base == null).length,
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((row) => {
      const matchesQuery =
        !q ||
        row.full_name.toLowerCase().includes(q) ||
        row.employee_code.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "setup" && row.base != null) ||
        (statusFilter === "missing" && row.base == null);
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  const filters: { id: StatusFilter; label: string; count: number }[] = [
    { id: "all", label: "All", count: counts.all },
    { id: "setup", label: "On payroll", count: counts.setup },
    { id: "missing", label: "Not set up", count: counts.missing },
  ];

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardContent className="p-0">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Search className="size-4 text-muted-foreground" />
            <Input
              placeholder="Search employee or ID"
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
              icon={Wallet}
              title="No employees found"
              description="Try another search, or set up payroll for an employee."
            />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="pl-5">Employee</TableHead>
                <TableHead>Base</TableHead>
                <TableHead>HRA</TableHead>
                <TableHead>Allowance</TableHead>
                <TableHead>Gross</TableHead>
                <TableHead>Deductions</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead className="pr-4 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((row) => (
                <TableRow key={row.id} className="hover:bg-muted/40">
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-xl">
                        <AvatarFallback className="rounded-xl bg-primary/10 text-[11px] font-semibold text-primary">
                          {initials(row.full_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">{row.full_name}</span>
                        <span className="font-mono text-xs text-muted-foreground">
                          {row.employee_code}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="font-medium tabular-nums">{formatInr(row.base)}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.base == null ? "—" : formatInr(row.hra)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {row.base == null ? "—" : formatInr(row.allowance)}
                  </TableCell>
                  <TableCell className="font-semibold tabular-nums">{formatInr(row.gross)}</TableCell>
                  <TableCell className="tabular-nums">
                    {row.base == null ? "—" : formatInr(row.deductions)}
                  </TableCell>
                  <TableCell>
                    {row.pay_frequency ? (
                      <Badge variant="outline" className="capitalize">
                        {row.pay_frequency.toLowerCase()}
                      </Badge>
                    ) : row.base != null ? (
                      <span className="text-sm text-muted-foreground">—</span>
                    ) : (
                      <Badge variant="outline" className="border-warning/20 bg-warning/10 text-warning">
                        Not set up
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {row.effective_from ? formatIsoDate(row.effective_from) : "—"}
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <SetupPayrollSheet
                      employees={employees}
                      compact
                      triggerLabel={row.base == null ? "Setup" : "Edit"}
                      defaults={{
                        employeeId: row.id,
                        baseSalary: row.base,
                        hra: row.hra,
                        allowance: row.allowance,
                        conveyance: row.conveyance,
                        incomeTax: row.incomeTax,
                        providentFund: row.providentFund,
                        professionalTax: row.professionalTax,
                        extraEarnings: row.extraEarnings,
                        extraDeductions: row.extraDeductions,
                        payFrequency: row.pay_frequency ?? undefined,
                        effectiveFrom: row.effective_from ?? undefined,
                      }}
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
