// HRMP — التحقق بمخطط XSD المرفوع من المحاسب (SPEC §4.6 — المرحلة 6ج)
// «يتحقق النظام من كل ملف مُولَّد بمخطط XSD المفعّل قبل التصدير، ويعرض أخطاء التحقق بوضوح (العنصر، السبب)»
// التنفيذ: مجموعة XSD شائعة كاملة الوظيفة هنا (بلا تبعيات — بيئة الهاتف):
//   بنية العناصر المتشابكة (xs:sequence) | التكرار (minOccurs/maxOccurs) | الإلزام
//   | الأنواع البسيطة بقيود xs:maxLength وxs:pattern | xs:attribute
// المحدودات الموثقة: xs:choice/xs:all وxs:import/xs:include تُعامل كتحذير لا خطأ
// (التحقق النهائي عند الجهة يبقى الفيصل — لا نضمن القبول قبل مواصفة رسمية يعتمدها المحاسب).
import { parseXml, type XmlNode } from "./xml";
import type { ValidationIssue } from "./types";

// ── نموذج المخطط ──────────────────────────────────────────────────

type XsdElementModel = {
  name: string;
  minOccurs: number;
  maxOccurs: number | "unbounded";
  children: XsdElementModel[] | null; // null = محتوى نصي بسيط
  maxLength: number | null;
  pattern: string | null;
  attributes: { name: string; required: boolean }[];
};

export type XsdModel = {
  root: XsdElementModel | null;
  warnings: ValidationIssue[]; // محدودات موثقة (import/include/choice...)
};

function parseCardinality(el: XmlNode): { min: number; max: number | "unbounded" } {
  const min = el.attrs.minOccurs !== undefined ? Number(el.attrs.minOccurs) : 1;
  let max: number | "unbounded" = 1;
  if (el.attrs.maxOccurs !== undefined) {
    max = el.attrs.maxOccurs === "unbounded" ? "unbounded" : Number(el.attrs.maxOccurs);
  }
  return { min: Number.isFinite(min) && min >= 0 ? min : 1, max };
}

function parseRestrictions(typeNode: XmlNode): { maxLength: number | null; pattern: string | null } {
  let maxLength: number | null = null;
  let pattern: string | null = null;
  const walk = (n: XmlNode) => {
    if (n.name.endsWith("restriction") || n.name.endsWith("maxLength") || n.name.endsWith("pattern")) {
      if (n.name.endsWith("maxLength") && n.attrs.value !== undefined) maxLength = Number(n.attrs.value);
      if (n.name.endsWith("pattern") && n.attrs.value !== undefined) pattern = n.attrs.value;
    }
    for (const c of n.children) walk(c);
  };
  for (const c of typeNode.children) walk(c);
  return { maxLength, pattern };
}

/** تحويل عقدة xs:element إلى نموذج (تكراري عبر complexType مضمن أو مرجع باسم) */
function buildElementModel(
  el: XmlNode,
  namedTypes: Map<string, XmlNode>,
  warnings: ValidationIssue[],
  depth: number
): XsdElementModel | null {
  if (depth > 24) {
    warnings.push({ element: el.attrs.name ?? "?", reason: "xsd_recursion_too_deep" });
    return null;
  }
  const name = el.attrs.name ?? el.attrs.ref;
  if (!name) {
    warnings.push({ element: "element", reason: "xsd_element_without_name" });
    return null;
  }
  const { min, max } = parseCardinality(el);

  // complexType مضمن داخل تعريف العنصر
  const inlineComplex = el.children.find((c) => c.name.endsWith("complexType"));
  // simpleType مضمن (قيود)
  const inlineSimple = el.children.find((c) => c.name.endsWith("simpleType"));

  const typeAttr = el.attrs.type;
  let complexNode: XmlNode | null = inlineComplex ?? null;
  if (!complexNode && typeAttr) {
    const referenced = namedTypes.get(typeAttr) ?? namedTypes.get(typeAttr.replace(/^.*:/, ""));
    if (referenced && referenced.name.endsWith("complexType")) complexNode = referenced;
  }

  let simpleRestrictions: { maxLength: number | null; pattern: string | null } = { maxLength: null, pattern: null };
  if (inlineSimple) simpleRestrictions = parseRestrictions(inlineSimple);
  if (typeAttr) {
    const referenced = namedTypes.get(typeAttr.replace(/^.*:/, ""));
    if (referenced && referenced.name.endsWith("simpleType")) {
      const r = parseRestrictions(referenced);
      simpleRestrictions = { maxLength: simpleRestrictions.maxLength ?? r.maxLength, pattern: simpleRestrictions.pattern ?? r.pattern };
    }
  }

  if (!complexNode) {
    return { name, minOccurs: min, maxOccurs: max, children: null, ...simpleRestrictions, attributes: [] };
  }

  // sequence → أبناء مرتبون (SUBSET: choice/all تُسوَّى كتحذير وتُعامل كsequence)
  const children: XsdElementModel[] = [];
  for (const container of complexNode.children) {
    if (container.name.endsWith("sequence")) {
      for (const child of container.children) {
        if (!child.name.endsWith("element")) continue;
        const model = buildElementModel(child, namedTypes, warnings, depth + 1);
        if (model) children.push(model);
      }
    } else if (container.name.endsWith("choice") || container.name.endsWith("all")) {
      warnings.push({ element: name, reason: "xsd_choice_all_treated_as_sequence" });
      for (const child of container.children) {
        if (!child.name.endsWith("element")) continue;
        const model = buildElementModel(child, namedTypes, warnings, depth + 1);
        if (model) children.push(model);
      }
    } else if (container.name.endsWith("attribute")) {
      // تُجمع على مستوى العنصر الأب
    }
  }
  const attributes = complexNode.children
    .filter((c) => c.name.endsWith("attribute"))
    .map((c) => ({ name: c.attrs.name ?? "?", required: c.attrs.use === "required" }));

  return { name, minOccurs: min, maxOccurs: max, children, maxLength: simpleRestrictions.maxLength, pattern: simpleRestrictions.pattern, attributes };
}

