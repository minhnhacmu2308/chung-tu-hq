import type { DigitalCertificate } from "@kb/contracts";
import type { CertificateRow } from "./ports.js";

export const toCertificate = (c: CertificateRow): DigitalCertificate => ({ id: c.id, subject: c.subject, issuer: c.issuer, serial: c.serial, validTo: c.validTo, isDefault: c.isDefault });
