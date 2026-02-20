// ============================================
// Regulatory Assessment Framework Definitions
// ============================================
// Contains requirements for FCA and related regulatory
// frameworks used in guided compliance assessments.

export interface RequirementDef {
  requirementCode: string;
  title: string;
  description: string;
  guidance: string;
  evidenceHint: string;
}

export interface DomainDef {
  code: string;
  name: string;
  requirements: RequirementDef[];
}

export interface FrameworkDef {
  slug: string;
  name: string;
  shortName: string;
  description: string;
  domains: DomainDef[];
}

// ============================================
// 1. FCA Operational Resilience (PS21/3)
// ============================================
const fcaOperationalResilience: FrameworkDef = {
  slug: 'fca-operational-resilience',
  name: 'FCA Operational Resilience Framework (PS21/3)',
  shortName: 'FCA Op Res',
  description: 'The FCA requires regulated firms to identify important business services, set impact tolerances, and demonstrate the ability to remain within those tolerances during severe-but-plausible disruption scenarios.',
  domains: [
    {
      code: 'IBS',
      name: 'Important Business Services',
      requirements: [
        {
          requirementCode: 'IBS-01',
          title: 'Identification of Important Business Services',
          description: 'The firm must identify its important business services (IBS) — services provided to external clients or market participants whose disruption could cause intolerable harm.',
          guidance: '1. Request the firm\'s documented list of Important Business Services.\n2. Verify each IBS is defined from an external perspective (i.e., from the client/end-user viewpoint, not internal process names).\n3. Check that the identification considers: harm to consumers, harm to market integrity, and harm to the firm\'s safety and soundness.\n4. Confirm the board has formally approved the list of IBS.\n5. Assess whether the list is comprehensive — consider payment processing, e-money issuance, customer onboarding, transaction monitoring, and settlement services for an EMI.',
          evidenceHint: 'Board minutes approving IBS list; IBS register/inventory document; methodology document for IBS identification.',
        },
        {
          requirementCode: 'IBS-02',
          title: 'IBS Mapping to External Consumers',
          description: 'Each IBS must be clearly mapped to the external consumers, clients, or market participants who depend on it.',
          guidance: '1. For each IBS, verify there is a clear description of WHO receives the service.\n2. Check that customer segments are identified (e.g., individual e-money holders, corporate clients, merchant partners).\n3. Verify the volume/value of transactions or customers affected is documented.\n4. Confirm that any FCA-regulated activities within the IBS are identified.',
          evidenceHint: 'IBS-to-customer mapping document; service catalogue with customer segments; transaction volume data per IBS.',
        },
        {
          requirementCode: 'IBS-03',
          title: 'IBS Dependency Mapping',
          description: 'The firm must map the people, processes, technology, facilities, and information that support the delivery of each IBS.',
          guidance: '1. For each IBS, request the dependency/resource map.\n2. Verify the map covers: technology systems (applications, infrastructure, cloud services), people (roles, teams, key-person dependencies), data (databases, data flows), third-party suppliers, and physical facilities.\n3. Check for single points of failure.\n4. Verify substitutability has been assessed for critical resources.\n5. Confirm the mapping is kept up to date (ask about the review cycle).',
          evidenceHint: 'Dependency maps/diagrams per IBS; technology architecture diagrams; third-party register linked to IBS; RACI matrices.',
        },
        {
          requirementCode: 'IBS-04',
          title: 'Board Governance of IBS',
          description: 'The board must have oversight of IBS identification and maintain accountability for operational resilience.',
          guidance: '1. Verify that the board (or a board-delegated committee) has formally approved the IBS list.\n2. Check that there is a named Senior Management Function (SMF) holder with responsibility for operational resilience.\n3. Confirm that operational resilience is a standing agenda item at board/committee meetings.\n4. Review board papers for evidence of challenge and engagement on IBS matters.',
          evidenceHint: 'Board minutes; committee terms of reference; SMF responsibility map; board reporting pack on operational resilience.',
        },
      ],
    },
    {
      code: 'IT',
      name: 'Impact Tolerances',
      requirements: [
        {
          requirementCode: 'IT-01',
          title: 'Setting Impact Tolerances',
          description: 'The firm must set impact tolerances for each IBS, expressed as the maximum tolerable level of disruption.',
          guidance: '1. For each IBS, request the defined impact tolerance.\n2. Verify impact tolerances are expressed as specific, measurable metrics (e.g., maximum duration of disruption in hours, maximum number of affected customers, maximum financial loss).\n3. Check that tolerances reflect the point beyond which disruption would cause INTOLERABLE harm to consumers or market integrity.\n4. Confirm tolerances are set at the IBS level, not the system or process level.\n5. Verify tolerances consider both duration and extent of impact.',
          evidenceHint: 'Impact tolerance register/document; board-approved tolerance levels; methodology for setting tolerances.',
        },
        {
          requirementCode: 'IT-02',
          title: 'Impact Tolerance Metrics & Measurement',
          description: 'Impact tolerances must be quantified with clear metrics that enable objective measurement.',
          guidance: '1. Review each impact tolerance for specificity — vague statements like "minimal disruption" are insufficient.\n2. Verify metrics include at least: maximum time to recover (e.g., 4 hours), and where relevant: customer impact numbers, transaction value thresholds.\n3. Check that there are monitoring capabilities to detect when a disruption approaches or breaches tolerances.\n4. Verify that the firm can measure actual disruption against stated tolerances in real-time or near-real-time.',
          evidenceHint: 'Tolerance metric definitions; monitoring dashboards; KPI/KRI reports for IBS availability.',
        },
        {
          requirementCode: 'IT-03',
          title: 'Board Approval of Impact Tolerances',
          description: 'Impact tolerances must be approved by the board or an appropriately delegated committee.',
          guidance: '1. Verify that each impact tolerance has been formally approved by the board.\n2. Check that the board was presented with the rationale and methodology.\n3. Confirm that the board challenged the tolerances and considered whether they are appropriately calibrated.\n4. Verify there is a defined review cycle (at least annual) for reassessing tolerances.',
          evidenceHint: 'Board minutes showing tolerance approval; board papers with tolerance proposals; annual review schedule.',
        },
        {
          requirementCode: 'IT-04',
          title: 'Regulatory Notification Thresholds',
          description: 'The firm should have defined thresholds for notifying the FCA of disruptions that approach or breach impact tolerances.',
          guidance: '1. Check if the firm has defined internal escalation thresholds (e.g., at 50% of tolerance, at 75%, at breach).\n2. Verify there is a documented process for FCA notification.\n3. Confirm the firm knows the FCA notification channels and timelines.\n4. Check that notification procedures have been tested or rehearsed.',
          evidenceHint: 'Escalation matrix; FCA notification procedure; incident communication plan; contact details for FCA supervision team.',
        },
      ],
    },
    {
      code: 'SCN',
      name: 'Scenario Testing',
      requirements: [
        {
          requirementCode: 'SCN-01',
          title: 'Severe but Plausible Scenario Design',
          description: 'The firm must design severe but plausible disruption scenarios to test its ability to remain within impact tolerances.',
          guidance: '1. Request the firm\'s scenario testing programme/plan.\n2. Verify scenarios are "severe but plausible" — not worst-case, but realistically challenging.\n3. Check that scenarios cover a range of disruption types: cyber attack, IT system failure, third-party failure, loss of key staff, loss of premises, data corruption.\n4. Verify scenarios are designed to test EACH important business service.\n5. Confirm scenarios consider cascading failures and correlated disruptions.',
          evidenceHint: 'Scenario testing plan; scenario descriptions; risk assessment inputs to scenario design.',
        },
        {
          requirementCode: 'SCN-02',
          title: 'Scenario Testing Execution',
          description: 'The firm must execute scenario tests and document results including whether it remained within impact tolerances.',
          guidance: '1. Request evidence of scenario tests actually conducted (not just planned).\n2. For each test, verify: date conducted, scenario used, IBS tested, participants involved.\n3. Check whether the test measured actual performance against impact tolerances.\n4. Verify the test results clearly state whether the firm WOULD have remained within tolerances.\n5. Check that tests involved relevant departments (not just IT).',
          evidenceHint: 'Test execution reports; test result summaries; attendance records; screenshots/logs from test exercises.',
        },
        {
          requirementCode: 'SCN-03',
          title: 'Lessons Learned & Remediation',
          description: 'The firm must capture lessons learned from scenario testing and remediate identified vulnerabilities.',
          guidance: '1. For each scenario test, check if a lessons-learned exercise was conducted.\n2. Verify that identified vulnerabilities are documented in a remediation tracker.\n3. Check that remediation actions have owners, target dates, and progress tracking.\n4. Confirm that critical vulnerabilities (those that could lead to tolerance breaches) are prioritised.\n5. Verify that previous remediation actions have been completed on time.',
          evidenceHint: 'Lessons learned reports; remediation tracker/register; action completion evidence; management sign-off on remediation.',
        },
        {
          requirementCode: 'SCN-04',
          title: 'Testing Frequency & Programme',
          description: 'Scenario testing should be conducted regularly and the programme should evolve over time.',
          guidance: '1. Verify there is a defined testing schedule (the FCA expects at least annual testing for each IBS).\n2. Check that the firm varies its scenarios over time (not repeating the same test).\n3. Confirm that the testing programme is reviewed and updated based on: new threats, changes to IBS, previous test results.\n4. Verify that the board receives reports on testing outcomes.',
          evidenceHint: 'Annual testing schedule; multi-year testing programme; board reports on testing outcomes.',
        },
      ],
    },
    {
      code: 'COM',
      name: 'Communications Strategy',
      requirements: [
        {
          requirementCode: 'COM-01',
          title: 'Internal Communication Plans',
          description: 'The firm must have internal communication plans for operational disruptions.',
          guidance: '1. Verify there is a documented internal communication plan for disruptions.\n2. Check it covers: who needs to be notified, escalation paths, communication channels (including backup channels), and roles/responsibilities.\n3. Confirm the plan includes crisis management team activation procedures.\n4. Verify that staff know their roles during disruption.',
          evidenceHint: 'Internal communication plan; escalation matrices; crisis management team charter; staff awareness evidence.',
        },
        {
          requirementCode: 'COM-02',
          title: 'External Communication Plans',
          description: 'The firm must have plans to communicate with customers, regulators, and other stakeholders during disruptions.',
          guidance: '1. Check that there are pre-drafted customer communications for common disruption scenarios.\n2. Verify the plan covers communication to: customers, the FCA, partner banks/PSPs, and other relevant stakeholders.\n3. Confirm communication timelines are defined (e.g., customer notification within X hours).\n4. Check that alternative communication channels are identified if primary channels are affected.',
          evidenceHint: 'External communication plan; template communications; FCA notification procedures; customer communication channel inventory.',
        },
      ],
    },
    {
      code: 'GOV',
      name: 'Governance & Self-Assessment',
      requirements: [
        {
          requirementCode: 'GOV-01',
          title: 'Self-Assessment Document',
          description: 'The firm must maintain a written self-assessment of its operational resilience.',
          guidance: '1. Request the firm\'s operational resilience self-assessment document.\n2. Verify it covers: IBS identification, impact tolerances, mapping, scenario testing results, and identified vulnerabilities.\n3. Check that it is updated at least annually.\n4. Confirm it honestly assesses where the firm may not yet be able to remain within tolerances.\n5. Verify the self-assessment has been reviewed by senior management or the board.',
          evidenceHint: 'Self-assessment document; board review/sign-off; annual review evidence.',
        },
        {
          requirementCode: 'GOV-02',
          title: 'Ongoing Monitoring & Reporting',
          description: 'The firm must have ongoing monitoring of its operational resilience posture.',
          guidance: '1. Verify there are operational resilience KPIs/KRIs being tracked.\n2. Check that these metrics are reported to the board or a senior committee regularly.\n3. Confirm that changes to the firm\'s risk profile (new systems, new third parties, organisational changes) trigger reassessment.\n4. Verify there is a clear process for updating IBS, tolerances, and mappings when the business changes.',
          evidenceHint: 'KPI/KRI dashboard; board reporting packs; change management procedures for operational resilience.',
        },
      ],
    },
  ],
};

