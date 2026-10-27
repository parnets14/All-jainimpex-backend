/**
 * Scheme coverage — "does this product fall inside a scheme that was applied?"
 *
 * WHY THIS EXISTS
 * Dealer extra discount (from Dealer Master) is a standing commercial term. When
 * a scheme is applied to a document, the scheme is already the concession on
 * those products — stacking the dealer's extra discount on top of it gives the
 * same dealer two benefits on the same units. The business rule is therefore:
 *
 *     a product covered by an APPLIED scheme gets no dealer-extra discount.
 *
 * Direct discount and level-based discounts are unaffected — only the
 * dealer-extra stage is suppressed.
 *
 * Scope matching is delegated to `lineMatchesScope` in the scheme engine so this
 * rule can never disagree with the engine about what a scheme covers.
 */
import { lineMatchesScope } from '../services/schemeEngine.js';

const toId = (value) => {
  if (!value) return '';
  if (typeof value === 'object' && value._id) return String(value._id);
  return String(value);
};

/**
 * Shape a product (or a populated line) into the identifiers `lineMatchesScope`
 * expects. Accepts a raw Product document, a canonicalised order line, or an
 * invoice line.
 */
export const schemeScopeLine = (productOrLine = {}) => ({
  productId: toId(productOrLine._id || productOrLine.product || productOrLine.productId),
  brandId: toId(productOrLine.brand || productOrLine.brandId),
  categoryId: toId(productOrLine.category || productOrLine.categoryId),
  subcategoryId: toId(productOrLine.subcategory || productOrLine.subcategoryId)
});

/**
 * Load the schemes a document opted into, returning their scopes.
 *
 * `appliedSchemes` is the opt-in gate:
 *   - absent / not an array  → no gate → return [] (nothing is "covered", so the
 *     dealer extra keeps applying exactly as it did before this rule existed)
 *   - array (even empty)     → gate on → only the listed schemes count
 */
export const loadAppliedSchemeScopes = async (SchemeModel, appliedSchemes) => {
  if (!Array.isArray(appliedSchemes)) return [];
  const ids = appliedSchemes
    .map((row) => row?.schemeId)
    .filter(Boolean);
  if (ids.length === 0 || !SchemeModel) return [];

  const docs = await SchemeModel.find({ _id: { $in: ids } })
    .select('scope code name')
    .lean();

  return docs.map((doc) => ({
    schemeId: String(doc._id),
    code: doc.code || '',
    name: doc.name || '',
    scope: doc.scope || { level: 'all' }
  }));
};

/**
 * True when the product falls inside the scope of at least one applied scheme.
 *
 * A scheme with scope level `all` covers every product, which is intentional:
 * if the salesman gave an "everything" scheme, dealer-extra is not stacked on it.
 */
export const isProductCoveredBySchemes = (productOrLine, schemeScopes = []) => {
  if (!Array.isArray(schemeScopes) || schemeScopes.length === 0) return false;
  const line = schemeScopeLine(productOrLine);
  return schemeScopes.some((scheme) => lineMatchesScope(line, scheme?.scope || {}));
};

/**
 * Convenience for controllers: the dealer-extra rate a line should actually get.
 * `configuredRate` is what Dealer Master says; it is zeroed when the product is
 * covered by an applied scheme.
 */
export const effectiveDealerExtraDiscount = ({ configuredRate, productOrLine, schemeScopes }) => (
  isProductCoveredBySchemes(productOrLine, schemeScopes) ? 0 : Number(configuredRate || 0)
);

export default {
  schemeScopeLine,
  loadAppliedSchemeScopes,
  isProductCoveredBySchemes,
  effectiveDealerExtraDiscount
};
