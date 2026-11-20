import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { $getRoot, type LexicalEditor } from 'lexical';
import i18n from '@/i18n';
import { useWorkflowStore, type SlotRevision } from '@/modules/chat/store/workflowPanel';
import { SlotRenderer } from './SlotComponents';
import { DocumentActionScope } from './DocumentActions';
import { SlotEditingContext } from './slotEditingContext';

const capture = vi.hoisted(() => ({ editor: null as LexicalEditor | null, importError: '' }));
vi.mock('./FilePreviewDrawer', () => ({ FilePreviewDrawer: () => null }));
vi.mock('@mdxeditor/editor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mdxeditor/editor')>();
  const React = await import('react');
  const capturePlugin = actual.realmPlugin({ init(realm) {
    realm.pub(actual.createRootEditorSubscription$, editor => { capture.editor = editor; return () => {}; });
  } });
  return { ...actual, MDXEditor: React.forwardRef<import('@mdxeditor/editor').MDXEditorMethods, import('@mdxeditor/editor').MDXEditorProps>(
    (props, ref) => <actual.MDXEditor {...props} ref={ref} plugins={[...(props.plugins ?? []), capturePlugin()]}
      onError={(error: { error: string; source: string }) => { capture.importError = error.error; props.onError?.(error); }} />,
  ) };
});

const prompt = [
  '<!-- ppt-page-prompt:v1 -->', '',
  '## 风格', '浅色背景', '',
  '### 共享视觉规范', '', '- **底色**：`#070A12`', '',
  '## 布局', 'HTML 示例 <i>/<sub>/<sup>，参数 {"color":"#FFFFFF"}。', '',
  '```html', '<!-- ppt-material-images: ["example"] -->', '<div style="color: red">示例</div>', '```', '',
  '## 页面正文', '**标题**：原始标题', '',
  '## 页面素材', '<!-- ppt-material-images: ["image-revision-1"] -->', '',
  '保留素材说明。',
].join('\n');
const slot: SlotRevision = {
  slot_id: 'slide_outline', slot: 'slide_outline', selected: true,
  revision: 3, draft_version: 2, list_index: 1, content_type: 'text',
  created_at: '', artifact_value: { text: prompt },
};

beforeEach(async () => {
  await i18n.changeLanguage('zh-CN');
  capture.editor = null;
  capture.importError = '';
});
afterEach(cleanup);

it('renders formatted PPT prompts on open and preserves the source when saving edits', async () => {
  const patchSlotItemValue = vi.fn().mockResolvedValue(3);
  useWorkflowStore.setState({ patchSlotItemValue });
  let flush: (() => Promise<boolean>) | undefined;
  const view = render(<SlotEditingContext.Provider value={{ setEditing: vi.fn(), registerFooterAction: () => () => {},
    registerFlush: (_key, callback) => { flush = callback; return () => {}; },
  }}><DocumentActionScope inline label='每页设计稿'>
    <SlotRenderer slot={slot} sessionId='ppt-editor' widget={{ widgetType: 'ppt-prompt', maxHeight: 420 }} />
  </DocumentActionScope></SlotEditingContext.Provider>);

  expect(capture.importError).toBe('');
  expect(await screen.findByRole('heading', { level: 2, name: '风格' })).toBeVisible();
  expect(screen.getByRole('heading', { level: 3, name: '共享视觉规范' })).toBeVisible();
  expect(screen.getByRole('listitem')).toHaveTextContent('底色');
  expect(view.container.querySelector('li strong')).toHaveTextContent('底色');
  expect(view.container.querySelector('[data-writer-color]')).toHaveTextContent('#070A12');
  expect(screen.getAllByText('每页设计稿')).toHaveLength(1);
  expect(view.container).not.toHaveTextContent('image-revision-1');
  expect(view.container.querySelector('[contenteditable="true"]')).toBeInTheDocument();
  expect(view.container.querySelector('.workflow-slot__text-editor')).toBeNull();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await act(async () => { expect(await flush!()).toBe(true); });
  expect(patchSlotItemValue).not.toHaveBeenCalled();

  await act(async () => capture.editor!.update(() => {
    const node = $getRoot().getAllTextNodes().find(node => node.getTextContent() === '浅色背景');
    if (!node) throw new Error('Editable prompt paragraph missing');
    node.setTextContent('深色背景');
  }));
  await act(async () => { expect(await flush!()).toBe(true); });
  expect(patchSlotItemValue).toHaveBeenCalledTimes(1);
  const saved = patchSlotItemValue.mock.calls[0][3].text as string;
  expect(saved).toBe(prompt.replace('浅色背景', '深色背景'));
  expect(patchSlotItemValue).toHaveBeenCalledWith('ppt-editor', 'slide_outline', 1, { text: saved }, 'text', 'checkpoint', 3, 2);
  await act(async () => capture.editor!.update(() => {
    const node = $getRoot().getAllTextNodes().find(node => node.getTextContent() === '深色背景');
    if (!node) throw new Error('Saved prompt paragraph missing');
    node.setTextContent('渐变背景');
  }));
  await act(async () => { expect(await flush!()).toBe(true); });
  expect(patchSlotItemValue.mock.calls[1][3].text).toBe(prompt.replace('浅色背景', '渐变背景'));
});

