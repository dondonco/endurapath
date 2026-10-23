import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import { useApp } from '@/app/store'
import { Badge, Card, CardBody, Notice } from '@/components/shared/ui'
import { PageIntro, RequireOnboarded, SafetyFooter } from '@/components/shared/page'
import { PERSONA_LIST } from '@/domain/safety/personas'
import { PERSONA_SCOPES, SCOPE_LABELS } from '@/domain/safety/agent-context'

export function PersonaAvatar({ initials, color, size = 'md' }: { initials: string; color: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full border font-semibold ${size === 'lg' ? 'size-14 text-lg' : 'size-10 text-sm'}`}
      style={{ color, borderColor: color, backgroundColor: 'color-mix(in srgb, currentColor 12%, transparent)' }}
    >
      {initials}
    </span>
  )
}

function ExpertsContent() {
  const { state } = useApp()
  return (
    <div className="space-y-6">
      <PageIntro title="Your expert team">
        Four specialists, one coordinated plan. Each only advises within its own responsibilities and sees only the athlete data it needs.
      </PageIntro>

      <Notice tone="warn" title="Simulated assistants">
        <p>
          Every reply here comes from a <strong>rule-based simulation running in your browser</strong>. There is no live AI model and no real coach, nutritionist, physician or physical therapist behind these chats, and nobody has reviewed your case.
        </p>
      </Notice>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {PERSONA_LIST.map((p) => {
          const count = state.messages.filter((m) => m.personaId === p.id).length
          return (
            <Card key={p.id} className="flex flex-col">
              <CardBody className="flex flex-1 flex-col gap-4">
                <div className="flex items-start gap-4">
                  <PersonaAvatar initials={p.initials} color={p.color} size="lg" />
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-fg">{p.name}</h3>
                    <p className="text-sm text-muted">{p.role}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone="neutral">Simulated</Badge>
                      {count > 0 && <Badge tone="info">{count} messages</Badge>}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-muted">{p.bio}</p>
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wider text-muted">Can see</p>
                  <p className="mt-1 text-xs text-muted">{PERSONA_SCOPES[p.id].map((s) => SCOPE_LABELS[s]).join(' · ')}</p>
                </div>
                <div className="mt-auto flex items-center justify-between pt-1">
                  <p className="text-xs text-muted">Tone: {p.tone}</p>
                  <Link to={`/experts/${p.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline" aria-label={`Open chat with ${p.name}`}>
                    Open chat <ArrowRight className="size-4" aria-hidden />
                  </Link>
                </div>
              </CardBody>
            </Card>
          )
        })}
      </div>
      <SafetyFooter />
    </div>
  )
}

export function ExpertsPage() {
  return (
    <RequireOnboarded>
      <ExpertsContent />
    </RequireOnboarded>
  )
}
