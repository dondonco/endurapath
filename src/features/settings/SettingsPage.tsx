import { useState } from 'react'
import { Download, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, Notice } from '@/components/shared/ui'
import { useConfirm } from '@/components/shared/dialog'
import { PageIntro } from '@/components/shared/page'
import { Checkbox, ChoiceGroup, Field, Select } from '@/components/forms/controls'
import { eraseAllDataOp, eraseMedicalDataOp, updateSettingsOp, updateUnitsOp } from '@/domain/operations/app-ops'
import { GENERAL_KEY, MEDICAL_KEY } from '@/services/repositories/app-repository'
import { simulatedProvider } from '@/services/ai/simulated-provider'
import type { UnitSystem } from '@/lib/units'

export function SettingsPage() {
  const { state, run, replaceState, repository, env, storageError, loadSample } = useApp()
  const confirm = useConfirm()
  const [exportError, setExportError] = useState<string | null>(null)
  const m = state.medical

  const counts: [string, number][] = [
    ['Planned & completed workouts', state.workouts.length],
    ['Workout results', state.results.length],
    ['Plan changes', state.changes.length],
    ['Recovery check-ins', state.checkIns.length],
    ['Fueling logs', state.fuelingLogs.length],
    ['Races', state.events.length],
    ['Expert chat messages', state.messages.length],
    ['Readiness reviews', state.assessments.length],
  ]
  const medicalCounts: [string, number][] = [
    ['Restrictions', m.restrictions.length],
    ['Symptom reports', m.symptoms.length],
    ['Rehabilitation plans', m.rehabPlans.length],
    ['Rehabilitation logs', m.rehabLogs.length],
  ]

  function exportData() {
    try {
      const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `endurapath-export-${env().today}.json`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setExportError(null)
    } catch {
      setExportError('The export could not be created in this browser.')
    }
  }

  async function eraseMedical() {
    const ok = await confirm({
      title: 'Delete all medical records?',
      body: (
        <>
          <p>This permanently deletes restrictions, symptom reports, rehabilitation plans and logs from this browser.</p>
          <p className="mt-2">
            <strong className="text-fg">Active restrictions will stop shaping your plan.</strong> Only do this if you understand that — your care team’s guidance still applies.
          </p>
        </>
      ),
      confirmLabel: 'Delete medical data',
    })
    if (ok) run((s, e) => eraseMedicalDataOp(s, e), { success: 'Medical records deleted.' })
  }

  async function eraseAll() {
    const ok = await confirm({
      title: 'Delete everything on this device?',
      body: 'Your profile, plan, workouts, logs, races, chats and medical records will be permanently removed from this browser. This cannot be undone. Export a copy first if you want to keep one.',
      confirmLabel: 'Delete all data',
    })
    if (!ok) return
    repository.clear()
    replaceState(eraseAllDataOp(env()))
  }

  async function reloadSample() {
    const ok = await confirm({ title: 'Replace with sample data?', body: 'This replaces everything currently stored in this browser with the labelled sample athlete.', confirmLabel: 'Load sample athlete', tone: 'primary' })
    if (ok) loadSample()
  }

  return (
    <div className="space-y-6">
      <PageIntro title="Settings">Units, preferences and control over the data stored in this browser.</PageIntro>

      {storageError && (
        <Notice tone="danger" title="Storage problem">
          <p>{storageError}</p>
        </Notice>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader title="Units & preferences" />
          <CardBody className="space-y-5">
            {state.athlete ? (
              <ChoiceGroup<UnitSystem>
                name="settings-units"
                legend="Distance units"
                value={state.athlete.units}
                onChange={(u) => run((s, e) => updateUnitsOp(s, u, e), { success: `Units set to ${u}.` })}
                options={[
                  { value: 'metric', label: 'Metric', hint: 'km, m, min/km' },
                  { value: 'imperial', label: 'Imperial', hint: 'mi, yd, min/mi' },
                ]}
              />
            ) : (
              <p className="text-sm text-muted">Complete onboarding to set units.</p>
            )}
            <Checkbox
              label="Show hydration reminders"
              hint="Reminders say to drink to thirst and conditions — never a forced amount."
              checked={state.settings.hydrationReminders}
              onChange={(v) => run((s, e) => updateSettingsOp(s, { hydrationReminders: v }, e))}
            />
            <Checkbox
              label="Show sample-data banner"
              hint="A banner is shown whenever the app contains the demo athlete."
              checked={state.settings.showSampleDataBanner}
              onChange={(v) => run((s, e) => updateSettingsOp(s, { showSampleDataBanner: v }, e))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="AI provider" />
          <CardBody className="space-y-4">
            <Field label="Provider">
              {({ id }) => (
                <Select id={id} value={state.settings.aiProvider} disabled onChange={() => undefined}>
                  <option value="simulated">{simulatedProvider.label}</option>
                </Select>
              )}
            </Field>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="warn">Not a live AI model</Badge>
              <Badge>No data leaves your browser</Badge>
            </div>
            <p className="text-sm text-muted">
              Expert chats use a deterministic, rule-based simulation. A live model can be added by implementing the <code className="rounded bg-elevated px-1">PersonaProvider</code> port on a server — see the README. No API keys are stored in this app.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Your data" subtitle="Review what is stored on this device" />
        <CardBody className="space-y-5">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Training data</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {counts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular-nums text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Medical data (stored separately)</h3>
              <dl className="mt-2 space-y-1.5 text-sm">
                {medicalCounts.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4">
                    <dt className="text-muted">{k}</dt>
                    <dd className="tabular-nums text-fg">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {state.isSampleData && (
            <Notice tone="warn">
              <p>The data currently in the app is the labelled <strong>sample athlete</strong>. Complete onboarding to replace it with your own.</p>
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportData}>
              <Download className="size-4" aria-hidden /> Export my data (JSON)
            </Button>
            <Button variant="outline" onClick={reloadSample}>
              Load sample athlete
            </Button>
          </div>
          {exportError && (
            <p role="alert" className="text-xs text-danger">
              {exportError}
            </p>
          )}
          <p className="text-xs text-muted">Exports contain health-related entries. Store the file securely.</p>
        </CardBody>
      </Card>

      <Card className="border-danger/40">
        <CardHeader title="Delete data" subtitle="Both actions ask for confirmation first" />
        <CardBody className="flex flex-wrap gap-2">
          <Button variant="danger" onClick={eraseMedical}>
            <Trash2 className="size-4" aria-hidden /> Delete medical records
          </Button>
          <Button variant="danger" onClick={eraseAll}>
            <Trash2 className="size-4" aria-hidden /> Delete all data
          </Button>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Storage & privacy limitations" />
        <CardBody className="space-y-3 text-sm text-muted">
          <p>
            This prototype keeps data in your browser’s <code className="rounded bg-elevated px-1">localStorage</code> (keys <code className="rounded bg-elevated px-1">{GENERAL_KEY}</code> and <code className="rounded bg-elevated px-1">{MEDICAL_KEY}</code>). It is <strong className="text-fg">not secure medical-data storage</strong>: it is unencrypted, readable by any script on this origin, not backed up, and not synchronised. Clearing site data deletes it.
          </p>
          <p>There is no account, cloud synchronisation, race-registration or wearable integration. Nothing is sent to a server.</p>
          <p>
            A production deployment needs an authenticated backend with server-side authorisation, encrypted transport and storage, audit logs, retention policies, and privacy and healthcare-compliance review. Do not enter real health information into this prototype.
          </p>
        </CardBody>
      </Card>
    </div>
  )
}
