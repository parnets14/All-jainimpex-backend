import Points from '../models/Points.js';

class SchemeService {
  /**
   * Check and apply purchase schemes for GRN
   * @param {Object} grnData - GRN data containing supplier, items, amounts
   * @returns {Promise<Object>} - Applied schemes and benefits
   */
  async checkAndApplyPurchaseSchemesForGRN(grnData) {
    try {
      console.log('Checking purchase schemes for GRN:', grnData);
      
      // Get all active purchase schemes with GRN auto-apply enabled
      const schemes = await Points.find({
        type: 'purchase',
        status: 'active',
        autoApplyGRN: true,
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      }).populate('category subcategory brand');

      if (!schemes || schemes.length === 0) {
        return { appliedSchemes: [], totalBenefits: 0 };
      }

      const appliedSchemes = [];
      let totalBenefits = 0;

      // Check each scheme against GRN data
      for (const scheme of schemes) {
        const benefit = this.calculateSchemeBenefitForGRN(scheme, grnData);
        if (benefit && benefit.amount > 0) {
          appliedSchemes.push({
            schemeId: scheme._id,
            schemeName: scheme.description,
            benefitType: scheme.benefitType,
            benefitAmount: benefit.amount,
            benefitDescription: benefit.description,
            autoApplied: true,
            appliedAt: new Date().toISOString()
          });
          totalBenefits += benefit.amount;
        }
      }

      console.log('Applied purchase schemes for GRN:', appliedSchemes);
      return { appliedSchemes, totalBenefits };
    } catch (error) {
      console.error('Error checking purchase schemes for GRN:', error);
      return { appliedSchemes: [], totalBenefits: 0 };
    }
  }

  /**
   * Check and apply purchase schemes for supplier invoice
   * @param {Object} invoiceData - Invoice data containing supplier, items, amounts
   * @returns {Promise<Object>} - Applied schemes and benefits
   */
  async checkAndApplyPurchaseSchemes(invoiceData) {
    try {
      console.log('Checking purchase schemes for invoice:', invoiceData);
      
      // Get all active purchase schemes with supplier invoice auto-apply enabled
      const schemes = await Points.find({
        type: 'purchase',
        status: 'active',
        autoApplySupplierInvoice: true,
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      }).populate('category subcategory brand');

      if (!schemes || schemes.length === 0) {
        return { appliedSchemes: [], totalBenefits: 0 };
      }

      const appliedSchemes = [];
      let totalBenefits = 0;

      // Check each scheme against invoice data
      for (const scheme of schemes) {
        const benefit = this.calculateSchemeBenefit(scheme, invoiceData);
        if (benefit && benefit.amount > 0) {
          appliedSchemes.push({
            schemeId: scheme._id,
            schemeName: scheme.description,
            benefitType: scheme.benefitType,
            benefitAmount: benefit.amount,
            benefitDescription: benefit.description,
            autoApplied: true,
            appliedAt: new Date().toISOString()
          });
          totalBenefits += benefit.amount;
        }
      }

      console.log('Applied purchase schemes:', appliedSchemes);
      return { appliedSchemes, totalBenefits };
    } catch (error) {
      console.error('Error checking purchase schemes:', error);
      return { appliedSchemes: [], totalBenefits: 0 };
    }
  }

  /**
   * Check and apply sale schemes for dealer invoice
   * @param {Object} invoiceData - Invoice data containing dealer, items, amounts
   * @returns {Promise<Object>} - Applied schemes and benefits
   */
  async checkAndApplySaleSchemes(invoiceData) {
    try {
      console.log('Checking sale schemes for dealer invoice:', invoiceData);
      
      // Get all active sale schemes
      const schemes = await Points.find({
        type: 'sale',
        status: 'active',
        validFrom: { $lte: new Date() },
        validTo: { $gte: new Date() }
      }).populate('category subcategory brand');

      if (!schemes || schemes.length === 0) {
        return { appliedSchemes: [], totalBenefits: 0 };
      }

      const appliedSchemes = [];
      let totalBenefits = 0;

      // Check each scheme against invoice data
      for (const scheme of schemes) {
        const benefit = this.calculateSaleSchemeBenefit(scheme, invoiceData);
        if (benefit && benefit.amount > 0) {
          appliedSchemes.push({
            schemeId: scheme._id,
            schemeName: scheme.description,
            benefitType: 'points',
            benefitAmount: benefit.amount,
            benefitDescription: benefit.description,
            autoApplied: true,
            appliedAt: new Date().toISOString()
          });
          totalBenefits += benefit.amount;
        }
      }

      console.log('Applied sale schemes:', appliedSchemes);
      return { appliedSchemes, totalBenefits };
    } catch (error) {
      console.error('Error checking sale schemes:', error);
      return { appliedSchemes: [], totalBenefits: 0 };
    }
  }

