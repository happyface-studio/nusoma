// Convention:
// - Everything lowercase is an object
// - Everything uppercase is a string (the route)

export const baseUrl =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const routes = {
  index: `${baseUrl}/`,
  api: `${baseUrl}/api`,
  auth: {
    //changeEmail: {
    // Expired: `${baseUrl}/auth/change-email/expired`,
    // Index: `${baseUrl}/auth/change-email`,
    // Invalid: `${baseUrl}/auth/change-email/invalid`,
    // Request: `${baseUrl}/auth/change-email/request`
    //},
    //Error: `${baseUrl}/auth/error`,
    //forgetPassword: {
    // Index: `${baseUrl}/auth/forgot-password`,
    // Success: `${baseUrl}/auth/forgot-password/success`
    //},
    //Index: `${baseUrl}/auth`,
    //RecoveryCode: `${baseUrl}/auth/recovery-code`,
    //resetPassword: {
    // Expired: `${baseUrl}/auth/reset-password/expired`,
    // Index: `${baseUrl}/auth/reset-password`,
    // Request: `${baseUrl}/auth/reset-password/request`,
    // Success: `${baseUrl}/auth/reset-password/success`
    //},
    SignIn: `${baseUrl}/auth/sign-in`,
    SignUp: `${baseUrl}/auth/sign-up`,
    //Totp: `${baseUrl}/auth/totp`,
    //verifyEmail: {
    // Expired: `${baseUrl}/auth/verify-email/expired`,
    // Index: `${baseUrl}/auth/verify-email`,
    // Request: `${baseUrl}/auth/verify-email/request`,
    // Success: `${baseUrl}/auth/verify-email/success`
    //}
  },
  dashboard: `${baseUrl}/dashboard`,
  // invitations: {
  //     AlreadyAccepted: `${baseUrl}/invitations/already-accepted`,
  //     Index: `${baseUrl}/invitations`,
  //     Request: `${baseUrl}/invitations/request`,
  //     Revoked: `${baseUrl}/invitations/revoked`
  // },
  // onboarding: {
  //     Index: `${baseUrl}/onboarding`,
  //     Organization: `${baseUrl}/onboarding/organization`,
  //     User: `${baseUrl}/onboarding/user`
  // },
  // organizations: {
  //     Index: `${baseUrl}/organizations`,
  //     slug: {
  //         ChoosePlan: `${baseUrl}/organizations/[slug]/choose-plan`,
  //         Contacts: `${baseUrl}/organizations/[slug]/contacts`,
  //         Home: `${baseUrl}/organizations/[slug]/home`,
  //         Index: `${baseUrl}/organizations/[slug]`,
  //         settings: {
  //             account: {
  //                 Index: `${baseUrl}/organizations/[slug]/settings/account`,
  //                 Notifications: `${baseUrl}/organizations/[slug]/settings/account/notifications`,
  //                 Profile: `${baseUrl}/organizations/[slug]/settings/account/profile`,
  //                 Security: `${baseUrl}/organizations/[slug]/settings/account/security`
  //             },
  //             Index: `${baseUrl}/organizations/[slug]/settings`,
  //             organization: {
  //                 Billing: `${baseUrl}/organizations/[slug]/settings/organization/billing`,
  //                 Developers: `${baseUrl}/organizations/[slug]/settings/organization/developers`,
  //                 General: `${baseUrl}/organizations/[slug]/settings/organization/general`,
  //                 Index: `${baseUrl}/organizations/[slug]/settings/organization`,
  //                 Members: `${baseUrl}/organizations/[slug]/settings/organization/members`
  //             }
  //         }
  //     }
  // },
  marketing: {
    Blog: `${baseUrl}/blog`,
    Careers: `${baseUrl}/careers`,
    Contact: `${baseUrl}/contact`,
    CookiePolicy: `${baseUrl}/cookie-policy`,
    Docs: `${baseUrl}/docs`,
    Index: `${baseUrl}/`,
    Pricing: `${baseUrl}/pricing`,
    PrivacyPolicy: `${baseUrl}/privacy-policy`,
    Roadmap: "https://achromatic.canny.io",
    Story: `${baseUrl}/story`,
    TermsOfUse: `${baseUrl}/terms-of-use`,
  },
} as const;

// type ExtractSlugRoutes<T> =
//     T extends Record<string, unknown>
//     ? {
//         [K in keyof T]: T[K] extends string
//         ? T[K] extends `${string}[slug]${string}`
//         ? T[K]
//         : never
//         : ExtractSlugRoutes<T[K]>;
//     }[keyof T]
//     : never;

// type OrganizationsSlugRoutes = ExtractSlugRoutes<
//     typeof routes.organizations.slug
// >;

// export function replaceOrgSlug(
//     route: OrganizationsSlugRoutes,
//     slug: string
// ): string {
//     if (route.indexOf('[slug]') === -1) {
//         throw new Error(
//             `Invalid route: ${route}. Route must contain the placeholder [slug].`
//         );
//     }

//     return route.replace('[slug]', slug);
// }

export function getPathname(route: string, baseUrl: string): string {
  return new URL(route, baseUrl).pathname;
}

// export function getOrganizationLogoUrl(
//     organizationId: string,
//     hash: string
// ): string {
//     return `${routes.api}/organization-logos/${organizationId}?v=${hash}`;
// }

// export function getUserImageUrl(userId: string, hash: string): string {
//     return `${routes.api}/user-images/${userId}?v=${hash}`;
// }

// export function getContactImageUrl(contactId: string, hash: string): string {
//     return `${routes.api}/contact-images/${contactId}?v=${hash}`;
// }