// ============================================
// 2. FCA EMRs/PSRs Safeguarding
// ============================================
const fcaSafeguarding: FrameworkDef = {
  slug: 'fca-safeguarding',
  name: 'FCA EMRs & PSRs Safeguarding Requirements',
  shortName: 'FCA Safeguarding',
  description: 'EMIs must safeguard customer funds in accordance with the Electronic Money Regulations 2011 (EMRs) and Payment Services Regulations 2017 (PSRs). This includes segregation, reconciliation, record-keeping, and wind-down planning.',
  domains: [
    {
      code: 'SAF',
      name: 'Safeguarding Method & Arrangements',
      requirements: [
        {
          requirementCode: 'SAF-01',
          title: 'Safeguarding Method Selection',
          description: 'The firm must have chosen a safeguarding method: either the segregation method or the insurance/guarantee method.',
          guidance: '1. Confirm which safeguarding method the firm uses (most EMIs use the segregation method).\n2. If segregation: verify funds are held in designated safeguarding accounts separate from the firm\'s own funds.\n3. If insurance/guarantee: request the insurance policy or guarantee document and verify it covers the full amount of relevant funds.\n4. Check that the method has been applied consistently since authorisation.',
          evidenceHint: 'Safeguarding policy document; bank account confirmation letters showing designated accounts; insurance policy (if applicable).',
        },
        {
          requirementCode: 'SAF-02',
          title: 'Relevant Funds Identification',
          description: 'The firm must correctly identify all funds that require safeguarding ("relevant funds").',
          guidance: '1. Verify the firm\'s definition of relevant funds aligns with Regulation 21 EMR 2011.\n2. Check that relevant funds include: all e-money issued, funds received in exchange for e-money, and funds in transit.\n3. Verify the firm correctly handles mixed payment accounts (own funds vs customer funds).\n4. Confirm that revenue/fees are swept out of safeguarding accounts in a timely manner (by end of next business day after becoming due).\n5. Check treatment of funds during settlement cycles.',
          evidenceHint: 'Relevant funds calculation methodology; safeguarding reconciliation reports; fee sweep procedures documentation.',
        },
        {
          requirementCode: 'SAF-03',
          title: 'Safeguarding Account Designation',
          description: 'Safeguarding accounts must be properly designated and held at approved institutions.',
          guidance: '1. Verify safeguarding accounts are held at authorised credit institutions (EEA banks or UK banks).\n2. Check that accounts are properly designated/titled to indicate they hold safeguarded funds.\n3. Verify the firm has obtained written acknowledgement from the bank that the funds belong to the firm\'s customers.\n4. Check for diversification of safeguarding accounts across multiple institutions to reduce concentration risk.\n5. Confirm the bank is aware these are client money accounts and cannot exercise set-off rights.',
          evidenceHint: 'Bank account opening documentation; designation letters; bank acknowledgement letters; list of safeguarding banks with balances.',
        },
        {
          requirementCode: 'SAF-04',
          title: 'Organisational Safeguarding Arrangements',
          description: 'The firm must have adequate organisational arrangements to minimise the risk of loss or diminution of safeguarded funds.',
          guidance: '1. Verify there are documented procedures for managing safeguarding accounts.\n2. Check that access to safeguarding accounts is restricted and controlled.\n3. Verify dual-authorisation is required for transfers from safeguarding accounts.\n4. Confirm there are procedures to prevent commingling of own funds with customer funds.\n5. Check that the firm monitors counterparty risk of the banks holding safeguarded funds.',
          evidenceHint: 'Safeguarding procedures manual; access control lists for safeguarding accounts; authorisation matrix; counterparty risk assessment.',
        },
      ],
    },
    {
      code: 'REC',
      name: 'Reconciliation & Record-Keeping',
      requirements: [
        {
          requirementCode: 'REC-01',
          title: 'Daily Internal Reconciliation',
          description: 'The firm must perform daily internal reconciliation of relevant funds against its internal records.',
          guidance: '1. Request evidence of daily reconciliation being performed.\n2. Verify the reconciliation compares: total e-money outstanding (per internal ledger) against total funds in safeguarding accounts.\n3. Check that reconciliation is performed by end of each business day (T+0 or T+1 at latest).\n4. Verify the reconciliation process is documented step-by-step.\n5. Check that any discrepancies are identified, investigated, and resolved promptly.\n6. Confirm that shortfalls are topped up from the firm\'s own funds without delay.',
          evidenceHint: 'Daily reconciliation reports (sample of last 30 days); reconciliation procedures; discrepancy log; shortfall top-up records.',
        },
        {
          requirementCode: 'REC-02',
          title: 'External Reconciliation',
          description: 'The firm must reconcile its internal records against external bank statements.',
          guidance: '1. Verify the firm reconciles its internal safeguarding account records against bank statements.\n2. Check the frequency — at minimum this should be daily.\n3. Verify that unreconciled items are investigated and aged.\n4. Check that the firm has automated or semi-automated reconciliation tooling.\n5. Confirm that reconciliation breaks are escalated appropriately.',
          evidenceHint: 'Bank reconciliation reports; aged unreconciled items report; reconciliation system screenshots; escalation procedures.',
        },
        {
          requirementCode: 'REC-03',
          title: 'Record-Keeping Requirements',
          description: 'The firm must maintain accurate and up-to-date records of safeguarded funds.',
          guidance: '1. Verify that records clearly distinguish safeguarded funds from the firm\'s own funds at all times.\n2. Check that records are maintained for the required retention period (5 years after the relationship ends).\n3. Verify that the records are sufficient to determine each customer\'s claim to the safeguarded funds.\n4. Check that the record-keeping system has appropriate backup and recovery mechanisms.\n5. Confirm that an external auditor reviews safeguarding arrangements annually.',
          evidenceHint: 'Record-keeping policy; data retention schedule; annual safeguarding audit report; system backup procedures.',
        },
        {
          requirementCode: 'REC-04',
          title: 'Reconciliation Discrepancy Resolution',
          description: 'The firm must have procedures to promptly investigate and resolve reconciliation discrepancies.',
          guidance: '1. Request the discrepancy resolution procedure document.\n2. Verify that discrepancies are classified by type and severity.\n3. Check that resolution timelines are defined (e.g., minor discrepancies within 24 hours, significant within same day).\n4. Verify that persistent or large discrepancies are escalated to senior management.\n5. Check that the root cause of discrepancies is analysed to prevent recurrence.',
          evidenceHint: 'Discrepancy resolution procedures; discrepancy log with resolution timestamps; escalation records; root cause analysis reports.',
        },
      ],
    },
    {
      code: 'WDP',
      name: 'Wind-Down Planning',
      requirements: [
        {
          requirementCode: 'WDP-01',
          title: 'Wind-Down Plan Existence & Adequacy',
          description: 'The firm must maintain a credible and up-to-date wind-down plan.',
          guidance: '1. Request the firm\'s wind-down plan.\n2. Verify it covers: triggers for wind-down, decision-making authority, step-by-step process, estimated timeline, and resource requirements.\n3. Check that the plan addresses the orderly return of all safeguarded funds to customers.\n4. Verify the estimated cost of wind-down and confirm the firm holds adequate resources to fund it.\n5. Check that the plan has been reviewed and approved by the board within the last 12 months.',
          evidenceHint: 'Wind-down plan document; board approval minutes; wind-down cost estimate; financial resources assessment.',
        },
        {
          requirementCode: 'WDP-02',
          title: 'Wind-Down Trigger Events',
          description: 'The firm must define clear trigger events that would initiate wind-down procedures.',
          guidance: '1. Check that the plan defines specific quantitative and qualitative triggers.\n2. Verify triggers include: capital falling below threshold, inability to meet safeguarding requirements, loss of key banking relationships, regulatory intervention.\n3. Confirm that monitoring is in place to detect approaching trigger thresholds.\n4. Verify escalation procedures when triggers are approached (early warning indicators).',
          evidenceHint: 'Wind-down trigger definitions; monitoring dashboard; early warning indicator reports; escalation procedures.',
        },
        {
          requirementCode: 'WDP-03',
          title: 'Customer Fund Return Procedures',
          description: 'The firm must have detailed procedures for returning customer funds during wind-down.',
          guidance: '1. Verify the plan includes a step-by-step process for identifying all customer balances.\n2. Check that the plan addresses: customers who cannot be contacted, disputed balances, and funds in transit.\n3. Verify the communication plan to customers during wind-down.\n4. Check that the plan considers regulatory requirements for fund return timelines.\n5. Confirm that the plan addresses any contractual obligations to third parties.',
          evidenceHint: 'Customer fund return procedures; communication templates; unclaimed funds process; third-party contract review.',
        },
        {
          requirementCode: 'WDP-04',
          title: 'Wind-Down Resources & Capabilities',
          description: 'The firm must maintain adequate resources to execute its wind-down plan.',
          guidance: '1. Verify the firm has estimated the financial cost of wind-down (staff costs, IT, legal, etc.).\n2. Check that these resources are accessible and not dependent on the business continuing to operate.\n3. Verify that key personnel have been identified for wind-down execution.\n4. Check whether the firm has considered outsourcing arrangements for wind-down support.\n5. Confirm that the firm\'s own capital/liquidity assessment accounts for wind-down costs.',
          evidenceHint: 'Wind-down cost model; capital adequacy assessment; key personnel list; outsourcing arrangements documentation.',
        },
      ],
    },
    {
      code: 'SGV',
      name: 'Safeguarding Governance',
      requirements: [
        {
          requirementCode: 'SGV-01',
          title: 'Safeguarding Policy & Procedures',
          description: 'The firm must maintain a comprehensive safeguarding policy approved by the board.',
          guidance: '1. Request the firm\'s safeguarding policy.\n2. Verify it covers: method selection rationale, account management procedures, reconciliation processes, record-keeping, and governance.\n3. Check that the policy is board-approved and has a defined review cycle.\n4. Verify there is a named individual (MLRO or Compliance Officer) responsible for safeguarding oversight.\n5. Check that the policy references the relevant regulatory requirements (EMR 2011, Approach Document).',
          evidenceHint: 'Safeguarding policy; board approval evidence; responsibility assignment; regulatory reference mapping.',
        },
        {
          requirementCode: 'SGV-02',
          title: 'Safeguarding Compliance Monitoring',
          description: 'The firm must have ongoing monitoring to ensure compliance with safeguarding requirements.',
          guidance: '1. Verify there is a compliance monitoring programme that covers safeguarding.\n2. Check for regular (at least quarterly) compliance reviews of safeguarding arrangements.\n3. Verify that the firm conducts or commissions an annual safeguarding audit.\n4. Check that findings from monitoring and audits are tracked and remediated.\n5. Confirm that the board receives regular reports on safeguarding compliance.',
          evidenceHint: 'Compliance monitoring plan; quarterly review reports; annual safeguarding audit report; remediation tracker; board reports.',
        },
        {
          requirementCode: 'SGV-03',
          title: 'FCA Regulatory Reporting',
          description: 'The firm must meet its FCA reporting obligations regarding safeguarding.',
          guidance: '1. Verify the firm submits required FCA returns on time (e.g., FSA038 or equivalent safeguarding return).\n2. Check that the data submitted is accurate and reconciles to internal records.\n3. Verify the firm has procedures for notifying the FCA of any material safeguarding issues.\n4. Check awareness of REP018 reporting requirements related to safeguarding risks.',
          evidenceHint: 'FCA return submission records; FSA038 returns; notification procedures; REP018 preparation documentation.',
        },
        {
          requirementCode: 'SGV-04',
          title: 'Staff Training on Safeguarding',
          description: 'Relevant staff must be trained on safeguarding requirements and procedures.',
          guidance: '1. Verify that staff involved in safeguarding operations have received specific training.\n2. Check training covers: regulatory requirements, firm\'s procedures, reconciliation processes, and escalation.\n3. Verify training is refreshed at least annually.\n4. Check that new joiners receive safeguarding training as part of induction.\n5. Confirm training records are maintained.',
          evidenceHint: 'Training materials; training attendance records; training schedule; competency assessments.',
        },
      ],
    },
  ],
};

