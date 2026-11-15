// Pure checks for the post-login redirect and the password rule. No network, no secrets.
import { passwordMeetsPolicy } from "../../src/lib/password.ts";
import { safeNext } from "../../src/lib/safeNext.ts";

const origin = "https://app.foodporter.nl";
let fail = 0;
const ok = (name, cond) => { if (!cond) { fail++; console.log("FAIL " + name); } else console.log("PASS " + name); };

const home = (n) => safeNext(n, origin) === "/";
for (const n of [
  null, "", "//evil.example", "https://evil.example/", "http://evil.example",
  "\\\\evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", "/\r/evil.example",
  "/%09/evil.example", "/%0A/evil.example", "/%5Cevil.example", "/%5c/evil.example",
  "javascript:alert(1)", "///evil.example", "/\\/evil.example",
]) ok("blocked " + JSON.stringify(n), home(n));

ok("relative /my-orders", safeNext("/my-orders", origin) === "/my-orders");
ok("query kept", safeNext("/group?code=ABC234", origin) === "/group?code=ABC234");
ok("hash kept", safeNext("/r/abc#menu", origin) === "/r/abc#menu");

const SYMBOLS = "!@#$%^&*()_+-=[]{};'\\:\"|<>?,./`~";
ok("every documented symbol counts", [...SYMBOLS].every((c) => passwordMeetsPolicy("Aa1aaaa" + c)));
ok("euro alone rejected", !passwordMeetsPolicy("Fpv35€testje9"));
ok("space alone rejected", !passwordMeetsPolicy("Test test1"));
ok("missing upper rejected", !passwordMeetsPolicy("testtest1!"));
ok("missing lower rejected", !passwordMeetsPolicy("TESTTEST1!"));
ok("missing digit rejected", !passwordMeetsPolicy("Testtesttest!"));
ok("missing symbol rejected", !passwordMeetsPolicy("Testtest12"));
ok("too short rejected", !passwordMeetsPolicy("Shrt1A!"));
ok("hyphen password accepted", passwordMeetsPolicy("Test-v29-pass1"));
ok("euro plus ascii symbol accepted", passwordMeetsPolicy("Fpv35€test9!"));

console.log(fail ? fail + " failed" : "all passed");
process.exit(fail ? 1 : 0);
