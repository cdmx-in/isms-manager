import { PrismaClient, Role, ImplementationStatus, SoAStatus, ApprovalStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { riskUsers, ownerEmailMap, risks, riskTreatments, riskRegisterVersions } from './riskSeedData.js';

const prisma = new PrismaClient();

// All 93 ISO 27001:2022 Annex A controls with full descriptions
const controls: Array<{
  controlId: string;
  name: string;
  description: string;
  category: string;
}> = [
  // ============================================
  // A.5 Organizational controls (37 controls)
  // ============================================
  {
    controlId: 'A.5.1',
    name: 'Policies for information security',
    description: 'An information security policy and topic-specific policies shall be defined, approved by management, published, communicated to and acknowledged by relevant personnel and relevant interested parties, and reviewed at planned intervals and if significant changes occur.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.2',
    name: 'Information security roles and responsibilities',
    description: 'Information security roles and responsibilities shall be defined and allocated.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.3',
    name: 'Segregation of duties',
    description: 'Conflicting duties and conflicting areas of responsibility shall be segregated.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.4',
    name: 'Management responsibilities',
    description: 'Management shall require all personnel to apply information security in accordance with the established information security policy, topic-specific policies and procedures of the organization.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.5',
    name: 'Contact with authorities',
    description: 'The organization shall establish and maintain contact with relevant authorities.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.6',
    name: 'Contact with special interest groups',
    description: 'The organization shall establish and maintain contact with special interest groups or other specialist security forums and professional associations.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.7',
    name: 'Threat intelligence',
    description: 'Information relating to information security threats shall be collected and analysed to produce threat intelligence.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.8',
    name: 'Information security in project management',
    description: 'Information security shall be integrated into project management.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.9',
    name: 'Inventory of information and other associated assets',
    description: 'An inventory of information and other associated assets, including owners, shall be developed and maintained.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.10',
    name: 'Acceptable use of information and other associated assets',
    description: 'Rules for the acceptable use of information and other associated assets shall be identified, documented and implemented.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.11',
    name: 'Return of assets',
    description: "Personnel and other interested parties as appropriate shall return all the organization's assets in their possession upon change or termination of their employment, contract or agreement.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.12',
    name: 'Classification of information',
    description: 'Information shall be classified according to the information security needs of the organization based on confidentiality, integrity, availability and relevant interested party requirements.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.13',
    name: 'Labelling of information',
    description: 'An appropriate set of procedures for information labelling shall be developed and implemented in accordance with the information classification scheme adopted by the organization.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.14',
    name: 'Information transfer',
    description: 'Information transfer rules, procedures, or agreements shall be in place for all types of transfer facilities within the organization and between the organization and other parties.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.15',
    name: 'Access control',
    description: 'Rules to control physical and logical access to information and other associated assets shall be established and implemented based on business and information security requirements.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.16',
    name: 'Identity management',
    description: 'The full life cycle of identities shall be managed.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.17',
    name: 'Authentication information',
    description: 'Allocation and management of authentication information shall be controlled by a management process, including advising personnel on appropriate handling of authentication information.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.18',
    name: 'Access rights',
    description: "Access rights to information and other associated assets shall be provisioned, reviewed, modified and removed in accordance with the organization's topic-specific policy on and rules for access control.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.19',
    name: 'Information security in supplier relationships',
    description: "Processes and procedures shall be defined and implemented to manage the information security risks associated with the use of supplier's products or services.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.20',
    name: 'Addressing information security within supplier agreements',
    description: 'Relevant information security requirements shall be established and agreed with each supplier based on the type of supplier relationship.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.21',
    name: 'Managing information security in the ICT supply chain',
    description: 'Processes and procedures shall be defined and implemented to manage the information security risks associated with the ICT products and services supply chain.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.22',
    name: 'Monitoring, review and change management of supplier services',
    description: 'The organization shall regularly monitor, review, evaluate and manage change in supplier information security practices and service delivery.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.23',
    name: 'Information security for use of cloud services',
    description: "Processes for acquisition, use, management and exit from cloud services shall be established in accordance with the organization's information security requirements.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.24',
    name: 'Information security incident management planning and preparation',
    description: 'The organization shall plan and prepare for managing information security incidents by defining, establishing and communicating information security incident management processes, roles and responsibilities.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.25',
    name: 'Assessment and decision on information security events',
    description: 'The organization shall assess information security events and decide if they are to be categorized as information security incidents.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.26',
    name: 'Response to information security incidents',
    description: 'Information security incidents shall be responded to in accordance with the documented procedures.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.27',
    name: 'Learning from information security incidents',
    description: 'Knowledge gained from information security incidents shall be used to strengthen and improve the information security controls.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.28',
    name: 'Collection of evidence',
    description: 'The organization shall establish and implement procedures for the identification, collection, acquisition and preservation of evidence related to information security events.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.29',
    name: 'Information security during disruption',
    description: 'The organization shall plan how to maintain information security at an appropriate level during disruption.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.30',
    name: 'ICT readiness for business continuity',
    description: 'ICT readiness shall be planned, implemented, maintained and tested based on business continuity objectives and ICT continuity requirements.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.31',
    name: 'Legal, statutory, regulatory and contractual requirements',
    description: "Legal, statutory, regulatory and contractual requirements relevant to information security and the organization's approach to meet these requirements shall be identified, documented and kept up to date.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.32',
    name: 'Intellectual property rights',
    description: 'The organization shall implement appropriate procedures to protect intellectual property rights.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.33',
    name: 'Protection of records',
    description: 'Records shall be protected from loss, destruction, falsification, unauthorized access and unauthorized release.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.34',
    name: 'Privacy and protection of PII',
    description: 'The organization shall identify and meet the requirements regarding the preservation of privacy and protection of PII according to applicable laws and regulations and contractual requirements.',
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.35',
    name: 'Independent review of information security',
    description: "The organization's approach to managing information security and its implementation including people, processes and technologies shall be reviewed independently at planned intervals, or when significant changes occur.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.36',
    name: 'Compliance with policies, rules and standards for information security',
    description: "Compliance with the organization's information security policy, topic-specific policies, rules and standards shall be regularly reviewed.",
    category: 'A5_ORGANIZATIONAL',
  },
  {
    controlId: 'A.5.37',
    name: 'Documented operating procedures',
    description: 'Operating procedures for information processing facilities shall be documented and made available to personnel who need them.',
    category: 'A5_ORGANIZATIONAL',
  },

  // ============================================
  // A.6 People controls (8 controls)
  // ============================================
  {
    controlId: 'A.6.1',
    name: 'Screening',
    description: 'Background verification checks on all candidates to become personnel shall be carried out prior to joining the organization and on an ongoing basis taking into consideration applicable laws, regulations and ethics and be proportional to the business requirements, the classification of the information to be accessed and the perceived risks.',
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.2',
    name: 'Terms and conditions of employment',
    description: "The employment contractual agreements shall state the personnel's and the organization's responsibilities for information security.",
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.3',
    name: 'Information security awareness, education and training',
    description: "Personnel of the organization and relevant interested parties shall receive appropriate information security awareness, education and training and regular updates of the organization's information security policy, topic-specific policies and procedures, as relevant for their job function.",
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.4',
    name: 'Disciplinary process',
    description: 'A disciplinary process shall be formalized and communicated to take actions against personnel and other relevant interested parties who have committed an information security policy violation.',
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.5',
    name: 'Responsibilities after termination or change of employment',
    description: 'Information security responsibilities and duties that remain valid after termination or change of employment shall be defined, enforced and communicated to relevant personnel and other interested parties.',
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.6',
    name: 'Confidentiality or non-disclosure agreements',
    description: "Confidentiality or non-disclosure agreements reflecting the organization's needs for the protection of information shall be identified, documented, regularly reviewed and signed by personnel and other relevant interested parties.",
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.7',
    name: 'Remote working',
    description: "Security measures shall be implemented when personnel are working remotely to protect information accessed, processed or stored outside the organization's premises.",
    category: 'A6_PEOPLE',
  },
  {
    controlId: 'A.6.8',
    name: 'Information security event reporting',
    description: 'The organization shall provide a mechanism for personnel to report observed or suspected information security events through appropriate channels in a timely manner.',
    category: 'A6_PEOPLE',
  },

  // ============================================
  // A.7 Physical controls (14 controls)
  // ============================================
  {
    controlId: 'A.7.1',
    name: 'Physical security perimeters',
    description: 'Security perimeters shall be defined and used to protect areas that contain information and other associated assets.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.2',
    name: 'Physical entry',
    description: 'Secure areas shall be protected by appropriate entry controls and access points.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.3',
    name: 'Securing offices, rooms and facilities',
    description: 'Physical security for offices, rooms and facilities shall be designed and implemented.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.4',
    name: 'Physical security monitoring',
    description: 'Premises shall be continuously monitored for unauthorized physical access.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.5',
    name: 'Protecting against physical and environmental threats',
    description: 'Protection against physical and environmental threats, such as natural disasters and other intentional or unintentional physical threats to infrastructure shall be designed and implemented.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.6',
    name: 'Working in secure areas',
    description: 'Security measures for working in secure areas shall be designed and implemented.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.7',
    name: 'Clear desk and clear screen',
    description: 'Clear desk rules for papers and removable storage media and clear screen rules for information processing facilities shall be defined and appropriately enforced.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.8',
    name: 'Equipment siting and protection',
    description: 'Equipment shall be sited securely and protected.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.9',
    name: 'Security of assets off-premises',
    description: 'Off-site assets shall be protected.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.10',
    name: 'Storage media',
    description: "Storage media shall be managed through their life cycle of acquisition, use, transportation and disposal in accordance with the organization's classification scheme and handling requirements.",
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.11',
    name: 'Supporting utilities',
    description: 'Information processing facilities shall be protected from power failures and other disruptions caused by failures in supporting utilities.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.12',
    name: 'Cabling security',
    description: 'Cables carrying power, data or supporting information services shall be protected from interception, interference or damage.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.13',
    name: 'Equipment maintenance',
    description: 'Equipment shall be maintained correctly to ensure availability, integrity and confidentiality of information.',
    category: 'A7_PHYSICAL',
  },
  {
    controlId: 'A.7.14',
    name: 'Secure disposal or re-use of equipment',
    description: 'Items of equipment containing storage media shall be verified to ensure that any sensitive data and licensed software has been removed or securely overwritten prior to disposal or re-use.',
    category: 'A7_PHYSICAL',
  },

  // ============================================
  // A.8 Technological controls (34 controls)
  // ============================================
  {
    controlId: 'A.8.1',
    name: 'User endpoint devices',
    description: 'Information stored on, processed by or accessible via user endpoint devices shall be protected.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.2',
    name: 'Privileged access rights',
    description: 'The allocation and use of privileged access rights shall be restricted and managed.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.3',
    name: 'Information access restriction',
    description: 'Access to information and other associated assets shall be restricted in accordance with the established topic-specific policy on access control.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.4',
    name: 'Access to source code',
    description: 'Read and write access to source code, development tools and software libraries shall be appropriately managed.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.5',
    name: 'Secure authentication',
    description: 'Secure authentication technologies and procedures shall be established and implemented based on information access restrictions and the topic-specific policy on access control.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.6',
    name: 'Capacity management',
    description: 'The use of resources shall be monitored and adjusted in line with current and expected capacity requirements.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.7',
    name: 'Protection against malware',
    description: 'Protection against malware shall be implemented and supported by appropriate user awareness.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.8',
    name: 'Management of technical vulnerabilities',
    description: "Information about technical vulnerabilities of information systems in use shall be obtained, the organization's exposure to such vulnerabilities shall be evaluated and appropriate measures shall be taken.",
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.9',
    name: 'Configuration management',
    description: 'Configurations, including security configurations, of hardware, software, services and networks shall be established, documented, implemented, monitored and reviewed.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.10',
    name: 'Information deletion',
    description: 'Information stored in information systems, devices or in any other storage media shall be deleted when no longer required.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.11',
    name: 'Data masking',
    description: "Data masking shall be used in accordance with the organization's topic-specific policy on access control and other related topic-specific policies, and business requirements, taking applicable legislation into consideration.",
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.12',
    name: 'Data leakage prevention',
    description: 'Data leakage prevention measures shall be applied to systems, networks and any other devices that process, store or transmit sensitive information.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.13',
    name: 'Information backup',
    description: 'Backup copies of information, software and systems shall be maintained and regularly tested in accordance with the agreed topic-specific policy on backup.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.14',
    name: 'Redundancy of information processing facilities',
    description: 'Information processing facilities shall be implemented with redundancy sufficient to meet availability requirements.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.15',
    name: 'Logging',
    description: 'Logs that record activities, exceptions, faults and other relevant events shall be produced, stored, protected and analysed.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.16',
    name: 'Monitoring activities',
    description: 'Networks, systems and applications shall be monitored for anomalous behaviour and appropriate actions taken to evaluate potential information security incidents.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.17',
    name: 'Clock synchronization',
    description: 'The clocks of information processing systems used by the organization shall be synchronized to approved time sources.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.18',
    name: 'Use of privileged utility programs',
    description: 'The use of utility programs that can be capable of overriding system and application controls shall be restricted and tightly controlled.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.19',
    name: 'Installation of software on operational systems',
    description: 'Procedures and measures shall be implemented to securely manage software installation on operational systems.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.20',
    name: 'Networks security',
    description: 'Networks and network devices shall be secured, managed and controlled to protect information in systems and applications.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.21',
    name: 'Security of network services',
    description: 'Security mechanisms, service levels and service requirements of network services shall be identified, implemented and monitored.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.22',
    name: 'Segregation of networks',
    description: "Groups of information services, users and information systems shall be segregated in the organization's networks.",
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.23',
    name: 'Web filtering',
    description: 'Access to external websites shall be managed to reduce exposure to malicious content.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.24',
    name: 'Use of cryptography',
    description: 'Rules for the effective use of cryptography, including cryptographic key management, shall be defined and implemented.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.25',
    name: 'Secure development life cycle',
    description: 'Rules for the secure development of software and systems shall be established and applied.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.26',
    name: 'Application security requirements',
    description: 'Information security requirements shall be identified, specified and approved when developing or acquiring applications.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.27',
    name: 'Secure system architecture and engineering principles',
    description: 'Principles for engineering secure systems shall be established, documented, maintained and applied to any information system development activities.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.28',
    name: 'Secure coding',
    description: 'Secure coding principles shall be applied to software development.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.29',
    name: 'Security testing in development and acceptance',
    description: 'Security testing processes shall be defined and implemented in the development life cycle.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.30',
    name: 'Outsourced development',
    description: 'The organization shall direct, monitor and review the activities related to outsourced system development.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.31',
    name: 'Separation of development, test and production environments',
    description: 'Development, testing and production environments shall be separated and secured.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.32',
    name: 'Change management',
    description: 'Changes to information processing facilities and information systems shall be subject to change management procedures.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.33',
    name: 'Test information',
    description: 'Test information shall be appropriately selected, protected and managed.',
    category: 'A8_TECHNOLOGICAL',
  },
  {
    controlId: 'A.8.34',
    name: 'Protection of information systems during audit testing',
    description: 'Audit tests and other assurance activities involving assessment of operational systems shall be planned and agreed between the tester and appropriate management.',
    category: 'A8_TECHNOLOGICAL',
  },
];

// ISO/IEC 42001:2023 AI Management System Controls
const iso42001Controls: Array<{
  controlId: string;
  name: string;
  description: string;
  category: string;
}> = [
  { controlId: 'AI.2.1', name: 'AI policy', description: 'An AI policy shall be established, approved by top management, published, communicated, and reviewed.', category: 'AI_POLICIES' },
  { controlId: 'AI.2.2', name: 'AI roles and responsibilities', description: 'Roles and responsibilities for AI governance shall be defined and allocated.', category: 'AI_POLICIES' },
  { controlId: 'AI.2.3', name: 'AI system inventory', description: 'An inventory of AI systems shall be developed and maintained.', category: 'AI_POLICIES' },
  { controlId: 'AI.3.1', name: 'Internal organization for AI', description: 'Internal organizational structure shall support responsible AI development and deployment.', category: 'AI_INTERNAL_ORG' },
  { controlId: 'AI.3.2', name: 'AI competence', description: 'Personnel working with AI shall be competent on the basis of appropriate education, training, or experience.', category: 'AI_INTERNAL_ORG' },
  { controlId: 'AI.3.3', name: 'AI awareness', description: 'Personnel shall be aware of AI-related risks, policies, and their responsibilities.', category: 'AI_INTERNAL_ORG' },
  { controlId: 'AI.4.1', name: 'Resources for AI', description: 'The organization shall determine and provide resources needed for AI management.', category: 'AI_RESOURCES' },
  { controlId: 'AI.4.2', name: 'AI competence and training', description: 'Training programs shall ensure personnel have the necessary AI skills.', category: 'AI_RESOURCES' },
  { controlId: 'AI.5.1', name: 'AI impact assessment', description: 'An AI impact assessment shall be conducted to identify and evaluate impacts.', category: 'AI_IMPACT_ASSESSMENT' },
  { controlId: 'AI.5.2', name: 'AI risk assessment', description: 'AI-specific risks shall be assessed and managed systematically.', category: 'AI_IMPACT_ASSESSMENT' },
  { controlId: 'AI.5.3', name: 'AI risk treatment', description: 'Risk treatment plans shall be established for identified AI risks.', category: 'AI_IMPACT_ASSESSMENT' },
  { controlId: 'AI.5.4', name: 'Responsible AI principles', description: 'Principles for responsible AI shall be defined and applied across AI activities.', category: 'AI_IMPACT_ASSESSMENT' },
  { controlId: 'AI.6.1', name: 'AI system lifecycle management', description: 'The AI system lifecycle shall be managed from conception through retirement.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.2', name: 'AI design and development', description: 'AI systems shall be designed and developed following established standards and practices.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.3', name: 'AI testing and validation', description: 'AI systems shall be thoroughly tested and validated before deployment.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.4', name: 'AI deployment', description: 'AI system deployment shall be managed with appropriate controls and monitoring.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.5', name: 'AI monitoring and review', description: 'Deployed AI systems shall be continuously monitored and periodically reviewed.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.6', name: 'AI system changes', description: 'Changes to AI systems shall be managed through a controlled change management process.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.6.7', name: 'AI system retirement', description: 'AI system retirement shall be planned and executed to minimize impact.', category: 'AI_LIFECYCLE' },
  { controlId: 'AI.7.1', name: 'Data for AI systems', description: 'Data used in AI systems shall be appropriate, sufficient, and managed properly.', category: 'AI_DATA' },
  { controlId: 'AI.7.2', name: 'Data quality', description: 'Data quality shall be assessed and maintained throughout the AI system lifecycle.', category: 'AI_DATA' },
  { controlId: 'AI.7.3', name: 'Data provenance', description: 'The provenance of data used in AI systems shall be documented and traceable.', category: 'AI_DATA' },
  { controlId: 'AI.7.4', name: 'AI bias and fairness', description: 'Measures shall be taken to identify and mitigate bias in AI data and systems.', category: 'AI_DATA' },
  { controlId: 'AI.8.1', name: 'AI transparency', description: 'Information about AI systems shall be made available to interested parties.', category: 'AI_INTERESTED_PARTIES' },
  { controlId: 'AI.8.2', name: 'AI explainability', description: 'AI system decisions and outputs shall be explainable where appropriate.', category: 'AI_INTERESTED_PARTIES' },
  { controlId: 'AI.8.3', name: 'Stakeholder communication', description: 'Communication with stakeholders about AI systems shall be timely and transparent.', category: 'AI_INTERESTED_PARTIES' },
  { controlId: 'AI.9.1', name: 'AI system use guidelines', description: 'Guidelines for the appropriate use of AI systems shall be established and communicated.', category: 'AI_USE' },
  { controlId: 'AI.9.2', name: 'AI human oversight', description: 'Appropriate human oversight mechanisms shall be established for AI systems.', category: 'AI_USE' },
  { controlId: 'AI.9.3', name: 'AI accountability', description: 'Clear accountability shall be established for AI system outcomes and decisions.', category: 'AI_USE' },
  { controlId: 'AI.10.1', name: 'Third-party AI assessment', description: 'Third-party AI products and services shall be assessed for compliance.', category: 'AI_THIRD_PARTY' },
  { controlId: 'AI.10.2', name: 'Third-party AI agreements', description: 'Agreements with third-party AI providers shall address AI-specific requirements.', category: 'AI_THIRD_PARTY' },
  { controlId: 'AI.10.3', name: 'Third-party AI monitoring', description: 'Third-party AI services shall be monitored for ongoing compliance and performance.', category: 'AI_THIRD_PARTY' },
];

// DPDPA 2023 Controls
const dpdpaControls: Array<{
  controlId: string;
  name: string;
  description: string;
  category: string;
}> = [
  { controlId: 'DP.2.1', name: 'Lawful processing of personal data', description: 'Personal data shall be processed only for lawful purposes with valid consent or legitimate grounds.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.2', name: 'Purpose limitation', description: 'Personal data shall be collected only for specific, clear and lawful purposes and not processed further in a manner incompatible with those purposes.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.3', name: 'Data minimization', description: 'Personal data collected shall be limited to what is necessary for the specified purpose.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.4', name: 'Accuracy of personal data', description: 'Reasonable efforts shall be made to ensure personal data is accurate and up to date.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.5', name: 'Storage limitation', description: 'Personal data shall not be stored longer than necessary for the purpose for which it was collected.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.6', name: 'Reasonable security safeguards', description: 'Appropriate technical and organizational measures shall be implemented to protect personal data.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.2.7', name: 'Accountability', description: 'The Data Fiduciary shall be responsible for and able to demonstrate compliance with DPDPA provisions.', category: 'DP_OBLIGATIONS' },
  { controlId: 'DP.3.1', name: 'Right to access information', description: 'Data Principals shall have the right to obtain confirmation and access to their personal data.', category: 'DP_RIGHTS' },
  { controlId: 'DP.3.2', name: 'Right to correction and erasure', description: 'Data Principals shall have the right to correction, completion, updating, and erasure of personal data.', category: 'DP_RIGHTS' },
  { controlId: 'DP.3.3', name: 'Right to grievance redressal', description: 'Data Principals shall have the right to have readily available means of grievance redressal.', category: 'DP_RIGHTS' },
  { controlId: 'DP.3.4', name: 'Right to nominate', description: 'Data Principals shall have the right to nominate another individual to exercise their rights.', category: 'DP_RIGHTS' },
  { controlId: 'DP.4.1', name: 'Processing of children data', description: 'Verifiable parental consent shall be obtained before processing personal data of children.', category: 'DP_SPECIAL_PROVISIONS' },
  { controlId: 'DP.4.2', name: 'Processing of disabled persons data', description: 'Special provisions shall apply for processing personal data of persons with disabilities.', category: 'DP_SPECIAL_PROVISIONS' },
  { controlId: 'DP.4.3', name: 'Significant Data Fiduciary obligations', description: 'Significant Data Fiduciaries shall comply with additional obligations including DPO appointment and DPIA.', category: 'DP_SPECIAL_PROVISIONS' },
  { controlId: 'DP.5.1', name: 'Consent management framework', description: 'A comprehensive consent management framework shall be established with clear, informed consent mechanisms.', category: 'DP_CONSENT' },
  { controlId: 'DP.5.2', name: 'Consent withdrawal mechanism', description: 'Easy and accessible mechanisms shall be provided for withdrawal of consent.', category: 'DP_CONSENT' },
  { controlId: 'DP.5.3', name: 'Consent records', description: 'Records of consent shall be maintained as proof of valid consent.', category: 'DP_CONSENT' },
  { controlId: 'DP.6.1', name: 'Breach notification to Board', description: 'Personal data breaches shall be notified to the Data Protection Board in the prescribed manner.', category: 'DP_BREACH' },
  { controlId: 'DP.6.2', name: 'Breach notification to Data Principals', description: 'Affected Data Principals shall be notified of personal data breaches.', category: 'DP_BREACH' },
  { controlId: 'DP.6.3', name: 'Breach response procedures', description: 'Documented procedures for responding to personal data breaches shall be established.', category: 'DP_BREACH' },
  { controlId: 'DP.7.1', name: 'Cross-border transfer restrictions', description: 'Transfer of personal data outside India shall only be to notified countries/territories.', category: 'DP_CROSS_BORDER' },
  { controlId: 'DP.7.2', name: 'Transfer safeguards', description: 'Appropriate safeguards shall be implemented for permitted cross-border data transfers.', category: 'DP_CROSS_BORDER' },
  { controlId: 'DP.8.1', name: 'Data Protection Officer appointment', description: 'A Data Protection Officer shall be appointed where required by the Act.', category: 'DP_DPO' },
  { controlId: 'DP.8.2', name: 'DPO responsibilities', description: 'The DPO shall be responsible for monitoring compliance and acting as point of contact.', category: 'DP_DPO' },
  { controlId: 'DP.9.1', name: 'Data Protection Impact Assessment', description: 'A DPIA shall be conducted for processing activities likely to result in high risk to Data Principals.', category: 'DP_DPIA' },
  { controlId: 'DP.9.2', name: 'Periodic audit', description: 'Periodic audits shall be conducted to verify compliance with DPDPA requirements.', category: 'DP_DPIA' },
];

// SoA data extracted from the HTML for controls with specific data
const soaDataMap: Record<string, {
  status: string;
  controlOwner: string;
  justification: string;
  documentationReferences: string | null;
  comments: string | null;
}> = {
  'A.5.9': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Asset Lifecycle Procedure',
    comments: 'Controls are being developed which helps to automatically inventory assets including its specifications and auto assignment to owners/custodians based on rules (Asset Register). So far on premise and some of cloud assets are inventoried',
  },
  'A.5.12': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Information Classification Guidelines',
    comments: 'Inventoried information assets are being classified accordingly',
  },
  'A.5.13': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Information Classification Guidelines',
    comments: 'Inventoried information assets are being labelled accordingly',
  },
  'A.5.19': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Supplier Security Management Policy',
    comments: 'Suppliers are being evaluated based on a questionnaire or their attestations and certifications made available in their portal.',
  },
  'A.5.20': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Supplier Security Management Policy',
    comments: 'NDA is being executed with Critical/High risk suppliers related to information security',
  },
  'A.5.21': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Supplier Security Management Policy',
    comments: 'Most of the suppliers are providing the services in a SaaS model which is on Shared responsibility model',
  },
  'A.5.22': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Supplier Security Management Policy',
    comments: 'Quarterly review of supplier services planned',
  },
  'A.5.23': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Cloud Services Management Policy',
    comments: 'Cloud Services are based on Shared responsibility model',
  },
  'A.5.29': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Business Continuity Management Procedure',
    comments: 'DR activities are being performed a full fledged BCP simulation is yet to be carried out',
  },
  'A.5.30': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Business Continuity Management Procedure',
    comments: 'BCP is planned and partially tested; further testing planning is in progress',
  },
  'A.5.31': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Compliance Master Sheet',
    comments: 'DPDPA ROPA is being evaluated, PII data of employees are masked by Keka (Supplier). Client GDPR agreements with SCC clauses prepared and signed with few',
  },
  'A.5.34': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: null,
    comments: 'Controls such as Pseudonymization implemented, Privacy policy work in progress.',
  },
  'A.5.36': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: '(Implementation evidence is enough)',
    comments: 'Compliance with policies and procedures shall be checked every 6 months',
  },
  'A.5.37': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'ISMS Procedures',
    comments: null,
  },
  'A.8.7': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Antivirus Management Policy',
    comments: 'ClamAV is installed on all machines. Need to rebuild it with YARA Support',
  },
  'A.8.9': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Asset Lifecycle Procedure',
    comments: 'CR is raised for servers and workstation OS hardening, further hardening will be planned and done on Switches, Routers etc.',
  },
  'A.8.10': {
    status: 'IN_PROGRESS',
    controlOwner: 'Dept Heads',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Backup Policy',
    comments: 'Need to mark the retention period of data in Asset Register, Automate Information deletion wherever possible',
  },
  'A.8.13': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Backup Policy',
    comments: null,
  },
  'A.8.14': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: '(Implementation evidence is enough)',
    comments: 'Redundancy should be captured in Asset register',
  },
  'A.8.18': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Access Control Policy, Acceptable Use Policy',
    comments: null,
  },
  'A.8.19': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Access Control Policy',
    comments: null,
  },
  'A.8.20': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Network Access Policy',
    comments: null,
  },
  'A.8.21': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: '(Implementation evidence is enough)',
    comments: 'Security of the network services shall be ensured with third party attestations incase of cloud services etc.',
  },
  'A.8.22': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Network Access Policy',
    comments: null,
  },
  'A.8.23': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Network Access Policy',
    comments: null,
  },
  'A.8.24': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Cryptographic Policy',
    comments: null,
  },
  'A.8.25': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Secure Development Lifecycle Policy',
    comments: null,
  },
  'A.8.26': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of Dev',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Secure Development Lifecycle Policy',
    comments: null,
  },
  'A.8.27': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Secure Development Lifecycle Policy',
    comments: null,
  },
  'A.8.28': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of Dev',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Secure Development Lifecycle Policy',
    comments: null,
  },
  'A.8.29': {
    status: 'IN_PROGRESS',
    controlOwner: 'CISO',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Secure Development Lifecycle Policy',
    comments: null,
  },
  'A.8.31': {
    status: 'IN_PROGRESS',
    controlOwner: 'Head of TechOps',
    justification: 'To Mitigate the risks identified',
    documentationReferences: 'Asset Lifecycle Procedure',
    comments: 'Environments needs to be segregated based on use cases such as staging, dev, production etc. and should be labelled and isolated accordingly.',
  },
};

