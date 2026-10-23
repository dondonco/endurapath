import type { PersonaId } from '@/domain/models/common'
import { messageNeedsEmergencyEscalation, EMERGENCY_RED_FLAGS, SELF_HARM_PATTERN } from '@/domain/safety/triage'
import type { AthleteContext } from '@/domain/safety/agent-context'
import { PERSONAS } from '@/domain/safety/personas'
import type { PersonaProvider, PersonaReply, PersonaRequest } from './provider'

const has = (t: string, ...words: (string | RegExp)[]) => words.some((w) => (typeof w === 'string' ? t.includes(w) : w.test(t)))

const EMERGENCY_REPLY = (persona: PersonaId): PersonaReply => ({
  text: `${persona === 'meridian' ? '' : 'I need to stop here — this is outside my role and it sounds like it could be urgent.\n\n'}If you have chest pain or pressure, fainting, severe breathlessness, a racing or irregular heartbeat that will not settle, sudden weakness or confusion, or any other symptom that frightens you: **stop training and call your local emergency number (for example 911, 999 or 112) now**, or go to the nearest emergency department. Do not drive yourself if you feel faint.\n\nI am a simulated assistant and cannot assess you.`,
  source: 'simulated',
  safetyLevel: 'emergency',
  actions: [{ label: 'Open symptom reporting', to: '/rehab' }],
})

const SELF_HARM_REPLY: PersonaReply = {
  text: 'I am really sorry you are feeling this way. I am a simulated assistant and cannot help in a crisis, but you deserve support right now. Please contact your local emergency number or a crisis line (for example 988 in the US, or your country’s equivalent), or reach out to someone you trust and stay with them. If you are in immediate danger, call emergency services.',
  source: 'simulated',
  safetyLevel: 'emergency',
}

function intro(p: PersonaId): string {
  return `*${PERSONAS[p].name} · simulated reply based on rules and your logged data — not a live AI model or a clinician.*\n\n`
}

function outOfScope(p: PersonaId, topic: 'nutrition' | 'medical' | 'training' | 'rehab'): PersonaReply {
  const route: Record<typeof topic, { who: string; to: string }> = {
    nutrition: { who: 'FuelWise', to: '/experts/fuelwise' },
    medical: { who: 'Dr. Meridian', to: '/experts/meridian' },
    training: { who: 'Coach Atlas', to: '/experts/atlas' },
    rehab: { who: 'MotionLab', to: '/experts/motionlab' },
  }
  const r = route[topic]
  return {
    text: `${intro(p)}That one sits outside my role, so I would rather not guess. **${r.who}** is the right persona for it.`,
    source: 'simulated',
    actions: [{ label: `Ask ${r.who}`, to: r.to }],
  }
}

function restrictionLine(c: AthleteContext | null): string {
  if (!c?.restrictions?.length) return ''
  return `\n\n**Active restriction${c.restrictions.length > 1 ? 's' : ''}:** ${c.restrictions.map((r) => `${r.title} (${r.effect})`).join('; ')}. These always take priority over performance goals.`
}

