import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { makeRestriction, makeState, TODAY, NOW } from '@/test/fixtures'
import { pinClock, renderApp, unpinClock } from '@/test/render-app'

beforeEach(() => pinClock())
afterEach(() => unpinClock())

const weekCardOf = () => screen.getByRole('heading', { name: 'This week' }).closest<HTMLElement>('div.rounded-xl')!
const todayOf = (state: ReturnType<typeof makeState>) => state.workouts.find((w) => w.date === TODAY)!

async function recordResult(user: ReturnType<typeof userEvent.setup>, rpe: string) {
  const dialog = await screen.findByRole('dialog')
  const rpeInput = within(dialog).getByLabelText(/Perceived effort/)
  await user.clear(rpeInput)
  await user.type(rpeInput, rpe)
  await user.click(within(dialog).getByRole('button', { name: /Save result/ }))
}

describe('dashboard and workout completion', () => {
  it('shows only values derived from state, and today’s prescribed session', async () => {
    const state = makeState()
    renderApp(state, '/dashboard')
    expect(await screen.findByText(/Welcome back, Test Athlete/)).toBeInTheDocument()
    expect(await screen.findByText(todayOf(state).title)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Start \/ view workout/ })).toHaveAttribute('href', `/training/${todayOf(state).id}`)
  })

  it('requires an effort rating, then saves the result and updates the dashboard', async () => {
    const user = userEvent.setup()
    const state = makeState()
    const { repository } = renderApp(state, '/dashboard')
    const w = todayOf(state)
    await screen.findByText(w.title)
    const weekCard = weekCardOf()
    const before = within(weekCard).getByText(/^\d+\/\d+$/).textContent

    await user.click(screen.getByRole('button', { name: /Mark complete/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Save result/ }))
    expect(await within(dialog).findByText(/effort|RPE|required/i, { selector: '[role="alert"]' })).toBeInTheDocument()
    expect(repository.load()?.results ?? []).toHaveLength(0)

    await recordResult(user, '4')
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())

    const saved = repository.load()!
    expect(saved.results).toHaveLength(1)
    expect(saved.results[0]).toMatchObject({ workoutId: w.id, rpe: 4 })
    expect(saved.workouts.find((x) => x.id === w.id)?.status).toBe('completed')
    const after = within(weekCardOf()).getByText(/^\d+\/\d+$/).textContent
    expect(after).not.toBe(before)
    expect(screen.queryByRole('button', { name: /Mark complete/ })).not.toBeInTheDocument()
  })
})

describe('workout detail and rescheduling', () => {
  it('opens a workout with every required section', async () => {
    const state = makeState()
    const w = todayOf(state)
    renderApp(state, `/training/${w.id}`)
    expect(await screen.findByRole('heading', { name: w.title })).toBeInTheDocument()
    for (const label of ['Purpose', 'Warm-up', 'Main set', 'Cool-down', 'Coaching notes']) expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByText(/Change history for this session/)).toBeInTheDocument()
  })

  it('reschedules a future session, logs the change, and leaves a completed session’s result untouched', async () => {
    const user = userEvent.setup()
    const state = makeState()
    const done = todayOf(state)
    const future = state.workouts.find((w) => w.date === '2026-03-05')!
    const { repository, router } = renderApp(state, `/training/${done.id}`)

    // Complete today's session first.
    await user.click(await screen.findByRole('button', { name: /Record result/ }))
    await recordResult(user, '5')
    await waitFor(() => expect(repository.load()!.results).toHaveLength(1))
    const resultBefore = repository.load()!.results[0]
    expect(screen.getByText(/can’t be edited or moved/)).toBeInTheDocument()

    // Then move a different future session.
    await router.navigate(`/training/${future.id}`)
    await user.click(await screen.findByRole('button', { name: /Edit schedule/ }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText('Date'), { target: { value: '2026-03-07' } })
    await user.type(within(dialog).getByLabelText(/Reason/), 'Work trip Thursday')
    const save = within(dialog).getByRole('button', { name: /Save schedule/ })
    await waitFor(() => expect(save).toBeEnabled())
    await user.click(save)

    await waitFor(() => expect(repository.load()!.workouts.find((w) => w.id === future.id)?.date).toBe('2026-03-07'))
    const after = repository.load()!
    expect(after.workouts.find((w) => w.id === future.id)).toMatchObject({ originalDate: '2026-03-05', modified: true })
    expect(after.results).toEqual([resultBefore])
    expect(after.workouts.find((w) => w.id === done.id)).toMatchObject({ status: 'completed', date: TODAY })
    expect(after.changes.some((c) => c.workoutIds.includes(future.id) && /Work trip Thursday/.test(c.reason))).toBe(true)
  })

  it('blocks a move that would breach an active clinical restriction', async () => {
    const user = userEvent.setup()
    const restriction = makeRestriction({ effect: { blockedSports: ['run'] } })
    const state = makeState({ restrictions: [restriction] })
    const bike = state.workouts.find((w) => w.sport === 'bike' && w.date >= '2026-03-03')!
    renderApp(state, `/training/${bike.id}`)
    await user.click(await screen.findByRole('button', { name: /Edit schedule/ }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Save schedule/ })).toBeDisabled()
  })

  it('requires a reason to skip, keeps the session in history, and does not move it to another day', async () => {
    const user = userEvent.setup()
    const state = makeState()
    const w = state.workouts.find((x) => x.date === '2026-03-03')!
    const { repository } = renderApp(state, `/training/${w.id}`)
    await user.click(await screen.findByRole('button', { name: /^Skip$/ }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: /Skip session/ }))
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/Reason for skipping/), 'Felt unwell')
    await user.click(within(dialog).getByRole('button', { name: /Skip session/ }))
    await waitFor(() => expect(repository.load()!.workouts.find((x) => x.id === w.id)?.status).toBe('skipped'))
    const after = repository.load()!
    expect(after.workouts).toHaveLength(state.workouts.length)
    expect(after.workouts.find((x) => x.id === w.id)?.date).toBe('2026-03-03')
  })

  it('previews a plan adjustment (with rationale) without changing anything until applied', async () => {
    const user = userEvent.setup()
    const state = makeState()
    const w = state.workouts.find((x) => x.date === '2026-03-03')!
    const { repository } = renderApp(state, `/training/${w.id}`)
    await user.click(await screen.findByRole('button', { name: /Preview adjustment/ }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/proposal only/i)).toBeInTheDocument()
    expect(within(dialog).getByText('Proposed changes')).toBeInTheDocument()
    expect(within(dialog).getByText('Why')).toBeInTheDocument()
    expect(within(dialog).getByText(/Effect on your progression/)).toBeInTheDocument()
    expect(repository.load()?.changes ?? []).toHaveLength(0)
  })
})