// ============================================
// 3. FCA REP018 (EBA ICT & Security Risk)
// ============================================
const fcaRep018: FrameworkDef = {
  slug: 'fca-rep018',
  name: 'FCA REP018 — Operational & Security Risk Assessment',
  shortName: 'REP018',
  description: 'Under PSR Regulation 98(2), UK PSPs must submit an annual operational and security risk assessment to the FCA. This must be aligned with the EBA Guidelines on ICT and security risk management (EBA/GL/2017/17) and include assessment of mitigation measures and findings from the most recent IT security audit.',
  domains: [
    {
      code: 'GOV',
      name: 'ICT Governance & Strategy',
      requirements: [
        {
          requirementCode: 'GOV-01',
          title: 'ICT Strategy & Framework',
          description: 'The firm must have an ICT strategy aligned with its business strategy and a governance framework for ICT risk management.',
          guidance: '1. Request the firm\'s ICT strategy document.\n2. Verify it is aligned with the overall business strategy and approved by the management body.\n3. Check that it covers: current IT landscape, target architecture, investment priorities, and technology lifecycle management.\n4. Verify there is a defined ICT governance framework with clear roles and responsibilities.\n5. Check that the strategy addresses emerging risks (cloud, AI, API dependencies).',
          evidenceHint: 'ICT strategy document; governance framework document; board/committee approval minutes; org chart for IT/security functions.',
        },
        {
          requirementCode: 'GOV-02',
          title: 'ICT Risk Management Roles & Responsibilities',
          description: 'Clear roles and responsibilities for ICT risk management must be defined and assigned.',
          guidance: '1. Verify there is a CISO or equivalent role with responsibility for information security.\n2. Check that ICT risk management responsibilities are documented (RACI matrix or equivalent).\n3. Verify the three lines of defence model is applied to ICT risk (1st line: IT operations, 2nd line: risk/compliance, 3rd line: internal audit).\n4. Confirm that ICT risk is represented at the management body/board level.\n5. Check that responsibilities include third-party ICT risk management.',
          evidenceHint: 'RACI matrix; job descriptions for key ICT roles; three lines of defence documentation; committee terms of reference.',
        },
        {
          requirementCode: 'GOV-03',
          title: 'Board Reporting on ICT Risk',
          description: 'The management body must receive regular reports on ICT risk posture and incidents.',
          guidance: '1. Verify that ICT/security risk is reported to the board or a board committee at least quarterly.\n2. Check that reports cover: risk posture, incident summary, audit findings, key risks, and remediation progress.\n3. Verify that reports use metrics/KPIs that are understandable to non-technical board members.\n4. Check that the board has sufficient expertise or access to expertise to challenge ICT risk reports.\n5. Review sample board reports for adequacy.',
          evidenceHint: 'Board/committee meeting minutes; ICT risk reports; KPI dashboards; board member skills assessment.',
        },
        {
          requirementCode: 'GOV-04',
          title: 'ICT Budget & Resources',
          description: 'The firm must allocate adequate budget and resources to ICT and security.',
          guidance: '1. Verify that there is a dedicated ICT/security budget.\n2. Check that the budget is proportionate to the firm\'s risk profile and business complexity.\n3. Verify that the budget covers: ongoing operations, security tools, staff training, and investment in improvements.\n4. Check whether resource constraints have been identified as a risk and escalated.\n5. Confirm that the management body has approved the ICT budget.',
          evidenceHint: 'ICT budget documentation; resource allocation plans; budget approval records; risk register entries for resource constraints.',
        },
      ],
    },
    {
      code: 'RMF',
      name: 'ICT Risk Management Framework',
      requirements: [
        {
          requirementCode: 'RMF-01',
          title: 'ICT Risk Identification & Assessment',
          description: 'The firm must have a systematic process for identifying and assessing ICT risks.',
          guidance: '1. Verify there is a documented ICT risk assessment methodology.\n2. Check that it aligns with the firm\'s overall risk management framework.\n3. Verify that ICT risks are identified through: asset inventory review, threat analysis, vulnerability assessments, and incident analysis.\n4. Check that risk assessments are performed at least annually and when significant changes occur.\n5. Verify that the risk assessment considers: confidentiality, integrity, availability, and authenticity of data.',
          evidenceHint: 'ICT risk assessment methodology; risk register (ICT section); threat assessment reports; vulnerability scan results.',
        },
        {
          requirementCode: 'RMF-02',
          title: 'ICT Risk Appetite & Tolerance',
          description: 'The firm must define its ICT risk appetite and tolerance levels.',
          guidance: '1. Verify that ICT risk appetite is defined and documented.\n2. Check that it is approved by the management body.\n3. Verify that risk tolerance levels are set for key ICT risk categories.\n4. Check that there are KRIs (Key Risk Indicators) to monitor whether the firm is operating within appetite.\n5. Confirm that breaches of risk appetite trigger escalation and remediation.',
          evidenceHint: 'Risk appetite statement (ICT section); KRI definitions and thresholds; breach escalation procedures; management body approval.',
        },
        {
          requirementCode: 'RMF-03',
          title: 'ICT Risk Register',
          description: 'The firm must maintain an ICT risk register with identified risks, controls, and treatment plans.',
          guidance: '1. Request the ICT risk register.\n2. Verify it contains: risk description, risk owner, likelihood, impact, inherent risk rating, controls, residual risk rating, and treatment plans.\n3. Check that risks are regularly reviewed and updated (at least quarterly).\n4. Verify that the register covers: cyber threats, system failures, data loss, third-party failures, and staff-related risks.\n5. Check that treatment plans have defined timelines and responsible owners.',
          evidenceHint: 'ICT risk register; risk review meeting minutes; treatment plan progress reports.',
        },
        {
          requirementCode: 'RMF-04',
          title: 'ICT Risk Mitigation & Controls',
          description: 'The firm must implement appropriate controls to mitigate identified ICT risks.',
          guidance: '1. For key ICT risks in the register, verify that controls are documented and operational.\n2. Check that controls are tested for effectiveness (not just existence).\n3. Verify there is a control testing programme (at least annual for critical controls).\n4. Check that control gaps or deficiencies are tracked and remediated.\n5. Confirm that residual risk levels are within the defined risk appetite.',
          evidenceHint: 'Control inventory; control testing results; gap analysis reports; remediation tracker.',
        },
      ],
    },
    {
      code: 'ISP',
      name: 'Information Security Policy & Controls',
      requirements: [
        {
          requirementCode: 'ISP-01',
          title: 'Information Security Policy',
          description: 'The firm must maintain a comprehensive information security policy.',
          guidance: '1. Request the Information Security Policy.\n2. Verify it covers: scope, objectives, roles/responsibilities, classification, access control, incident management, and acceptable use.\n3. Check that the policy is approved by senior management and reviewed at least annually.\n4. Verify that the policy is communicated to all staff and relevant third parties.\n5. Check that the policy references relevant standards (ISO 27001, EBA Guidelines).',
          evidenceHint: 'Information Security Policy document; approval records; communication evidence (emails, intranet); policy review schedule.',
        },
        {
          requirementCode: 'ISP-02',
          title: 'Data Classification & Handling',
          description: 'The firm must classify information assets and define handling requirements for each classification level.',
          guidance: '1. Verify there is a data/information classification scheme (e.g., Public, Internal, Confidential, Restricted).\n2. Check that classification criteria are clearly defined.\n3. Verify that handling rules exist for each classification level (storage, transmission, sharing, disposal).\n4. Check that staff are trained on classification requirements.\n5. Verify that systems enforce classification-appropriate controls (e.g., encryption for Confidential data).',
          evidenceHint: 'Classification policy; handling matrix; training records; system configuration evidence for data controls.',
        },
        {
          requirementCode: 'ISP-03',
          title: 'Access Control Policy & Implementation',
          description: 'The firm must implement appropriate logical access controls based on the principle of least privilege.',
          guidance: '1. Request the Access Control Policy.\n2. Verify it mandates: least privilege, need-to-know, segregation of duties, and periodic access reviews.\n3. Check that user access is provisioned through a formal process (request, approval, implementation).\n4. Verify that access reviews are conducted at least quarterly for critical systems.\n5. Check that leavers/movers processes ensure timely removal/modification of access.\n6. Verify that default/generic accounts are disabled or have compensating controls.',
          evidenceHint: 'Access Control Policy; access provisioning procedures; access review records; leaver/mover process documentation; user access matrix.',
        },
        {
          requirementCode: 'ISP-04',
          title: 'Acceptable Use & Security Awareness',
          description: 'The firm must have acceptable use policies and a security awareness programme for all staff.',
          guidance: '1. Verify there is an Acceptable Use Policy covering IT equipment, email, internet, and BYOD.\n2. Check that all staff have signed/acknowledged the policy.\n3. Verify there is a security awareness training programme (at least annual, with more frequent communications).\n4. Check that the programme covers: phishing, social engineering, password management, data handling, and incident reporting.\n5. Verify that phishing simulations or similar exercises are conducted.\n6. Check that training completion rates are tracked and non-compliance is followed up.',
          evidenceHint: 'Acceptable Use Policy; acknowledgement records; training materials; completion records; phishing simulation results.',
        },
      ],
    },
    {
      code: 'LSC',
      name: 'Logical Security Controls',
      requirements: [
        {
          requirementCode: 'LSC-01',
          title: 'Authentication & Identity Management',
          description: 'The firm must implement strong authentication mechanisms for system access.',
          guidance: '1. Verify that multi-factor authentication (MFA) is enforced for: remote access, privileged accounts, access to customer data, and production system access.\n2. Check password policy: minimum length, complexity, rotation, history.\n3. Verify that identity management processes cover: provisioning, de-provisioning, and periodic recertification.\n4. Check that service accounts have strong credentials and are inventoried.\n5. Verify that failed login attempts trigger lockout after a defined threshold.',
          evidenceHint: 'MFA configuration evidence; password policy; identity management procedures; service account inventory; lockout policy configuration.',
        },
        {
          requirementCode: 'LSC-02',
          title: 'Privileged Access Management',
          description: 'The firm must have enhanced controls for privileged (administrator) access.',
          guidance: '1. Verify that privileged accounts are inventoried and minimised.\n2. Check that privileged access requires additional authentication (e.g., separate admin accounts, PAM solution).\n3. Verify that privileged access is logged and monitored.\n4. Check that privileged access is reviewed more frequently (at least monthly).\n5. Verify that emergency/break-glass access procedures exist with appropriate controls.\n6. Check for just-in-time or time-limited privileged access where possible.',
          evidenceHint: 'Privileged account inventory; PAM solution documentation; access logs; review records; break-glass procedures.',
        },
        {
          requirementCode: 'LSC-03',
          title: 'Network Security',
          description: 'The firm must implement appropriate network security controls.',
          guidance: '1. Verify the network is segmented (at minimum: production, development, corporate, DMZ).\n2. Check that firewalls are configured with deny-by-default rules and regularly reviewed.\n3. Verify that intrusion detection/prevention systems (IDS/IPS) are deployed.\n4. Check that remote access is through secure channels (VPN, zero-trust network access).\n5. Verify that wireless networks are secured with WPA3 or equivalent.\n6. Check that network diagrams are up to date.',
          evidenceHint: 'Network architecture diagrams; firewall rule sets; IDS/IPS configuration; VPN configuration; wireless security settings.',
        },
        {
          requirementCode: 'LSC-04',
          title: 'Encryption & Cryptographic Controls',
          description: 'The firm must use appropriate encryption to protect data in transit and at rest.',
          guidance: '1. Verify that data is encrypted in transit using TLS 1.2+ (check for any legacy protocols).\n2. Check that sensitive data at rest is encrypted (databases, backups, file storage).\n3. Verify that encryption key management procedures exist (generation, storage, rotation, destruction).\n4. Check that cryptographic standards are appropriate (AES-256, RSA-2048+ etc.).\n5. Verify that certificate management is in place to prevent expiry.',
          evidenceHint: 'Encryption policy; TLS configuration evidence; encryption at rest configuration; key management procedures; certificate inventory.',
        },
      ],
    },
    {
      code: 'OPS',
      name: 'ICT Operations Management',
      requirements: [
        {
          requirementCode: 'OPS-01',
          title: 'Change Management',
          description: 'The firm must have a formal change management process for ICT systems.',
          guidance: '1. Request the change management policy/procedure.\n2. Verify it covers: change classification, risk assessment, testing requirements, approval process, rollback procedures, and post-implementation review.\n3. Check that changes to production systems require appropriate approvals (not self-approved).\n4. Verify that emergency change procedures exist with retrospective approval.\n5. Review a sample of recent changes for process compliance.\n6. Check that change records are maintained.',
          evidenceHint: 'Change management policy; change log/records; approval evidence; post-implementation review reports; emergency change records.',
        },
        {
          requirementCode: 'OPS-02',
          title: 'Capacity & Performance Management',
          description: 'The firm must monitor and manage ICT system capacity to prevent performance degradation.',
          guidance: '1. Verify that capacity monitoring is in place for critical systems.\n2. Check that capacity thresholds and alerts are defined.\n3. Verify that capacity planning is performed for expected growth.\n4. Check that performance baselines are established and monitored.\n5. Verify that capacity-related incidents are tracked and trends analysed.',
          evidenceHint: 'Capacity monitoring dashboards; alert configuration; capacity planning documents; performance reports.',
        },
        {
          requirementCode: 'OPS-03',
          title: 'Backup & Recovery',
          description: 'The firm must implement and test backup and recovery procedures.',
          guidance: '1. Verify that backup procedures cover all critical systems and data.\n2. Check backup frequency (daily for critical data, with appropriate RPOs).\n3. Verify that backups are stored securely, ideally with offsite/geographically separated copies.\n4. Check that backup restoration is tested at least quarterly.\n5. Verify that backup encryption is applied.\n6. Check that backup monitoring and alerting is in place for failed backups.',
          evidenceHint: 'Backup policy; backup schedule; restoration test records; offsite storage evidence; backup monitoring reports.',
        },
        {
          requirementCode: 'OPS-04',
          title: 'Vulnerability & Patch Management',
          description: 'The firm must have a systematic approach to identifying and remediating vulnerabilities.',
          guidance: '1. Verify there is a vulnerability management programme.\n2. Check that vulnerability scans are performed at least quarterly (monthly preferred) for external systems and regularly for internal.\n3. Verify that critical/high vulnerabilities are patched within defined SLAs (e.g., critical: 14 days, high: 30 days).\n4. Check that patch management procedures are documented and followed.\n5. Verify that third-party software and libraries are included in the patching scope.\n6. Check for penetration testing at least annually.',
          evidenceHint: 'Vulnerability scan reports; patching SLAs; patch compliance reports; penetration test reports; remediation tracker.',
        },
      ],
    },
    {
      code: 'INC',
      name: 'ICT Incident & Problem Management',
      requirements: [
        {
          requirementCode: 'INC-01',
          title: 'Incident Management Process',
          description: 'The firm must have a documented ICT incident management process.',
          guidance: '1. Request the ICT incident management procedure.\n2. Verify it covers: detection, classification (severity levels), escalation, containment, eradication, recovery, and post-incident review.\n3. Check that severity levels are defined with corresponding response times.\n4. Verify there is an on-call/out-of-hours support arrangement.\n5. Check that the process includes communication to affected stakeholders.\n6. Verify that all incidents are logged in an incident management system.',
          evidenceHint: 'Incident management procedure; severity classification matrix; incident log/tickets; on-call rota; post-incident review templates.',
        },
        {
          requirementCode: 'INC-02',
          title: 'Major Incident & Security Breach Response',
          description: 'The firm must have specific procedures for major incidents and security breaches.',
          guidance: '1. Verify there is a specific major incident / security breach response plan.\n2. Check that it includes: crisis management team activation, forensic investigation procedures, regulatory notification (FCA, ICO if personal data), customer notification.\n3. Verify that the FCA notification threshold and timeline are understood (without undue delay for major operational incidents).\n4. Check that evidence preservation procedures exist.\n5. Verify the plan has been tested (tabletop exercise or simulation).',
          evidenceHint: 'Major incident response plan; crisis team charter; regulatory notification procedures; test/exercise records; evidence preservation guide.',
        },
        {
          requirementCode: 'INC-03',
          title: 'Incident Reporting to FCA',
          description: 'The firm must meet its obligations to report operational and security incidents to the FCA.',
          guidance: '1. Verify the firm understands its FCA incident reporting obligations under the PSRs.\n2. Check that criteria for reportable incidents are defined (e.g., service disruption duration, number of customers affected, financial impact).\n3. Verify the reporting timeline is understood (initial notification within defined period, follow-up, final report).\n4. Check that someone is responsible for preparing and submitting FCA incident reports.\n5. Review historical incident reports submitted to the FCA (if any).',
          evidenceHint: 'FCA incident reporting criteria; reporting templates; historical submissions; responsible person assignment.',
        },
        {
          requirementCode: 'INC-04',
          title: 'Incident Lessons Learned',
          description: 'The firm must conduct post-incident reviews and implement lessons learned.',
          guidance: '1. Verify that post-incident reviews are conducted for all major incidents.\n2. Check that reviews include: root cause analysis, timeline, impact assessment, and improvement recommendations.\n3. Verify that lessons learned are documented and tracked to completion.\n4. Check that systemic issues identified across multiple incidents are addressed.\n5. Confirm that incident trends are reported to management.',
          evidenceHint: 'Post-incident review reports; root cause analysis; lessons learned register; trend analysis reports; management reports.',
        },
      ],
    },
    {
      code: 'BCM',
      name: 'Business Continuity Management',
      requirements: [
        {
          requirementCode: 'BCM-01',
          title: 'Business Continuity Plan',
          description: 'The firm must maintain a business continuity plan (BCP) covering ICT and operational disruptions.',
          guidance: '1. Request the Business Continuity Plan.\n2. Verify it covers: critical processes, RTOs (Recovery Time Objectives), RPOs (Recovery Point Objectives), recovery procedures, and responsibilities.\n3. Check that the BCP is based on a Business Impact Analysis (BIA).\n4. Verify that the plan covers different disruption scenarios (site loss, IT failure, key staff loss, supplier failure).\n5. Check that the plan is approved by senior management and reviewed at least annually.',
          evidenceHint: 'BCP document; Business Impact Analysis; RTO/RPO definitions; management approval; annual review records.',
        },
        {
          requirementCode: 'BCM-02',
          title: 'Disaster Recovery Planning',
          description: 'The firm must have IT disaster recovery (DR) capabilities aligned with business requirements.',
          guidance: '1. Request the IT Disaster Recovery Plan.\n2. Verify that DR capabilities exist for critical systems (e.g., failover environments, cloud DR).\n3. Check that RTOs and RPOs are achievable with the DR solution in place.\n4. Verify that DR infrastructure is geographically separated from primary.\n5. Check that data replication is in place and monitored.\n6. Verify that DR procedures are documented step-by-step.',
          evidenceHint: 'DR plan; DR architecture diagrams; replication configuration; geographic separation evidence; DR procedure runbooks.',
        },
        {
          requirementCode: 'BCM-03',
          title: 'BCP/DR Testing',
          description: 'The firm must regularly test its BCP and DR arrangements.',
          guidance: '1. Verify that BCP/DR testing is conducted at least annually.\n2. Check that tests include: DR failover tests, tabletop exercises, and communication tests.\n3. Verify that test results document whether RTOs/RPOs were met.\n4. Check that test failures are investigated and remediated.\n5. Verify that the testing programme evolves (different scenarios each time, increasing complexity).',
          evidenceHint: 'BCP/DR test schedule; test reports; RTO/RPO achievement records; remediation from test failures.',
        },
        {
          requirementCode: 'BCM-04',
          title: 'Crisis Communication',
          description: 'The firm must have crisis communication procedures for major disruptions.',
          guidance: '1. Verify that crisis communication procedures cover: internal staff, customers, regulators, and media.\n2. Check that contact lists are maintained and up to date.\n3. Verify that alternative communication channels are identified (if primary channels are affected).\n4. Check that spokesperson roles are defined.\n5. Verify that pre-drafted communication templates exist for common scenarios.',
          evidenceHint: 'Crisis communication plan; contact lists; communication templates; spokesperson designations; alternative channel documentation.',
        },
      ],
    },
  ],
};

