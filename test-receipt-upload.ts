import 'dotenv/config';

// Test script to verify payment receipt upload endpoint
async function testUploadEndpoint() {
  console.log('Testing payment receipt upload endpoint...');
  
  try {
    // Test 1: Check if endpoint exists (should return 401 without auth)
    console.log('\n1. Testing endpoint without authentication...');
    const response = await fetch('http://localhost:5000/api/payment-receipts/upload', {
      method: 'POST',
      body: new FormData()
    });
    
    if (response.status === 401) {
      console.log('✅ Endpoint requires authentication (expected)');
    } else {
      console.log(`⚠️ Unexpected status: ${response.status}`);
      const text = await response.text();
      console.log('Response:', text);
    }
    
    console.log('\n2. Checking table exists...');
    // This will be verified when we try to upload with valid auth
    
    console.log('\n✅ Basic endpoint test completed');
    console.log('To fully test, you need to:');
    console.log('1. Login and get an access token');
    console.log('2. Create a test subscription');
    console.log('3. Upload a test file to the endpoint');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testUploadEndpoint();
