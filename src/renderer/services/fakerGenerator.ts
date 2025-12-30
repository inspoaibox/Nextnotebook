/**
 * FakerGenerator 服务
 * 使用 @faker-js/faker 生成本地化的虚假用户资料
 */

import { Faker, base, en, en_US, zh_CN, ja, ko, en_GB, de, fr, ru } from '@faker-js/faker';
import { v4 as uuidv4 } from 'uuid';
import {
  GeneratorOptions,
  GeneratedProfile,
  GeneratorCountryCode,
  GeneratorGender,
  PasswordOptions,
} from '@shared/types';

// 创建各语言的 Faker 实例，确保有完整的 fallback 链
const fakerEN_US = new Faker({ locale: [en_US, en, base] });
const fakerZH_CN = new Faker({ locale: [zh_CN, en_US, en, base] });
const fakerJA = new Faker({ locale: [ja, en_US, en, base] });
const fakerKO = new Faker({ locale: [ko, en_US, en, base] });
const fakerEN_GB = new Faker({ locale: [en_GB, en_US, en, base] });
const fakerDE = new Faker({ locale: [de, en_US, en, base] });
const fakerFR = new Faker({ locale: [fr, en_US, en, base] });
const fakerRU = new Faker({ locale: [ru, en_US, en, base] });

// Faker 实例映射
const fakerInstances: Record<GeneratorCountryCode, Faker> = {
  'en_US': fakerEN_US,
  'zh_CN': fakerZH_CN,
  'ja': fakerJA,
  'ko': fakerKO,
  'en_GB': fakerEN_GB,
  'de': fakerDE,
  'fr': fakerFR,
  'ru': fakerRU,
};

/**
 * 生成随机密码
 */
export function generatePassword(options: PasswordOptions): string {
  const { length, uppercase, lowercase, numbers, symbols } = options;
  
  // 至少需要一种字符类型
  if (!uppercase && !lowercase && !numbers && !symbols) {
    throw new Error('至少需要选择一种字符类型');
  }
  
  let chars = '';
  if (uppercase) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (lowercase) chars += 'abcdefghijklmnopqrstuvwxyz';
  if (numbers) chars += '0123456789';
  if (symbols) chars += '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const array = new Uint32Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, x => chars[x % chars.length]).join('');
}


/**
 * 获取对应国家的 Faker 实例
 */
function getFakerInstance(country: GeneratorCountryCode): Faker {
  return fakerInstances[country] || fakerEN_US;
}

/**
 * 根据性别获取 Faker 的 sex 参数
 */
function getSexParam(gender: GeneratorGender): 'male' | 'female' | undefined {
  if (gender === 'random') {
    return Math.random() > 0.5 ? 'male' : 'female';
  }
  return gender;
}

/**
 * 格式化全名（根据国家习惯）
 */
function formatFullName(
  firstName: string,
  lastName: string,
  country: GeneratorCountryCode
): string {
  // 东亚国家姓在前
  if (['zh_CN', 'ja', 'ko'].includes(country)) {
    return `${lastName}${firstName}`;
  }
  // 西方国家名在前
  return `${firstName} ${lastName}`;
}

/**
 * 生成完整地址（包含街道、城市、州/省、邮编、国家）
 */
function generateFullAddress(faker: Faker, country: GeneratorCountryCode): string {
  const street = faker.location.streetAddress(true);
  const city = faker.location.city();
  const zipCode = faker.location.zipCode();
  
  // 根据国家格式化地址
  switch (country) {
    case 'zh_CN':
      // 中国格式：省 城市 街道地址 邮编
      const province = faker.location.state();
      return `${province} ${city} ${street}, ${zipCode}`;
    
    case 'ja':
      // 日本格式：〒邮编 都道府县 市区町村 街道
      const prefecture = faker.location.state();
      return `〒${zipCode} ${prefecture} ${city} ${street}`;
    
    case 'ko':
      // 韩国格式：道/市 市/区 街道 邮编
      const region = faker.location.state();
      return `${region} ${city} ${street}, ${zipCode}`;
    
    case 'en_US':
      // 美国格式：街道, 城市, 州 邮编
      const state = faker.location.state({ abbreviated: true });
      return `${street}, ${city}, ${state} ${zipCode}`;
    
    case 'en_GB':
      // 英国格式：街道, 城市, 邮编
      return `${street}, ${city}, ${zipCode}`;
    
    case 'de':
      // 德国格式：街道, 邮编 城市
      return `${street}, ${zipCode} ${city}`;
    
    case 'fr':
      // 法国格式：街道, 邮编 城市
      return `${street}, ${zipCode} ${city}`;
    
    case 'ru':
      // 俄罗斯格式：街道, 城市, 邮编
      return `${street}, ${city}, ${zipCode}`;
    
    default:
      return `${street}, ${city}, ${zipCode}`;
  }
}

