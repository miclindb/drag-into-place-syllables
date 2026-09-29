// Curious Reader launch parameters, read from the page's query string.

// Curious Learning catalog code; the language pack lives in `lang/<code>/`.
export const DEFAULT_LANG = "english";

// Catalog codes are lowercase with no spaces. Anything else falls back to the
// default so a malformed value can't point the loader outside `lang/`.
const LANG_CODE = /^[a-z0-9][a-z0-9_-]*$/;

export function readLaunchParams(search) {
  const params = new URLSearchParams(search);
  const lang = (params.get("cr_lang") || "").trim().toLowerCase();
  return {
    lang: LANG_CODE.test(lang) ? lang : DEFAULT_LANG,
    book: params.get("cr_book") || "",
    userId: params.get("cr_user_id") || "",
  };
}
