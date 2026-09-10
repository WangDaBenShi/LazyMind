import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Input, Button, Select, Tooltip, message } from 'antd';
import { FileTextOutlined, ThunderboltOutlined, BulbOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import { useTranslation } from 'react-i18next';
import { createWorkflowDraft, aiGenerateWorkflowDraft, updateWorkflowDraftContent, deleteWorkflowDraft } from '../../workflowDraftApi';
import { listSkillAssetsPage } from '@/modules/memory/skillApi';
import { serializeWorkflowModel } from '../StateGraphEditor/core/workflowSerializer';
import { createEmptyWorkflowModel } from '../StateGraphEditor/core/workflowModel';
import './index.scss';

const WORKFLOW_ID_REGEX = /^[a-zA-Z][a-zA-Z0-9-_]*$/;
const SKILL_PAGE_SIZE = 20;

type CreateMode = 'blank' | 'ai' | 'skill';

interface NewWorkflowModalProps {
  open: boolean;
  onCancel: () => void;
  onCreated: (draftId: string) => void;
}

export default function NewWorkflowModal({ open, onCancel, onCreated }: NewWorkflowModalProps) {
  const { t } = useTranslation();

  const MODE_CARDS: { mode: CreateMode; icon: React.ReactNode; title: string; desc: string; badge?: string }[] = [
    {
      mode: 'ai',
      icon: <BulbOutlined />,
      title: t('selfEvolutionRun.newWorkflowModeAiTitle'),
      desc: t('selfEvolutionRun.newWorkflowModeAiDesc'),
    },
    {
      mode: 'skill',
      icon: <ThunderboltOutlined />,
      title: t('selfEvolutionRun.newWorkflowModeSkillTitle'),
      desc: t('selfEvolutionRun.newWorkflowModeSkillDesc'),
    },
    {
      mode: 'blank',
      icon: <FileTextOutlined />,
      title: t('selfEvolutionRun.newWorkflowModeBlankTitle'),
      desc: t('selfEvolutionRun.newWorkflowModeBlankDesc'),
      badge: t('selfEvolutionRun.newWorkflowModeBlankBadge'),
    },
  ];
  const [mode, setMode] = useState<CreateMode>('ai');

  // skill mode: selected skill
  const [skillId, setSkillId] = useState<string | undefined>(undefined);
  const [skillName, setSkillName] = useState('');
  const [skillOptions, setSkillOptions] = useState<{ label: string; value: string }[]>([]);
  const [skillLoading, setSkillLoading] = useState(false);
  const [skillLoadFailed, setSkillLoadFailed] = useState(false);
  const skillRequestId = useRef(0);
  const skillPagination = useRef({ keyword: '', nextPage: 1, hasMore: true, loading: false });

  // fields shown after skill is selected (or always for ai/blank)
  const [workflowId, setWorkflowId] = useState('');
  const [idError, setIdError] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const [creating, setCreating] = useState(false);

  // For skill mode: fields appear only after skill is chosen
  const skillSelected = mode === 'skill' && !!skillId;
  const showFields = mode === 'ai' || mode === 'blank' || skillSelected;

  const reset = () => {
    setMode('ai');
    setSkillId(undefined);
    setSkillName('');
    setSkillOptions([]);
    setWorkflowId('');
    setIdError('');
    setName('');
    setDescription('');
  };

  // When a skill is selected, auto-fill workflowId with a slugified skill name
  useEffect(() => {
    if (skillId && skillName) {
      const slug = skillName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48);
      setWorkflowId(slug || '');
      setIdError('');
    }
  }, [skillId, skillName]);

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const loadSkillPage = useCallback(async (keyword?: string) => {
    const resetSearch = keyword !== undefined;
    if (!resetSearch && (skillPagination.current.loading || !skillPagination.current.hasMore)) return;

    const requestId = ++skillRequestId.current;
    const pagination = resetSearch
      ? { keyword, nextPage: 1, hasMore: true, loading: true }
      : { ...skillPagination.current, loading: true };
    skillPagination.current = pagination;
    setSkillLoading(true);
    setSkillLoadFailed(false);
    if (resetSearch) setSkillOptions([]);
    try {
      const result = await listSkillAssetsPage({
        keyword: pagination.keyword, page: pagination.nextPage, pageSize: SKILL_PAGE_SIZE,
      });
      if (requestId !== skillRequestId.current) return;
      setSkillOptions((previous) => {
        const options = new Map(previous.map((option) => [option.value, option]));
        result.records.forEach((record) => options.set(record.id, { label: record.name, value: record.id }));
        return [...options.values()];
      });
      pagination.hasMore = result.records.length > 0 && pagination.nextPage * SKILL_PAGE_SIZE < result.total;
      pagination.nextPage += 1;
    } catch {
      if (requestId === skillRequestId.current) setSkillLoadFailed(true);
    } finally {
      if (requestId === skillRequestId.current) {
        pagination.loading = false;
        setSkillLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (open && mode === 'skill') void loadSkillPage('');
    return () => { skillRequestId.current += 1; };
  }, [open, mode, loadSkillPage]);

  const handleSkillChange = (val: string, option: { label: string; value: string } | { label: string; value: string }[]) => {
    setSkillId(val);
    const opt = Array.isArray(option) ? option[0] : option;
    setSkillName(opt?.label ?? '');
  };

  const handleModeChange = (newMode: CreateMode) => {
    setMode(newMode);
    // Reset detail fields when switching mode
    setSkillId(undefined);
    setSkillName('');
    setWorkflowId('');
    setIdError('');
    setName('');
    setDescription('');
  };

  const handleCreate = async () => {
    const trimmedId = workflowId.trim();
    if (!trimmedId) {
      setIdError(t('selfEvolutionRun.newWorkflowIdErrorEmpty'));
      return;
    }
    if (!WORKFLOW_ID_REGEX.test(trimmedId)) {
      setIdError(t('selfEvolutionRun.newWorkflowIdErrorInvalid'));
      return;
    }
    if (mode === 'ai' && !description.trim()) {
      message.warning(t('selfEvolutionRun.newWorkflowDescRequired'));
      return;
    }
    if (mode === 'skill' && !skillId) {
      message.warning(t('selfEvolutionRun.newWorkflowSkillRequired'));
      return;
    }

    // Display name falls back to workflow id if empty
    const effectiveName = name.trim() || trimmedId;

    setCreating(true);
    let draftId: string | undefined;
    try {
      const draft = await createWorkflowDraft({ name: effectiveName, source_type: mode });
      draftId = draft.id;
      const pm = { ...createEmptyWorkflowModel(), id: trimmedId, name: effectiveName };
      await updateWorkflowDraftContent(draft.id, {
        workflow_yaml_content: serializeWorkflowModel(pm),
        version: draft.version,
      });
      if (mode === 'ai') {
        await aiGenerateWorkflowDraft(draft.id, { description: description.trim() });
      } else if (mode === 'skill' && skillId) {
        await aiGenerateWorkflowDraft(draft.id, { skill_id: skillId });
      }
      draftId = undefined;
      reset();
      onCreated(draft.id);
    } catch {
      if (draftId) {
        deleteWorkflowDraft(draftId).catch(() => {});
      }
    } finally {
      setCreating(false);
    }
  };

  const canCreate = showFields && workflowId.trim() !== '' && !idError;
  const skillListStatus = (skillLoading || skillLoadFailed) && (
    <div className="npm-skill-list-status" role={skillLoadFailed ? 'alert' : 'status'}>
      {skillLoadFailed ? t('selfEvolutionRun.newWorkflowSkillLoadFailed') : t('common.loading')}
      {skillLoadFailed && (
        <Button type="link" onMouseDown={(event) => event.preventDefault()} onClick={() => void loadSkillPage()}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );

  return (
    <Modal
      title={t('selfEvolutionRun.newWorkflowModalTitle')}
      open={open}
      onCancel={handleCancel}
      footer={
        <div className="npm-footer">
          <Button onClick={handleCancel}>{t('selfEvolutionRun.newWorkflowCancelBtn')}</Button>
          <Button type="primary" loading={creating} disabled={!canCreate} onClick={() => void handleCreate()}>
            {t('selfEvolutionRun.newWorkflowCreateBtn')}
          </Button>
        </div>
      }
      className="new-workflow-modal"
      width={520}
      destroyOnClose
    >
      <div className="npm-body">
        {/* Mode selector — always on top */}
        <p className="npm-section-label">{t('selfEvolutionRun.newWorkflowSelectMode')}</p>
        <div className="npm-mode-cards">
          {MODE_CARDS.map((card) => (
            <button
              key={card.mode}
              type="button"
              className={`npm-mode-card${mode === card.mode ? ' npm-mode-card--active' : ''}`}
              onClick={() => handleModeChange(card.mode)}
            >
              {card.badge && <span className="npm-mode-badge">{card.badge}</span>}
              <span className="npm-mode-icon">{card.icon}</span>
              <span className="npm-mode-title">{card.title}</span>
              <span className="npm-mode-desc">{card.desc}</span>
            </button>
          ))}
        </div>

        {/* Skill selector — shown first for skill mode, before fields */}
        {mode === 'skill' && (
          <div className="npm-expand">
            <Select
              showSearch
              aria-label={t('selfEvolutionRun.newWorkflowSkillSearchPlaceholder')}
              placeholder={t('selfEvolutionRun.newWorkflowSkillSearchPlaceholder')}
              value={skillId}
              onChange={handleSkillChange}
              onSearch={loadSkillPage}
              onPopupScroll={(event) => {
                const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
                if (!skillLoadFailed && scrollHeight - scrollTop <= clientHeight + 24) void loadSkillPage();
              }}
              loading={skillLoading}
              options={skillOptions}
              filterOption={false}
              notFoundContent={skillListStatus || t('common.noData')}
              popupRender={(menu) => (
                <>
                  {menu}
                  {skillOptions.length > 0 && skillListStatus}
                </>
              )}
              style={{ width: '100%' }}
            />
          </div>
        )}

        {/* AI description textarea */}
        {mode === 'ai' && (
          <div className="npm-expand">
            <Input.TextArea
              placeholder={t('selfEvolutionRun.newWorkflowAiPlaceholder')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              autoSize={{ minRows: 5, maxRows: 10 }}
            />
          </div>
        )}

        {/* Workflow id + name — shown after mode selection (skill: only after skill chosen) */}
        {showFields && (
          <div className="npm-fields npm-expand">
            <div className="npm-field-row">
              <div className="npm-field-label">
                {t('selfEvolutionRun.newWorkflowFieldWorkflowId')} <span className="npm-required-mark">*</span>
                <Tooltip title={t('selfEvolutionRun.newWorkflowFieldWorkflowIdTooltip')}>
                  <QuestionCircleOutlined className="npm-tip-icon" />
                </Tooltip>
              </div>
              <div className="npm-field-input">
                <Input
                  autoFocus
                  value={workflowId}
                  onChange={(e) => {
                    setWorkflowId(e.target.value);
                    setIdError(
                      e.target.value.trim() && !WORKFLOW_ID_REGEX.test(e.target.value.trim())
                        ? t('selfEvolutionRun.newWorkflowIdErrorInvalid')
                        : '',
                    );
                  }}
                  placeholder={t('selfEvolutionRun.newWorkflowFieldWorkflowIdPlaceholder')}
                  status={idError ? 'error' : undefined}
                  onPressEnter={() => void handleCreate()}
                />
                {idError && <span className="npm-field-error">{idError}</span>}
              </div>
            </div>
            <div className="npm-field-row">
              <div className="npm-field-label">
                {t('selfEvolutionRun.newWorkflowFieldDisplayName')}
                <Tooltip title={t('selfEvolutionRun.newWorkflowFieldDisplayNameTooltip')}>
                  <QuestionCircleOutlined className="npm-tip-icon" />
                </Tooltip>
              </div>
              <div className="npm-field-input">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={workflowId.trim() ? t('selfEvolutionRun.newWorkflowFieldDisplayNamePlaceholderWithId', { id: workflowId.trim() }) : t('selfEvolutionRun.newWorkflowFieldDisplayNamePlaceholder')}
                  onPressEnter={() => void handleCreate()}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
