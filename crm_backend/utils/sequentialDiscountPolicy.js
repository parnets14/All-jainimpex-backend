const DEFAULT_TOLERANCE = 0.000001;

const round = (value, precision) => {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const parseNullableRate = (value, fieldName) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new RangeError(`${fieldName} must be a number between 0 and 100`);
  }
  return parsed;
};

export const normalizeRateMap = (value) => {
  if (!value) return Object.create(null);

  const entries = value instanceof Map
    ? [...value.entries()]
    : Array.isArray(value)
      ? value.map((entry) => Array.isArray(entry)
        ? entry
        : [entry?.levelName ?? entry?.key, entry?.ratePercentage ?? entry?.discountPercentage ?? entry?.value])
      : Object.entries(value);

  return entries.reduce((result, [key, rate]) => {
    if (key !== null && key !== undefined && key !== '') {
      result[String(key)] = Number(rate);
    }
    return result;
  }, Object.create(null));
};

const objectIdString = (value) => value?._id?.toString?.() || value?.toString?.() || '';

/**
 * Resolve an active dealer-extra entry against the authoritative Product hierarchy.
 * Specificity is product, deepest matching extended subcategory (subcategory5 to
 * subcategory1), subcategory, brand, then category. Duplicate entries for the same
 * target are resolved deterministically by highest configured rate, then stable id.
 */
export const resolveDealerExtraDiscountBySpecificity = (dealer, product) => {
  const hierarchyTargets = [
    { targetType: 'product', targetId: objectIdString(product?._id) },
    ...[
      product?.subcategory5,
      product?.subcategory4,
      product?.subcategory3,
      product?.subcategory2,
      product?.subcategory1
    ].map((value) => ({
      targetType: 'extendedSubcategory',
      targetId: objectIdString(value)
    })),
    { targetType: 'subcategory', targetId: objectIdString(product?.subcategory) },
    { targetType: 'brand', targetId: objectIdString(product?.brand) },
    { targetType: 'category', targetId: objectIdString(product?.category) }
  ].filter((target) => target.targetId);

  const activeEntries = (dealer?.extraDiscounts || []).filter((entry) => entry?.isActive !== false);
  for (const target of hierarchyTargets) {
    const matches = activeEntries
      .filter((entry) => (
        entry?.targetType === target.targetType
        && objectIdString(entry?.targetId) === target.targetId
      ))
      .sort((left, right) => {
        const rateDifference = Number(right?.discountPercentage || 0)
          - Number(left?.discountPercentage || 0);
        if (rateDifference !== 0) return rateDifference;
        return objectIdString(left?._id).localeCompare(objectIdString(right?._id));
      });
    if (matches.length > 0) return Number(matches[0]?.discountPercentage || 0);
  }

  return 0;
};

export const calculateSequentialStages = ({
  baseAmount = 100,
  stages = [],
  moneyPrecision = 2,
  percentagePrecision = 6
} = {}) => {
  const grossAmount = Number(baseAmount);
  if (!Number.isFinite(grossAmount) || grossAmount < 0) {
    throw new RangeError('baseAmount must be a non-negative number');
  }

  let currentAmount = grossAmount;
  const calculatedStages = stages.map((stage, index) => {
    const ratePercentage = parseNullableRate(
      stage?.ratePercentage ?? stage?.discountPercentage ?? 0,
      `stages[${index}].ratePercentage`
    ) ?? 0;
    const inputAmount = currentAmount;
    const discountAmount = inputAmount * ratePercentage / 100;
    currentAmount = inputAmount - discountAmount;

    return {
      ...stage,
      ratePercentage,
      inputAmount: round(inputAmount, moneyPrecision),
      discountAmount: round(discountAmount, moneyPrecision),
      outputAmount: round(currentAmount, moneyPrecision)
    };
  });

  const discountAmount = grossAmount - currentAmount;
  const effectiveDiscountPercentage = grossAmount > 0
    ? discountAmount / grossAmount * 100
    : 0;

  return {
    grossAmount: round(grossAmount, moneyPrecision),
    finalAmount: round(currentAmount, moneyPrecision),
    discountAmount: round(discountAmount, moneyPrecision),
    effectiveDiscountPercentage: round(effectiveDiscountPercentage, percentagePrecision),
    stages: calculatedStages
  };
};

export const calculateEffectiveDiscountPercentage = (rates = [], precision = 6) => {
  const stages = rates.map((ratePercentage, index) => ({
    key: `stage-${index + 1}`,
    ratePercentage
  }));
  return calculateSequentialStages({ baseAmount: 100, stages, percentagePrecision: precision })
    .effectiveDiscountPercentage;
};

