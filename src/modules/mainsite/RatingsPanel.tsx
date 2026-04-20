/*
 * Copyright (C) 2026 Leonardo Cardozo Vargas
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * RatingsPanel — Painel administrador de moderação de avaliações (Estrelas + Reações).
 * Exibe métricas agregadas, lista filtrada por post/rating/reação,
 * permite edição (rating + reaction_type) e exclusão individual/em lote.
 * Opera via CRUD no D1 (mainsite_ratings) através do admin-motor.
 */

import {
  BarChart3,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  Filter,
  Heart,
  HelpCircle,
  Lightbulb,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

// ── Tipos ───────────────────────────────────────────────────────────────────

interface RatingRecord {
  id: number;
  post_id: number;
  rating: number;
  voter_hash: string;
  reaction_type: string | null;
  created_at: string;
  post_title?: string;
}

interface RatingsStats {
  total: number;
  avgRating: number;
  distribution: Record<number, number>;
  reactions: {
    total: number;
    love: number;
    insightful: number;
    'thought-provoking': number;
    inspiring: number;
    beautiful: number;
  };
}

interface RatingsPanelProps {
  showNotification: (message: string, type: 'success' | 'error' | 'info') => void;
}

// ── Mapa de reações para exibição ───────────────────────────────────────────

const REACTION_MAP: Record<string, { emoji: string; label: string; icon: typeof Heart }> = {
  love: { emoji: '❤️', label: 'Amei', icon: Heart },
  insightful: { emoji: '💡', label: 'Perspicaz', icon: Lightbulb },
  'thought-provoking': { emoji: '🤔', label: 'Reflexivo', icon: HelpCircle },
  inspiring: { emoji: '✨', label: 'Inspirador', icon: Sparkles },
  beautiful: { emoji: '📚', label: 'Belo', icon: BookOpen },
};

const REACTION_OPTIONS = [
  { value: '', label: 'Nenhuma' },
  { value: 'love', label: '❤️ Amei' },
  { value: 'insightful', label: '💡 Perspicaz' },
  { value: 'thought-provoking', label: '🤔 Reflexivo' },
  { value: 'inspiring', label: '✨ Inspirador' },
  { value: 'beautiful', label: '📚 Belo' },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Mascara voter_hash para exibição: 4 chars iniciais + 4 finais */
function maskHash(hash: string): string {
  if (!hash || hash.length < 12) return hash;
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

/** Renderiza estrelas visuais ★☆ para um valor de 1-5 */
function StarDisplay({ value }: { value: number }) {
  return (
    <span style={{ letterSpacing: '1px', fontSize: '14px' }} title={`${value}/5`}>
      {(['s0', 's1', 's2', 's3', 's4'] as const).map((slot, position) => (
        <Star
          key={slot}
          size={14}
          fill={position < value ? '#f59e0b' : 'none'}
          stroke={position < value ? '#f59e0b' : 'rgba(128,128,128,0.3)'}
          style={{ verticalAlign: '-2px' }}
        />
      ))}
    </span>
  );
}

/** Formata data UTC para pt-BR / SP */
function formatDate(raw: string | null): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return raw;
  }
}

// ── Componente principal ────────────────────────────────────────────────────

export function RatingsPanel({ showNotification }: RatingsPanelProps) {
  const [ratings, setRatings] = useState<RatingRecord[]>([]);
  const [stats, setStats] = useState<RatingsStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editReaction, setEditReaction] = useState('');
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  const [bulkAction, setBulkAction] = useState(false);

  // Filtros
  const [filterRating, setFilterRating] = useState('');
  const [filterReaction, setFilterReaction] = useState('');
  const [filterPostId, setFilterPostId] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // ── Fetch ratings ──────────────────────────────────────────────────

  const fetchRatings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterRating) params.set('rating', filterRating);
      if (filterReaction) params.set('reaction_type', filterReaction);
      if (filterPostId) params.set('post_id', filterPostId);
      params.set('limit', '200');

      const res = await fetch(`/api/mainsite/ratings/admin/all?${params.toString()}`);
      if (!res.ok) throw new Error('Erro ao carregar');
      const data = (await res.json()) as { ratings: RatingRecord[]; stats: RatingsStats };
      setRatings(data.ratings || []);
      setStats(data.stats || null);
      setSelectedIds(new Set());
    } catch {
      showNotification('Falha ao carregar avaliações.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showNotification, filterRating, filterReaction, filterPostId]);

  useEffect(() => {
    void fetchRatings();
  }, [fetchRatings]);

  // ── Actions ────────────────────────────────────────────────────────

  const handleDelete = async (id: number) => {
    setActionInProgress(id);
    try {
      const res = await fetch(`/api/mainsite/ratings/admin/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha');
      showNotification('Avaliação excluída.', 'success');
      await fetchRatings();
    } catch {
      showNotification('Erro ao excluir.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleUpdate = async (id: number) => {
    setActionInProgress(id);
    try {
      const body: Record<string, unknown> = { rating: editRating };
      body.reaction_type = editReaction || null;
      const res = await fetch(`/api/mainsite/ratings/admin/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Falha');
      showNotification('Avaliação atualizada.', 'success');
      setEditingId(null);
      await fetchRatings();
    } catch {
      showNotification('Erro ao atualizar.', 'error');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkAction(true);
    try {
      const res = await fetch('/api/mainsite/ratings/admin/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds), action: 'delete' }),
      });
      if (!res.ok) throw new Error('Falha');
      showNotification(`${selectedIds.size} avaliação(ões) excluída(s).`, 'success');
      await fetchRatings();
    } catch {
      showNotification('Erro na exclusão em lote.', 'error');
    } finally {
      setBulkAction(false);
    }
  };

  const startEdit = (record: RatingRecord) => {
    setEditingId(record.id);
    setEditRating(record.rating);
    setEditReaction(record.reaction_type || '');
  };

  // ── Helpers ────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === ratings.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(ratings.map((r) => r.id)));
  };

  const clearFilters = () => {
    setFilterRating('');
    setFilterReaction('');
    setFilterPostId('');
  };

  const hasActiveFilters = filterRating || filterReaction || filterPostId;

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <div className="result-card" style={{ marginTop: '16px' }}>
      <div className="result-toolbar">
        <div>
          <h4>
            <Star size={16} /> Moderação de Avaliações
            {stats && stats.total > 0 && (
              <span className="badge badge-em-implantacao" style={{ marginLeft: '8px' }}>
                {stats.total} voto{stats.total !== 1 ? 's' : ''}
              </span>
            )}
          </h4>
          <p className="field-hint">Visualize, edite ou exclua avaliações e reações dos leitores.</p>
        </div>
        <div className="inline-actions">
          <button type="button" className="ghost-button" onClick={() => setShowFilters((s) => !s)} title="Filtros">
            <Filter size={16} />
            {showFilters ? 'Ocultar Filtros' : 'Filtros'}
          </button>
          <button type="button" className="ghost-button" onClick={() => void fetchRatings()} disabled={loading}>
            {loading ? <Loader2 size={16} className="spin" /> : <RefreshCw size={16} />}
            Atualizar
          </button>
        </div>
      </div>

      {/* ── Stats / Métricas ── */}
      {stats && stats.total > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '10px',
            marginBottom: '14px',
          }}
        >
          {/* Média geral */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(245,158,11,0.06)',
              border: '1px solid rgba(245,158,11,0.12)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#f59e0b', lineHeight: 1 }}>{stats.avgRating}</div>
            <StarDisplay value={Math.round(stats.avgRating)} />
            <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '4px' }}>Média geral ({stats.total} votos)</div>
          </div>

          {/* Distribuição por estrela */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(66,133,244,0.04)',
              border: '1px solid rgba(66,133,244,0.08)',
            }}
          >
            <div
              style={{
                fontSize: '11px',
                fontWeight: 600,
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <BarChart3 size={12} /> Distribuição
            </div>
            {[5, 4, 3, 2, 1].map((s) => {
              const count = stats.distribution[s] || 0;
              const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                  <span style={{ fontSize: '11px', minWidth: '14px', textAlign: 'right', fontWeight: 600 }}>{s}★</span>
                  <div
                    style={{
                      flex: 1,
                      height: '8px',
                      borderRadius: '4px',
                      background: 'rgba(128,128,128,0.08)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${pct}%`,
                        height: '100%',
                        borderRadius: '4px',
                        background: s >= 4 ? '#34a853' : s === 3 ? '#f59e0b' : '#ea4335',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                  <span style={{ fontSize: '10px', minWidth: '22px', opacity: 0.5 }}>{count}</span>
                </div>
              );
            })}
          </div>

          {/* Reações */}
          <div
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: 'rgba(234,67,53,0.04)',
              border: '1px solid rgba(234,67,53,0.08)',
            }}
          >
            <div style={{ fontSize: '11px', fontWeight: 600, marginBottom: '8px' }}>
              Reações ({stats.reactions.total})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {Object.entries(REACTION_MAP).map(([key, { emoji, label }]) => {
                const count = stats.reactions[key as keyof typeof stats.reactions] || 0;
                if (count === 0) return null;
                return (
                  <span
                    key={key}
                    style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      background: 'rgba(128,128,128,0.06)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    {emoji} <strong>{count}</strong>
                    <span style={{ opacity: 0.5, fontSize: '10px' }}>{label}</span>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      {showFilters && (
        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(66,133,244,0.03)',
            border: '1px solid rgba(66,133,244,0.08)',
            marginBottom: '12px',
          }}
        >
          <div className="field-group" style={{ margin: 0, flex: '0 0 auto' }}>
            <label htmlFor="ratings-filter-post" style={{ fontSize: '11px', fontWeight: 600 }}>
              Post ID
            </label>
            <input
              id="ratings-filter-post"
              type="number"
              min="1"
              value={filterPostId}
              onChange={(e) => setFilterPostId(e.target.value)}
              placeholder="Todos"
              style={{ width: '80px' }}
            />
          </div>
          <div className="field-group" style={{ margin: 0, flex: '0 0 auto' }}>
            <label htmlFor="ratings-filter-stars" style={{ fontSize: '11px', fontWeight: 600 }}>
              Estrelas
            </label>
            <select
              id="ratings-filter-stars"
              value={filterRating}
              onChange={(e) => setFilterRating(e.target.value)}
              style={{ width: '90px' }}
            >
              <option value="">Todas</option>
              {[5, 4, 3, 2, 1].map((s) => (
                <option key={s} value={s}>
                  {s} ★
                </option>
              ))}
            </select>
          </div>
          <div className="field-group" style={{ margin: 0, flex: '0 0 auto' }}>
            <label htmlFor="ratings-filter-reaction" style={{ fontSize: '11px', fontWeight: 600 }}>
              Reação
            </label>
            <select
              id="ratings-filter-reaction"
              value={filterReaction}
              onChange={(e) => setFilterReaction(e.target.value)}
              style={{ width: '130px' }}
            >
              <option value="">Todas</option>
              <option value="none">Sem reação</option>
              {Object.entries(REACTION_MAP).map(([key, { emoji, label }]) => (
                <option key={key} value={key}>
                  {emoji} {label}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              className="ghost-button"
              onClick={clearFilters}
              style={{ fontSize: '11px', padding: '4px 8px' }}
            >
              <X size={12} /> Limpar
            </button>
          )}
        </div>
      )}

      {/* ── Ações em lote ── */}
      {selectedIds.size > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 12px',
            borderRadius: '8px',
            background: 'rgba(234,67,53,0.06)',
            marginBottom: '12px',
            fontSize: '13px',
            flexWrap: 'wrap',
          }}
        >
          <strong>{selectedIds.size} selecionada(s)</strong>
          <button
            type="button"
            className="ghost-button"
            onClick={() => void handleBulkDelete()}
            disabled={bulkAction}
            style={{ color: 'var(--color-danger, #ea4335)' }}
          >
            <Trash2 size={14} /> Excluir Selecionadas
          </button>
          {bulkAction && <Loader2 size={14} className="spin" />}
        </div>
      )}

      {/* ── Lista de avaliações ── */}
      {loading ? (
        <div className="module-loading">
          <Loader2 size={20} className="spin" />
        </div>
      ) : ratings.length === 0 ? (
        <p className="result-empty">
          {hasActiveFilters
            ? 'Nenhuma avaliação encontrada com os filtros aplicados.'
            : 'Nenhuma avaliação registrada até o momento.'}
        </p>
      ) : (
        <ul className="result-list astro-akashico-scroll" style={{ maxHeight: '500px', overflowY: 'auto' }}>
          {/* Selecionar todos */}
          <li style={{ padding: 0, opacity: 0.6 }}>
            <button
              type="button"
              style={{
                all: 'unset',
                width: '100%',
                padding: '6px 12px',
                fontSize: '12px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxSizing: 'border-box',
              }}
              onClick={toggleSelectAll}
            >
              <input
                type="checkbox"
                checked={selectedIds.size === ratings.length && ratings.length > 0}
                readOnly
                style={{ marginRight: '8px' }}
              />
              Selecionar todas ({ratings.length})
            </button>
          </li>

          {ratings.map((record) => {
            const isExpanded = expandedId === record.id;
            const isEditing = editingId === record.id;
            const isBusy = actionInProgress === record.id;
            const isSelected = selectedIds.has(record.id);
            const reaction = record.reaction_type ? REACTION_MAP[record.reaction_type] : null;

            return (
              <li
                key={record.id}
                className={`post-row ${isSelected ? 'post-row--selected' : ''}`}
                style={{ flexDirection: 'column', alignItems: 'stretch' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(record.id)}
                    style={{ marginTop: '4px', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* Cabeçalho */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        flexWrap: 'wrap',
                        marginBottom: '4px',
                      }}
                    >
                      <StarDisplay value={record.rating} />
                      {reaction && (
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '10px',
                            fontSize: '12px',
                            background: 'rgba(128,128,128,0.06)',
                          }}
                        >
                          {reaction.emoji} {reaction.label}
                        </span>
                      )}
                      <span style={{ fontSize: '11px', opacity: 0.4, marginLeft: 'auto' }}>
                        {formatDate(record.created_at)}
                      </span>
                    </div>

                    {/* Post title */}
                    <div style={{ fontSize: '12px', opacity: 0.6, marginBottom: '4px' }}>
                      em <em>{record.post_title || `Post #${record.post_id}`}</em>
                    </div>

                    {/* Ações */}
                    <div
                      style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap', alignItems: 'center' }}
                    >
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => setExpandedId(isExpanded ? null : record.id)}
                        style={{ fontSize: '11px', padding: '2px 8px' }}
                      >
                        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        {isExpanded ? 'Menos' : 'Detalhes'}
                      </button>

                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => startEdit(record)}
                        disabled={isBusy}
                        style={{ fontSize: '11px', padding: '2px 8px', color: 'var(--color-primary, #4285f4)' }}
                      >
                        <Pencil size={12} /> Editar
                      </button>

                      <button
                        type="button"
                        className="ghost-button"
                        onClick={() => void handleDelete(record.id)}
                        disabled={isBusy}
                        style={{ color: 'var(--color-danger, #ea4335)', fontSize: '11px', padding: '2px 8px' }}
                      >
                        {isBusy ? <Loader2 size={12} className="spin" /> : <Trash2 size={12} />} Excluir
                      </button>
                    </div>

                    {/* Detalhes expandidos */}
                    {isExpanded && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '10px',
                          borderRadius: '8px',
                          background: 'rgba(128,128,128,0.06)',
                          fontSize: '12px',
                        }}
                      >
                        <div style={{ marginBottom: '4px' }}>
                          <strong>ID:</strong> {record.id}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Post ID:</strong> {record.post_id}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Rating:</strong> {record.rating}/5
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Reação:</strong> {reaction ? `${reaction.emoji} ${reaction.label}` : '—'}
                        </div>
                        <div style={{ marginBottom: '4px' }}>
                          <strong>Voter Hash:</strong>{' '}
                          <code
                            style={{
                              fontSize: '11px',
                              padding: '2px 4px',
                              borderRadius: '4px',
                              background: 'rgba(128,128,128,0.08)',
                            }}
                          >
                            {maskHash(record.voter_hash)}
                          </code>
                        </div>
                        <div>
                          <strong>Data:</strong> {formatDate(record.created_at)}
                        </div>
                      </div>
                    )}

                    {/* Modal de edição inline */}
                    {isEditing && (
                      <div
                        style={{
                          marginTop: '10px',
                          padding: '14px',
                          borderRadius: '10px',
                          background: 'rgba(66,133,244,0.04)',
                          border: '1px solid rgba(66,133,244,0.12)',
                        }}
                      >
                        <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '10px' }}>
                          Editar Avaliação #{record.id}
                        </div>

                        {/* Rating */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                          {/* biome-ignore lint/a11y/noLabelWithoutControl: display-only group heading (rating is a button group, not a form control) */}
                          <label style={{ fontSize: '12px', fontWeight: 500, minWidth: '60px' }}>Estrelas:</label>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {[1, 2, 3, 4, 5].map((s) => (
                              <button
                                key={s}
                                type="button"
                                onClick={() => setEditRating(s)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  cursor: 'pointer',
                                  padding: '2px',
                                  transition: 'transform 0.15s',
                                  transform: editRating >= s ? 'scale(1.1)' : 'scale(1)',
                                }}
                              >
                                <Star
                                  size={20}
                                  fill={editRating >= s ? '#f59e0b' : 'none'}
                                  stroke={editRating >= s ? '#f59e0b' : 'rgba(128,128,128,0.3)'}
                                />
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Reaction */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                          <label
                            htmlFor={`edit-reaction-${record.id}`}
                            style={{ fontSize: '12px', fontWeight: 500, minWidth: '60px' }}
                          >
                            Reação:
                          </label>
                          <select
                            id={`edit-reaction-${record.id}`}
                            value={editReaction}
                            onChange={(e) => setEditReaction(e.target.value)}
                            style={{ flex: 1, maxWidth: '200px' }}
                          >
                            {REACTION_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Botões */}
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            type="button"
                            className="primary-button"
                            onClick={() => void handleUpdate(record.id)}
                            disabled={isBusy}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            {isBusy ? <Loader2 size={12} className="spin" /> : <Check size={12} />}
                            Salvar
                          </button>
                          <button
                            type="button"
                            className="ghost-button"
                            onClick={() => setEditingId(null)}
                            style={{ fontSize: '12px', padding: '6px 14px' }}
                          >
                            <X size={12} /> Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