// ============================================
// 4. ISO 27001:2022 Assessment
// ============================================
const iso27001Assessment: FrameworkDef = {
  slug: 'iso27001-assessment',
  name: 'ISO/IEC 27001:2022 — ISMS Assessment',
  shortName: 'ISO 27001',
  description: 'Assessment of the Information Security Management System against ISO/IEC 27001:2022 Annex A controls. This assessment covers high-priority areas to verify continued effectiveness of the ISMS.',
  domains: [
    {
      code: 'ORG',
      name: 'Organizational Controls (A.5)',
      requirements: [
        {
          requirementCode: 'ORG-01',
          title: 'Information Security Policies (A.5.1)',
          description: 'Verify that information security policies are defined, approved, communicated, and reviewed.',
          guidance: '1. Request the Information Security Policy and any supporting policies.\n2. Verify policies are approved by management.\n3. Check policies are communicated to all employees and relevant external parties.\n4. Verify policies are reviewed at planned intervals or when significant changes occur.\n5. Check that policies cover the scope of the ISMS and key security objectives.',
          evidenceHint: 'Information Security Policy; supporting policies (access control, acceptable use, etc.); approval records; communication evidence; review records.',
        },
        {
          requirementCode: 'ORG-02',
          title: 'Information Security Roles (A.5.2)',
          description: 'Verify that information security roles and responsibilities are defined and assigned.',
          guidance: '1. Check that responsibility for information security is assigned at all appropriate levels.\n2. Verify there is a clear RACI matrix or equivalent for security responsibilities.\n3. Check segregation of duties is implemented where appropriate.\n4. Verify that management has appointed someone to coordinate and oversee the ISMS.',
          evidenceHint: 'RACI matrix; job descriptions; organisational chart; ISMS management representative appointment.',
        },
        {
          requirementCode: 'ORG-03',
          title: 'Threat Intelligence (A.5.7)',
          description: 'Verify that information about technical vulnerabilities and threat intelligence is collected and analysed.',
          guidance: '1. Check that the firm subscribes to relevant threat intelligence feeds.\n2. Verify that threat intelligence is assessed for relevance to the firm.\n3. Check that threat intelligence informs the risk assessment process.\n4. Verify that actionable intelligence leads to updates in security controls.',
          evidenceHint: 'Threat intelligence subscriptions; analysis reports; risk register updates based on threat intelligence.',
        },
        {
          requirementCode: 'ORG-04',
          title: 'Information Security in Project Management (A.5.8)',
          description: 'Verify that information security is integrated into project management.',
          guidance: '1. Check that project management methodology includes security considerations.\n2. Verify that security requirements are identified for new projects.\n3. Check that security reviews/gates exist at appropriate project stages.\n4. Verify that security testing is included in project delivery.',
          evidenceHint: 'Project management framework; security review checklists; project security requirements examples; security testing in project plans.',
        },
        {
          requirementCode: 'ORG-05',
          title: 'Supplier Security Management (A.5.19-22)',
          description: 'Verify that information security is managed in supplier relationships.',
          guidance: '1. Request the supplier/third-party security management policy.\n2. Check that security requirements are included in supplier contracts.\n3. Verify that suppliers are assessed for security before engagement and periodically thereafter.\n4. Check that there is monitoring of supplier security performance.\n5. Verify that changes to supplier services are managed with security in mind.',
          evidenceHint: 'Supplier security policy; supplier risk assessment records; contract security clauses; supplier audit/assessment reports; supplier register.',
        },
      ],
    },
    {
      code: 'PPL',
      name: 'People Controls (A.6)',
      requirements: [
        {
          requirementCode: 'PPL-01',
          title: 'Screening & Employment Terms (A.6.1-2)',
          description: 'Verify that background verification checks and employment terms address information security.',
          guidance: '1. Verify that pre-employment screening is conducted for all roles (appropriate to the role\'s sensitivity).\n2. Check that screening includes: identity verification, employment history, criminal records (where permitted), and credit checks (for financial roles).\n3. Verify that employment contracts include information security responsibilities.\n4. Check that NDAs/confidentiality agreements are in place.',
          evidenceHint: 'Screening policy; sample screening records (redacted); employment contract security clauses; NDA templates.',
        },
        {
          requirementCode: 'PPL-02',
          title: 'Information Security Awareness & Training (A.6.3)',
          description: 'Verify that all personnel receive appropriate security awareness education and training.',
          guidance: '1. Verify there is a security awareness programme covering all staff.\n2. Check that training is conducted at induction and refreshed at least annually.\n3. Verify that the programme covers: phishing, social engineering, password management, data handling, incident reporting.\n4. Check that role-specific training exists for IT staff, developers, and management.\n5. Verify that training effectiveness is measured (tests, phishing simulations).',
          evidenceHint: 'Training programme overview; training materials; completion records; phishing simulation results; training effectiveness metrics.',
        },
        {
          requirementCode: 'PPL-03',
          title: 'Termination & Change of Employment (A.6.5)',
          description: 'Verify that information security responsibilities that remain valid after termination or change of employment are defined and enforced.',
          guidance: '1. Check that there is a documented leaver process that includes IT access removal.\n2. Verify that access removal is timely (ideally on or before the last working day).\n3. Check that equipment is returned and data is recovered/wiped.\n4. Verify that post-employment obligations (NDA, non-compete) are communicated.\n5. Check that the process covers internal transfers/role changes as well.',
          evidenceHint: 'Leaver/mover process documentation; access removal records; equipment return records; exit interview checklist.',
        },
        {
          requirementCode: 'PPL-04',
          title: 'Remote Working Security (A.6.7)',
          description: 'Verify that security measures are implemented for remote working.',
          guidance: '1. Verify there is a remote working/home working security policy.\n2. Check that remote access requires MFA.\n3. Verify that endpoint security controls are applied to remote devices (antivirus, encryption, patch management).\n4. Check that the policy addresses: physical security of devices, secure Wi-Fi requirements, data handling at home.\n5. Verify that remote workers are trained on secure remote working practices.',
          evidenceHint: 'Remote working policy; MFA configuration evidence; endpoint security configuration; training records.',
        },
      ],
    },
    {
      code: 'PHY',
      name: 'Physical Controls (A.7)',
      requirements: [
        {
          requirementCode: 'PHY-01',
          title: 'Physical Security Perimeters & Entry (A.7.1-2)',
          description: 'Verify that physical security perimeters and entry controls protect areas containing information and systems.',
          guidance: '1. Verify that secure areas (server rooms, offices) have defined perimeters.\n2. Check that entry controls are appropriate (key cards, biometrics, reception desk).\n3. Verify that visitor access is controlled and logged.\n4. Check that secure areas have appropriate monitoring (CCTV).\n5. For cloud-hosted infrastructure, verify the cloud provider\'s physical security certifications.',
          evidenceHint: 'Physical security policy; access control system records; visitor logs; CCTV evidence; cloud provider security certifications (SOC 2, ISO 27001).',
        },
        {
          requirementCode: 'PHY-02',
          title: 'Clear Desk & Clear Screen (A.7.7)',
          description: 'Verify that a clear desk policy for papers and removable storage media, and a clear screen policy for information processing facilities, is defined and enforced.',
          guidance: '1. Check that a clear desk/clear screen policy exists.\n2. Verify that screen lock is enforced after a defined period of inactivity.\n3. Check that sensitive documents are secured when not in use.\n4. Verify that printers in shared areas have secure print functionality.\n5. Check compliance through spot checks or audits.',
          evidenceHint: 'Clear desk/screen policy; screen lock configuration (GPO/MDM settings); spot check records.',
        },
        {
          requirementCode: 'PHY-03',
          title: 'Equipment Security & Maintenance (A.7.8-13)',
          description: 'Verify that equipment is protected from physical and environmental threats and properly maintained.',
          guidance: '1. Verify that critical equipment (servers, network devices) is in environmentally controlled rooms.\n2. Check that UPS/generator power protection is in place.\n3. Verify that equipment maintenance is performed according to manufacturer schedules.\n4. Check that secure disposal/reuse procedures exist for equipment containing data.\n5. Verify that offsite equipment (laptops) has appropriate protection.',
          evidenceHint: 'Environmental monitoring records; UPS test records; maintenance schedules; disposal procedures; asset disposal records.',
        },
      ],
    },
    {
      code: 'TEC',
      name: 'Technological Controls (A.8)',
      requirements: [
        {
          requirementCode: 'TEC-01',
          title: 'Endpoint & Malware Protection (A.8.1, A.8.7)',
          description: 'Verify that user endpoint devices are protected and malware protection is implemented.',
          guidance: '1. Verify that all endpoints have anti-malware/EDR solutions installed and active.\n2. Check that malware definitions/signatures are updated automatically.\n3. Verify that endpoint management (patching, configuration) is centralised.\n4. Check that USB and removable media controls are in place.\n5. Verify that mobile device management (MDM) is deployed for company mobile devices.',
          evidenceHint: 'EDR/antivirus deployment reports; update status; MDM configuration; endpoint patching reports; USB policy configuration.',
        },
        {
          requirementCode: 'TEC-02',
          title: 'Vulnerability Management & Penetration Testing (A.8.8, A.8.34)',
          description: 'Verify that technical vulnerabilities are managed and systems are tested for security.',
          guidance: '1. Verify that vulnerability scanning is performed regularly (at least quarterly for external, monthly for internal).\n2. Check that a penetration test has been conducted within the last 12 months.\n3. Verify that vulnerabilities are prioritised and remediated within defined SLAs.\n4. Check that the scope of testing covers all critical systems and applications.\n5. Verify that remediation is verified through re-testing.',
          evidenceHint: 'Vulnerability scan reports; penetration test reports; remediation tracker; re-testing evidence; SLA definitions.',
        },
        {
          requirementCode: 'TEC-03',
          title: 'Logging, Monitoring & Alerting (A.8.15-16)',
          description: 'Verify that security events are logged, monitored, and alerted on.',
          guidance: '1. Verify that security-relevant events are logged across systems (authentication, access changes, admin actions).\n2. Check that logs are centrally collected (SIEM or equivalent).\n3. Verify that log retention meets regulatory requirements (minimum 12 months, 5 years for financial services).\n4. Check that monitoring rules/alerts are configured for suspicious activity.\n5. Verify that logs are protected against tampering.\n6. Check that there is a process for reviewing alerts and investigating anomalies.',
          evidenceHint: 'SIEM/logging architecture; log sources inventory; alert rules; log retention configuration; sample alert investigation records.',
        },
        {
          requirementCode: 'TEC-04',
          title: 'Secure Development & Change Control (A.8.25-32)',
          description: 'Verify that application development follows secure coding practices and changes are controlled.',
          guidance: '1. Verify there are secure development guidelines/standards.\n2. Check that code reviews include security review.\n3. Verify that security testing (SAST, DAST) is part of the SDLC.\n4. Check that development, testing, and production environments are separated.\n5. Verify that test data is appropriately managed (no production data in test without anonymisation).\n6. Check that change management procedures are followed for deployments.',
          evidenceHint: 'Secure development policy; code review records; SAST/DAST reports; environment separation evidence; test data management procedures.',
        },
        {
          requirementCode: 'TEC-05',
          title: 'Data Protection & Privacy (A.8.10-12)',
          description: 'Verify that data deletion, masking, and data leakage prevention controls are in place.',
          guidance: '1. Verify that data retention and deletion procedures exist and are followed.\n2. Check that data masking is applied where appropriate (non-production environments, reports).\n3. Verify that DLP (Data Leakage Prevention) controls are in place (email, endpoint, network).\n4. Check that personal data handling complies with GDPR/UK GDPR requirements.\n5. Verify that data breach notification procedures are documented.',
          evidenceHint: 'Data retention policy; DLP configuration; data masking procedures; DPIA records; breach notification procedure.',
        },
      ],
    },
  ],
};

