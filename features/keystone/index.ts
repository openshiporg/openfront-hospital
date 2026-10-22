import { s3ForcePathStyle } from "./lib/s3-storage";
import { createAuth } from "@keystone-6/auth";
import { config } from "@keystone-6/core";
import "dotenv/config";
import { models } from "./models";
import { extendGraphqlSchema } from "./mutations";
import { createSessionStrategy } from "./security/sessionPolicy";
import { validateProductionEnvironment } from "./security/runtimeConfig";

validateProductionEnvironment();
const databaseURL = process.env.DATABASE_URL || "file:./keystone.db";

const {
  S3_BUCKET_NAME: bucketName = "keystone-test",
  S3_REGION: region = "ap-southeast-2",
  S3_ACCESS_KEY_ID: accessKeyId = "keystone",
  S3_SECRET_ACCESS_KEY: secretAccessKey = "keystone",
  S3_ENDPOINT: endpoint = "https://sfo3.digitaloceanspaces.com",
} = process.env;

const { withAuth } = createAuth({
  listKey: "User",
  identityField: "email",
  secretField: "password",
  // Public Keystone bootstrap and password-reset mutations are deliberately not
  // enabled. Repository-owned, rate-limited routes provide both workflows.
  sessionData: `
    name
    email
    securityVersion
    role {
      id
      name
      canManageAppointments
      canManageScheduling
      canManagePatients
      canManageProviders
      canManageIntake
      canManageCommunications
      canManageBilling
      canManageInventory
      canManageIntegrations
      canManageDataPortability
      canManageRetention
      canViewReports
      canManageOnboarding
      canSeeOtherPeople
      canEditOtherPeople
      canManagePeople
      canManageRoles
      canAccessDashboard
      canAccessAllClinicalData
    }
  `,
});

export default withAuth(
  config({
    db: {
      provider: "postgresql",
      url: databaseURL,
    },
    lists: models,
    storage: {
      my_images: {
        kind: "s3",
        type: "image",
        bucketName,
        region,
        accessKeyId,
        secretAccessKey,
        endpoint,
        signed: { expiry: 5000 },
        forcePathStyle: s3ForcePathStyle(endpoint),
      },
    },
    ui: {
      isAccessAllowed: ({ session }) => session?.data.role?.canAccessDashboard ?? false,
    },
    session: createSessionStrategy(),
    graphql: {
      extendGraphqlSchema,
    },
  })
);