// HRMP — أدوات XML (SPEC §4.6 — المرحلة 6ج): مُحلّل خفيف + بانٍ من ربط (mapping)
// بلا تبعيات خارجية (بيئة الهاتف): مُحلّل متناسي بسيط للـXML المتشكل تمامًا.
import type { DeclarationContext, XmlMapping, XmlMappingField } from "./types";

// ── عقدة XML ─────────────────────────────────────────────────────

export type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

export class XmlParseError extends Error {
  position: number;
  constructor(message: string, position: number) {
    super(`${message} at position ${position}`);
    this.name = "XmlParseError";
    this.position = position;
  }
}

const ENTITY_DECODE: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&amp;": "&" };
const ENTITY_ENCODE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" };

export function escapeXml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ENTITY_ENCODE[c]);
}

function decodeEntities(text: string): string {
  return text.replace(/&(lt|gt|quot|apos|amp);/g, (m) => ENTITY_DECODE[m] ?? m);
}

/** تحليل XML متشكل (تاغات وسمات ونصوص) — يرمي XmlParseError عند أي خلل تشكلي */
export function parseXml(input: string): XmlNode {
  let i = 0;
  const len = input.length;

  const skipWhitespace = () => {
    while (i < len && /\s/.test(input[i])) i++;
  };

  const parseName = (): string => {
    const start = i;
    while (i < len && /[A-Za-z0-9_.\-:]/.test(input[i])) i++;
    if (i === start) throw new XmlParseError("expected_name", start);
    return input.slice(start, i);
  };

  const parseAttrs = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      if (i >= len) throw new XmlParseError("unexpected_eof_in_tag", i);
      if (input[i] === ">" || input[i] === "/") break;
      const name = parseName();
      skipWhitespace();
      if (input[i] !== "=") throw new XmlParseError("expected_equals", i);
      i++;
      skipWhitespace();
      const quote = input[i];
      if (quote !== '"' && quote !== "'") throw new XmlParseError("expected_quote", i);
      i++;
      const start = i;
      while (i < len && input[i] !== quote) i++;
      if (i >= len) throw new XmlParseError("unterminated_attribute", start);
      attrs[name] = decodeEntities(input.slice(start, i));
      i++; // اقتباس الإغلاق
    }
    return attrs;
  };

  const parseNode = (): XmlNode => {
    if (input[i] !== "<") throw new XmlParseError("expected_tag_open", i);
    i++;
    const name = parseName();
    const attrs = parseAttrs();
    let selfClosing = false;
    if (input[i] === "/") {
      selfClosing = true;
      i++;
    }
    if (input[i] !== ">") throw new XmlParseError("expected_tag_close", i);
    i++;
    if (selfClosing) return { name, attrs, children: [], text: "" };

    const node: XmlNode = { name, attrs, children: [], text: "" };
    let textBuffer = "";
    for (;;) {
      if (i >= len) throw new XmlParseError(`unclosed_element:${name}`, i);
      if (input[i] === "<") {
        if (input.startsWith("</", i)) {
        i += 2;
        const closeName = parseName();
        skipWhitespace();
        if (input[i] !== ">") throw new XmlParseError("expected_tag_close", i);
        i++;
        if (closeName !== name) throw new XmlParseError(`mismatched_close:${closeName}!=${name}`, i);
        node.text = textBuffer;
        return node;
      }
        if (textBuffer.trim() !== "" && node.children.length > 0) {
          throw new XmlParseError("mixed_content", i);
        }
        if (textBuffer.trim() !== "") node.text = textBuffer;
        textBuffer = "";
        node.children.push(parseNode());
      } else {
        textBuffer += input[i];
        i++;
      }
    }
  };

  skipWhitespace();
  // تعليمات المعالجة والإعلانات تُتخطى (<?xml ...?> و<!-- تعليق -->)
  for (;;) {
    skipWhitespace();
    if (input.startsWith("<?", i)) {
      const end = input.indexOf("?>", i);
      if (end === -1) throw new XmlParseError("unterminated_pi", i);
      i = end + 2;
    } else if (input.startsWith("<!--", i)) {
      const end = input.indexOf("-->", i);
      if (end === -1) throw new XmlParseError("unterminated_comment", i);
      i = end + 3;
    } else {
      break;
    }
  }
  const root = parseNode();
  skipWhitespace();
  if (i < len) throw new XmlParseError("trailing_content_after_root", i);
  return root;
}

