// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { MemoryRepository } from './firebase/repository';
import { ScriptedGameMaster } from './gm/scriptedGameMaster';

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const renderApp = () => render(<App repo={new MemoryRepository()} gm={new ScriptedGameMaster()} />);

describe('App', () => {
  it('shows the story, the three survivors, the location and the event log', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();

    const survivors = screen.getByRole('region', { name: 'Survivors' });
    for (const name of ['Dana Okafor', 'Marcus Hale', 'Walt Brennan']) {
      expect(within(survivors).getByText(name)).toBeTruthy();
    }
    expect(within(survivors).getAllByRole('meter')).toHaveLength(6); // health + stamina x 3

    expect(screen.getByRole('log', { name: 'Story' }).textContent).toMatch(/The bell never rang/);
    expect(screen.getByRole('region', { name: 'Location and campaign status' }).textContent).toMatch(/Front Office/);
    expect(screen.getByRole('region', { name: 'Campaign event log' })).toBeTruthy();
  });

  it('an action goes through the rules: the dice result and a story beat appear', async () => {
    const user = userEvent.setup();
    renderApp();
    const box = await screen.findByRole('textbox');

    await user.type(box, 'Search the front office for supplies');
    await user.click(screen.getByRole('button', { name: 'Act' }));

    // The roll is shown with every number that went into it.
    expect(await screen.findByLabelText(/rolled \d+ on a d20 for Scavenging/)).toBeTruthy();
    expect(screen.getByRole('log', { name: 'Story' }).textContent).toMatch(/Search the front office/);
    expect((box as HTMLTextAreaElement).value).toBe('');
  });

  it('lets this browser choose which survivor it plays', async () => {
    const user = userEvent.setup();
    renderApp();
    const select = await screen.findByLabelText('Playing as');
    await user.selectOptions(select, 'marcus');

    expect(screen.getByRole('textbox', { name: /What does Marcus Hale do/ })).toBeTruthy();
    expect(window.localStorage.getItem('zombie-school-rpg.player')).toBe('marcus');
  });
});