// ============================================
// 5. DORA (EU Digital Operational Resilience)
// ============================================
const doraFramework: FrameworkDef = {
  slug: 'dora',
  name: 'DORA — Digital Operational Resilience Act',
  shortName: 'DORA',
  description: 'The EU Digital Operational Resilience Act (Regulation (EU) 2022/2554), effective since 17 January 2025, applies to EU financial entities and relevant ICT third-party service providers. This assessment covers key DORA requirements relevant to MNI Group entities operating within or providing services into the EU.',
  domains: [
    {
      code: 'ICT',
      name: 'ICT Risk Management',
      requirements: [
        {
          requirementCode: 'ICT-01',
          title: 'ICT Risk Management Framework (Art. 6)',
          description: 'Financial entities must establish an ICT risk management framework as part of their overall risk management system.',
          guidance: '1. Verify there is a documented ICT risk management framework.\n2. Check that it is integrated with the overall enterprise risk management framework.\n3. Verify the framework includes: strategies, policies, procedures, ICT protocols, and tools necessary to protect ICT assets.\n4. Check that the management body is responsible for defining, approving, overseeing, and being accountable for the ICT risk management framework.\n5. Verify the framework follows the principle of proportionality.',
          evidenceHint: 'ICT risk management framework document; board approval; integration with ERM; roles and responsibilities documentation.',
        },
        {
          requirementCode: 'ICT-02',
          title: 'ICT Asset Identification & Classification (Art. 8)',
          description: 'Financial entities must identify, classify, and document all ICT assets and their dependencies.',
          guidance: '1. Verify there is a comprehensive ICT asset register.\n2. Check that assets are classified by criticality and sensitivity.\n3. Verify that dependencies and interconnections between assets are mapped.\n4. Check that the register covers: hardware, software, network devices, cloud services, data repositories.\n5. Verify the register is kept up to date with a defined review cycle.',
          evidenceHint: 'ICT asset register; asset classification scheme; dependency mapping; review/update records.',
        },
        {
          requirementCode: 'ICT-03',
          title: 'Protection & Prevention Measures (Art. 9)',
          description: 'Financial entities must implement ICT security policies, procedures, and technical controls for protection and prevention.',
          guidance: '1. Verify that ICT security policies cover: network security, data protection, access control, encryption, and vulnerability management.\n2. Check that technical controls are implemented and operational.\n3. Verify that security measures are proportionate to the criticality of the assets they protect.\n4. Check that continuous monitoring capabilities are in place.\n5. Verify that the firm deploys up-to-date security solutions (anti-malware, firewalls, IDS/IPS).',
          evidenceHint: 'ICT security policies; technical control inventory; monitoring tool evidence; security solution deployment records.',
        },
        {
          requirementCode: 'ICT-04',
          title: 'Detection & Response Capabilities (Art. 10)',
          description: 'Financial entities must have mechanisms to promptly detect anomalous activities and ICT-related incidents.',
          guidance: '1. Verify that detection mechanisms are in place (SIEM, anomaly detection, network monitoring).\n2. Check that detection capabilities cover: network intrusion, data exfiltration, system compromise, and insider threats.\n3. Verify that alert triage processes are defined.\n4. Check that the firm can detect incidents in a timely manner (define "timely" based on risk).\n5. Verify that detection mechanisms are regularly tested and tuned.',
          evidenceHint: 'SIEM/detection tool configuration; alert rules; triage procedures; detection testing records; mean-time-to-detect metrics.',
        },
      ],
    },
    {
      code: 'INC',
      name: 'ICT Incident Management & Reporting',
      requirements: [
        {
          requirementCode: 'INC-01',
          title: 'Incident Classification Scheme (Art. 18)',
          description: 'Financial entities must classify ICT-related incidents using defined criteria.',
          guidance: '1. Verify that an incident classification scheme exists.\n2. Check that classification criteria include: number of clients affected, duration of incident, geographic spread, data losses, criticality of services affected, and economic impact.\n3. Verify that the scheme aligns with the DORA classification criteria and RTS requirements.\n4. Check that incidents are classified promptly upon detection.',
          evidenceHint: 'Incident classification scheme; classification criteria definitions; sample classified incidents; RTS alignment mapping.',
        },
        {
          requirementCode: 'INC-02',
          title: 'Major Incident Reporting (Art. 19)',
          description: 'Financial entities must report major ICT-related incidents to their competent authority.',
          guidance: '1. Verify the firm knows which incidents qualify as "major" under DORA criteria.\n2. Check that reporting templates and timelines are defined: initial notification (within 4 hours of classification), intermediate report (within 72 hours), final report (within 1 month).\n3. Verify that the reporting process is documented and responsibilities assigned.\n4. Check that the firm has tested the reporting process.\n5. Verify awareness of the competent authority\'s reporting portal/mechanism.',
          evidenceHint: 'Major incident reporting procedure; reporting templates; competent authority contact details; test records; sample reports.',
        },
        {
          requirementCode: 'INC-03',
          title: 'Root Cause Analysis (Art. 17)',
          description: 'Financial entities must conduct root cause analysis for ICT incidents.',
          guidance: '1. Verify that root cause analysis is conducted for all major incidents and significant recurring incidents.\n2. Check that analysis follows a structured methodology (e.g., 5 Whys, Fishbone, Fault Tree).\n3. Verify that findings feed into the risk assessment and control improvement processes.\n4. Check that systemic root causes are identified and addressed.',
          evidenceHint: 'Root cause analysis reports; methodology documentation; link to risk register updates; systemic issue tracking.',
        },
        {
          requirementCode: 'INC-04',
          title: 'Post-Incident Reviews & Learning (Art. 13)',
          description: 'Financial entities must conduct post-ICT incident reviews and share lessons learned.',
          guidance: '1. Verify that post-incident reviews are mandatory for major incidents.\n2. Check that reviews assess: root cause, effectiveness of response, need for improvements.\n3. Verify that lessons learned are communicated to relevant staff and management.\n4. Check that mandatory changes identified in reviews are tracked to completion.\n5. Verify that the firm participates in industry sharing of anonymised incident intelligence where appropriate.',
          evidenceHint: 'Post-incident review reports; lessons learned communications; improvement action tracker; industry sharing participation evidence.',
        },
      ],
    },
    {
      code: 'RES',
      name: 'Digital Operational Resilience Testing',
      requirements: [
        {
          requirementCode: 'RES-01',
          title: 'Testing Programme (Art. 24)',
          description: 'Financial entities must establish a digital operational resilience testing programme.',
          guidance: '1. Verify there is a documented testing programme covering ICT resilience.\n2. Check that the programme includes: vulnerability assessments, network security assessments, gap analysis, physical security reviews, source code reviews, scenario-based testing, compatibility testing, performance testing, and end-to-end testing.\n3. Verify that testing is performed by qualified and independent testers.\n4. Check that the programme is risk-based and proportionate.',
          evidenceHint: 'Testing programme document; annual testing plan; tester qualifications; independence documentation; test scope rationale.',
        },
        {
          requirementCode: 'RES-02',
          title: 'Vulnerability Assessments (Art. 24-25)',
          description: 'Financial entities must conduct regular vulnerability assessments of ICT systems and applications.',
          guidance: '1. Verify that vulnerability assessments are conducted at least annually.\n2. Check that the scope covers: external-facing systems, internal networks, applications, and cloud environments.\n3. Verify that identified vulnerabilities are risk-rated and remediated within defined timelines.\n4. Check that remediation is verified through re-scanning.\n5. Verify that the tools used are appropriate and up to date.',
          evidenceHint: 'Vulnerability assessment reports; scope documentation; remediation timelines; re-scan verification; tool inventory.',
        },
        {
          requirementCode: 'RES-03',
          title: 'Threat-Led Penetration Testing (Art. 26)',
          description: 'Certain financial entities must conduct threat-led penetration testing (TLPT) at least every 3 years.',
          guidance: '1. Determine if the entity is required to perform TLPT (based on proportionality and competent authority designation).\n2. If required, verify that TLPT has been conducted or is planned.\n3. Check that TLPT follows the TIBER-EU framework or equivalent.\n4. Verify that the scope covers critical functions and live production systems.\n5. Check that results are shared with the competent authority.\n6. If not required for TLPT, verify that standard penetration testing is conducted annually.',
          evidenceHint: 'TLPT scoping document; TLPT report; competent authority correspondence; TIBER-EU framework compliance; or annual pentest report.',
        },
        {
          requirementCode: 'RES-04',
          title: 'Remediation of Testing Findings (Art. 24)',
          description: 'Financial entities must address all findings from resilience testing in a timely manner.',
          guidance: '1. Verify that all testing findings are captured in a formal remediation tracker.\n2. Check that findings are prioritised by risk severity.\n3. Verify that remediation timelines are defined and tracked.\n4. Check that the management body is informed of critical findings.\n5. Verify that remediation is verified through re-testing.',
          evidenceHint: 'Remediation tracker; prioritisation methodology; management body reports; re-testing evidence.',
        },
      ],
    },
    {
      code: 'TPR',
      name: 'Third-Party ICT Risk Management',
      requirements: [
        {
          requirementCode: 'TPR-01',
          title: 'Third-Party ICT Register (Art. 28)',
          description: 'Financial entities must maintain a register of all ICT third-party service providers.',
          guidance: '1. Request the register of ICT third-party service providers.\n2. Verify it includes: provider name, services provided, criticality assessment, contract details, and sub-outsourcing arrangements.\n3. Check that critical or important ICT third-party providers are identified.\n4. Verify that the register is reported to the competent authority as required.\n5. Check that the register is kept up to date.',
          evidenceHint: 'Third-party ICT register; criticality assessments; regulatory reporting records; update procedures.',
        },
        {
          requirementCode: 'TPR-02',
          title: 'Contractual Requirements (Art. 30)',
          description: 'Contracts with ICT third-party service providers must include specific provisions required by DORA.',
          guidance: '1. Review contracts with critical ICT third-party providers.\n2. Verify contracts include: service descriptions, data processing locations, SLAs, audit rights, incident notification obligations, exit/termination provisions, and sub-outsourcing restrictions.\n3. Check that the firm has the right to audit the provider.\n4. Verify that data processing locations are specified and appropriate.\n5. Check that the contract addresses the provider\'s obligation to cooperate during incidents.',
          evidenceHint: 'Sample contracts with critical ICT providers; contract review checklist; DORA Article 30 compliance mapping.',
        },
        {
          requirementCode: 'TPR-03',
          title: 'Ongoing Monitoring & Oversight (Art. 28-29)',
          description: 'Financial entities must continuously monitor the performance and risk of ICT third-party service providers.',
          guidance: '1. Verify there is ongoing monitoring of critical ICT providers.\n2. Check that monitoring includes: SLA performance, security posture, financial viability, and incident history.\n3. Verify that regular risk assessments are conducted for critical providers.\n4. Check that concentration risk is assessed (dependency on single providers).\n5. Verify that the firm has a process for managing ICT provider incidents.',
          evidenceHint: 'Provider monitoring reports; SLA dashboards; risk assessment records; concentration risk analysis; provider incident management records.',
        },
        {
          requirementCode: 'TPR-04',
          title: 'Exit Strategies (Art. 28)',
          description: 'Financial entities must have exit strategies for critical ICT third-party service providers.',
          guidance: '1. Verify that exit strategies exist for all critical ICT providers.\n2. Check that strategies include: data migration plans, transition timelines, alternative provider identification, and resource requirements.\n3. Verify that exit plans are periodically tested or reviewed for feasibility.\n4. Check that contractual provisions support orderly exit (notice periods, data return, transition support).\n5. Verify that exit strategies consider the scenario where the provider fails rather than a planned transition.',
          evidenceHint: 'Exit strategy documents; transition plans; alternative provider analysis; contract exit clauses; feasibility review records.',
        },
      ],
    },
    {
      code: 'ISH',
      name: 'Information Sharing',
      requirements: [
        {
          requirementCode: 'ISH-01',
          title: 'Threat Intelligence Sharing (Art. 45)',
          description: 'Financial entities may participate in cyber threat intelligence sharing arrangements.',
          guidance: '1. Check if the firm participates in any threat intelligence sharing arrangements (e.g., FS-ISAC, NCSC CiSP, or sector-specific groups).\n2. If participating, verify that sharing is conducted with appropriate confidentiality safeguards.\n3. Check that shared intelligence is used to improve the firm\'s security posture.\n4. Verify that the firm has designated a contact point for threat intelligence.\n5. If not participating, assess whether participation would benefit the firm\'s security posture.',
          evidenceHint: 'Threat sharing group membership evidence; intelligence reports received/shared; confidentiality agreements; designated contact point.',
        },
        {
          requirementCode: 'ISH-02',
          title: 'Regulatory Communication (Art. 11)',
          description: 'Financial entities must have processes for communicating with competent authorities on ICT risk matters.',
          guidance: '1. Verify the firm knows its competent authority contact points for ICT risk matters.\n2. Check that communication procedures are documented (for incident reporting, major change notifications, etc.).\n3. Verify that the firm monitors regulatory publications and guidance on digital operational resilience.\n4. Check that regulatory correspondence is tracked and responded to within required timelines.',
          evidenceHint: 'Regulatory contact register; communication procedures; regulatory publication monitoring process; correspondence log.',
        },
      ],
    },
  ],
};

