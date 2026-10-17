// NL/EN parity check for the non-admin UI. Translations are inline pairs: tx("nl","en"), t(...), tr(...), and
// [nl, en] tuples in known tables (CATEGORIES, QUICK, FAQ). Fails on missing/empty/identical-untranslated values,
// and on JSX text that looks Dutch or English but isn't wrapped in a pair.
import ts from "typescript";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../src");
const SKIP = [/\/app\/admin\//, /\/lib\/admin\.ts$/, /\/lib\/mock-data\.ts$/, /AdminOrderContact/, /\/components\/adminFinance\.tsx$/, /\/components\/adminBusiness\.tsx$/];
// Identical NL/EN values that are intended (brand, proper nouns, loanwords, symbols).
const SAME_OK = new Set(["Restaurant", "Home", "OSM", "Admin", "Rider", "Food Porter", "SOS", "OPEN", "Host", "Code", "live", "Deadline", "rider", "· rider", "Naar inhoud / Skip to content", "No messages", "iDEAL", "Login", "Status", "Totaal", "Menu", "Support", "Chat", "Email", "E-mail", "Stop", "OK", "Pizza", "Sushi", "Burger", "Account", "Online", "Offline", "Live", "Test", "Info", "min", "km", "€", "—", "+", "−", "×", "✓"]);
const FN = new Set(["tx", "t", "tr", "tt"]);
const NL_WORDS = /\b(de|het|een|en|je|jouw|bestelling|bezorger|klaar|betaling|terug|niet|wacht|nog|geen|probleem|melden|bel|opgehaald|bezorgd|annuleren|verstuurd|bericht|klant|over|bij|naar|voor|met|ophalen|afleveren|verdiensten|uitbetaling|kies|zoek|winkelmand|afrekenen|inloggen|uitloggen|wachtwoord|adres|van|op|elke|stap|voorbeeld|prijzen|kan|wordt|zijn)\b/i;
const EN_WORDS = /\b(the|your|order|rider|ready|payment|back|not|wait|still|no|problem|report|call|picked|delivered|cancel|sent|message|customer|with|pickup|earnings|payout|choose|search|basket|checkout|sign in|sign out|password|address|please|and|to|at|each|example|prices|updates|go|are|will|can|this|step)\b/i;

const inPair = (x) => { for (let q = x.parent; q; q = q.parent) { if (ts.isCallExpression(q) && ts.isIdentifier(q.expression) && (FN.has(q.expression.text) || ["confirm", "toast", "Error"].includes(q.expression.text))) return true; if (ts.isJsxAttribute(q)) return true; if (ts.isNewExpression(q)) return true; } return false; };
const inJsxChild = (x) => { for (let q = x.parent; q; q = q.parent) { if (ts.isJsxAttribute(q)) return false; if (ts.isJsxExpression(q)) return ts.isJsxElement(q.parent) || ts.isJsxFragment(q.parent); if (ts.isBlock(q) || ts.isFunctionLike(q)) return false; } return false; };
const files = [];
(function walk(d) { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(f) && !SKIP.some((r) => r.test(p))) files.push(p); } })(ROOT);

const problems = []; let pairs = 0;
const lit = (n) => n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) ? n.text : n && ts.isTemplateExpression(n) ? n.getText().slice(1, -1).replace(/\$\{[^}]*\}/g, "{}") : null;
function check(file, node, nl, en, kind) {
  pairs++;
  const at = `${path.relative(ROOT, file)}:${ts.getLineAndCharacterOfPosition(node.getSourceFile(), node.getStart()).line + 1}`;
  if (nl == null || en == null) return problems.push(`${at} ${kind}: missing language (${nl == null ? "nl" : "en"})`);
  if (!nl.trim() || !en.trim()) return problems.push(`${at} ${kind}: empty ${!nl.trim() ? "nl" : "en"} value`);
  if (nl === en && !SAME_OK.has(nl.trim()) && /[a-z]{3}/i.test(nl.replace(/\{\}/g, ""))) problems.push(`${at} ${kind}: identical/untranslated "${nl}"`);
}
for (const file of files) {
  const src = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && FN.has(n.expression.text) && n.arguments.length >= 1) {
      const [a, b] = n.arguments;
      if (lit(a) != null || (b && lit(b) != null)) {
        if (n.arguments.length < 2) check(file, n, lit(a), null, n.expression.text + "()");
        else if (lit(a) != null && lit(b) != null) check(file, n, lit(a), lit(b), n.expression.text + "()");
      }
    }
    // [key?, nl, en, ...] tuples inside the translation tables
    if (ts.isArrayLiteralExpression(n) && ts.isArrayLiteralExpression(n.parent) && /CATEGORIES|QUICK|FAQ|STEPS|TIPS/.test(n.parent.parent?.getText().slice(0, 0) + (n.getSourceFile().text.slice(Math.max(0, n.parent.getStart() - 200), n.parent.getStart())))) {
      const s = n.elements.map(lit).filter((x) => x != null);
      if (s.length >= 2) { const [nl, en] = s.length >= 3 && /^[a-z_]+$/.test(s[0]) ? [s[1], s[2]] : [s[0], s[1]]; check(file, n, nl, en, "tuple"); }
    }
    // Bare JSX text: user-visible language outside a pair
    if (ts.isJsxAttribute(n) && ["nl", "en"].includes(n.name.getText())) {
      const other = n.parent.properties.find((q) => ts.isJsxAttribute(q) && q.name.getText() === (n.name.getText() === "nl" ? "en" : "nl"));
      pairs++; if (!other) problems.push(`${path.relative(ROOT, file)}: <${n.parent.parent.tagName?.getText()}> has ${n.name.getText()} but no ${n.name.getText() === "nl" ? "en" : "nl"} block`);
      if (n.name.getText() === "nl") { ts.forEachChild(n, (c) => void c); return; } // Dutch block: skip bare-text check
    }
    const inLangBlock = (x) => { for (let q = x.parent; q; q = q.parent) if (ts.isJsxAttribute(q) && ["nl", "en"].includes(q.name.getText())) return true; return false; };
    if (ts.isJsxText(n) && !inLangBlock(n)) {
      const txt = n.text.replace(/\s+/g, " ").trim();
      if (txt.length > 2 && /[a-z]{3}/i.test(txt) && (NL_WORDS.test(txt) || EN_WORDS.test(txt)) && !SAME_OK.has(txt)) problems.push(`${path.relative(ROOT, file)}:${ts.getLineAndCharacterOfPosition(src, n.getStart()).line + 1} bare JSX text not translated: "${txt.slice(0, 60)}"`);
    }
    // String/template literals rendered as JSX children (e.g. {`${n} min prep`}) outside a translation call
    if ((ts.isTemplateExpression(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isStringLiteral(n)) && inJsxChild(n) && !inPair(n)) {
      const txt = lit(n).replace(/\{\}/g, " ");
      if (/^[a-z_]+$/.test(txt.trim())) { ts.forEachChild(n, visit); return; } // status keys / identifiers
      if (/[a-z]{3}/i.test(txt) && (NL_WORDS.test(txt) || EN_WORDS.test(txt)) && !SAME_OK.has(txt.trim()))
        problems.push(`${path.relative(ROOT, file)}:${ts.getLineAndCharacterOfPosition(src, n.getStart()).line + 1} literal rendered without translation: "${txt.slice(0, 60)}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(src);
}
console.log(`i18n parity: ${files.length} files, ${pairs} NL/EN pairs, ${problems.length} problems`);
for (const p of problems) console.log("  ✗ " + p);
process.exit(problems.length ? 1 : 0);
