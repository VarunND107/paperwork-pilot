/**
 * SAMPLE DATA. Ported from the EVENTS object in design/landing-page.html (the approved demo).
 *
 * Nothing here has been checked against an official source, so every row is seeded with
 * verified = false and last_verified_at = null. `sourceUrl` points at the home page of the
 * authority concerned as a starting point for whoever verifies the step; it is NOT a citation of
 * the specific rule, fee or wait time. Do not set verified to true in this file.
 */

export type SeedDueUnit = 'DAY' | 'WEEK' | 'MONTH';

export interface SeedOffice {
  key: string;
  name: string;
  kind: 'OFFICE' | 'PORTAL';
  url?: string;
}

export interface SeedDoc {
  /** Wording shown to the user (and the catalog name unless `doc` is given). */
  t: string;
  /** Key of the step that hands the user this document. */
  from?: string;
  /** Catalog document name, when the wording differs from it. */
  doc?: string;
}

export interface SeedStep {
  key: string;
  title: string;
  form: string;
  where: string;
  office: string;
  fee: string;
  wait: string;
  due: string;
  dueAmount?: number;
  dueUnit?: SeedDueUnit;
  needs: string[];
  docs: SeedDoc[];
  tip: string;
  sourceUrl: string;
}

export interface SeedEvent {
  slug: string;
  label: string;
  place: string;
  eventDateLabel: string;
  keywords: string[];
  steps: SeedStep[];
}

export const SEED_OFFICES: SeedOffice[] = [
  { key: 'hospital', name: 'Treating hospital or doctor', kind: 'OFFICE' },
  { key: 'ward', name: 'Ward health office', kind: 'OFFICE' },
  {
    key: 'crs',
    name: 'Online civil registration portal',
    kind: 'PORTAL',
    url: 'https://crsorgi.gov.in/',
  },
  {
    key: 'nadakacheri',
    name: "Nadakacheri or Tahsildar's office",
    kind: 'OFFICE',
    url: 'https://nadakacheri.karnataka.gov.in/',
  },
  { key: 'bank-insurer', name: 'Bank branch or insurer', kind: 'OFFICE' },
  {
    key: 'epfo',
    name: 'EPFO regional office',
    kind: 'OFFICE',
    url: 'https://www.epfindia.gov.in/',
  },
  {
    key: 'subreg',
    name: 'Sub-registrar office',
    kind: 'OFFICE',
    url: 'https://kaveri.karnataka.gov.in/',
  },
  {
    key: 'uidai-portal',
    name: 'UIDAI self-service portal',
    kind: 'PORTAL',
    url: 'https://myaadhaar.uidai.gov.in/',
  },
  {
    key: 'bescom',
    name: 'BESCOM office',
    kind: 'OFFICE',
    url: 'https://bescom.karnataka.gov.in/',
  },
  { key: 'uphc', name: 'Urban primary health centre', kind: 'OFFICE' },
  {
    key: 'aadhaar-kendra',
    name: 'Aadhaar Seva Kendra',
    kind: 'OFFICE',
    url: 'https://uidai.gov.in/',
  },
  { key: 'preschool', name: 'Preschool or daycare', kind: 'OFFICE' },
  {
    key: 'udyam',
    name: 'Udyam registration portal',
    kind: 'PORTAL',
    url: 'https://udyamregistration.gov.in/',
  },
  {
    key: 'corporation',
    name: 'City corporation trade licence counter',
    kind: 'OFFICE',
    url: 'https://bbmp.gov.in/',
  },
  {
    key: 'labour',
    name: 'Karnataka Labour Department portal',
    kind: 'PORTAL',
    url: 'https://labour.karnataka.gov.in/',
  },
  { key: 'gst', name: 'GST portal', kind: 'PORTAL', url: 'https://www.gst.gov.in/' },
  { key: 'bank', name: 'Bank branch', kind: 'OFFICE' },
];

