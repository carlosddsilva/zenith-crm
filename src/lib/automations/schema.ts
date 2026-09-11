import { z } from 'zod';
import {
  AutomationActionType,
  AutomationConditionOperator,
  AutomationStatus,
  AutomationTriggerType,
} from '@/types';

// Arrays for Zod enum checks
const TRIGGER_TYPES: [AutomationTriggerType, ...AutomationTriggerType[]] = [
  'contact.created',
  'deal.created',
  'deal.stage_changed',
  'deal.won',
  'deal.lost',
  'task.completed',
  'conversation.created',
  'message.received',
];

const CONDITION_OPERATORS: [AutomationConditionOperator, ...AutomationConditionOperator[]] = [
  'equals',
  'not_equals',
  'contains',
  'is_empty',
  'is_not_empty',
];

const ACTION_TYPES: [AutomationActionType, ...AutomationActionType[]] = [
  'contact.add_tag',
  'contact.remove_tag',
  'deal.move_stage',
  'task.create',
  'task.complete',
  'note.create',
  'send_message',
];

const STATUSES: [AutomationStatus, ...AutomationStatus[]] = ['draft', 'active', 'paused', 'archived'];

export const automationConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(CONDITION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const automationActionSchema = z.object({
  type: z.enum(ACTION_TYPES),
  params: z.record(z.string(), z.any()), // Validated more strictly during execution by action executors
});

export const createAutomationSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().nullable().optional(),
  status: z.enum(STATUSES).default('draft'),
  triggerType: z.enum(TRIGGER_TYPES),
  triggerConfig: z.record(z.string(), z.any()).default({}),
  conditions: z.array(automationConditionSchema).default([]),
  actions: z.array(automationActionSchema).default([]),
});

export const updateAutomationSchema = createAutomationSchema.partial();
