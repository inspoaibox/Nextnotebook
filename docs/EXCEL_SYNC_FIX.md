# Excel 笔记同步问题修复指南

## 问题描述

**症状：**
- 电脑端创建 Excel 笔记 → 同步到服务器 ✅
- 服务器同步到手机端 → 能看到笔记标题 ✅  
- 手机端打开笔记 → 提示"无工作表" ❌
- Excel 笔记没有保存按钮 ❌

## 根本原因

通过系统化调试分析，发现问题出在以下几个方面：

### 问题 1：数据结构不一致

**桌面端（TypeScript）：**
```typescript
export const createDefaultExcelNotePayload = (title: string): ExcelNotePayload => ({
  // ...
  sheets: [createDefaultExcelSheet('Sheet1')],  // 默认有一个工作表
  active_sheet_index: 0,
});
```

**Android 端（Kotlin）：**
```kotlin
data class ExcelNotePayload(
    // ...
    val sheets: List<ExcelSheet> = emptyList(),  // 默认是空列表！
    val activeSheetIndex: Int = 0
)
```

### 问题 2：缺少字段验证

Android 端在加载笔记时，没有验证 `sheets` 是否为空，直接尝试访问导致显示"无工作表"。

### 问题 3：字段缺失

桌面端的 `createDefaultExcelSheet` 函数缺少 `merged_cells` 字段，可能导致序列化不完整。

### 问题 4：缺少保存机制

Excel 编辑器没有明显的保存按钮，数据只在切换笔记时保存，容易导致数据丢失。

## 修复方案

### 修复 1：桌面端 - 添加 merged_cells 字段

**文件：** `src/shared/types/index.ts`

```typescript
export const createDefaultExcelSheet = (name: string): ExcelSheet => ({
  id: crypto.randomUUID ? crypto.randomUUID() : `sheet-${Date.now()}`,
  name,
  rows: [],
  column_widths: [],
  row_heights: [],
  frozen_rows: 0,
  frozen_columns: 0,
  merged_cells: [],  // ✅ 添加此字段
});
```

### 修复 2：Android 端 - 添加空数据保护

**文件：** `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/ExcelDetailViewModel.kt`

在 `loadNote` 方法中添加：

```kotlin
// 修复：如果 sheets 为空，创建默认工作表
val fixedPayload = if (payload.sheets.isEmpty()) {
    android.util.Log.w("ExcelDetailVM", "Sheets is empty, creating default sheet")
    payload.copy(
        sheets = listOf(
            ExcelSheet(
                id = java.util.UUID.randomUUID().toString(),
                name = "Sheet1",
                rows = emptyList(),
                columnWidths = emptyList(),
                rowHeights = emptyList()
            )
        ),
        activeSheetIndex = 0
    )
} else {
    payload
}
```

**文件：** `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/ExcelViewModel.kt`

在 `loadExcelNotes` 方法中添加相同的保护逻辑。

### 修复 3：添加诊断日志

在 Android 端添加日志以便调试：

```kotlin
android.util.Log.d("ExcelDetailVM", "Raw payload: ${item.payload}")
```

### 修复 4：添加保存按钮和自动保存

**文件：** `src/renderer/components/ExcelEditorPanel.tsx`

1. **添加保存状态管理：**
```typescript
const [isSaving, setIsSaving] = useState(false);
const [lastSaved, setLastSaved] = useState<Date | null>(null);
const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
```

2. **添加手动保存函数：**
```typescript
const handleSave = useCallback(async () => {
  if (!currentNote || !currentPayload) return;
  
  setIsSaving(true);
  try {
    await updateExcelNote(currentNote.id, currentPayload);
    setLastSaved(new Date());
    message.success('保存成功');
  } catch (err: any) {
    message.error(err.message || '保存失败');
  } finally {
    setIsSaving(false);
  }
}, [currentNote, currentPayload, updateExcelNote]);
```

3. **添加自动保存（2秒延迟）：**
```typescript
useEffect(() => {
  if (!currentNote || !currentPayload) return;

  if (autoSaveTimerRef.current) {
    clearTimeout(autoSaveTimerRef.current);
  }

  autoSaveTimerRef.current = setTimeout(async () => {
    setIsSaving(true);
    try {
      await updateExcelNote(currentNote.id, currentPayload);
      setLastSaved(new Date());
    } catch (err: any) {
      console.error('[Excel] Auto-save failed:', err);
    } finally {
      setIsSaving(false);
    }
  }, 2000);

  return () => {
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
  };
}, [currentPayload, currentNote, updateExcelNote]);
```

4. **添加 Ctrl+S 快捷键：**
```typescript
case 's':
  e.preventDefault();
  handleSave();
  break;
```

