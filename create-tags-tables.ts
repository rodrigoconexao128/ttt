// Script para criar tabelas de tags diretamente no banco
import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  
  try {
    // Verificar se tabelas já existem
    const checkTags = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'tags'
      );
    `);
    
    const checkConvTags = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'conversation_tags'
      );
    `);

    console.log('Tags table exists:', checkTags.rows[0].exists);
    console.log('Conversation tags table exists:', checkConvTags.rows[0].exists);

    if (!checkTags.rows[0].exists) {
      console.log('\nCriando tabela tags...');
      await client.query(`
        CREATE TABLE "tags" (
          "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "user_id" varchar NOT NULL,
          "name" varchar(100) NOT NULL,
          "color" varchar(20) DEFAULT '#6b7280' NOT NULL,
          "icon" varchar(50),
          "is_default" boolean DEFAULT false NOT NULL,
          "position" integer DEFAULT 0 NOT NULL,
          "description" text,
          "created_at" timestamp DEFAULT now(),
          "updated_at" timestamp DEFAULT now(),
          CONSTRAINT "tags_user_id_users_id_fk" FOREIGN KEY ("user_id") 
            REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action
        );
      `);
      
      await client.query(`CREATE INDEX "idx_tags_user_id" ON "tags" USING btree ("user_id");`);
      await client.query(`CREATE INDEX "idx_tags_position" ON "tags" USING btree ("position");`);
      await client.query(`CREATE UNIQUE INDEX "idx_tags_unique_name" ON "tags" USING btree ("user_id","name");`);
      
      console.log('✅ Tabela tags criada com sucesso!');
    }

    if (!checkConvTags.rows[0].exists) {
      console.log('\nCriando tabela conversation_tags...');
      await client.query(`
        CREATE TABLE "conversation_tags" (
          "id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
          "conversation_id" varchar NOT NULL,
          "tag_id" varchar NOT NULL,
          "assigned_at" timestamp DEFAULT now(),
          CONSTRAINT "conversation_tags_conversation_id_conversations_id_fk" 
            FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") 
            ON DELETE cascade ON UPDATE no action,
          CONSTRAINT "conversation_tags_tag_id_tags_id_fk" 
            FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") 
            ON DELETE cascade ON UPDATE no action
        );
      `);
      
      await client.query(`CREATE INDEX "idx_conversation_tags_conversation" ON "conversation_tags" USING btree ("conversation_id");`);
      await client.query(`CREATE INDEX "idx_conversation_tags_tag" ON "conversation_tags" USING btree ("tag_id");`);
      await client.query(`CREATE UNIQUE INDEX "idx_conversation_tags_unique" ON "conversation_tags" USING btree ("conversation_id","tag_id");`);
      
      console.log('✅ Tabela conversation_tags criada com sucesso!');
    }

    console.log('\n✅ Migração concluída!');
    
  } catch (error) {
    console.error('Erro:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
