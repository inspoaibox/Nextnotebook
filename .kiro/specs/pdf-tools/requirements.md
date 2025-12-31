# Requirements Document

## Introduction

PDF 工具套件是暮城笔记工具箱的新增分类，提供完整的 PDF 文件处理能力。该套件采用模块化设计，每个功能作为独立工具入口，类似现有的图片处理工具架构。技术栈包括：PDF.js（预览渲染）、pdf-lib（编辑操作）、Ghostscript（格式转换）以及现有图片工具（后处理复用）。

## Glossary

- **PDF_Tool_Panel**: PDF 工具面板，承载所有 PDF 工具的容器组件
- **PDF_Preview_Engine**: 基于 PDF.js 的 PDF 预览渲染引擎
- **PDF_Editor_Engine**: 基于 pdf-lib 的 PDF 编辑引擎
- **PDF_Converter_Engine**: 基于 Ghostscript 的 PDF 转换引擎
- **Ghostscript_Service**: 主进程中的 Ghostscript 调用服务
- **Page_Thumbnail**: PDF 页面缩略图组件
- **Watermark**: 水印，包括文字水印和图片水印
- **DPI**: 每英寸点数，图片输出分辨率单位

## Requirements

### Requirement 1: PDF 工具分类与入口

**User Story:** As a user, I want to access PDF tools from a dedicated category in the toolbox, so that I can easily find and use PDF processing features.

#### Acceptance Criteria

1. THE Toolbox_Panel SHALL display a "PDF工具" category with a dedicated icon
2. WHEN a user clicks on the PDF category, THE System SHALL show all available PDF tools as sub-menu items
3. THE System SHALL provide the following independent tool entries: 预览、合并拆分、转图片、压缩、加水印、旋转调整、页面重排、页面删除、页面提取、批量重命名、表单填写、安全加密、元数据编辑、图片转PDF、对比
4. WHEN a user selects a PDF tool, THE System SHALL load the corresponding tool interface

### Requirement 2: PDF 合并与拆分工具

**User Story:** As a user, I want to merge multiple PDF files or split a PDF into separate files, so that I can organize my documents efficiently.

#### Acceptance Criteria

1. WHEN a user opens the merge/split tool, THE System SHALL display a file upload area supporting multiple PDF files
2. WHEN PDF files are uploaded, THE PDF_Preview_Engine SHALL render page thumbnails for each file
3. THE System SHALL allow users to drag and drop pages to reorder them across files
4. WHEN a user clicks "合并", THE PDF_Editor_Engine SHALL combine selected pages into a single PDF
5. WHEN a user selects pages and clicks "拆分", THE PDF_Editor_Engine SHALL extract those pages into a new PDF
6. THE System SHALL support extracting specific page ranges (e.g., 1-3, 5, 7-10)
7. WHEN processing completes, THE System SHALL provide download options for the resulting PDF files

### Requirement 3: PDF 转图片工具

**User Story:** As a user, I want to convert PDF pages to images, so that I can share them via email, messaging apps, or use in presentations.

#### Acceptance Criteria

1. WHEN a user opens the PDF-to-image tool, THE System SHALL display a file upload area for a single PDF
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL display page thumbnails with selection checkboxes
3. THE System SHALL allow users to select output format (PNG or JPG)
4. THE System SHALL allow users to select DPI (150, 300, or custom value)
5. WHEN a user clicks "转换", THE PDF_Converter_Engine SHALL convert selected pages to images using Ghostscript
6. IF the user selects image post-processing, THE System SHALL integrate with existing image tools for cropping, compression, or watermarking
7. WHEN conversion completes, THE System SHALL provide batch download or individual download options

### Requirement 4: PDF 压缩工具

**User Story:** As a user, I want to compress PDF files to reduce their size, so that I can meet email attachment limits or system upload restrictions.

#### Acceptance Criteria

1. WHEN a user opens the compression tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE System SHALL display the original file size
3. THE System SHALL provide compression level options: 低压缩（高质量）、中等压缩、高压缩（小体积）
4. WHEN a user clicks "压缩", THE PDF_Converter_Engine SHALL compress the PDF using Ghostscript profiles
5. WHEN compression completes, THE System SHALL display the compressed file size and compression ratio
6. THE System SHALL provide a download button for the compressed PDF

### Requirement 5: PDF 加水印工具

**User Story:** As a user, I want to add watermarks to PDF files, so that I can protect confidential documents or mark internal files.

#### Acceptance Criteria

1. WHEN a user opens the watermark tool, THE System SHALL display a file upload area and watermark configuration panel
2. THE System SHALL support two watermark types: 文字水印 and 图片水印
3. FOR text watermarks, THE System SHALL allow configuration of: text content, font size, color, opacity, rotation angle
4. FOR image watermarks, THE System SHALL allow uploading an image and configuring: size, opacity, rotation angle
5. THE System SHALL support watermark placement modes: 单个定位 (specific position) and 平铺 (tiled across page)
6. WHEN a user clicks "预览", THE PDF_Preview_Engine SHALL render a preview with the watermark applied
7. WHEN a user clicks "应用", THE PDF_Editor_Engine SHALL embed the watermark into all pages or selected pages
8. THE System SHALL provide a download button for the watermarked PDF

