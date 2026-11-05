// Hand-written to match supabase/migrations/0001-0006. Regenerate once a
// live project is linked:
//   npx supabase gen types typescript --project-id <ref> --schema public > src/types/supabase.ts
// Convention in this codebase: keep selects flat (no embedded `fk(cols)`
// resource syntax) since Relationships metadata below is intentionally
// empty — fetch related rows with a second query instead.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Table<Row, Insert, Update = Partial<Insert>> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type ComplianceControlStatus =
  | "NOT_ASSESSED"
  | "NOT_IMPLEMENTED"
  | "IN_PROGRESS"
  | "IMPLEMENTED_AWAITING_EVIDENCE"
  | "OPERATING_EVIDENCED"
  | "EXCEPTION_IDENTIFIED"
  | "REMEDIATION_REQUIRED"
  | "RISK_ACCEPTED"
  | "NOT_APPLICABLE";

export interface Database {
  public: {
    Tables: {
      app_settings: Table<
        {
          id: number;
          time_zone: string;
          login_minutes: number;
          logout_minutes: number;
          late_minutes: number;
          annual_paid_leave_days: number;
          updated_at: string;
        },
        {
          id?: number;
          time_zone?: string;
          login_minutes?: number;
          logout_minutes?: number;
          late_minutes?: number;
          annual_paid_leave_days?: number;
          updated_at?: string;
        }
      >;
      departments: Table<
        {
          id: string;
          name: string;
          /** ADMIN_CONTROL | SALES | MARKETING | DATABASE | IT — stable team; name is editable. */
          kind: string | null;
          description: string | null;
          head_employee_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          kind?: string | null;
          description?: string | null;
          head_employee_id?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      designations: Table<
        {
          id: string;
          title: string;
          department_id: string | null;
          level: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          title: string;
          department_id?: string | null;
          level?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      roles: Table<
        {
          id: string;
          role_key: string;
          display_name: string;
          description: string | null;
          /** ADMIN_CONTROL | SALES | MARKETING | DATABASE | IT — department this role belongs under. */
          department_kind: string | null;
          is_system: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          role_key: string;
          display_name: string;
          description?: string | null;
          department_kind?: string | null;
          is_system?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      permissions: Table<
        {
          id: string;
          permission_key: string;
          description: string | null;
          category: string | null;
          created_at: string;
        },
        {
          id?: string;
          permission_key: string;
          description?: string | null;
          category?: string | null;
          created_at?: string;
        }
      >;
      role_permissions: Table<
        {
          id: string;
          role_id: string;
          permission_id: string;
          created_at: string;
        },
        {
          id?: string;
          role_id: string;
          permission_id: string;
          created_at?: string;
        }
      >;
      employees: Table<
        {
          id: string;
          auth_user_id: string | null;
          employee_code: string;
          full_name: string;
          email: string;
          phone: string | null;
          profile_image_path: string | null;
          department_id: string | null;
          designation_id: string | null;
          manager_id: string | null;
          joining_date: string;
          salary: number | null;
          employment_status: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
          work_location: string | null;
          work_schedule: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          auth_user_id?: string | null;
          employee_code: string;
          full_name: string;
          email: string;
          phone?: string | null;
          profile_image_path?: string | null;
          department_id?: string | null;
          designation_id?: string | null;
          manager_id?: string | null;
          joining_date?: string;
          salary?: number | null;
          employment_status?: "ACTIVE" | "ON_LEAVE" | "SUSPENDED" | "TERMINATED";
          work_location?: string | null;
          work_schedule?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      employee_roles: Table<
        {
          id: string;
          employee_id: string;
          role_id: string;
          is_primary: boolean;
          assigned_at: string;
          assigned_by: string | null;
        },
        {
          id?: string;
          employee_id: string;
          role_id: string;
          is_primary?: boolean;
          assigned_at?: string;
          assigned_by?: string | null;
        }
      >;
      employee_sessions: Table<
        {
          id: string;
          employee_id: string;
          started_at: string;
          ended_at: string | null;
          login_ip: string | null;
          user_agent: string | null;
          device_id: string | null;
          status: "ACTIVE" | "ENDED" | "TIMED_OUT";
          app_last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          started_at?: string;
          ended_at?: string | null;
          login_ip?: string | null;
          user_agent?: string | null;
          device_id?: string | null;
          status?: "ACTIVE" | "ENDED" | "TIMED_OUT";
          app_last_seen_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      attendance: Table<
        {
          id: string;
          employee_id: string;
          attendance_date: string;
          first_check_in: string | null;
          last_check_out: string | null;
          total_active_seconds: number;
          total_break_seconds: number;
          total_idle_seconds: number;
          overtime_minutes: number;
          /** Present after migration 0030; pending OT under 1h awaiting admin. */
          overtime_pending_minutes: number;
          /** Frozen at first clock-in (migration 0035). Past days keep this shift. */
          shift_login_minutes: number | null;
          shift_logout_minutes: number | null;
          status:
            | "PRESENT"
            | "LATE"
            | "ABSENT"
            | "HALF_DAY"
            | "ON_LEAVE"
            | "HOLIDAY"
            | "WEEK_OFF";
          source: "AUTO" | "MANUAL" | "CORRECTED";
          notes: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          attendance_date: string;
          first_check_in?: string | null;
          last_check_out?: string | null;
          total_active_seconds?: number;
          total_break_seconds?: number;
          total_idle_seconds?: number;
          overtime_minutes?: number;
          overtime_pending_minutes?: number;
          shift_login_minutes?: number | null;
          shift_logout_minutes?: number | null;
          status?:
            | "PRESENT"
            | "LATE"
            | "ABSENT"
            | "HALF_DAY"
            | "ON_LEAVE"
            | "HOLIDAY"
            | "WEEK_OFF";
          source?: "AUTO" | "MANUAL" | "CORRECTED";
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      breaks: Table<
        {
          id: string;
          employee_id: string;
          session_id: string;
          break_type: string;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id: string;
          break_type?: string;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      meetings: Table<
        {
          id: string;
          employee_id: string;
          session_id: string | null;
          started_at: string | null;
          ended_at: string | null;
          duration_seconds: number | null;
          status: string;
          requested_at: string;
          approved_by: string | null;
          approved_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id?: string | null;
          started_at?: string | null;
          ended_at?: string | null;
          duration_seconds?: number | null;
          status?: string;
          requested_at?: string;
          approved_by?: string | null;
          approved_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      employee_onboarding: Table<
        {
          employee_id: string;
          status: string;
          checklist: Json;
          offer: Json;
          date_of_birth: string | null;
          gender: string | null;
          personal_email: string | null;
          current_address: string | null;
          permanent_address: string | null;
          emergency_contact_name: string | null;
          emergency_contact_relation: string | null;
          emergency_contact_phone: string | null;
          pan_number: string | null;
          aadhaar_number: string | null;
          bank_account_holder: string | null;
          bank_name: string | null;
          bank_account_number: string | null;
          bank_ifsc: string | null;
          previous_company: string | null;
          notes: string | null;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          employee_id: string;
          status?: string;
          checklist?: Json;
          offer?: Json;
          date_of_birth?: string | null;
          gender?: string | null;
          personal_email?: string | null;
          current_address?: string | null;
          permanent_address?: string | null;
          emergency_contact_name?: string | null;
          emergency_contact_relation?: string | null;
          emergency_contact_phone?: string | null;
          pan_number?: string | null;
          aadhaar_number?: string | null;
          bank_account_holder?: string | null;
          bank_name?: string | null;
          bank_account_number?: string | null;
          bank_ifsc?: string | null;
          previous_company?: string | null;
          notes?: string | null;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      onboarding_documents: Table<
        {
          id: string;
          employee_id: string;
          doc_type: string;
          file_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by: string | null;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          doc_type: string;
          file_path: string;
          file_name: string;
          mime_type: string;
          size_bytes: number;
          uploaded_by?: string | null;
          created_at?: string;
        }
      >;
      washroom_visits: Table<
        {
          id: string;
          employee_id: string;
          session_id: string | null;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id?: string | null;
          started_at?: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      activity_events: Table<
        {
          id: string;
          employee_id: string;
          session_id: string | null;
          event_type: string;
          source: string;
          domain: string | null;
          application_name: string | null;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          category: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id?: string | null;
          event_type: string;
          source: string;
          domain?: string | null;
          application_name?: string | null;
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          category?: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          metadata?: Json;
          created_at?: string;
        }
      >;
      browser_activities: Table<
        {
          id: string;
          employee_id: string;
          session_id: string | null;
          activity_event_id: string | null;
          domain: string | null;
          tab_url_path: string | null;
          window_id: string | null;
          is_incognito: boolean;
          category: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id?: string | null;
          activity_event_id?: string | null;
          domain?: string | null;
          tab_url_path?: string | null;
          window_id?: string | null;
          is_incognito?: boolean;
          category?: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
        }
      >;
      user_activities: Table<
        {
          id: string;
          user_id: string;
          employee_id: string | null;
          domain: string;
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          created_at: string;
        },
        {
          id?: string;
          user_id: string;
          employee_id?: string | null;
          domain: string;
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
        }
      >;
      application_activities: Table<
        {
          id: string;
          employee_id: string;
          session_id: string | null;
          activity_event_id: string | null;
          process_name: string | null;
          window_title: string | null;
          is_productive: boolean | null;
          category: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          started_at: string;
          ended_at: string | null;
          duration_seconds: number | null;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          session_id?: string | null;
          activity_event_id?: string | null;
          process_name?: string | null;
          window_title?: string | null;
          is_productive?: boolean | null;
          category?: "WORK" | "NON_WORK" | "BREAK" | "IDLE" | "UNKNOWN";
          started_at: string;
          ended_at?: string | null;
          duration_seconds?: number | null;
          metadata?: Json;
          created_at?: string;
        }
      >;
      campaigns: Table<
        {
          id: string;
          name: string;
          description: string | null;
          status: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
          owner_id: string | null;
          starts_on: string | null;
          ends_on: string | null;
          emails_processed: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          description?: string | null;
          status?: "DRAFT" | "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";
          owner_id?: string | null;
          starts_on?: string | null;
          ends_on?: string | null;
          emails_processed?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      leads: Table<
        {
          id: string;
          campaign_id: string | null;
          owner_id: string | null;
          full_name: string;
          email: string | null;
          phone: string | null;
          status: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST";
          source: string | null;
          notes: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          campaign_id?: string | null;
          owner_id?: string | null;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          status?: "NEW" | "CONTACTED" | "QUALIFIED" | "CONVERTED" | "LOST";
          source?: string | null;
          notes?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      tasks: Table<
        {
          id: string;
          title: string;
          description: string | null;
          assigned_to: string | null;
          assigned_by: string | null;
          status: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
          priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
          due_date: string | null;
          related_campaign_id: string | null;
          related_lead_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          title: string;
          description?: string | null;
          assigned_to?: string | null;
          assigned_by?: string | null;
          status?: "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";
          priority?: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
          due_date?: string | null;
          related_campaign_id?: string | null;
          related_lead_id?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      task_steps: Table<
        {
          id: string;
          task_id: string;
          title: string;
          is_done: boolean;
          order_index: number;
          completed_at: string | null;
          completed_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          task_id: string;
          title: string;
          is_done?: boolean;
          order_index?: number;
          completed_at?: string | null;
          completed_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      salary_records: Table<
        {
          id: string;
          employee_id: string;
          effective_from: string;
          base_salary: number;
          currency: string;
          pay_frequency: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
          components: Json;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          effective_from: string;
          base_salary: number;
          currency?: string;
          pay_frequency?: "MONTHLY" | "WEEKLY" | "BIWEEKLY";
          components?: Json;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      salary_slips: Table<
        {
          id: string;
          employee_id: string;
          period_month: number;
          period_year: number;
          gross_amount: number | null;
          net_amount: number | null;
          deductions: Json;
          status: "DRAFT" | "FINALIZED" | "PAID";
          file_path: string | null;
          generated_at: string | null;
          generated_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          period_month: number;
          period_year: number;
          gross_amount?: number | null;
          net_amount?: number | null;
          deductions?: Json;
          status?: "DRAFT" | "FINALIZED" | "PAID";
          file_path?: string | null;
          generated_at?: string | null;
          generated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      leave_types: Table<
        {
          id: string;
          name: string;
          default_annual_days: number;
          is_paid: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          default_annual_days?: number;
          is_paid?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      leave_balances: Table<
        {
          id: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          allocated_days: number;
          used_days: number;
          carried_forward_days: number;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          leave_type_id: string;
          year: number;
          allocated_days?: number;
          used_days?: number;
          carried_forward_days?: number;
          created_at?: string;
          updated_at?: string;
        }
      >;
      leave_requests: Table<
        {
          id: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          days_count: number;
          reason: string | null;
          status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          days_count: number;
          reason?: string | null;
          status?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      chat_conversations: Table<
        {
          id: string;
          participant_a: string;
          participant_b: string;
          last_message_at: string;
          last_message_preview: string | null;
          unread_a: number;
          unread_b: number;
          created_at: string;
        },
        {
          id?: string;
          participant_a: string;
          participant_b: string;
          last_message_at?: string;
          last_message_preview?: string | null;
          unread_a?: number;
          unread_b?: number;
          created_at?: string;
        }
      >;
      chat_messages: Table<
        {
          id: string;
          conversation_id: string;
          sender_id: string;
          body: string;
          created_at: string;
          attachment_path: string | null;
          attachment_name: string | null;
          attachment_mime: string | null;
          attachment_size: number | null;
        },
        {
          id?: string;
          conversation_id: string;
          sender_id: string;
          body?: string;
          created_at?: string;
          attachment_path?: string | null;
          attachment_name?: string | null;
          attachment_mime?: string | null;
          attachment_size?: number | null;
        }
      >;
      chat_reads: Table<
        {
          conversation_id: string;
          employee_id: string;
          last_read_at: string;
        },
        {
          conversation_id: string;
          employee_id: string;
          last_read_at?: string;
        }
      >;
      employee_presence: Table<
        {
          employee_id: string;
          last_seen_at: string;
        },
        {
          employee_id: string;
          last_seen_at?: string;
        }
      >;
      notifications: Table<

        {
          id: string;
          employee_id: string;
          type: string;
          title: string;
          body: string | null;
          data: Json;
          is_read: boolean;
          read_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          type: string;
          title: string;
          body?: string | null;
          data?: Json;
          is_read?: boolean;
          read_at?: string | null;
          created_at?: string;
        }
      >;
      push_subscriptions: Table<
        {
          id: string;
          employee_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          endpoint: string;
          p256dh: string;
          auth: string;
          user_agent?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      policy_violations: Table<
        {
          id: string;
          employee_id: string;
          policy_id: string | null;
          violation_type: string;
          severity: "LOW" | "MEDIUM" | "HIGH";
          occurred_at: string;
          details: Json;
          resolved: boolean;
          resolved_by: string | null;
          resolved_at: string | null;
          created_at: string;
        },
        {
          id?: string;
          employee_id: string;
          policy_id?: string | null;
          violation_type: string;
          severity?: "LOW" | "MEDIUM" | "HIGH";
          occurred_at?: string;
          details?: Json;
          resolved?: boolean;
          resolved_by?: string | null;
          resolved_at?: string | null;
          created_at?: string;
        }
      >;
      work_policies: Table<
        {
          id: string;
          name: string;
          description: string | null;
          rule_config: Json;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
          description?: string | null;
          rule_config?: Json;
          is_active?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      devices: Table<
        {
          id: string;
          employee_id: string;
          device_name: string | null;
          device_type: "LAPTOP" | "DESKTOP" | "MOBILE" | null;
          os: string | null;
          browser_extension_version: string | null;
          last_seen_at: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          employee_id: string;
          device_name?: string | null;
          device_type?: "LAPTOP" | "DESKTOP" | "MOBILE" | null;
          os?: string | null;
          browser_extension_version?: string | null;
          last_seen_at?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        }
      >;
      audit_logs: Table<
        {
          id: string;
          actor_employee_id: string | null;
          action: string;
          table_name: string | null;
          record_id: string | null;
          old_data: Json | null;
          new_data: Json | null;
          ip_address: string | null;
          created_at: string;
          seq: number | null;
          actor_source: string | null;
          db_role: string | null;
          request_id: string | null;
          prev_hash: string | null;
          row_hash: string | null;
        },
        // Inserts happen only inside security-definer triggers (0022).
        Record<string, never>,
        Record<string, never>
      >;
      // ---- Compliance (0023-0025) ----
      compliance_frameworks: Table<
        { id: string; framework_key: string; name: string; version: string; notes: string | null; created_at: string },
        { id?: string; framework_key: string; name: string; version: string; notes?: string | null }
      >;
      framework_requirements: Table<
        { id: string; framework_id: string; ref: string; title: string; category: string | null; created_at: string },
        { id?: string; framework_id: string; ref: string; title: string; category?: string | null }
      >;
      compliance_controls: Table<
        {
          id: string;
          control_code: string;
          title: string;
          description: string;
          objective: string | null;
          domain: string;
          owner_role: string | null;
          owner_employee_id: string | null;
          frequency: string;
          control_type: string;
          execution_mode: string;
          scope_layer: string;
          status: ComplianceControlStatus;
          applicability_rationale: string | null;
          current_state: string | null;
          gap_remediation: string | null;
          evidence_required: string | null;
          test_procedure: string | null;
          priority: "P0" | "P1" | "P2" | "P3" | null;
          next_due_at: string | null;
          version: number;
          created_at: string;
          updated_at: string;
        },
        {
          control_code: string;
          title: string;
          description: string;
          domain: string;
          status?: ComplianceControlStatus;
          owner_employee_id?: string | null;
          applicability_rationale?: string | null;
          current_state?: string | null;
          gap_remediation?: string | null;
          priority?: "P0" | "P1" | "P2" | "P3" | null;
          next_due_at?: string | null;
        }
      >;
      control_requirement_mappings: Table<
        { id: string; control_id: string; requirement_id: string; mapping_note: string | null; created_at: string },
        { control_id: string; requirement_id: string; mapping_note?: string | null }
      >;
      evidence_items: Table<
        {
          id: string;
          control_id: string;
          title: string;
          evidence_type: string;
          collection_method: string;
          source_system: string;
          source_record_id: string | null;
          collected_at: string;
          period_start: string | null;
          period_end: string | null;
          collected_by: string | null;
          storage_path: string | null;
          sha256: string | null;
          limitations: string | null;
          retention_class: string;
          status: "PENDING_REVIEW" | "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "EXPIRED";
          reviewed_by: string | null;
          reviewed_at: string | null;
          review_note: string | null;
          supersedes_id: string | null;
          created_at: string;
        },
        {
          control_id: string;
          title: string;
          evidence_type: string;
          collection_method: string;
          source_system: string;
          source_record_id?: string | null;
          period_start?: string | null;
          period_end?: string | null;
          collected_by?: string | null;
          storage_path?: string | null;
          sha256?: string | null;
          limitations?: string | null;
        },
        {
          status?: "ACCEPTED" | "REJECTED" | "SUPERSEDED" | "EXPIRED";
          review_note?: string | null;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
        }
      >;
      control_tests: Table<
        {
          id: string;
          control_id: string;
          executed_at: string;
          executed_by: string | null;
          execution_identity: string;
          method: string;
          rule_version: string | null;
          population: Json;
          result: "PASS" | "FAIL" | "PARTIAL" | "COLLECTION_FAILED";
          exceptions: Json;
          exceptions_count: number;
          notes: string | null;
          evidence_id: string | null;
          is_independent: boolean;
          created_at: string;
        },
        {
          control_id: string;
          executed_by?: string | null;
          execution_identity: string;
          method: string;
          rule_version?: string | null;
          population?: Json;
          result: "PASS" | "FAIL" | "PARTIAL" | "COLLECTION_FAILED";
          exceptions?: Json;
          notes?: string | null;
          evidence_id?: string | null;
        },
        Record<string, never>
      >;
      corrective_actions: Table<
        {
          id: string;
          ref: string;
          source_type: string;
          source_ref: string | null;
          control_id: string | null;
          title: string;
          description: string | null;
          severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
          owner_employee_id: string | null;
          due_date: string | null;
          status: "OPEN" | "IN_PROGRESS" | "READY_FOR_VERIFICATION" | "CLOSED" | "RISK_ACCEPTED";
          closure_evidence_id: string | null;
          closed_by: string | null;
          closed_at: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          ref: string;
          source_type: string;
          title: string;
          source_ref?: string | null;
          control_id?: string | null;
          description?: string | null;
          severity?: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | null;
          owner_employee_id?: string | null;
          due_date?: string | null;
          status?: "OPEN" | "IN_PROGRESS" | "READY_FOR_VERIFICATION" | "CLOSED" | "RISK_ACCEPTED";
          closure_evidence_id?: string | null;
          closed_by?: string | null;
          closed_at?: string | null;
        }
      >;
      control_exceptions: Table<
        {
          id: string;
          control_id: string | null;
          kind: "SEGREGATION_OF_DUTIES" | "POLICY" | "CONTROL_FAILURE" | "TECHNICAL";
          description: string;
          compensating_control: string | null;
          requested_by: string | null;
          approved_by: string | null;
          approved_at: string | null;
          expires_at: string | null;
          status: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CLOSED";
          created_at: string;
          updated_at: string;
        },
        {
          control_id?: string | null;
          kind: "SEGREGATION_OF_DUTIES" | "POLICY" | "CONTROL_FAILURE" | "TECHNICAL";
          description: string;
          compensating_control?: string | null;
          requested_by?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          expires_at?: string | null;
          status?: "REQUESTED" | "APPROVED" | "REJECTED" | "EXPIRED" | "CLOSED";
        }
      >;
      risks: Table<
        {
          id: string;
          risk_code: string;
          title: string;
          description: string | null;
          asset: string | null;
          threat: string | null;
          vulnerability: string | null;
          impacts_confidentiality: boolean;
          impacts_integrity: boolean;
          impacts_availability: boolean;
          likelihood: number | null;
          impact: number | null;
          inherent_score: number | null;
          residual_likelihood: number | null;
          residual_impact: number | null;
          residual_score: number | null;
          treatment: "MITIGATE" | "AVOID" | "TRANSFER" | "ACCEPT" | null;
          treatment_plan: string | null;
          owner_employee_id: string | null;
          due_date: string | null;
          acceptance_approved_by: string | null;
          acceptance_approved_at: string | null;
          acceptance_expires_at: string | null;
          status: "IDENTIFIED" | "ASSESSED" | "TREATMENT_IN_PROGRESS" | "TREATED" | "ACCEPTED" | "CLOSED";
          next_review_date: string | null;
          methodology_ref: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          risk_code: string;
          title: string;
          description?: string | null;
          asset?: string | null;
          threat?: string | null;
          vulnerability?: string | null;
          impacts_confidentiality?: boolean;
          impacts_integrity?: boolean;
          impacts_availability?: boolean;
          likelihood?: number | null;
          impact?: number | null;
          residual_likelihood?: number | null;
          residual_impact?: number | null;
          treatment?: "MITIGATE" | "AVOID" | "TRANSFER" | "ACCEPT" | null;
          treatment_plan?: string | null;
          owner_employee_id?: string | null;
          due_date?: string | null;
          acceptance_approved_by?: string | null;
          acceptance_approved_at?: string | null;
          acceptance_expires_at?: string | null;
          status?: "IDENTIFIED" | "ASSESSED" | "TREATMENT_IN_PROGRESS" | "TREATED" | "ACCEPTED" | "CLOSED";
          next_review_date?: string | null;
        }
      >;
      risk_control_links: Table<
        { risk_id: string; control_id: string },
        { risk_id: string; control_id: string }
      >;
      soa_entries: Table<
        {
          id: string;
          requirement_id: string;
          applicable: boolean | null;
          justification: string | null;
          implementation_status: "NOT_ASSESSED" | "NOT_IMPLEMENTED" | "PARTIAL" | "IMPLEMENTED";
          revision: number;
          approved_by: string | null;
          approved_at: string | null;
          updated_at: string;
        },
        {
          requirement_id: string;
          applicable?: boolean | null;
          justification?: string | null;
          implementation_status?: "NOT_ASSESSED" | "NOT_IMPLEMENTED" | "PARTIAL" | "IMPLEMENTED";
          revision?: number;
          approved_by?: string | null;
          approved_at?: string | null;
        }
      >;
    };
    Views: Record<string, never>;
    Functions: {
      current_employee_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      jwt_employee_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      jwt_role_key: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_employee_permissions: {
        Args: { p_employee_id: string };
        Returns: string[];
      };
      my_team_employee_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
      purge_old_chat: {
        Args: Record<string, never>;
        Returns: number;
      };
      run_automated_control_checks: {
        Args: Record<string, never>;
        Returns: { control_code: string; result: string; exceptions_count: number }[];
      };
      log_security_event: {
        Args: { p_employee_id: string; p_action: string; p_details?: Json };
        Returns: undefined;
      };
      has_verified_mfa: {
        Args: { p_user_id: string };
        Returns: boolean;
      };
      verify_audit_chain: {
        Args: { p_from_seq?: number };
        Returns: { seq: number; expected_hash: string; stored_hash: string; reason: string }[];
      };
      seal_legacy_audit_logs: {
        Args: Record<string, never>;
        Returns: number;
      };
      append_audit_log: {
        Args: {
          p_table: string;
          p_record_id: string | null;
          p_action: string;
          p_old?: Json | null;
          p_new?: Json | null;
          p_actor?: string | null;
        };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
  };
}