// ============================================
// 6. ISO/IEC 42001:2023 — AI Management System
// ============================================
const iso42001Assessment: FrameworkDef = {
  slug: 'iso42001-assessment',
  name: 'ISO/IEC 42001:2023 — AI Management System Assessment',
  shortName: 'ISO 42001',
  description: 'Assessment of the AI Management System against ISO/IEC 42001:2023 requirements. This framework covers AI governance, risk management, data quality, responsible AI development, and operational oversight for organizations developing, providing, or using AI systems.',
  domains: [
    {
      code: 'AIG',
      name: 'AI Governance & Leadership',
      requirements: [
        {
          requirementCode: 'AIG-01',
          title: 'AI Management System Policy',
          description: 'The organization must establish an AI policy that provides a framework for setting AI objectives and demonstrates commitment to responsible AI.',
          guidance: '1. Request the AI Management System policy.\n2. Verify it covers: scope of AI systems, commitment to responsible AI principles, alignment with organizational strategy, and compliance with applicable regulations.\n3. Check that the policy is approved by top management.\n4. Verify the policy is communicated to all relevant personnel and stakeholders.\n5. Check that the policy is reviewed at planned intervals and updated when significant changes occur.',
          evidenceHint: 'AI Management System policy document; management approval records; communication evidence; review schedule.',
        },
        {
          requirementCode: 'AIG-02',
          title: 'AI Roles & Responsibilities',
          description: 'The organization must define and assign roles, responsibilities, and authorities for AI governance.',
          guidance: '1. Verify that an AI governance structure is defined (e.g., AI Ethics Board, AI Risk Committee, or equivalent).\n2. Check that roles are assigned for: AI system owners, AI risk managers, data stewards, and ethical AI oversight.\n3. Verify there is a designated management representative for the AIMS.\n4. Check that competency requirements are defined for AI-related roles.\n5. Confirm that the governance structure has authority to halt or modify AI systems that pose unacceptable risks.',
          evidenceHint: 'AI governance org chart; role descriptions; committee terms of reference; management representative appointment; competency framework.',
        },
        {
          requirementCode: 'AIG-03',
          title: 'AI System Inventory & Classification',
          description: 'The organization must maintain an inventory of all AI systems and classify them by risk level.',
          guidance: '1. Request the AI system inventory/register.\n2. Verify it includes: system name, purpose, type of AI (ML, rules-based, generative, etc.), deployment status, data sources, and affected stakeholders.\n3. Check that each AI system has a risk classification (e.g., minimal, limited, high, unacceptable).\n4. Verify classification criteria align with applicable regulations (e.g., EU AI Act risk levels).\n5. Check that the inventory is kept current with a defined update cycle.',
          evidenceHint: 'AI system inventory; risk classification criteria; classification records per system; update/review logs.',
        },
        {
          requirementCode: 'AIG-04',
          title: 'Ethical AI Framework & Principles',
          description: 'The organization must establish ethical principles and guidelines for AI development and use.',
          guidance: '1. Verify the organization has documented AI ethical principles (e.g., fairness, transparency, accountability, privacy, safety, human oversight).\n2. Check that these principles are operationalized into practical guidelines for development teams.\n3. Verify there is a process for ethical review of new AI systems before deployment.\n4. Check that an ethics escalation process exists for contentious or high-risk AI decisions.\n5. Confirm that ethical AI training is provided to relevant personnel.',
          evidenceHint: 'AI ethics principles document; ethical guidelines for developers; ethics review process; escalation procedures; training records.',
        },
        {
          requirementCode: 'AIG-05',
          title: 'Management Review & Continual Improvement',
          description: 'Top management must review the AI Management System at planned intervals to ensure its continuing suitability, adequacy, and effectiveness.',
          guidance: '1. Verify that management reviews of the AIMS are conducted at planned intervals (at least annually).\n2. Check that reviews cover: AI risk landscape, performance metrics, incident analysis, audit findings, and improvement opportunities.\n3. Verify that review outputs include decisions on improvement actions and resource allocation.\n4. Check that review records are maintained.\n5. Confirm that improvement actions are tracked to completion.',
          evidenceHint: 'Management review meeting minutes; review agenda/inputs; action items from reviews; improvement tracking.',
        },
      ],
    },
    {
      code: 'ARI',
      name: 'AI Risk Management',
      requirements: [
        {
          requirementCode: 'ARI-01',
          title: 'AI Risk Assessment Methodology',
          description: 'The organization must establish a systematic methodology for identifying and assessing AI-specific risks.',
          guidance: '1. Verify there is a documented AI risk assessment methodology.\n2. Check that it covers AI-specific risks: bias/discrimination, safety hazards, privacy violations, security vulnerabilities, reliability failures, and societal impact.\n3. Verify the methodology considers risks across the AI lifecycle (design, development, deployment, operation, decommission).\n4. Check that risk criteria include: likelihood of harm, severity of harm, reversibility, scale of impact.\n5. Verify that risk assessments are conducted before deployment and periodically during operation.',
          evidenceHint: 'AI risk assessment methodology; risk criteria definitions; risk assessment templates; completed risk assessments.',
        },
        {
          requirementCode: 'ARI-02',
          title: 'Bias & Fairness Assessment',
          description: 'The organization must assess AI systems for bias and ensure fairness across protected characteristics.',
          guidance: '1. Verify that bias testing is conducted for AI systems that affect individuals.\n2. Check that testing covers: demographic parity, equalized odds, calibration across groups, and proxy discrimination.\n3. Verify that protected characteristics are identified and tested (age, gender, ethnicity, disability, etc.).\n4. Check that bias metrics and thresholds are defined.\n5. Verify that remediation actions are documented when bias is detected.\n6. Confirm that ongoing monitoring for bias drift is in place for deployed systems.',
          evidenceHint: 'Bias assessment reports; fairness metrics definitions; testing methodology; remediation records; monitoring dashboards.',
        },
        {
          requirementCode: 'ARI-03',
          title: 'AI Transparency & Explainability',
          description: 'The organization must ensure AI systems are transparent and their decisions can be explained to affected parties.',
          guidance: '1. Verify that transparency requirements are defined for each AI system based on risk level.\n2. Check that affected individuals are informed when they interact with or are subject to AI decisions.\n3. Verify that explanations of AI decisions are available at an appropriate level of detail.\n4. Check that explainability techniques are implemented (e.g., feature importance, SHAP values, decision rules).\n5. Verify that documentation describes the purpose, capabilities, and limitations of each AI system.',
          evidenceHint: 'Transparency policy; user-facing AI disclosures; explainability implementation evidence; AI system documentation; limitation disclosures.',
        },
        {
          requirementCode: 'ARI-04',
          title: 'AI Risk Treatment & Controls',
          description: 'The organization must implement controls to mitigate identified AI risks to acceptable levels.',
          guidance: '1. Verify that risk treatment plans exist for identified AI risks.\n2. Check that controls are implemented across the AI lifecycle: design controls (requirements, constraints), development controls (testing, validation), deployment controls (monitoring, human oversight), and operational controls (drift detection, feedback loops).\n3. Verify that residual risk levels are documented and accepted by appropriate management.\n4. Check that control effectiveness is monitored and reviewed.\n5. Confirm that the risk register is updated as AI systems evolve.',
          evidenceHint: 'AI risk register; risk treatment plans; control inventory; residual risk acceptance records; control monitoring reports.',
        },
      ],
    },
    {
      code: 'ADA',
      name: 'Data for AI Systems',
      requirements: [
        {
          requirementCode: 'ADA-01',
          title: 'Data Quality Management',
          description: 'The organization must establish data quality requirements and processes for data used in AI systems.',
          guidance: '1. Verify that data quality standards are defined for AI training and operational data.\n2. Check that quality dimensions are measured: accuracy, completeness, consistency, timeliness, relevance, and representativeness.\n3. Verify that data quality assessments are conducted before AI model training.\n4. Check that data quality monitoring is in place for operational data pipelines.\n5. Verify that data quality issues are tracked and remediated.',
          evidenceHint: 'Data quality policy; quality metrics and thresholds; quality assessment reports; monitoring dashboards; issue remediation logs.',
        },
        {
          requirementCode: 'ADA-02',
          title: 'Data Governance for AI',
          description: 'The organization must implement data governance processes specific to AI data requirements.',
          guidance: '1. Verify that data governance covers: data ownership, data cataloguing, data lineage, and data access controls for AI.\n2. Check that data sources for AI systems are documented and authorized.\n3. Verify that data provenance (origin, transformations, usage history) is tracked.\n4. Check that data retention and deletion policies address AI training data.\n5. Verify that consent and legal basis are documented for personal data used in AI.',
          evidenceHint: 'Data governance framework; data catalogue; data lineage documentation; consent records; data access policies.',
        },
        {
          requirementCode: 'ADA-03',
          title: 'Training Data Bias Assessment',
          description: 'The organization must assess training data for representativeness and potential sources of bias.',
          guidance: '1. Verify that training datasets are assessed for demographic representativeness.\n2. Check that potential sources of historical bias in training data are identified.\n3. Verify that data augmentation or rebalancing techniques are applied where needed.\n4. Check that synthetic data usage (if any) is documented with quality assurance.\n5. Verify that training data documentation includes known limitations and coverage gaps.',
          evidenceHint: 'Training data analysis reports; demographic distribution analysis; bias assessment results; data augmentation records; dataset documentation.',
        },
        {
          requirementCode: 'ADA-04',
          title: 'Data Privacy in AI',
          description: 'The organization must ensure AI systems comply with data privacy requirements throughout the lifecycle.',
          guidance: '1. Verify that DPIAs (Data Protection Impact Assessments) are conducted for AI systems processing personal data.\n2. Check that privacy-by-design principles are applied (data minimization, purpose limitation, storage limitation).\n3. Verify that privacy-enhancing technologies are considered (anonymization, differential privacy, federated learning).\n4. Check that data subject rights can be exercised in the context of AI (right to explanation, right to human review).\n5. Verify that cross-border data transfers for AI training comply with applicable regulations.',
          evidenceHint: 'DPIAs for AI systems; privacy-by-design documentation; PET implementation evidence; data subject rights procedures; transfer assessments.',
        },
      ],
    },
    {
      code: 'ADV',
      name: 'AI System Development & Validation',
      requirements: [
        {
          requirementCode: 'ADV-01',
          title: 'AI System Lifecycle Management',
          description: 'The organization must manage AI systems through a defined lifecycle with appropriate controls at each stage.',
          guidance: '1. Verify that an AI system development lifecycle is defined (design, development, testing, deployment, monitoring, retirement).\n2. Check that gate/review criteria exist for transitions between lifecycle stages.\n3. Verify that security and privacy reviews are integrated into the lifecycle.\n4. Check that model documentation is maintained throughout the lifecycle.\n5. Verify that decommissioning procedures exist for retiring AI systems.',
          evidenceHint: 'AI lifecycle framework; stage gate criteria; review records; model documentation; decommissioning procedures.',
        },
        {
          requirementCode: 'ADV-02',
          title: 'AI Testing & Validation',
          description: 'The organization must conduct thorough testing and validation of AI systems before deployment.',
          guidance: '1. Verify that testing requirements are defined for AI systems based on risk level.\n2. Check that testing covers: functional correctness, performance benchmarks, robustness (edge cases, adversarial inputs), fairness, and safety.\n3. Verify that test datasets are independent from training datasets.\n4. Check that validation criteria and acceptance thresholds are defined and documented.\n5. Verify that test results are reviewed and approved before deployment.',
          evidenceHint: 'Testing strategy; test plans; test results reports; validation criteria; approval records; test dataset documentation.',
        },
        {
          requirementCode: 'ADV-03',
          title: 'Model Documentation & Versioning',
          description: 'The organization must maintain comprehensive documentation of AI models including architecture, training data, performance, and limitations.',
          guidance: '1. Verify that model cards or equivalent documentation exist for each AI model.\n2. Check documentation covers: model purpose, architecture, training data description, performance metrics, known limitations, intended use, and prohibited use.\n3. Verify that model versioning is in place with clear change logs.\n4. Check that the relationship between model versions and deployed systems is tracked.\n5. Verify that documentation is updated when models are retrained or modified.',
          evidenceHint: 'Model cards/documentation; version control records; change logs; deployment mapping; documentation update records.',
        },
        {
          requirementCode: 'ADV-04',
          title: 'Human Oversight Requirements',
          description: 'The organization must define and implement appropriate levels of human oversight for AI systems.',
          guidance: '1. Verify that human oversight levels are defined for each AI system based on risk classification.\n2. Check that human-in-the-loop or human-on-the-loop controls are implemented where required.\n3. Verify that operators/overseers have adequate training and authority to intervene.\n4. Check that override/shutdown mechanisms exist for high-risk AI systems.\n5. Verify that human oversight effectiveness is monitored and reviewed.',
          evidenceHint: 'Human oversight policy; oversight level assignments; operator training records; override mechanism documentation; oversight effectiveness reviews.',
        },
      ],
    },
    {
      code: 'AOP',
      name: 'AI Operations & Monitoring',
      requirements: [
        {
          requirementCode: 'AOP-01',
          title: 'AI Deployment Controls',
          description: 'The organization must have controlled deployment procedures for AI systems.',
          guidance: '1. Verify that deployment procedures exist for AI systems (similar to change management but AI-specific).\n2. Check that deployment includes: pre-deployment checklist, staged rollout (canary/blue-green), rollback procedures.\n3. Verify that A/B testing or shadow mode deployment is used for high-risk changes.\n4. Check that deployment approval includes review of bias, fairness, and safety assessments.\n5. Verify that post-deployment validation is conducted.',
          evidenceHint: 'AI deployment procedures; deployment checklists; rollout evidence; rollback procedures; post-deployment validation reports.',
        },
        {
          requirementCode: 'AOP-02',
          title: 'Performance & Drift Monitoring',
          description: 'The organization must continuously monitor AI system performance and detect model drift.',
          guidance: '1. Verify that performance monitoring is in place for all deployed AI systems.\n2. Check that monitoring covers: accuracy/precision/recall, latency, data drift, concept drift, and output distribution.\n3. Verify that drift detection thresholds and alerts are configured.\n4. Check that monitoring dashboards are accessible to relevant stakeholders.\n5. Verify that processes exist for model retraining or replacement when performance degrades.',
          evidenceHint: 'Monitoring dashboards; drift detection configuration; alert thresholds; retraining trigger criteria; monitoring reports.',
        },
        {
          requirementCode: 'AOP-03',
          title: 'AI Incident Management',
          description: 'The organization must have processes for managing AI-specific incidents including unexpected outputs, bias manifestation, and safety issues.',
          guidance: '1. Verify that AI-specific incident categories are defined (e.g., biased output, hallucination, safety violation, privacy breach, performance degradation).\n2. Check that incident response procedures address AI-specific scenarios.\n3. Verify that incident severity is assessed considering: harm to individuals, scale of impact, and reversibility.\n4. Check that incident investigation includes root cause analysis specific to AI (data issues, model issues, integration issues).\n5. Verify that lessons learned feed back into AI risk assessments and development practices.',
          evidenceHint: 'AI incident classification; response procedures; incident logs; root cause analyses; lessons learned records.',
        },
        {
          requirementCode: 'AOP-04',
          title: 'AI System Feedback & Improvement',
          description: 'The organization must establish feedback mechanisms for AI system users and affected parties.',
          guidance: '1. Verify that feedback channels exist for users to report AI system issues or concerns.\n2. Check that feedback is collected, analysed, and acted upon.\n3. Verify that affected individuals can request human review of AI decisions.\n4. Check that feedback data is used to improve AI system performance and fairness.\n5. Verify that the organization tracks and reports on feedback trends and resolution.',
          evidenceHint: 'Feedback mechanisms; feedback analysis reports; human review request process; improvement tracking; trend reports.',
        },
      ],
    },
    {
      code: 'AIA',
      name: 'AI Impact Assessment',
      requirements: [
        {
          requirementCode: 'AIA-01',
          title: 'AI Impact Assessment Process',
          description: 'The organization must conduct impact assessments for AI systems to evaluate potential effects on individuals and society.',
          guidance: '1. Verify that AI impact assessments are required for high-risk AI systems.\n2. Check that assessments cover: impacts on fundamental rights, societal effects, environmental impact, and economic effects.\n3. Verify that stakeholder consultation is part of the assessment process.\n4. Check that assessment results inform risk treatment decisions.\n5. Verify that assessments are reviewed when AI systems change significantly.',
          evidenceHint: 'AI impact assessment methodology; completed assessments; stakeholder consultation records; risk treatment linkage.',
        },
        {
          requirementCode: 'AIA-02',
          title: 'Environmental Impact of AI',
          description: 'The organization must consider and mitigate the environmental impact of AI systems.',
          guidance: '1. Check whether the organization measures the energy consumption and carbon footprint of AI training and operations.\n2. Verify that environmental considerations are part of AI system design decisions.\n3. Check that efficiency optimization (model compression, efficient architectures) is considered.\n4. Verify that cloud/infrastructure selection considers environmental factors.\n5. Check that environmental impact is reported to management.',
          evidenceHint: 'Energy consumption records; carbon footprint estimates; efficiency optimization evidence; infrastructure selection criteria; environmental reports.',
        },
        {
          requirementCode: 'AIA-03',
          title: 'Third-Party AI Provider Assessment',
          description: 'The organization must assess and manage risks from third-party AI systems and services.',
          guidance: '1. Verify that third-party AI providers are identified and inventoried.\n2. Check that risk assessments are conducted for third-party AI components (APIs, models, platforms).\n3. Verify that contracts include requirements for: transparency, data handling, model updates notification, and audit rights.\n4. Check that ongoing monitoring of third-party AI performance and risk is in place.\n5. Verify that exit strategies exist for critical third-party AI dependencies.',
          evidenceHint: 'Third-party AI inventory; risk assessments; contract clauses; monitoring records; exit strategies.',
        },
      ],
    },
  ],
};

