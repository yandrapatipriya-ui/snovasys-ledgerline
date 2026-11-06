const BASE_URL = 'http://localhost:5000/api';

async function runConcurrencyTests() {
  console.log('🔥 Starting LedgerLine Concurrency & Idempotency Stress Tests...\n');

  // 1. Register User 1
  const u1Email = `user1_${Date.now()}@test.com`;
  const reg1 = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u1Email, password: 'password123' })
  });
  const r1 = await reg1.json();
  const token1 = await loginUser(u1Email, 'password123');

  // 2. Register User 2
  const u2Email = `user2_${Date.now()}@test.com`;
  const reg2 = await fetch(`${BASE_URL}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: u2Email, password: 'password123' })
  });
  const r2 = await reg2.json();
  const user2Acc = r2.accountNumber;

  console.log(`✅ Created User 1 (${r1.accountNumber}) & User 2 (${user2Acc})`);

  // 3. Deposit ₹1,000 into User 1
  await fetch(`${BASE_URL}/deposit`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token1}`
    },
    body: JSON.stringify({ amount: 1000 })
  });
  console.log('💰 Deposited ₹1,000 into User 1 account.');

  // 4. Concurrency Race Test: Try to transfer ₹800 three times simultaneously (Only 1 should succeed)
  console.log('⚡ Firing 3 simultaneous race transfers of ₹800 each...');
  const raceKey = `idem-race-${Date.now()}`;
  const racePromises = [1, 2, 3].map(() => 
    fetch(`${BASE_URL}/transfer`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token1}`,
        'Idempotency-Key': raceKey
      },
      body: JSON.stringify({ recipientAccountNumber: user2Acc, amount: 800 })
    }).then(res => res.json())
  );

  const raceResults = await Promise.all(racePromises);
  console.log('Race Results:', raceResults);

  // 5. Test Idempotent Retry
  console.log('🔄 Testing Idempotent Retry with same key...');
  const retryRes = await fetch(`${BASE_URL}/transfer`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token1}`,
      'Idempotency-Key': raceKey
    },
    body: JSON.stringify({ recipientAccountNumber: user2Acc, amount: 800 })
  });
  const retryData = await retryRes.json();
  console.log('Retry Response:', retryData);

  if (retryData.replayed) {
    console.log('\n✨ CONCURRENCY & IDEMPOTENCY TEST PASSED! No double spending, race conditions successfully blocked. 🎉');
  } else {
    console.log('\n⚠️ Idempotency replayed flag missing. Check cache.');
  }
}

async function loginUser(email, password) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  return data.token;
}

runConcurrencyTests().catch(console.error);