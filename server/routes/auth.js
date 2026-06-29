const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/db');
const { signToken, verifyToken, extractToken } = require('../lib/auth');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../lib/email');

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { email, password, name } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      return res.status(409).json({ error: 'An account with that email already exists' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        password: hashed,
        name: name ?? null,
        emailVerified: null,
      },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h
    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        type: 'email_verification',
        expires,
      },
    });

    sendVerificationEmail(user.email, token).catch((emailErr) => {
      console.error('verification email error:', emailErr);
    });

    return res.status(201).json({ message: 'Verification email sent' });
  } catch (err) {
    console.error('register error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    if (!user.emailVerified) {
      return res.status(403).json({ error: 'Please verify your email first' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken({ sub: user.id, email: user.email });

    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/resend-verification
router.post('/resend-verification', async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || user.emailVerified) {
      return res.json({ message: 'If this account needs verification, a new link has been sent' });
    }

    await prisma.verificationToken.deleteMany({
      where: { identifier: user.email, type: 'email_verification' },
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.verificationToken.create({
      data: {
        identifier: user.email,
        token,
        type: 'email_verification',
        expires,
      },
    });

    sendVerificationEmail(user.email, token).catch((emailErr) => {
      console.error('verification resend email error:', emailErr);
    });

    return res.json({ message: 'If this account needs verification, a new link has been sent' });
  } catch (err) {
    console.error('resend-verification error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/verify-email?token=TOKEN
router.get('/verify-email', async (req, res) => {
  const { token } = req.query;

  const errorPage = (msg) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Verification failed — Chifufu</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;color:#444}
h2{color:#e53935}</style></head>
<body><h2>Verification failed</h2><p>${msg}</p></body></html>`;

  const successPage = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Email verified — Chifufu</title>
<style>body{font-family:-apple-system,sans-serif;text-align:center;padding:60px 24px;color:#444}
h2{color:#1D9E75}
.btn{display:inline-block;background:#1D9E75;color:#fff;text-decoration:none;border-radius:10px;padding:14px 28px;font-weight:500;margin-top:24px}</style></head>
<body>
<h2>Email verified!</h2>
<p>Your Chifufu account is ready. Open the app to get started.</p>
<a href="chifufu://auth/verified" class="btn">Open Chifufu</a>
</body></html>`;

  if (!token) {
    return res.status(400).send(errorPage('Missing verification token.'));
  }

  try {
    const record = await prisma.verificationToken.findUnique({ where: { token } });

    if (!record || record.type !== 'email_verification') {
      return res.status(400).send(errorPage('Invalid or already used verification link.'));
    }

    if (new Date() > record.expires) {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
      return res.status(400).send(errorPage('This verification link has expired. Please register again.'));
    }

    await prisma.user.update({
      where: { email: record.identifier },
      data: { emailVerified: new Date() },
    });

    await prisma.verificationToken.delete({ where: { token } });

    return res.send(successPage);
  } catch (err) {
    console.error('verify-email error:', err);
    return res.status(500).send(errorPage('Something went wrong. Please try again.'));
  }
});

// GET /api/auth/reset-password?token=TOKEN
router.get('/reset-password', async (req, res) => {
  const { token } = req.query;
  const escapedToken = String(token ?? '').replace(/"/g, '&quot;');

  return res.send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset password — Chifufu</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:40px 24px;color:#222;background:#f7f7f7}
.card{max-width:420px;margin:0 auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 2px 16px rgba(0,0,0,.08)}
h1{font-size:24px;margin:0 0 8px}
p{color:#666;line-height:1.4}
input{box-sizing:border-box;width:100%;font-size:16px;padding:14px;border:1px solid #ddd;border-radius:10px;margin:12px 0}
button{width:100%;border:0;border-radius:10px;background:#1D9E75;color:#fff;font-size:16px;font-weight:600;padding:14px;margin-top:8px}
.msg{margin-top:14px;font-size:14px}
</style></head>
<body><div class="card">
<h1>Reset password</h1>
<p>Enter a new password for your Chifufu account.</p>
<form id="form">
<input type="hidden" id="token" value="${escapedToken}">
<input id="password" type="password" autocomplete="new-password" placeholder="New password" minlength="8" required>
<button type="submit">Reset Password</button>
</form>
<div id="msg" class="msg"></div>
</div>
<script>
document.getElementById('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const msg = document.getElementById('msg');
  msg.textContent = 'Saving...';
  const response = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: document.getElementById('token').value,
      password: document.getElementById('password').value
    })
  });
  const body = await response.json().catch(() => ({}));
  msg.textContent = response.ok ? 'Password reset. You can sign in now.' : (body.error || 'Could not reset password.');
});
</script></body></html>`);
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body ?? {};

    if (email) {
      const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
      if (user) {
        await prisma.verificationToken.deleteMany({
          where: { identifier: user.email, type: 'password_reset' },
        });

        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
        await prisma.verificationToken.create({
          data: {
            identifier: user.email,
            token,
            type: 'password_reset',
            expires,
          },
        });

        await sendPasswordResetEmail(user.email, token).catch((err) => {
          console.error('forgot-password email error:', err);
        });
      }
    }

    return res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) {
    console.error('forgot-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body ?? {};

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const record = await prisma.verificationToken.findUnique({ where: { token } });

    if (!record || record.type !== 'password_reset') {
      return res.status(400).json({ error: 'Invalid or already used reset link' });
    }

    if (new Date() > record.expires) {
      await prisma.verificationToken.delete({ where: { token } }).catch(() => {});
      return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { email: record.identifier },
      data: { password: hashed },
    });

    await prisma.verificationToken.delete({ where: { token } });

    return res.json({ message: 'Password reset successfully' });
  } catch (err) {
    console.error('reset-password error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  try {
    const rawToken = extractToken(req);
    if (!rawToken) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const payload = verifyToken(rawToken);
    if (!payload) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        emailVerified: user.emailVerified,
      },
    });
  } catch (err) {
    console.error('me error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