export const SEED_EVENTS: SeedEvent[] = [
  {
    slug: 'death',
    label: 'A parent has passed away',
    place: 'Bengaluru, Karnataka',
    eventDateLabel: 'Date of death',
    keywords: [
      'passed away',
      'pass away',
      'passed on',
      'passing',
      'died',
      'dies',
      'death',
      'dead',
      'deceased',
      'funeral',
      'cremation',
      'last rites',
      'demise',
      'bereav*',
      'mother*',
      'father*',
      'parent*',
      'mom',
      'dad',
    ],
    steps: [
      {
        key: 's1',
        title: 'Get the medical certificate of cause of death',
        form: 'Form 4 (hospital) or 4A (home)',
        where: 'Treating hospital or doctor',
        office: 'hospital',
        fee: 'Free',
        wait: 'Same day',
        due: 'Right away',
        needs: [],
        docs: [{ t: 'Hospital discharge or death summary' }, { t: 'ID of the person who died' }],
        tip: 'Collect it before the body is released. The registration counter asks for the original.',
        sourceUrl: 'https://crsorgi.gov.in/',
      },
      {
        key: 's2',
        title: 'Register the death',
        form: 'Form 2 (death report)',
        where: "Ward health office or the state's online civil registration portal",
        office: 'ward',
        fee: 'Free within 21 days',
        wait: 'A few working days',
        due: 'Within 21 days',
        dueAmount: 21,
        dueUnit: 'DAY',
        needs: ['s1'],
        docs: [
          { t: 'Medical certificate of cause of death', from: 's1' },
          { t: 'Aadhaar or other ID of the person who died' },
          { t: 'ID and address proof of the person reporting' },
        ],
        tip: 'Report within 21 days. After that, late fees and extra paperwork begin.',
        sourceUrl: 'https://crsorgi.gov.in/',
      },
      {
        key: 's3',
        title: 'Collect certified copies of the death certificate',
        form: 'Application for certified copy',
        where: 'The office that registered the death',
        office: 'ward',
        fee: 'Small fee per copy',
        wait: 'Same day to a few days',
        due: 'Within a week',
        dueAmount: 1,
        dueUnit: 'WEEK',
        needs: ['s2'],
        docs: [{ t: 'Registration number', from: 's2' }, { t: 'ID of the applicant' }],
        tip: 'Ask for 8 to 10 copies. Banks, EPFO, insurers and the land office each keep one.',
        sourceUrl: 'https://crsorgi.gov.in/',
      },
      {
        key: 's4',
        title: 'Get the legal heir certificate',
        form: 'Legal heir (family tree) certificate application',
        where: "Nadakacheri or the Tahsildar's office",
        office: 'nadakacheri',
        fee: 'Small fee',
        wait: 'Around 2 to 4 weeks',
        due: 'Start in the first month',
        dueAmount: 1,
        dueUnit: 'MONTH',
        needs: ['s3'],
        docs: [
          { t: 'Certified death certificate', from: 's3' },
          { t: 'Aadhaar of every legal heir' },
          { t: 'Address proof of the applicant' },
          { t: 'Family details signed by the applicant' },
        ],
        tip: 'Bring IDs for every heir. A missing name slows the check.',
        sourceUrl: 'https://sevasindhu.karnataka.gov.in/',
      },
      {
        key: 's5',
        title: 'Settle bank accounts and insurance',
        form: 'Claim form from each bank or insurer',
        where: 'Each bank branch or insurer',
        office: 'bank-insurer',
        fee: 'Free',
        wait: '2 to 6 weeks',
        due: 'Within 3 months',
        dueAmount: 3,
        dueUnit: 'MONTH',
        needs: ['s3', 's4'],
        docs: [
          { t: 'Certified death certificate', from: 's3' },
          { t: 'Legal heir certificate', from: 's4' },
          { t: 'Claimant ID and bank passbook' },
          { t: 'Original policy or passbook of the person who died' },
        ],
        tip: 'Take self-attested photocopies and the originals. Branches usually keep the copies and only sight the originals.',
        sourceUrl: 'https://www.rbi.org.in/',
      },
      {
        key: 's6',
        title: 'Claim PF and pension',
        form: 'EPFO death claim forms (Form 20, Form 10D)',
        where: 'EPFO member portal or the regional office',
        office: 'epfo',
        fee: 'Free',
        wait: 'About 20 to 30 days',
        due: 'Once you hold the legal heir certificate',
        needs: ['s3', 's4'],
        docs: [
          { t: 'Certified death certificate', from: 's3' },
          { t: 'Legal heir certificate', from: 's4' },
          { t: 'Cancelled cheque of the claimant' },
          { t: 'UAN of the person who died' },
        ],
        tip: "Match the name on the cancelled cheque to the claimant's ID exactly.",
        sourceUrl: 'https://www.epfindia.gov.in/',
      },
    ],
  },
  {
    slug: 'move',
    label: 'Moving to Bengaluru with a toddler',
    place: 'Bengaluru, Karnataka',
    eventDateLabel: 'Move-in date',
    keywords: [
      'moving',
      'moved',
      'move',
      'movers',
      'relocat*',
      'shifting',
      'shifted',
      'shift',
      'new city',
      'new house',
      'new home',
      'toddler',
      'baby',
      'infant',
      'child',
      'kid',
      'kids',
      'rent',
      'renting',
      'tenant',
      'bengaluru',
      'bangalore',
    ],
    steps: [
      {
        key: 'm1',
        title: 'Sign the rental agreement',
        form: 'Rental agreement on stamp paper',
        where: 'You and the landlord, with a sub-registrar or e-stamp',
        office: 'subreg',
        fee: 'Stamp duty plus registration',
        wait: '1 to 2 days',
        due: 'Before move-in',
        dueAmount: 0,
        dueUnit: 'DAY',
        needs: [],
        docs: [
          { t: 'ID of the tenant' },
          { t: 'ID and ownership proof of the landlord' },
          { t: 'Two passport-size photos' },
        ],
        tip: 'Have the agreement made in your own name. Utilities and Aadhaar updates need it.',
        sourceUrl: 'https://kaveri.karnataka.gov.in/',
      },
      {
        key: 'm2',
        title: 'Update the address on your Aadhaar',
        form: 'Aadhaar address update (online)',
        where: 'UIDAI self-service portal',
        office: 'uidai-portal',
        fee: 'Small UIDAI fee',
        wait: 'Up to a week',
        due: 'Within a month of moving',
        dueAmount: 1,
        dueUnit: 'MONTH',
        needs: ['m1'],
        docs: [
          { t: 'Rental agreement', from: 'm1' },
          { t: 'Mobile number linked to your Aadhaar' },
        ],
        tip: 'The OTP goes to the linked mobile, so keep that SIM active.',
        sourceUrl: 'https://myaadhaar.uidai.gov.in/',
      },
      {
        key: 'm3',
        title: 'Start the electricity connection',
        form: 'New connection or name transfer request',
        where: 'BESCOM office or online',
        office: 'bescom',
        fee: 'Deposit based on load',
        wait: 'A few days',
        due: 'At move-in',
        dueAmount: 0,
        dueUnit: 'DAY',
        needs: ['m1'],
        docs: [
          { t: 'Rental agreement', from: 'm1' },
          { t: "Landlord's consent letter" },
          { t: 'Latest bill of the previous tenant' },
        ],
        tip: "The previous tenant's last bill speeds up the transfer.",
        sourceUrl: 'https://bescom.karnataka.gov.in/',
      },
      {
        key: 'm4',
        title: "Move your toddler's vaccination record",
        form: 'Mother and Child Protection card',
        where: 'Nearest urban primary health centre',
        office: 'uphc',
        fee: 'Free',
        wait: 'Same day',
        due: 'Before the next due dose',
        needs: ['m1'],
        docs: [
          { t: 'Address proof (rental agreement)', from: 'm1', doc: 'Rental agreement' },
          { t: 'Mother and Child Protection card or vaccination record' },
          { t: "Child's birth certificate" },
        ],
        tip: 'Take the original card. The centre notes the next due date on it.',
        sourceUrl: 'https://www.mohfw.gov.in/',
      },
      {
        key: 'm5',
        title: "Update your child's Aadhaar address",
        form: 'Child Aadhaar address update',
        where: 'Aadhaar Seva Kendra',
        office: 'aadhaar-kendra',
        fee: 'Small fee',
        wait: 'Up to 2 weeks',
        due: 'Within two months',
        dueAmount: 2,
        dueUnit: 'MONTH',
        needs: ['m2'],
        docs: [{ t: "Parent's updated Aadhaar", from: 'm2' }, { t: "Child's birth certificate" }],
        tip: 'The parent has to be present with the child.',
        sourceUrl: 'https://uidai.gov.in/',
      },
      {
        key: 'm6',
        title: 'Enrol in a preschool or daycare',
        form: 'Admission form',
        where: 'The preschool or daycare you chose',
        office: 'preschool',
        fee: 'Set by the school',
        wait: '1 to 2 weeks',
        due: 'Before the term starts',
        needs: ['m4', 'm5'],
        docs: [
          { t: 'Vaccination record', from: 'm4' },
          { t: "Child's updated Aadhaar", from: 'm5' },
          { t: 'ID and address proof of both parents' },
        ],
        tip: 'Ask whether they want the vaccination card stamped by the health centre.',
        sourceUrl: 'https://schooleducation.karnataka.gov.in/',
      },
    ],
  },
  {
    slug: 'biz',
    label: 'Starting a small business',
    place: 'Bengaluru, Karnataka',
    eventDateLabel: 'Planned opening date',
    keywords: [
      'business',
      'startup',
      'start-up',
      'start up',
      'shop',
      'store',
      'company',
      'msme',
      'gst',
      'udyam',
      'enterprise',
      'entrepreneur',
      'trade licence',
      'trade license',
      'open a',
      'opening a',
      'starting a',
      'self employed',
      'freelance',
    ],
    steps: [
      {
        key: 'b1',
        title: 'Register on Udyam',
        form: 'Udyam registration (online)',
        where: 'The official Udyam portal',
        office: 'udyam',
        fee: 'Free',
        wait: 'Same day',
        due: 'Before you apply for loans or a current account',
        needs: [],
        docs: [
          { t: 'Aadhaar of the owner' },
          { t: 'PAN of the owner' },
          { t: 'Mobile number linked to Aadhaar' },
        ],
        tip: 'The portal is free. Skip anyone who charges you for it.',
        sourceUrl: 'https://udyamregistration.gov.in/',
      },
      {
        key: 'b2',
        title: 'Fix your premises proof',
        form: 'Rental agreement or ownership papers',
        where: 'The landlord and a sub-registrar',
        office: 'subreg',
        fee: 'Stamp duty plus registration',
        wait: '1 to 2 days',
        due: 'Before any licence application',
        needs: [],
        docs: [
          { t: 'Rental agreement or sale deed' },
          { t: 'Latest electricity bill of the premises' },
          { t: "Landlord's consent letter" },
        ],
        tip: 'Ask for a clause that allows commercial use. Licence officers check for it.',
        sourceUrl: 'https://kaveri.karnataka.gov.in/',
      },
      {
        key: 'b3',
        title: 'Get the trade licence',
        form: 'Trade licence application',
        where: "Your city corporation's trade licence counter or portal",
        office: 'corporation',
        fee: 'Based on trade and area',
        wait: '1 to 3 weeks',
        due: 'Before you open',
        dueAmount: 0,
        dueUnit: 'DAY',
        needs: ['b2'],
        docs: [
          { t: 'Premises proof', from: 'b2' },
          { t: 'ID and photo of the owner' },
          { t: 'Description of the trade' },
        ],
        tip: 'Inspectors check the signboard and the address. Match both to your papers.',
        sourceUrl: 'https://bbmp.gov.in/',
      },
      {
        key: 'b4',
        title: 'Register under the Shops and Establishments Act',
        form: 'Registration form',
        where: 'Karnataka Labour Department portal',
        office: 'labour',
        fee: 'Based on staff count',
        wait: 'A few days',
        due: 'Soon after you open',
        needs: ['b3'],
        docs: [
          { t: 'Trade licence', from: 'b3' },
          { t: 'Premises proof', from: 'b2' },
          { t: 'ID of the owner' },
        ],
        tip: 'Keep the certificate on display at the premises.',
        sourceUrl: 'https://labour.karnataka.gov.in/',
      },
      {
        key: 'b5',
        title: 'Register for GST',
        form: 'GST registration application (online)',
        where: 'The GST portal',
        office: 'gst',
        fee: 'Free',
        wait: 'A few working days',
        due: 'When turnover crosses the limit or you sell across states',
        needs: ['b2'],
        docs: [
          { t: 'PAN of the owner' },
          { t: 'Premises proof', from: 'b2' },
          { t: 'Photo and Aadhaar of the owner' },
        ],
        tip: 'Use the same name and address everywhere, down to the commas.',
        sourceUrl: 'https://www.gst.gov.in/',
      },
      {
        key: 'b6',
        title: 'Open a current account',
        form: 'Account opening form',
        where: 'Your bank branch',
        office: 'bank',
        fee: 'Minimum balance set by the bank',
        wait: '1 to 3 days',
        due: 'Before the first invoice',
        needs: ['b1', 'b4'],
        docs: [
          { t: 'Udyam certificate', from: 'b1' },
          { t: 'Shops and Establishments certificate', from: 'b4' },
          { t: 'PAN and Aadhaar of the owner' },
        ],
        tip: 'Ask the branch which two business proofs it accepts before you go.',
        sourceUrl: 'https://www.rbi.org.in/',
      },
    ],
  },
];