/* ------------------------------------------ Atlas ------------------------------------------ */
function atlas(t: string, c: AthleteContext | null): PersonaReply {
  if (has(t, 'eat', 'food', 'carb', 'gel', 'hydrat', 'nutrition', 'drink', 'meal')) return outOfScope('atlas', 'nutrition')
  if (has(t, 'pain', 'injur', 'hurt', 'symptom', 'doctor', 'diagnos', 'swelling', 'swollen', 'sprain', 'sore', 'physio')) return outOfScope('atlas', 'medical')

  const focus = c?.phase
  const wk = c?.workouts

  if (has(t, 'missed', 'skip', 'behind', 'catch up', 'make up')) {
    return {
      text: `${intro('atlas')}Missing a session is normal, and the plan is built for real life. Here is how I think about it:\n\n- **Do not stack missed work onto later days.** That is how overuse and fatigue creep in.\n- **Easy or supporting sessions:** simply let them go.\n- **Key sessions** (long ride/run, brick): I will look for a day with recovery on both sides, and ease it slightly.\n\n${wk ? `This week: ${wk.thisWeek.completedSessions}/${wk.thisWeek.plannedSessions} sessions done, ${wk.missedRecently} past session(s) still unresolved.` : ''}\n\nOpen the workout in your calendar and choose **Missed this?** — you will see exactly what the plan would change and why before anything is applied.`,
      source: 'simulated',
      actions: [{ label: 'Open training calendar', to: '/training' }],
    }
  }
  if (has(t, 'ready', 'progress', 'next stage', 'move up', 'advance', 'level up')) {
    return {
      text: `${intro('atlas')}Progression is earned from consistent preparation — not from counting weeks. Your readiness review looks at consistency, key sessions, comfortable capacity, recovery, symptoms, fueling practice, available time and race requirements. A positive score can **never** override an active clinical restriction.${restrictionLine(c)}\n\nOpen the roadmap for the full, itemised reasoning behind the recommendation.`,
      source: 'simulated',
      actions: [{ label: 'Open roadmap & readiness', to: '/roadmap' }],
    }
  }
  if (has(t, 'pace', 'pacing', 'race day', 'race-day', 'taper')) {
    return {
      text: `${intro('atlas')}Pacing principles that hold at every distance:\n\n1. **Start easier than feels necessary.** The first third should feel almost too comfortable.\n2. **Use effort, not just numbers** — RPE and the talk test are reliable even without a watch.\n3. **Rehearse it.** Race-pace blocks and brick sessions are where you practise restraint.\n4. **Taper means less volume, not zero work** — arrive fresh, not flat.\n\n${c?.race ? `Your next race, ${c.race.name}, is in ${c.race.daysToGo} days.` : 'Add a race under Events so I can plan around it.'}`,
      source: 'simulated',
    }
  }
  if (has(t, 'tired', 'fatigue', 'exhaust', 'recover', 'sleep')) {
    const r = c?.recovery
    return {
      text: `${intro('atlas')}Fatigue is information, not weakness.${r && r.avgFatigue !== null ? ` Your last ${r.checkIns7d} check-ins average fatigue ${r.avgFatigue}/5 and sleep ${r.avgSleep ?? '—'} h.` : ' Log a few check-ins so I can see the trend.'}\n\nWhen fatigue runs high: keep the sessions, cut the intensity, and protect sleep. If it persists for more than a week, or comes with unusual symptoms, that is a question for a clinician — not for a training plan.${restrictionLine(c)}`,
      source: 'simulated',
      actions: [{ label: 'Log a recovery check-in', to: '/recovery' }],
    }
  }
  const phaseLine = focus ? `You are in **Stage ${focus.stage}**${focus.phase ? `, **${focus.phase}** phase` : ''}${focus.week ? ` (week ${focus.week} of the stage)` : ''}${focus.recoveryWeek ? ' — a planned recovery week' : ''}.` : 'Complete onboarding so I can build your plan.'
  const todayLine = wk?.today ? `Today: **${wk.today.title}** (${wk.today.durationMin} min, ${wk.today.intensity}).` : wk?.next ? `Next session: **${wk.next.title}** on ${wk.next.date}.` : ''
  return {
    text: `${intro('atlas')}${phaseLine}\n\n${todayLine}\n\n**This week's focus:** consistency over heroics. Hit your key sessions, keep easy days genuinely easy, and treat recovery as part of the plan.${wk ? ` So far ${wk.thisWeek.completedSessions} of ${wk.thisWeek.plannedSessions} sessions are done.` : ''}${restrictionLine(c)}`,
    source: 'simulated',
    actions: [{ label: 'Open training calendar', to: '/training' }],
  }
}

