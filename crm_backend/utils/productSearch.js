// Keep generated regexes small enough for frequent, multi-field product searches.
const MAX_PRODUCT_SEARCH_LENGTH = 100;
const INTENT_SEPARATOR_PATTERN = /[\s\-\/._]+/g;
const OPTIONAL_SEPARATOR_PATTERN = String.raw`[\s\-\/._]*`;

const escapeRegexCharacter = (character) =>
  character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Builds a case-neutral regex source from literal user input.
 * Whitespace, hyphens, slashes, dots, and underscores are ignored in the
 * user's intent and accepted optionally between every remaining character.
 * Input is trimmed and capped at 100 characters before processing.
 *
 * @param {unknown} search
 * @returns {string|null}
 */
export const buildSeparatorInsensitivePattern = (search) => {
  if (search === null || search === undefined) return null;

  const normalizedSearch = String(search)
    .trim()
    .slice(0, MAX_PRODUCT_SEARCH_LENGTH)
    .replace(INTENT_SEPARATOR_PATTERN, "");

  if (!normalizedSearch) return null;

  return Array.from(normalizedSearch, escapeRegexCharacter)
    .join(OPTIONAL_SEPARATOR_PATTERN);
};

/**
 * Builds explicit MongoDB $or conditions for product identity fields.
 *
 * @param {unknown} search
 * @param {string[]} fields
 * @returns {object[]}
 */
export const buildProductSearchConditions = (search, fields) => {
  const pattern = buildSeparatorInsensitivePattern(search);
  if (!pattern || !Array.isArray(fields)) return [];

  return fields
    .filter((field) => typeof field === "string" && field.length > 0)
    .map((field) => ({
      [field]: { $regex: pattern, $options: "i" },
    }));
};
