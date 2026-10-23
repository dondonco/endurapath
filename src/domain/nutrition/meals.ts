import type { DietaryPattern } from '../models/athlete'

/**
 * General-education meal ideas. Not a meal plan, not individualised advice, and never a prescription.
 * Suggestions are filtered by the athlete's stated dietary pattern and allergens (keyword match on tags).
 */
export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack'
export type LoadLevel = 'rest' | 'light' | 'moderate' | 'heavy'
type Allergen = 'gluten' | 'dairy' | 'egg' | 'fish' | 'nuts' | 'peanut' | 'soy' | 'shellfish' | 'sesame' | 'meat'

interface Meal {
  slot: MealSlot
  name: string
  note: string
  contains: Allergen[]
  /** Dietary patterns this meal is compatible with. Omnivore-compatible meals list 'omnivore'. */
  diets: DietaryPattern[]
  loads: LoadLevel[]
}

const ALL: LoadLevel[] = ['rest', 'light', 'moderate', 'heavy']
const ACTIVE: LoadLevel[] = ['moderate', 'heavy']
const ANY_DIET: DietaryPattern[] = ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher']

export const MEALS: Meal[] = [
  { slot: 'breakfast', name: 'Porridge oats with banana, berries and honey', note: 'Easy carbohydrate base; add milk or a plant drink if you like.', contains: ['gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ALL },
  { slot: 'breakfast', name: 'Rice porridge with fruit and a spoon of nut butter', note: 'A gluten-free carbohydrate option.', contains: ['nuts'], diets: [...ANY_DIET, 'gluten-free', 'dairy-free'], loads: ALL },
  { slot: 'breakfast', name: 'Scrambled eggs on toast with fruit', note: 'Protein plus carbohydrate; a steady start before a lighter session.', contains: ['egg', 'gluten'], diets: ['omnivore', 'vegetarian', 'pescatarian', 'halal', 'kosher', 'dairy-free'], loads: ['rest', 'light', 'moderate'] },
  { slot: 'breakfast', name: 'Greek yoghurt, granola and sliced fruit', note: 'Quick and easy to digest for most people.', contains: ['dairy', 'gluten', 'nuts'], diets: ['omnivore', 'vegetarian', 'pescatarian', 'halal', 'kosher'], loads: ALL },
  { slot: 'breakfast', name: 'Toast or bagel with jam and a banana', note: 'Low-fibre, familiar pre-session breakfast for early starts.', contains: ['gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ACTIVE },
  { slot: 'lunch', name: 'Chicken, rice and roasted vegetables', note: 'Balanced plate: protein, carbohydrate and colour.', contains: ['meat'], diets: ['omnivore', 'gluten-free', 'dairy-free', 'halal'], loads: ALL },
  { slot: 'lunch', name: 'Lentil and vegetable soup with bread', note: 'Fibre-rich and filling; keep it away from the hour before a hard session.', contains: ['gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ['rest', 'light'] },
  { slot: 'lunch', name: 'Tuna and bean salad with potatoes', note: 'Protein and carbohydrate in one bowl.', contains: ['fish'], diets: ['omnivore', 'pescatarian', 'gluten-free', 'dairy-free', 'kosher'], loads: ALL },
  { slot: 'lunch', name: 'Tofu and vegetable stir-fry with noodles', note: 'Plant protein with plenty of carbohydrate for training days.', contains: ['soy', 'gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ACTIVE },
  { slot: 'lunch', name: 'Quinoa bowl with chickpeas, avocado and roasted peppers', note: 'Naturally gluten- and dairy-free.', contains: [], diets: [...ANY_DIET, 'gluten-free', 'dairy-free'], loads: ALL },
  { slot: 'dinner', name: 'Salmon, new potatoes and green vegetables', note: 'Protein and omega-3 fats with carbohydrate for recovery.', contains: ['fish'], diets: ['omnivore', 'pescatarian', 'gluten-free', 'dairy-free', 'kosher'], loads: ALL },
  { slot: 'dinner', name: 'Pasta with tomato sauce, lean mince or lentils', note: 'A classic carbohydrate-forward meal for the evening before a long session.', contains: ['gluten', 'meat'], diets: ['omnivore', 'halal'], loads: ACTIVE },
  { slot: 'dinner', name: 'Chickpea and spinach curry with rice', note: 'Plant-based, carbohydrate-rich, and gluten- and dairy-free.', contains: [], diets: [...ANY_DIET, 'gluten-free', 'dairy-free'], loads: ALL },
  { slot: 'dinner', name: 'Turkey or bean chilli with baked sweet potato', note: 'Warm, filling recovery dinner.', contains: ['meat'], diets: ['omnivore', 'gluten-free', 'dairy-free', 'halal'], loads: ['rest', 'light', 'moderate'] },
  { slot: 'dinner', name: 'Vegetable and egg fried rice', note: 'Quick recovery meal; add edamame for extra protein.', contains: ['egg', 'soy'], diets: ['omnivore', 'vegetarian', 'pescatarian', 'gluten-free', 'dairy-free', 'halal', 'kosher'], loads: ALL },
  { slot: 'snack', name: 'Banana and a handful of pretzels', note: 'Light carbohydrate before or after a short session.', contains: ['gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ACTIVE },
  { slot: 'snack', name: 'Rice cakes with jam', note: 'Easy on the stomach; good for gluten-free athletes.', contains: [], diets: [...ANY_DIET, 'gluten-free', 'dairy-free'], loads: ACTIVE },
  { slot: 'snack', name: 'Chocolate milk or a soy alternative', note: 'Carbohydrate and protein after a session.', contains: ['dairy'], diets: ['omnivore', 'vegetarian', 'pescatarian', 'halal', 'kosher', 'gluten-free'], loads: ACTIVE },
  { slot: 'snack', name: 'Fruit smoothie with oats and soy yoghurt', note: 'Easy recovery option when appetite is low.', contains: ['soy', 'gluten'], diets: ['omnivore', 'vegetarian', 'vegan', 'pescatarian', 'dairy-free', 'halal', 'kosher'], loads: ALL },
  { slot: 'snack', name: 'Apple slices with nut butter', note: 'Everyday snack on lighter days.', contains: ['nuts', 'peanut'], diets: [...ANY_DIET, 'gluten-free', 'dairy-free'], loads: ['rest', 'light'] },
]

const KEYWORDS: Record<Allergen, string[]> = {
  gluten: ['gluten', 'wheat', 'coeliac', 'celiac', 'barley', 'rye'],
  dairy: ['dairy', 'milk', 'lactose', 'cheese', 'yoghurt', 'yogurt'],
  egg: ['egg'],
  fish: ['fish', 'salmon', 'tuna', 'cod'],
  nuts: ['nut', 'almond', 'cashew', 'walnut', 'hazelnut', 'pecan', 'pistachio'],
  peanut: ['peanut'],
  soy: ['soy', 'soya', 'tofu'],
  shellfish: ['shellfish', 'prawn', 'shrimp', 'crab', 'lobster'],
  sesame: ['sesame'],
  meat: [],
}

/** Which tracked allergens are named in the athlete's free-text allergy list (case-insensitive substring match). */
export function allergensFrom(allergies: string[]): Allergen[] {
  const text = allergies.join(' ').toLowerCase()
  return (Object.keys(KEYWORDS) as Allergen[]).filter((a) => KEYWORDS[a].some((k) => text.includes(k)))
}

export function loadLevelFor(minutes: number, hard: boolean): LoadLevel {
  if (minutes <= 0) return 'rest'
  if (minutes >= 120 || (hard && minutes >= 75)) return 'heavy'
  if (minutes >= 60) return 'moderate'
  return 'light'
}

export interface MealSuggestion {
  slot: MealSlot
  name: string
  note: string
}

/**
 * Up to `perSlot` suggestions per meal slot. Diet filters are strict: a meal is only shown when it is compatible
 * with EVERY selected dietary pattern. Allergen matches are excluded outright. The athlete must still check labels.
 */
export function mealSuggestions(opts: { dietary: DietaryPattern[]; allergies: string[]; load: LoadLevel; perSlot?: number }): MealSuggestion[] {
  const blocked = new Set(allergensFrom(opts.allergies))
  const perSlot = opts.perSlot ?? 2
  const diets = opts.dietary.filter((d) => d !== 'omnivore')
  const eligible = MEALS.filter((m) => !m.contains.some((c) => blocked.has(c)) && diets.every((d) => m.diets.includes(d)) && (diets.length > 0 || m.diets.includes('omnivore')))
  const out: MealSuggestion[] = []
  for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as MealSlot[]) {
    const inSlot = eligible.filter((m) => m.slot === slot)
    const fitting = [...inSlot.filter((m) => m.loads.includes(opts.load)), ...inSlot.filter((m) => !m.loads.includes(opts.load))]
    for (const m of fitting.slice(0, perSlot)) out.push({ slot, name: m.name, note: m.note })
  }
  return out
}

export const POST_WORKOUT_GUIDANCE: Record<LoadLevel, string[]> = {
  rest: ['No special recovery fueling is needed — normal balanced meals are enough.'],
  light: ['A normal meal within a few hours is usually enough.', 'Drink to thirst.'],
  moderate: ['Include carbohydrate and some protein at your next meal or snack, ideally within a couple of hours.', 'Drink to thirst; add a little salt with food if you sweated heavily.'],
  heavy: [
    'Prioritise carbohydrate plus protein soon after finishing, then a full meal.',
    'If you have another session within 8 hours, eat sooner and don’t skip carbohydrate.',
    'Rehydrate over the following hours, guided by thirst and the colour and amount of your urine rather than a fixed volume.',
  ],
}
