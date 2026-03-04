import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkStorageBucket() {
  console.log('Checking Supabase Storage buckets...');
  
  try {
    // List all buckets
    const { data: buckets, error } = await supabase.storage.listBuckets();
    
    if (error) {
      console.error('❌ Error listing buckets:', error);
      return;
    }
    
    console.log('Available buckets:');
    buckets.forEach(b => console.log(`  - ${b.name}`));
    
    const receiptBucket = buckets.find(b => b.name === 'payment-receipts');
    
    if (receiptBucket) {
      console.log('✅ Bucket "payment-receipts" exists');
    } else {
      console.log('❌ Bucket "payment-receipts" NOT FOUND');
      console.log('Creating bucket...');
      
      const { data, error: createError } = await supabase.storage.createBucket('payment-receipts', {
        public: true,
        fileSizeLimit: 52428800, // 50MB
      });
      
      if (createError) {
        console.error('❌ Error creating bucket:', createError);
      } else {
        console.log('✅ Bucket "payment-receipts" created successfully');
      }
    }
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkStorageBucket();
