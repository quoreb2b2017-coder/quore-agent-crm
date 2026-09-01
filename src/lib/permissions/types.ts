export type EmployeeContext = {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  email: string;
  profileImagePath: string | null;
  employmentStatus: string;
  roleKey: string;
  roleDisplayName: string;
  permissions: string[];
};

export type CustomJwtClaims = {
  employee_id?: string;
  role_key?: string;
  employment_status?: string;
  permissions?: string[];
};
