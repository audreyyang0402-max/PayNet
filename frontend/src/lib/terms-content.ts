// frontend/src/lib/terms-content.ts
// ─────────────────────────────────────────────────────────────────────────────
// Single source of truth for Payvolution's Terms & Conditions.
//
// This used to be written out twice — once on the standalone /terms page and
// again inside the footer's T&C modal — and the two copies drifted apart over
// time (different section counts, different wording, even a different title).
// Both places now import this file and render the same sections, so there is
// only one place left to edit when the legal text needs to change.
// ─────────────────────────────────────────────────────────────────────────────

export const TERMS_TITLE = "Terms & Conditions";
export const TERMS_SUBTITLE = "Payvolution (Sunway Express Lane) · Sunway College, SDS";
export const TERMS_LAST_UPDATED = "November 2026";

export interface TermsSection {
  heading: string;
  body: string;
}

export const TERMS_SECTIONS: TermsSection[] = [
  {
    heading: "1. Acceptance of Terms",
    body: "By creating an account and using the Sunway Express Lane platform (\"Platform\"), you agree to be bound by these Terms & Conditions. If you do not agree, please do not use the Platform.",
  },
  {
    heading: "2. Use of the Platform",
    body: "The Platform is a campus food ordering and click-and-collect service for students, staff, and visitors of Sunway University and Sunway College. All orders are for food pickup only — we do not offer delivery. You agree to use the Platform only for lawful purposes and in accordance with these Terms.",
  },
  {
    heading: "3. Account Registration & Responsibility",
    body: "You must provide accurate, current, and complete information when registering an account, and are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. Payvolution reserves the right to suspend or terminate accounts that violate these Terms.",
  },
  {
    heading: "4. Orders & Payments",
    body: "Orders are confirmed only after the merchant verifies payment. Prices are set by individual merchants and may change without notice. If a merchant rejects an already-paid order because an item is sold out or the stall cannot fulfil it, the customer may request an online or walk-in refund through the Platform. The merchant must complete the refund and upload evidence; the customer may confirm receipt or raise a dispute, and Payvolution administrators may review the case. Payvolution records and facilitates this manual process but does not itself hold or automatically reverse the payment.",
  },
  {
    heading: "5. Pickup & Collection",
    body: "Orders are for campus pickup only. You are responsible for collecting your order within the designated pickup window — the Platform is not responsible for uncollected orders.",
  },
  {
    heading: "6. Merchant Content",
    body: "Merchants are responsible for the accuracy of their own menu items, prices, and availability. Payvolution does not guarantee the nutritional content, allergen information, or preparation methods of any food item. Customers with food allergies should contact the merchant directly before ordering.",
  },
  {
    heading: "7. User Conduct",
    body: "You agree not to misuse the Platform, submit false information, or engage in any conduct that disrupts the service or harms other users or merchants. Violations may result in account suspension.",
  },
  {
    heading: "8. Privacy & Data",
    body: "We collect account and order data to operate the Platform and do not sell personal information. For eligible refunds, we may also process encrypted bank details or a private DuitNow QR image and refund evidence, accessible only to the responsible merchant and authorised administrators. Profile photos and dietary preferences are stored locally in your browser and are not uploaded to our servers.",
  },
  {
    heading: "9. Intellectual Property",
    body: "All content on the Platform, including logos, graphics, and text, is the property of Payvolution or its licensors and may not be reproduced without permission.",
  },
  {
    heading: "10. Limitation of Liability",
    body: "The Platform is provided \"as is\". Payvolution makes no warranties regarding uptime, accuracy, or fitness for a particular purpose, and to the maximum extent permitted by law is not liable for any loss, damage, or dissatisfaction arising from use of the Platform — including but not limited to order errors, merchant delays, technical outages, or indirect or consequential damages.",
  },
  {
    heading: "11. Changes to Terms",
    body: "We may update these Terms at any time. Continued use of the Platform after changes constitutes your acceptance of the revised Terms.",
  },
];

// Section 12 (Contact) is handled separately by each page so the email can be
// rendered as a real mailto link instead of plain text within `body`.
export const TERMS_CONTACT_HEADING = "12. Contact Us";
export const TERMS_CONTACT_INTRO = "For any questions, account issues, or support requests, please reach out to us at";
export const TERMS_CONTACT_EMAIL = "payvolutionwebsite@gmail.com";
