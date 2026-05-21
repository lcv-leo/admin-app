import { describe, expect, it } from 'vitest';

import {
  classifyRegistrarWorkflowState,
  extractRegistrarWorkflowAction,
  shouldStopRegistrarPolling,
} from './registrarWorkflow';

describe('registrar workflow helpers', () => {
  it('classifies known workflow states and falls back to unknown', () => {
    expect(classifyRegistrarWorkflowState('in_progress')).toBe('in_progress');
    expect(classifyRegistrarWorkflowState('SUCCEEDED')).toBe('succeeded');
    expect(classifyRegistrarWorkflowState('action_required')).toBe('action_required');
    expect(classifyRegistrarWorkflowState('blocked')).toBe('blocked');
    expect(classifyRegistrarWorkflowState(undefined)).toBe('unknown');
    expect(classifyRegistrarWorkflowState('weird-state')).toBe('unknown');
  });

  it('keeps polling only while pending or in_progress', () => {
    expect(shouldStopRegistrarPolling('pending')).toBe(false);
    expect(shouldStopRegistrarPolling('in_progress')).toBe(false);
    expect(shouldStopRegistrarPolling('succeeded')).toBe(true);
    expect(shouldStopRegistrarPolling('failed')).toBe(true);
    expect(shouldStopRegistrarPolling('action_required')).toBe(true);
    expect(shouldStopRegistrarPolling('blocked')).toBe(true);
    expect(shouldStopRegistrarPolling(undefined)).toBe(true);
  });

  it('extracts the action_required instruction from workflow context', () => {
    expect(extractRegistrarWorkflowAction({ action: 'Confirme o e-mail do registrante' })).toBe(
      'Confirme o e-mail do registrante',
    );
    expect(extractRegistrarWorkflowAction({})).toBe('');
    expect(extractRegistrarWorkflowAction(undefined)).toBe('');
    expect(extractRegistrarWorkflowAction(null)).toBe('');
  });
});
