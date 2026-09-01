import { createDataClient as createClient } from "@/lib/supabase/data";
import { formatDate } from "@/lib/format";

export type ProfileDetails = {
  phone: string;
  joiningDate: string;
  workLocation: string;
  departmentName: string;
  designationTitle: string;
  employmentStatus: string;
};

export async function getEmployeeProfileDetails(employeeId: string): Promise<ProfileDetails> {
  const supabase = await createClient();
  const { data: employee } = await supabase
    .from("employees")
    .select("phone, joining_date, work_location, department_id, designation_id, employment_status")
    .eq("id", employeeId)
    .maybeSingle();

  const [{ data: department }, { data: designation }] = await Promise.all([
    employee?.department_id
      ? supabase.from("departments").select("name").eq("id", employee.department_id).maybeSingle()
      : Promise.resolve({ data: null }),
    employee?.designation_id
      ? supabase.from("designations").select("title").eq("id", employee.designation_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  return {
    phone: employee?.phone?.trim() || "",
    joiningDate: employee?.joining_date ? formatDate(employee.joining_date) : "",
    workLocation: employee?.work_location?.trim() || "",
    departmentName: department?.name?.trim() || "",
    designationTitle: designation?.title?.trim() || "",
    employmentStatus: employee?.employment_status || "",
  };
}
