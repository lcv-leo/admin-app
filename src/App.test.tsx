/*
 * Copyright (C) 2026 Leonardo Cardozo Vargas
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { sortNavItems } from './lib/navItems';

type Icon = React.ComponentType<{ size?: number }>;
const dummyIcon = (() => null) as unknown as Icon;

describe('sortNavItems', () => {
  it('keeps overview first and config last with middle alphabetical', () => {
    const items = [
      { id: 'oraculo' as const, label: 'Oráculo', icon: dummyIcon },
      { id: 'overview' as const, label: 'Visão Geral', icon: dummyIcon },
      { id: 'config' as const, label: 'Configurações', icon: dummyIcon },
      { id: 'astrologo' as const, label: 'Astrólogo', icon: dummyIcon },
      { id: 'calculadora' as const, label: 'Calculadora', icon: dummyIcon },
    ];
    const sorted = sortNavItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['overview', 'astrologo', 'calculadora', 'oraculo', 'config']);
  });

  it('handles accent-aware ordering (Astrólogo before Calculadora; Oráculo before Telemetria)', () => {
    const items = [
      { id: 'overview' as const, label: 'Visão Geral', icon: dummyIcon },
      { id: 'telemetria' as const, label: 'Telemetria', icon: dummyIcon },
      { id: 'oraculo' as const, label: 'Oráculo', icon: dummyIcon },
      { id: 'astrologo' as const, label: 'Astrólogo', icon: dummyIcon },
      { id: 'calculadora' as const, label: 'Calculadora', icon: dummyIcon },
      { id: 'config' as const, label: 'Configurações', icon: dummyIcon },
    ];
    const sorted = sortNavItems(items);
    const middleIds = sorted.slice(1, -1).map((i) => i.id);
    expect(middleIds).toEqual(['astrologo', 'calculadora', 'oraculo', 'telemetria']);
  });

  it('places Calculadora between Astrólogo and Card Hub (regression: post-Itaú rebrand)', () => {
    const items = [
      { id: 'overview' as const, label: 'Visão Geral', icon: dummyIcon },
      { id: 'cardhub' as const, label: 'Card Hub', icon: dummyIcon },
      { id: 'astrologo' as const, label: 'Astrólogo', icon: dummyIcon },
      { id: 'calculadora' as const, label: 'Calculadora', icon: dummyIcon },
      { id: 'config' as const, label: 'Configurações', icon: dummyIcon },
    ];
    const sorted = sortNavItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['overview', 'astrologo', 'calculadora', 'cardhub', 'config']);
  });

  it('survives missing pinned items gracefully (no overview / no config)', () => {
    const items = [
      { id: 'oraculo' as const, label: 'Oráculo', icon: dummyIcon },
      { id: 'astrologo' as const, label: 'Astrólogo', icon: dummyIcon },
    ];
    const sorted = sortNavItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['astrologo', 'oraculo']);
  });

  it('preserves icon and label per item in sorted output', () => {
    const items = [
      { id: 'overview' as const, label: 'Visão Geral', icon: dummyIcon },
      { id: 'astrologo' as const, label: 'Astrólogo', icon: dummyIcon },
      { id: 'config' as const, label: 'Configurações', icon: dummyIcon },
    ];
    const sorted = sortNavItems(items);
    expect(sorted[0]).toMatchObject({ id: 'overview', label: 'Visão Geral' });
    expect(sorted[1]).toMatchObject({ id: 'astrologo', label: 'Astrólogo' });
    expect(sorted[2]).toMatchObject({ id: 'config', label: 'Configurações' });
  });
});
