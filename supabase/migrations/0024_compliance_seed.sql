-- 0024_compliance_seed.sql
-- GENERATED from the WorkTrack gap assessment (2026-10-29, quoreb2b2017-coder/quore-agent-crm @ 3c0c0b7 (main, 2026-10-15)).
-- Seeds frameworks, requirements, the control register with ISO/SOC 2 mappings,
-- one open corrective action per security finding, and an empty Statement of
-- Applicability row per Annex A control. Control statuses describe PRODUCTION
-- on the assessment date, not the fixes on this branch.
-- ON CONFLICT DO NOTHING everywhere: re-running never overwrites decisions made in the app.

insert into public.compliance_frameworks (framework_key, name, version, notes) values
  ('ISO27001_2022', 'ISO/IEC 27001', '2022 (incl. Amd 1:2024)', 'Clauses 4-10 and Annex A. Titles are short reference names only; use the licensed standard for requirement text.'),
  ('SOC2_TSC_2017', 'AICPA Trust Services Criteria (SOC 2)', '2017 (revised points of focus 2022)', 'Labels are our own short descriptions, not the criterion text.')
on conflict (framework_key) do nothing;

insert into public.framework_requirements (framework_id, ref, title, category)
select f.id, v.ref, v.title, v.category
from (values
  ('ISO27001_2022', '4.1', 'Understanding the organization and its context', 'Clause'),
  ('ISO27001_2022', '4.2', 'Understanding the needs and expectations of interested parties', 'Clause'),
  ('ISO27001_2022', '4.3', 'Determining the scope of the ISMS', 'Clause'),
  ('ISO27001_2022', '4.4', 'Information security management system', 'Clause'),
  ('ISO27001_2022', '5.1', 'Leadership and commitment', 'Clause'),
  ('ISO27001_2022', '5.2', 'Information security policy', 'Clause'),
  ('ISO27001_2022', '5.3', 'Organizational roles, responsibilities and authorities', 'Clause'),
  ('ISO27001_2022', '6.1.2', 'Information security risk assessment', 'Clause'),
  ('ISO27001_2022', '6.1.3', 'Information security risk treatment', 'Clause'),
  ('ISO27001_2022', '6.2', 'Information security objectives and planning to achieve them', 'Clause'),
  ('ISO27001_2022', '6.3', 'Planning of changes', 'Clause'),
  ('ISO27001_2022', '7.1', 'Resources', 'Clause'),
  ('ISO27001_2022', '7.2', 'Competence', 'Clause'),
  ('ISO27001_2022', '7.3', 'Awareness', 'Clause'),
  ('ISO27001_2022', '7.4', 'Communication', 'Clause'),
  ('ISO27001_2022', '7.5', 'Documented information', 'Clause'),
  ('ISO27001_2022', '8.1', 'Operational planning and control', 'Clause'),
  ('ISO27001_2022', '8.2', 'Information security risk assessment (operation)', 'Clause'),
  ('ISO27001_2022', '8.3', 'Information security risk treatment (operation)', 'Clause'),
  ('ISO27001_2022', '9.1', 'Monitoring, measurement, analysis and evaluation', 'Clause'),
  ('ISO27001_2022', '9.2', 'Internal audit', 'Clause'),
  ('ISO27001_2022', '9.3', 'Management review', 'Clause'),
  ('ISO27001_2022', '10.1', 'Continual improvement', 'Clause'),
  ('ISO27001_2022', '10.2', 'Nonconformity and corrective action', 'Clause'),
  ('ISO27001_2022', 'A.5.1', 'Policies for information security', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.2', 'Information security roles and responsibilities', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.3', 'Segregation of duties', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.4', 'Management responsibilities', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.5', 'Contact with authorities', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.6', 'Contact with special interest groups', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.7', 'Threat intelligence', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.8', 'Information security in project management', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.9', 'Inventory of information and other associated assets', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.10', 'Acceptable use of information and other associated assets', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.11', 'Return of assets', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.12', 'Classification of information', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.13', 'Labelling of information', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.14', 'Information transfer', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.15', 'Access control', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.16', 'Identity management', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.17', 'Authentication information', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.18', 'Access rights', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.19', 'Information security in supplier relationships', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.20', 'Addressing information security within supplier agreements', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.21', 'Managing information security in the ICT supply chain', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.22', 'Monitoring, review and change management of supplier services', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.23', 'Information security for use of cloud services', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.24', 'Information security incident management planning and preparation', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.25', 'Assessment and decision on information security events', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.26', 'Response to information security incidents', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.27', 'Learning from information security incidents', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.28', 'Collection of evidence', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.29', 'Information security during disruption', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.30', 'ICT readiness for business continuity', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.31', 'Legal, statutory, regulatory and contractual requirements', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.32', 'Intellectual property rights', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.33', 'Protection of records', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.34', 'Privacy and protection of PII', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.35', 'Independent review of information security', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.36', 'Compliance with policies, rules and standards for information security', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.5.37', 'Documented operating procedures', 'Annex A - Organizational'),
  ('ISO27001_2022', 'A.6.1', 'Screening', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.2', 'Terms and conditions of employment', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.3', 'Information security awareness, education and training', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.4', 'Disciplinary process', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.5', 'Responsibilities after termination or change of employment', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.6', 'Confidentiality or non-disclosure agreements', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.7', 'Remote working', 'Annex A - People'),
  ('ISO27001_2022', 'A.6.8', 'Information security event reporting', 'Annex A - People'),
  ('ISO27001_2022', 'A.7.1', 'Physical security perimeters', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.2', 'Physical entry', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.3', 'Securing offices, rooms and facilities', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.4', 'Physical security monitoring', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.5', 'Protecting against physical and environmental threats', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.6', 'Working in secure areas', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.7', 'Clear desk and clear screen', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.8', 'Equipment siting and protection', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.9', 'Security of assets off-premises', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.10', 'Storage media', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.11', 'Supporting utilities', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.12', 'Cabling security', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.13', 'Equipment maintenance', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.7.14', 'Secure disposal or re-use of equipment', 'Annex A - Physical'),
  ('ISO27001_2022', 'A.8.1', 'User endpoint devices', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.2', 'Privileged access rights', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.3', 'Information access restriction', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.4', 'Access to source code', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.5', 'Secure authentication', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.6', 'Capacity management', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.7', 'Protection against malware', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.8', 'Management of technical vulnerabilities', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.9', 'Configuration management', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.10', 'Information deletion', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.11', 'Data masking', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.12', 'Data leakage prevention', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.13', 'Information backup', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.14', 'Redundancy of information processing facilities', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.15', 'Logging', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.16', 'Monitoring activities', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.17', 'Clock synchronization', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.18', 'Use of privileged utility programs', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.19', 'Installation of software on operational systems', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.20', 'Networks security', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.21', 'Security of network services', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.22', 'Segregation of networks', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.23', 'Web filtering', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.24', 'Use of cryptography', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.25', 'Secure development life cycle', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.26', 'Application security requirements', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.27', 'Secure system architecture and engineering principles', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.28', 'Secure coding', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.29', 'Security testing in development and acceptance', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.30', 'Outsourced development', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.31', 'Separation of development, test and production environments', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.32', 'Change management', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.33', 'Test information', 'Annex A - Technological'),
  ('ISO27001_2022', 'A.8.34', 'Protection of information systems during audit testing', 'Annex A - Technological'),
  ('SOC2_TSC_2017', 'CC1.1', 'Integrity and ethical values', 'Control environment'),
  ('SOC2_TSC_2017', 'CC1.2', 'Oversight of internal control', 'Control environment'),
  ('SOC2_TSC_2017', 'CC1.3', 'Structures, reporting lines and authority', 'Control environment'),
  ('SOC2_TSC_2017', 'CC1.4', 'Competence of personnel', 'Control environment'),
  ('SOC2_TSC_2017', 'CC1.5', 'Accountability for control responsibilities', 'Control environment'),
  ('SOC2_TSC_2017', 'CC2.1', 'Quality information for internal control', 'Communication and information'),
  ('SOC2_TSC_2017', 'CC2.2', 'Internal communication of control responsibilities', 'Communication and information'),
  ('SOC2_TSC_2017', 'CC2.3', 'Communication with external parties', 'Communication and information'),
  ('SOC2_TSC_2017', 'CC3.1', 'Objectives set to allow risk identification', 'Risk assessment'),
  ('SOC2_TSC_2017', 'CC3.2', 'Risk identification and analysis', 'Risk assessment'),
  ('SOC2_TSC_2017', 'CC3.3', 'Fraud risk', 'Risk assessment'),
  ('SOC2_TSC_2017', 'CC3.4', 'Assessment of significant changes', 'Risk assessment'),
  ('SOC2_TSC_2017', 'CC4.1', 'Ongoing and separate evaluations', 'Monitoring'),
  ('SOC2_TSC_2017', 'CC4.2', 'Communicating control deficiencies', 'Monitoring'),
  ('SOC2_TSC_2017', 'CC5.1', 'Control activities that mitigate risk', 'Control activities'),
  ('SOC2_TSC_2017', 'CC5.2', 'General controls over technology', 'Control activities'),
  ('SOC2_TSC_2017', 'CC5.3', 'Policies and procedures', 'Control activities'),
  ('SOC2_TSC_2017', 'CC6.1', 'Logical access security architecture', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.2', 'User registration and authorization', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.3', 'Role-based access, least privilege, segregation of duties', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.4', 'Physical access', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.5', 'Asset disposal', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.6', 'Threats from outside the system boundary', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.7', 'Data transmission and movement', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC6.8', 'Unauthorized or malicious software', 'Logical and physical access'),
  ('SOC2_TSC_2017', 'CC7.1', 'Configuration and vulnerability detection', 'System operations'),
  ('SOC2_TSC_2017', 'CC7.2', 'Monitoring for anomalies', 'System operations'),
  ('SOC2_TSC_2017', 'CC7.3', 'Evaluation of security events', 'System operations'),
  ('SOC2_TSC_2017', 'CC7.4', 'Incident response', 'System operations'),
  ('SOC2_TSC_2017', 'CC7.5', 'Incident recovery', 'System operations'),
  ('SOC2_TSC_2017', 'CC8.1', 'Change management', 'Change management'),
  ('SOC2_TSC_2017', 'CC9.1', 'Business disruption risk', 'Risk mitigation'),
  ('SOC2_TSC_2017', 'CC9.2', 'Vendor and partner risk', 'Risk mitigation'),
  ('SOC2_TSC_2017', 'A1.1', 'Capacity management', 'Availability'),
  ('SOC2_TSC_2017', 'A1.2', 'Backup and recovery infrastructure', 'Availability'),
  ('SOC2_TSC_2017', 'A1.3', 'Recovery testing', 'Availability'),
  ('SOC2_TSC_2017', 'C1.1', 'Identifying and protecting confidential information', 'Confidentiality'),
  ('SOC2_TSC_2017', 'C1.2', 'Disposing of confidential information', 'Confidentiality'),
  ('SOC2_TSC_2017', 'PI1.3', 'Complete and accurate processing', 'Processing integrity')
) as v(framework_key, ref, title, category)
join public.compliance_frameworks f on f.framework_key = v.framework_key
on conflict (framework_id, ref) do nothing;

insert into public.compliance_controls (
  control_code, title, description, domain, owner_role, frequency, control_type,
  execution_mode, scope_layer, status, current_state, gap_remediation, evidence_required, test_procedure, priority
) values
  ('WT-GOV-01', 'ISMS and SOC 2 system scope defined and approved', 'ISMS and SOC 2 system scope defined and approved', 'Governance', 'Founder / ISMS lead', 'ANNUAL', 'SUPPORTING', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'No scope statement. Two entities appear (US LLC; India Pvt Ltd on payslips).', 'Decide the legal entity, locations (Dallas, Pune), services, systems and third parties in scope; write the SOC 2 system description outline.', 'Approved scope document with version and approver; system boundary diagram.', 'Inspect approved scope; confirm WorkTrack, Supabase, Vercel, GitHub and the socket host are listed.', 'P0'),
  ('WT-GOV-02', 'Information security policy set approved and reviewed', 'Information security policy set approved and reviewed', 'Governance', 'ISMS lead', 'ANNUAL', 'SUPPORTING', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'No policies in the repository or referenced.', 'Write and approve core policies (security, acceptable use, access control, SDLC/change, incident, BC/DR, vendor, retention, monitoring/privacy).', 'Approved, versioned policies; annual review records.', 'Inspect policy versions, approvals and review dates.', 'P1'),
  ('WT-GOV-03', 'Security roles, ownership and authorities assigned', 'Security roles, ownership and authorities assigned', 'Governance', 'Founder', 'ANNUAL', 'SUPPORTING', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'No named ISMS lead or control owners.', 'Name the ISMS lead, a security owner for WorkTrack and owners for every control below.', 'RACI / role assignment approved by management.', 'Inspect RACI; confirm each control has an owner in the register.', 'P1'),
  ('WT-GOV-04', 'Management review of the ISMS', 'Management review of the ISMS', 'Governance', 'Founder', 'SEMI_ANNUAL', 'DETECTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'Not performed.', 'Hold and minute management reviews covering risks, control results, incidents and improvement actions.', 'Signed minutes with inputs and decided actions.', 'Inspect minutes against the clause 9.3 input list.', 'P2'),
  ('WT-GOV-05', 'Internal audit programme', 'Internal audit programme', 'Governance', 'Independent reviewer (external or non-owner)', 'ANNUAL', 'DETECTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'Not performed.', 'Plan and run an internal audit by someone independent of the control owners before the certification audit.', 'Audit plan, report, findings and corrective actions.', 'Inspect report; trace findings to corrective actions.', 'P2'),
  ('WT-GOV-06', 'Legal, regulatory and contractual requirements register', 'Legal, regulatory and contractual requirements register', 'Governance', 'Founder with legal advisor', 'ANNUAL', 'SUPPORTING', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'Not recorded. Relevant regimes likely include India''s DPDP Act 2023, Indian labour and payroll rules (PF, professional tax, TDS), Texas and other US state privacy and breach-notification laws, and customer contracts.', 'Build the register with advisors and link each obligation to controls.', 'Register reviewed by counsel; contract security obligations listed.', 'Inspect register; sample contracts and confirm obligations are mapped.', 'P1'),
  ('WT-RSK-01', 'Risk assessment methodology and risk register', 'Risk assessment methodology and risk register', 'Risk', 'ISMS lead', 'ANNUAL', 'SUPPORTING', 'HYBRID', 'ORGANIZATION', 'IN_PROGRESS', 'No register. Branch adds a risk register (likelihood x impact, residual score, owner, acceptance approval) without inventing scores or appetite.', 'Approve a methodology and risk appetite, then assess risks; findings F-01..F-16 are inputs.', 'Approved methodology; risk register export with owners and review dates.', 'Inspect methodology; re-perform scoring for a sample.', 'P0'),
  ('WT-RSK-02', 'Risk treatment plan and Statement of Applicability', 'Risk treatment plan and Statement of Applicability', 'Risk', 'ISMS lead', 'ANNUAL', 'SUPPORTING', 'HYBRID', 'ORGANIZATION', 'IN_PROGRESS', 'Branch seeds all 93 Annex A controls into an SoA table; each needs an applicability decision and justification.', 'Decide applicability, justify exclusions, approve the SoA.', 'Approved SoA with revision history; treatment plan.', 'Inspect SoA; check every exclusion has a justification and every inclusion maps to a control.', 'P1'),
  ('WT-RSK-03', 'Nonconformity and corrective action tracking', 'Nonconformity and corrective action tracking', 'Risk', 'ISMS lead', 'CONTINUOUS', 'CORRECTIVE', 'HYBRID', 'WORKTRACK', 'IN_PROGRESS', 'Branch adds corrective_actions; closure requires linked evidence. Findings are seeded as open actions.', 'Assign owners and due dates; review overdue items monthly.', 'Corrective action log with closure evidence.', 'Sample closed actions and inspect closure evidence.', 'P1'),
  ('WT-IAM-01', 'Verified server-side authentication and unique accounts', 'Verified server-side authentication and unique accounts', 'Identity & access', 'WorkTrack security owner', 'CONTINUOUS', 'PREVENTIVE', 'AUTOMATED', 'WORKTRACK', 'REMEDIATION_REQUIRED', 'Production trusts unverified session cookies (F-01).', 'Deploy the branch fix; add a test that a forged cookie is rejected.', 'Code reference and passing test; deployment record.', 'Re-perform: request a protected page with a forged token in staging and confirm redirect to login.', 'P0'),
  ('WT-IAM-02', 'MFA for privileged and remote access', 'MFA for privileged and remote access', 'Identity & access', 'WorkTrack security owner', 'CONTINUOUS', 'PREVENTIVE', 'AUTOMATED', 'SHARED', 'NOT_IMPLEMENTED', 'No MFA in WorkTrack. GitHub, Supabase, Vercel and Google Workspace MFA not evidenced.', 'Enforce TOTP for Super Admin and HR in WorkTrack (aal2); require MFA on GitHub, Supabase, Vercel, Google.', 'Automated check output (privileged users without a verified factor); provider MFA settings exports.', 'Automated: list privileged users lacking a verified MFA factor (run_automated_control_checks).', 'P0'),
  ('WT-IAM-03', 'Role-based least privilege', 'Role-based least privilege', 'Identity & access', 'WorkTrack security owner', 'CONTINUOUS', 'PREVENTIVE', 'HYBRID', 'WORKTRACK', 'REMEDIATION_REQUIRED', 'Staff roles can read all salary and activity data through the API (F-03); permission helper exposed (F-12).', 'Deploy 0022; then move app reads to RLS-bound client (B-05).', 'Role/permission matrix export; automated check of restricted permissions on staff roles.', 'Automated: staff roles holding restricted permissions must be zero.', 'P0'),
  ('WT-IAM-04', 'No self-administration; segregation of duties', 'No self-administration; segregation of duties', 'Identity & access', 'Founder', 'CONTINUOUS', 'PREVENTIVE', 'HYBRID', 'WORKTRACK', 'REMEDIATION_REQUIRED', 'HR can self-assign SUPER_ADMIN (F-04); single Super Admin performs payroll, attendance and leave (F-07).', 'Deploy 0022; record an SoD exception with compensating monthly review while the team is small.', 'Automated check output; approved SoD exception with expiry.', 'Automated: count Super Admins and approved SoD exceptions; inspect review sign-offs.', 'P0'),
  ('WT-IAM-05', 'Joiner, mover, leaver with timely revocation', 'Joiner, mover, leaver with timely revocation', 'Identity & access', 'HR / Super Admin', 'EVENT_DRIVEN', 'PREVENTIVE', 'HYBRID', 'WORKTRACK', 'REMEDIATION_REQUIRED', 'Blocked or terminated users keep access until token expiry (F-06). No documented leaver checklist.', 'Deploy the branch fix; write a leaver checklist covering WorkTrack, Google, GitHub, Supabase, Vercel.', 'Automated check (blocked employees with live auth); leaver tickets with completion time.', 'Automated: SUSPENDED/TERMINATED employees whose auth user is not banned; sample leavers.', 'P0'),
  ('WT-IAM-06', 'Periodic access reviews', 'Periodic access reviews', 'Identity & access', 'Founder (reviewer independent of the admins reviewed where possible)', 'QUARTERLY', 'DETECTIVE', 'MANUAL', 'SHARED', 'NOT_IMPLEMENTED', 'Not performed.', 'Quarterly review of WorkTrack roles, Supabase, Vercel, GitHub and Google admin access; record decisions.', 'Review population export, reviewer decisions, remediation tickets.', 'Inspect each quarter''s review; trace revocations to completion.', 'P1'),
  ('WT-IAM-07', 'Privileged credential and service-key management', 'Privileged credential and service-key management', 'Identity & access', 'WorkTrack security owner', 'QUARTERLY', 'PREVENTIVE', 'MANUAL', 'INFRASTRUCTURE', 'REMEDIATION_REQUIRED', 'Service-role key used for all app traffic (F-02) and as socket secret (F-11). Rotation not evidenced.', 'Deploy socket-secret fix; restrict service-role use; document rotation.', 'Secret inventory with owners and last rotation dates.', 'Inspect inventory; confirm last rotation within policy.', 'P1'),
  ('WT-LOG-01', 'Security audit logging with attribution', 'Security audit logging with attribution', 'Logging & monitoring', 'WorkTrack security owner', 'CONTINUOUS', 'DETECTIVE', 'AUTOMATED', 'WORKTRACK', 'REMEDIATION_REQUIRED', 'App writes log actor NULL; attendance and role changes not logged; viewer disabled (F-05). Sign-in events live only in Supabase Auth logs.', 'Deploy 0022; restore a read-only audit viewer; export Supabase Auth logs.', 'Sample audit rows showing actor, request id and table coverage.', 'Inspect: make a test change in staging and find the attributed audit row.', 'P0'),
  ('WT-LOG-02', 'Audit log integrity and retention', 'Audit log integrity and retention', 'Logging & monitoring', 'WorkTrack security owner', 'DAILY', 'DETECTIVE', 'AUTOMATED', 'WORKTRACK', 'NOT_IMPLEMENTED', 'No tamper protection in production. Branch adds append-only triggers and a hash chain with a verifier. Database owner can still bypass, so an external copy is needed.', 'Deploy 0022; forward audit rows to a separately controlled store (B-06); set retention.', 'Daily chain verification results; external sink configuration.', 'Automated: verify_audit_chain() returns no broken links.', 'P1'),
  ('WT-LOG-03', 'Alerting on privileged and suspicious activity', 'Alerting on privileged and suspicious activity', 'Logging & monitoring', 'WorkTrack security owner', 'CONTINUOUS', 'DETECTIVE', 'AUTOMATED', 'SHARED', 'NOT_IMPLEMENTED', 'No alerting.', 'Alert on role changes, new Super Admins, failed-login spikes, audit chain failures.', 'Alert rules and sample alert records.', 'Trigger a test event in staging and confirm the alert.', 'P2'),
  ('WT-LOG-04', 'Clock synchronization and UTC timestamps', 'Clock synchronization and UTC timestamps', 'Logging & monitoring', 'WorkTrack security owner', 'ANNUAL', 'SUPPORTING', 'AUTOMATED', 'SHARED', 'IMPLEMENTED_AWAITING_EVIDENCE', 'Timestamps are timestamptz set by Postgres now(); hosts are managed by Supabase and Vercel.', 'Collect provider statements on time sync.', 'Provider documentation / assurance report section.', 'Inspect provider evidence.', 'P3'),
  ('WT-SDL-01', 'Source code access control', 'Source code access control', 'Secure development', 'Founder', 'QUARTERLY', 'PREVENTIVE', 'MANUAL', 'INFRASTRUCTURE', 'REMEDIATION_REQUIRED', 'Repository is public; single personal account commits directly to main (F-08).', 'Make private; transfer to an organization; MFA and least-privilege access for collaborators.', 'GitHub org settings export; collaborator list.', 'Inspect repository visibility, member list and MFA requirement.', 'P0'),
  ('WT-SDL-02', 'Change management with reviewed, approved releases', 'Change management with reviewed, approved releases', 'Secure development', 'WorkTrack security owner', 'EVENT_DRIVEN', 'PREVENTIVE', 'HYBRID', 'SHARED', 'NOT_IMPLEMENTED', 'No pull requests, reviews or release records; commits titled ''added all changes''.', 'Protected main branch, required review and CI, release record per deployment (Vercel deployment + PR link).', 'Branch protection settings; sample PRs with reviewer and CI result; Vercel deployment log.', 'Sample production deployments; trace each to an approved PR with passing CI.', 'P0'),
  ('WT-SDL-03', 'Automated security testing in CI', 'Automated security testing in CI', 'Secure development', 'WorkTrack security owner', 'EVENT_DRIVEN', 'DETECTIVE', 'AUTOMATED', 'WORKTRACK', 'IN_PROGRESS', 'Branch adds CI: lint, type check, RLS security tests, dependency audit, secret scan.', 'Merge, make CI a required check, add SAST.', 'CI run history.', 'Inspect CI configuration and required-check settings; sample runs.', 'P1'),
  ('WT-SDL-04', 'Environment separation and secrets handling', 'Environment separation and secrets handling', 'Secure development', 'WorkTrack security owner', 'QUARTERLY', 'PREVENTIVE', 'MANUAL', 'INFRASTRUCTURE', 'NOT_ASSESSED', 'Unknown whether a staging Supabase project exists or production data is used in testing.', 'Separate staging project and keys; no production data in development.', 'Environment inventory; Vercel env scoping screenshots.', 'Inspect environment inventory and key scoping.', 'P1'),
  ('WT-SDL-05', 'Secure configuration and HTTP security headers', 'Secure configuration and HTTP security headers', 'Secure development', 'WorkTrack security owner', 'QUARTERLY', 'PREVENTIVE', 'AUTOMATED', 'WORKTRACK', 'NOT_IMPLEMENTED', 'No headers in production. Branch adds HSTS, frame, nosniff, referrer and permissions policies.', 'Deploy; add CSP in report-only, then enforce.', 'Header scan of production URL.', 'Re-perform header scan.', 'P2'),
  ('WT-VUL-01', 'Vulnerability and dependency management with SLAs', 'Vulnerability and dependency management with SLAs', 'Vulnerability management', 'WorkTrack security owner', 'MONTHLY', 'DETECTIVE', 'HYBRID', 'SHARED', 'REMEDIATION_REQUIRED', 'No scanning or SLAs. Production runs a Next.js release with critical RCE advisories (F-17).', 'Deploy the upgrade; keep npm audit in CI; enable Dependabot; approve risk-based remediation SLAs; track findings.', 'Scan results and remediation tickets within SLA.', 'Sample findings; check remediation dates against SLA.', 'P0'),
  ('WT-VUL-02', 'Independent penetration test', 'Independent penetration test', 'Vulnerability management', 'Founder', 'ANNUAL', 'DETECTIVE', 'MANUAL', 'WORKTRACK', 'NOT_IMPLEMENTED', 'Never performed.', 'Commission an external test after Phase B fixes are deployed.', 'Report and retest letter.', 'Inspect report; confirm high findings retested.', 'P2'),
  ('WT-INC-01', 'Incident response plan, roles and exercises', 'Incident response plan, roles and exercises', 'Incident management', 'ISMS lead', 'ANNUAL', 'CORRECTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'No plan, reporting channel or exercise.', 'Write the plan with legal and privacy checkpoints (DPDP and US notification assessment), run a tabletop.', 'Plan, exercise report, incident log.', 'Inspect exercise record; sample incidents for timeline completeness.', 'P1'),
  ('WT-BCD-01', 'Backups, restore testing, RTO and RPO', 'Backups, restore testing, RTO and RPO', 'Continuity', 'WorkTrack security owner', 'QUARTERLY', 'CORRECTIVE', 'MANUAL', 'INFRASTRUCTURE', 'NOT_ASSESSED', 'Supabase plan and point-in-time recovery not evidenced; no restore test.', 'Confirm PITR; set RTO/RPO; restore into a scratch project quarterly and record results.', 'Backup configuration; restore test record (time taken, data checks).', 'Inspect restore test; compare achieved recovery with RTO/RPO.', 'P1'),
  ('WT-VEN-01', 'Vendor inventory and assurance review', 'Vendor inventory and assurance review', 'Third parties', 'ISMS lead', 'ANNUAL', 'DETECTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'Key vendors: Supabase, Vercel, GitHub, socket host (Railway/Render), Google. No reviews recorded.', 'Inventory vendors, collect current SOC 2 / ISO reports, review complementary user entity controls.', 'Vendor register with report dates and review notes.', 'Inspect register; confirm reports are current and CUECs addressed.', 'P1'),
  ('WT-AST-01', 'Asset inventory', 'Asset inventory', 'Assets', 'ISMS lead', 'QUARTERLY', 'SUPPORTING', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'No inventory of systems, data stores or endpoints.', 'Inventory systems, data stores, endpoints and owners.', 'Asset register.', 'Inspect register; sample assets for owner and classification.', 'P2'),
  ('WT-DAT-01', 'Data classification, retention and deletion', 'Data classification, retention and deletion', 'Data protection', 'ISMS lead', 'ANNUAL', 'PREVENTIVE', 'HYBRID', 'WORKTRACK', 'NOT_IMPLEMENTED', 'Chat purged after 7 days; activity, attendance, payroll and audit data have no retention schedule.', 'Approve a schedule per data category; implement scheduled deletion and legal hold.', 'Retention schedule; deletion job logs.', 'Inspect schedule; query for records older than the limit.', 'P1'),
  ('WT-DAT-02', 'Encryption in transit and at rest', 'Encryption in transit and at rest', 'Data protection', 'WorkTrack security owner', 'ANNUAL', 'PREVENTIVE', 'AUTOMATED', 'SHARED', 'IMPLEMENTED_AWAITING_EVIDENCE', 'TLS via Vercel and Supabase; storage encryption provided by Supabase.', 'Collect provider evidence; add HSTS (on branch).', 'Provider assurance report sections; TLS scan.', 'Inspect provider evidence and TLS scan.', 'P3'),
  ('WT-PRV-01', 'Transparent, minimal employee monitoring', 'Transparent, minimal employee monitoring', 'Privacy', 'Founder with legal advisor', 'ANNUAL', 'PREVENTIVE', 'MANUAL', 'WORKTRACK', 'NOT_IMPLEMENTED', 'Browsing domains, idle detection, washroom and break tracking without recorded purpose, notice or assessment (F-14).', 'Purpose register per data category, employee notice and acknowledgement, privacy assessment under DPDP, review of idle-detection use in productivity and discipline.', 'Notice, acknowledgements, assessment record.', 'Inspect notice and acknowledgement coverage of current staff.', 'P1'),
  ('WT-PPL-01', 'Security awareness training and policy acknowledgement', 'Security awareness training and policy acknowledgement', 'People', 'HR', 'ANNUAL', 'PREVENTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_IMPLEMENTED', 'Not performed.', 'Annual training and policy acknowledgement for all staff, recorded with actual actor and time.', 'Completion records.', 'Compare completion records with the active employee list.', 'P2'),
  ('WT-PPL-02', 'Screening, NDAs and employment terms', 'Screening, NDAs and employment terms', 'People', 'HR', 'EVENT_DRIVEN', 'PREVENTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_ASSESSED', 'Unknown.', 'Confirm background checks (as lawful), signed confidentiality terms and a disciplinary process.', 'Signed agreements for sampled hires.', 'Sample new joiners for signed terms.', 'P2'),
  ('WT-PHY-01', 'Office physical security and endpoint protection', 'Office physical security and endpoint protection', 'Physical & endpoint', 'Office administrator', 'ANNUAL', 'PREVENTIVE', 'MANUAL', 'ORGANIZATION', 'NOT_ASSESSED', 'Pune office and staff laptops not assessed.', 'Assess entry control, clear desk, disk encryption, anti-malware and disposal.', 'Office assessment; endpoint management report.', 'Inspect a sample of endpoints and office walk-through.', 'P2'),
  ('WT-PAY-01', 'Payroll preparation, approval and release', 'Payroll preparation, approval and release', 'Processing integrity', 'Founder', 'MONTHLY', 'PREVENTIVE', 'HYBRID', 'WORKTRACK', 'NOT_IMPLEMENTED', 'Cron generates payslips on the 10th; one Super Admin prepares and releases (F-07).', 'Maker-checker payroll run, or approved SoD exception with an independent monthly review of the payroll statement.', 'Monthly approval record linked to the payroll run.', 'Sample months; confirm approver differs from preparer or an approved exception and review exist.', 'P1')
on conflict (control_code) do nothing;

insert into public.control_requirement_mappings (control_id, requirement_id)
select c.id, r.id
from (values
  ('WT-GOV-01', 'ISO27001_2022', '4.1'),
  ('WT-GOV-01', 'ISO27001_2022', '4.2'),
  ('WT-GOV-01', 'ISO27001_2022', '4.3'),
  ('WT-GOV-01', 'ISO27001_2022', '4.4'),
  ('WT-GOV-01', 'SOC2_TSC_2017', 'CC2.3'),
  ('WT-GOV-01', 'SOC2_TSC_2017', 'CC3.1'),
  ('WT-GOV-02', 'ISO27001_2022', '5.2'),
  ('WT-GOV-02', 'ISO27001_2022', 'A.5.1'),
  ('WT-GOV-02', 'ISO27001_2022', 'A.5.37'),
  ('WT-GOV-02', 'SOC2_TSC_2017', 'CC5.3'),
  ('WT-GOV-02', 'SOC2_TSC_2017', 'CC2.2'),
  ('WT-GOV-03', 'ISO27001_2022', '5.3'),
  ('WT-GOV-03', 'ISO27001_2022', 'A.5.2'),
  ('WT-GOV-03', 'ISO27001_2022', 'A.5.4'),
  ('WT-GOV-03', 'SOC2_TSC_2017', 'CC1.3'),
  ('WT-GOV-03', 'SOC2_TSC_2017', 'CC1.5'),
  ('WT-GOV-04', 'ISO27001_2022', '9.3'),
  ('WT-GOV-04', 'ISO27001_2022', '9.1'),
  ('WT-GOV-04', 'ISO27001_2022', '10.1'),
  ('WT-GOV-04', 'SOC2_TSC_2017', 'CC1.2'),
  ('WT-GOV-04', 'SOC2_TSC_2017', 'CC4.1'),
  ('WT-GOV-05', 'ISO27001_2022', '9.2'),
  ('WT-GOV-05', 'ISO27001_2022', 'A.5.35'),
  ('WT-GOV-05', 'ISO27001_2022', 'A.5.36'),
  ('WT-GOV-05', 'SOC2_TSC_2017', 'CC4.1'),
  ('WT-GOV-05', 'SOC2_TSC_2017', 'CC4.2'),
  ('WT-GOV-06', 'ISO27001_2022', 'A.5.31'),
  ('WT-GOV-06', 'ISO27001_2022', 'A.5.32'),
  ('WT-GOV-06', 'ISO27001_2022', 'A.5.34'),
  ('WT-GOV-06', 'ISO27001_2022', '4.2'),
  ('WT-GOV-06', 'SOC2_TSC_2017', 'CC2.3'),
  ('WT-GOV-06', 'SOC2_TSC_2017', 'CC3.1'),
  ('WT-RSK-01', 'ISO27001_2022', '6.1.2'),
  ('WT-RSK-01', 'ISO27001_2022', '8.2'),
  ('WT-RSK-01', 'SOC2_TSC_2017', 'CC3.1'),
  ('WT-RSK-01', 'SOC2_TSC_2017', 'CC3.2'),
  ('WT-RSK-01', 'SOC2_TSC_2017', 'CC3.3'),
  ('WT-RSK-01', 'SOC2_TSC_2017', 'CC3.4'),
  ('WT-RSK-02', 'ISO27001_2022', '6.1.3'),
  ('WT-RSK-02', 'ISO27001_2022', '8.3'),
  ('WT-RSK-02', 'SOC2_TSC_2017', 'CC3.2'),
  ('WT-RSK-02', 'SOC2_TSC_2017', 'CC5.1'),
  ('WT-RSK-03', 'ISO27001_2022', '10.2'),
  ('WT-RSK-03', 'SOC2_TSC_2017', 'CC4.2'),
  ('WT-IAM-01', 'ISO27001_2022', 'A.5.16'),
  ('WT-IAM-01', 'ISO27001_2022', 'A.8.5'),
  ('WT-IAM-01', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-IAM-02', 'ISO27001_2022', 'A.8.5'),
  ('WT-IAM-02', 'ISO27001_2022', 'A.5.17'),
  ('WT-IAM-02', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-IAM-03', 'ISO27001_2022', 'A.5.15'),
  ('WT-IAM-03', 'ISO27001_2022', 'A.5.18'),
  ('WT-IAM-03', 'ISO27001_2022', 'A.8.2'),
  ('WT-IAM-03', 'ISO27001_2022', 'A.8.3'),
  ('WT-IAM-03', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-IAM-03', 'SOC2_TSC_2017', 'CC6.3'),
  ('WT-IAM-04', 'ISO27001_2022', 'A.5.3'),
  ('WT-IAM-04', 'ISO27001_2022', 'A.8.2'),
  ('WT-IAM-04', 'SOC2_TSC_2017', 'CC6.3'),
  ('WT-IAM-04', 'SOC2_TSC_2017', 'CC5.1'),
  ('WT-IAM-05', 'ISO27001_2022', 'A.5.18'),
  ('WT-IAM-05', 'ISO27001_2022', 'A.6.5'),
  ('WT-IAM-05', 'ISO27001_2022', 'A.5.11'),
  ('WT-IAM-05', 'SOC2_TSC_2017', 'CC6.2'),
  ('WT-IAM-05', 'SOC2_TSC_2017', 'CC6.3'),
  ('WT-IAM-06', 'ISO27001_2022', 'A.5.18'),
  ('WT-IAM-06', 'ISO27001_2022', 'A.8.2'),
  ('WT-IAM-06', 'SOC2_TSC_2017', 'CC6.2'),
  ('WT-IAM-06', 'SOC2_TSC_2017', 'CC6.3'),
  ('WT-IAM-07', 'ISO27001_2022', 'A.8.2'),
  ('WT-IAM-07', 'ISO27001_2022', 'A.5.17'),
  ('WT-IAM-07', 'ISO27001_2022', 'A.8.18'),
  ('WT-IAM-07', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-LOG-01', 'ISO27001_2022', 'A.8.15'),
  ('WT-LOG-01', 'SOC2_TSC_2017', 'CC7.2'),
  ('WT-LOG-02', 'ISO27001_2022', 'A.8.15'),
  ('WT-LOG-02', 'ISO27001_2022', 'A.5.28'),
  ('WT-LOG-02', 'ISO27001_2022', 'A.5.33'),
  ('WT-LOG-02', 'SOC2_TSC_2017', 'CC7.2'),
  ('WT-LOG-03', 'ISO27001_2022', 'A.8.16'),
  ('WT-LOG-03', 'SOC2_TSC_2017', 'CC7.2'),
  ('WT-LOG-03', 'SOC2_TSC_2017', 'CC7.3'),
  ('WT-LOG-04', 'ISO27001_2022', 'A.8.17'),
  ('WT-LOG-04', 'SOC2_TSC_2017', 'CC7.2'),
  ('WT-SDL-01', 'ISO27001_2022', 'A.8.4'),
  ('WT-SDL-01', 'ISO27001_2022', 'A.5.15'),
  ('WT-SDL-01', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-SDL-01', 'SOC2_TSC_2017', 'CC8.1'),
  ('WT-SDL-02', 'ISO27001_2022', 'A.8.32'),
  ('WT-SDL-02', 'ISO27001_2022', '6.3'),
  ('WT-SDL-02', 'SOC2_TSC_2017', 'CC8.1'),
  ('WT-SDL-03', 'ISO27001_2022', 'A.8.25'),
  ('WT-SDL-03', 'ISO27001_2022', 'A.8.28'),
  ('WT-SDL-03', 'ISO27001_2022', 'A.8.29'),
  ('WT-SDL-03', 'SOC2_TSC_2017', 'CC8.1'),
  ('WT-SDL-03', 'SOC2_TSC_2017', 'CC7.1'),
  ('WT-SDL-04', 'ISO27001_2022', 'A.8.31'),
  ('WT-SDL-04', 'ISO27001_2022', 'A.8.33'),
  ('WT-SDL-04', 'ISO27001_2022', 'A.8.9'),
  ('WT-SDL-04', 'SOC2_TSC_2017', 'CC8.1'),
  ('WT-SDL-04', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-SDL-05', 'ISO27001_2022', 'A.8.9'),
  ('WT-SDL-05', 'ISO27001_2022', 'A.8.27'),
  ('WT-SDL-05', 'ISO27001_2022', 'A.8.26'),
  ('WT-SDL-05', 'SOC2_TSC_2017', 'CC6.6'),
  ('WT-SDL-05', 'SOC2_TSC_2017', 'CC7.1'),
  ('WT-VUL-01', 'ISO27001_2022', 'A.8.8'),
  ('WT-VUL-01', 'ISO27001_2022', 'A.8.19'),
  ('WT-VUL-01', 'SOC2_TSC_2017', 'CC7.1'),
  ('WT-VUL-02', 'ISO27001_2022', 'A.8.29'),
  ('WT-VUL-02', 'ISO27001_2022', 'A.5.35'),
  ('WT-VUL-02', 'SOC2_TSC_2017', 'CC4.1'),
  ('WT-VUL-02', 'SOC2_TSC_2017', 'CC7.1'),
  ('WT-INC-01', 'ISO27001_2022', 'A.5.24'),
  ('WT-INC-01', 'ISO27001_2022', 'A.5.25'),
  ('WT-INC-01', 'ISO27001_2022', 'A.5.26'),
  ('WT-INC-01', 'ISO27001_2022', 'A.5.27'),
  ('WT-INC-01', 'ISO27001_2022', 'A.6.8'),
  ('WT-INC-01', 'SOC2_TSC_2017', 'CC7.3'),
  ('WT-INC-01', 'SOC2_TSC_2017', 'CC7.4'),
  ('WT-INC-01', 'SOC2_TSC_2017', 'CC7.5'),
  ('WT-BCD-01', 'ISO27001_2022', 'A.8.13'),
  ('WT-BCD-01', 'ISO27001_2022', 'A.8.14'),
  ('WT-BCD-01', 'ISO27001_2022', 'A.5.29'),
  ('WT-BCD-01', 'ISO27001_2022', 'A.5.30'),
  ('WT-BCD-01', 'SOC2_TSC_2017', 'A1.2'),
  ('WT-BCD-01', 'SOC2_TSC_2017', 'A1.3'),
  ('WT-BCD-01', 'SOC2_TSC_2017', 'CC9.1'),
  ('WT-VEN-01', 'ISO27001_2022', 'A.5.19'),
  ('WT-VEN-01', 'ISO27001_2022', 'A.5.20'),
  ('WT-VEN-01', 'ISO27001_2022', 'A.5.21'),
  ('WT-VEN-01', 'ISO27001_2022', 'A.5.22'),
  ('WT-VEN-01', 'ISO27001_2022', 'A.5.23'),
  ('WT-VEN-01', 'SOC2_TSC_2017', 'CC9.2'),
  ('WT-AST-01', 'ISO27001_2022', 'A.5.9'),
  ('WT-AST-01', 'ISO27001_2022', 'A.5.10'),
  ('WT-AST-01', 'ISO27001_2022', 'A.8.1'),
  ('WT-AST-01', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-AST-01', 'SOC2_TSC_2017', 'CC6.5'),
  ('WT-DAT-01', 'ISO27001_2022', 'A.5.12'),
  ('WT-DAT-01', 'ISO27001_2022', 'A.8.10'),
  ('WT-DAT-01', 'ISO27001_2022', 'A.5.33'),
  ('WT-DAT-01', 'SOC2_TSC_2017', 'C1.1'),
  ('WT-DAT-01', 'SOC2_TSC_2017', 'C1.2'),
  ('WT-DAT-02', 'ISO27001_2022', 'A.8.24'),
  ('WT-DAT-02', 'SOC2_TSC_2017', 'CC6.1'),
  ('WT-DAT-02', 'SOC2_TSC_2017', 'CC6.7'),
  ('WT-PRV-01', 'ISO27001_2022', 'A.5.34'),
  ('WT-PRV-01', 'ISO27001_2022', 'A.6.2'),
  ('WT-PRV-01', 'ISO27001_2022', 'A.5.31'),
  ('WT-PRV-01', 'SOC2_TSC_2017', 'CC2.3'),
  ('WT-PRV-01', 'SOC2_TSC_2017', 'C1.1'),
  ('WT-PPL-01', 'ISO27001_2022', 'A.6.3'),
  ('WT-PPL-01', 'ISO27001_2022', '7.2'),
  ('WT-PPL-01', 'ISO27001_2022', '7.3'),
  ('WT-PPL-01', 'SOC2_TSC_2017', 'CC1.4'),
  ('WT-PPL-01', 'SOC2_TSC_2017', 'CC2.2'),
  ('WT-PPL-02', 'ISO27001_2022', 'A.6.1'),
  ('WT-PPL-02', 'ISO27001_2022', 'A.6.2'),
  ('WT-PPL-02', 'ISO27001_2022', 'A.6.4'),
  ('WT-PPL-02', 'ISO27001_2022', 'A.6.6'),
  ('WT-PPL-02', 'SOC2_TSC_2017', 'CC1.1'),
  ('WT-PPL-02', 'SOC2_TSC_2017', 'CC1.4'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.7.1'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.7.2'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.7.7'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.8.1'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.8.7'),
  ('WT-PHY-01', 'ISO27001_2022', 'A.7.14'),
  ('WT-PHY-01', 'SOC2_TSC_2017', 'CC6.4'),
  ('WT-PHY-01', 'SOC2_TSC_2017', 'CC6.8'),
  ('WT-PHY-01', 'SOC2_TSC_2017', 'CC6.5'),
  ('WT-PAY-01', 'ISO27001_2022', 'A.5.3'),
  ('WT-PAY-01', 'SOC2_TSC_2017', 'PI1.3'),
  ('WT-PAY-01', 'SOC2_TSC_2017', 'CC6.3')
) as v(control_code, framework_key, ref)
join public.compliance_controls c on c.control_code = v.control_code
join public.compliance_frameworks f on f.framework_key = v.framework_key
join public.framework_requirements r on r.framework_id = f.id and r.ref = v.ref
on conflict (control_id, requirement_id) do nothing;

insert into public.corrective_actions (ref, source_type, source_ref, control_id, title, description, severity, status)
select v.ref, 'SECURITY_FINDING', v.source_ref, c.id, v.title, v.description, v.severity, v.status
from (values
  ('CA-F-01', 'F-01', 'WT-IAM-01', 'Server trusts an unverified session cookie', 'Server code takes identity from supabase.auth.getSession() and base64-decodes the access token without verifying its signature (auth-js documents that getSession() must not be trusted on the server). A hand-made auth cookie carrying role_key=SUPER_ADMIN would be accepted, and createDataClient() then hands that request a service-role client that bypasses RLS: full read/write of every employee, salary and activity record.

Where: src/lib/permissions/server.ts; src/lib/supabase/server.ts; src/lib/auth/jwt-claims.ts; src/app/page.tsx

Status at assessment: Fixed on branch: identity from auth.getClaims() (signature verified); role, permissions and status read live from the DB.', 'CRITICAL', 'IN_PROGRESS'),
  ('CA-F-02', 'F-02', 'WT-IAM-03', 'Service-role client used for every signed-in request', 'createDataClient() returns the service-role client for any signed-in user, so Row Level Security never applies to app traffic. Authorization rests entirely on per-action checks (mostly isSuperAdmin), and 16 other modules create service-role clients directly.

Where: src/lib/supabase/data.ts; src/lib/actions/*.ts; src/lib/queries/*.ts

Status at assessment: Partly mitigated on branch: caller must be a verified active employee and requests carry an actor header. Moving reads/writes to the RLS-bound client is backlog item B-05.', 'HIGH', 'IN_PROGRESS'),
  ('CA-F-03', 'F-03', 'WT-IAM-03', 'Staff roles over-privileged in the database', 'Migration 0009 made AGENT / DATABASE / EMAIL_MARKETING ''admin-like'' in RLS and the seed grants them salary.view, attendance.manage, activity.manage, leave.approve and policies.manage. Using the public anon key plus their own login, any agent can query every employee''s salary records and payslips, all employee rows including salary, everyone''s browsing domains, and edit attendance including their own. At the app layer staffHasPermission() also granted staff every permission except two.

Where: supabase/migrations/0009_staff_roles.sql; 0011_user_activities.sql; supabase/seed.sql; src/lib/permissions/roles.ts

Status at assessment: Fixed on branch (0022 + seed + roles.ts).', 'HIGH', 'IN_PROGRESS'),
  ('CA-F-04', 'F-04', 'WT-IAM-04', 'Self-administration and privilege escalation', 'Anyone holding employees.manage (HR by default) can insert an employee_roles row that makes them SUPER_ADMIN, and can update their own employee row (salary, status). attendance.manage, leave.approve and salary.manage holders can act on their own records.

Where: supabase/migrations/0005_rls_policies.sql

Status at assessment: Fixed on branch: Super Admin only for role changes, no self-targeting policies, plus a trigger that blocks self role changes.', 'HIGH', 'IN_PROGRESS'),
  ('CA-F-05', 'F-05', 'WT-LOG-01', 'Audit trail unattributed, incomplete and unprotected', 'The audit trigger records actor = current_employee_id(), which is NULL for service-role writes, so app changes have no actor. Attendance corrections, role definitions and work settings were not audited. The table had no tamper protection beyond RLS (service role could update or delete), and the audit log viewer page redirects to the dashboard.

Where: supabase/migrations/0004_ops_tables.sql; 0007_grants.sql; src/app/(admin)/admin/audit-logs/page.tsx

Status at assessment: Fixed on branch: actor header, request id, hash chain, append-only triggers, more tables audited. Viewer page and an external log sink are backlog item B-06.', 'HIGH', 'IN_PROGRESS'),
  ('CA-F-06', 'F-06', 'WT-IAM-05', 'Revoked and terminated users keep access until token expiry', 'Role, permissions and employment status were taken from JWT claims minted at sign-in. RLS never checked employment status and server actions did not either, so a blocked or terminated employee (or a demoted admin) kept access until the access token expired.

Where: supabase/migrations/0006_auth_hook.sql; 0005_rls_policies.sql; src/lib/permissions/server.ts

Status at assessment: Fixed on branch: live DB lookups in the app and in RLS helpers; blocked employees resolve to no identity.', 'HIGH', 'IN_PROGRESS'),
  ('CA-F-07', 'F-07', 'WT-IAM-04', 'No segregation of duties for payroll, leave and attendance', 'One Super Admin sets up salaries, edits attendance, approves leave and the cron job generates and releases payslips on the 10th with no preparer/approver split or release approval.

Where: src/app/(admin)/admin/payroll/actions.ts; src/app/api/cron/salary-slips/route.ts; vercel.json

Status at assessment: Open. Needs a maker-checker payroll run or an approved SoD exception with compensating review (backlog B-07).', 'HIGH', 'OPEN'),
  ('CA-F-08', 'F-08', 'WT-SDL-01', 'Source code repository is public', 'The GitHub repository can be cloned without authentication, exposing the full schema, RLS logic and business rules. Commits go straight to main from a single personal account with no pull-request review.

Where: github.com/quoreb2b2017-coder/quore-agent-crm

Status at assessment: Open. Make the repository private, move it under an organization account, require MFA and branch protection.', 'HIGH', 'OPEN'),
  ('CA-F-09', 'F-09', 'WT-IAM-02', 'No MFA for privileged accounts', 'Supabase Auth supports TOTP factors but nothing enrols or enforces them, including for Super Admin.

Where: src/app/(auth)/login/page.tsx

Status at assessment: Open. Automated check added (IAM-02) so the gap shows in control tests.', 'MEDIUM', 'OPEN'),
  ('CA-F-10', 'F-10', 'WT-SDL-02', 'No CI, automated tests or dependency/secret scanning', 'No workflow runs lint, type checks, tests or scanners before deploy; there were no tests in the repository.

Where: (repository root)

Status at assessment: Fixed on branch: GitHub Actions workflow and SQL security acceptance tests. Requires branch protection to make it a gate.', 'MEDIUM', 'IN_PROGRESS'),
  ('CA-F-11', 'F-11', 'WT-IAM-07', 'Service-role key reused as the socket secret', 'When SOCKET_SECRET is unset, both the Next app and the socket server use the Supabase service-role key as the bearer token between hosts, spreading the most privileged secret to a second service.

Where: server/socket-server.ts; src/lib/env.ts

Status at assessment: Fixed on branch: dedicated SOCKET_SECRET required.', 'MEDIUM', 'IN_PROGRESS'),
  ('CA-F-12', 'F-12', 'WT-IAM-03', 'Permission helper exposed to all users', 'get_employee_permissions(uuid) is executable by any authenticated user, so anyone can enumerate any employee''s permissions; JWT helpers were granted to anon.

Where: supabase/migrations/0005_rls_policies.sql; 0008_jwt_claim_fallback.sql

Status at assessment: Fixed on branch.', 'MEDIUM', 'IN_PROGRESS'),
  ('CA-F-13', 'F-13', 'WT-SDL-05', 'No HTTP security headers', 'next.config.ts sets no HSTS, frame, content-type or referrer headers; no Content-Security-Policy.

Where: next.config.ts

Status at assessment: Fixed on branch except CSP (backlog B-14).', 'MEDIUM', 'IN_PROGRESS'),
  ('CA-F-14', 'F-14', 'WT-GOV-06', 'Employee monitoring lacks documented purpose, notice and retention', 'WorkTrack records browsing domains (Chrome extension), mouse/keyboard-based idle detection that drives auto-logout and productivity figures, washroom visits and break timing. There is no recorded purpose, employee notice, retention limit for user_activities, or privacy assessment against India''s DPDP Act 2023. Chat messages and files are hard-deleted after 7 days, with no legal-hold path.

Where: supabase/migrations/0011, 0016, 0019; src/components/layout/session-presence.tsx

Status at assessment: Open. Needs a monitoring notice, purpose register and retention schedule (backlog B-09).', 'MEDIUM', 'OPEN'),
  ('CA-F-15', 'F-15', 'WT-GOV-01', 'Scope and legal entity are undefined', 'Payslips are issued by ''Quore B2b Private Limited'' (Pune) while the compliance programme names Quore B2B Marketing LLC (Dallas). Which entity, locations and services are in the ISMS and SOC 2 scope is not recorded.

Where: .env.local.example; vercel.env.example

Status at assessment: Open. Management decision required (backlog B-01).', 'MEDIUM', 'OPEN'),
  ('CA-F-17', 'F-17', 'WT-VUL-01', 'Next.js version with published remote-code-execution advisories', 'package.json pins next 16.3.2. npm audit reports critical advisories for 16.0.0 to 16.4.0, including unauthenticated remote code execution in the image optimization API and server-side request forgery, plus high-severity issues in transitive packages pulled in by the shadcn CLI. Nothing monitors dependencies today.

Where: package.json; package-lock.json

Status at assessment: Fixed on branch: next and eslint-config-next 16.4.3, npm audit fix; 3 low-severity advisories remain (deepmerge via shadcn). CI now fails on high or critical.', 'CRITICAL', 'IN_PROGRESS'),
  ('CA-F-16', 'F-16', 'WT-SDL-04', 'Backup, restore and environment separation not evidenced', 'Nothing in the repository shows Supabase plan, point-in-time recovery, restore tests, a staging project or separate production credentials.

Where: (infrastructure)

Status at assessment: Open. Confirm the Supabase plan and PITR, run and record a restore test.', 'LOW', 'OPEN')
) as v(ref, source_ref, control_code, title, description, severity, status)
left join public.compliance_controls c on c.control_code = v.control_code
on conflict (ref) do nothing;

insert into public.soa_entries (requirement_id)
select r.id
from public.framework_requirements r
join public.compliance_frameworks f on f.id = r.framework_id
where f.framework_key = 'ISO27001_2022' and r.ref like 'A.%'
on conflict (requirement_id) do nothing;

notify pgrst, 'reload schema';
