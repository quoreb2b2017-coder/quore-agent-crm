import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createDataClient as createClient } from "@/lib/supabase/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentEmployeeContext, isManagement } from "@/lib/permissions/server";
import { isSuperAdminEmployee } from "@/lib/queries/admin-dashboard";
import { isMissingOnboardingTable } from "@/lib/queries/onboarding";
import {
  ONBOARDING_BUCKET,
  ONBOARDING_DOC_MAX_BYTES,
  ONBOARDING_DOC_MIME,
  ONBOARDING_DOC_TYPES,
} from "@/lib/onboarding";

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

function safeName(name: string) {
  const cleaned = name.replace(/[^\w.\- ]+/g, "_").trim().slice(-120);
  return cleaned || "document";
}

export async function POST(request: Request) {
  const ctx = await getCurrentEmployeeContext();
  if (!ctx || !isManagement(ctx.roleKey)) return fail("Not authorized", 403);

  const form = await request.formData();
  const employeeId = String(form.get("employeeId") ?? "");
  const docType = String(form.get("docType") ?? "");
  const uploaded = form.get("file");
  const file = uploaded instanceof File && uploaded.size > 0 ? uploaded : null;

  if (!z.string().uuid().safeParse(employeeId).success) return fail("Invalid employee");
  if (!ONBOARDING_DOC_TYPES.some((item) => item.key === docType)) return fail("Pick a document type");
  if (!file) return fail("Choose a file to upload");
  if (file.size > ONBOARDING_DOC_MAX_BYTES) return fail("Files can be up to 5 MB");

  const fileName = safeName(file.name);
  const ext = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  const mime = ONBOARDING_DOC_MIME[ext];
  if (!mime) return fail("Upload a PDF, image (JPG, PNG, WEBP) or Word file");

  const supabase = await createClient();
  if (await isSuperAdminEmployee(supabase, employeeId)) {
    return fail("Onboarding is only for staff accounts.");
  }

  const service = createServiceClient();
  const path = `${employeeId}/${crypto.randomUUID()}.${ext}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  let upload = await service.storage
    .from(ONBOARDING_BUCKET)
    .upload(path, bytes, { contentType: mime, upsert: false });
  if (upload.error && /bucket not found/i.test(upload.error.message)) {
    await service.storage.createBucket(ONBOARDING_BUCKET, {
      public: false,
      fileSizeLimit: ONBOARDING_DOC_MAX_BYTES,
    });
    upload = await service.storage
      .from(ONBOARDING_BUCKET)
      .upload(path, bytes, { contentType: mime, upsert: false });
  }
  if (upload.error) return fail(upload.error.message, 500);

  const { error } = await supabase.from("onboarding_documents").insert({
    employee_id: employeeId,
    doc_type: docType,
    file_path: path,
    file_name: fileName,
    mime_type: mime,
    size_bytes: file.size,
    uploaded_by: ctx.employeeId,
  });
  if (error) {
    await service.storage.from(ONBOARDING_BUCKET).remove([path]);
    return fail(
      isMissingOnboardingTable(error)
        ? "Onboarding tables are missing. Run supabase/migrations/0022_onboarding.sql in Supabase."
        : error.message,
      500
    );
  }

  revalidatePath("/admin/onboarding");
  revalidatePath(`/admin/onboarding/${employeeId}`);
  return NextResponse.json({ ok: true });
}
