import { screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { emptyState } from '@/domain/models/state'
import { NOW } from '@/test/fixtures'
import { pinClock, renderApp, unpinClock } from '@/test/render-app'

beforeEach(() => pinClock())
afterEach(() => unpinClock())

const group = (name: RegExp) => screen.getByRole('group', { name })
const choose = async (user: ReturnType<typeof userEvent.setup>, legend: RegExp, option: RegExp) => user.click(within(group(legend)).getByRole('radio', { name: option }))

async function completeStepOne(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText(/Preferred name/), 'Sam')
  await user.selectOptions(screen.getByLabelText(/Age range/), '35-44')
  await choose(user, /General training experience/, /Beginner/)
  await choose(user, /Swimming confidence/, /Basic/)
  await choose(user, /Open-water experience/, /None/)
  await choose(user, /Cycling experience/, /Beginner/)
  await choose(user, /Running experience/, /Beginner/)
}

describe('onboarding wizard', () => {
  it('shows validation errors instead of advancing when required answers are missing', async () => {
    const user = userEvent.setup()
    renderApp(emptyState(NOW), '/onboarding')
    await screen.findByText(/Step 1 of 6/)
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    expect(await screen.findByText(/Please fix the highlighted fields/)).toBeInTheDocument()
    expect(screen.getAllByRole('alert').length).toBeGreaterThan(1)
    expect(screen.getByText(/Step 1 of 6/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Preferred name/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('keeps entered data when going back to a previous step', async () => {
    const user = userEvent.setup()
    renderApp(emptyState(NOW), '/onboarding')
    await completeStepOne(user)
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    expect(await screen.findByText(/Step 2 of 6/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Back/ }))
    expect(await screen.findByText(/Step 1 of 6/)).toBeInTheDocument()
    expect(screen.getByLabelText(/Preferred name/)).toHaveValue('Sam')
    expect(within(group(/General training experience/)).getByRole('radio', { name: /Beginner/ })).toBeChecked()
  })

  it('goes from first answers to a plan preview and activates an IRONMAN goal starting in Stage A', async () => {
    const user = userEvent.setup()
    const { router, repository } = renderApp(emptyState(NOW), '/onboarding')
    await completeStepOne(user)
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 2: baseline. Counts default to 0; only consistency is required.
    await screen.findByText(/Step 2 of 6/)
    await choose(user, /Training consistency/, /Occasional/)
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    // Step 3: goal.
    await screen.findByText(/Step 3 of 6/)
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    expect(await screen.findByText(/Please fix the highlighted fields/)).toBeInTheDocument()
    await choose(user, /Your goal/, /Full-distance IRONMAN/)
    expect(await screen.findByText(/Ambitious goals are welcome/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Continue/ }))

    // Steps 4 and 5 start with valid defaults.
    await screen.findByText(/Step 4 of 6/)
    await user.click(screen.getByRole('button', { name: /Continue/ }))
    await screen.findByText(/Step 5 of 6/)
    await user.click(screen.getByRole('button', { name: /Preview plan/ }))

    // Step 6: preview shows stage, roadmap, assumptions and assessments before anything is activated.
    await screen.findByText(/Step 6 of 6/)
    expect(await screen.findByText('Starting stage')).toBeInTheDocument()
    expect(screen.getByText('Stage A')).toBeInTheDocument()
    expect(screen.getByText(/Proposed progression roadmap/)).toBeInTheDocument()
    expect(screen.getByText(/Suggested baseline assessment sessions/)).toBeInTheDocument()
    expect(screen.getByText(/Key assumptions/)).toBeInTheDocument()
    expect(repository.load()?.onboarded).toBe(false)

    await user.click(screen.getByRole('button', { name: /Activate this plan/ }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'))
    expect(await screen.findByText(/Welcome back, Sam/)).toBeInTheDocument()
    const saved = repository.load()
    expect(saved?.onboarded).toBe(true)
    expect(saved?.plan?.currentStage).toBe('A')
    expect(saved?.workouts.length).toBeGreaterThan(0)
  })
})
