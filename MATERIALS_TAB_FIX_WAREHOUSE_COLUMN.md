# Materials Tab - Warehouse Column Fix

## Problem
The Materials tab was showing Project IDs (Warehouse field) instead of Categories when configured. When users:
1. Configured custom columns in the Materials tab
2. Clicked "Save Categories"
3. Refreshed the page

The warehouse/project ID column would reappear, overwriting the saved configuration.

## Root Cause
- `materialColumns2` (Materials tab columns) was incorrectly storing/loading Warehouse column from saved configurations
- The Warehouse column is only meant for the Stock Monitoring tab (`materialColumns`)
- No filtering was done when loading/saving `materialColumns2` configurations

## Solution Implemented

### 1. **Load-time Filtering** (lines 3710-3760)
Modified `loadMaterialColumnsForCategory()` to filter out Warehouse column whenever loading from Firebase or localStorage:
```javascript
materialColumns2 = materialColumns2.filter(col => col.name !== "Warehouse");
```
Applied at 3 locations (Firebase successful load, Firebase fallback, localStorage)

### 2. **Save-time Filtering** (lines 3855-3877)
Modified `saveMaterialColumns2()` to remove Warehouse column before saving:
```javascript
const columnsToSave = materialColumns2.filter(col => col.name !== "Warehouse");
// Then save columnsToSave instead of materialColumns2
```

### 3. **Default Columns** (lines 3797-3803)
Updated `setDefaultMaterialColumns2()` with explicit comment:
```javascript
// NOTE: DO NOT add Warehouse column here - it's for Stock Monitoring tab only
```

### 4. **UI Rendering** (lines 3898-3903)
Added safety in `renderMaterialColumnsConfig2()` to skip Warehouse column in the column configuration UI:
```javascript
if (col.name === "Warehouse") return;
```

## Result
✅ Materials tab will **never** show Warehouse/Project ID column
✅ Column configuration now persists correctly on refresh
✅ Categories column shows properly
✅ Stock Monitoring tab (materialColumns) still shows Warehouse as intended

## Testing Steps
1. Go to Materials tab
2. Click "Configure Columns" button
3. Select custom columns (with Category, without Warehouse)
4. Click "Save Categories"
5. Refresh the page
6. ✓ Columns should remain as configured
7. ✓ No Warehouse/Project ID column should appear
