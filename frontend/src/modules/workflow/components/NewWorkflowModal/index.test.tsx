import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ConfigProvider } from 'antd';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listSkillAssetsPage, type SkillAssetListResult } from '@/modules/memory/skillApi';
import NewWorkflowModal from './index';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock('@/modules/memory/skillApi', () => ({ listSkillAssetsPage: vi.fn() }));
vi.mock('../../workflowDraftApi', () => ({
  createWorkflowDraft: vi.fn(),
  aiGenerateWorkflowDraft: vi.fn(),
  updateWorkflowDraftContent: vi.fn(),
  deleteWorkflowDraft: vi.fn(),
}));

const listSkills = vi.mocked(listSkillAssetsPage);
const skills = Array.from({ length: 174 }, (_, index) => ({
  id: `skill-${index}`,
  name: index === 173 ? 'find-skill-skillhub' : `Example skill ${index}`,
})) as SkillAssetListResult['records'];

function page(records = skills, pageNumber = 1, pageSize = 20): SkillAssetListResult {
  return {
    records: records.slice((pageNumber - 1) * pageSize, pageNumber * pageSize),
    total: records.length,
    page: pageNumber,
    pageSize,
  };
}

function deferredPage() {
  let resolve!: (result: SkillAssetListResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<SkillAssetListResult>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderModal() {
  const props = { open: true, onCancel: vi.fn(), onCreated: vi.fn() };
  const view = render(<ConfigProvider virtual={false}><NewWorkflowModal {...props} /></ConfigProvider>);
  const setOpen = (open: boolean) => view.rerender(
    <ConfigProvider virtual={false}><NewWorkflowModal {...props} open={open} /></ConfigProvider>,
  );
  return { ...view, setOpen, ...props };
}

function openSkills() {
  fireEvent.click(screen.getByRole('button', { name: /newWorkflowModeSkillTitle/ }));
  const input = screen.getByRole('combobox');
  fireEvent.focus(input);
  fireEvent.mouseDown(input);
  return input;
}

// JSDOM has no layout; provide geometry for the real Ant Design scroll container.
function scrollSkills(toBottom = true) {
  const holder = screen.getByRole('listbox').closest('.rc-virtual-list-holder')!;
  Object.defineProperties(holder, {
    clientHeight: { configurable: true, value: 256 },
    scrollHeight: { configurable: true, value: 1000 },
  });
  fireEvent.scroll(holder, { target: { scrollTop: toBottom ? 744 : 10 } });
}

beforeEach(() => {
  listSkills.mockReset();
  listSkills.mockImplementation(async (options = {}) => page(skills, options.page, options.pageSize));
});

afterEach(() => cleanup());

describe('NewWorkflowModal skill options', () => {
  it('loads one page initially, appends all 174 skills on demand, and stops at the end', async () => {
    renderModal();
    openSkills();

    await screen.findByTitle('Example skill 19');
    expect(screen.queryByTitle('Example skill 20')).not.toBeInTheDocument();
    expect(listSkills).toHaveBeenCalledTimes(1);
    scrollSkills(false);
    expect(listSkills).toHaveBeenCalledTimes(1);
    for (let nextPage = 2; nextPage <= 9; nextPage += 1) {
      scrollSkills();
      await screen.findByTitle(nextPage === 9 ? 'find-skill-skillhub' : `Example skill ${nextPage * 20 - 1}`);
      expect(screen.getByTitle('Example skill 0')).toBeInTheDocument();
      expect(listSkills).toHaveBeenLastCalledWith({ keyword: '', page: nextPage, pageSize: 20 });
    }
    scrollSkills();
    expect(listSkills).toHaveBeenCalledTimes(9);
    expect(screen.getAllByRole('option')).toHaveLength(174);
    fireEvent.click(screen.getByTitle('find-skill-skillhub'));
    expect(screen.getByDisplayValue('find-skill-skillhub')).toBeInTheDocument();
  });

  it('keeps earlier results and prevents duplicate requests while the next page loads', async () => {
    const pending = deferredPage();
    listSkills.mockResolvedValueOnce(page()).mockReturnValueOnce(pending.promise);
    renderModal();
    openSkills();
    await screen.findByTitle('Example skill 19');
    act(() => { scrollSkills(); scrollSkills(); scrollSkills(); });
    expect(listSkills).toHaveBeenCalledTimes(2);
    expect(screen.getByTitle('Example skill 0')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('common.loading');
    await act(async () => pending.resolve(page(skills, 2)));
    await screen.findByTitle('Example skill 39');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('resets pagination on search and when search is cleared', async () => {
    const matches = skills.slice(40, 85);
    listSkills.mockImplementation(async (options = {}) =>
      page(options.keyword ? matches : skills, options.page, options.pageSize));
    renderModal();
    const input = openSkills();
    await screen.findByTitle('Example skill 19');

    fireEvent.change(input, { target: { value: 'Example' } });
    await screen.findByTitle('Example skill 59');
    expect(screen.queryByTitle('Example skill 0')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Example skill 60')).not.toBeInTheDocument();
    scrollSkills();
    await screen.findByTitle('Example skill 79');
    expect(listSkills).toHaveBeenLastCalledWith({ keyword: 'Example', page: 2, pageSize: 20 });
    scrollSkills();
    await screen.findByTitle('Example skill 84');

    fireEvent.change(input, { target: { value: '' } });
    await screen.findByTitle('Example skill 19');
    expect(screen.queryByTitle('Example skill 40')).not.toBeInTheDocument();
    expect(listSkills).toHaveBeenLastCalledWith({ keyword: '', page: 1, pageSize: 20 });
    expect(listSkills).toHaveBeenCalledTimes(5);
  });

  it.each(['resolve', 'reject'] as const)('ignores a stale next page that later %ss after a search', async (settle) => {
    const stale = deferredPage();
    listSkills.mockImplementation(async (options = {}) => {
      if (options.keyword === 'new') return page(skills.slice(-1));
      if (options.page === 2) return stale.promise;
      return page();
    });
    renderModal();
    const input = openSkills();
    await screen.findByTitle('Example skill 19');
    scrollSkills();
    fireEvent.change(input, { target: { value: 'new' } });
    await screen.findByTitle('find-skill-skillhub');

    await act(async () => {
      if (settle === 'resolve') stale.resolve(page(skills, 2));
      else stale.reject(new Error('outdated request'));
    });
    expect(screen.getByTitle('find-skill-skillhub')).toBeInTheDocument();
    expect(screen.queryByTitle('Example skill 0')).not.toBeInTheDocument();
    expect(screen.queryByTitle('Example skill 20')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listSkills).toHaveBeenCalledTimes(3);
  });

  it.each([1, 2])('retries failed page %i without losing earlier results or restarting the search', async (failedPage) => {
    let fail = true;
    listSkills.mockImplementation(async (options = {}) => {
      if (!options.keyword) return page([]);
      if (options.page === failedPage && fail) throw new Error('private upstream error');
      return page(skills, options.page, options.pageSize);
    });
    renderModal();
    const input = openSkills();
    fireEvent.change(input, { target: { value: 'skill' } });
    if (failedPage === 2) {
      await screen.findByTitle('Example skill 19');
      scrollSkills();
    }
    expect(await screen.findByRole('alert')).toHaveTextContent('selfEvolutionRun.newWorkflowSkillLoadFailed');
    expect(screen.queryByText('private upstream error')).not.toBeInTheDocument();
    if (failedPage === 2) expect(screen.getByTitle('Example skill 0')).toBeInTheDocument();
    const callsBeforeRetry = listSkills.mock.calls.length;

    fail = false;
    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    await screen.findByTitle(`Example skill ${failedPage * 20 - 1}`);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(listSkills).toHaveBeenCalledTimes(callsBeforeRetry + 1);
    expect(listSkills).toHaveBeenLastCalledWith({ keyword: 'skill', page: failedPage, pageSize: 20 });
  });

  it('deduplicates overlapping pages by skill id', async () => {
    listSkills.mockResolvedValueOnce(page()).mockResolvedValueOnce({
      ...page(), records: [skills[19], ...skills.slice(20, 39)], total: 40, page: 2,
    });
    renderModal();
    openSkills();
    await screen.findByTitle('Example skill 19');
    scrollSkills();
    await screen.findByTitle('Example skill 38');
    expect(screen.getAllByTitle('Example skill 19')).toHaveLength(1);
    expect(screen.getAllByRole('option')).toHaveLength(39);
    scrollSkills();
    expect(listSkills).toHaveBeenCalledTimes(2);
  });

  it('shows an empty result without requesting another page', async () => {
    listSkills.mockResolvedValue(page([]));
    renderModal();
    openSkills();
    await screen.findByText('common.noData');
    expect(listSkills).toHaveBeenCalledTimes(1);
  });

  it.each(['close', 'mode'] as const)('ignores pending pages after a %s change and reloads from page one', async (change) => {
    const pending = deferredPage();
    listSkills.mockResolvedValueOnce(page()).mockReturnValueOnce(pending.promise);
    const view = renderModal();
    openSkills();
    await screen.findByTitle('Example skill 19');
    scrollSkills();
    if (change === 'close') view.setOpen(false);
    else fireEvent.click(screen.getByRole('button', { name: /newWorkflowModeAiTitle/ }));

    await act(async () => pending.resolve(page(skills, 2)));
    expect(listSkills).toHaveBeenCalledTimes(2);

    view.setOpen(true);
    openSkills();
    await screen.findByTitle('Example skill 19');
    expect(screen.queryByTitle('Example skill 20')).not.toBeInTheDocument();
    expect(listSkills).toHaveBeenLastCalledWith({ keyword: '', page: 1, pageSize: 20 });
    expect(listSkills).toHaveBeenCalledTimes(3);
  });
});
