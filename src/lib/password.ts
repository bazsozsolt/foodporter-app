/**
 * Mirrors Supabase Auth's strongest password rule (min 8, lower, upper, digit, symbol).
 * Allowed symbols, from the Auth docs: !@#$%^&*()_+-=[]{};'\:"|<>?,./`~
 * A space, € or any other character does not count as that symbol.
 */
const SYMBOL = /[!@#$%^&*()_+\-=[\]{};':"\\|<>?,./`~]/;

export function passwordMeetsPolicy(pw: string): boolean {
  return pw.length >= 8 && /[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw) && SYMBOL.test(pw);
}