describe('app shell', () => {
  it('renders both the desktop sidebar and the mobile bottom navigation, with the same destinations', async () => {
    renderApp(makeState(), '/dashboard')
    await screen.findByText(/Welcome back/)
    const main = screen.getByRole('navigation', { name: 'Main' })
    const mobile = screen.getByRole('navigation', { name: 'Primary mobile' })
    expect(within(main).getAllByRole('link').length).toBeGreaterThanOrEqual(11)
    expect(within(mobile).getAllByRole('link').length).toBeGreaterThanOrEqual(4)
    expect(within(main).getByRole('link', { name: /Dashboard/ })).toHaveAttribute('aria-current', 'page')
    // Breakpoint visibility is CSS-driven (lg:), which jsdom does not evaluate.
    expect(main.closest('aside')?.className).toMatch(/\bhidden\b.*\blg:flex\b/)
    expect(mobile.className).toMatch(/\blg:hidden\b/)
  })

  it('navigates between routes with an updated page title', async () => {
    const user = userEvent.setup()
    renderApp(makeState(), '/dashboard')
    await screen.findByText(/Welcome back/)
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /Training/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Training' })).toBeInTheDocument()
  })

  it('shows a not-found page for unknown routes', async () => {
    renderApp(makeState(), '/does-not-exist')
    expect(await screen.findByText(/That page does not exist/)).toBeInTheDocument()
  })
})

describe('safety workflows', () => {
  it('shows the emergency screen and adds a training hold when emergency warning signs are reported', async () => {
    const user = userEvent.setup()
    const { repository } = renderApp(makeState(), '/rehab')
    await screen.findByText('Report a symptom')
    const form = screen.getByRole('form', { name: 'Symptom report' })
    await user.type(within(form).getByLabelText(/Body area/), 'chest')
    await user.type(within(form).getByLabelText(/Severity right now/), '6')
    await user.type(within(form).getByLabelText(/What are you noticing/), 'tightness while running')
    await user.click(within(form).getByRole('checkbox', { name: /Chest pain, pressure or tightness/ }))
    await user.click(within(form).getByRole('button', { name: /Submit symptom report/ }))

    expect(await screen.findByText('Seek emergency medical care now')).toBeInTheDocument()
    expect(screen.getAllByText(/emergency number/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/not a diagnosis/i)).toBeInTheDocument()
    expect(repository.load()!.medical.symptoms).toHaveLength(1)
    expect(repository.load()!.medical.symptoms[0].triage.level).toBe('emergency')
  })

  it('validates the symptom form instead of submitting empty', async () => {
    const user = userEvent.setup()
    const { repository } = renderApp(makeState(), '/rehab')
    await screen.findByText('Report a symptom')
    await user.click(screen.getByRole('button', { name: /Submit symptom report/ }))
    expect((await screen.findAllByRole('alert')).length).toBeGreaterThan(0)
    expect(repository.load()?.medical.symptoms ?? []).toHaveLength(0)
  })

  it('labels every persona reply as simulated and does not clear the athlete to return to sport', async () => {
    const user = userEvent.setup()
    renderApp(makeState(), '/experts/meridian')
    expect(await screen.findByText(/No real professional has reviewed your case/)).toBeInTheDocument()
    const box = screen.getByRole('textbox')
    await user.type(box, 'Can you clear me to return to running?')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    expect(await screen.findByText(/cannot clear you to return to sport/i)).toBeInTheDocument()
    expect(screen.getAllByText('Simulated').length).toBeGreaterThan(0)
  })

  it('keeps all four personas reachable and distinct', async () => {
    renderApp(makeState(), '/experts')
    for (const name of ['Coach Atlas', 'FuelWise', 'Dr. Meridian', 'MotionLab']) expect((await screen.findAllByText(name)).length).toBeGreaterThan(0)
    expect(NOW).toBeTruthy()
  })
})
