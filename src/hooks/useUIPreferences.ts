import { useState, useCallback, useEffect } from 'react';
import { UIPreferences, ColumnWidth } from '@/types';

const UI_PREFS_KEY = 'stuff_organizer_ui_prefs';

const defaultPreferences: UIPreferences = {
  columnWidths: [
    { key: 'name', width: 280 },
    { key: 'year', width: 70 },
    { key: 'rating', width: 70 },
    { key: 'genres', width: 180 },
    { key: 'addedDate', width: 140 },
    { key: 'path', width: 250 },
  ],
  detailPanelHeight: 280,
  detailPanelVisible: true,
};

export const useUIPreferences = () => {
  const [preferences, setPreferences] = useState<UIPreferences>(() => {
    const stored = localStorage.getItem(UI_PREFS_KEY);
    if (stored) {
      try {
        return { ...defaultPreferences, ...JSON.parse(stored) };
      } catch {
        return defaultPreferences;
      }
    }
    return defaultPreferences;
  });

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(preferences));
  }, [preferences]);

  const setColumnWidth = useCallback((key: string, width: number) => {
    setPreferences(prev => ({
      ...prev,
      columnWidths: prev.columnWidths.map(c =>
        c.key === key ? { ...c, width } : c
      ),
    }));
  }, []);

  const getColumnWidth = useCallback((key: string): number => {
    const col = preferences.columnWidths.find(c => c.key === key);
    return col?.width || 100;
  }, [preferences.columnWidths]);

  const setDetailPanelHeight = useCallback((height: number) => {
    setPreferences(prev => ({
      ...prev,
      detailPanelHeight: Math.max(100, Math.min(500, height)),
    }));
  }, []);

  const setDetailPanelVisible = useCallback((visible: boolean) => {
    setPreferences(prev => ({
      ...prev,
      detailPanelVisible: visible,
    }));
  }, []);

  const toggleDetailPanel = useCallback(() => {
    setPreferences(prev => ({
      ...prev,
      detailPanelVisible: !prev.detailPanelVisible,
    }));
  }, []);

  return {
    preferences,
    setColumnWidth,
    getColumnWidth,
    setDetailPanelHeight,
    setDetailPanelVisible,
    toggleDetailPanel,
  };
};