export const calculateRequiredSequentialStageRatePercentage = ({
  currentEffectiveDiscountPercentage = 0,
  promisedEffectiveDiscountPercentage,
  tolerance = DEFAULT_TOLERANCE,
  precision = 6
} = {}) => {
  const current = parseNullableRate(currentEffectiveDiscountPercentage, 'currentEffectiveDiscountPercentage') ?? 0;
  const promised = parseNullableRate(promisedEffectiveDiscountPercentage, 'promisedEffectiveDiscountPercentage');
  if (promised === null || promised <= current + tolerance) return 0;
  if (current >= 100 - tolerance) return null;

  const requiredRate = 100 * (promised - current) / (100 - current);
  return requiredRate <= 100 + tolerance ? round(Math.min(requiredRate, 100), precision) : null;
};

export const validateDiscountPolicy = ({
  stages = [],
  promisedEffectiveDiscountPercentage = null,
  masterDiscountCap = null,
  combinedLevelDiscountCap = null,
  maxDiscountPercentage = null,
  allowedDiscountLevels = [],
  enforceLevelPermissions = false,
  bypassLevelPermission = false,
  tolerance = 0.01
} = {}) => {
  const normalizedMasterCap = parseNullableRate(masterDiscountCap, 'masterDiscountCap');
  const normalizedCombinedLevelCap = parseNullableRate(
    combinedLevelDiscountCap ?? maxDiscountPercentage,
    'combinedLevelDiscountCap'
  );
  const normalizedPromise = parseNullableRate(promisedEffectiveDiscountPercentage, 'promisedEffectiveDiscountPercentage');
  const allowedLevelSet = new Set((allowedDiscountLevels || []).map(String));
  const violations = [];

  const normalizedStages = stages.map((stage, index) => {
    const ratePercentage = parseNullableRate(
      stage?.ratePercentage ?? stage?.discountPercentage ?? 0,
      `stages[${index}].ratePercentage`
    ) ?? 0;
    return { ...stage, ratePercentage };
  });

  const levelStages = normalizedStages.filter((stage) => stage.kind === 'level');
  const levelDiscountTotalPercentage = round(
    levelStages.reduce((sum, stage) => sum + stage.ratePercentage, 0),
    6
  );
  const hasLevelDiscountStages = levelStages.some((stage) => stage.ratePercentage > 0);
  if (hasLevelDiscountStages && normalizedCombinedLevelCap === null) {
    violations.push({
      code: 'COMBINED_LEVEL_DISCOUNT_CAP_NOT_CONFIGURED',
      message: 'Combined selected-level discount cap is not configured for this line. Reprice after configuring the applicable sales mapping.'
    });
  } else if (normalizedCombinedLevelCap !== null
      && levelDiscountTotalPercentage > normalizedCombinedLevelCap + DEFAULT_TOLERANCE) {
    violations.push({
      code: 'COMBINED_LEVEL_DISCOUNT_CAP_EXCEEDED',
      message: `Selected level discounts total ${levelDiscountTotalPercentage}% and exceed the ${normalizedCombinedLevelCap}% combined level cap`,
      actualPercentage: levelDiscountTotalPercentage,
      maximumPercentage: normalizedCombinedLevelCap
    });
  }

  if (enforceLevelPermissions && !bypassLevelPermission) {
    const unauthorizedLevels = levelStages
      .filter((stage) => stage.ratePercentage > 0)
      .map((stage) => String(stage.levelName || stage.key || ''))
      .filter((levelName) => !allowedLevelSet.has(levelName));
    if (unauthorizedLevels.length > 0) {
      violations.push({
        code: 'DISCOUNT_LEVEL_NOT_ALLOWED',
        message: `Not allowed to use discount level(s): ${[...new Set(unauthorizedLevels)].join(', ')}`,
        levels: [...new Set(unauthorizedLevels)]
      });
    }
  }

  const hasDiscountStages = normalizedStages.some((stage) => stage.ratePercentage > 0);
  const calculation = calculateSequentialStages({ baseAmount: 100, stages: normalizedStages });
  if (hasDiscountStages && normalizedMasterCap === null) {
    violations.push({
      code: 'MASTER_DISCOUNT_CAP_NOT_CONFIGURED',
      message: 'Master discount cap is not configured for this discounted line. Reprice after configuring the applicable sales mapping.'
    });
  } else if (normalizedMasterCap !== null
      && calculation.effectiveDiscountPercentage > normalizedMasterCap + tolerance) {
    violations.push({
      code: 'MASTER_DISCOUNT_CAP_EXCEEDED',
      message: `Effective discount ${calculation.effectiveDiscountPercentage}% exceeds the ${normalizedMasterCap}% master cap`,
      actualPercentage: calculation.effectiveDiscountPercentage,
      maximumPercentage: normalizedMasterCap
    });
  }

  const requiredSequentialStageRatePercentage = calculateRequiredSequentialStageRatePercentage({
    currentEffectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
    promisedEffectiveDiscountPercentage: normalizedPromise
  });

  return {
    valid: violations.length === 0,
    violations,
    effectiveDiscountPercentage: calculation.effectiveDiscountPercentage,
    promisedEffectiveDiscountPercentage: normalizedPromise,
    requiredSequentialStageRatePercentage,
    masterDiscountCapApplied: normalizedMasterCap !== null,
    masterDiscountCap: normalizedMasterCap,
    combinedLevelDiscountCapApplied: normalizedCombinedLevelCap !== null,
    combinedLevelDiscountCap: normalizedCombinedLevelCap,
    levelDiscountTotalPercentage,
    stages: normalizedStages
  };
};