  /**
   * Calculate scheme benefit for GRN
   * @param {Object} scheme - Scheme configuration
   * @param {Object} grnData - GRN data
   * @returns {Object|null} - Benefit details or null if not applicable
   */
  calculateSchemeBenefitForGRN(scheme, grnData) {
    try {
      // Check if supplier matches (if scheme has supplier filter)
      if (scheme.supplier && scheme.supplier !== grnData.supplierId) {
        return null;
      }

      // Check if items match scheme criteria
      const matchingItems = this.getMatchingItemsForGRN(scheme, grnData.items);
      if (matchingItems.length === 0) {
        return null;
      }

      // Calculate benefit based on calculation type
      if (scheme.calculationType === 'amount') {
        return this.calculateValueBasedBenefitForGRN(scheme, matchingItems, grnData);
      } else if (scheme.calculationType === 'units') {
        return this.calculateQuantityBasedBenefitForGRN(scheme, matchingItems, grnData);
      }

      return null;
    } catch (error) {
      console.error('Error calculating scheme benefit for GRN:', error);
      return null;
    }
  }

  /**
   * Calculate scheme benefit for purchase schemes (invoice)
   * @param {Object} scheme - Scheme configuration
   * @param {Object} invoiceData - Invoice data
   * @returns {Object|null} - Benefit details or null if not applicable
   */
  calculateSchemeBenefit(scheme, invoiceData) {
    try {
      // Check if supplier matches (if scheme has supplier filter)
      if (scheme.supplier && scheme.supplier !== invoiceData.supplierId) {
        return null;
      }

      // Check if items match scheme criteria
      const matchingItems = this.getMatchingItems(scheme, invoiceData.items);
      if (matchingItems.length === 0) {
        return null;
      }

      // Calculate benefit based on calculation type
      if (scheme.calculationType === 'amount') {
        return this.calculateValueBasedBenefit(scheme, matchingItems, invoiceData);
      } else if (scheme.calculationType === 'units') {
        return this.calculateQuantityBasedBenefit(scheme, matchingItems, invoiceData);
      }

      return null;
    } catch (error) {
      console.error('Error calculating scheme benefit:', error);
      return null;
    }
  }

  /**
   * Calculate sale scheme benefit
   * @param {Object} scheme - Scheme configuration
   * @param {Object} invoiceData - Invoice data
   * @returns {Object|null} - Benefit details or null if not applicable
   */
  calculateSaleSchemeBenefit(scheme, invoiceData) {
    try {
      // Check if dealer matches (if scheme has dealer filter)
      if (scheme.dealer && scheme.dealer !== invoiceData.dealerId) {
        return null;
      }

      // Check if items match scheme criteria
      const matchingItems = this.getMatchingItems(scheme, invoiceData.items);
      if (matchingItems.length === 0) {
        return null;
      }

      // Calculate points based on scheme type
      if (scheme.calculationType === 'invoice_value') {
        return this.calculateInvoiceValuePoints(scheme, matchingItems, invoiceData);
      } else if (scheme.calculationType === 'units') {
        return this.calculateUnitsPoints(scheme, matchingItems, invoiceData);
      }

      return null;
    } catch (error) {
      console.error('Error calculating sale scheme benefit:', error);
      return null;
    }
  }

