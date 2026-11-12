const express = require('express');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');

const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'ledgerline_super_secret_key_2026';

// 1. Rate Limiter (Snovasys Requirement)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again later." }
});
app.use('/api/', apiLimiter);

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Access token missing.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token.' });
    req.user = user;
    next();
  });
}

// 2. RBAC Middleware (Admin role verification)
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
  next();
}

// 3. Health Check Endpoint (Render deployment verification)
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'UP', database: 'Connected', timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ status: 'DOWN', error: error.message });
  }
});

// 4. First-Admin Bootstrap Script (Fixed string syntax error)
async function bootstrapAdmin() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@ledgerline.com';
    const existingAdmin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10);
      
      await prisma.user.create({
        data: {
          email: adminEmail,
          password: hashedPassword,
          role: 'ADMIN'
        }
      });
      console.log(`> Default Admin bootstrapped successfully: ${adminEmail}`);
    }
  } catch (err) {
    console.error("Bootstrap admin warning (Check if 'role' field exists in Prisma schema):", err.message);
  }
}

// 1. REGISTER
app.post('/api/auth/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const accountNumber = 'ACC' + Math.floor(10000000 + Math.random() * 90000000);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, password: hashedPassword, role: 'USER' } });
      const account = await tx.account.create({
        data: { userId: user.id, accountNumber, balance: 0n }
      });
      return { user, account };
    });

    res.status(201).json({ message: 'Registered successfully.', accountNumber: result.account.accountNumber });
  } catch (err) {
    res.status(400).json({ error: 'Email already exists or registration failed.' });
  }
});

// 2. LOGIN
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role || 'USER' }, JWT_SECRET, { expiresIn: '12h' });
    res.json({ message: 'Login successful.', token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. BALANCE
app.get('/api/balance', authenticateToken, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { userId: req.user.userId } });
    if (!account) return res.status(404).json({ error: 'Account not found.' });
    res.json({ accountNumber: account.accountNumber, balance: Number(account.balance) / 100 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DEPOSIT
app.post('/api/deposit', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid deposit amount.' });
  const amountInPaise = BigInt(Math.round(amount * 100));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { userId: req.user.userId } });
      if (!account) throw new Error('Account not found.');

      const updated = await tx.account.update({
        where: { id: account.id },
        data: { balance: { increment: amountInPaise } }
      });

      await tx.ledger.create({
        data: { accountId: account.id, type: 'DEPOSIT', amount: amountInPaise, runningBalance: updated.balance }
      });

      return updated;
    });

    res.json({ message: 'Deposit successful.', accountNumber: result.accountNumber, balance: Number(result.balance) / 100 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. WITHDRAW
app.post('/api/withdraw', authenticateToken, async (req, res) => {
  const { amount } = req.body;
  if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid withdrawal amount.' });
  const amountInPaise = BigInt(Math.round(amount * 100));

  try {
    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.account.findUnique({ where: { userId: req.user.userId } });
      if (!account) throw new Error('Account not found.');
      if (account.balance < amountInPaise) throw new Error('Insufficient funds for withdrawal.');

      const updated = await tx.account.update({
        where: { id: account.id },
        data: { balance: { decrement: amountInPaise } }
      });

      await tx.ledger.create({
        data: { accountId: account.id, type: 'WITHDRAWAL', amount: amountInPaise, runningBalance: updated.balance }
      });

      return updated;
    });

    res.json({ message: 'Withdrawal successful.', accountNumber: result.accountNumber, balance: Number(result.balance) / 100 });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. TRANSFER (Idempotent)
app.post('/api/transfer', authenticateToken, async (req, res) => {
  const { recipientAccountNumber, amount } = req.body;
  const idempotencyKey = req.headers['idempotency-key'];

  if (!recipientAccountNumber || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer details.' });
  }
  const amountInPaise = BigInt(Math.round(amount * 100));

  try {
    if (idempotencyKey) {
      const existingTx = await prisma.idempotencyKey.findUnique({ where: { key: idempotencyKey } });
      if (existingTx) {
        return res.json({ message: 'Retrieved from idempotency cache.', cachedResult: JSON.parse(existingTx.response) });
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const senderAccount = await tx.account.findUnique({ where: { userId: req.user.userId } });
      const recipientAccount = await tx.account.findUnique({ where: { accountNumber: recipientAccountNumber } });

      if (!senderAccount) throw new Error('Sender account not found.');
      if (!recipientAccount) throw new Error('Recipient account not found.');
      if (senderAccount.id === recipientAccount.id) throw new Error('Cannot transfer to yourself.');
      if (senderAccount.balance < amountInPaise) throw new Error('Insufficient funds.');

      const updatedSender = await tx.account.update({
        where: { id: senderAccount.id },
        data: { balance: { decrement: amountInPaise } }
      });
      const updatedRecipient = await tx.account.update({
        where: { id: recipientAccount.id },
        data: { balance: { increment: amountInPaise } }
      });

      await tx.ledger.create({ data: { accountId: senderAccount.id, type: 'TRANSFER_OUT', amount: amountInPaise, runningBalance: updatedSender.balance } });
      await tx.ledger.create({ data: { accountId: recipientAccount.id, type: 'TRANSFER_IN', amount: amountInPaise, runningBalance: updatedRecipient.balance } });

      return { senderNewBalance: Number(updatedSender.balance) / 100 };
    });

    const responsePayload = { message: 'Transfer successful.', newBalance: result.senderNewBalance };

    if (idempotencyKey) {
      await prisma.idempotencyKey.create({ data: { key: idempotencyKey, response: JSON.stringify(responsePayload) } });
    }

    res.json(responsePayload);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. STATEMENT / HISTORY
app.get('/api/statement', authenticateToken, async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { userId: req.user.userId } });
    if (!account) return res.status(404).json({ error: 'Account not found.' });

    const ledgers = await prisma.ledger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' }
    });

    const formattedLedgers = ledgers.map(l => ({
      id: l.id,
      type: l.type,
      amount: Number(l.amount) / 100,
      runningBalance: Number(l.runningBalance) / 100,
      timestamp: l.createdAt
    }));

    res.json({ accountNumber: account.accountNumber, statement: formattedLedgers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. ADMIN MASTER LEDGER (Protected with RBAC `requireAdmin`)
app.get('/api/admin/ledger', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const ledgers = await prisma.ledger.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
    const formatted = ledgers.map(l => ({
      id: l.id,
      accountId: l.accountId,
      type: l.type,
      amount: Number(l.amount) / 100,
      runningBalance: Number(l.runningBalance) / 100,
      timestamp: l.createdAt
    }));
    res.json({ totalEntries: formatted.length, records: formatted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`LedgerLine server running on http://localhost:${PORT}`);
  await bootstrapAdmin();
});