/**
 * Allergy display helpers enforcing clinical safety rules:
 * - 'not_recorded': Amber badge ("Allergies not recorded"). Never default to NKDA.
 * - 'nkda': Green badge ("NKDA" / "No Known Drug Allergies").
 * - 'has_allergies': Red badge / chips with recorded allergens. If no allergens listed, red "Allergies - details missing".
 */

export function parseAllergens(allergiesText) {
  if (!allergiesText || typeof allergiesText !== 'string') {
    return [];
  }
  return allergiesText
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.toUpperCase() !== 'NKDA' && s.toUpperCase() !== 'NONE');
}

export function getAllergyInfo(allergyStatus, allergiesText = '') {
  const normalizedStatus = (allergyStatus || '').toLowerCase().trim();

  if (normalizedStatus === 'nkda') {
    return {
      status: 'nkda',
      label: 'NKDA',
      fullLabel: 'No Known Drug Allergies (NKDA)',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      pillClass: 'bg-emerald-100 text-emerald-800',
      dotClass: 'bg-emerald-500',
      allergens: [],
      hasAllergens: false,
    };
  }

  if (normalizedStatus === 'has_allergies') {
    const allergens = parseAllergens(allergiesText);
    const hasDetails = allergens.length > 0;
    return {
      status: 'has_allergies',
      label: hasDetails ? 'Allergies' : 'Allergies - details missing',
      fullLabel: hasDetails ? `Allergies: ${allergens.join(', ')}` : 'Allergies - details missing',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
      pillClass: 'bg-rose-100 text-rose-800',
      dotClass: 'bg-rose-500',
      allergens,
      hasAllergens: true,
      missingDetails: !hasDetails,
    };
  }

  // Default to not_recorded for empty, unknown, or explicit 'not_recorded'
  return {
    status: 'not_recorded',
    label: 'Allergies not recorded',
    fullLabel: 'Allergies not recorded',
    badgeClass: 'bg-amber-50 text-amber-700 border-amber-200',
    pillClass: 'bg-amber-100 text-amber-800',
    dotClass: 'bg-amber-500',
    allergens: [],
    hasAllergens: false,
  };
}