// ============================================
// 7. DPDPA 2023 — Digital Personal Data Protection
// ============================================
const dpdpaAssessment: FrameworkDef = {
  slug: 'dpdpa-assessment',
  name: 'DPDPA 2023 — Digital Personal Data Protection Act Assessment',
  shortName: 'DPDPA',
  description: 'Assessment against India\'s Digital Personal Data Protection Act 2023, covering data principal rights, consent management, data fiduciary obligations, cross-border transfer requirements, and enforcement provisions for organizations processing digital personal data.',
  domains: [
    {
      code: 'CON',
      name: 'Consent & Notice Requirements',
      requirements: [
        {
          requirementCode: 'CON-01',
          title: 'Lawful Basis for Processing',
          description: 'The Data Fiduciary must process personal data only for lawful purposes with a valid basis — either consent or legitimate uses.',
          guidance: '1. Verify that the organization has mapped all personal data processing activities.\n2. Check that each processing activity has an identified lawful basis (consent or specified legitimate use under Section 7).\n3. Verify that legitimate use claims are properly documented and justified.\n4. Check that processing purposes are clearly defined and not vague or overly broad.\n5. Verify that the organization does not process data beyond what is necessary for the stated purpose.',
          evidenceHint: 'Data processing register; lawful basis documentation per activity; purpose limitation records; data flow maps.',
        },
        {
          requirementCode: 'CON-02',
          title: 'Consent Collection & Management',
          description: 'Consent must be free, specific, informed, unconditional, and unambiguous, with a clear affirmative action.',
          guidance: '1. Verify that consent mechanisms meet DPDPA requirements: free, specific, informed, unconditional, unambiguous, and given by clear affirmative action.\n2. Check that consent is collected separately for each distinct purpose.\n3. Verify that consent is not bundled with terms of service or made a precondition for service (unless necessary).\n4. Check that consent records are maintained with timestamps and version details.\n5. Verify that consent forms are available in English and the 22 scheduled languages as specified.',
          evidenceHint: 'Consent forms/mechanisms; consent records with timestamps; language availability evidence; purpose-specific consent separation.',
        },
        {
          requirementCode: 'CON-03',
          title: 'Notice to Data Principals',
          description: 'Data Fiduciaries must provide clear notice to Data Principals describing the personal data being collected and the purpose of processing.',
          guidance: '1. Verify that privacy notices are provided at or before the point of data collection.\n2. Check that notices include: identity of the Data Fiduciary, personal data being collected, purpose of processing, rights of the Data Principal, and how to file complaints.\n3. Verify notices are in clear, plain language.\n4. Check that notices are available in English and applicable scheduled languages.\n5. Verify that notices are updated when processing purposes change.',
          evidenceHint: 'Privacy notices; notice delivery mechanisms; language versions; notice update records; notice content review.',
        },
        {
          requirementCode: 'CON-04',
          title: 'Consent Withdrawal Mechanism',
          description: 'Data Principals must be able to withdraw consent at any time with the same ease as giving consent.',
          guidance: '1. Verify that a consent withdrawal mechanism is available and easily accessible.\n2. Check that withdrawal is as easy as giving consent (no additional barriers or friction).\n3. Verify that upon withdrawal, the organization ceases processing within a reasonable timeframe.\n4. Check that the consequences of withdrawal are communicated to the Data Principal.\n5. Verify that withdrawal records are maintained.\n6. Check that withdrawal of consent does not affect the lawfulness of processing done prior to withdrawal.',
          evidenceHint: 'Withdrawal mechanism (UI/form); withdrawal process documentation; response timelines; withdrawal records; consequence communication.',
        },
        {
          requirementCode: 'CON-05',
          title: 'Consent for Children\'s Data',
          description: 'Processing of children\'s personal data requires verifiable consent of the parent or lawful guardian.',
          guidance: '1. Verify that the organization has mechanisms to identify when data subjects are children (under 18).\n2. Check that verifiable parental/guardian consent is obtained before processing children\'s data.\n3. Verify that the consent mechanism provides reasonable assurance of parental identity.\n4. Check that the organization does not engage in tracking, behavioural monitoring, or targeted advertising directed at children.\n5. Verify that processing of children\'s data is limited to what is in the best interest of the child.',
          evidenceHint: 'Age verification mechanism; parental consent process; consent records; children\'s data processing policy; advertising/tracking controls.',
        },
      ],
    },
    {
      code: 'DPR',
      name: 'Data Principal Rights',
      requirements: [
        {
          requirementCode: 'DPR-01',
          title: 'Right to Access Information',
          description: 'Data Principals have the right to obtain a summary of their personal data being processed and the processing activities.',
          guidance: '1. Verify that a mechanism exists for Data Principals to request access to their personal data.\n2. Check that the response includes: summary of personal data, processing activities, and categories of third parties with whom data has been shared.\n3. Verify that access requests are fulfilled within the prescribed timeframe.\n4. Check that the identity of the requestor is verified before providing access.\n5. Verify that the response format is clear and accessible to the Data Principal.',
          evidenceHint: 'Access request mechanism; response templates; identity verification process; response timelines; sample fulfilled requests.',
        },
        {
          requirementCode: 'DPR-02',
          title: 'Right to Correction & Erasure',
          description: 'Data Principals have the right to request correction of inaccurate/misleading data, completion of incomplete data, updating of data, and erasure of data.',
          guidance: '1. Verify that mechanisms exist for Data Principals to request correction, completion, updating, and erasure.\n2. Check that the organization responds within prescribed timelines.\n3. Verify that corrections/erasures are propagated to third parties with whom data was shared.\n4. Check that erasure is complete (including backups within a reasonable timeframe).\n5. Verify that exceptions to erasure are properly documented (legal retention requirements).\n6. Check that the organization maintains records of correction/erasure actions.',
          evidenceHint: 'Correction/erasure request mechanism; processing timelines; third-party notification records; erasure verification; exception documentation.',
        },
        {
          requirementCode: 'DPR-03',
          title: 'Right to Grievance Redressal',
          description: 'Data Principals have the right to have their grievances addressed by the Data Fiduciary.',
          guidance: '1. Verify that a grievance redressal mechanism is in place and accessible.\n2. Check that a Consent Manager or designated point of contact handles grievances.\n3. Verify that grievances are acknowledged and addressed within prescribed timelines.\n4. Check that the grievance process is documented and communicated to Data Principals.\n5. Verify that the organization maintains records of grievances and resolutions.\n6. Check that Data Principals are informed of their right to approach the Data Protection Board if unsatisfied.',
          evidenceHint: 'Grievance redressal policy; contact details; response timelines; grievance log; resolution records; escalation to DPB guidance.',
        },
        {
          requirementCode: 'DPR-04',
          title: 'Right to Nominate',
          description: 'Data Principals have the right to nominate another individual to exercise their rights in case of death or incapacity.',
          guidance: '1. Verify that a nomination mechanism exists for Data Principals.\n2. Check that the nomination process is documented and accessible.\n3. Verify that nominated individuals can exercise all rights of the Data Principal.\n4. Check that there are verification procedures for nominees.\n5. Verify that nomination records are securely maintained.',
          evidenceHint: 'Nomination form/mechanism; nomination process documentation; nominee verification procedures; nomination records.',
        },
      ],
    },
    {
      code: 'DFO',
      name: 'Data Fiduciary Obligations',
      requirements: [
        {
          requirementCode: 'DFO-01',
          title: 'Purpose Limitation & Data Minimization',
          description: 'Personal data must be processed only for the specific purpose for which it was collected and limited to what is necessary.',
          guidance: '1. Verify that personal data is collected only for specified, clear purposes.\n2. Check that data collection is limited to what is necessary for the stated purpose.\n3. Verify that data is not repurposed without obtaining fresh consent.\n4. Check that data retention is limited to the period necessary for the purpose.\n5. Verify that the organization has procedures to erase data when the purpose is fulfilled.',
          evidenceHint: 'Data processing register with purposes; data minimization assessment; retention schedules; erasure procedures; purpose limitation controls.',
        },
        {
          requirementCode: 'DFO-02',
          title: 'Data Accuracy & Completeness',
          description: 'The Data Fiduciary must ensure the accuracy, completeness, and consistency of personal data, especially when it affects decisions about the Data Principal or is shared with others.',
          guidance: '1. Verify that data accuracy procedures are in place.\n2. Check that mechanisms exist for Data Principals to update their data.\n3. Verify that data validation controls exist at the point of collection.\n4. Check that periodic data quality reviews are conducted.\n5. Verify that inaccurate data is corrected or deleted promptly when identified.',
          evidenceHint: 'Data accuracy policy; validation controls; data quality review reports; correction procedures; Data Principal update mechanism.',
        },
        {
          requirementCode: 'DFO-03',
          title: 'Data Breach Notification',
          description: 'The Data Fiduciary must notify the Data Protection Board and affected Data Principals of personal data breaches.',
          guidance: '1. Verify that a data breach response plan exists and covers DPDPA requirements.\n2. Check that the plan includes notification to the Data Protection Board of India in prescribed form and manner.\n3. Verify that notification to affected Data Principals is also provided.\n4. Check that breach notification timelines comply with DPDPA requirements.\n5. Verify that the organization maintains records of all breaches and notifications.\n6. Check that post-breach remediation measures are documented and implemented.',
          evidenceHint: 'Breach response plan; notification templates; DPB notification procedure; breach register; remediation records; notification timelines.',
        },
        {
          requirementCode: 'DFO-04',
          title: 'Data Processor Management',
          description: 'The Data Fiduciary must ensure that Data Processors engaged for processing personal data comply with DPDPA requirements.',
          guidance: '1. Verify that all Data Processors are identified and documented.\n2. Check that contracts with Data Processors include DPDPA compliance obligations.\n3. Verify that Data Processors are assessed for adequacy of security measures.\n4. Check that the Data Fiduciary monitors Data Processor compliance.\n5. Verify that Data Processor sub-contracting is controlled and approved.\n6. Check that Data Processors are required to delete data upon termination of the processing relationship.',
          evidenceHint: 'Data Processor register; contracts with DPDPA clauses; security assessments; monitoring records; sub-processing approvals; deletion provisions.',
        },
        {
          requirementCode: 'DFO-05',
          title: 'Reasonable Security Safeguards',
          description: 'The Data Fiduciary must implement reasonable security safeguards to protect personal data from breaches.',
          guidance: '1. Verify that technical security measures are in place (encryption, access controls, network security).\n2. Check that organizational measures are implemented (policies, training, incident response).\n3. Verify that security measures are proportionate to the volume and sensitivity of data processed.\n4. Check that regular security assessments/audits are conducted.\n5. Verify that security safeguards address all stages: collection, storage, processing, transfer, and disposal.',
          evidenceHint: 'Security policy; technical controls evidence; organizational measures; security audit reports; risk assessment records.',
        },
      ],
    },
    {
      code: 'SDF',
      name: 'Significant Data Fiduciary Obligations',
      requirements: [
        {
          requirementCode: 'SDF-01',
          title: 'Data Protection Officer Appointment',
          description: 'Significant Data Fiduciaries must appoint a Data Protection Officer based in India.',
          guidance: '1. Determine if the organization qualifies as a Significant Data Fiduciary (based on volume/sensitivity of data, risk of harm, or government notification).\n2. If applicable, verify that a DPO has been appointed and is based in India.\n3. Check that the DPO has appropriate qualifications and independence.\n4. Verify that the DPO\'s contact details are published and communicated to the Data Protection Board.\n5. Check that the DPO\'s responsibilities are clearly defined and include representing the organization to the DPB.',
          evidenceHint: 'DPO appointment letter; DPO qualifications; DPB notification; published contact details; responsibility matrix.',
        },
        {
          requirementCode: 'SDF-02',
          title: 'Data Protection Impact Assessment',
          description: 'Significant Data Fiduciaries must conduct Data Protection Impact Assessments for high-risk processing activities.',
          guidance: '1. Verify that DPIAs are conducted for processing activities that pose significant risk to Data Principals.\n2. Check that the DPIA methodology covers: description of processing, necessity assessment, risk assessment, and mitigating measures.\n3. Verify that DPIAs are reviewed and approved by the DPO.\n4. Check that DPIA findings are acted upon before processing commences.\n5. Verify that DPIAs are updated when processing activities change significantly.',
          evidenceHint: 'DPIA methodology; completed DPIAs; DPO review/approval records; mitigation action plans; DPIA update records.',
        },
        {
          requirementCode: 'SDF-03',
          title: 'Periodic Data Audit',
          description: 'Significant Data Fiduciaries must conduct periodic audits of their data processing practices.',
          guidance: '1. Verify that periodic data audits are planned and conducted (at least annually).\n2. Check that audits cover: compliance with DPDPA provisions, effectiveness of security measures, consent management, data principal rights fulfilment, and cross-border transfers.\n3. Verify that audits are conducted by an independent data auditor.\n4. Check that audit findings are reported to management and the DPB as prescribed.\n5. Verify that remediation of audit findings is tracked to completion.',
          evidenceHint: 'Audit plan; audit reports; independent auditor appointment; DPB reporting; remediation tracker; management reports.',
        },
        {
          requirementCode: 'SDF-04',
          title: 'Algorithmic Processing Safeguards',
          description: 'Significant Data Fiduciaries using algorithmic processing that may significantly affect Data Principals must implement additional safeguards.',
          guidance: '1. Identify if the organization uses algorithmic/automated decision-making that significantly affects Data Principals.\n2. If applicable, verify that impact assessments specific to algorithmic processing are conducted.\n3. Check that human oversight mechanisms exist for high-impact algorithmic decisions.\n4. Verify that Data Principals can request information about algorithmic decision-making logic.\n5. Check that algorithmic systems are tested for bias and fairness.',
          evidenceHint: 'Algorithmic processing inventory; impact assessments; human oversight procedures; transparency mechanisms; bias testing records.',
        },
      ],
    },
    {
      code: 'XBT',
      name: 'Cross-Border Data Transfer',
      requirements: [
        {
          requirementCode: 'XBT-01',
          title: 'Transfer Restriction Compliance',
          description: 'Personal data may only be transferred outside India to countries/territories not restricted by the Central Government.',
          guidance: '1. Identify all cross-border personal data transfers.\n2. Verify that destination countries are not on the restricted list notified by the Central Government.\n3. Check that transfers are documented with purpose, data categories, and destination.\n4. Verify that the organization monitors government notifications regarding restricted territories.\n5. Check that procedures exist to halt transfers if a country is newly restricted.',
          evidenceHint: 'Cross-border transfer register; destination country assessment; government notification monitoring; transfer halt procedures.',
        },
        {
          requirementCode: 'XBT-02',
          title: 'Contractual Safeguards for Transfers',
          description: 'The organization must ensure adequate safeguards are in place for cross-border transfers through contractual and technical measures.',
          guidance: '1. Verify that contracts with overseas recipients include data protection obligations.\n2. Check that security measures required for transferred data are specified.\n3. Verify that the overseas recipient\'s compliance is monitored.\n4. Check that the organization can demonstrate adequate protection for transferred data.\n5. Verify that Data Principals are informed about cross-border transfers in the privacy notice.',
          evidenceHint: 'Transfer agreements; security requirements in contracts; compliance monitoring records; privacy notice transfer disclosures.',
        },
        {
          requirementCode: 'XBT-03',
          title: 'Government & Regulatory Access',
          description: 'The organization must comply with requirements regarding government access to personal data and cooperation with regulatory authorities.',
          guidance: '1. Verify that the organization understands its obligations to provide data access to the Indian government when lawfully requested.\n2. Check that procedures exist for handling government data access requests.\n3. Verify that the organization cooperates with the Data Protection Board as required.\n4. Check that records of government/regulatory data access are maintained.\n5. Verify that the organization can comply with data localization requirements if notified by the Central Government.',
          evidenceHint: 'Government access request procedures; DPB cooperation procedures; access request log; data localization assessment.',
        },
      ],
    },
    {
      code: 'ENF',
      name: 'Compliance & Enforcement Preparedness',
      requirements: [
        {
          requirementCode: 'ENF-01',
          title: 'Penalty Awareness & Risk Assessment',
          description: 'The organization must understand the penalty provisions of DPDPA and assess its exposure.',
          guidance: '1. Verify that the organization is aware of DPDPA penalty provisions (up to INR 250 crore for certain violations).\n2. Check that a compliance risk assessment has been conducted identifying areas of highest penalty exposure.\n3. Verify that the risk assessment is regularly reviewed.\n4. Check that remediation is prioritized based on penalty exposure.\n5. Verify that the board/management is informed of compliance risk posture.',
          evidenceHint: 'Penalty provision analysis; compliance risk assessment; prioritized remediation plan; management reports.',
        },
        {
          requirementCode: 'ENF-02',
          title: 'Compliance Programme & Documentation',
          description: 'The organization must maintain a comprehensive DPDPA compliance programme with appropriate documentation.',
          guidance: '1. Verify that a DPDPA compliance programme exists with defined scope, responsibilities, and activities.\n2. Check that all compliance documentation is maintained and current (processing register, consent records, notices, DPIAs, breach records, etc.).\n3. Verify that compliance training is provided to relevant staff.\n4. Check that compliance reviews are conducted periodically.\n5. Verify that the organization can demonstrate compliance to the Data Protection Board upon request.',
          evidenceHint: 'Compliance programme document; documentation inventory; training records; compliance review reports; DPB readiness assessment.',
        },
        {
          requirementCode: 'ENF-03',
          title: 'Data Protection Board Engagement Readiness',
          description: 'The organization must be prepared to engage with the Data Protection Board of India as required.',
          guidance: '1. Verify that the organization has identified the designated contact/representative for DPB engagement.\n2. Check that procedures exist for responding to DPB inquiries and directions.\n3. Verify that the organization can provide required information within prescribed timelines.\n4. Check that documentation is organized to support DPB audit or investigation.\n5. Verify awareness of the DPB complaint and adjudication process.',
          evidenceHint: 'DPB contact designation; response procedures; documentation organization; timeline compliance records; DPB process awareness training.',
        },
      ],
    },
  ],
};

// ============================================
// Export all framework definitions
// ============================================
export const ASSESSMENT_FRAMEWORKS: FrameworkDef[] = [
  fcaOperationalResilience,
  fcaSafeguarding,
  fcaRep018,
  iso27001Assessment,
  doraFramework,
  iso42001Assessment,
  dpdpaAssessment,
];

export function getFrameworkBySlug(slug: string): FrameworkDef | undefined {
  return ASSESSMENT_FRAMEWORKS.find(f => f.slug === slug);
}

export function getRequirementCount(framework: FrameworkDef): number {
  return framework.domains.reduce((total, domain) => total + domain.requirements.length, 0);
}