async function main() {
  console.log('Seeding database...');

  // 1. Create admin user
  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@isms.local' },
    update: {},
    create: {
      email: 'admin@isms.local',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });
  console.log(`Admin user: ${admin.email}`);

  // 2. Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: 'codemax' },
    update: {},
    create: {
      name: 'CodeMax IT Solutions Pvt. Ltd',
      slug: 'codemax',
      description: 'CodeMax IT Solutions - ISMS Management',
    },
  });
  console.log(`Organization: ${org.name}`);

  // 3. Add admin to organization as ADMIN
  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: {
        userId: admin.id,
        organizationId: org.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      organizationId: org.id,
      role: 'ADMIN',
      isDefault: true,
    },
  });
  console.log('Admin added to organization');

  // Create compliance frameworks
  const iso27001Framework = await prisma.complianceFramework.upsert({
    where: { slug: 'iso27001' },
    update: {},
    create: {
      slug: 'iso27001',
      name: 'ISO/IEC 27001:2022',
      shortName: 'ISO 27001',
      version: '2022',
      description: 'Information Security Management Systems - Requirements',
      icon: 'Shield',
      color: '#3b82f6',
      sortOrder: 1,
    },
  });

  const iso42001Framework = await prisma.complianceFramework.upsert({
    where: { slug: 'iso42001' },
    update: {},
    create: {
      slug: 'iso42001',
      name: 'ISO/IEC 42001:2023',
      shortName: 'ISO 42001',
      version: '2023',
      description: 'Artificial Intelligence Management Systems - Requirements',
      icon: 'Brain',
      color: '#8b5cf6',
      sortOrder: 2,
    },
  });

  const dpdpaFramework = await prisma.complianceFramework.upsert({
    where: { slug: 'dpdpa' },
    update: {},
    create: {
      slug: 'dpdpa',
      name: 'DPDPA 2023',
      shortName: 'DPDPA',
      version: '2023',
      description: 'Digital Personal Data Protection Act 2023 (India)',
      icon: 'Lock',
      color: '#f59e0b',
      sortOrder: 3,
    },
  });
  console.log('Created compliance frameworks');

  // 4. Create all 93 ISO 27001:2022 Annex A controls with full descriptions
  console.log(`Creating ${controls.length} ISO 27001:2022 Annex A controls...`);

  for (const ctrl of controls) {
    await prisma.control.upsert({
      where: {
        organizationId_controlId: {
          organizationId: org.id,
          controlId: ctrl.controlId,
        },
      },
      update: {
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: iso27001Framework.id,
      },
      create: {
        organizationId: org.id,
        controlId: ctrl.controlId,
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: iso27001Framework.id,
        implementationStatus: ImplementationStatus.NOT_IMPLEMENTED,
        standardRef: 'ISO 27001:2022',
        createdById: admin.id,
      },
    });
  }
  console.log(`Created ${controls.length} ISO 27001:2022 controls`);

  // Create ISO 42001 controls
  console.log(`Creating ${iso42001Controls.length} ISO 42001:2023 controls...`);
  for (const ctrl of iso42001Controls) {
    await prisma.control.upsert({
      where: {
        organizationId_controlId: {
          organizationId: org.id,
          controlId: ctrl.controlId,
        },
      },
      update: {
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: iso42001Framework.id,
      },
      create: {
        organizationId: org.id,
        controlId: ctrl.controlId,
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: iso42001Framework.id,
        implementationStatus: ImplementationStatus.NOT_IMPLEMENTED,
        standardRef: 'ISO 42001:2023',
        createdById: admin.id,
      },
    });
  }
  console.log(`Created ${iso42001Controls.length} ISO 42001 controls`);

  // Create DPDPA controls
  console.log(`Creating ${dpdpaControls.length} DPDPA 2023 controls...`);
  for (const ctrl of dpdpaControls) {
    await prisma.control.upsert({
      where: {
        organizationId_controlId: {
          organizationId: org.id,
          controlId: ctrl.controlId,
        },
      },
      update: {
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: dpdpaFramework.id,
      },
      create: {
        organizationId: org.id,
        controlId: ctrl.controlId,
        name: ctrl.name,
        description: ctrl.description,
        category: ctrl.category,
        frameworkId: dpdpaFramework.id,
        implementationStatus: ImplementationStatus.NOT_IMPLEMENTED,
        standardRef: 'DPDPA 2023',
        createdById: admin.id,
      },
    });
  }
  console.log(`Created ${dpdpaControls.length} DPDPA controls`);

  // 5. Create SoA entries for all controls with data from the HTML
  console.log('Creating Statement of Applicability entries...');

  const allControls = await prisma.control.findMany({
    where: { organizationId: org.id },
  });

  for (const control of allControls) {
    // Look up specific SoA data from the HTML, or use defaults
    const soaData = soaDataMap[control.controlId];

    const status: SoAStatus = soaData
      ? SoAStatus[soaData.status as keyof typeof SoAStatus]
      : SoAStatus.IN_PROGRESS;
    const controlOwner = soaData ? soaData.controlOwner : 'CISO';
    const justification = soaData ? soaData.justification : 'To Mitigate the risks identified';
    const documentationReferences = soaData ? soaData.documentationReferences : null;
    const comments = soaData ? soaData.comments : null;

    const soaEntry = await prisma.soAEntry.upsert({
      where: {
        organizationId_controlId: {
          organizationId: org.id,
          controlId: control.id,
        },
      },
      update: {
        status,
        controlOwner,
        justification,
        documentationReferences,
        comments,
        controlSource: 'Annex A ISO 27001:2022',
        isApplicable: true,
      },
      create: {
        organizationId: org.id,
        controlId: control.id,
        isApplicable: true,
        justification,
        status,
        controlOwner,
        documentationReferences,
        comments,
        controlSource: 'Annex A ISO 27001:2022',
      },
    });

  }
  console.log(`Created SoA entries for ${allControls.length} controls`);

  // 6. Create SoA document with initial version
  const soaDoc = await prisma.soADocument.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      identification: 'ISMS-R-001',
      title: 'ISMS - Statement of Applicability (SoA)',
      classification: 'Internal',
      version: 0.1,
      approvalStatus: ApprovalStatus.DRAFT,
    },
  });
  await prisma.soAVersion.upsert({
    where: {
      soaDocumentId_version: { soaDocumentId: soaDoc.id, version: 0.1 },
    },
    update: {},
    create: {
      soaDocumentId: soaDoc.id,
      version: 0.1,
      changeDescription: 'Initial SoA document creation',
      actor: 'Admin User',
      actorDesignation: 'ISMS Administrator',
      action: 'Draft & Review',
      createdById: admin.id,
    },
  });
  console.log('Created SoA document with initial version');

  // ============================================
  // RISK REGISTER SEED DATA
  // ============================================

  // 7. Create risk register users
  console.log('Creating risk register users...');
  const riskUserPassword = await bcrypt.hash('user123', 12);
  const userMap: Record<string, string> = {}; // email -> userId

  for (const u of riskUsers) {
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        email: u.email,
        passwordHash: riskUserPassword,
        firstName: u.firstName,
        lastName: u.lastName,
        designation: u.designation,
        role: Role[u.role],
        isEmailVerified: true,
      },
    });
    userMap[u.email] = user.id;

    // Add to organization
    await prisma.organizationMember.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
      update: {},
      create: {
        userId: user.id,
        organizationId: org.id,
        role: u.role === 'ADMIN' ? 'ADMIN' : u.role === 'LOCAL_ADMIN' ? 'LOCAL_ADMIN' : 'USER',
        isDefault: true,
      },
    });
  }
  console.log(`Created ${riskUsers.length} risk register users`);

  // 8. Create all 72 risks
  console.log('Creating risk register entries...');
  const riskIdToDbId: Record<string, string> = {};

  for (const r of risks) {
    const ownerEmail = ownerEmailMap[r.owner];
    const ownerId = ownerEmail ? userMap[ownerEmail] : admin.id;
    const inherentRisk = r.inhP * r.inhI;
    const residualRisk = r.resP * r.resI;

    const risk = await prisma.risk.upsert({
      where: {
        organizationId_riskId: { organizationId: org.id, riskId: r.riskId },
      },
      update: {},
      create: {
        organizationId: org.id,
        riskId: r.riskId,
        title: r.title,
        description: r.description,
        category: r.category,
        version: 1.0,
        approvalStatus: ApprovalStatus.APPROVED,
        likelihood: r.inhP,
        impact: r.inhI,
        inherentRisk,
        residualProbability: r.resP,
        residualImpact: r.resI,
        residualRisk,
        controlDescription: r.ctrlDesc,
        controlsReference: r.ctrls.join(', '),
        treatment: r.treatment === 'ACCEPT' ? 'ACCEPT' : 'MITIGATE',
        status: 'MONITORING',
        ownerId,
        createdById: userMap['karthik.k@cdmx.in'] || admin.id,
        reviewedAt: new Date('2026-02-03'),
        comments: r.comments || null,
        affectsConfidentiality: r.cia[0],
        affectsIntegrity: r.cia[1],
        affectsAvailability: r.cia[2],
        createdAt: new Date(r.date),
      },
    });
    riskIdToDbId[r.riskId] = risk.id;

    // Link controls via RiskControl join table
    for (const ctrlId of r.ctrls) {
      const control = await prisma.control.findFirst({
        where: { organizationId: org.id, controlId: ctrlId },
      });
      if (control) {
        await prisma.riskControl.upsert({
          where: {
            riskId_controlId: { riskId: risk.id, controlId: control.id },
          },
          update: {},
          create: { riskId: risk.id, controlId: control.id },
        });
      }
    }

    // Create initial version entry
    await prisma.riskVersion.upsert({
      where: {
        riskId_version: { riskId: risk.id, version: 1.0 },
      },
      update: {},
      create: {
        riskId: risk.id,
        version: 1.0,
        changeDescription: 'Initial risk assessment',
        actor: 'Karthik Kanthaswamy',
        actorDesignation: 'CISO',
        action: 'Risk Assessment',
        designation: 'CISO',
        riskData: {
          riskId: r.riskId,
          title: r.title,
          likelihood: r.inhP,
          impact: r.inhI,
          inherentRisk,
          residualProbability: r.resP,
          residualImpact: r.resI,
          residualRisk,
          treatment: r.treatment,
          status: 'MONITORING',
          approvalStatus: 'APPROVED',
        },
        createdById: userMap['karthik.k@cdmx.in'] || admin.id,
        createdAt: new Date(r.date),
      },
    });
  }
  console.log(`Created ${risks.length} risks with control links and version history`);

  // 9. Create risk treatment entries
  console.log('Creating risk treatments...');
  for (const t of riskTreatments) {
    const dbRiskId = riskIdToDbId[t.riskId];
    if (!dbRiskId) continue;

    await prisma.riskTreatment.create({
      data: {
        riskId: dbRiskId,
        residualProbability: t.resP,
        residualImpact: t.resI,
        residualRisk: t.resRisk,
        riskResponse: t.response,
        controlDescription: t.ctrlDesc,
        controlImplementationDate: t.implDate ? new Date(t.implDate) : null,
        treatmentTimeInDays: t.days,
        comments: t.comments,
      },
    });
  }
  console.log(`Created ${riskTreatments.length} risk treatment entries`);

  // 10. Create risk register document with version history
  console.log('Creating risk register document...');
  const cooId = userMap['nestinka@cdmx.in'];
  const ceoId = userMap['mayur@cdmx.in'];

  const riskDoc = await prisma.riskRegisterDocument.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      identification: 'ISMS-R-004',
      title: 'ISMS Org Level Risk Register',
      classification: 'Internal',
      version: 7.0,
      approvalStatus: ApprovalStatus.APPROVED,
      reviewerId: cooId,
      approverId: ceoId,
    },
  });

  for (const v of riskRegisterVersions) {
    const actorUserId = userMap[v.actorEmail];
    await prisma.riskRegisterVersion.upsert({
      where: {
        riskRegisterDocumentId_version: { riskRegisterDocumentId: riskDoc.id, version: v.version },
      },
      update: {},
      create: {
        riskRegisterDocumentId: riskDoc.id,
        version: v.version,
        changeDescription: v.desc,
        actor: v.actor,
        actorDesignation: v.actorDesig,
        action: v.action,
        createdById: actorUserId,
        createdAt: new Date(v.date),
      },
    });
  }
  console.log(`Created risk register document (v7.0) with ${riskRegisterVersions.length} version entries`);

  console.log('\nSeeding completed!');
  console.log('\nLogin credentials:');
  console.log('  Email: admin@isms.local');
  console.log('  Password: admin123');
  console.log('\nRisk register users (password: user123):');
  for (const u of riskUsers) {
    console.log(`  ${u.firstName} ${u.lastName} (${u.designation}): ${u.email}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
