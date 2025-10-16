import Supplier from '../models/Supplier.js';

const generateSupplierCode = async (supplierName, companyName) => {
  if (!supplierName && !companyName) {
    throw new Error('Supplier name or company name is required to generate code');
  }

  // Use company name if available, otherwise use supplier name
  const nameToUse = companyName || supplierName;
  
  // Get first two letters of each word in the name
  const words = nameToUse.split(' ').filter(word => word.length > 0);
  let initials = '';
  
  if (words.length === 1) {
    initials = words[0].substring(0, 2).toUpperCase();
  } else {
    initials = words.map(word => word[0]).join('').toUpperCase();
    if (initials.length > 2) {
      initials = initials.substring(0, 2);
    }
  }
  
  // Find the next sequential number
  const existingCodes = await Supplier.find({
    code: new RegExp(`^${initials}\\d+$`)
  }).select('code');
  
  const existingCodeNumbers = existingCodes.map(s => {
    const match = s.code.match(new RegExp(`^${initials}(\\d+)$`));
    return match ? parseInt(match[1]) : 0;
  });
  
  let nextNum = 1;
  while (existingCodeNumbers.includes(nextNum)) {
    nextNum++;
  }
  
  return `${initials}${nextNum.toString().padStart(3, '0')}`;
};

export {
  generateSupplierCode
};