/* ----------------------------------------- FuelWise ----------------------------------------- */
function fuelwise(t: string, c: AthleteContext | null): PersonaReply {
  if (has(t, 'pain', 'injur', 'symptom', 'diagnos', 'doctor', 'dizzy', 'faint')) return outOfScope('fuelwise', 'medical')
  if (has(t, 'workout', 'session plan', 'intervals', 'pace', 'zone')) return outOfScope('fuelwise', 'training')
  if (has(t, 'diet', 'lose weight', 'weight loss', 'cut calories', 'fast', 'detox', 'supplement')) {
    return {
      text: `${intro('fuelwise')}I keep this simple and kind: **I do not recommend restrictive diets, calorie cutting for performance, detoxes or unproven supplements.** Under-fueling hurts training, recovery and health.\n\nIf you have a body-composition or medical-nutrition goal, a registered sports dietitian can work with you individually — that is outside what this simulated assistant can safely do.`,
      source: 'simulated',
    }
  }
  const n = c?.nutrition
  const allergies = n?.allergies?.length ? `\n\n**Your recorded allergies:** ${n.allergies.join(', ')} — always check labels.` : ''
  const targetLine = n ? `Your current reference template is **${n.targets.carbsPerHour}** carbohydrate and **${n.targets.fluid}** (${n.targets.source === 'professional' ? `set by ${n.targets.setBy ?? 'a professional'}` : 'general educational template, not individualised'}).` : ''
  if (has(t, 'before', 'pre', 'breakfast', 'eat')) {
    return {
      text: `${intro('fuelwise')}Before training, aim for **familiar carbohydrate-based food**, in an amount that sits comfortably.\n\n- **2–3 h before:** a normal meal — rice, oats, bread or pasta with some protein.\n- **30–60 min before (if hungry):** a light snack like a banana or toast.\n- Keep fat and fibre lower right before long sessions if they upset your stomach.\n- **Nothing new on key sessions or race day.**${allergies}`,
      source: 'simulated',
      actions: [{ label: 'Open nutrition', to: '/nutrition' }],
    }
  }
  if (has(t, 'hydrat', 'drink', 'fluid', 'electrolyte', 'salt', 'sodium')) {
    return {
      text: `${intro('fuelwise')}Hydration is personal. **Drink to thirst and conditions** — do not force fluids beyond comfort; over-drinking can be harmful too.\n\n- Start sessions reasonably hydrated, and sip regularly on longer ones.\n- In heat or long sessions, include some sodium (drink mix or salty food).\n- Practise in training; your sweat rate and tolerance are individual.\n\n${targetLine}\n\nIf you have a medical condition affecting fluids or sodium, ask your clinician for individual targets.`,
      source: 'simulated',
    }
  }
  if (has(t, 'race', 'rehears', 'long', 'practise', 'practice', 'gel', 'carb', 'fuel')) {
    return {
      text: `${intro('fuelwise')}Race-day fueling is a **skill you practise**. A simple rehearsal approach:\n\n1. Pick 2–3 long sessions and use the exact products and timing you intend on race day.\n2. Start fueling in the first 20–30 minutes, small amounts often.\n3. Build intake gradually and log stomach tolerance.\n4. Adjust only one thing at a time.\n\n${targetLine}${n && n.recentToleranceAvg !== null ? `\n\nYour recent logged tolerance averages ${n.recentToleranceAvg}/5 across ${n.logs42d} log(s).` : ''}${allergies}`,
      source: 'simulated',
      actions: [{ label: 'Plan a fueling rehearsal', to: '/nutrition' }],
    }
  }
  if (has(t, 'recover', 'after', 'post')) {
    return {
      text: `${intro('fuelwise')}After harder or longer sessions: **carbohydrate + protein within an hour or two**, then a normal meal.\n\nIdeas: yoghurt and fruit, a sandwich with lean protein, rice bowl with eggs or tofu, chocolate milk, or a smoothie. Add fluids and some salt-containing food.${allergies}`,
      source: 'simulated',
    }
  }
  return {
    text: `${intro('fuelwise')}I can help with daily eating, pre/during/post-session fueling, hydration and race-day rehearsal.\n\nFor training days, a good default is **carbohydrate at most meals, protein spread across the day, plenty of colourful plants, and enough overall food** — under-eating is the most common mistake endurance athletes make.${allergies}`,
    source: 'simulated',
    actions: [{ label: 'Open nutrition', to: '/nutrition' }],
  }
}

