# EnduraPath — Every distance. One journey.

A working prototype of an adaptive triathlon coaching platform. It guides an athlete from a first beginner triathlon through sprint and Olympic distances, IRONMAN 70.3, and toward full-distance IRONMAN, coordinating four **simulated** specialist personas:

| Persona | Role |
| --- | --- |
| Coach Atlas | Head triathlon coach: periodization, weekly plans, progression |
| FuelWise | Sports nutritionist: fueling, hydration, recovery nutrition |
| Dr. Meridian | Sports-medicine assistant: symptom intake, escalation, restriction visibility |
| MotionLab | Sports physical therapy assistant: clinician-approved exercise tracking |

> **Honest status.** This is a front-end prototype with seeded sample data. There is **no backend, no cloud sync, no live AI model, no wearable or race-registration integration, and no clinician involvement**. Persona replies are rule-based and are labelled "Simulated" in the UI. Nothing here is medical advice, medical clearance, or a guarantee of race readiness.

## Run it

Requires Node.js 20.19+ (developed on Node 24).

```bash
npm install
npm run dev          # http://127.0.0.1:5173  (bound to localhost only)
npm run build        # typecheck + production build into dist/
npm run preview      # serve the production build on 127.0.0.1
npm run typecheck
npm test             # unit + UI tests (Vitest, jsdom, React Testing Library)
```

The first launch loads a clearly labelled **sample athlete**. Go to **Onboarding** (or "Build my own plan") to replace it with your own plan. **Settings** lets you reload the sample, export your data as JSON, and delete medical records or everything (each with a confirmation step).

## Stack

React 19 + TypeScript, Vite, Tailwind CSS v4, Radix primitives, Lucide, Recharts, React Router, React Hook Form + Zod, date-fns, Vitest + Testing Library.

## Architecture

Business rules are pure, testable TypeScript under `src/domain/` with no React imports. The UI calls domain operations through one store; the store persists through a repository port.

```
src/
  app/            router (lazy routes), providers, store, toasts
  components/     layout (sidebar, mobile nav), shared UI, forms, charts, calendar
  features/       one folder per screen: dashboard, onboarding, roadmap, training,
                  performance, nutrition, recovery, rehab, experts, events, settings
  domain/
    models/       entity interfaces (AthleteProfile, Workout, WorkoutResult, PlanChange, …)
    validation/   Zod schemas (onboarding steps, results, check-ins, symptoms, restrictions)
    training-engine/  config, pathway, generator, week-scheduler, scheduling, workout library, fueling
    readiness/    explainable readiness review
    safety/       restrictions, symptom triage, persona definitions, permission-scoped agent context
    analytics/    selectors and dashboard metrics derived from state
    operations/   app-ops: pure (state, input) -> state functions for every user action
    events/ nutrition/ onboarding/
  services/
    repositories/ AppRepository port + localStorage and in-memory adapters
    ai/           PersonaProvider port + simulated provider
    integrations/ (empty by design; see its README)
  data/demo/      seeded sample athlete
  test/           fixtures, jsdom shims, render helper
```

### Key design decisions

- **Planned work and results are separate.** `Workout` (the plan) and `WorkoutResult` (what happened) are different records. Rescheduling, skipping or regenerating future sessions never edits a completed workout or its result.
- **Every plan change is logged** as a `PlanChange` with a reason and initiator, and is shown in the change history.
- **Clinical restrictions outrank goals.** Active restrictions are applied inside the generator and the scheduling checks (blocked sports, intensity and duration caps, training pauses). A restriction is never removed automatically; recording one as lifted needs a named clinician and a note, is stored as unverified, and is logged.
- **Readiness is explainable, not a verdict.** Each factor has a label, weight and detail; progression requires every gate to pass *and* a score threshold. Elapsed time alone never advances an athlete, and any active restriction or recent urgent symptom forces "clinical review required".
- **Medical data is separate.** Restrictions, symptoms and rehab live in `state.medical`, are stored under their own storage key, and are exposed to personas only through `PERSONA_SCOPES` (only the two clinical personas see symptoms and rehab).
- **Hydration is never exact.** Guidance is "drink to thirst" with educational ranges; the app never encourages forcing fluids.

### Configurability

All planning defaults live in `DEFAULT_ENGINE_CONFIG` (`src/domain/training-engine/config.ts`): preparation ranges per stage (Foundation 8–16+ weeks, Sprint/Olympic 12–24+, 70.3 16–24+, full distance 24–36+ — illustrative, not prescriptions), entry requirements per stage, recovery-week frequency and factor, ramp ceilings, taper lengths, phase split, session-length limits, and the readiness weights, thresholds, look-back windows and gates. `generatePlan` and the readiness functions accept a config override.

## Implemented features

