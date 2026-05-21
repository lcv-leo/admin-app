/*
 * Copyright © 2026 LCV Ideas & Software
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Helpers para os workflows assíncronos do Cloudflare Registrar
 * (registration-status / update-status).
 */

export type RegistrarWorkflowCategory =
  | 'pending'
  | 'in_progress'
  | 'action_required'
  | 'blocked'
  | 'succeeded'
  | 'failed'
  | 'unknown';

const KNOWN_WORKFLOW_STATES: Record<string, RegistrarWorkflowCategory> = {
  pending: 'pending',
  in_progress: 'in_progress',
  action_required: 'action_required',
  blocked: 'blocked',
  succeeded: 'succeeded',
  failed: 'failed',
};

/** Normaliza o `state` cru do workflow para uma categoria conhecida. */
export const classifyRegistrarWorkflowState = (state?: string | null): RegistrarWorkflowCategory => {
  const normalized = String(state ?? '')
    .trim()
    .toLowerCase();
  return KNOWN_WORKFLOW_STATES[normalized] ?? 'unknown';
};

/**
 * "Agent best practice" da documentação oficial: continuar o polling apenas
 * enquanto o workflow está `pending` ou `in_progress`. Parar em qualquer outro
 * estado — terminais (`succeeded`/`failed`), `action_required` (depende do
 * usuário), `blocked` (depende de terceiro) e estados desconhecidos.
 */
export const shouldStopRegistrarPolling = (state?: string | null): boolean => {
  const category = classifyRegistrarWorkflowState(state);
  return category !== 'pending' && category !== 'in_progress';
};

/**
 * Extrai a instrução de ação do usuário publicada em `context.action` quando o
 * workflow está em `action_required`. Retorna string vazia quando ausente.
 */
export const extractRegistrarWorkflowAction = (context?: Record<string, unknown> | null): string => {
  if (!context || typeof context !== 'object') {
    return '';
  }
  const action = (context as { action?: unknown }).action;
  return typeof action === 'string' ? action.trim() : '';
};