/* ----------------------------------------- Meridian ----------------------------------------- */
function meridian(t: string, c: AthleteContext | null): PersonaReply {
  if (has(t, 'diet', 'carb', 'meal', 'gel', 'hydrat')) return outOfScope('meridian', 'nutrition')
  if (has(t, /clear(ed)? (me )?to (run|train|race|return)/, 'can i run', 'can i return', 'am i cleared', 'safe to run', 'safe to train', 'okay to train', 'ok to train')) {
    return {
      text: `${intro('meridian')}I cannot clear you to return to sport — only a qualified clinician who has assessed you can do that, and I am a simulated assistant, not a licensed physician.${restrictionLine(c)}\n\nWhat I can do: help you **prepare questions and a clear timeline** for your appointment, and keep your restrictions visible in your plan. Your next scheduled review${c?.rehab ? ` is ${c.rehab.nextReview}` : ' is not set — consider asking your clinician for one'}.`,
      source: 'simulated',
      safetyLevel: 'professional-assessment',
      actions: [{ label: 'Open rehab & restrictions', to: '/rehab' }],
    }
  }
  if (has(t, 'warning sign', 'red flag', 'when should i', 'serious', 'emergency')) {
    return {
      text: `${intro('meridian')}**Seek emergency care immediately for:**\n${EMERGENCY_RED_FLAGS.map((f) => `- ${f}`).join('\n')}\n\n**Get urgent assessment the same day** for numbness or loss of strength, inability to bear weight, visible deformity, calf pain with swelling/warmth/redness, fever with joint pain, or heat-illness signs.\n\nIf in doubt, err on the side of getting checked. I cannot assess you.`,
      source: 'simulated',
      safetyLevel: 'professional-assessment',
    }
  }
  if (has(t, 'appointment', 'prepare', 'summary', 'organi', 'visit')) {
    const s = c?.symptoms?.[0]
    return {
      text: `${intro('meridian')}To make an appointment as useful as possible, bring:\n\n1. **What and where** — body area, what it feels like.\n2. **When it started** and whether it is improving, the same or worsening.\n3. **What provokes or eases it** — during training, at rest, specific movements.\n4. **Training context** — recent volume, any change in shoes, bike fit or sessions.\n5. **What you have already tried.**\n6. **Questions** — e.g. what can I keep doing, what should I avoid, when is my next review?\n\n${s ? `From your log: *${s.area}* — ${s.level}, severity ${s.severity}/10, ${s.trend}${s.reviewed ? ', marked as reviewed by a clinician' : ''}.` : 'No symptom reports are logged yet.'}${restrictionLine(c)}`,
      source: 'simulated',
      actions: [{ label: 'Report a symptom', to: '/rehab' }],
    }
  }
  if (has(t, 'restriction', 'allowed', 'limit', 'cannot', "can't")) {
    return {
      text: `${intro('meridian')}${c?.restrictions?.length ? `Here is what is currently on record:${restrictionLine(c)}\n\nThese were entered ${c.restrictions.some((r) => r.source === 'clinician') ? 'with a clinician named (not verified by EnduraPath)' : 'by you'}. EnduraPath never removes a restriction on its own — only you can record that a clinician has lifted one, and that action is logged.` : 'No active restrictions are recorded. If a clinician gave you any, add them under Rehab so the plan can respect them.'}`,
      source: 'simulated',
      actions: [{ label: 'Open rehab & restrictions', to: '/rehab' }],
    }
  }
  if (has(t, 'pain', 'hurt', 'ache', 'injur', 'symptom', 'swollen', 'swelling', 'tight', 'sprain', 'strain', 'sore', 'dizzy', 'numb')) {
    return {
      text: `${intro('meridian')}I am sorry you are dealing with that. I can't tell you what it is — I can't diagnose — but I can help you handle it safely.\n\n1. **Use the symptom report in Rehab.** It asks about severity, timing, trend and red flags, and tells you how urgently to seek assessment.\n2. **Ease off anything that provokes it** until you've been assessed.\n3. **Seek urgent care** if there is numbness, loss of strength, inability to bear weight, deformity, chest pain, fainting or severe breathlessness.\n\nTrained clinicians — a sports physician or physiotherapist — are the right people for what comes next.${restrictionLine(c)}`,
      source: 'simulated',
      safetyLevel: 'professional-assessment',
      actions: [{ label: 'Report a symptom', to: '/rehab' }],
    }
  }
  return {
    text: `${intro('meridian')}I help with **symptom intake, warning-sign education, organising information for professional assessment, and keeping clinician restrictions visible**. I do not diagnose, treat, or clear anyone to train.${restrictionLine(c)}\n\nTell me what you are noticing, or ask about warning signs.`,
    source: 'simulated',
    actions: [{ label: 'Open rehab & restrictions', to: '/rehab' }],
  }
}

