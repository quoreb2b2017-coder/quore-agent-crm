import Image from "next/image";
import { companyProfile } from "@/lib/company";
import { formatMonthLabel } from "@/lib/format";
import { formatPayDate, formatPayDays, formatPayslipMoney } from "@/lib/payroll";
import { indianRupeeInWords } from "@/lib/salary-words";
import type { ComputedPayslip } from "@/lib/salary-calc";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[9.5rem_auto_1fr] items-baseline gap-x-2 text-[13px] leading-7">
      <span className="text-[#6b7280]">{label}</span>
      <span className="text-[#9ca3af]">:</span>
      <span className="font-medium text-[#111827]">{value}</span>
    </div>
  );
}

function CompactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-[13px] leading-7">
      <span className="w-[5.75rem] shrink-0 text-[#6b7280]">{label}</span>
      <span className="text-[#9ca3af]">:</span>
      <span className="font-medium text-[#111827]">{value}</span>
    </div>
  );
}

function AmountRows({
  rows,
  emptyLabel,
}: {
  rows: { name: string; amount: number }[];
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-sm text-[#9ca3af]">{emptyLabel ?? "None"}</p>
    );
  }
  return (
    <ul>
      {rows.map((row, index) => (
        <li
          key={`${row.name}-${index}`}
          className="flex items-center justify-between gap-4 border-b border-dotted border-[#d1d5db] px-4 py-2.5 text-[13px]"
        >
          <span className="text-[#374151]">{row.name}</span>
          <span className="tabular-nums text-[#111827]">{formatPayslipMoney(row.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SalarySlipDocument({ slip }: { slip: ComputedPayslip }) {
  const company = companyProfile();
  const earnings = slip.earnings.length ? slip.earnings : [{ name: "Basic", amount: 0 }];

  return (
    <article className="mx-auto w-full max-w-[880px] bg-white px-5 py-6 text-[#111827] shadow-sm ring-1 ring-black/10 sm:px-8 sm:py-8">
      <header className="flex items-start justify-between gap-4 border-b border-[#e5e7eb] pb-5">
        <div className="flex min-w-0 items-start gap-3">
          <Image
            src="/logo.png"
            alt=""
            width={48}
            height={48}
            className="size-12 rounded-md object-cover"
          />
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold tracking-tight">{company.legalName}</h1>
            <p className="mt-1 max-w-md text-xs leading-5 text-[#6b7280]">{company.address}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-[#6b7280]">Payslip For the Month</p>
          <p className="mt-1 text-lg font-semibold">{formatMonthLabel(slip.month)}</p>
        </div>
      </header>

      <h2 className="mt-6 text-[11px] font-semibold tracking-[0.16em] text-[#6b7280]">
        EMPLOYEE SUMMARY
      </h2>

      <div className="mt-3 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_16.5rem]">
        <div className="min-w-0">
          <SummaryRow label="Employee Name" value={slip.fullName} />
          <SummaryRow label="Employee ID" value={slip.employeeCode} />
          <SummaryRow label="Pay Period" value={formatMonthLabel(slip.month)} />
          <SummaryRow label="Pay Date" value={formatPayDate(slip.payDate)} />
        </div>

        <div className="overflow-hidden rounded-md border border-[#d1d5db]">
          <div className="flex bg-[#EAF6EE]">
            <div className="w-1.5 shrink-0 bg-[#3CB371]" />
            <div className="px-4 py-3">
              <p className="text-[22px] font-bold tabular-nums leading-none">
                {formatPayslipMoney(slip.net)}
              </p>
              <p className="mt-1.5 text-xs text-[#6b7280]">Total Net Pay</p>
            </div>
          </div>
          <div className="border-t border-dashed border-[#d1d5db] px-4 py-3">
            <CompactRow label="Paid Days" value={formatPayDays(slip.attendance.paidDays)} />
            <CompactRow label="LOP Days" value={formatPayDays(slip.attendance.lopDays)} />
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-md border border-[#d1d5db]">
        <div className="grid grid-cols-1 sm:grid-cols-2">
          <section className="flex min-h-[148px] flex-col border-b border-[#e5e7eb] sm:border-r sm:border-b-0">
            <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold tracking-[0.12em] text-[#6b7280]">
              <span>EARNINGS</span>
              <span>AMOUNT</span>
            </div>
            <div className="flex-1">
              <AmountRows rows={earnings} />
            </div>
          </section>
          <section className="flex min-h-[148px] flex-col">
            <div className="flex items-center justify-between px-4 py-2.5 text-[11px] font-semibold tracking-[0.12em] text-[#6b7280]">
              <span>DEDUCTIONS</span>
              <span>AMOUNT</span>
            </div>
            <div className="flex-1">
              <AmountRows rows={slip.deductions} emptyLabel="No deductions" />
            </div>
          </section>
        </div>
        <div className="grid grid-cols-1 border-t border-[#e5e7eb] bg-[#f3f4f6] sm:grid-cols-2">
          <div className="flex items-center justify-between px-4 py-2.5 text-[13px] font-semibold">
            <span>Gross Earnings</span>
            <span className="tabular-nums">{formatPayslipMoney(slip.gross)}</span>
          </div>
          <div className="flex items-center justify-between border-t border-[#e5e7eb] px-4 py-2.5 text-[13px] font-semibold sm:border-t-0 sm:border-l">
            <span>Total Deductions</span>
            <span className="tabular-nums">{formatPayslipMoney(slip.totalDeductions)}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-2 rounded-md border border-[#d1d5db] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold tracking-wide">TOTAL NET PAYABLE</p>
          <p className="text-xs text-[#6b7280]">Gross Earnings - Total Deductions</p>
        </div>
        <p className="rounded-md bg-[#EAF6EE] px-4 py-2 text-lg font-bold tabular-nums">
          {formatPayslipMoney(slip.net)}
        </p>
      </div>

      <p className="mt-4 text-[13px]">
        <span className="text-[#6b7280]">Amount In Words : </span>
        <span className="font-medium">{indianRupeeInWords(slip.net)}</span>
      </p>

      <p className="mt-8 text-[11px] text-[#9ca3af]">
        This is a system generated payslip and does not require signature.
      </p>
    </article>
  );
}
