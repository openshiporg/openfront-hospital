![Openfront Hospital](https://openship.org/og/openfront-hospital.png)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fopenshiporg%2Fopenfront-hospital&env=DATABASE_URL%2CSESSION_SECRET%2CS3_BUCKET_NAME%2CS3_REGION%2CS3_ACCESS_KEY_ID%2CS3_SECRET_ACCESS_KEY)

Openfront Hospital is a self-hostable care-booking and hospital-operations application. Visitors can explore care services and providers, request appointments, and complete intake. Staff coordinate registration, scheduling, patient records, encounters, inpatient capacity, clinical fulfillment, claims, communication, and reporting.

## Demo

![Consultation image used by the Hospital storefront](public/images/hero/family-consultation.jpg)

Explore the application locally using the setup instructions below.

| | |
|---|---|
| **Public application** | `/` on your development URL |
| **Dashboard** | `/dashboard` on your development URL |

[Learn more →](https://openship.org/products/openfront-hospital)

[Documentation →](https://docs.openship.org/docs/openfront/hospital/)

## The Openfront Ecosystem

Openfront is part of an ecosystem of open-source commerce tools:

- **[Openfront E-commerce](https://github.com/openshiporg/openfront)**: Headless e-commerce for retail.
- **[Openfront Restaurant](https://github.com/openshiporg/openfront-restaurant)**: Restaurant ordering, point of sale, and kitchen operations.
- **[Openship](https://github.com/openshiporg/openship)**: Order routing for multi-channel fulfillment.
- **Openfront Hospital**: (This repository) a self-hostable care-booking and hospital-operations application.

## Core Features

### Admin Dashboard
Manage patients, inpatient, registration, appointments, operational fabric, store settings, clinical operations, schedules, intake, clinical fulfillment, encounters, care queue through dedicated dashboard workspaces and permission-controlled data screens.

### Storefront
Public routes include `/care`, `/providers`, `/book`, appointment-type booking pages, and `/intake`. Intake access and appointment requests are separate from staff access to clinical records.

### Registration & Care Coordination
Maintain patient identity and coverage, registration, appointment types, provider schedules, care queues, intake, consent, and secure patient communication.

### Clinical & Inpatient Operations
Coordinate encounters, admissions, beds and reservations, care plans, medical orders, prescriptions, laboratory records, procedures, specimens, and episode closure workflows.

### Billing & Data Governance
Track claims and claim versions, patient payments and refunds, inventory, integration delivery, portability, retention, record holds, and clinical audit events. Software workflows do not establish clinical, privacy, or regulatory certification.

## Architecture

### Technology Stack
- **Frontend**: Next.js 16 with App Router and React 19.
- **Backend**: KeystoneJS 6 with a GraphQL API.
- **Database**: PostgreSQL with Prisma ORM.
- **Styling**: Tailwind CSS 4 and shared shadcn/ui components.
- **Authentication**: Password-based user accounts and session-based access with role capabilities.

### Application Structure
```text
openfront-hospital/
├── app/                    # Public pages, dashboard routes, and HTTP endpoints
├── features/
│   ├── keystone/           # Backend models, access rules, and GraphQL workflows
│   ├── platform/           # Operator workspaces and onboarding
│   ├── storefront/         # Public application components and screens
│   └── dashboard/          # Authentication and shared dashboard shell
└── components/             # Shared UI components
```

### Data Models
The [model registry](features/keystone/models/index.ts) and [Prisma schema](schema.prisma) cover:

- Patients, identifiers, registration, coverage, providers, appointments, and intake.
- Facilities, departments, wards, rooms, beds, admissions, and encounters.
- Clinical orders, prescriptions, procedures, labs, specimens, vital signs, and care plans.
- Claims, payments, communication, consent, PHI-read events, integration delivery, exports, and retention.

## Getting Started

### Prerequisites
- Node.js 22, compatible with the [package requirements](package.json) and Next.js 16.
- A PostgreSQL database you can migrate.
- npm.

### Setup

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/openshiporg/openfront-hospital.git
   cd openfront-hospital
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```

   Review the [example configuration](.env.example) and replace its placeholders. Keep only the local settings you need; do not copy production-mode or infrastructure examples unchanged.

   ```env
   DATABASE_URL=postgresql://user:password@host/database
   SESSION_SECRET=replace-with-a-new-private-random-secret
   ```

   Generate the session secret with `openssl rand -hex 32`; use the generated value, not the placeholder. Never commit `.env`.

   Review [runtime configuration](features/keystone/security/runtimeConfig.ts) for additional application settings before building or deploying. Configure enabled integrations separately; the two values above are not a complete production configuration.

   Production also requires configured object storage. Set `S3_BUCKET_NAME`, `S3_REGION`, `S3_ACCESS_KEY_ID`, and `S3_SECRET_ACCESS_KEY`, and supply the S3-compatible endpoint described in the source. Review mail and application-specific security settings there as well.

   Configure the independent bootstrap, recovery, delivery, and encryption secrets described by the production validator. Supply mail and storage settings before production builds, and retain encryption keys securely.

3. **Start development server:**
   ```bash
   npm run dev
   ```

   The development script prepares the backend schema, applies checked-in migrations, and starts Next.js.

4. **Access the application:**
   Open the URL `npm run dev` prints, then use these paths:

   - **Public application**: `/`
   - **Admin dashboard**: `/dashboard`
   - **GraphQL API**: `/api/graphql`

5. **Create your first admin user:**
   Create the first administrator through the secret-protected `bootstrapHospital` GraphQL mutation, following [the bootstrap implementation](features/keystone/mutations/bootstrap/bootstrapHospital.ts). It accepts the configured bootstrap secret and administrator details only while no user exists. The ordinary Keystone initial-user mutation is not enabled.

6. **Run application onboarding:**
   After private bootstrap, sign in to the dashboard and complete hospital onboarding. Review facilities, provider schedules, clinical access, appointment types, intake, and communication settings before collecting patient information.

## Development Commands

- `npm run dev` - Prepare the backend schema, apply migrations, and start Next.js development.
- `npm run build` - Build the backend and Next.js for production; also applies migrations.
- `npm start` - Start the production Next.js server.
- `npm run migrate:gen` - Prepare the schema and generate/apply development migrations.
- `npm run migrate` - Apply checked-in Prisma migrations.
- `npm run lint` - Run the repository's ESLint script.
- `npm run typecheck` - Run the configured TypeScript check.
- `npm run worker:outbox` - Run the configured outbox delivery entry point.

Use a disposable development database for migration generation. Review the script before running it against any existing data.

### Clinical Integration & Delivery
The [registered workflows](features/keystone/mutations/index.ts) include booking, registration, encounters, controlled clinical operations, integration delivery, and portability. Run `npm run worker:outbox` separately for configured delivery; an installation record does not certify external EHR or laboratory connectivity.

## Documentation

See the [Openfront Hospital documentation](https://docs.openship.org/docs/openfront/hospital/) for the application guide. The [backend models](features/keystone/models), [registered business workflows](features/keystone/mutations/index.ts), [access rules](features/keystone/access.ts), and [application routes](app) document the implementation in this repository.

## Security & Permissions

### Role-Based Access Control
- `canAccessDashboard` - Access dashboard.
- `canManagePatients` - Manage patients.
- `canManageAppointments` - Manage appointments.
- `canManageScheduling` - Manage scheduling.
- `canManageIntake` - Manage intake.
- `canManageBilling` - Manage billing.
- `canAccessAllClinicalData` - Access all clinical data.

### Security Features
- Session-based authentication for signed-in users.
- Backend list access and workflow authorization, rather than dashboard visibility alone.
- Staff capabilities combine with patient and clinical access filters; global clinical access is an explicit permission, not a default for all dashboard users. Private bootstrap, session policy, intake access, and clinical commands have separate checks.

Review the [access implementation](features/keystone/access.ts) and individual workflow checks before extending permissions.

## Platform Components

### Admin Platform (`/dashboard`)
- **Patients**: `/dashboard/platform/patients`.
- **Inpatient**: `/dashboard/platform/inpatient`.
- **Registration**: `/dashboard/platform/registration`.
- **Appointments**: `/dashboard/platform/appointments`.
- **Operational Fabric**: `/dashboard/platform/operational-fabric`.
- **Store Settings**: `/dashboard/platform/store-settings`.
- **Clinical Operations**: `/dashboard/platform/clinical-operations`.
- **Schedules**: `/dashboard/platform/schedules`.
- **Intake**: `/dashboard/platform/intake`.
- **Clinical Fulfillment**: `/dashboard/platform/clinical-fulfillment`.
- **Encounters**: `/dashboard/platform/encounters`.
- **Care Queue**: `/dashboard/platform/care-queue`.

### Storefront Experience
Public routes include `/care`, `/providers`, `/book`, appointment-type booking pages, and `/intake`. Intake access and appointment requests are separate from staff access to clinical records.

Maintain patient identity and coverage, registration, appointment types, provider schedules, care queues, intake, consent, and secure patient communication.

## Deployment

### Production Deployment
The Vercel button imports this application's own repository. Provision PostgreSQL and configure the application's complete runtime requirements, storage, mail, and enabled providers before building. Importing the source does not configure these services or grant regulatory approval.

The production build applies migrations and therefore requires database access. Back up the database before building against existing data.

```bash
npm run build
npm start
```

The included [Railway configuration](railway.toml) defines this app's build and startup lifecycle. Provision services and secrets separately.

### Scaling Considerations
Run `npm run worker:outbox` separately for configured delivery. Protect patient records, backup and restore procedures, encryption keys, and clinical access policies across every process.

## Contributing

Use the development commands above when preparing changes. Keep model changes and their migrations together, and describe workflow and permission changes in pull requests.

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE).

## Support

- **Documentation**: [Openfront Hospital guide](https://docs.openship.org/docs/openfront/hospital/).
- **Issues**: [Report bugs and feature requests](https://github.com/openshiporg/openfront-hospital/issues).
- **Product**: [Learn more about Openfront Hospital](https://openship.org/products/openfront-hospital).

---

Built with [Next.js](https://nextjs.org) and [KeystoneJS](https://keystonejs.com).
