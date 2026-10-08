/**
 * Scheme scope / payload sanitising — SERVER AUTHORITY.
 *
 * The scheme builder always posts the WHOLE scope object, including the
 * selectors the chosen level does not use. Those arrive as empty strings, and
 * mongoose cannot cast `""` to an ObjectId:
 *
 *   Scheme validation failed: scope.category: Cast to ObjectId failed for
 *   value "" (type string) at path "category" because of "BSONError"
 *
 * So creating a Brand-scoped scheme failed outright unless the admin ALSO filled
 * category and subcategory — fields the form never even shows for that level.
 *
 * Dropping the blanks is behaviour-preserving, not a workaround: matching only
 * ever consults the selector for the active level (`lineMatchesScope` switches
 * on `scope.level`), so a Brand scheme behaves identically whether `category`
 * is absent, `""`, or `null`. Nothing else in the engine or the reports reads a
 * selector that the level does not own.
 *
 * Blanks become `undefined` (key omitted), never `null`, so the path is
 * genuinely unset and `populate()` leaves it alone.
 *
 * Mirrored on the client by SchemeForm's payload build, which stops emitting the
 * blanks in the first place. The server copy is the one that must always hold:
 * it also protects the update path, and any other API caller.
 */

/** True for null, undefined, and whitespace-only strings. */
export const isBlankId = (value) =>
  value === null
  || value === undefined
  || (typeof value === 'string' && value.trim() === '');

/**
 * Blank -> undefined, everything else untouched.
 *
 * Deliberately NOT converting to a plain string or validating the hex shape:
 * a malformed-but-non-empty id should still reach mongoose and fail loudly with
 * a cast error, rather than being silently discarded.
 */
export const cleanId = (value) => (isBlankId(value) ? undefined : value);

/** Drop blanks from an ObjectId list (`scope.products`, `mixGroups[].products`). */
export const cleanIdList = (list) =>
  (Array.isArray(list) ? list.filter((id) => !isBlankId(id)) : []);

/**
 * Normalise one scope object.
 *
 * Unknown keys are preserved, so adding a future scope dimension does not
 * require touching this file.
 */
export const sanitizeScope = (scope) => {
  if (!scope || typeof scope !== 'object' || Array.isArray(scope)) return scope;

  const next = {
    ...scope,
    brand: cleanId(scope.brand),
    category: cleanId(scope.category),
    subcategory: cleanId(scope.subcategory)
  };

  if (scope.products !== undefined) next.products = cleanIdList(scope.products);

  if (Array.isArray(scope.mixGroups)) {
    next.mixGroups = scope.mixGroups
      // A mix group is defined by its selectors; an entry with nothing selected
      // and no products can never match anything, so it is dropped rather than
      // stored as a permanently-dead group.
      .filter((group) => group && typeof group === 'object')
      .map((group) => ({
        ...group,
        brand: cleanId(group.brand),
        category: cleanId(group.category),
        subcategory: cleanId(group.subcategory),
        products: cleanIdList(group.products)
      }))
      .filter((group) =>
        group.brand !== undefined
        || group.category !== undefined
        || group.subcategory !== undefined
        || group.products.length > 0);
  }

  return next;
};

/**
 * Normalise a slab ladder.
 *
 * Only `reward.freeItemProduct` needs attention: it is an optional ObjectId, so
 * a blank must become `null` (the schema default) rather than `undefined`, to
 * keep the stored shape identical to what the model produces on its own.
 */
export const sanitizeSlabs = (slabs) => {
  if (!Array.isArray(slabs)) return slabs;

  return slabs.map((slab) => {
    if (!slab || typeof slab !== 'object' || !slab.reward) return slab;
    return {
      ...slab,
      reward: {
        ...slab.reward,
        freeItemProduct: isBlankId(slab.reward.freeItemProduct)
          ? null
          : slab.reward.freeItemProduct
      }
    };
  });
};

/**
 * Normalise the per-product ladders.
 *
 * `product` is REQUIRED, so a blank is converted to `undefined` rather than the
 * group being dropped: `validateProductSlabs` then reports the friendly
 * "select a product" message. Silently discarding the ladder would hide a real
 * mistake from the admin.
 */
export const sanitizeProductSlabs = (groups) => {
  if (!Array.isArray(groups)) return groups;

  return groups.map((group) => {
    if (!group || typeof group !== 'object') return group;
    return {
      ...group,
      product: cleanId(group.product),
      slabs: sanitizeSlabs(group.slabs)
    };
  });
};

/**
 * Normalise a whole scheme request body.
 *
 * Only rewrites the keys that are present, so a PATCH-style partial update keeps
 * its "absent means leave alone" meaning.
 */
export const sanitizeSchemePayload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body || {};

  const next = { ...body };
  if (body.scope !== undefined) next.scope = sanitizeScope(body.scope);
  if (body.slabs !== undefined) next.slabs = sanitizeSlabs(body.slabs);
  if (body.productSlabs !== undefined) next.productSlabs = sanitizeProductSlabs(body.productSlabs);
  return next;
};

export default {
  isBlankId,
  cleanId,
  cleanIdList,
  sanitizeScope,
  sanitizeSlabs,
  sanitizeProductSlabs,
  sanitizeSchemePayload
};
