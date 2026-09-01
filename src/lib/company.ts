export function companyProfile() {
  return {
    name: process.env.COMPANY_NAME?.trim() || "Quore B2B",
    legalName: process.env.COMPANY_LEGAL_NAME?.trim() || "Quore B2b Private Limited",
    address:
      process.env.COMPANY_ADDRESS?.trim() ||
      "Omicron commerz, 8th floor office 804, Z Lane, Mundhwa Pune India",
    tagline: process.env.COMPANY_TAGLINE?.trim() || "",
  };
}