  /**
   * Get items that match scheme criteria
   * @param {Object} scheme - Scheme configuration
   * @param {Array} items - Items to check
   * @returns {Array} - Matching items
   */
  getMatchingItems(scheme, items) {
    return items.filter(item => {
      // Check category match
      if (scheme.category && item.category !== scheme.category._id?.toString()) {
        return false;
      }
      
      // Check subcategory match
      if (scheme.subcategory && item.subcategory !== scheme.subcategory._id?.toString()) {
        return false;
      }
      
      // Check brand match
      if (scheme.brand && item.brand !== scheme.brand._id?.toString()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Get items that match scheme criteria for GRN
   * @param {Object} scheme - Scheme configuration
   * @param {Array} items - GRN items to check
   * @returns {Array} - Matching items
   */
  getMatchingItemsForGRN(scheme, items) {
    return items.filter(item => {
      // Check category match
      if (scheme.category && item.category !== scheme.category._id?.toString()) {
        return false;
      }
      
      // Check subcategory match
      if (scheme.subcategory && item.subcategory !== scheme.subcategory._id?.toString()) {
        return false;
      }
      
      // Check brand match
      if (scheme.brand && item.brand !== scheme.brand._id?.toString()) {
        return false;
      }

      return true;
    });
  }

  /**
   * Calculate value-based benefit for GRN
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} grnData - GRN data
   * @returns {Object} - Benefit details
   */
  calculateValueBasedBenefitForGRN(scheme, matchingItems, grnData) {
    const totalValue = matchingItems.reduce((sum, item) => {
      return sum + (item.acceptedQuantity * item.unitPrice);
    }, 0);

    if (totalValue >= scheme.inputValue) {
      let benefitAmount = 0;
      let description = '';

      if (scheme.benefitType === 'points') {
        benefitAmount = scheme.points || 0;
        description = `${scheme.points || 0} points earned on ₹${totalValue.toLocaleString()}`;
      } else if (scheme.benefitType === 'extraQuantity') {
        const totalQuantity = matchingItems.reduce((sum, item) => sum + item.acceptedQuantity, 0);
        benefitAmount = scheme.extraQuantity || 0;
        description = `${scheme.extraQuantity || 0} extra units earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'discount') {
        benefitAmount = Math.floor(totalValue * ((scheme.discountPercentage || 0) / 100));
        description = `${scheme.discountPercentage || 0}% discount (₹${benefitAmount.toLocaleString()}) on ₹${totalValue.toLocaleString()}`;
      } else if (scheme.benefitType === 'cashback') {
        benefitAmount = scheme.cashbackAmount || 0;
        description = `₹${(scheme.cashbackAmount || 0).toLocaleString()} cashback on ₹${totalValue.toLocaleString()}`;
      }

      return {
        amount: benefitAmount,
        description: description,
        type: scheme.benefitType || 'points'
      };
    }

    return null;
  }

  /**
   * Calculate quantity-based benefit for GRN
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} grnData - GRN data
   * @returns {Object} - Benefit details
   */
  calculateQuantityBasedBenefitForGRN(scheme, matchingItems, grnData) {
    const totalQuantity = matchingItems.reduce((sum, item) => sum + item.acceptedQuantity, 0);

    if (totalQuantity >= scheme.inputValue) {
      let benefitAmount = 0;
      let description = '';

      if (scheme.benefitType === 'extraQuantity') {
        benefitAmount = scheme.extraQuantity || 0;
        description = `${scheme.extraQuantity || 0} extra units earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'points') {
        benefitAmount = scheme.points || 0;
        description = `${scheme.points || 0} points earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'discount') {
        const totalValue = matchingItems.reduce((sum, item) => sum + (item.acceptedQuantity * item.unitPrice), 0);
        benefitAmount = Math.floor(totalValue * ((scheme.discountPercentage || 0) / 100));
        description = `${scheme.discountPercentage || 0}% discount (₹${benefitAmount.toLocaleString()}) on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'cashback') {
        benefitAmount = scheme.cashbackAmount || 0;
        description = `₹${(scheme.cashbackAmount || 0).toLocaleString()} cashback on ${totalQuantity} units`;
      }

      return {
        amount: benefitAmount,
        description: description,
        type: scheme.benefitType || 'points'
      };
    }

    return null;
  }

  /**
   * Calculate value-based benefit for purchase schemes
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} invoiceData - Invoice data
   * @returns {Object} - Benefit details
   */
  calculateValueBasedBenefit(scheme, matchingItems, invoiceData) {
    const totalValue = matchingItems.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    if (totalValue >= scheme.inputValue) {
      let benefitAmount = 0;
      let description = '';

      if (scheme.benefitType === 'points') {
        benefitAmount = scheme.points || 0;
        description = `${scheme.points || 0} points earned on ₹${totalValue.toLocaleString()}`;
      } else if (scheme.benefitType === 'extraQuantity') {
        const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0);
        benefitAmount = scheme.extraQuantity || 0;
        description = `${scheme.extraQuantity || 0} extra units earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'discount') {
        benefitAmount = Math.floor(totalValue * ((scheme.discountPercentage || 0) / 100));
        description = `${scheme.discountPercentage || 0}% discount (₹${benefitAmount.toLocaleString()}) on ₹${totalValue.toLocaleString()}`;
      } else if (scheme.benefitType === 'cashback') {
        benefitAmount = scheme.cashbackAmount || 0;
        description = `₹${(scheme.cashbackAmount || 0).toLocaleString()} cashback on ₹${totalValue.toLocaleString()}`;
      }

      return {
        amount: benefitAmount,
        description: description,
        type: scheme.benefitType || 'points'
      };
    }

    return null;
  }

  /**
   * Calculate quantity-based benefit for purchase schemes
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} invoiceData - Invoice data
   * @returns {Object} - Benefit details
   */
  calculateQuantityBasedBenefit(scheme, matchingItems, invoiceData) {
    const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0);

    if (totalQuantity >= scheme.inputValue) {
      let benefitAmount = 0;
      let description = '';

      if (scheme.benefitType === 'extraQuantity') {
        benefitAmount = scheme.extraQuantity || 0;
        description = `${scheme.extraQuantity || 0} extra units earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'points') {
        benefitAmount = scheme.points || 0;
        description = `${scheme.points || 0} points earned on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'discount') {
        const totalValue = matchingItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        benefitAmount = Math.floor(totalValue * ((scheme.discountPercentage || 0) / 100));
        description = `${scheme.discountPercentage || 0}% discount (₹${benefitAmount.toLocaleString()}) on ${totalQuantity} units`;
      } else if (scheme.benefitType === 'cashback') {
        benefitAmount = scheme.cashbackAmount || 0;
        description = `₹${(scheme.cashbackAmount || 0).toLocaleString()} cashback on ${totalQuantity} units`;
      }

      return {
        amount: benefitAmount,
        description: description,
        type: scheme.benefitType || 'points'
      };
    }

    return null;
  }

  /**
   * Calculate invoice value points for sale schemes
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} invoiceData - Invoice data
   * @returns {Object} - Benefit details
   */
  calculateInvoiceValuePoints(scheme, matchingItems, invoiceData) {
    const totalValue = matchingItems.reduce((sum, item) => {
      return sum + (item.quantity * item.unitPrice);
    }, 0);

    if (totalValue >= scheme.thresholdValue) {
      const points = Math.floor(totalValue * (scheme.benefitValue / 100));
      return {
        amount: points,
        description: `${scheme.benefitValue}% points on ₹${totalValue.toLocaleString()}`,
        type: 'points'
      };
    }

    return null;
  }

  /**
   * Calculate units points for sale schemes
   * @param {Object} scheme - Scheme configuration
   * @param {Array} matchingItems - Items that match scheme criteria
   * @param {Object} invoiceData - Invoice data
   * @returns {Object} - Benefit details
   */
  calculateUnitsPoints(scheme, matchingItems, invoiceData) {
    const totalQuantity = matchingItems.reduce((sum, item) => sum + item.quantity, 0);

    if (totalQuantity >= scheme.thresholdValue) {
      const points = totalQuantity * scheme.benefitValue;
      return {
        amount: points,
        description: `${scheme.benefitValue} points per unit on ${totalQuantity} units`,
        type: 'points'
      };
    }

    return null;
  }

  /**
   * Log scheme application for audit trail
   * @param {Object} applicationData - Application details
   * @returns {Promise<boolean>} - Success status
   */
  async logSchemeApplication(applicationData) {
    try {
      // This would typically save to a scheme applications log table
      console.log('Logging scheme application:', applicationData);
      return true;
    } catch (error) {
      console.error('Error logging scheme application:', error);
      return false;
    }
  }
}

export default new SchemeService();