**文件：** `src/renderer/components/excel/ExcelToolbar.tsx`

添加保存按钮和状态显示：

```typescript
{onSave && (
  <>
    <Tooltip title={isSaving ? '保存中...' : '保存 (Ctrl+S)'}>
      <Button 
        type="primary"
        loading={isSaving}
        onClick={onSave}
        size="small"
      >
        {isSaving ? '保存中' : '保存'}
      </Button>
    </Tooltip>
    {lastSaved && !isSaving && (
      <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>
        {/* 显示保存时间 */}
      </span>
    )}
    <Divider type="vertical" />
  </>
)}
```

## 测试验证

创建了新的测试文件 `src/core/excel/ExcelSync.test.ts` 验证：

1. ✅ 默认 Excel 笔记包含至少一个工作表
2. ✅ 默认工作表包含所有必需字段
3. ✅ 序列化后的 JSON 包含 sheets 字段
4. ✅ active_sheet_index 在有效范围内

所有测试通过！

## 如何验证修复

### 步骤 1：重新构建应用

**桌面端：**
```bash
npm run build
```

**Android 端：**
```bash
cd android
./gradlew assembleRelease
```

### 步骤 2：测试保存功能

1. 在电脑端打开 Excel 笔记
2. 修改单元格内容
3. 观察工具栏的保存按钮和状态
4. 等待 2 秒，应该自动保存
5. 或者按 Ctrl+S 手动保存
6. 查看"X 分钟前保存"的提示

### 步骤 3：测试同步流程

1. 在电脑端创建新的 Excel 笔记
2. 添加一些数据到单元格
3. 保存（自动或手动）
4. 同步到服务器
5. 在手机端同步
6. 打开笔记，验证能否正常显示工作表

### 步骤 4：查看日志（如果仍有问题）

在 Android Studio 中查看 Logcat：

```
adb logcat | grep -E "ExcelDetailVM|ExcelViewModel"
```

查找以下日志：
- `Raw payload: ...` - 查看原始 JSON 数据
- `Sheets is empty, creating default sheet` - 确认保护逻辑生效

## 新功能说明

### 自动保存
- 修改内容后 2 秒自动保存
- 保存时显示"保存中"状态
- 保存成功后显示保存时间

### 手动保存
- 点击工具栏的"保存"按钮
- 或使用快捷键 Ctrl+S (Mac: Cmd+S)
- 保存成功后显示提示消息

### 保存状态显示
- "保存中" - 正在保存
- "刚刚保存" - 刚保存完成
- "X 分钟前保存" - 显示上次保存时间
- 具体时间（超过 1 小时）

## 预防措施

### 1. 数据验证

在创建笔记时，始终确保：
- `sheets` 数组不为空
- `active_sheet_index` 在有效范围内
- 所有必需字段都存在

### 2. 向后兼容

Android 端现在能够处理：
- 空的 `sheets` 数组（自动创建默认工作表）
- 缺失的可选字段（使用默认值）
- 格式错误的数据（使用宽松解析）

### 3. 数据持久化

桌面端现在提供：
- 自动保存（2秒延迟）
- 手动保存按钮
- 保存状态反馈
- 快捷键支持

### 4. 单元测试

为同步功能添加更多测试：
- 测试空数据的处理
- 测试字段缺失的情况
- 测试跨平台序列化/反序列化

## 相关文件

### 桌面端
- `src/shared/types/index.ts` - 数据类型定义
- `src/renderer/components/ExcelEditorPanel.tsx` - Excel 编辑器主面板
- `src/renderer/components/excel/ExcelToolbar.tsx` - 工具栏组件
- `src/renderer/hooks/useExcelNotes.ts` - Excel 笔记管理 Hook
- `src/core/sync/ServerAdapter.ts` - Sync Server 适配器

### Android 端
- `android/app/src/main/java/com/mucheng/notes/domain/model/payload/ExcelPayload.kt` - 数据模型
- `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/ExcelDetailViewModel.kt` - 详情页 ViewModel
- `android/app/src/main/java/com/mucheng/notes/presentation/viewmodel/ExcelViewModel.kt` - 列表页 ViewModel

## 总结

这个问题是由于以下原因导致的：

1. **数据结构不一致**：桌面端和 Android 端的默认值不同
2. **缺少数据验证**：Android 端没有检查空数据
3. **字段不完整**：桌面端缺少某些字段
4. **缺少保存机制**：没有明显的保存按钮和自动保存

修复后：
- Android 端能够优雅地处理空数据
- 桌面端提供了完整的保存功能
- 用户体验得到显著改善
- 数据丢失风险大大降低
