

# Clean Minimalist UI Redesign Plan

## Overview
This plan covers a comprehensive UI/UX overhaul with a clean, minimalist dark theme inspired by Notion, Linear, and Arc browser. The changes include emoji icons for categories, resizable columns with localStorage persistence, repositioning the detail panel below the main content, and implementing a collapsible/resizable detail panel.

---

## 1. Emoji Icons for Categories

**File:** `src/components/CategoryTree.tsx`

Replace Lucide icon components with simple emoji strings for each category type:

| Category | Emoji |
|----------|-------|
| All | 📁 |
| Movies | 🎬 |
| Series | 📺 |
| Games | 🎮 |
| Music | 🎵 |
| E-books | 📚 |
| Applications | 💻 |
| Default/Folder | 📂 |

**Changes:**
- Remove Lucide icon imports (Folder, Film, Tv, etc.)
- Create emoji map instead of icon component map
- Render emoji as text span instead of icon component
- Update default categories in `database.ts` to use emoji identifiers

---

## 2. Resizable Columns with localStorage Persistence

**File:** `src/components/VirtualizedList.tsx`

The column resizing logic already exists but needs localStorage persistence:

**Changes:**
- Add localStorage key `stuff_organizer_columns`
- Load saved column widths on component mount
- Save column widths to localStorage after resize ends
- Add subtle vertical divider styling between columns

```text
Column Resize Flow:
+----------------+    +-----------------+    +------------------+
|  Mount: Load   | -> | User Resizes    | -> | MouseUp: Save    |
|  from storage  |    | Column          |    | to localStorage  |
+----------------+    +-----------------+    +------------------+
```

---

## 3. Layout Restructure - Detail Panel Below

**File:** `src/components/StuffOrganizer.tsx`

Current layout:
```text
+------------------------------------------+
|              TOOLBAR                      |
+----------+----------------------+---------+
|          |                      |         |
| SIDEBAR  |       TABLE         | DETAIL  |
|          |                      | PANEL   |
|          |                      |         |
+----------+----------------------+---------+
```

New layout:
```text
+------------------------------------------+
|              TOOLBAR                      |
+----------+-------------------------------+
|          |                               |
| SIDEBAR  |           TABLE               |
|          |                               |
+----------+-------------------------------+
|          DETAIL PANEL (full width)       |
+------------------------------------------+
```

**Changes:**
- Restructure flex container from row to column
- Top section: sidebar + table (horizontal flex)
- Bottom section: detail panel (full width)
- Update CSS classes in `index.css`

---

## 4. Resizable Detail Panel Height

**Files:** `src/components/StuffOrganizer.tsx`, `src/components/DetailPanel.tsx`

**Changes:**
- Add detail panel height state with localStorage persistence
- Create drag handle at top of detail panel
- Implement mouse drag handlers for resizing
- Minimum height: 150px, Maximum height: 60% of viewport
- Save height to localStorage key `stuff_organizer_detail_height`

```text
Resize Implementation:
+------------------------------------------+
|  ═══════════ drag handle ═══════════     |  <- 4px draggable area
|          DETAIL PANEL CONTENT            |
+------------------------------------------+
```

---

## 5. Collapsible Detail Panel

**Files:** `src/components/StuffOrganizer.tsx`, `src/components/DetailPanel.tsx`

**Changes:**
- Add collapsed state with localStorage persistence (`stuff_organizer_detail_collapsed`)
- Toggle button with subtle chevron icon (ChevronDown/ChevronUp)
- Smooth CSS transition for height animation (200ms ease)
- When collapsed: show only thin bar with toggle button
- Position toggle button on the divider/drag handle area

---

## 6. Clean Dark Theme Implementation

**File:** `src/index.css`

### Color Palette (Dark Mode Only Focus)

| Element | Color | HSL Value |
|---------|-------|-----------|
| Main Background | #0a0a0a | 0 0% 4% |
| Sidebar Background | #141414 | 0 0% 8% |
| Panel Background | #1a1a1a | 0 0% 10% |
| Primary Text | #e5e5e5 | 0 0% 90% |
| Secondary Text | #a0a0a0 | 0 0% 63% |
| Accent (Blue) | #3b82f6 | 217 91% 60% |
| Borders | #252525 | 0 0% 15% |
| Hover | #1e1e1e | 0 0% 12% |
| Selected Row | #1e3a5f | 210 52% 25% |

### Design Rules to Implement

**General:**
- Remove/minimize border-radius (max 2-4px)
- Remove all shadows
- Remove all gradients
- Consistent spacing: 8px, 16px, 24px

**Table:**
- Thin horizontal lines only between rows
- No header background color
- Subtle hover effect (#1a1a1a)
- Selected: subtle blue background (#1e3a5f)

**Sidebar:**
- Selected category: 3px blue left border accent
- Clean padding (16px)
- Subtle hover background

**Toolbar:**
- Flat button design
- Minimal/no borders
- Icon + text or icons only

**Detail Panel:**
- Clean sections with whitespace
- Subtle horizontal dividers
- Well-aligned information

---

## Technical Details

### New localStorage Keys
- `stuff_organizer_columns` - Column widths array
- `stuff_organizer_detail_height` - Detail panel height (number)
- `stuff_organizer_detail_collapsed` - Boolean

### Files to Modify

| File | Changes |
|------|---------|
| `src/index.css` | Complete dark theme overhaul, new CSS variables, layout classes |
| `src/components/CategoryTree.tsx` | Emoji icons, selected state styling |
| `src/components/VirtualizedList.tsx` | Column persistence, cleaner styling |
| `src/components/DetailPanel.tsx` | Horizontal layout, collapse toggle, resize handle |
| `src/components/StuffOrganizer.tsx` | New layout structure, detail panel state management |
| `src/components/Toolbar.tsx` | Cleaner flat button styling |
| `src/lib/database.ts` | Update default category icons to emoji identifiers |
| `tailwind.config.ts` | Adjust border-radius, add new color tokens |

### Implementation Order
1. Update CSS variables and dark theme colors
2. Restructure layout (detail panel below)
3. Add emoji icons to categories
4. Implement column width persistence
5. Add detail panel resize functionality
6. Add detail panel collapse toggle
7. Fine-tune spacing, borders, and hover effects

---

## Offline Functionality
All features use localStorage exclusively - no API calls required. The application will work completely offline as before.

