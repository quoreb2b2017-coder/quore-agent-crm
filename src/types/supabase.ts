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

export interface Database {
  public: {
    Tables: {
      departments: Table<
        {
          id: string;
          name: string;
          description: string | null;
          head_employee_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          name: string;
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
          is_system: boolean;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          role_key: string;
          display_name: string;
          description?: string | null;
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
          status:
            | "PRESENT"
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
          status?:
            | "PRESENT"
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
        },
        {
          id?: string;
          actor_employee_id?: string | null;
          action: string;
          table_name?: string | null;
          record_id?: string | null;
          old_data?: Json | null;
          new_data?: Json | null;
          ip_address?: string | null;
          created_at?: string;
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
    };
    Enums: Record<string, never>;
  };
}