export const assertValidDiscountPolicy = (input) => {
  const validation = validateDiscountPolicy(input);
  if (!validation.valid) {
    const error = new Error(validation.violations.map((violation) => violation.message).join('; '));
    error.name = 'DiscountPolicyError';
    error.code = validation.violations[0]?.code || 'DISCOUNT_POLICY_INVALID';
    error.violations = validation.violations;
    throw error;
  }
  return validation;
};

export const calculateDiscountLine = ({
  baseAmount,
  stages = [],
  gstPercentage = 0,
  ...policy
} = {}) => {
  const validation = assertValidDiscountPolicy({ stages, ...policy });
  const calculation = calculateSequentialStages({ baseAmount, stages: validation.stages });
  const gstRate = Number(gstPercentage) || 0;
  const gstAmount = gstRate > 0
    ? round(calculation.finalAmount - calculation.finalAmount / (1 + gstRate / 100), 2)
    : 0;

  return {
    ...calculation,
    gstAmount,
    promisedEffectiveDiscountPercentage: validation.promisedEffectiveDiscountPercentage,
    requiredSequentialStageRatePercentage: validation.requiredSequentialStageRatePercentage,
    masterDiscountCapApplied: validation.masterDiscountCapApplied,
    combinedLevelDiscountCapApplied: validation.combinedLevelDiscountCapApplied,
    combinedLevelDiscountCap: validation.combinedLevelDiscountCap,
    levelDiscountTotalPercentage: validation.levelDiscountTotalPercentage,
    policyValidation: validation
  };
};

/**
 * Apply the exceptional, invoice-owned increase after every discount stage.
 * Discount metrics intentionally remain owned by calculateDiscountLine; this
 * helper changes only the actual charge and its embedded GST.
 */
export const calculateOneTimeInvoicePriceIncrease = ({
  priceBeforeIncrease,
  increasePercentage = 0,
  gstPercentage = 0,
  maximumFinalAmount = null
} = {}) => {
  const normalizedPrice = Number(priceBeforeIncrease);
  if (!Number.isFinite(normalizedPrice) || normalizedPrice < 0) {
    throw new RangeError('priceBeforeIncrease must be a non-negative number');
  }

  const normalizedPercentage = parseNullableRate(
    increasePercentage,
    'oneTimePriceIncreasePercentage'
  ) ?? 0;
  const roundedPriceBeforeIncrease = round(normalizedPrice, 2);
  const oneTimePriceIncreaseAmount = round(
    roundedPriceBeforeIncrease * normalizedPercentage / 100,
    2
  );
  const finalAmount = round(roundedPriceBeforeIncrease + oneTimePriceIncreaseAmount, 2);

  if (maximumFinalAmount !== null && maximumFinalAmount !== undefined && maximumFinalAmount !== '') {
    const normalizedMaximum = Number(maximumFinalAmount);
    if (!Number.isFinite(normalizedMaximum) || normalizedMaximum < 0) {
      throw new RangeError('maximumFinalAmount must be a non-negative number');
    }
    if (finalAmount > round(normalizedMaximum, 2) + 0.01) {
      throw new RangeError('One-time invoice price increase cannot make the line total exceed its MRP total');
    }
  }

  const gstRate = Number(gstPercentage) || 0;
  const gstAmount = gstRate > 0
    ? round(finalAmount - finalAmount / (1 + gstRate / 100), 2)
    : 0;

  return {
    priceBeforeIncrease: roundedPriceBeforeIncrease,
    oneTimePriceIncreasePercentage: normalizedPercentage,
    oneTimePriceIncreaseAmount,
    finalAmount,
    gstAmount
  };
};