### Requirement 6: PDF 旋转调整工具

**User Story:** As a user, I want to rotate PDF pages, so that I can correct orientation issues in scanned documents.

#### Acceptance Criteria

1. WHEN a user opens the rotation tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL display page thumbnails
3. THE System SHALL allow users to select pages for rotation (all pages or specific pages)
4. THE System SHALL provide rotation options: 顺时针90°、逆时针90°、180°
5. WHEN a user clicks a rotation button, THE PDF_Editor_Engine SHALL rotate the selected pages
6. THE System SHALL update the thumbnail preview to reflect the rotation
7. THE System SHALL provide a download button for the rotated PDF

### Requirement 7: PDF 页面重排工具

**User Story:** As a user, I want to reorder pages in a PDF by dragging and dropping, so that I can adjust document structure easily.

#### Acceptance Criteria

1. WHEN a user opens the page reorder tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL display all pages as draggable thumbnails
3. THE System SHALL allow users to drag and drop thumbnails to reorder pages
4. THE System SHALL display page numbers that update dynamically during reordering
5. WHEN a user clicks "应用", THE PDF_Editor_Engine SHALL save the new page order
6. THE System SHALL provide a download button for the reordered PDF

### Requirement 8: PDF 页面删除工具

**User Story:** As a user, I want to delete specific pages from a PDF, so that I can remove unwanted content.

#### Acceptance Criteria

1. WHEN a user opens the page delete tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL display all pages as thumbnails with delete buttons
3. THE System SHALL allow users to click on thumbnails to select multiple pages for deletion
4. THE System SHALL allow users to input page ranges for batch deletion (e.g., 2-5, 8)
5. WHEN a user clicks "删除选中页", THE PDF_Editor_Engine SHALL remove the selected pages
6. THE System SHALL update the thumbnail view to reflect the deletion
7. IF all pages are selected for deletion, THE System SHALL display a warning and prevent the operation
8. THE System SHALL provide a download button for the modified PDF

### Requirement 9: PDF 批量重命名工具

**User Story:** As a user, I want to batch rename PDF files based on rules, so that I can organize invoices, contracts, or receipts efficiently.

#### Acceptance Criteria

1. WHEN a user opens the batch rename tool, THE System SHALL display a file upload area supporting multiple PDFs
2. THE System SHALL display a list of uploaded files with their current names
3. THE System SHALL provide naming rule options: 序号前缀、日期前缀、自定义模板
4. FOR custom templates, THE System SHALL support placeholders: {n} (序号), {date} (日期), {original} (原文件名)
5. THE System SHALL display a preview of the new filenames before applying
6. WHEN a user clicks "应用", THE System SHALL rename the files according to the rules
7. THE System SHALL provide a batch download option for renamed files

### Requirement 10: Ghostscript 集成

**User Story:** As a developer, I want Ghostscript to be bundled with the application, so that PDF conversion works offline without external dependencies.

#### Acceptance Criteria

1. THE Build_System SHALL bundle Ghostscript executable (gswin64c.exe for Windows) into the application package
2. THE Ghostscript_Service SHALL be implemented in the main process
3. WHEN the renderer process requests PDF conversion, THE System SHALL use IPC to communicate with Ghostscript_Service
4. THE Ghostscript_Service SHALL execute Ghostscript commands using child_process.spawn
5. IF Ghostscript execution fails, THE System SHALL return a descriptive error message to the user
6. THE System SHALL clean up temporary files after conversion completes

### Requirement 11: PDF 预览引擎

**User Story:** As a user, I want to preview PDF content within the application, so that I can see what I'm working with before making changes.

#### Acceptance Criteria

1. THE PDF_Preview_Engine SHALL use PDF.js for rendering
2. THE PDF_Preview_Engine SHALL support zooming (fit width, fit page, custom percentage)
3. THE PDF_Preview_Engine SHALL support page navigation (previous, next, go to page)
4. THE PDF_Preview_Engine SHALL render page thumbnails for multi-page documents
5. WHEN rendering large PDFs, THE PDF_Preview_Engine SHALL use lazy loading for thumbnails
6. THE PDF_Preview_Engine SHALL support text search within the PDF

### Requirement 12: 错误处理与用户反馈

**User Story:** As a user, I want clear feedback when operations succeed or fail, so that I know the status of my PDF processing tasks.

#### Acceptance Criteria

1. WHEN a PDF operation starts, THE System SHALL display a loading indicator with progress information
2. WHEN a PDF operation completes successfully, THE System SHALL display a success message
3. IF a PDF file is corrupted or invalid, THE System SHALL display a clear error message
4. IF Ghostscript is not available, THE System SHALL display an error with troubleshooting guidance
5. THE System SHALL validate file types and reject non-PDF files with appropriate messages

### Requirement 13: PDF 预览工具

**User Story:** As a user, I want to preview PDF files with full navigation and search capabilities, so that I can read and locate content efficiently.