- **Onboarding** (6 steps): profile, baseline (no lab data, power meter or GPS required), goal, availability, preferences and recovery, plan preview with stage, roadmap, estimated range, weekly structure, assumptions and baseline assessments. Validation per step; going back keeps entered data; the plan can be reviewed and edited before activation.
- **Deterministic plan generator** across Stages A–D with Base, Build, Race-specific, Taper and Recovery phases; swim, bike, run, brick, strength, mobility, recovery and clinician-approved rehab sessions; respects available days, weekly-hours ceiling, rest day, unavailable dates, equipment access, and A/B/C races. Later goals are allowed, but prerequisite milestones are identified and the athlete may start in an earlier stage.
- **Dashboard** with welcome and coaching message, next milestone, today's workout (complete in place), weekly planned vs completed, analytics, recovery check-in, team updates and alerts — all derived from state.
- **Training calendar** (week/month), workout detail (warm-up, main set, cool-down, purpose, coaching notes, fueling, targets), result logging, edit schedule, swap, skip, replace with recovery, adjustment preview with rationale and progression impact, change history.
- **Roadmap and readiness reviews** with outcomes: progression recommended / continue stage / reduce workload and reassess / clinical review required.
- **Performance** charts (Recharts): weekly duration, planned vs completed, sport distribution, long-session progression, recovery trend, consistency, milestones, race history, each with period and limitation notes.
- **Nutrition**: meal suggestions filtered by diet and allergies, per-session fueling, hydration guidance, recovery guidance, race-day rehearsal planner, fueling log with tolerance and adherence; general education is labelled separately from professional targets.
- **Recovery**: daily check-ins (sleep, quality, fatigue, soreness, mood, readiness, optional resting HR) with plain-language trends.
- **Rehab**: symptom report with rule-based triage (emergency / urgent / assessment / monitor) and emergency guidance, restrictions (preview impact before applying), clinician-approved programme tracking (sets, reps, symptom response), referral status and return-to-training review milestones.
- **Experts**: four profiles and chat, each with boundaries, a "Simulated" label on every reply, hand-offs to the right persona, and emergency language handling.
- **Events**: create/edit/delete races, priorities, distances, checklist. Entering a race is manual — nothing is registered or synced.
- **Settings**: units (metric/imperial), preferences, export, reset, and delete.

## Testing

`npm test` runs 144 tests:

- **Domain:** plan generation, determinism, availability constraints, recovery weeks, rescheduling and swap rules, completion and history preservation, readiness gates, clinical-restriction enforcement, symptom triage, persona boundaries, analytics selectors, validation schemas.
- **UI (React Testing Library, real route tree):** onboarding validation, back-navigation data retention, full onboarding to activation; dashboard completion updating the weekly counts; workout detail; reschedule with history preserved; skip with required reason; restriction-blocked edit; adjustment preview; emergency symptom workflow; simulated persona labelling; navigation and 404.

### Responsive verification — what was and wasn't checked

jsdom does not evaluate CSS breakpoints, so the UI tests only confirm both navigation structures render (desktop sidebar `hidden lg:flex`, mobile bar `lg:hidden`). Layout was separately checked in headless Google Chrome against the production build: a sweep of all 12 routes (including `/experts/atlas`) at 320, 360, 390, 768, 1024 and 1440 px found no horizontal page overflow after fixes, and screenshots at 390 and 1440 px were reviewed by eye. There is no automated visual-regression or cross-browser suite, no Safari/Firefox check, and no screen-reader testing. Keyboard and ARIA support follows standard patterns (labelled fields, `role="alert"` errors, Radix dialogs) but has not had a formal accessibility audit.

## Local persistence — limitations

The prototype stores data in browser `localStorage` (`endurapath.v1.general` and `endurapath.v1.medical`). It is **unencrypted, readable by any script on the origin, unsynced, unaudited, and deleted when site data is cleared**. It is not secure medical-data storage; do not enter real health information you would not be comfortable storing in your browser.

## Connecting a real backend

1. Implement `AppRepository` (`src/services/repositories/app-repository.ts`) against an authenticated API. `load`/`save` are currently synchronous; a remote adapter should make them async (change the port and `AppStoreProvider` initial load to a loading state) and use per-entity endpoints rather than whole-state writes.
2. Pass it to `AppStoreProvider` via the `repository` prop. Domain operations in `app-ops.ts` are pure and can run unchanged on the client or be moved server-side.
3. Keep the medical subtree behind separate, more restricted endpoints, and enforce `PERSONA_SCOPES` server-side.

## Connecting a real AI provider

Implement `PersonaProvider` (`src/services/ai/provider.ts`) **on a server**; never ship API keys to the browser. Build prompts only from the permission-scoped context (`buildAthleteContext` + `PERSONA_SCOPES`), keep each persona's boundaries from `domain/safety/personas.ts` in the system prompt, reproduce the emergency and self-harm handling that the simulated provider performs before answering (do not rely on a model to notice it), set `isLive: true` only when a real model replied, and add human-review and logging policies appropriate to health content. The UI labels replies by `source`, so live replies will not be mislabelled as simulated.

## Remaining integrations and production requirements

Not implemented:

- Authenticated accounts and an authenticated backend API; cloud sync.
- Server-side authorization (RBAC, per-record consent for sharing with clinicians), session management, MFA.
- Encrypted transport (TLS 1.2+ / 1.3) and encryption at rest with managed keys.
- Audit logging of access to and changes in health data; log retention and deletion policies; backups.
- Privacy and healthcare compliance review (for example GDPR/UK GDPR, HIPAA or local equivalents) and a clinical-safety review of the triage rules, persona content and plan engine by qualified professionals.
- A real clinician workflow: verified clinician identity and restriction sign-off (today restrictions are self-entered and flagged unverified).
- Live AI provider with moderation, evaluation and monitoring.
- Wearable/data integrations (Garmin, Apple Health, Strava, …), race registration and official results.
- Automated SAST, dependency scanning in CI, accessibility audit, visual-regression and cross-browser testing.
- Notifications beyond in-app (email/push), and hydration reminders beyond the in-app guidance.