// ── بانٍ من ربط (mapping) — إعداد يعدّله المحاسب لا كود (SPEC §4.6) ──

function resolveMappingValue(
  field: XmlMappingField,
  ctx: DeclarationContext,
  workerIndex: number | null
): { value: string | null } {
  const w = workerIndex !== null ? ctx.workers[workerIndex] : null;
  switch (field.source) {
    case "literal":
      return { value: field.value ?? "" };
    case "company.taxId":
      return { value: ctx.companyTaxId };
    case "company.legalName":
      return { value: ctx.companyLegalName };
    case "company.cnssNumber":
      return { value: ctx.companyCnssNumber };
    case "declaration.year":
      return { value: String(ctx.periodYear) };
    case "declaration.periodKey":
      return { value: ctx.periodKey };
    case "worker.cin":
      return { value: w?.cin ?? null };
    case "worker.cnssNumber":
      return { value: w?.cnssNumber ?? null };
    case "worker.fullName":
      return { value: w?.fullName ?? null };
    case "payslip.refNumber":
      return { value: w?.refNumber ?? null };
    case "payslip.workedDays":
      return { value: w ? String(w.workedDays) : null };
    case "payslip.grossCents":
      return { value: w ? String(field.format === "cents_to_mad" ? (w.grossCents / 100).toFixed(2) : w.grossCents) : null };
    case "payslip.sbiCents":
      return { value: w ? String(field.format === "cents_to_mad" ? (w.sbiCents / 100).toFixed(2) : w.sbiCents) : null };
    case "payslip.irNetCents":
      return { value: w ? String(field.format === "cents_to_mad" ? (w.irNetCents / 100).toFixed(2) : w.irNetCents) : null };
    case "payslip.netCents":
      return { value: w ? String(field.format === "cents_to_mad" ? (w.netCents / 100).toFixed(2) : w.netCents) : null };
    case "total.workers":
      return { value: String(ctx.workers.length) };
    case "total.grossCents":
      return { value: String(field.format === "cents_to_mad" ? (ctx.workers.reduce((a, x) => a + x.grossCents, 0) / 100).toFixed(2) : ctx.workers.reduce((a, x) => a + x.grossCents, 0)) };
    case "total.sbiCents":
      return { value: String(field.format === "cents_to_mad" ? (ctx.workers.reduce((a, x) => a + x.sbiCents, 0) / 100).toFixed(2) : ctx.workers.reduce((a, x) => a + x.sbiCents, 0)) };
    case "total.irNetCents":
      return { value: String(field.format === "cents_to_mad" ? (ctx.workers.reduce((a, x) => a + x.irNetCents, 0) / 100).toFixed(2) : ctx.workers.reduce((a, x) => a + x.irNetCents, 0)) };
    default:
      return { value: null };
  }
}

/** بناء مستند XML من الربط والسياق — القيم الناقصة تُسجَّل كمشاكل ولا يُبنى الملف */
export function buildXmlFromMapping(
  mapping: XmlMapping,
  ctx: DeclarationContext
): { xml: string; missing: string[] } {
  const missing: string[] = [];
  const indent = (n: number) => "  ".repeat(n);
  const lines: string[] = [];
  const ns = mapping.namespace ? ` xmlns="${mapping.namespace}"` : "";

  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<${mapping.rootElement}${ns}>`);

  const emit = (field: XmlMappingField, scope: string, workerIndex: number | null, depth: number) => {
    const { value } = resolveMappingValue(field, ctx, workerIndex);
    if (value === null || value === "") {
      missing.push(`${scope}.${field.element}:${field.source}`);
      return;
    }
    lines.push(`${indent(depth)}<${field.element}>${escapeXml(value)}</${field.element}>`);
  };

  for (const field of mapping.fields.filter((f) => f.scope === "header")) {
    emit(field, "header", null, 1);
  }
  for (let idx = 0; idx < ctx.workers.length; idx++) {
    const workerFields = mapping.fields.filter((f) => f.scope === "per_worker");
    if (workerFields.length === 0) break;
    lines.push(`${indent(1)}<Employe>`);
    for (const field of workerFields) {
      emit(field, `worker[${idx}]`, idx, 2);
    }
    lines.push(`${indent(1)}</Employe>`);
  }
  for (const field of mapping.fields.filter((f) => f.scope === "trailer")) {
    emit(field, "trailer", null, 1);
  }

  lines.push(`</${mapping.rootElement}>`);
  return { xml: lines.join("\n"), missing };
}
