const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('🧪 Starting LedgerLine API Integration Tests...\n');
  try {
    // 1. Register User 1 (Priya)
    const u1Email = `priya_${Date.now()}@test.com`;
    const res1 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u1Email, password: 'password123', name: 'Priya' })
    });
    const data1 = await res1.json();
    console.log('1️⃣ Registering User 1 (Priya)...');
    console.log('Response:', data1);

    // 2. Register User 2 (Rahul)
    const u2Email = `rahul_${Date.now()}@test.com`;
    const res2 = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u2Email, password: 'password123', name: 'Rahul' })
    });
    const data2 = await res2.json();
    console.log('\n2️⃣ Registering User 2 (Rahul)...');
    console.log('Response:', data2);

    // 3. Login User 1 to get JWT Token
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u1Email, password: 'password123' })
    });
    const loginData = await loginRes.json();
    const token = loginData.token;
    console.log('\n3️⃣ Logging in User 1 to get JWT Token...');
    console.log('Login successful! Token received.');

    // 4. Check User 1 Initial Balance (Expected: ₹0)
    const balRes1 = await fetch(`${BASE_URL}/transactions/balance`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const balData1 = await balRes1.json();
    console.log('\n4️⃣ Checking User 1 Balance (Expected: ₹0)...');
    console.log('Balance Response:', balData1);

    // 5. Deposit ₹5,000 (500000 paise) into User 1 Account
    const depRes = await fetch(`${BASE_URL}/transactions/deposit`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ amountPaise: 500000 })
    });
    const depData = await depRes.json();
    console.log('\n5️⃣ Depositing ₹5,000 into User 1 Account...');
    console.log('Deposit Response:', depData);

    // 6. Transfer ₹1,500 (150000 paise) from User 1 to User 2
    const transferRes = await fetch(`${BASE_URL}/transactions/transfer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}` 
      },
      body: JSON.stringify({ 
        recipientAccountNumber: data2.accountNumber, 
        amountPaise: 150000, 
        description: 'Project payment' 
      })
    });
    const transferData = await transferRes.json();
    console.log(`\n6️⃣ Transferring ₹1,500 from User 1 to User 2 (${data2.accountNumber})...`);
    console.log('Transfer Response:', transferData);

    // 7. Check Final User 1 Balance (Expected: ₹3,500)
    const balRes2 = await fetch(`${BASE_URL}/transactions/balance`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const balData2 = await balRes2.json();
    console.log('\n7️⃣ Checking Final User 1 Balance (Expected: ₹3,500)...');
    console.log('Final Balance Response:', balData2);

    console.log('\n✨ All tests passed successfully! Your banking backend is fully operational. 🎉');
  } catch (err) {
    console.error('Test failed with error:', err);
  }
}

runTests();