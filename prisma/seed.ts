/**
 * Prisma Seed Script
 * Creates initial admin user and default prompt template.
 *
 * Usage: npx tsx prisma/seed.ts
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create default admin user
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@mrms.local';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme123';

  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash,
        name: 'Admin',
        role: 'admin',
      },
    });
    console.log(`Admin user created: ${adminEmail}`);
  } else if (existingAdmin.role !== 'admin') {
    await prisma.user.update({
      where: { email: adminEmail },
      data: { role: 'admin' },
    });
    console.log(`Promoted existing user to admin: ${adminEmail}`);
  } else {
    console.log(`Admin user already exists: ${adminEmail}`);
  }

  // Create default prompt template
  const existingTemplate = await prisma.promptTemplate.findFirst({
    where: { isDefault: true },
  });

  if (!existingTemplate) {
    await prisma.promptTemplate.create({
      data: {
        name: '標準會議紀錄',
        description: '預設的會議紀錄整理範本，包含概要、重點、情緒分析和行動計畫',
        content: `你是一位專業的會議紀錄助理。請根據以下會議逐字稿，整理出結構化的會議紀錄。

請按照以下格式輸出：

## 整體概要
簡要概述會議的主要內容和結論（2-3段）。

## 討論重點
列出會議中討論的主要議題和重要觀點，每個議題用簡短段落描述。

## 情緒分析
分析與會者的整體情緒傾向（正面/中立/負面），以及對各議題的態度和共識程度。

## 行動計畫
以清單形式列出會議決定的後續行動事項，包含：
- 行動項目描述
- 負責人（如有提及）
- 預計完成時間（如有提及）

注意事項：
1. 使用繁體中文
2. 保持客觀中立的語氣
3. 如果逐字稿中有不清楚的部分，請標註「[不確定]」
4. 忽略閒聊和非會議相關的內容`,
        isDefault: true,
        isActive: true,
      },
    });
    console.log('Default prompt template created');
  } else {
    console.log('Default prompt template already exists');
  }

  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
