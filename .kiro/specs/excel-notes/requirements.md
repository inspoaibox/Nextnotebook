# Requirements Document

## Introduction

本功能为暮城笔记应用添加 Excel 格式笔记支持，允许用户创建、编辑和管理类似电子表格的笔记内容。Excel 笔记将支持多工作表、单元格格式化、简单公式计算，并通过现有的同步系统实现多终端（桌面端、Android 端）数据同步。

## Glossary

- **Excel_Note**: Excel 格式的笔记实体，存储为 ItemBase 类型，payload 包含表格数据
- **Sheet**: 工作表，Excel 笔记中的单个表格页面
- **Cell**: 单元格，工作表中的最小数据单元
- **Formula**: 公式，用于计算单元格值的表达式（如 =SUM(A1:A10)）
- **Cell_Style**: 单元格样式，包括字体、颜色、对齐等格式设置
- **Spreadsheet_Editor**: 电子表格编辑器组件，用于渲染和编辑 Excel 笔记
- **Sync_Engine**: 同步引擎，负责在多终端间同步数据
- **Formula_Engine**: 公式引擎，负责解析和计算单元格公式

## Requirements

### Requirement 1: Excel 笔记创建

**User Story:** As a user, I want to create new Excel format notes, so that I can organize tabular data within the notes application.

#### Acceptance Criteria

1. WHEN a user clicks the "新建 Excel 笔记" button, THE Spreadsheet_Editor SHALL create a new Excel_Note with a default empty Sheet
2. WHEN a new Excel_Note is created, THE System SHALL assign a unique UUID and set the type to 'excel_note'
3. WHEN a new Excel_Note is created, THE System SHALL initialize it with default properties (title, folder_id, tags, etc.)
4. THE Excel_Note SHALL support being placed in any existing folder structure
5. WHEN an Excel_Note is created, THE System SHALL mark its sync_status as 'modified' for synchronization

### Requirement 2: 工作表管理

**User Story:** As a user, I want to manage multiple sheets within an Excel note, so that I can organize related data in separate tabs.

#### Acceptance Criteria

1. WHEN a user clicks "添加工作表", THE Spreadsheet_Editor SHALL create a new Sheet with a default name
2. WHEN a user double-clicks a sheet tab, THE Spreadsheet_Editor SHALL allow renaming the Sheet
3. WHEN a user right-clicks a sheet tab and selects "删除", THE Spreadsheet_Editor SHALL remove the Sheet after confirmation
4. IF a user attempts to delete the last remaining Sheet, THEN THE System SHALL prevent deletion and display a warning
5. WHEN a user clicks a sheet tab, THE Spreadsheet_Editor SHALL switch to display that Sheet
6. THE System SHALL support reordering Sheets via drag-and-drop

### Requirement 3: 单元格编辑

**User Story:** As a user, I want to edit cell contents, so that I can input and modify data in the spreadsheet.

#### Acceptance Criteria

1. WHEN a user clicks a Cell, THE Spreadsheet_Editor SHALL select that Cell and display its content in the formula bar
2. WHEN a user double-clicks a Cell, THE Spreadsheet_Editor SHALL enter edit mode for that Cell
3. WHEN a user types in a selected Cell, THE Spreadsheet_Editor SHALL replace the Cell content with the typed value
4. WHEN a user presses Enter after editing, THE Spreadsheet_Editor SHALL save the Cell value and move selection down
5. WHEN a user presses Tab after editing, THE Spreadsheet_Editor SHALL save the Cell value and move selection right
6. WHEN a user presses Escape during editing, THE Spreadsheet_Editor SHALL cancel the edit and restore the original value
7. THE Cell SHALL support text, number, and boolean value types

### Requirement 4: 简单公式支持

**User Story:** As a user, I want to use simple formulas in cells, so that I can perform basic calculations on my data.

#### Acceptance Criteria

