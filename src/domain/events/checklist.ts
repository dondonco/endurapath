import type { ChecklistItem } from '../models/events'
import type { GoalType } from '../models/common'
import { RACE_DISTANCES } from '../training-engine/config'

type Cat = ChecklistItem['category']

const BASE: [Cat, string][] = [
  ['equipment', 'Bike serviced and race-ready (tyres, brakes, gears)'],
  ['equipment', 'Wetsuit / swimwear, goggles (plus a spare pair) and swim cap sorted'],
  ['equipment', 'Helmet, race shoes, socks and race kit tested in training'],
  ['equipment', 'Race number belt, sunglasses and sun protection packed'],
  ['nutrition', 'Practise the race-day breakfast at least twice in training'],
  ['nutrition', 'Rehearse bike and run fueling with the products available on course'],
  ['nutrition', 'Plan a post-race recovery meal and fluids'],
  ['travel', 'Confirm race start time, check-in and packet pick-up details from the official organiser'],
  ['travel', 'Plan travel and accommodation; arrive with time to rest before race day'],
  ['travel', 'Check the weather forecast and course map from official sources'],
  ['transition', 'Walk through the transition layout: bike rack, swim exit, run out'],
  ['transition', 'Lay out gear in the order you will use it; practise a full transition at home'],
]

const LONG: [Cat, string][] = [
  ['equipment', 'Spare tube / repair kit and bike tools; confirm special-needs bag rules'],
  ['nutrition', 'Complete at least two long sessions using the exact race-day fueling plan'],
  ['transition', 'Plan transition bags and what goes in each'],
]

/** Starter checklist. Items are suggestions only and not tied to any official race data. */
export function defaultChecklist(category: GoalType, mk: (p: string) => string): ChecklistItem[] {
  const items = [...BASE, ...(category === 'half-ironman' || category === 'ironman' ? LONG : [])]
  return items.map(([c, label]) => ({ id: mk('chk'), category: c, label, done: false }))
}

export function distancesFor(category: GoalType) {
  return RACE_DISTANCES[category]
}
