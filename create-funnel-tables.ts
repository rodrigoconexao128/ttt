import * as dotenv from 'dotenv';
dotenv.config();

import { db } from './server/db';
import { sql } from 'drizzle-orm';

async function checkAndCreateTables() {
  try {
    // Check existing tables
    const result = await db.execute(sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%funnel%' OR table_name = 'sales_funnels' OR table_name = 'deal_history')
    `);
    console.log('Existing funnel tables:', result.rows);
    
    if (result.rows.length === 0) {
      console.log('Creating funnel tables...');
      
      // Create sales_funnels table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS sales_funnels (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          product VARCHAR(255),
          manager VARCHAR(255),
          conversion_rate DECIMAL(5,2) DEFAULT 0,
          estimated_revenue DECIMAL(12,2) DEFAULT 0,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ sales_funnels created');
      
      // Create funnel_stages table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS funnel_stages (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          funnel_id VARCHAR NOT NULL REFERENCES sales_funnels(id) ON DELETE CASCADE,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          color VARCHAR(50) DEFAULT 'text-slate-700',
          bg_color VARCHAR(50) DEFAULT 'bg-slate-100',
          border_color VARCHAR(50) DEFAULT 'border-slate-200',
          icon_color VARCHAR(50) DEFAULT 'text-slate-500',
          position INTEGER NOT NULL DEFAULT 1,
          automations_count INTEGER DEFAULT 0,
          auto_message_enabled BOOLEAN DEFAULT false,
          auto_message_text TEXT,
          auto_message_delay_minutes INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ funnel_stages created');
      
      // Create funnel_deals table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS funnel_deals (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          stage_id VARCHAR NOT NULL REFERENCES funnel_stages(id) ON DELETE CASCADE,
          contact_name VARCHAR(255) NOT NULL,
          company_name VARCHAR(255),
          value DECIMAL(12,2) DEFAULT 0,
          value_period VARCHAR(20) DEFAULT 'mensal',
          priority VARCHAR(20) DEFAULT 'Média',
          assignee VARCHAR(255),
          contact_phone VARCHAR(50),
          contact_email VARCHAR(255),
          notes TEXT,
          last_contact_at TIMESTAMP DEFAULT NOW(),
          expected_close_date TIMESTAMP,
          won_at TIMESTAMP,
          lost_at TIMESTAMP,
          lost_reason TEXT,
          conversation_id VARCHAR REFERENCES conversations(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ funnel_deals created');
      
      // Create deal_history table
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS deal_history (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          deal_id VARCHAR NOT NULL REFERENCES funnel_deals(id) ON DELETE CASCADE,
          from_stage_id VARCHAR REFERENCES funnel_stages(id) ON DELETE SET NULL,
          to_stage_id VARCHAR REFERENCES funnel_stages(id) ON DELETE SET NULL,
          action VARCHAR(50) NOT NULL,
          notes TEXT,
          performed_by VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      console.log('✅ deal_history created');
      
      // Create indexes
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sales_funnels_user ON sales_funnels(user_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_sales_funnels_active ON sales_funnels(is_active)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_funnel_stages_funnel ON funnel_stages(funnel_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_funnel_stages_position ON funnel_stages(position)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_funnel_deals_stage ON funnel_deals(stage_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_funnel_deals_priority ON funnel_deals(priority)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_funnel_deals_contact ON funnel_deals(contact_phone)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deal_history_deal ON deal_history(deal_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_deal_history_date ON deal_history(created_at)`);
      console.log('✅ Indexes created');
      
      console.log('\n🎉 All funnel tables created successfully!');
    } else {
      console.log('Tables already exist:', result.rows.map((r: any) => r.table_name));
    }
  } catch (error: any) {
    console.error('Error:', error.message);
  }
  process.exit(0);
}

checkAndCreateTables();