1. WHEN a user enters a value starting with '=', THE Formula_Engine SHALL interpret it as a Formula
2. THE Formula_Engine SHALL support basic arithmetic operators (+, -, *, /)
3. THE Formula_Engine SHALL support cell references (e.g., A1, B2, $A$1)
4. THE Formula_Engine SHALL support range references (e.g., A1:A10)
5. THE Formula_Engine SHALL support SUM function for adding a range of cells
6. THE Formula_Engine SHALL support AVERAGE function for calculating the average of a range
7. THE Formula_Engine SHALL support COUNT function for counting non-empty cells
8. THE Formula_Engine SHALL support MAX and MIN functions for finding extreme values
9. THE Formula_Engine SHALL support IF function for conditional logic (e.g., =IF(A1>10, "Yes", "No"))
10. THE Formula_Engine SHALL support ROUND function for rounding numbers to specified decimal places
11. IF a Formula contains an error, THEN THE System SHALL display an error indicator in the Cell
12. WHEN a referenced Cell value changes, THE Formula_Engine SHALL recalculate dependent Formulas

### Requirement 5: 单元格格式化

**User Story:** As a user, I want to format cells, so that I can improve the visual presentation of my data.

#### Acceptance Criteria

1. WHEN a user selects cells and applies bold formatting, THE Spreadsheet_Editor SHALL set font_bold to true for those Cells
2. WHEN a user selects cells and applies italic formatting, THE Spreadsheet_Editor SHALL set font_italic to true for those Cells
3. THE Spreadsheet_Editor SHALL support setting font color for selected Cells
4. THE Spreadsheet_Editor SHALL support setting background color for selected Cells
5. THE Spreadsheet_Editor SHALL support horizontal text alignment (left, center, right) for selected Cells
6. THE Spreadsheet_Editor SHALL support vertical text alignment (top, middle, bottom) for selected Cells
7. THE Spreadsheet_Editor SHALL support number formatting (decimal places, percentage, currency)
8. WHEN formatting is applied, THE System SHALL update the Cell_Style and mark the Excel_Note as modified

### Requirement 6: 行列操作

**User Story:** As a user, I want to manage rows and columns, so that I can structure my spreadsheet data effectively.

#### Acceptance Criteria

1. WHEN a user right-clicks a row header and selects "插入行", THE Spreadsheet_Editor SHALL insert a new row above the selected row
2. WHEN a user right-clicks a row header and selects "删除行", THE Spreadsheet_Editor SHALL remove the selected row
3. WHEN a user right-clicks a column header and selects "插入列", THE Spreadsheet_Editor SHALL insert a new column to the left
4. WHEN a user right-clicks a column header and selects "删除列", THE Spreadsheet_Editor SHALL remove the selected column
5. THE Spreadsheet_Editor SHALL support adjusting column width by dragging column borders
6. THE Spreadsheet_Editor SHALL support adjusting row height by dragging row borders
7. THE Spreadsheet_Editor SHALL support freezing rows and columns for scrolling

### Requirement 7: 数据同步

**User Story:** As a user, I want my Excel notes to sync across devices, so that I can access and edit them from any device.

#### Acceptance Criteria

1. WHEN an Excel_Note is modified, THE Sync_Engine SHALL detect the change via content_hash comparison
2. WHEN syncing, THE Sync_Engine SHALL upload the complete Excel_Note payload to the remote server
3. WHEN pulling changes, THE Sync_Engine SHALL download and apply remote Excel_Note updates
4. IF a sync conflict occurs, THEN THE System SHALL create a conflict copy following the existing conflict resolution strategy
5. THE Excel_Note type SHALL be included in the 'notes' sync module for module-based sync control
6. WHEN an Excel_Note is synced to Android, THE Android_App SHALL be able to display and edit it

### Requirement 8: 导入导出

**User Story:** As a user, I want to import and export Excel files, so that I can exchange data with other applications.

#### Acceptance Criteria