/**
 * 生成单个用户资料
 */
export function generateProfile(options: GeneratorOptions): GeneratedProfile {
  const { country, gender, includeFields, passwordOptions } = options;
  const fakerInstance = getFakerInstance(country);
  const sex = getSexParam(gender);
  
  const profile: GeneratedProfile = {
    id: uuidv4(),
    username: fakerInstance.internet.username(),
    password: generatePassword(passwordOptions),
    generatedAt: Date.now(),
  };
  
  // 可选字段
  if (includeFields.name) {
    profile.firstName = fakerInstance.person.firstName(sex);
    profile.lastName = fakerInstance.person.lastName(sex);
    profile.fullName = formatFullName(profile.firstName, profile.lastName, country);
  }
  
  if (includeFields.address) {
    profile.address = generateFullAddress(fakerInstance, country);
  }
  
  if (includeFields.phone) {
    profile.phone = fakerInstance.phone.number();
  }
  
  if (includeFields.email) {
    // 如果有姓名，使用姓名生成邮箱
    if (profile.firstName && profile.lastName) {
      profile.email = fakerInstance.internet.email({
        firstName: profile.firstName,
        lastName: profile.lastName,
      });
    } else {
      profile.email = fakerInstance.internet.email();
    }
  }
  
  if (includeFields.company) {
    profile.company = fakerInstance.company.name();
  }
  
  return profile;
}

/**
 * 批量生成用户资料
 */
export function generateBatch(options: GeneratorOptions): GeneratedProfile[] {
  const { quantity } = options;
  
  // 验证数量范围
  if (quantity < 1 || quantity > 100) {
    throw new Error('生成数量必须在 1-100 之间');
  }
  
  const profiles: GeneratedProfile[] = [];
  for (let i = 0; i < quantity; i++) {
    profiles.push(generateProfile(options));
  }
  
  return profiles;
}

/**
 * 验证生成器选项
 */
export function validateGeneratorOptions(options: GeneratorOptions): string | null {
  const { quantity, passwordOptions } = options;
  
  // 验证数量
  if (quantity < 1 || quantity > 100) {
    return '生成数量必须在 1-100 之间';
  }
  
  // 验证密码长度
  if (passwordOptions.length < 8 || passwordOptions.length > 64) {
    return '密码长度必须在 8-64 之间';
  }
  
  // 验证至少一种字符类型
  const { uppercase, lowercase, numbers, symbols } = passwordOptions;
  if (!uppercase && !lowercase && !numbers && !symbols) {
    return '至少需要选择一种密码字符类型';
  }
  
  return null;
}

/**
 * 将生成的资料格式化为备注文本
 */
export function formatProfileAsNotes(profile: GeneratedProfile): string {
  const lines: string[] = [];
  
  if (profile.fullName) {
    lines.push(`姓名: ${profile.fullName}`);
  }
  if (profile.address) {
    lines.push(`地址: ${profile.address}`);
  }
  if (profile.phone) {
    lines.push(`电话: ${profile.phone}`);
  }
  if (profile.email) {
    lines.push(`邮箱: ${profile.email}`);
  }
  if (profile.company) {
    lines.push(`工作单位: ${profile.company}`);
  }
  
  return lines.join('\n');
}

/**
 * 将生成的资料格式化为完整的复制文本
 */
export function formatProfileForCopy(profile: GeneratedProfile): string {
  const lines: string[] = [
    `用户名: ${profile.username}`,
    `密码: ${profile.password}`,
  ];
  
  if (profile.fullName) {
    lines.push(`姓名: ${profile.fullName}`);
  }
  if (profile.address) {
    lines.push(`地址: ${profile.address}`);
  }
  if (profile.phone) {
    lines.push(`电话: ${profile.phone}`);
  }
  if (profile.email) {
    lines.push(`邮箱: ${profile.email}`);
  }
  if (profile.company) {
    lines.push(`工作单位: ${profile.company}`);
  }
  
  return lines.join('\n');
}
