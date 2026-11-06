const express = require('express');
const { PrismaClient } = require('@prisma/client');
const jwt = require('jsonwebtoken');

const router = express.Router();
const prisma = new PrismaClient();

// Auth Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.user = user;
    next();
  });
};

// 1. TRANSFER MONEY
router.post('/transfer', authenticateToken, async (req, res) => {
  try {
    const { recipientAccountNumber, amountPaise, description } = req.body;
    const senderUserId = req.user.userId;

    if (!recipientAccountNumber || !amountPaise || amountPaise <= 0) {
      return res.status(400).json({ error: 'Invalid recipient or transfer amount.' });
    }

    const senderAccount = await prisma.account.findFirst({
      where: { userId: senderUserId }
    });

    if (!senderAccount) {
      return res.status(404).json({ error: 'Sender bank account not found.' });
    }

    if (senderAccount.accountNumber === recipientAccountNumber) {
      return res.status(400).json({ error: 'You cannot transfer money to your own account.' });
    }

    const recipientAccount = await prisma.account.findUnique({
      where: { accountNumber: recipientAccountNumber }
    });

    if (!recipientAccount) {
      return res.status(404).json({ error: 'Recipient bank account not found.' });
    }

    const transferAmount = BigInt(amountPaise);

    if (senderAccount.balancePaise < transferAmount) {
      return res.status(400).json({ error: 'Insufficient funds.' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          type: 'TRANSFER',
          status: 'COMPLETED',
          description: description || 'Funds transfer'
        }
      });

      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: senderAccount.id,
          type: 'DEBIT',
          amountPaise: transferAmount
        }
      });

      await tx.ledgerEntry.create({
        data: {
          transactionId: transaction.id,
          accountId: recipientAccount.id,
          type: 'CREDIT',
          amountPaise: transferAmount
        }
      });

      await tx.account.update({
        where: { id: senderAccount.id },
        data: { balancePaise: { decrement: transferAmount } }
      });

      await tx.account.update({
        where: { id: recipientAccount.id },
        data: { balancePaise: { increment: transferAmount } }
      });

      return transaction;
    });

    res.status(200).json({
      message: 'Transfer successful!',
      transactionId: result.id,
      amountRupees: Number(transferAmount) / 100
    });
  } catch (error) {
    console.error('Transfer error:', error);
    res.status(500).json({ error: 'Internal server error during transfer.', details: error.message });
  }
});

// 2. CHECK ACCOUNT BALANCE
router.get('/balance', authenticateToken, async (req, res) => {
  try {
    const account = await prisma.account.findFirst({
      where: { userId: req.user.userId }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    res.json({
      accountNumber: account.accountNumber,
      balanceRupees: Number(account.balancePaise) / 100,
      balancePaise: account.balancePaise.toString()
    });
  } catch (error) {
    console.error('Balance check error:', error);
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// 3. DEPOSIT MONEY
router.post('/deposit', authenticateToken, async (req, res) => {
  try {
    const { amountPaise }  = req.body;
    if (!amountPaise || amountPaise <= 0) {
      return res.status(400).json({ error: 'Invalid deposit amount.' });
    }

    const account = await prisma.account.findFirst({
      where: { userId: req.user.userId }
    });

    if (!account) {
      return res.status(404).json({ error: 'Account not found.' });
    }

    const updatedAccount = await prisma.account.update({
      where: { id: account.id },
      data: { balancePaise: { increment: BigInt(amountPaise) } }
    });

    res.json({
      message: 'Deposit successful!',
      accountNumber: updatedAccount.accountNumber,
      newBalanceRupees: Number(updatedAccount.balancePaise) / 100
    });
  } catch (error) {
    console.error('Deposit error:', error);
    res.status(500).json({ error: 'Internal server error during deposit.', details: error.message });
  }
});

module.exports = router;