/** تحليل مخطط XSD إلى نموذج تحقق — يرمي عند XML غير متشكل */
export function parseXsd(xsdText: string): XsdModel {
  const root = parseXml(xsdText); // يرمي XmlParseError عند خلل تشكلي
  const warnings: ValidationIssue[] = [];

  // جمع الأنواع المسماة (complexType/simpleType بأسماء)
  const namedTypes = new Map<string, XmlNode>();
  const walkCollect = (n: XmlNode) => {
    if ((n.name.endsWith("complexType") || n.name.endsWith("simpleType")) && n.attrs.name) {
      namedTypes.set(n.attrs.name, n);
    }
    for (const c of n.children) walkCollect(c);
  };
  walkCollect(root);

  if (root.name.endsWith("import") || root.children.some((c) => c.name.endsWith("import"))) {
    warnings.push({ element: "schema", reason: "xsd_import_not_resolved" });
  }
  if (root.children.some((c) => c.name.endsWith("include"))) {
    warnings.push({ element: "schema", reason: "xsd_include_not_resolved" });
  }

  // عنصر الجذر: أول xs:element على مستوى xs:schema
  const rootEl = root.children.find((c) => c.name.endsWith("element"));
  const model = rootEl ? buildElementModel(rootEl, namedTypes, warnings, 0) : null;
  return { root: model, warnings };
}

// ── التحقق ────────────────────────────────────────────────────────

function validateChildren(
  model: XsdElementModel,
  node: XmlNode,
  issues: ValidationIssue[],
  path: string
): void {
  const currentPath = path === "" ? model.name : `${path}/${node.name}`;

  // السمات المطلوبة
  for (const attr of model.attributes) {
    if (attr.required && !(attr.name in node.attrs)) {
      issues.push({ element: `${currentPath}@${attr.name}`, reason: "missing_required_attribute" });
    }
  }

  if (model.children === null) {
    // محتوى بسيط: قيود الطول والنمط
    if (model.maxLength !== null && node.text.length > model.maxLength) {
      issues.push({ element: currentPath, reason: "length_violation", detail: `len=${node.text.length} max=${model.maxLength}` });
    }
    if (model.pattern !== null && node.text !== "" && !new RegExp(model.pattern).test(node.text)) {
      issues.push({ element: currentPath, reason: "pattern_violation", detail: model.pattern });
    }
    if (node.children.length > 0) {
      issues.push({ element: currentPath, reason: "unexpected_nested_elements" });
    }
    return;
  }

  if (node.text.trim() !== "") {
    issues.push({ element: currentPath, reason: "text_in_complex_element", detail: node.text.slice(0, 40) });
  }

  // sequence: مطابقة مرتبة (خوارزمية جشعة بالترتيب)
  const nodeChildren = [...node.children];
  let cursor = 0;
  for (const childModel of model.children) {
    const matching: XmlNode[] = [];
    while (cursor < nodeChildren.length && nodeChildren[cursor].name === childModel.name) {
      matching.push(nodeChildren[cursor]);
      cursor++;
    }
    const maxOK = childModel.maxOccurs === "unbounded" ? Number.POSITIVE_INFINITY : childModel.maxOccurs;
    if (matching.length < childModel.minOccurs) {
      issues.push({
        element: `${currentPath}/${childModel.name}`,
        reason: "missing_required_element",
        detail: `found=${matching.length} min=${childModel.minOccurs}`,
      });
      continue;
    }
    if (matching.length > maxOK) {
      issues.push({
        element: `${currentPath}/${childModel.name}`,
        reason: "cardinality_violation",
        detail: `found=${matching.length} max=${childModel.maxOccurs}`,
      });
    }
    for (const m of matching) {
      validateChildren(childModel, m, issues, currentPath);
    }
  }
  if (cursor < nodeChildren.length) {
    for (const extra of nodeChildren.slice(cursor)) {
      issues.push({ element: `${currentPath}/${extra.name}`, reason: "unexpected_element" });
    }
  }
}

/** التحقق من مستند XML ضد المخطط — يرجع قائمة {العنصر، السبب} (SPEC §4.6) */
export function validateXmlAgainstXsd(xmlText: string, xsdModel: XsdModel): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!xsdModel.root) {
    return [{ element: "schema", reason: "xsd_no_root_element" }];
  }
  let node: XmlNode;
  try {
    node = parseXml(xmlText);
  } catch (e) {
    return [{ element: "document", reason: "malformed_xml", detail: (e as Error).message.slice(0, 80) }];
  }
  if (node.name !== xsdModel.root.name) {
    issues.push({ element: node.name, reason: "root_element_mismatch", detail: `expected=${xsdModel.root.name}` });
    return issues;
  }
  validateChildren(xsdModel.root, node, issues, "");
  return issues;
}
