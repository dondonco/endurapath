# Integrations

**No external integrations are implemented in this prototype.**

| Integration | Status |
| --- | --- |
| Race registration / official results | Not implemented. Races are entered manually. |
| Wearables (Garmin, Apple Health, Strava, …) | Not implemented. All metrics are self-entered. |
| Cloud sync / accounts | Not implemented. Data lives in browser `localStorage`. |
| Live AI model | Not implemented. Chats use `services/ai/simulated-provider.ts`. |
| Clinician / EHR connection | Not implemented. Restrictions are entered by the athlete and flagged unverified. |

When adding one, place its adapter in this folder behind a typed port (like `AppRepository` or `PersonaProvider`),
keep credentials server-side, and make the UI state truthful about whether it is connected.