#### Acceptance Criteria

1. WHEN a user opens the preview tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL render the document with full page display
3. THE System SHALL provide zoom controls: 适应宽度、适应页面、自定义百分比 (50%-200%)
4. THE System SHALL provide page navigation: 上一页、下一页、跳转到指定页
5. THE System SHALL display current page number and total pages
6. THE System SHALL provide text search functionality with highlight and navigation between matches
7. THE System SHALL support keyboard shortcuts for navigation (Arrow keys, Page Up/Down)

### Requirement 14: PDF 页面提取工具

**User Story:** As a user, I want to extract specific pages from a PDF into a new file, so that I can create focused documents from larger files.

#### Acceptance Criteria

1. WHEN a user opens the page extract tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE PDF_Preview_Engine SHALL display page thumbnails with selection checkboxes
3. THE System SHALL allow users to select pages by clicking thumbnails or entering page ranges
4. THE System SHALL support page range syntax: 单页(5)、范围(1-3)、组合(1,3,5-7)
5. WHEN a user clicks "提取", THE PDF_Editor_Engine SHALL create a new PDF with selected pages
6. THE System SHALL provide a download button for the extracted PDF

### Requirement 15: 笔记导出为 PDF

**User Story:** As a user, I want to export my notes as PDF files, so that I can share them in a universal format.

#### Acceptance Criteria

1. THE System SHALL integrate with the existing ExportManager
2. WHEN a user selects "导出为 PDF" from a note, THE System SHALL convert the Markdown content to PDF
3. THE System SHALL preserve formatting: headings, lists, code blocks, images
4. THE System SHALL support custom page size options: A4, Letter, A5
5. THE System SHALL support custom margins
6. THE System SHALL embed images from the note into the PDF
7. WHEN export completes, THE System SHALL provide a download or save dialog

### Requirement 16: PDF 表单填写

**User Story:** As a user, I want to fill out PDF forms within the application, so that I can complete documents without external software.

#### Acceptance Criteria

1. WHEN a user opens a PDF with form fields, THE System SHALL detect and highlight fillable fields
2. THE System SHALL support text input fields
3. THE System SHALL support checkbox fields
4. THE System SHALL support dropdown/select fields
5. WHEN a user fills a field, THE PDF_Editor_Engine SHALL update the PDF data
6. THE System SHALL provide a "保存" button to save the filled form
7. THE System SHALL provide a "清空表单" button to reset all fields

### Requirement 17: PDF 安全与加密

**User Story:** As a user, I want to add password protection to PDF files, so that I can secure sensitive documents.

#### Acceptance Criteria

1. WHEN a user opens the security tool, THE System SHALL display a file upload area and security options
2. THE System SHALL support setting an open password (required to view the PDF)
3. THE System SHALL support setting a permissions password (required to edit/print)
4. THE System SHALL support permission options: 禁止打印、禁止复制、禁止编辑
5. WHEN a user clicks "应用", THE PDF_Editor_Engine SHALL encrypt the PDF with the specified settings
6. THE System SHALL provide a download button for the secured PDF
7. THE System SHALL support removing password protection (with correct password)

### Requirement 18: PDF 元数据编辑

**User Story:** As a user, I want to view and edit PDF metadata, so that I can organize and identify my documents.

#### Acceptance Criteria

1. WHEN a user opens the metadata tool, THE System SHALL display a file upload area
2. WHEN a PDF is uploaded, THE System SHALL display current metadata: 标题、作者、主题、关键词、创建日期、修改日期
3. THE System SHALL allow users to edit metadata fields
4. WHEN a user clicks "保存", THE PDF_Editor_Engine SHALL update the PDF metadata
5. THE System SHALL provide a download button for the modified PDF

### Requirement 19: 图片转 PDF

**User Story:** As a user, I want to convert images to PDF, so that I can create documents from scanned images or photos.

#### Acceptance Criteria

1. WHEN a user opens the image-to-PDF tool, THE System SHALL display a file upload area supporting multiple images
2. THE System SHALL support image formats: JPG, PNG, GIF, BMP, WebP
3. WHEN images are uploaded, THE System SHALL display thumbnails with drag-and-drop reordering
4. THE System SHALL provide page size options: 适应图片、A4、Letter
5. THE System SHALL provide image placement options: 居中、拉伸填充、保持比例
6. WHEN a user clicks "转换", THE PDF_Editor_Engine SHALL create a PDF with one image per page
7. THE System SHALL provide a download button for the created PDF

### Requirement 20: PDF 对比工具

**User Story:** As a user, I want to compare two PDF files side by side, so that I can identify differences between document versions.

#### Acceptance Criteria

1. WHEN a user opens the compare tool, THE System SHALL display two file upload areas
2. WHEN two PDFs are uploaded, THE PDF_Preview_Engine SHALL render them side by side
3. THE System SHALL synchronize page navigation between the two views
4. THE System SHALL synchronize zoom level between the two views
5. THE System SHALL provide a "差异高亮" option to highlight text differences (if text is extractable)
6. THE System SHALL display page count comparison information