/* ---------------------------------------- MotionLab ---------------------------------------- */
function motionlab(t: string, c: AthleteContext | null): PersonaReply {
  if (has(t, 'eat', 'carb', 'meal', 'hydrat', 'gel')) return outOfScope('motionlab', 'nutrition')
  const r = c?.rehab
  if (has(t, 'diagnos', 'what is wrong', 'what do i have', 'new exercise', 'design a', 'create a program', 'create a plan', 'prescribe')) {
    return {
      text: `${intro('motionlab')}I can't diagnose what's going on or design a rehabilitation protocol for something that hasn't been assessed — that needs a clinician. What I *can* do is show and track the exercises a clinician has already approved${r ? ` (currently: **${r.title}**)` : ''}.\n\nIf you do not yet have a plan, **Dr. Meridian** can help you organise your information for an assessment.`,
      source: 'simulated',
      actions: [{ label: 'Ask Dr. Meridian', to: '/experts/meridian' }],
    }
  }
  if (has(t, 'pain', 'hurt', 'felt painful', 'worse', 'swelling', 'sharp')) {
    return {
      text: `${intro('motionlab')}Thanks for telling me. Please **stop the exercise that provoked it**, and log the symptom change in the rehab tracker so it is on record.\n\n${r ? `Your approved plan has stop rules for each exercise — for example "sharp pain or pain above 4/10 that does not settle within 24 h". If you hit one, contact the clinician who approved it (${r.approvedBy}).` : 'You do not have an approved plan on file, so please contact a clinician.'}\n\nIf there is numbness, loss of strength, inability to bear weight, or the pain is severe or worsening, seek urgent assessment.${restrictionLine(c)}`,
      source: 'simulated',
      safetyLevel: 'professional-assessment',
      actions: [{ label: 'Open rehab tracker', to: '/rehab' }],
    }
  }
  if (has(t, 'summary', 'summaris', 'progress', 'report', 'physio')) {
    return {
      text: `${intro('motionlab')}${r ? `Here is a functional progress summary you can share with your care team:\n\n- **Plan:** ${r.title} (approved by ${r.approvedBy}${r.sample ? ' — SAMPLE data' : ''})\n- **Exercises:** ${r.exercises}\n- **Rehab logs in the last 7 days:** ${r.sessions7d}\n- **Next review:** ${r.nextReview}\n\nOpen the rehab page for the per-exercise symptom trends (before / during / after).` : 'No active rehab plan is on file yet.'}`,
      source: 'simulated',
      actions: [{ label: 'Open rehab tracker', to: '/rehab' }],
    }
  }
  if (has(t, 'calf', 'raise', 'form', 'technique', 'how should', 'cue')) {
    return {
      text: `${intro('motionlab')}Movement quality, in general terms: **slow, controlled, full range you can own, no pushing through sharp pain.** For a calf raise — stand tall, equal weight through both feet, rise for about 3 seconds, pause, lower for about 3 seconds.\n\nFor the exact version your clinician approved (sets, holds, modifications), open your plan.${restrictionLine(c)}`,
      source: 'simulated',
      actions: [{ label: 'Open my rehab plan', to: '/rehab' }],
    }
  }
  return {
    text: `${intro('motionlab')}${r ? `Your active plan is **${r.title}** with ${r.exercises} exercises, next reviewed ${r.nextReview}. Open it to log sets and how symptoms felt before, during and after.` : 'You do not have an approved rehab plan on file. This prototype can only display the labelled sample plan — a production version would import the plan your clinician approved. I will only ever display and track what they approved.'}${restrictionLine(c)}`,
    source: 'simulated',
    actions: [{ label: 'Open rehab tracker', to: '/rehab' }],
  }
}

export class SimulatedPersonaProvider implements PersonaProvider {
  readonly id = 'simulated'
  readonly label = 'Simulated responses (rule-based)'
  readonly isLive = false

  async reply(req: PersonaRequest): Promise<PersonaReply> {
    const text = req.message.toLowerCase()
    if (SELF_HARM_PATTERN.test(req.message)) return SELF_HARM_REPLY
    if (messageNeedsEmergencyEscalation(req.message)) return EMERGENCY_REPLY(req.personaId)
    switch (req.personaId) {
      case 'atlas':
        return atlas(text, req.context)
      case 'fuelwise':
        return fuelwise(text, req.context)
      case 'meridian':
        return meridian(text, req.context)
      case 'motionlab':
        return motionlab(text, req.context)
    }
  }
}

export const simulatedProvider = new SimulatedPersonaProvider()
