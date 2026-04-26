/*
 * Copyright (C) 2026 Leonardo Cardozo Vargas
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

/**
 * Sidebar nav-items ordering helper.
 *
 * Rule: PINNED_FIRST module ('overview') sempre primeiro; PINNED_LAST
 * ('config') sempre último; demais ordenados alfabeticamente por `label`
 * com `localeCompare('pt-BR', { sensitivity: 'base' })` (lida com acentos
 * como `Astrólogo` / `Oráculo`).
 *
 * Adicionar novo módulo ao array RAW_NAV_ITEMS em App.tsx em qualquer
 * posição — `sortNavItems` aplica a ordem visível em runtime.
 */

import type { ComponentType } from 'react';
import type { ModuleId } from '../moduleId';

export type NavItem = {
  id: ModuleId;
  label: string;
  icon: ComponentType<{ size?: number }>;
};

export const PINNED_FIRST: ModuleId = 'overview';
export const PINNED_LAST: ModuleId = 'config';

export function sortNavItems(items: NavItem[]): NavItem[] {
  const first = items.find((i) => i.id === PINNED_FIRST);
  const last = items.find((i) => i.id === PINNED_LAST);
  const middle = items
    .filter((i) => i.id !== PINNED_FIRST && i.id !== PINNED_LAST)
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
  const result: NavItem[] = [];
  if (first) result.push(first);
  result.push(...middle);
  if (last) result.push(last);
  return result;
}