it('keeps the formatted document when editing permission is removed', async () => {
  const view = render(<SlotRenderer slot={slot} sessionId='ppt-editor' widget={{ widgetType: 'ppt-prompt' }} />);
  expect(await screen.findByRole('textbox', { name: 'editable markdown' })).toBeInTheDocument();
  view.rerender(<SlotRenderer slot={slot} sessionId='ppt-editor' readOnly widget={{ widgetType: 'ppt-prompt' }} />);
  expect(view.container.querySelector('[contenteditable="true"], .workflow-slot__text-editor')).toBeNull();
  expect(screen.getByRole('heading', { name: '共享视觉规范' })).toBeVisible();
});

it.each(['panel', 'widget', 'unselected', 'descriptor', 'save-capability'] as const)('formats PPT prompts with %s read-only permissions', (reason) => {
  const current = { ...slot, selected: reason !== 'unselected', ...(reason === 'descriptor' ? {
    artifact_id: 'historical-prompt', document: { representation: 'markdown', editable: false, capabilities: [] },
  } : reason === 'save-capability' ? {
    artifact_id: 'historical-prompt', document: { representation: 'markdown', editable: true, capabilities: [] },
  } : {}) } as SlotRevision;
  const { container } = render(<SlotRenderer slot={current} sessionId='ppt-editor' readOnly={reason === 'panel'}
    widget={{ widgetType: 'ppt-prompt', readOnly: reason === 'widget' }} />);
  expect(screen.getByRole('heading', { name: '共享视觉规范' })).toBeVisible();
  expect(container.querySelector('[contenteditable="true"], .workflow-slot__text-editor')).toBeNull();
});

it('opens the next page in rich text and saves to its own list item', async () => {
  const patchSlotItemValue = vi.fn().mockResolvedValue(8);
  useWorkflowStore.setState({ patchSlotItemValue });
  let flush: (() => Promise<boolean>) | undefined;
  const nextText = '## 第二页\n\n第二页内容';
  const viewPage = (page: SlotRevision) => (
    <SlotEditingContext.Provider value={{ setEditing: vi.fn(), registerFooterAction: () => () => {},
      registerFlush: (_key, callback) => { flush = callback; return () => {}; },
    }}><SlotRenderer slot={page} sessionId='ppt-pages' widget={{ widgetType: 'ppt-prompt' }} /></SlotEditingContext.Provider>
  );
  const { rerender } = render(viewPage(slot));
  fireEvent.click(screen.getByText('更多操作'));
  fireEvent.click(await screen.findByRole('button', { name: '查看源码' }));
  expect(screen.getByRole('textbox', { name: '查看源码' })).toHaveValue(prompt);
  rerender(viewPage({ ...slot, list_index: 2, revision: 7, artifact_value: { text: nextText } }));
  expect(await screen.findByRole('heading', { name: '第二页' })).toBeVisible();
  expect(screen.queryByText('浅色背景')).not.toBeInTheDocument();
  expect(patchSlotItemValue).not.toHaveBeenCalled();

  await act(async () => capture.editor!.update(() => {
    const node = $getRoot().getAllTextNodes().find(node => node.getTextContent() === '第二页内容');
    if (!node) throw new Error('Second-page paragraph missing');
    node.setTextContent('第二页更新');
  }));
  await act(async () => { expect(await flush!()).toBe(true); });
  expect(patchSlotItemValue).toHaveBeenCalledTimes(1);
  expect(patchSlotItemValue).toHaveBeenCalledWith(
    'ppt-pages', 'slide_outline', 2, { text: nextText.replace('第二页内容', '第二页更新') }, 'text', 'checkpoint', 7, 2,
  );
});
