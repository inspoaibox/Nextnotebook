# Requirements Document

## Introduction

本功能为密码库新增一个"密码/资料生成器"工具，使用开源的 Faker 库在本地生成虚假但格式正确的用户资料。用户可以单个或批量生成用户名、密码及可选的个人信息（姓名、地址、电话、邮箱、工作单位），并支持将生成的数据直接导入到密码库作为新条目。

## Glossary

- **Generator**: 密码/资料生成器组件，负责生成虚假用户资料
- **Faker**: 开源的假数据生成库，支持多国家/地区的本地化数据
- **VaultEntry**: 密码库条目，存储用户名、密码等敏感信息
- **GeneratedProfile**: 生成的用户资料数据结构，包含用户名、密码及可选字段
- **BatchGeneration**: 批量生成模式，一次生成多条资料

## Requirements

### Requirement 1: 生成器入口与界面布局

**User Story:** As a user, I want to access the data generator from the vault panel, so that I can quickly generate fake credentials when needed.

#### Acceptance Criteria

1. WHEN a user clicks the "生成器" button in the vault panel THEN THE Generator SHALL display a full-width interface replacing the normal entry list and detail view
2. THE Generator SHALL maintain the left folder sidebar unchanged while replacing the middle and right content areas
3. WHEN the generator is active THEN THE Generator SHALL display a "返回密码库" button to restore the normal vault view
4. THE Generator SHALL display generation options on the left side and generated results on the right side

### Requirement 2: 基础生成选项

**User Story:** As a user, I want to configure basic generation options, so that I can control what type of data is generated.

#### Acceptance Criteria

1. THE Generator SHALL provide a country selector with default value "美国"
2. THE Generator SHALL provide a gender selector with options "随机", "男", "女" and default value "随机"
3. THE Generator SHALL always generate username and password by default
4. THE Generator SHALL provide a quantity input for batch generation with range 1-100 and default value 1
5. WHEN the user changes country selection THEN THE Generator SHALL update all generated data to match the selected country's locale
6. THE Generator SHALL provide password customization options including:
   - Length slider/input with range 8-64 and default value 16
   - Checkbox for uppercase letters (A-Z), default checked
   - Checkbox for lowercase letters (a-z), default checked
   - Checkbox for numbers (0-9), default checked
   - Checkbox for special symbols (!@#$%^&*), default checked
7. THE Generator SHALL require at least one character type to be selected for password generation

### Requirement 3: 可选字段配置

**User Story:** As a user, I want to optionally include additional profile fields, so that I can generate complete fake identities when needed.

#### Acceptance Criteria

1. THE Generator SHALL provide checkboxes for optional fields: 姓名, 地址, 电话, 邮箱, 工作单位
2. THE Generator SHALL have all optional checkboxes unchecked by default
3. WHEN a checkbox is checked THEN THE Generator SHALL include that field in generated profiles
4. WHEN country or gender selection changes THEN THE Generator SHALL regenerate optional fields to match the new locale and gender

### Requirement 4: 数据生成功能

**User Story:** As a user, I want to generate fake user profiles, so that I can use them for testing or placeholder purposes.

#### Acceptance Criteria

1. WHEN the user clicks "生成" button THEN THE Generator SHALL create profiles based on current options
2. THE Generator SHALL generate usernames using Faker's internet.userName() method
3. THE Generator SHALL generate passwords using the existing generatePassword function with configurable length and character options
4. WHEN 姓名 is selected THEN THE Generator SHALL generate first name and last name based on country and gender
5. WHEN 地址 is selected THEN THE Generator SHALL generate a complete address based on country locale
6. WHEN 电话 is selected THEN THE Generator SHALL generate a phone number based on country format
7. WHEN 邮箱 is selected THEN THE Generator SHALL generate an email address
8. WHEN 工作单位 is selected THEN THE Generator SHALL generate a company name based on country locale

### Requirement 5: 生成结果展示

**User Story:** As a user, I want to view and copy generated data, so that I can use individual fields as needed.

#### Acceptance Criteria

1. THE Generator SHALL display generated profiles in a scrollable list format
2. THE Generator SHALL support two view modes: compact (table) and expanded (cards)
3. WHEN batch generation produces multiple profiles THEN THE Generator SHALL default to compact view mode
4. WHEN single profile is generated THEN THE Generator SHALL default to expanded view mode
5. IN compact view mode THE Generator SHALL display profiles as table rows with columns: index, username, password (with show/hide toggle), and action buttons
6. IN compact view mode THE Generator SHALL allow expanding a row to show optional fields
7. THE Generator SHALL provide a copy button next to each field value
8. WHEN a user clicks a copy button THEN THE Generator SHALL copy that field value to clipboard and show a success message
9. THE Generator SHALL provide a "复制全部" button to copy all fields of a profile as formatted text
10. THE Generator SHALL provide a view mode toggle button to switch between compact and expanded views

### Requirement 6: 导入到密码库

**User Story:** As a user, I want to import generated profiles into my vault, so that I can save them as permanent entries.

#### Acceptance Criteria

1. THE Generator SHALL provide an "导入到密码库" button for each generated profile
2. WHEN the user clicks "导入到密码库" THEN THE Generator SHALL display a modal with folder selection
3. THE Generator SHALL allow the user to select an existing vault folder or create a new one
4. WHEN importing THEN THE Generator SHALL map username and password to the vault entry's username and password fields
5. WHEN importing THEN THE Generator SHALL combine all other generated fields (姓名, 地址, 电话, 邮箱, 工作单位) into the vault entry's notes field
6. WHEN import is successful THEN THE Generator SHALL show a success message and optionally navigate to the new entry
7. THE Generator SHALL provide a "批量导入" button when multiple profiles are generated
8. WHEN batch importing THEN THE Generator SHALL create separate vault entries for each profile in the selected folder

### Requirement 7: 支持的国家/地区

**User Story:** As a user, I want to generate data for different countries, so that I can create locale-appropriate fake profiles.

#### Acceptance Criteria

1. THE Generator SHALL support at minimum the following countries: 美国, 中国, 日本, 韩国, 英国, 德国, 法国, 俄罗斯
2. WHEN a country is selected THEN THE Generator SHALL use Faker's corresponding locale for all generated data
3. THE Generator SHALL display country names in Chinese with appropriate locale codes

### Requirement 8: 错误处理

**User Story:** As a user, I want clear feedback when errors occur, so that I can understand and resolve issues.

#### Acceptance Criteria

1. IF generation fails THEN THE Generator SHALL display an error message explaining the issue
2. IF import fails THEN THE Generator SHALL display an error message and preserve the generated data
3. IF an invalid quantity is entered THEN THE Generator SHALL show a validation error and prevent generation
