import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Send, Trash2 } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Button, Card, CardBody, CardHeader, LinkButton, Notice } from '@/components/shared/ui'
import { useConfirm } from '@/components/shared/dialog'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { NotFound } from '@/components/shared/route-error'
import { PersonaAvatar } from '@/features/experts/ExpertsPage'
import { addMessagesOp, clearConversationOp } from '@/domain/operations/app-ops'
import { buildAthleteContext, PERSONA_SCOPES, SCOPE_LABELS } from '@/domain/safety/agent-context'
import { isPersonaId, PERSONAS, type PersonaDefinition } from '@/domain/safety/personas'
import { TRIAGE_LABELS } from '@/domain/safety/triage'
import type { PersonaMessage } from '@/domain/models/health'
import { simulatedProvider } from '@/services/ai/simulated-provider'
import { newId } from '@/lib/ids'
import { formatDateTime } from '@/lib/dates'

const MAX_LEN = 1000

function MessageBubble({ m, persona }: { m: PersonaMessage; persona: PersonaDefinition }) {
  const mine = m.role === 'athlete'
  return (
    <li className={`flex gap-3 ${mine ? 'flex-row-reverse' : ''}`}>
      {!mine && <PersonaAvatar initials={persona.initials} color={persona.color} />}
      <div className={`max-w-[85%] space-y-1.5 ${mine ? 'items-end text-right' : ''}`}>
        <div className={`rounded-xl border px-3.5 py-2.5 text-left text-sm ${mine ? 'border-accent/30 bg-accent/10 text-fg' : 'border-line bg-elevated text-fg'} ${m.safetyLevel === 'emergency' ? 'border-danger/60' : ''}`}>
          <p className="whitespace-pre-wrap">{m.text}</p>
        </div>
        <div className={`flex flex-wrap items-center gap-1.5 text-[11px] text-muted ${mine ? 'justify-end' : ''}`}>
          <span>{mine ? 'You' : persona.name}</span>
          <span aria-hidden>·</span>
          <time dateTime={m.createdAt}>{formatDateTime(m.createdAt)}</time>
          {!mine && <Badge tone="neutral">{m.source === 'live-ai' ? 'Live AI' : 'Simulated'}</Badge>}
          {m.safetyLevel && m.safetyLevel !== 'monitor' && <Badge tone={m.safetyLevel === 'professional-assessment' ? 'warn' : 'danger'}>{TRIAGE_LABELS[m.safetyLevel]}</Badge>}
        </div>
        {m.actions && m.actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {m.actions.map((a) => (
              <LinkButton key={a.to + a.label} to={a.to} size="sm" variant="outline">
                {a.label}
              </LinkButton>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

function PersonaContent({ persona }: { persona: PersonaDefinition }) {
  const { state, today, run } = useApp()
  const confirm = useConfirm()
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const messages = state.messages.filter((m) => m.personaId === persona.id)

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' })
  }, [messages.length, pending])

  async function send(text: string) {
    const body = text.trim()
    if (!body || pending) return
    if (body.length > MAX_LEN) return setError(`Messages are limited to ${MAX_LEN} characters.`)
    setError(null)
    setDraft('')
    const now = new Date().toISOString()
    const userMsg: PersonaMessage = { id: newId('msg'), createdAt: now, updatedAt: now, personaId: persona.id, role: 'athlete', text: body, source: 'user' }
    const history = [...messages, userMsg].slice(-10).map((m) => ({ role: m.role, text: m.text }))
    run((s, e) => addMessagesOp(s, [userMsg], e))
    setPending(true)
    try {
      const context = buildAthleteContext(state, persona.id, today)
      const reply = await simulatedProvider.reply({ personaId: persona.id, message: body, history, context })
      const at = new Date().toISOString()
      const personaMsg: PersonaMessage = { id: newId('msg'), createdAt: at, updatedAt: at, personaId: persona.id, role: 'persona', text: reply.text, source: reply.source, safetyLevel: reply.safetyLevel, actions: reply.actions }
      run((s, e) => addMessagesOp(s, [personaMsg], e))
    } catch {
      setError('The simulated assistant could not respond. Please try again.')
    } finally {
      setPending(false)
    }
  }

  async function clear() {
    const ok = await confirm({ title: `Clear conversation with ${persona.name}?`, body: 'This deletes the messages in this conversation from this browser. Your plan and logs are not affected.', confirmLabel: 'Clear conversation' })
    if (ok) run((s, e) => clearConversationOp(s, persona.id, e), { success: 'Conversation cleared.' })
  }

  return (
    <div className="space-y-6">
      <PageIntro>
        <Link to="/experts" className="text-accent hover:underline">
          ← All experts
        </Link>
      </PageIntro>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="flex min-h-[32rem] flex-col xl:col-span-2">
          <CardHeader
            title={
              <span className="flex items-center gap-3">
                <PersonaAvatar initials={persona.initials} color={persona.color} />
                <span>
                  {persona.name}
                  <span className="block text-xs font-normal text-muted">{persona.role}</span>
                </span>
              </span>
            }
            action={
              messages.length > 0 ? (
                <Button size="sm" variant="ghost" onClick={clear} aria-label={`Clear conversation with ${persona.name}`}>
                  <Trash2 className="size-4" aria-hidden /> Clear
                </Button>
              ) : undefined
            }
          />
          <div className="border-b border-line bg-warn/5 px-5 py-2 text-xs text-warn" role="note">
            {persona.disclosure} No real professional has reviewed your case.
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-5" style={{ maxHeight: '32rem' }} aria-live="polite" aria-label={`Conversation with ${persona.name}`}>
            {messages.length === 0 ? (
              <div className="space-y-3 py-6 text-center">
                <p className="text-sm text-muted">Start with a question, or tap a suggestion.</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {persona.starters.map((s) => (
                    <Button key={s} size="sm" variant="outline" onClick={() => send(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <ul className="space-y-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} persona={persona} />
                ))}
                {pending && (
                  <li role="status" className="text-xs text-muted">
                    {persona.name} is typing…
                  </li>
                )}
              </ul>
            )}
            <div ref={endRef} />
          </div>
          <form
            className="border-t border-line p-3 sm:p-4"
            aria-label={`Message ${persona.name}`}
            onSubmit={(e) => {
              e.preventDefault()
              void send(draft)
            }}
          >
            {error && (
              <p role="alert" className="mb-2 text-xs text-danger">
                {error}
              </p>
            )}
            <div className="flex items-end gap-2">
              <label htmlFor="chat-input" className="sr-only">
                Message {persona.name}
              </label>
              <textarea
                id="chat-input"
                value={draft}
                maxLength={MAX_LEN}
                rows={2}
                placeholder={`Ask ${persona.name} a question…`}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send(draft)
                  }
                }}
                className="min-h-[44px] flex-1 resize-none rounded-lg border border-line bg-base px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <Button type="submit" variant="primary" size="md" disabled={!draft.trim() || pending} aria-label="Send message">
                <Send className="size-4" aria-hidden /> Send
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted">Replies are simulated. Don’t share anything you wouldn’t want stored in this browser. For emergencies call your local emergency number.</p>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="About" />
            <CardBody className="space-y-3 text-sm">
              <p className="text-muted">{persona.bio}</p>
              <p className="text-xs text-muted">Tone: {persona.tone}</p>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">Responsible for</h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                  {persona.responsibilities.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            </CardBody>
          </Card>
          <Notice tone="warn" title="Boundaries">
            {persona.boundaries.map((b) => (
              <p key={b}>{b}</p>
            ))}
          </Notice>
          <Card>
            <CardHeader title="Shared athlete context" subtitle="What this persona is permitted to read" />
            <CardBody>
              <ul className="space-y-1.5 text-sm">
                {PERSONA_SCOPES[persona.id].map((s) => (
                  <li key={s} className="flex items-center gap-2 text-muted">
                    <span className="size-1.5 rounded-full bg-secondary" aria-hidden />
                    {SCOPE_LABELS[s]}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">Medical data (symptoms, rehab) is only shared with Dr. Meridian and MotionLab. Context is read from this browser only.</p>
            </CardBody>
          </Card>
        </div>
      </div>
      <SafetyFooter />
    </div>
  )
}

export function PersonaPage() {
  const { personaId } = useParams()
  if (!isPersonaId(personaId)) return <NotFound />
  return (
    <RequireOnboarded>
      <PersonaContent key={personaId} persona={PERSONAS[personaId]} />
    </RequireOnboarded>
  )
}