1. WHEN a user selects "导入 Excel 文件", THE System SHALL parse .xlsx files and create an Excel_Note
2. WHEN a user selects "导入 CSV 文件", THE System SHALL parse .csv files and create an Excel_Note with a single Sheet
3. WHEN a user selects "导出为 Excel", THE System SHALL generate a .xlsx file from the Excel_Note
4. WHEN a user selects "导出为 CSV", THE System SHALL generate a .csv file from the active Sheet
5. WHEN importing, THE System SHALL preserve cell values and basic formatting where possible
6. IF an import file is invalid, THEN THE System SHALL display an error message and abort the import

### Requirement 9: 功能开关

**User Story:** As a user, I want to enable or disable the Excel notes feature, so that I can customize my application experience.

#### Acceptance Criteria

1. THE System SHALL provide an excel_enabled setting in FeatureSettings
2. WHEN excel_enabled is false, THE Sidebar SHALL hide the Excel notes entry
3. WHEN excel_enabled is false, THE System SHALL not sync Excel_Note items
4. WHEN a user toggles excel_enabled in settings, THE System SHALL immediately update the UI visibility

### Requirement 10: Android 端支持

**User Story:** As a mobile user, I want to view and edit Excel notes on my Android device, so that I can work with spreadsheet data on the go.

#### Acceptance Criteria

1. WHEN an Excel_Note is synced to Android, THE Android_App SHALL display it in the notes list with an Excel icon
2. WHEN a user opens an Excel_Note on Android, THE Android_App SHALL render the spreadsheet with basic editing capabilities
3. THE Android_App SHALL support switching between Sheets
4. THE Android_App SHALL support basic cell editing (text input, simple formulas)
5. THE Android_App SHALL support horizontal and vertical scrolling for large spreadsheets
6. WHEN an Excel_Note is modified on Android, THE Android_App SHALL mark it for sync

### Requirement 11: 复制粘贴

**User Story:** As a user, I want to copy and paste cells, so that I can efficiently duplicate and move data within the spreadsheet.

#### Acceptance Criteria

1. WHEN a user selects cells and presses Ctrl+C, THE Spreadsheet_Editor SHALL copy the selected cells to clipboard
2. WHEN a user selects cells and presses Ctrl+X, THE Spreadsheet_Editor SHALL cut the selected cells
3. WHEN a user presses Ctrl+V after copying, THE Spreadsheet_Editor SHALL paste the copied cells at the current selection
4. WHEN pasting, THE System SHALL preserve cell values, formulas, and styles
5. WHEN pasting formulas, THE System SHALL adjust relative cell references based on the paste location
6. THE Spreadsheet_Editor SHALL support pasting from external sources (plain text, CSV format)
7. WHEN a user right-clicks, THE Context_Menu SHALL provide Copy, Cut, and Paste options

### Requirement 12: 撤销重做

**User Story:** As a user, I want to undo and redo my actions, so that I can easily correct mistakes.

#### Acceptance Criteria

1. WHEN a user presses Ctrl+Z, THE Spreadsheet_Editor SHALL undo the last action
2. WHEN a user presses Ctrl+Y or Ctrl+Shift+Z, THE Spreadsheet_Editor SHALL redo the last undone action
3. THE System SHALL maintain an undo history of at least 50 actions
4. THE Undo_History SHALL include cell edits, formatting changes, row/column operations, and sheet operations
5. WHEN an Excel_Note is closed and reopened, THE Undo_History SHALL be cleared
6. THE Toolbar SHALL display Undo and Redo buttons with disabled state when unavailable

### Requirement 13: 性能优化

**User Story:** As a user, I want the Excel editor to perform well with large datasets, so that I can work efficiently.

#### Acceptance Criteria

1. THE Spreadsheet_Editor SHALL use virtual scrolling for rendering large spreadsheets
2. THE Spreadsheet_Editor SHALL only render visible cells plus a buffer zone
3. WHEN a spreadsheet has more than 1000 rows, THE System SHALL implement lazy loading
4. THE Formula_Engine SHALL cache calculation results to avoid redundant computations
5. WHEN saving, THE System SHALL debounce auto-save to prevent excessive writes
