const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

router.post('/register', async (req, res) => {
  try {
    const email = req.body.email;
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const accountNumber = 'ACC' + Math.floor(1000000000 + Math.random() * 9000000000);

    const newUser = await prisma.user.create({
      data: {
        email: email,
        passwordHash: hashedPassword,
        fullName: "Priya User",
        role: "ACCOUNT_HOLDER",
        accounts: {
          create: {
            accountNumber: accountNumber,
            balancePaise: 0n
          }
        }
      },
      include: { accounts: true }
    });

    res.status(201).json({
      message: 'User registered successfully!',
      userId: newUser.id,
      email: newUser.email,
      accountNumber: newUser.accounts[0].accountNumber
    });
  } catch (error) {
    console.error('Registration error details:', error);
    res.status(500).json({ error: 'Internal server error during registration.', details: error.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return res.status(400).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'fallback_secret',
      { expiresIn: '1d' }
    );

    res.json({
      message: 'Login successful!',
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

module.exports = router;