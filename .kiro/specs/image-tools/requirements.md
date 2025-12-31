# Requirements Document

## Introduction

在暮城笔记的工具箱中添加图片处理功能模块，使用 Sharp 库在本地实现专业级的图片处理能力。该功能允许用户在不依赖外部服务的情况下，完成常见的图片编辑和优化任务。

## Glossary

- **Image_Service**: 主进程中的图片处理服务，封装 Sharp 库的所有操作
- **Image_Tool_Panel**: 渲染进程中的图片处理工具界面组件
- **Sharp**: Node.js 高性能图片处理库，基于 libvips
- **EXIF**: 可交换图像文件格式，包含图片元数据
- **ICC_Profile**: 国际色彩联盟配置文件，用于色彩管理
- **SVG**: 可缩放矢量图形格式
- **Trim**: 自动裁剪图片边缘的空白或纯色区域

## Requirements

### Requirement 1: 格式转换

**User Story:** As a user, I want to convert images between different formats, so that I can use images in the format required by different platforms.

#### Acceptance Criteria

1. WHEN a user selects an image file, THE Image_Service SHALL support reading JPEG, PNG, WebP, AVIF, GIF, TIFF, SVG formats
2. WHEN a user selects an output format, THE Image_Service SHALL convert the image to JPEG, PNG, WebP, AVIF, GIF, or TIFF format
3. WHEN converting from SVG format, THE Image_Service SHALL rasterize the SVG with configurable output dimensions
4. WHEN converting to JPEG format, THE Image_Tool_Panel SHALL allow setting quality (1-100)
5. WHEN converting to PNG format, THE Image_Tool_Panel SHALL allow setting compression level (0-9)
6. WHEN converting to WebP format, THE Image_Tool_Panel SHALL allow choosing lossy or lossless mode
7. WHEN converting to AVIF format, THE Image_Tool_Panel SHALL allow setting quality and speed options
8. WHEN conversion completes, THE Image_Tool_Panel SHALL display the output file size and allow downloading

### Requirement 2: 尺寸调整

**User Story:** As a user, I want to resize images to specific dimensions, so that I can prepare images for different use cases.

#### Acceptance Criteria

1. WHEN a user inputs width and height, THE Image_Service SHALL resize the image to the specified dimensions
2. WHEN a user enables "keep aspect ratio", THE Image_Service SHALL maintain the original aspect ratio
3. WHEN resizing, THE Image_Tool_Panel SHALL provide fit options: cover, contain, fill, inside, outside
4. WHEN a user specifies only width or height, THE Image_Service SHALL calculate the other dimension automatically
5. WHEN a user uses extend mode, THE Image_Service SHALL add padding to reach target dimensions with configurable background color
6. WHEN a user uses trim mode, THE Image_Service SHALL automatically remove edges with similar colors
7. WHEN the image is resized, THE Image_Tool_Panel SHALL display a preview of the result

### Requirement 3: 图片裁剪

**User Story:** As a user, I want to crop images to remove unwanted areas, so that I can focus on the important parts of the image.

#### Acceptance Criteria

1. WHEN a user specifies crop region (left, top, width, height), THE Image_Service SHALL extract that region
2. WHEN a user uses the visual crop tool, THE Image_Tool_Panel SHALL display a draggable crop area overlay
3. WHEN cropping, THE Image_Tool_Panel SHALL show the crop dimensions in real-time
4. WHEN a user selects smart crop (attention), THE Image_Service SHALL automatically detect and crop to the most interesting region
5. WHEN a user selects entropy-based crop, THE Image_Service SHALL crop to the region with highest entropy
6. WHEN a user confirms the crop, THE Image_Service SHALL return the cropped image

### Requirement 4: 旋转和翻转

**User Story:** As a user, I want to rotate and flip images, so that I can correct image orientation.

#### Acceptance Criteria

1. WHEN a user selects rotate, THE Image_Service SHALL rotate the image by 90, 180, or 270 degrees
2. WHEN a user inputs a custom angle, THE Image_Service SHALL rotate the image by that angle with configurable background color
3. WHEN a user selects flip (horizontal), THE Image_Service SHALL mirror the image horizontally using flop operation
4. WHEN a user selects flip (vertical), THE Image_Service SHALL mirror the image vertically using flip operation
5. WHEN rotation or flip is applied, THE Image_Tool_Panel SHALL display a preview immediately

### Requirement 5: 颜色处理

**User Story:** As a user, I want to adjust image colors, so that I can improve the visual appearance of images.

#### Acceptance Criteria

