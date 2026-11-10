import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Download, FileWarning } from "lucide-react";
import {
  campaignAccess,
  campaignRolesFor,
  canOpenCategory,
  canUploadDatabase,
  requireCampaigns,
} from "@/lib/campaigns/access";
import { employeeNames, loadCategories } from "@/lib/campaigns/queries";
import {
  CAMPAIGN_STATUS,
  FILE_STATUS,
  MEMBER_ROLE,
  REQUIRED_FIELD_OPTIONS,
  VERSION_STATUS,
  formatBytes,
  formatCount,
} from "@/lib/campaigns/labels";
import { shortDate } from "@/lib/compliance/labels";
import { describeAudit } from "@/lib/audit/describe";
import { formatDateTime } from "@/lib/format";
import { createServiceClient } from "@/lib/supabase/service";
import { Panel, Pill } from "@/components/wt/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  AddMemberSheet,
  ArchiveFileButton,
  CampaignStatusActions,
  EditCampaignSheet,
  EndMemberButton,
  UploadSheet,
  VersionDecision,
} from "../campaign-forms";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "database", label: "Database" },
  { key: "documents", label: "Documents" },
  { key: "team", label: "Team" },
  { key: "activity", label: "Activity" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Summary = {
  columnMap?: Record<string, string>;
  extraColumns?: string[];
  missingColumns?: string[];
  reasonCounts?: Record<string, number>;
  error?: string;
  blocked?: string;
};

export default async function CampaignDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const { ctx } = await requireCampaigns();
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const roles = await campaignRolesFor(ctx, id);
  if (roles === null) notFound(); // not a member: behave as if it does not exist
  const access = campaignAccess(ctx);
  const tab: TabKey = TABS.some((t) => t.key === rawTab) ? (rawTab as TabKey) : "overview";

  const service = createServiceClient();
  const { data: campaign } = await service.from("co_campaigns").select("*").eq("id", id).maybeSingle();
  if (!campaign) notFound();

  const [{ data: members }, { data: versions }, { data: files }, categories, { count: available }] = await Promise.all([
    service.from("co_campaign_members").select("id, employee_id, member_role, created_at, ended_at").eq("campaign_id", id).order("created_at"),
    service
      .from("co_database_versions")
      .select("id, file_id, version, status, record_count, valid_count, invalid_count, duplicate_count, uploaded_by, decided_by, decided_at, decision_note, published_at, created_at, summary")
      .eq("campaign_id", id)
      .order("version", { ascending: false }),
    service
      .from("co_files")
      .select("id, category_key, title, original_name, size_bytes, sha256, version, status, scan_result, uploaded_by, created_at, published_at")
      .eq("campaign_id", id)
      .order("created_at", { ascending: false }),
    loadCategories(),
    service.from("co_lead_records").select("id", { count: "exact", head: true }).eq("campaign_id", id).eq("status", "AVAILABLE"),
  ]);

  const activeMembers = (members ?? []).filter((m) => !m.ended_at);
  const fileById = new Map((files ?? []).map((f) => [f.id, f]));
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const names = await employeeNames([
    campaign.manager_id,
    ...activeMembers.map((m) => m.employee_id),
    ...(versions ?? []).flatMap((v) => [v.uploaded_by, v.decided_by]),
    ...(files ?? []).map((f) => f.uploaded_by),
  ]);
  const isArchived = campaign.status === "ARCHIVED";
  const canUploadDb = !isArchived && canUploadDatabase(access, roles);
  const canUploadDocs = !isArchived && (access.documents || access.manage || roles.includes("MANAGER"));
  const dbCategories = categories.filter((c) => c.is_database && !c.retired);
  const docCategories = categories.filter((c) => !c.is_database && !c.retired);
  const awaiting = (versions ?? []).find((v) => v.status === "AWAITING_APPROVAL");

  // Preview of the version waiting for approval: approvers judge the data without downloading the file.
  let preview: { row_number: number; full_name: string | null; email: string | null; phone: string | null; company: string | null; job_title: string | null; country: string | null }[] = [];
  if (tab === "database" && awaiting && access.approve) {
    const { data } = await service
      .from("co_lead_records")
      .select("row_number, full_name, email, phone, company, job_title, country")
      .eq("version_id", awaiting.id)
      .eq("status", "STAGED")
      .order("row_number")
      .limit(10);
    preview = data ?? [];
  }

  let activity: { id: string; action: string; table_name: string | null; actor_employee_id: string | null; created_at: string }[] = [];
  if (tab === "activity") {
    const recordIds = [id, ...(members ?? []).map((m) => m.id), ...(files ?? []).map((f) => f.id), ...(versions ?? []).map((v) => v.id)];
    const [{ data: rows }, { data: events }] = await Promise.all([
      service
        .from("audit_logs")
        .select("id, action, table_name, actor_employee_id, created_at")
        .in("record_id", recordIds.slice(0, 300))
        .order("created_at", { ascending: false })
        .limit(60),
      service
        .from("audit_logs")
        .select("id, action, table_name, actor_employee_id, created_at")
        .eq("table_name", "security_events")
        .like("action", "SECURITY_CO_%")
        .contains("new_data", { campaign_id: id })
        .order("created_at", { ascending: false })
        .limit(40),
    ]);
    activity = [...(rows ?? []), ...(events ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 80);
    for (const [key, value] of await employeeNames(activity.map((a) => a.actor_employee_id))) names.set(key, value);
  }

  let people: { id: string; name: string }[] = [];
  if (access.manage) {
    const { data } = await service.from("employees").select("id, full_name").eq("employment_status", "ACTIVE").order("full_name");
    people = (data ?? []).map((p) => ({ id: p.id, name: p.full_name }));
  }

  const status = CAMPAIGN_STATUS[campaign.status];
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-xl border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-xs text-muted-foreground">{campaign.code}</p>
          <h2 className="text-xl font-semibold">{campaign.name}</h2>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Pill tone={status.tone}>{status.label}</Pill>
            {campaign.client_name ? <span>{campaign.client_name}</span> : null}
            {campaign.manager_id ? <span>· Manager: {names.get(campaign.manager_id)}</span> : null}
          </p>
        </div>
        {access.manage && !isArchived ? (
          <div className="flex flex-wrap gap-2">
            <EditCampaignSheet
              people={people}
              values={{
                id: campaign.id,
                name: campaign.name,
                client_name: campaign.client_name,
                advertiser: campaign.advertiser,
                description: campaign.description,
                instructions: campaign.instructions,
                geography: campaign.geography,
                industries: campaign.industries,
                job_titles: campaign.job_titles,
                starts_on: campaign.starts_on,
                ends_on: campaign.ends_on,
                manager_id: campaign.manager_id,
                required_fields: campaign.required_fields,
              }}
            />
            <CampaignStatusActions campaignId={campaign.id} status={campaign.status} />
          </div>
        ) : null}
      </div>

      <nav aria-label="Campaign sections" className="-mx-1 overflow-x-auto">
        <ul className="flex min-w-max gap-1 px-1">
          {TABS.map((t) => (
            <li key={t.key}>
              <Link
                href={t.key === "overview" ? `/admin/campaigns/${id}` : `/admin/campaigns/${id}?tab=${t.key}`}
                aria-current={tab === t.key ? "page" : undefined}
                className={cn(
                  "flex h-9 items-center rounded-md px-3 text-sm transition",
                  tab === t.key ? "bg-muted font-semibold text-foreground" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
                {t.key === "database" && awaiting ? <span className="wt-pill ml-1.5 px-1.5 py-0 text-[11px]" data-tone="warning">1</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {tab === "overview" ? (
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Panel id="details" title="Campaign details">
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 px-5 py-4 text-sm sm:grid-cols-2">
              <Detail label="Client">{campaign.client_name ?? "—"}</Detail>
              <Detail label="Advertiser">{campaign.advertiser ?? "—"}</Detail>
              <Detail label="Start">{shortDate(campaign.starts_on)}</Detail>
              <Detail label="End">{shortDate(campaign.ends_on)}</Detail>
              <Detail label="Geography">{campaign.geography.join(", ") || "—"}</Detail>
              <Detail label="Industries">{campaign.industries.join(", ") || "—"}</Detail>
              <Detail label="Job titles" wide>{campaign.job_titles.join(", ") || "—"}</Detail>
              <Detail label="Every row must have" wide>
                {[...campaign.required_fields.map((f) => REQUIRED_FIELD_OPTIONS.find((o) => o.key === f)?.label ?? f), "an email or phone"].join(", ")}
              </Detail>
              {campaign.description ? <Detail label="Description" wide><span className="whitespace-pre-line">{campaign.description}</span></Detail> : null}
              {campaign.instructions ? <Detail label="Instructions" wide><span className="whitespace-pre-line">{campaign.instructions}</span></Detail> : null}
            </dl>
          </Panel>
          <Panel id="numbers" title="At a glance">
            <dl className="divide-y text-sm">
              <Row label="Records available">{formatCount(available)}</Row>
              <Row label="Database versions">{formatCount(versions?.length)}</Row>
              <Row label="Live version">{(versions ?? []).find((v) => v.status === "PUBLISHED")?.version ?? "None yet"}</Row>
              <Row label="Documents">{formatCount((files ?? []).filter((f) => !categoryByKey.get(f.category_key)?.is_database && f.status !== "ARCHIVED").length)}</Row>
              <Row label="Team">{formatCount(activeMembers.length)}</Row>
              <Row label="Created">{shortDate(campaign.created_at)}</Row>
            </dl>
          </Panel>
        </div>
      ) : null}

      {tab === "database" ? (
        <div className="flex flex-col gap-5">
          {awaiting ? (
            <Panel
              id="awaiting"
              title={`Version ${awaiting.version} is waiting for approval`}
              description={`Uploaded by ${names.get(awaiting.uploaded_by ?? "") ?? "unknown"} on ${shortDate(awaiting.created_at)}. Someone other than the uploader must decide.`}
              actions={
                access.approve && awaiting.uploaded_by !== ctx.employeeId ? (
                  <VersionDecision versionId={awaiting.id} version={awaiting.version} />
                ) : awaiting.uploaded_by === ctx.employeeId ? (
                  <span className="text-xs text-muted-foreground">You uploaded this, so you cannot approve it.</span>
                ) : null
              }
            >
              <ValidationSummary version={awaiting} versionId={awaiting.id} />
              {preview.length ? (
                <div className="overflow-x-auto border-t">
                  <table className="w-full min-w-[760px] text-left text-xs">
                    <caption className="px-5 pt-3 pb-1 text-left text-xs font-medium text-muted-foreground">First {preview.length} valid rows</caption>
                    <thead className="text-muted-foreground">
                      <tr>
                        {["Row", "Name", "Email", "Phone", "Company", "Title", "Country"].map((h) => (
                          <th key={h} scope="col" className="px-3 py-2 font-medium first:pl-5">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map((r) => (
                        <tr key={r.row_number}>
                          <td className="py-1.5 pr-3 pl-5 tabular-nums">{r.row_number}</td>
                          <td className="px-3 py-1.5">{r.full_name}</td>
                          <td className="px-3 py-1.5">{r.email}</td>
                          <td className="px-3 py-1.5">{r.phone}</td>
                          <td className="px-3 py-1.5">{r.company}</td>
                          <td className="px-3 py-1.5">{r.job_title}</td>
                          <td className="px-3 py-1.5">{r.country}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </Panel>
          ) : null}

          <Panel
            id="versions"
            title="Database versions"
            description="Each upload is a new version. Nothing is overwritten; a published version is replaced only by approving a newer one."
            actions={canUploadDb && dbCategories.length ? <UploadSheet campaignId={id} categories={dbCategories} label="Upload database" /> : null}
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-2.5 font-medium">Version</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Rows</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Decision</th>
                    <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Files</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(versions ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">
                        No database yet.{canUploadDb ? " Upload one to start." : " The campaign's database members upload it."}
                      </td>
                    </tr>
                  ) : (
                    (versions ?? []).map((v) => {
                      const file = fileById.get(v.file_id);
                      const category = file ? categoryByKey.get(file.category_key) : undefined;
                      const canDownload = file?.status === "PUBLISHED" && category && canOpenCategory(access, roles, category);
                      const summary = (v.summary ?? {}) as Summary;
                      return (
                        <tr key={v.id} className="align-top">
                          <td className="px-5 py-3">
                            <p className="font-medium">Version {v.version}</p>
                            <p className="max-w-[16rem] truncate text-xs text-muted-foreground" title={file?.original_name}>{file?.original_name} · {formatBytes(Number(file?.size_bytes ?? 0))}</p>
                          </td>
                          <td className="px-3 py-3 text-xs tabular-nums">
                            {v.record_count ? (
                              <>
                                <span className="block">{formatCount(v.valid_count)} valid of {formatCount(v.record_count)}</span>
                                <span className="text-muted-foreground">{formatCount(v.invalid_count)} invalid · {formatCount(v.duplicate_count)} duplicate</span>
                              </>
                            ) : summary.error || summary.blocked ? (
                              <span className="text-destructive">{summary.blocked ? `Malware: ${summary.blocked}` : summary.error}</span>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-3 text-xs">{shortDate(v.created_at)}<span className="block text-muted-foreground">{names.get(v.uploaded_by ?? "") ?? "—"}</span></td>
                          <td className="px-3 py-3 text-xs">
                            {v.decided_by ? (
                              <>
                                {names.get(v.decided_by)} · {shortDate(v.decided_at)}
                                {v.decision_note ? <span className="block max-w-[14rem] text-muted-foreground">“{v.decision_note}”</span> : null}
                              </>
                            ) : "—"}
                          </td>
                          <td className="px-3 py-3"><Pill tone={VERSION_STATUS[v.status].tone}>{VERSION_STATUS[v.status].label}</Pill></td>
                          <td className="px-5 py-3">
                            <div className="flex justify-end gap-1">
                              {v.invalid_count + v.duplicate_count > 0 && (access.approve || access.manage || roles.includes("DATABASE")) ? (
                                <Button asChild variant="ghost" size="sm" title="Download invalid and duplicate rows">
                                  <a href={`/api/campaigns/versions/${v.id}/invalid-rows`}><FileWarning className="size-4" /><span className="sr-only">Invalid rows</span></a>
                                </Button>
                              ) : null}
                              {canDownload ? (
                                <Button asChild variant="ghost" size="sm" title="Download the approved file">
                                  <a href={`/api/campaigns/files/${v.file_id}/download`}><Download className="size-4" /><span className="sr-only">Download</span></a>
                                </Button>
                              ) : null}
                              {file && ["REJECTED", "VALIDATION_FAILED", "BLOCKED"].includes(v.status) && file.status !== "ARCHIVED" && (access.manage || file.uploaded_by === ctx.employeeId) ? (
                                <ArchiveFileButton fileId={file.id} name={`version ${v.version}`} />
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      ) : null}

      {tab === "documents" ? (
        <Panel
          id="documents"
          title="Documents"
          description="Instructions, scripts, SOPs and reports. Each is scanned before anyone can open it, and members see only the types their campaign role allows."
          actions={canUploadDocs && docCategories.length ? <UploadSheet campaignId={id} categories={docCategories} label="Upload document" /> : null}
        >
          <FileTable
            files={(files ?? []).filter((f) => !categoryByKey.get(f.category_key)?.is_database && f.status !== "ARCHIVED")}
            categories={categoryByKey}
            names={names}
            canOpen={(category) => canOpenCategory(access, roles, category)}
            canArchive={(f) => access.manage || access.documents || f.uploaded_by === ctx.employeeId}
          />
        </Panel>
      ) : null}

      {tab === "team" ? (
        <Panel
          id="team"
          title={`Team · ${activeMembers.length}`}
          description="Members see this campaign. Removing someone ends their access on their next click; their history stays."
          actions={access.manage && !isArchived ? <AddMemberSheet campaignId={id} people={people} /> : null}
        >
          {activeMembers.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">Nobody is on this campaign yet.</p>
          ) : (
            <ul className="divide-y">
              {activeMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{names.get(m.employee_id) ?? "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{MEMBER_ROLE[m.member_role].label} · since {shortDate(m.created_at)}</p>
                  </div>
                  {access.manage && !isArchived ? <EndMemberButton memberId={m.id} name={names.get(m.employee_id) ?? "this person"} /> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}

      {tab === "activity" ? (
        <Panel id="activity" title="Activity" description="From the tamper-evident audit log: every change, download and refusal for this campaign.">
          {activity.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline gap-x-3 px-5 py-2.5">
                  <span className="w-40 shrink-0 text-xs text-muted-foreground tabular-nums">{formatDateTime(a.created_at)}</span>
                  <span className="font-medium">{a.actor_employee_id ? names.get(a.actor_employee_id) ?? "Someone" : "System"}</span>
                  <span className="text-muted-foreground">{describeAudit(a.action, a.table_name).toLowerCase()}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      ) : null}
    </div>
  );
}

function Detail({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-2.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{children}</dd>
    </div>
  );
}

function ValidationSummary({ version, versionId }: { version: { record_count: number; valid_count: number; invalid_count: number; duplicate_count: number; summary: unknown }; versionId: string }) {
  const summary = (version.summary ?? {}) as Summary;
  const reasons = Object.entries(summary.reasonCounts ?? {}).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid gap-5 px-5 py-4 text-sm md:grid-cols-3">
      <div>
        <p className="text-xs text-muted-foreground">Rows</p>
        <p className="mt-1 text-lg font-semibold tabular-nums">{formatCount(version.valid_count)} <span className="text-sm font-normal text-muted-foreground">valid of {formatCount(version.record_count)}</span></p>
        <p className="text-xs text-muted-foreground">{formatCount(version.invalid_count)} invalid · {formatCount(version.duplicate_count)} duplicate</p>
        {version.invalid_count + version.duplicate_count > 0 ? (
          <a href={`/api/campaigns/versions/${versionId}/invalid-rows`} className="mt-1 inline-block text-xs text-primary hover:underline">Download the rejected rows</a>
        ) : null}
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Columns matched</p>
        <ul className="mt-1 space-y-0.5 text-xs">
          {Object.entries(summary.columnMap ?? {}).map(([field, header]) => (
            <li key={field}><span className="text-muted-foreground">{field.replace("_", " ")}:</span> {header}</li>
          ))}
          {summary.extraColumns?.length ? <li className="text-muted-foreground">+ {summary.extraColumns.length} other columns kept as extra data</li> : null}
        </ul>
      </div>
      <div>
        <p className="text-xs text-muted-foreground">Why rows were rejected</p>
        {reasons.length === 0 ? (
          <p className="mt-1 flex items-center gap-1.5 text-xs"><CheckCircle2 className="size-3.5 text-[#17b26a]" aria-hidden /> No invalid rows</p>
        ) : (
          <ul className="mt-1 space-y-0.5 text-xs">
            {reasons.slice(0, 6).map(([reason, count]) => (
              <li key={reason} className="flex justify-between gap-3"><span>{reason}</span><span className="tabular-nums">{formatCount(count)}</span></li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

type FileRow = {
  id: string;
  category_key: string;
  title: string;
  original_name: string;
  size_bytes: number;
  version: number;
  status: keyof typeof FILE_STATUS;
  scan_result: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function FileTable({
  files,
  categories,
  names,
  canOpen,
  canArchive,
}: {
  files: FileRow[];
  categories: Map<string, { label: string; is_database: boolean; member_roles: string[] }>;
  names: Map<string, string>;
  canOpen: (category: { is_database: boolean; member_roles: string[] }) => boolean;
  canArchive: (file: FileRow) => boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="px-5 py-2.5 font-medium">Document</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Type</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Uploaded</th>
            <th scope="col" className="px-3 py-2.5 font-medium">Status</th>
            <th scope="col" className="px-5 py-2.5 font-medium"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {files.length === 0 ? (
            <tr><td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">No documents yet.</td></tr>
          ) : (
            files.map((f) => {
              const category = categories.get(f.category_key);
              const open = f.status === "PUBLISHED" && category && canOpen(category);
              return (
                <tr key={f.id} className="align-top">
                  <td className="px-5 py-3">
                    <p className="font-medium">{f.title}{f.version > 1 ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">v{f.version}</span> : null}</p>
                    <p className="max-w-[18rem] truncate text-xs text-muted-foreground" title={f.original_name}>{f.original_name} · {formatBytes(Number(f.size_bytes))}</p>
                  </td>
                  <td className="px-3 py-3 text-xs">{category?.label ?? f.category_key}</td>
                  <td className="px-3 py-3 text-xs">{shortDate(f.created_at)}<span className="block text-muted-foreground">{names.get(f.uploaded_by ?? "") ?? "—"}</span></td>
                  <td className="px-3 py-3">
                    <Pill tone={FILE_STATUS[f.status].tone}>{FILE_STATUS[f.status].label}</Pill>
                    {f.status === "INFECTED" && f.scan_result ? <span className="mt-1 block text-xs text-destructive">{f.scan_result}</span> : null}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-1">
                      {open ? (
                        <Button asChild variant="ghost" size="sm" title="Download">
                          <a href={`/api/campaigns/files/${f.id}/download`}><Download className="size-4" /><span className="sr-only">Download</span></a>
                        </Button>
                      ) : null}
                      {canArchive(f) && !["SCANNING", "PUBLISHING"].includes(f.status) ? <ArchiveFileButton fileId={f.id} name={f.title} /> : null}
                    </div>
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