1. WHEN a user adjusts brightness, THE Image_Service SHALL modify the image brightness (-100 to +100)
2. WHEN a user adjusts contrast, THE Image_Service SHALL modify the image contrast (-100 to +100)
3. WHEN a user adjusts saturation, THE Image_Service SHALL modify the color saturation (-100 to +100)
4. WHEN a user adjusts hue, THE Image_Service SHALL rotate the hue (0-360 degrees)
5. WHEN a user enables grayscale, THE Image_Service SHALL convert the image to grayscale
6. WHEN adjustments are made, THE Image_Tool_Panel SHALL show a live preview

### Requirement 6: 滤镜效果

**User Story:** As a user, I want to apply filters to images, so that I can enhance or stylize them.

#### Acceptance Criteria

1. WHEN a user applies blur, THE Image_Service SHALL apply Gaussian blur with configurable sigma (0.3-100)
2. WHEN a user applies sharpen, THE Image_Service SHALL apply sharpening with configurable sigma, flat, and jagged parameters
3. WHEN a user applies median filter, THE Image_Service SHALL apply median filtering with configurable window size (3-9)
4. WHEN a user adjusts gamma, THE Image_Service SHALL apply gamma correction (0.1-3.0)
5. WHEN a user enables negate, THE Image_Service SHALL produce a negative of the image
6. WHEN a user enables normalise, THE Image_Service SHALL stretch the image contrast to cover full dynamic range
7. WHEN filters are applied, THE Image_Tool_Panel SHALL display the result with before/after comparison

### Requirement 7: 合成叠加

**User Story:** As a user, I want to overlay images or add watermarks, so that I can create composite images or protect my work.

#### Acceptance Criteria

1. WHEN a user adds a watermark image, THE Image_Service SHALL composite it onto the main image
2. WHEN positioning a watermark, THE Image_Tool_Panel SHALL allow selecting position (9 positions: corners, edges, center)
3. WHEN adding a watermark, THE Image_Tool_Panel SHALL allow setting opacity (0-100%)
4. WHEN adding a watermark, THE Image_Tool_Panel SHALL allow setting size relative to main image
5. WHEN compositing, THE Image_Service SHALL support blend modes: over, multiply, screen, overlay, darken, lighten
6. WHEN a user adds text watermark, THE Image_Service SHALL render text with configurable font, size, and color
7. WHEN compositing multiple images, THE Image_Service SHALL support layered composition with individual positioning

### Requirement 8: 元数据读取

**User Story:** As a user, I want to view and manage image metadata, so that I can understand the image properties and control privacy.

#### Acceptance Criteria

1. WHEN a user loads an image, THE Image_Service SHALL extract EXIF metadata
2. WHEN displaying metadata, THE Image_Tool_Panel SHALL show: dimensions, format, color space, file size, bit depth
3. WHEN EXIF data exists, THE Image_Tool_Panel SHALL show: camera model, date taken, GPS coordinates, exposure settings, ISO, aperture
4. WHEN ICC profile exists, THE Image_Tool_Panel SHALL display the color profile name and description
5. WHEN a user requests metadata removal, THE Image_Service SHALL strip all EXIF and ICC metadata from the image
6. WHEN a user requests selective removal, THE Image_Service SHALL allow removing only GPS or only EXIF data

### Requirement 9: 优化压缩

**User Story:** As a user, I want to compress images to reduce file size, so that I can optimize images for web or storage.

#### Acceptance Criteria

1. WHEN compressing JPEG, THE Image_Service SHALL allow quality setting (1-100) with progressive and mozjpeg options
2. WHEN compressing PNG, THE Image_Service SHALL apply palette optimization, compression level (0-9), and adaptive filtering
3. WHEN compressing WebP, THE Image_Service SHALL support both lossy and lossless compression with quality and effort settings
4. WHEN compressing AVIF, THE Image_Service SHALL allow quality, speed, and lossless options
5. WHEN compression completes, THE Image_Tool_Panel SHALL display original and compressed file sizes
6. WHEN compression completes, THE Image_Tool_Panel SHALL show compression ratio percentage and size reduction
7. WHEN a user enables "optimize for web", THE Image_Service SHALL strip metadata, apply optimal settings, and suggest best format

### Requirement 10: 工具箱集成

**User Story:** As a user, I want to access image tools from the toolbox, so that I can easily find and use image processing features.

#### Acceptance Criteria

1. WHEN the toolbox opens, THE Image_Tool_Panel SHALL appear as a new category "图片处理"
2. WHEN selecting an image tool, THE Image_Tool_Panel SHALL display the corresponding tool interface
3. WHEN processing images, THE Image_Tool_Panel SHALL show a loading indicator
4. IF an error occurs during processing, THEN THE Image_Tool_Panel SHALL display a user-friendly error message
5. WHEN processing completes, THE Image_Tool_Panel SHALL allow saving the result to a file
